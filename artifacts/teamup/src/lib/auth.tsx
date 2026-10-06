import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
export const setupMessage = 'TeamUp authentication needs setup. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the frontend environment, and SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the backend environment.';

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

setAuthTokenGetter(async () => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  configured: boolean;
}
const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, configured: supabaseConfigured });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();
  const activeUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    const applySession = (next: Session | null) => {
      if (!active) return;
      const nextUserId = next?.user.id ?? null;
      if (activeUserId.current !== nextUserId) {
        queryClient.clear();
        activeUserId.current = nextUserId;
      }
      setSession(next);
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
    }).catch(() => { if (active) setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      applySession(next);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);
  const value = useMemo(() => ({ session, loading, configured: supabaseConfigured }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
