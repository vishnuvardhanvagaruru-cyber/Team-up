import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Compass, GraduationCap, Lightbulb, LockKeyhole, Mail, Menu, Sparkles, UsersRound, X, CircleDot } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Skill, getGetDashboardQueryKey, getGetMyProfileQueryKey, useGetDashboard, useGetMyProfile, useSaveMyProfile } from '@workspace/api-client-react';
import type { ProfileInput } from '@workspace/api-client-react';
import { AuthProvider, setupMessage, supabase, supabaseConfigured, useAuth } from '@/lib/auth';
import { Form } from '@/components/ui/form';
import NotFound from '@/pages/not-found';
import { DashboardTeamup, ProjectsPage, StudentsPage } from '@/pages/teamup';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false } } });
const authFieldsSchema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
});
type AuthFormValues = z.infer<typeof authFieldsSchema>;
type AuthVariant = 'login' | 'signup' | 'forgot' | 'reset';

function authSchemaFor(variant: AuthVariant) {
  return authFieldsSchema.superRefine((values, context) => {
    if (variant === 'signup' && !values.name.trim()) {
      context.addIssue({ code: 'custom', path: ['name'], message: 'Enter your name.' });
    }
    if (variant !== 'reset' && !z.string().email().safeParse(values.email.trim()).success) {
      context.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address.' });
    }
    if (variant !== 'forgot' && values.password.length < 8) {
      context.addIssue({ code: 'custom', path: ['password'], message: 'Use at least 8 characters.' });
    }
  });
}

const profileFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  college: z.string().trim().min(1, 'Enter your college.').max(160),
  bio: z.string().max(500),
  skills: z.array(z.string()).min(1, 'Choose at least one skill.').max(8, 'Choose no more than 8 skills.'),
  preferredRole: z.string().trim().min(1, 'Choose a preferred project role.').max(80),
  hoursAvailablePerWeek: z.number().int().min(1).max(168),
  portfolioUrl: z.string().trim().max(300).refine(value => !value || /^https?:\/\/\S+$/i.test(value), 'Use a full link beginning with https://.'),
});
type ProfileFormValues = z.infer<typeof profileFormSchema>;

function Brand() {
  return <Link href="/" className="brand" aria-label="teamup home" data-testid="link-teamup-home"><span className="brand-mark">t</span><span>teamup</span></Link>;
}

