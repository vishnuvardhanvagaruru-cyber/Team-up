import { Router, type IRouter, type Request, type Response } from "express";
import {
  AcceptApplicationParams,
  AcceptApplicationResponse,
  CloseProjectParams,
  CloseProjectResponse,
  CreateProjectBody,
  CreateProjectResponse,
  GetDashboardResponse,
  GetProjectsQueryParams,
  GetProjectsResponse,
  GetStudentsQueryParams,
  GetStudentsResponse,
  RejectApplicationParams,
  RejectApplicationResponse,
  SubmitApplicationBody,
  SubmitApplicationParams,
  SubmitApplicationResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
  WithdrawApplicationParams,
  WithdrawApplicationResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const projectColumns =
  "id,owner_id,title,description,category,required_skills,open_roles,total_capacity,member_count,deadline,status,repository_url,demo_url,created_at,updated_at";
const profileColumns =
  "id,name,college,bio,skills,preferred_role,hours_available_per_week,portfolio_url";
const applicationColumns =
  "id,project_id,applicant_id,selected_role,introduction,status,created_at,updated_at";
const memberColumns = "project_id,user_id,role,joined_at";

type SupabaseConfig = { url: string; publishableKey: string };
type AuthContext = SupabaseConfig & { token: string; userId: string };
type Row = Record<string, unknown>;
type SupabaseError = { code?: unknown; message?: unknown; details?: unknown };

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      return null;
    }
  } catch {
    return null;
  }
  return { url, publishableKey };
}

function getBearerToken(authorization: string | undefined): string | null {
  return authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}

async function jsonOrEmpty(response: globalThis.Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asRow(value: unknown): Row {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function rowArray(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(asRow) : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

async function requestSupabase(
  context: SupabaseConfig & { token: string },
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${context.url}${path}`, {
    ...init,
    headers: {
      apikey: context.publishableKey,
      authorization: `Bearer ${context.token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await jsonOrEmpty(response);
  if (!response.ok) {
    const error = asRow(body) as SupabaseError;
    throw new UpstreamError(
      stringValue(error.message, `Supabase returned HTTP ${response.status}.`),
      response.status,
      stringValue(error.code),
    );
  }
  return body;
}

async function authenticate(
  req: Request,
  res: Response,
): Promise<AuthContext | null> {
  const config = getSupabaseConfig();
  if (!config) {
    res.status(503).json({
      error:
        "Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.",
    });
    return null;
  }
  const token = getBearerToken(req.get("authorization"));
  if (!token) {
    res.status(401).json({ error: "Authentication is required." });
    return null;
  }
  try {
    const response = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.publishableKey,
        authorization: `Bearer ${token}`,
      },
    });
    const user = asRow(await jsonOrEmpty(response));
    if (response.status === 401 || response.status === 403) {
      res.status(401).json({ error: "The access token is invalid or expired." });
      return null;
    }
    if (!response.ok || typeof user.id !== "string") {
      throw new UpstreamError(
        `Supabase Auth returned HTTP ${response.status}.`,
        503,
      );
    }
    return { ...config, token, userId: user.id };
  } catch (error) {
    req.log.error({ err: error }, "TeamUp authentication check failed");
    res.status(503).json({ error: "Supabase Auth is temporarily unavailable." });
    return null;
  }
}

function handleError(req: Request, res: Response, error: unknown): void {
  if (error instanceof UpstreamError) {
    const code = error.code;
    const missingMigration =
      code === "PGRST202" ||
      code === "PGRST205" ||
      code === "42P01" ||
      code === "42883";
    if (missingMigration) {
      res.status(503).json({
        error:
          "TeamUp database setup is incomplete. Apply the Part 1 and Part 2 SQL migrations in order.",
      });
      return;
    }
    const status =
      code === "23505"
        ? 409
        : code === "P0002"
          ? 404
          : code === "42501"
            ? 403
            : code === "22023"
              ? 400
              : code === "P0001"
                ? 409
                : error.status >= 400 && error.status < 500
                  ? error.status
                  : 503;
    const safeMessage =
      status === 503
        ? "Supabase could not complete this request. Check the project URL, publishable key, and migrations."
        : error.message;
    res.status(status).json({ error: safeMessage });
    return;
  }
  req.log.error({ err: error }, "TeamUp request failed");
  res.status(503).json({ error: "TeamUp could not complete this request." });
}

async function restRows(
  context: AuthContext,
  table: string,
  params: Record<string, string>,
): Promise<Row[]> {
  const query = new URLSearchParams(params);
  return rowArray(
    await requestSupabase(context, `/rest/v1/${table}?${query.toString()}`),
  );
}

async function profilesById(
  context: AuthContext,
  ids: string[],
): Promise<Map<string, Row>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map();
  const rows = await restRows(context, "profiles", {
    select: profileColumns,
    id: `in.(${uniqueIds.join(",")})`,
  });
  return new Map(rows.map((row) => [stringValue(row.id), row]));
}

