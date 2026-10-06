import { Router, type IRouter } from "express";
import {
  GetMyProfileResponse,
  SaveMyProfileBody,
  SaveMyProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const profileColumns =
  "id,name,college,bio,skills,preferred_role,hours_available_per_week,portfolio_url,created_at,updated_at";

type SupabaseConfig = {
  url: string;
  publishableKey: string;
};

type SupabaseErrorBody = {
  code?: unknown;
  message?: unknown;
};

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
      return null;
    }
  } catch {
    return null;
  }

  return { url, publishableKey };
}

function getBearerToken(authorization: string | undefined): string | null {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

async function readSupabaseError(response: Response): Promise<SupabaseErrorBody> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      return body as SupabaseErrorBody;
    }
  } catch {
    // Keep upstream error bodies out of client responses and application logs.
  }

  return {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isMissingProfileTable(
  status: number,
  error: SupabaseErrorBody,
): boolean {
  const code = getString(error.code);
  return status === 404 || code === "PGRST205" || code === "42P01";
}

function profileFromRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    college: row.college,
    bio: row.bio,
    skills: row.skills,
    preferredRole: row.preferred_role,
    hoursAvailablePerWeek: row.hours_available_per_week,
    portfolioUrl: row.portfolio_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function verifyUser(
  config: SupabaseConfig,
  token: string,
): Promise<string | null> {
  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.publishableKey,
      authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    const error = await readSupabaseError(response);
    const message = getString(error.message)?.toLowerCase() ?? "";
    if (message.includes("api key") || message.includes("apikey")) {
      throw new Error("Supabase rejected the configured publishable key.");
    }
    return null;
  }

  if (!response.ok) {
    throw new Error(`Supabase Auth returned HTTP ${response.status}.`);
  }

  const user: unknown = await response.json();
  if (
    typeof user !== "object" ||
    user === null ||
    typeof (user as { id?: unknown }).id !== "string"
  ) {
    throw new Error("Supabase Auth returned an invalid user response.");
  }

  return (user as { id: string }).id;
}

function sendSupabaseUnavailable(
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  message = "Supabase is temporarily unavailable. Please try again.",
): void {
  res.status(503).json({ error: message });
}

router.get("/profile", async (req, res): Promise<void> => {
  const config = getSupabaseConfig();
  if (!config) {
    res.status(503).json({
      error:
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.",
    });
    return;
  }

  const token = getBearerToken(req.get("authorization"));
  if (!token) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  try {
    const userId = await verifyUser(config, token);
    if (!userId) {
      res.status(401).json({ error: "The access token is invalid or expired." });
      return;
    }

    const query = new URLSearchParams({
      select: profileColumns,
      id: `eq.${userId}`,
      limit: "1",
    });
    const response = await fetch(
      `${config.url}/rest/v1/profiles?${query.toString()}`,
      {
        headers: {
          apikey: config.publishableKey,
          authorization: `Bearer ${token}`,
          accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      const error = await readSupabaseError(response);
      if (isMissingProfileTable(response.status, error)) {
        sendSupabaseUnavailable(
          res,
          "The TeamUp profile table is not ready. Apply the supplied Supabase migration.",
        );
        return;
      }

      req.log.error(
        { statusCode: response.status, errorCode: getString(error.code) },
        "Supabase profile read failed",
      );
      sendSupabaseUnavailable(res);
      return;
    }

    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(404).json({ error: "Your profile has not been created yet." });
      return;
    }

    const profile = GetMyProfileResponse.parse(profileFromRow(rows[0]));
    res.json(profile);
  } catch (error) {
    req.log.error({ err: error }, "Profile request failed");
    sendSupabaseUnavailable(
      res,
      "Supabase could not complete the profile request. Check its URL, publishable key, and migration.",
    );
  }
});

router.put("/profile", async (req, res): Promise<void> => {
  const config = getSupabaseConfig();
  if (!config) {
    res.status(503).json({
      error:
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.",
    });
    return;
  }

  const token = getBearerToken(req.get("authorization"));
  if (!token) {
    res.status(401).json({ error: "Authentication is required." });
    return;
  }

  const parsed = SaveMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const userId = await verifyUser(config, token);
    if (!userId) {
      res.status(401).json({ error: "The access token is invalid or expired." });
      return;
    }

    const query = new URLSearchParams({
      on_conflict: "id",
      select: profileColumns,
    });
    const response = await fetch(
      `${config.url}/rest/v1/profiles?${query.toString()}`,
      {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
          prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          id: userId,
          name: parsed.data.name.trim(),
          college: parsed.data.college.trim(),
          bio: parsed.data.bio.trim(),
          skills: parsed.data.skills,
          preferred_role: parsed.data.preferredRole.trim(),
          hours_available_per_week: parsed.data.hoursAvailablePerWeek,
          portfolio_url: parsed.data.portfolioUrl,
        }),
      },
    );

    if (!response.ok) {
      const error = await readSupabaseError(response);
      if (isMissingProfileTable(response.status, error)) {
        sendSupabaseUnavailable(
          res,
          "The TeamUp profile table is not ready. Apply the supplied Supabase migration.",
        );
        return;
      }

      req.log.error(
        { statusCode: response.status, errorCode: getString(error.code) },
        "Supabase profile save failed",
      );
      sendSupabaseUnavailable(res);
      return;
    }

    const rows: unknown = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      sendSupabaseUnavailable(
        res,
        "Supabase saved no profile row. Check the profile table permissions and RLS policies.",
      );
      return;
    }

    const profile = SaveMyProfileResponse.parse(profileFromRow(rows[0]));
    res.json(profile);
  } catch (error) {
    req.log.error({ err: error }, "Profile save failed");
    sendSupabaseUnavailable(
      res,
      "Supabase could not save the profile. Check its URL, publishable key, and migration.",
    );
  }
});

export default router;