function Header({ mode = 'public' }: { mode?: 'public' | 'app' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { session } = useAuth();
  return <header className="site-header"><div className="wrap header-inner">
    <Brand />
    <button className="mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu">{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
    <nav className={`nav-actions ${menuOpen ? 'nav-open' : ''}`}>
      {mode === 'public' ? <>
        <a href="#how-it-works" onClick={() => setMenuOpen(false)} data-testid="link-how-it-works">How it works</a>
        <a href="#why-teamup" onClick={() => setMenuOpen(false)} data-testid="link-why-teamup">Why teamup</a>
        {session ? <Link className="btn btn-primary nav-cta" href="/dashboard" data-testid="link-nav-dashboard">Go to your space <ArrowRight size={16} /></Link> : <><Link className="nav-login" href="/login" data-testid="link-nav-login">Log in</Link><Link className="btn btn-primary nav-cta" href="/signup" data-testid="link-nav-signup">Get started <ArrowRight size={16} /></Link></>}
      </> : <>
        {session && <><Link href="/projects" className="nav-login" data-testid="link-nav-projects">Discover projects</Link><Link href="/students" className="nav-login" data-testid="link-nav-students">Students</Link></>}
        {session && <><Link href="/dashboard" className="nav-login" data-testid="link-nav-dashboard">Your space</Link><Link href="/profile" className="nav-login" data-testid="link-nav-profile">Profile</Link></>}
        {session && <SignOutButton />}
      </>}
    </nav>
  </div></header>;
}

function SignOutButton() {
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setBusy(false);
    navigate('/');
  }
  return <button className="btn btn-soft signout" onClick={signOut} disabled={busy} data-testid="button-sign-out">{busy ? 'Signing out…' : 'Sign out'}</button>;
}

function Footer() {
  const { session } = useAuth();

  return (
    <footer className="site-footer teamup-footer">
      <div className="wrap">
        <div className="teamup-footer-top">
          <div>
            <Brand />
            <p>
              Find your people. Fill the skill gaps.
              Build something together.
            </p>
          </div>

          <nav
            className="teamup-footer-links"
            aria-label="Footer navigation"
          >
            {session ? (
              <>
                <Link href="/projects">Discover projects</Link>
                <Link href="/students">Find teammates</Link>
                <Link href="/dashboard">Your space</Link>
              </>
            ) : (
              <>
                <Link href="/">Home</Link>
                <Link href="/signup">Join TeamUp</Link>
                <Link href="/login">Log in</Link>
              </>
            )}
          </nav>
        </div>

        <div className="teamup-footer-bottom">
          <span>© {new Date().getFullYear()} TeamUp</span>
          <span>Built for students who build.</span>
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  const { session } = useAuth();
  return <div className="landing page-in">
    <Header />
    <main>
      <section className="hero wrap">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> FOR STUDENTS WITH IDEAS</div>
          <h1 className="display-font">Make the thing<br />you keep <span>talking</span><br />about.</h1>
          <p className="hero-desc">Find the people who bring what you don’t. Team up around a real project, share what you’re good at, and build something worth showing.</p>
          <div className="hero-cta">
            <Link href={session ? '/dashboard' : '/signup'} className="btn btn-primary hero-button" data-testid="link-hero-cta">{session ? 'Open your space' : 'Find your people'} <ArrowRight size={17} /></Link>
            <span className="cta-note"><span className="mini-spark"><Sparkles size={14} /></span> Your next idea deserves a team.</span>
          </div>
          <div className="hero-proof"><div className="avatar-stack"><i>J</i><i>M</i><i>A</i><i>+</i></div><span>A good place to start is <strong>you.</strong></span></div>
        </div>
        <div className="hero-art" aria-label="A collage of student collaborators and project ideas">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="art-note note-top"><span className="note-pin" /><span>“I have an idea…”</span><CircleDot className="note-hand" size={15} /></div>
          <div className="idea-board">
            <div className="board-top"><span className="board-label"><span /> TEAMUP BOARD</span><span className="board-dots">•••</span></div>
            <div className="board-title">A team for<br /><em>what’s next.</em></div>
            <div className="board-people">
              <div className="person person-one"><div className="person-head" /><div className="person-body" /><span className="person-caption">DESIGN</span></div>
              <div className="person person-two"><div className="person-head" /><div className="person-body" /><span className="person-caption">BUILD</span></div>
              <div className="person person-three"><div className="person-head" /><div className="person-body" /><span className="person-caption">IDEATE</span></div>
            </div>
            <div className="board-footer"><span className="little-check"><Check size={12} /></span><span>Different strengths. Same spark.</span><ArrowUpRight size={16} /></div>
          </div>
          <div className="art-note note-left"><span className="note-icon"><Lightbulb size={16} /></span><span>Start with a spark.</span></div>
          <div className="art-note note-right"><span className="note-icon mint"><UsersRound size={16} /></span><span>Find your people.</span></div>
          <div className="art-caption">THE BEST IDEAS AREN’T SOLO PROJECTS.</div>
          <div className="art-stamp">IDEAS<br />IN GOOD<br />COMPANY<span><Sparkles size={18} /></span></div>
        </div>
      </section>
      <section className="ticker" aria-label="What you can bring"><div className="ticker-inner"><span>IDEAS</span><b>·</b><span>SKILLS</span><b>·</b><span>GOOD PEOPLE</span><b>·</b><span>MAKING IT REAL</span><b>·</b><span>IDEAS</span><b>·</b><span>SKILLS</span></div></section>
      <section id="how-it-works" className="steps-section">
        <div className="wrap">
          <div className="section-heading"><span className="eyebrow"><span className="eyebrow-dot" /> SIMPLE BY DESIGN</span><h2 className="display-font">Less “someday.”<br /><span>More let’s do it.</span></h2><p>TeamUp gets the right people around the idea that won’t leave you alone.</p></div>
          <div className="steps-grid">
            <article className="step-card"><div className="step-count">01 / YOUR PART</div><div className="step-icon violet"><Compass size={22} /></div><h3>Put your strengths out there.</h3><p>Make a profile with what you know, what you love, and the role you want to play.</p><div className="step-line"><span /></div></article>
            <article className="step-card step-card-feature"><div className="step-count">02 / THE POSSIBILITY</div><div className="step-icon mint-icon"><UsersRound size={22} /></div><h3>Make room for what’s missing.</h3><p>Share your project idea and the skills you’re hoping to find. The best teammate brings a perspective you don’t have.</p><div className="step-line mint-line"><span /></div></article>
            <article className="step-card"><div className="step-count">03 / THE MAKING</div><div className="step-icon peach"><ArrowUpRight size={22} /></div><h3>Build something real.</h3><p>Find your rhythm, put your strengths together, and give your idea a life outside the group chat.</p><div className="step-line peach-line"><span /></div></article>
          </div>
        </div>
      </section>
      <section className="quote-band" id="why-teamup"><div className="wrap quote-inner"><div className="quote-mark">“</div><blockquote className="display-font">You don’t need a perfect plan.<br /><span>You need a good first teammate.</span></blockquote><div className="quote-aside"><span className="quote-rule" />A little less scrolling.<br />A lot more making.</div></div></section>
      <section className="closing-cta wrap"><div className="closing-panel"><div className="closing-squiggle" aria-hidden="true"><Sparkles size={60} /></div><div><span className="eyebrow light-eyebrow"><span className="eyebrow-dot" /> START WITH WHAT YOU’VE GOT</span><h2 className="display-font">The thing you keep<br />talking about?</h2><p>It starts with a profile. The rest gets better together.</p></div><Link href={session ? '/dashboard' : '/signup'} className="btn closing-button" data-testid="link-closing-cta">{session ? 'Go to your space' : 'Make your profile'} <ArrowRight size={17} /></Link></div></section>
    </main>
    <Footer />
  </div>;
}

function SetupNotice() {
  return <div className="setup-notice"><div className="setup-symbol"><LockKeyhole size={18} /></div><div><strong>One small setup step.</strong><p>{setupMessage}</p></div></div>;
}

function AuthFrame({ children, kicker, title, subtitle, mode = 'form' }: { children: ReactNode; kicker: string; title: ReactNode; subtitle: string; mode?: 'form' | 'message' }) {
  return <div className="auth-shell page-in"><Header mode="app" /><main className="auth-main wrap"><div className={`auth-aside ${mode === 'message' ? 'message-aside' : ''}`}><div className="auth-aside-content"><span className="eyebrow"><span className="eyebrow-dot" /> {kicker}</span><h1 className="display-font">A good idea<br />is <span>better together.</span></h1><p>Show what you bring. Find room for what you don’t. Build something you’re proud to share.</p><div className="aside-doodle"><div className="doodle-circle"><UsersRound size={28} /></div><span className="doodle-path">﹏﹏﹏</span><span className="doodle-star"><Sparkles size={20} /></span></div><div className="aside-quote">“The right people make a good idea feel possible.”</div></div></div><section className="auth-card"><div className="auth-heading"><div className="auth-mark"><span className="brand-mark">t</span></div><h2 className="display-font">{title}</h2><p>{subtitle}</p></div>{children}</section></main><Footer /></div>;
}

function AuthForm({ variant }: { variant: AuthVariant }) {
  const { session, loading, configured } = useAuth();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchemaFor(variant)),
    defaultValues: { name: '', email: '', password: '' },
  });
  useEffect(() => { if (!loading && session && (variant === 'login' || variant === 'signup')) navigate('/dashboard'); }, [loading, session, variant, navigate]);
  useEffect(() => { form.reset({ name: '', email: '', password: '' }); }, [variant, form.reset]);
  const content = {
    login: { kicker: 'WELCOME BACK', title: <>Good to see<br />you again.</>, subtitle: 'Pick up where your next idea begins.' },
    signup: { kicker: 'YOUR NEXT CHAPTER', title: <>Let’s make<br />something.</>, subtitle: 'A few details, then your idea has a home.' },
    forgot: { kicker: 'ACCOUNT ACCESS', title: <>Back to your<br />next idea.</>, subtitle: 'We’ll send you a link to choose a new password.' },
    reset: { kicker: 'NEW PASSWORD', title: <>Let’s get you<br />back in.</>, subtitle: 'Choose a new password for your TeamUp account.' },
  }[variant];
  async function submit(values: AuthFormValues) {
    setError(''); setSuccess('');
    if (!supabase) { setError(setupMessage); return; }
    setBusy(true);
    try {
      if (variant === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
        if (authError) throw authError;
        navigate('/dashboard');
      } else if (variant === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email: values.email.trim(), password: values.password, options: { data: { name: values.name.trim() }, emailRedirectTo: `${window.location.origin}/dashboard` } });
        if (authError) throw authError;
        if (data.session) navigate('/profile');
        else setSuccess('Check your inbox for a confirmation link. Once you confirm your email, we’ll help you finish your profile.');
      } else if (variant === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(values.email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (authError) throw authError;
        setSuccess('If an account exists for that address, a password reset link is on its way.');
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password: values.password });
        if (authError) throw authError;
        setSuccess('Your password has been updated. You can head to your space now.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }
  return <AuthFrame kicker={content.kicker} title={content.title} subtitle={content.subtitle}>
    {!configured && <SetupNotice />}
    {error && <div role="alert" className="error-box auth-alert" data-testid="status-auth-error">{error}</div>}
    {success && <div role="status" className="success-box auth-alert" data-testid="status-auth-success">{success}</div>}
    <Form {...form}>
      <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
        {variant === 'signup' && <div className="field"><label htmlFor="name">Your name</label><input id="name" className="control" autoComplete="name" placeholder="What should we call you?" {...form.register('name')} required maxLength={100} data-testid="input-name" />{form.formState.errors.name?.message && <span className="helper field-error" role="alert">{form.formState.errors.name.message}</span>}</div>}
        {variant !== 'reset' && <div className="field"><label htmlFor="email">Student email</label><div className="input-with-icon"><Mail size={17} /><input id="email" className="control" type="email" autoComplete="email" placeholder="you@college.edu" {...form.register('email')} required data-testid="input-email" /></div>{form.formState.errors.email?.message && <span className="helper field-error" role="alert">{form.formState.errors.email.message}</span>}</div>}
        {variant !== 'forgot' && <div className="field"><div className="password-label"><label htmlFor="password">{variant === 'reset' ? 'New password' : 'Password'}</label>{variant === 'login' && <Link href="/forgot-password" data-testid="link-forgot-password">Forgot password?</Link>}</div><div className="input-with-icon"><LockKeyhole size={17} /><input id="password" className="control" type="password" autoComplete={variant === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" {...form.register('password')} required minLength={8} data-testid="input-password" /></div>{variant === 'signup' && <span className="helper">Use at least 8 characters.</span>}{form.formState.errors.password?.message && <span className="helper field-error" role="alert">{form.formState.errors.password.message}</span>}</div>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy || !configured} data-testid="button-auth-submit">{busy ? <><span className="button-loader" /> Working…</> : <>{variant === 'login' ? 'Log in' : variant === 'signup' ? 'Create your account' : variant === 'forgot' ? 'Send reset link' : 'Save new password'} <ArrowRight size={17} /></>}</button>
      </form>
    </Form>
    <div className="auth-foot">{variant === 'login' ? <>New to teamup? <Link href="/signup" data-testid="link-auth-signup">Create an account</Link></> : variant === 'signup' ? <>Already have an account? <Link href="/login" data-testid="link-auth-login">Log in</Link></> : variant === 'forgot' ? <>Remembered it? <Link href="/login" data-testid="link-auth-login">Back to log in</Link></> : <>Ready to sign in? <Link href="/login" data-testid="link-auth-login">Go to log in</Link></>}</div>
  </AuthFrame>;
}

function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading, configured } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => { if (!loading && configured && !session) navigate('/login'); }, [loading, configured, session, navigate]);
  if (!configured) return <div className="app-page"><Header mode="app" /><main className="wrap setup-page"><h1 className="display-font">A quick setup check.</h1><SetupNotice /></main></div>;
  if (loading || !session) return <div className="app-page"><Header mode="app" /><main className="wrap loading-page"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></main></div>;
  return <>{children}</>;
}