function matchSkills(requiredSkills: string[], studentSkills: string[]) {
  const have = new Set(studentSkills.map((skill) => skill.toLowerCase()));
  const matchedSkills = requiredSkills.filter((skill) =>
    have.has(skill.toLowerCase()),
  );
  return {
    matchedSkills,
    matchPercent:
      requiredSkills.length === 0
        ? null
        : Math.round((matchedSkills.length / requiredSkills.length) * 100),
  };
}

function toProject(row: Row, owner: Row | undefined, skills: string[]) {
  const requiredSkills = stringArray(row.required_skills);
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: stringValue(owner?.name, "TeamUp student"),
    title: row.title,
    description: row.description,
    category: row.category,
    requiredSkills,
    openRoles: stringArray(row.open_roles),
    totalCapacity: numberValue(row.total_capacity),
    memberCount: numberValue(row.member_count),
    deadline: row.deadline,
    status: row.status,
    repositoryUrl: row.repository_url ?? null,
    demoUrl: row.demo_url ?? null,
    ...matchSkills(requiredSkills, skills),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStudent(row: Row) {
  return {
    id: row.id,
    name: row.name,
    college: row.college,
    bio: row.bio,
    skills: stringArray(row.skills),
    preferredRole: row.preferred_role,
    hoursAvailablePerWeek: numberValue(row.hours_available_per_week),
    portfolioUrl: row.portfolio_url ?? null,
  };
}

function toApplication(
  row: Row,
  applicant: Row | undefined,
  projectTitle: string,
) {
  return {
    id: row.id,
    projectId: row.project_id,
    projectTitle,
    applicantId: row.applicant_id,
    applicantName: stringValue(applicant?.name, "TeamUp student"),
    applicantCollege: stringValue(applicant?.college),
    selectedRole: row.selected_role,
    introduction: row.introduction,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectInputToRow(input: {
  title: string;
  description: string;
  category: string;
  requiredSkills: string[];
  openRoles: string[];
  totalCapacity: number;
  deadline: Date | string;
  repositoryUrl: string | null;
  demoUrl: string | null;
}) {
  const deadline =
    input.deadline instanceof Date
      ? input.deadline.toISOString().slice(0, 10)
      : input.deadline.slice(0, 10);
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    required_skills: input.requiredSkills,
    open_roles: input.openRoles,
    total_capacity: input.totalCapacity,
    deadline,
    repository_url: input.repositoryUrl,
    demo_url: input.demoUrl,
  };
}

async function getProjectDto(
  context: AuthContext,
  id: string,
  skills: string[],
) {
  const rows = await restRows(context, "projects", {
    select: projectColumns,
    id: `eq.${id}`,
    limit: "1",
  });
  if (!rows.length) return null;
  const ownerProfiles = await profilesById(context, [
    stringValue(rows[0].owner_id),
  ]);
  return toProject(
    rows[0],
    ownerProfiles.get(stringValue(rows[0].owner_id)),
    skills,
  );
}

async function ownSkills(context: AuthContext): Promise<string[]> {
  const profiles = await profilesById(context, [context.userId]);
  return stringArray(profiles.get(context.userId)?.skills);
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

async function listProjects(
  context: AuthContext,
  params: Record<string, string>,
  skills: string[],
) {
  const rows = await restRows(context, "projects", {
    select: projectColumns,
    order: "created_at.desc",
    ...params,
  });
  const profiles = await profilesById(
    context,
    rows.map((row) => stringValue(row.owner_id)),
  );
  return rows.map((row) =>
    toProject(
      row,
      profiles.get(stringValue(row.owner_id)),
      skills,
    ),
  );
}

async function callRpc(
  context: AuthContext,
  functionName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return requestSupabase(context, `/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

async function readApplicationDto(context: AuthContext, id: string) {
  const apps = await restRows(context, "applications", {
    select: applicationColumns,
    id: `eq.${id}`,
    limit: "1",
  });
  if (!apps.length) return null;
  const app = apps[0];
  const [profiles, projects] = await Promise.all([
    profilesById(context, [stringValue(app.applicant_id)]),
    restRows(context, "projects", {
      select: "id,title",
      id: `eq.${stringValue(app.project_id)}`,
      limit: "1",
    }),
  ]);
  return toApplication(
    app,
    profiles.get(stringValue(app.applicant_id)),
    stringValue(projects[0]?.title, "Project"),
  );
}

router.get("/projects", async (req, res): Promise<void> => {
  const context = await authenticate(req, res);
  if (!context) return;
  const parsed = GetProjectsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const today = new Date().toISOString().slice(0, 10);
    let projects = await listProjects(
      context,
      { status: "eq.recruiting", deadline: `gte.${today}` },
      await ownSkills(context),
    );
    const q = parsed.data.q?.trim().toLowerCase();
    if (q) {
      projects = projects.filter((project) =>
        `${project.title} ${project.description} ${project.category} ${project.ownerName}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (parsed.data.category) {
      const category = parsed.data.category.toLowerCase();
      projects = projects.filter(
        (project) => stringValue(project.category).toLowerCase() === category,
      );
    }
    if (parsed.data.skill) {
      const skill = parsed.data.skill.toLowerCase();
      projects = projects.filter((project) =>
        project.requiredSkills.some((item) => item.toLowerCase() === skill),
      );
    }
    res.json(GetProjectsResponse.parse(projects));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.post("/projects", async (req, res): Promise<void> => {
  const context = await authenticate(req, res);
  if (!context) return;
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const input = projectInputToRow(parsed.data);
    const id = await callRpc(context, "teamup_create_project", {
      p_title: input.title,
      p_description: input.description,
      p_category: input.category,
      p_required_skills: input.required_skills,
      p_open_roles: input.open_roles,
      p_total_capacity: input.total_capacity,
      p_deadline: input.deadline,
      p_repository_url: input.repository_url,
      p_demo_url: input.demo_url,
    });
    if (!validUuid(id)) throw new Error("Project creation returned no id.");
    const project = await getProjectDto(context, id, await ownSkills(context));
    if (!project) throw new Error("Created project could not be read.");
    res.status(201).json(CreateProjectResponse.parse(project));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.patch("/projects/:projectId", async (req, res): Promise<void> => {
  const context = await authenticate(req, res);
  if (!context) return;
  const params = UpdateProjectParams.safeParse(req.params);
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error:
        (!params.success ? params.error?.message : parsed.error?.message) ??
        "Invalid project data.",
    });
    return;
  }
  try {
    const body = projectInputToRow(parsed.data);
    const query = new URLSearchParams({
      id: `eq.${params.data.projectId}`,
      owner_id: `eq.${context.userId}`,
      select: projectColumns,
    });
    const result = rowArray(
      await requestSupabase(context, `/rest/v1/projects?${query}`, {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(body),
      }),
    );
    if (!result.length) {
      res.status(404).json({ error: "Project not found or not owned by you." });
      return;
    }
    const owners = await profilesById(context, [context.userId]);
    const project = toProject(
      result[0],
      owners.get(context.userId),
      await ownSkills(context),
    );
    res.json(UpdateProjectResponse.parse(project));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.post("/projects/:projectId/close", async (req, res): Promise<void> => {
  const context = await authenticate(req, res);
  if (!context) return;
  const params = CloseProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const query = new URLSearchParams({
      id: `eq.${params.data.projectId}`,
      owner_id: `eq.${context.userId}`,
      select: projectColumns,
    });
    const result = rowArray(
      await requestSupabase(context, `/rest/v1/projects?${query}`, {
        method: "PATCH",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({ status: "closed" }),
      }),
    );
    if (!result.length) {
      res.status(404).json({ error: "Project not found or not owned by you." });
      return;
    }
    const owners = await profilesById(context, [context.userId]);
    const project = toProject(
      result[0],
      owners.get(context.userId),
      await ownSkills(context),
    );
    res.json(CloseProjectResponse.parse(project));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.post(
  "/projects/:projectId/applications",
  async (req, res): Promise<void> => {
    const context = await authenticate(req, res);
    if (!context) return;
    const params = SubmitApplicationParams.safeParse(req.params);
    const parsed = SubmitApplicationBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error:
          (!params.success ? params.error?.message : parsed.error?.message) ??
          "Invalid application data.",
      });
      return;
    }
    try {
      const id = await callRpc(context, "teamup_submit_application", {
        p_project_id: params.data.projectId,
        p_selected_role: parsed.data.selectedRole.trim(),
        p_introduction: parsed.data.introduction.trim(),
      });
      if (!validUuid(id)) throw new Error("Application submission returned no id.");
      const application = await readApplicationDto(context, id);
      if (!application) throw new Error("Submitted application could not be read.");
      res.status(201).json(SubmitApplicationResponse.parse(application));
    } catch (error) {
      handleError(req, res, error);
    }
  },
);

async function decideApplication(
  req: Request,
  res: Response,
  decision: "accepted" | "rejected",
): Promise<void> {
  const context = await authenticate(req, res);
  if (!context) return;
  const schema =
    decision === "accepted" ? AcceptApplicationParams : RejectApplicationParams;
  const parsed = schema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    await callRpc(context, "teamup_decide_application", {
      p_application_id: parsed.data.applicationId,
      p_decision: decision,
    });
    const application = await readApplicationDto(
      context,
      parsed.data.applicationId,
    );
    if (!application) throw new Error("Updated application could not be read.");
    res.json(
      decision === "accepted"
        ? AcceptApplicationResponse.parse(application)
        : RejectApplicationResponse.parse(application),
    );
  } catch (error) {
    handleError(req, res, error);
  }
}

router.post(
  "/applications/:applicationId/accept",
  async (req, res): Promise<void> => {
    await decideApplication(req, res, "accepted");
  },
);
router.post(
  "/applications/:applicationId/reject",
  async (req, res): Promise<void> => {
    await decideApplication(req, res, "rejected");
  },
);
router.post(
  "/applications/:applicationId/withdraw",
  async (req, res): Promise<void> => {
    const context = await authenticate(req, res);
    if (!context) return;
    const parsed = WithdrawApplicationParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      await callRpc(context, "teamup_withdraw_application", {
        p_application_id: parsed.data.applicationId,
      });
      const application = await readApplicationDto(
        context,
        parsed.data.applicationId,
      );
      if (!application) throw new Error("Updated application could not be read.");
      res.json(WithdrawApplicationResponse.parse(application));
    } catch (error) {
      handleError(req, res, error);
    }
  },
);

router.get("/students", async (req, res): Promise<void> => {
  const context = await authenticate(req, res);
  if (!context) return;
  const parsed = GetStudentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const rows = await restRows(context, "profiles", {
      select: profileColumns,
      order: "name.asc",
    });
    const q = parsed.data.q?.trim().toLowerCase();
    const skill = parsed.data.skill?.trim().toLowerCase();
    const students = rows
      .filter((row) => row.id !== context.userId)
      .filter((row) => stringValue(row.name).trim().length > 0)
      .filter((row) => {
        if (!q) return true;
        return `${row.name ?? ""} ${row.college ?? ""} ${row.bio ?? ""} ${row.preferred_role ?? ""}`
          .toLowerCase()
          .includes(q);
      })
      .filter((row) =>
        !skill ||
        stringArray(row.skills).some((item) => item.toLowerCase() === skill),
      )
      .map(toStudent);
    res.json(GetStudentsResponse.parse(students));
  } catch (error) {
    handleError(req, res, error);
  }
});

router.get("/dashboard", async (req, res): Promise<void> => {
  const context = await authenticate(req, res);
  if (!context) return;
  try {
    const [profileMap, ownedRows, membershipRows, sentRows] = await Promise.all([
      profilesById(context, [context.userId]),
      restRows(context, "projects", {
        select: projectColumns,
        owner_id: `eq.${context.userId}`,
        order: "created_at.desc",
      }),
      restRows(context, "project_members", {
        select: memberColumns,
        user_id: `eq.${context.userId}`,
      }),
      restRows(context, "applications", {
        select: applicationColumns,
        applicant_id: `eq.${context.userId}`,
        order: "created_at.desc",
      }),
    ]);
    const ownProfile = profileMap.get(context.userId);
    const skills = stringArray(ownProfile?.skills);
    const ownedIds = new Set(ownedRows.map((row) => stringValue(row.id)));
    const joinedIds = [
      ...new Set(
        membershipRows
          .map((row) => stringValue(row.project_id))
          .filter((id) => !ownedIds.has(id)),
      ),
    ];
    const [joinedRows, receivedRows] = await Promise.all([
      joinedIds.length
        ? restRows(context, "projects", {
            select: projectColumns,
            id: `in.(${joinedIds.join(",")})`,
            order: "created_at.desc",
          })
        : Promise.resolve([]),
      ownedIds.size
        ? restRows(context, "applications", {
            select: applicationColumns,
            project_id: `in.(${[...ownedIds].join(",")})`,
            order: "created_at.desc",
          })
        : Promise.resolve([]),
    ]);
    const allProjects = [...ownedRows, ...joinedRows];
    const ownerProfiles = await profilesById(
      context,
      allProjects.map((row) => stringValue(row.owner_id)),
    );
    const projectDtos = new Map(
      allProjects.map((row) => [
        stringValue(row.id),
        toProject(
          row,
          ownerProfiles.get(stringValue(row.owner_id)),
          skills,
        ),
      ]),
    );
    const allApplicationRows = [...sentRows, ...receivedRows];
    const applicantProfiles = await profilesById(
      context,
      allApplicationRows.map((row) => stringValue(row.applicant_id)),
    );
    const applicationDto = (row: Row) =>
      toApplication(
        row,
        applicantProfiles.get(stringValue(row.applicant_id)),
        stringValue(
          projectDtos.get(stringValue(row.project_id))?.title,
          "Project",
        ),
      );
    const projectIds = [...projectDtos.keys()];
    const memberRows = projectIds.length
      ? await restRows(context, "project_members", {
          select: memberColumns,
          project_id: `in.(${projectIds.join(",")})`,
          order: "joined_at.asc",
        })
      : [];
    const memberProfiles = await profilesById(
      context,
      memberRows.map((row) => stringValue(row.user_id)),
    );
    const rosterMap = new Map<
      string,
      { project: unknown; members: { userId: unknown; name: string; role: string; joinedAt: unknown }[] }
    >();
    for (const projectId of projectIds) {
      rosterMap.set(projectId, {
        project: projectDtos.get(projectId),
        members: [],
      });
    }
    for (const row of memberRows) {
      const projectId = stringValue(row.project_id);
      const roster = rosterMap.get(projectId);
      if (!roster) continue;
      const userId = stringValue(row.user_id);
      roster.members.push({
        userId,
        name: stringValue(memberProfiles.get(userId)?.name, "TeamUp student"),
        role: stringValue(row.role),
        joinedAt: row.joined_at,
      });
    }
    const dashboard = {
      ownedProjects: ownedRows.map((row) =>
        projectDtos.get(stringValue(row.id)),
      ),
      joinedProjects: joinedRows.map((row) =>
        projectDtos.get(stringValue(row.id)),
      ),
      submittedApplications: sentRows.map(applicationDto),
      receivedApplications: receivedRows.map(applicationDto),
      rosters: [...rosterMap.values()],
    };
    res.json(GetDashboardResponse.parse(dashboard));
  } catch (error) {
    handleError(req, res, error);
  }
});

export default router;