function Dashboard() {
  const { session } = useAuth();
  const [, navigate] = useLocation();
  const query = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey(), retry: false, enabled: Boolean(session) } });
  const teamupQuery = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), retry: false, enabled: Boolean(session) } });
  const profile = query.data;
  const missingProfile = !query.isLoading && isApiStatus(query.error, 404);
  useEffect(() => { if (missingProfile) navigate('/profile'); }, [missingProfile, navigate]);
  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'there';
  return <AuthGate><div className="app-page page-in"><Header mode="app" /><main className="dashboard wrap">
    <div className="dash-eyebrow"><span className="eyebrow-dot" /> YOUR TEAMUP SPACE</div>
    <div className="dash-welcome"><div><h1 className="display-font">Good to have you here, <span>{firstName}.</span></h1><p>This is your starting point. Get your profile ready, then bring your next idea along.</p></div><div className="welcome-illustration"><span className="welcome-orbit" /><div className="welcome-spark"><Sparkles size={25} /></div><div className="welcome-avatar">{initials(profile?.name || session?.user.user_metadata?.name || session?.user.email || 'T')}</div><span className="welcome-dot dot-a" /><span className="welcome-dot dot-b" /></div></div>
    {query.isLoading || missingProfile ? <div className="dash-card loading-card"><div className="skeleton sk-title" /><div className="skeleton sk-line" /><div className="skeleton sk-button" /></div> : query.isError ? <div className="dash-card"><span className="card-kicker">PROFILE CHECK</span><h2 className="display-font">Let’s get your profile in place.</h2><p>{errorMessage(query.error, 'We could not load your profile just now.')}</p><div className="card-actions"><button className="btn btn-soft" onClick={() => query.refetch()} data-testid="button-retry-profile">Try again</button><button className="btn btn-primary" onClick={() => navigate('/profile')} data-testid="button-complete-profile">Open profile <ArrowRight size={16} /></button></div></div> : profile ? <div className="dash-card profile-summary">
      <div className="profile-summary-top"><span className="card-kicker">YOUR PROFILE</span><div className="profile-avatar" data-testid="text-profile-avatar">{initials(profile.name)}</div></div>
      <h2 className="display-font" data-testid="text-profile-name">{profile.name}</h2><div className="college-line"><GraduationCap size={16} /> {profile.college}</div>
      <p className="summary-bio">{profile.bio || 'Your profile is ready to introduce you. Add a little more about what you want to make.'}</p>
      <div className="skill-pills">{profile.skills.map(skill => <span key={skill}>{skill}</span>)}</div>
      <div className="summary-bottom"><span>{profile.preferredRole || 'Role not set'} <i /> {profile.hoursAvailablePerWeek} hrs / week</span><Link href="/profile" className="text-link" data-testid="link-edit-profile">Edit profile <ArrowUpRight size={15} /></Link></div>
    </div> : <div className="dash-card"><span className="card-kicker">FIRST THINGS FIRST</span><h2 className="display-font">Let’s make your profile feel like you.</h2><p>Your profile is visible to signed-in students. Share what you’re good at and the kind of role you’d love to play.</p><button className="btn btn-primary" onClick={() => navigate('/profile')} data-testid="button-complete-profile">Complete your profile <ArrowRight size={16} /></button></div>}
    {profile && <div className="teamup-dashboard-data">
      {teamupQuery.isLoading ? <div className="teamup-panel loading-card"><div className="skeleton sk-title" /><div className="skeleton sk-line" /><div className="skeleton sk-line" /></div> : teamupQuery.isError ? <div className="teamup-panel teamup-error" role="alert"><h2>Your project space could not load</h2><p>{errorMessage(teamupQuery.error, 'We could not load your projects and applications.')}</p><button className="btn btn-soft" onClick={() => void teamupQuery.refetch()}>Try again</button></div> : teamupQuery.data ? <DashboardTeamup data={teamupQuery.data} /> : null}
    </div>}
    <div className="dash-footnote"><span className="footnote-icon"><Check size={15} /></span> No pitch deck required. Just you, and what you’d like to make.</div>
  </main><Footer /></div></AuthGate>;
}

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'T';
}

function isApiStatus(error: unknown, status: number): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === status;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const skillOptions = Object.values(Skill);
const roles = ['Frontend developer', 'Backend developer', 'Designer', 'Product thinker', 'Researcher', 'Data / ML', 'Hardware builder', 'Writer / storyteller', 'Open to exploring'];

function ProfilePage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const query = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey(), retry: false, enabled: Boolean(session) } });
  const saveProfile = useSaveMyProfile();
  const saved = query.data;
  const initialName = typeof session?.user.user_metadata?.name === 'string' ? session.user.user_metadata.name : '';
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: initialName, college: '', bio: '', skills: [], preferredRole: '', hoursAvailablePerWeek: 5, portfolioUrl: '' },
  });
  const values = form.watch();
  const [localError, setLocalError] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (saved && !initialized) {
      form.reset({
        name: saved.name,
        college: saved.college,
        bio: saved.bio,
        skills: saved.skills,
        preferredRole: saved.preferredRole,
        hoursAvailablePerWeek: saved.hoursAvailablePerWeek,
        portfolioUrl: saved.portfolioUrl || '',
      });
      setInitialized(true);
    }
  }, [saved, initialized, form.reset]);
  const profileLabel = useMemo(() => saved?.name || values.name || session?.user.user_metadata?.name || session?.user.email || 'TeamUp student', [saved, values.name, session]);
  function toggleSkill(skill: string) {
    const selected = form.getValues('skills');
    const next = selected.includes(skill)
      ? selected.filter(item => item !== skill)
      : selected.length < 8
        ? [...selected, skill]
        : selected;
    form.setValue('skills', next, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    setLocalError('');
  }
  async function submit(values: ProfileFormValues) {
    setLocalError(''); setSavedNotice(false);
    const input: ProfileInput = { name: values.name.trim(), college: values.college.trim(), bio: values.bio.trim(), skills: values.skills as ProfileInput['skills'], preferredRole: values.preferredRole.trim(), hoursAvailablePerWeek: values.hoursAvailablePerWeek, portfolioUrl: values.portfolioUrl.trim() || null };
    saveProfile.mutate({ data: input }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() });
        setSavedNotice(true);
        navigate('/dashboard');
      },
      onError: cause => setLocalError(cause instanceof Error ? cause.message : 'Could not save your profile. Please try again.'),
    });
  }
  return <AuthGate><div className="app-page page-in"><Header mode="app" /><main className="profile-layout wrap">
    <div className="profile-intro"><Link href="/dashboard" className="back-link" data-testid="link-profile-back"><ChevronRight size={15} className="back-chevron" /> Your space</Link><div className="dash-eyebrow"><span className="eyebrow-dot" /> YOUR INTRODUCTION</div><h1 className="display-font">{saved ? 'A little more you.' : 'Let’s meet you.'}</h1><p>Your profile helps other students picture what it would be like to build alongside you.</p><div className="privacy-note"><LockKeyhole size={17} /><span>Visible to signed-in students. Your email is never shown on your profile.</span></div></div>
    <section className="profile-form-card">
      <div className="form-card-heading"><div className="profile-avatar large-avatar">{initials(profileLabel)}</div><div><span className="card-kicker">{saved ? 'EDIT YOUR PROFILE' : 'CREATE YOUR PROFILE'}</span><h2 className="display-font">{saved ? 'Your details' : 'A good place to start'}</h2></div></div>
      {query.isLoading && <div className="load-inline"><span className="button-loader" /> Checking your saved profile…</div>}
       {query.isError && !isApiStatus(query.error, 404) && <div className="profile-query-error" role="status">{errorMessage(query.error, 'We couldn’t load a saved profile. You can still fill this in and save to try again.')} <button type="button" onClick={() => query.refetch()} data-testid="button-retry-profile-form">Retry</button></div>}
      {savedNotice && <div role="status" className="success-box" data-testid="status-profile-saved">Your profile is saved. Taking you to your space…</div>}
      {(localError || saveProfile.isError) && <div role="alert" className="error-box" data-testid="status-profile-error">{localError || 'Could not save your profile. Please try again.'}</div>}
      <Form {...form}>
        <form className="profile-form" onSubmit={form.handleSubmit(submit)}>
          <div className="form-row"><div className="field"><label htmlFor="profile-name">Name</label><input id="profile-name" className="control" {...form.register('name')} required maxLength={100} placeholder="Your name" autoComplete="name" data-testid="input-profile-name" />{form.formState.errors.name?.message && <span className="helper field-error" role="alert">{form.formState.errors.name.message}</span>}</div><div className="field"><label htmlFor="college">College</label><input id="college" className="control" {...form.register('college')} required maxLength={160} placeholder="Where you study" data-testid="input-college" />{form.formState.errors.college?.message && <span className="helper field-error" role="alert">{form.formState.errors.college.message}</span>}</div></div>
          <div className="field"><label htmlFor="bio">A short intro <span className="optional">OPTIONAL</span></label><textarea id="bio" className="control" {...form.register('bio')} maxLength={500} placeholder="What are you curious about? What do you like making?" data-testid="input-bio" /><span className="helper bio-count">{values.bio.length}/500</span>{form.formState.errors.bio?.message && <span className="helper field-error" role="alert">{form.formState.errors.bio.message}</span>}</div>
          <div className="field"><div className="skill-label-row"><span className="field-label">What can you bring?</span><span className="helper">Choose up to 8</span></div><div className="skill-picker" role="group" aria-label="Skills">{skillOptions.map((skill, index) => <button type="button" key={skill} className={`skill-choice ${values.skills.includes(skill) ? 'selected' : ''}`} onClick={() => toggleSkill(skill)} aria-pressed={values.skills.includes(skill)} data-testid={`button-skill-${index}`}>{values.skills.includes(skill) && <Check size={13} />}{skill}</button>)}</div>{form.formState.errors.skills?.message && <span className="helper field-error" role="alert">{form.formState.errors.skills.message}</span>}</div>
          <div className="form-row"><div className="field"><label htmlFor="role">Preferred project role</label><select id="role" className="control select-control" {...form.register('preferredRole')} required data-testid="select-role"><option value="" disabled>Choose what fits you</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}</select>{form.formState.errors.preferredRole?.message && <span className="helper field-error" role="alert">{form.formState.errors.preferredRole.message}</span>}</div><div className="field"><label htmlFor="hours">Hours available / week</label><div className="hours-wrap"><input id="hours" className="control" type="number" min="1" max="168" step="1" {...form.register('hoursAvailablePerWeek', { valueAsNumber: true })} required data-testid="input-hours" /><span>hrs / week</span></div>{form.formState.errors.hoursAvailablePerWeek?.message && <span className="helper field-error" role="alert">{form.formState.errors.hoursAvailablePerWeek.message}</span>}</div></div>
          <div className="field"><label htmlFor="portfolio">GitHub or portfolio <span className="optional">OPTIONAL</span></label><input id="portfolio" className="control" type="url" maxLength={300} {...form.register('portfolioUrl')} placeholder="https://github.com/you" data-testid="input-portfolio" /><span className="helper">A link that gives a little more context to what you do.</span>{form.formState.errors.portfolioUrl?.message && <span className="helper field-error" role="alert">{form.formState.errors.portfolioUrl.message}</span>}</div>
          <div className="form-submit-row"><span className="helper"><span className="required-star">*</span> Required fields help others find their fit.</span><button type="submit" className="btn btn-primary save-profile" disabled={saveProfile.isPending} data-testid="button-save-profile">{saveProfile.isPending ? <><span className="button-loader" /> Saving…</> : <>{saved ? 'Save changes' : 'Save my profile'} <ArrowRight size={16} /></>}</button></div>
        </form>
      </Form>
    </section>
  </main><Footer /></div></AuthGate>;
}

function RouteSwitch() {
  return <Switch>
    <Route path="/" component={Landing} />
    <Route path="/login"><AuthForm variant="login" /></Route>
    <Route path="/signup"><AuthForm variant="signup" /></Route>
    <Route path="/forgot-password"><AuthForm variant="forgot" /></Route>
    <Route path="/reset-password"><AuthForm variant="reset" /></Route>
    <Route path="/dashboard" component={Dashboard} />
    <Route path="/profile" component={ProfilePage} />
    <Route path="/projects"><AuthGate><div className="app-page page-in"><Header mode="app" /><ProjectsPage /><Footer /></div></AuthGate></Route>
    <Route path="/students"><AuthGate><div className="app-page page-in"><Header mode="app" /><StudentsPage /><Footer /></div></AuthGate></Route>
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  return <QueryClientProvider client={queryClient}><AuthProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RouteSwitch /></WouterRouter></AuthProvider></QueryClientProvider>;
}

export default App;
