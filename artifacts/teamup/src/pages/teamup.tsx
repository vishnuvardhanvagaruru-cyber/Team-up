import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import {
  getGetDashboardQueryKey,
  useAcceptApplication,
  useCloseProject,
  useCreateProject,
  useGetDashboard,
  useGetProjects,
  useGetStudents,
  useRejectApplication,
  useSubmitApplication,
  useUpdateProject,
  useWithdrawApplication,
} from '@workspace/api-client-react';
import type { Application, DashboardData, Project, ProjectInput, Student } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowUpRight, Check, ExternalLink, Search, UsersRound } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { TeamFit } from '@/components/team-fit';
import { Skill } from '@workspace/api-client-react';

const categories = ['Hackathon', 'Academic', 'Research', 'Open source', 'Community', 'Other'];

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'T';
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function invalidateTeamup(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['team-fit'] });
  void queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  void queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
  void queryClient.invalidateQueries({ queryKey: ['/api/students'] });
}

function ProjectForm({ project, onCancel, onSaved }: {
  project?: Project;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const seed = useMemo(() => ({
    title: project?.title ?? '',
    description: project?.description ?? '',
    category: project?.category ?? '',
    requiredSkills: project?.requiredSkills.join(', ') ?? '',
    openRoles: project?.openRoles.join(', ') ?? '',
    totalCapacity: String(project?.totalCapacity ?? 4),
    deadline: project?.deadline ?? '',
    repositoryUrl: project?.repositoryUrl ?? '',
    demoUrl: project?.demoUrl ?? '',
  }), [project]);
  const [values, setValues] = useState(seed);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const busy = createProject.isPending || updateProject.isPending;

  function set<K extends keyof typeof seed>(key: K, value: string) {
    setValues(current => ({ ...current, [key]: value }));
    setError('');
    setSaved(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const input: ProjectInput = {
      title: values.title.trim(),
      description: values.description.trim(),
      category: values.category.trim(),
      requiredSkills: [...new Set(values.requiredSkills.split(',').map(item => item.trim()).filter(Boolean))],
      openRoles: [...new Set(values.openRoles.split(',').map(item => item.trim()).filter(Boolean))],
      totalCapacity: Number(values.totalCapacity),
      deadline: values.deadline,
      repositoryUrl: values.repositoryUrl.trim() || null,
      demoUrl: values.demoUrl.trim() || null,
    };
    const onSuccess = () => {
      invalidateTeamup(queryClient);
      setSaved(true);
      onSaved?.();
    };
    if (project) {
      updateProject.mutate({ projectId: project.id, data: input }, {
        onSuccess,
        onError: cause => setError(readableError(cause, 'Could not update the project.')),
      });
    } else {
      createProject.mutate({ data: input }, {
        onSuccess,
        onError: cause => setError(readableError(cause, 'Could not create the project.')),
      });
    }
  }

  return <form className="teamup-form" onSubmit={submit}>
    <div className="form-row">
      <div className="field"><label htmlFor="project-title">Project title</label><input id="project-title" className="control" required minLength={1} maxLength={140} value={values.title} onChange={event => set('title', event.target.value)} placeholder="What are you building?" /></div>
      <div className="field"><label htmlFor="project-category">Category</label><input id="project-category" className="control" list="teamup-categories" required maxLength={80} value={values.category} onChange={event => set('category', event.target.value)} placeholder="Choose or enter one" /><datalist id="teamup-categories">{categories.map(category => <option value={category} key={category} />)}</datalist></div>
    </div>
    <div className="field"><label htmlFor="project-description">Description</label><textarea id="project-description" className="control" required maxLength={4000} value={values.description} onChange={event => set('description', event.target.value)} placeholder="What is the idea, and what would the team work on?" /></div>
    <div className="form-row">
      <div className="field"><label htmlFor="project-skills">Required skills</label><input id="project-skills" className="control" value={values.requiredSkills} onChange={event => set('requiredSkills', event.target.value)} placeholder="React, research, prototyping" /><span className="helper">Separate skills with commas. Leave blank if none are required.</span></div>
      <div className="field"><label htmlFor="project-roles">Open roles</label><input id="project-roles" className="control" required value={values.openRoles} onChange={event => set('openRoles', event.target.value)} placeholder="Frontend developer, Designer" /><span className="helper">Applicants choose one of these roles.</span></div>
    </div>
    <div className="fit-quick-skills"><span className="helper">Use the same skill names as student profiles for useful matching:</span><div className="skill-pills">{Object.values(Skill).map(item => <button type="button" key={item} onClick={() => set('requiredSkills', [...new Set([...values.requiredSkills.split(',').map(s => s.trim()).filter(Boolean), item])].join(', '))}>{item} +</button>)}</div></div>
    <div className="form-row">
      <div className="field"><label htmlFor="project-capacity">Team capacity, including you</label><input id="project-capacity" className="control" type="number" required min={2} max={100} step={1} value={values.totalCapacity} onChange={event => set('totalCapacity', event.target.value)} /></div>
      <div className="field"><label htmlFor="project-deadline">Application deadline</label><input id="project-deadline" className="control" type="date" required min={new Date().toISOString().slice(0, 10)} value={values.deadline} onChange={event => set('deadline', event.target.value)} /></div>
    </div>
    <div className="form-row">
      <div className="field"><label htmlFor="project-repo">Repository link <span className="optional">OPTIONAL</span></label><input id="project-repo" className="control" type="url" maxLength={500} value={values.repositoryUrl} onChange={event => set('repositoryUrl', event.target.value)} placeholder="https://github.com/…" /></div>
      <div className="field"><label htmlFor="project-demo">Demo link <span className="optional">OPTIONAL</span></label><input id="project-demo" className="control" type="url" maxLength={500} value={values.demoUrl} onChange={event => set('demoUrl', event.target.value)} placeholder="https://…" /></div>
    </div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {saved && <div className="success-box" role="status">{project ? 'Project changes saved.' : 'Project created and you were added as its owner-member.'}</div>}
    <div className="teamup-form-actions">
      {onCancel && <button type="button" className="btn btn-soft" onClick={onCancel}>Cancel</button>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : project ? 'Save project' : 'Create project'} <ArrowRight size={16} /></button>
    </div>
  </form>;
}

function ProjectCard({ project, alreadyApplied = false }: { project: Project; alreadyApplied?: boolean }) {
  const { session } = useAuth();
  const { isLoading, isError, refetch } = useGetDashboard();
  const queryClient = useQueryClient();
  const submitApplication = useSubmitApplication();
  const [showApplication, setShowApplication] = useState(false);
  const [role, setRole] = useState(project.openRoles[0] ?? '');
  const [introduction, setIntroduction] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const isOwner = session?.user.id === project.ownerId;
  const full = project.memberCount >= project.totalCapacity;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    submitApplication.mutate({
      projectId: project.id,
      data: { selectedRole: role, introduction: introduction.trim() },
    }, {
      onSuccess: () => {
        setSubmitted(true);
        setShowApplication(false);
        setIntroduction('');
        invalidateTeamup(queryClient);
      },
      onError: cause => setError(readableError(cause, 'Could not submit your application.')),
    });
  }

  return <article className="teamup-card project-card">
    <div className="project-card-top"><span className="category-pill">{project.category}</span><span className={`status-pill ${project.status === 'closed' ? 'status-closed' : ''}`}>{project.status === 'closed' ? 'Closed' : full ? 'Team full' : 'Recruiting'}</span></div>
    <h2>{project.title}</h2>
    <p className="project-owner">By {project.ownerName}</p>
    <p className="project-description">{project.description}</p>
    <div className="teamup-label">Skills sought</div>
    {project.requiredSkills.length ? <div className="skill-pills">{project.requiredSkills.map(skill => <span key={skill}>{skill}</span>)}</div> : <p className="teamup-muted">No specific skills required.</p>}
    <div className="match-box">
      <strong>{project.matchPercent === null ? 'Open to all skill sets' : `${project.matchPercent}% skill match`}</strong>
      <span>{project.matchPercent === null ? 'This project has no required skills, so there is nothing to score.' : `${project.matchedSkills.length} of ${project.requiredSkills.length} required skills match your profile.`}</span>
    </div>
    <div className="project-meta"><span><UsersRound size={15} /> {project.memberCount} / {project.totalCapacity} members</span><span>Apply by {project.deadline}</span></div>
    <div className="role-list">{project.openRoles.map(openRole => <span key={openRole}>{openRole}</span>)}</div>
    {(project.repositoryUrl || project.demoUrl) && <div className="project-links">{project.repositoryUrl && <a href={project.repositoryUrl} target="_blank" rel="noreferrer">Repository <ExternalLink size={13} /></a>}{project.demoUrl && <a href={project.demoUrl} target="_blank" rel="noreferrer">Demo <ExternalLink size={13} /></a>}</div>}
    {alreadyApplied || submitted ? <div className="success-box" role="status"><Check size={15} /> Application submitted</div> : isOwner ? <span className="teamup-muted">This is your project.</span> : <button className="btn btn-primary" disabled={full || isLoading || isError} onClick={() => setShowApplication(value => !value)}>{full ? 'Team is full' : showApplication ? 'Cancel application' : 'Apply to join'} <ArrowRight size={15} /></button>}
    {isError && <p className="helper field-error">Could not verify your applications. <button type="button" className="text-button" onClick={() => void refetch()}>Retry</button></p>}
    {showApplication && <form className="inline-application" onSubmit={submit}><div className="field"><label htmlFor={`role-${project.id}`}>Choose a role</label><select id={`role-${project.id}`} className="control" required value={role} onChange={event => setRole(event.target.value)}>{project.openRoles.map(openRole => <option key={openRole}>{openRole}</option>)}</select></div><div className="field"><label htmlFor={`intro-${project.id}`}>Introduction</label><textarea id={`intro-${project.id}`} className="control" required maxLength={2000} value={introduction} onChange={event => setIntroduction(event.target.value)} placeholder="Share what you would bring to this team." /></div>{error && <div className="error-box" role="alert">{error}</div>}<button className="btn btn-primary" type="submit" disabled={submitApplication.isPending}>{submitApplication.isPending ? 'Sending…' : 'Send application'}</button></form>}
  </article>;
}

export function ProjectsPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [skill, setSkill] = useState('');
  const [create, setCreate] = useState(false);
  const projects = useGetProjects({
    q: search.trim() || undefined,
    category: category.trim() || undefined,
    skill: skill.trim() || undefined,
  });
  const dashboard = useGetDashboard();
  const appliedIds = new Set(dashboard.data?.submittedApplications.map(app => app.projectId) ?? []);
  return <main className="teamup-page wrap">
    <div className="teamup-page-heading"><div><div className="dash-eyebrow"><span className="eyebrow-dot" /> PROJECT DISCOVERY</div><h1 className="display-font">Find a project to build.</h1><p>Explore current student projects and find a role that fits.</p></div><button className="btn btn-primary" onClick={() => setCreate(value => !value)}>{create ? 'Close form' : 'Post a project'} <ArrowRight size={16} /></button></div>
    {create && <section className="teamup-panel"><div className="teamup-section-heading"><div><span className="card-kicker">START A TEAM</span><h2>Create a project</h2></div></div><ProjectForm onSaved={() => setCreate(false)} /></section>}
    <div className="discovery-filters"><label className="filter-search"><Search size={17} /><input aria-label="Search projects" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects, ideas, or owners" /></label><label><span className="sr-only">Filter by category</span><input className="control" list="filter-categories" value={category} onChange={event => setCategory(event.target.value)} placeholder="All categories" /><datalist id="filter-categories">{categories.map(item => <option key={item} value={item} />)}</datalist></label><label><span className="sr-only">Filter by skill</span><input className="control" value={skill} onChange={event => setSkill(event.target.value)} placeholder="Any required skill" /></label></div>
    {projects.isLoading ? <div className="teamup-panel loading-card"><div className="skeleton sk-title" /><div className="skeleton sk-line" /><div className="skeleton sk-line" /></div> : projects.isError ? <div className="teamup-panel teamup-error" role="alert"><h2>Projects could not load</h2><p>{readableError(projects.error, 'Check your connection and try again.')}</p><button className="btn btn-soft" onClick={() => void projects.refetch()}>Try again</button></div> : projects.data?.length ? <div className="teamup-grid">{projects.data.map(project => <ProjectCard key={project.id} project={project} alreadyApplied={appliedIds.has(project.id)} />)}</div> : <div className="teamup-panel empty-state"><span className="step-icon violet"><Search size={20} /></span><h2>No projects match yet</h2><p>Try a broader search or clear a filter. You can also post a project of your own.</p></div>}
  </main>;
}

export function StudentsPage() {
  const [search, setSearch] = useState('');
  const [skill, setSkill] = useState('');
  const students = useGetStudents({ q: search.trim() || undefined, skill: skill.trim() || undefined });
  return <main className="teamup-page wrap">
    <div className="teamup-page-heading"><div><div className="dash-eyebrow"><span className="eyebrow-dot" /> STUDENT DIRECTORY</div><h1 className="display-font">Meet potential teammates.</h1><p>Search student profiles by name, college, interests, or skill.</p></div></div>
    <div className="discovery-filters student-filters"><label className="filter-search"><Search size={17} /><input aria-label="Search students" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search students" /></label><label><span className="sr-only">Filter by skill</span><input className="control" value={skill} onChange={event => setSkill(event.target.value)} placeholder="Any skill" /></label></div>
    {students.isLoading ? <div className="teamup-panel loading-card"><div className="skeleton sk-title" /><div className="skeleton sk-line" /></div> : students.isError ? <div className="teamup-panel teamup-error" role="alert"><h2>Student directory could not load</h2><p>{readableError(students.error, 'Check your connection and try again.')}</p><button className="btn btn-soft" onClick={() => void students.refetch()}>Try again</button></div> : students.data?.length ? <div className="teamup-grid student-grid">{students.data.map(student => <StudentCard key={student.id} student={student} />)}</div> : <div className="teamup-panel empty-state"><h2>No students match yet</h2><p>Try a different search or skill.</p></div>}
  </main>;
}

function StudentCard({ student }: { student: Student }) {
  return <article className="teamup-card student-card">
    <div className="student-card-heading"><span className="profile-avatar">{initials(student.name)}</span><div><h2>{student.name}</h2><p>{student.college}</p></div></div>
    <p className="project-description">{student.bio || 'This student has not added an introduction yet.'}</p>
    <div className="teamup-label">Skills and interests</div>
    <div className="skill-pills">{student.skills.map(item => <span key={item}>{item}</span>)}</div>
    <div className="project-meta"><span>{student.preferredRole}</span><span>{student.hoursAvailablePerWeek} hrs / week</span></div>
    {student.portfolioUrl && <a className="text-link" href={student.portfolioUrl} target="_blank" rel="noreferrer">Portfolio <ArrowUpRight size={15} /></a>}
  </article>;
}

function SubmittedApplicationActions({ application }: { application: Application }) {
  const queryClient = useQueryClient();
  const mutation = useWithdrawApplication();
  const [error, setError] = useState('');
  if (application.status !== 'pending') return <span className={`status-pill status-${application.status}`}>{application.status}</span>;
  return <div className="application-actions"><span className="status-pill">Pending</span><button className="text-button" disabled={mutation.isPending} onClick={() => {
    setError('');
    mutation.mutate({ applicationId: application.id }, {
      onSuccess: () => invalidateTeamup(queryClient),
      onError: cause => setError(readableError(cause, 'Could not withdraw this request.')),
    });
  }}>Withdraw</button>{error && <span className="helper field-error">{error}</span>}</div>;
}

export function DashboardTeamup({ data }: { data: DashboardData }) {
  const queryClient = useQueryClient();
  const closeProject = useCloseProject();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [closedMessage, setClosedMessage] = useState('');
  const projects = useMemo(() => new Map(
    [...data.ownedProjects, ...data.joinedProjects].map(project => [project.id, project]),
  ), [data.ownedProjects, data.joinedProjects]);
  return <section className="teamup-dashboard">
    <div className="teamup-section-heading"><div><span className="card-kicker">PROJECTS AND TEAMS</span><h2>Your work, together</h2></div><button className="btn btn-primary" onClick={() => setCreating(value => !value)}>{creating ? 'Cancel' : 'Create project'} <ArrowRight size={15} /></button></div>
    {creating && <div className="teamup-panel"><ProjectForm onSaved={() => setCreating(false)} /></div>}

    <section className="teamup-panel">
      <div className="teamup-section-heading"><div><span className="card-kicker">YOUR PROJECTS</span><h3>Owned by you</h3></div></div>
      {data.ownedProjects.length ? <div className="owned-project-list">{data.ownedProjects.map(project => <article className="owned-project" key={project.id}>
        <div className="owned-project-head"><div><span className="category-pill">{project.category}</span><h3>{project.title}</h3></div><span className={`status-pill ${project.status === 'closed' ? 'status-closed' : ''}`}>{project.status === 'closed' ? 'Closed' : project.memberCount >= project.totalCapacity ? 'Full' : 'Recruiting'}</span></div>
        <p>{project.description}</p><div className="project-meta"><span>{project.memberCount} / {project.totalCapacity} members</span><span>Deadline {project.deadline}</span></div>
        {(project.repositoryUrl || project.demoUrl) && <div className="project-links">{project.repositoryUrl && <a href={project.repositoryUrl} target="_blank" rel="noreferrer">Repository <ExternalLink size={13} /></a>}{project.demoUrl && <a href={project.demoUrl} target="_blank" rel="noreferrer">Demo <ExternalLink size={13} /></a>}</div>}
        <div className="owned-project-actions"><button className="btn btn-soft btn-small" onClick={() => setEditingId(editingId === project.id ? '' : project.id)}>{editingId === project.id ? 'Cancel edit' : 'Edit project'}</button>{project.status === 'recruiting' && <button className="btn btn-soft btn-small" disabled={closeProject.isPending} onClick={() => {
          setError(''); setClosedMessage('');
          closeProject.mutate({ projectId: project.id }, {
            onSuccess: () => { setClosedMessage(`${project.title} recruitment is closed.`); invalidateTeamup(queryClient); },
            onError: cause => setError(readableError(cause, 'Could not close recruitment.')),
          });
        }}>Close recruitment</button>}</div>
        {editingId === project.id && <ProjectForm key={project.id} project={project} onCancel={() => setEditingId('')} onSaved={() => setEditingId('')} />}
      </article>)}</div> : <p className="teamup-muted">You haven’t posted a project yet.</p>}
      {error && <div className="error-box" role="alert">{error}</div>}{closedMessage && <div className="success-box" role="status">{closedMessage}</div>}
    </section>

    {data.rosters.length > 0 && <section className="teamup-panel"><div className="teamup-section-heading"><div><span className="card-kicker">TEAM FIT STUDIO</span><h3>Fill the gaps. Start building.</h3><p className="teamup-muted">A private planning view for your actual teams.</p></div></div>{data.rosters.map(roster => <div key={roster.project.id} className="fit-project"><h4>{roster.project.title}</h4><TeamFit projectId={roster.project.id} /></div>)}</section>}
    <div className="teamup-two-column">
      <section className="teamup-panel">
        <div className="teamup-section-heading"><div><span className="card-kicker">REQUESTS TO JOIN</span><h3>Applications received</h3></div></div>
        {data.receivedApplications.length ? <div className="application-list">{data.receivedApplications.map(application => <article className="application-card" key={application.id}>
          <div className="application-card-head"><div><strong>{application.applicantName}</strong><span>{application.applicantCollege}</span></div><span className={`status-pill status-${application.status}`}>{application.status}</span></div>
          <p className="application-role">{application.selectedRole} · {projects.get(application.projectId)?.title ?? application.projectTitle}</p><p>{application.introduction}</p>
          {application.status === 'pending' && <ApplicationDecision application={application} />}
        </article>)}</div> : <p className="teamup-muted">No applications yet.</p>}
      </section>
      <section className="teamup-panel">
        <div className="teamup-section-heading"><div><span className="card-kicker">YOUR REQUESTS</span><h3>Applications sent</h3></div></div>
        {data.submittedApplications.length ? <div className="application-list">{data.submittedApplications.map(application => <article className="application-card" key={application.id}>
          <div className="application-card-head"><div><strong>{application.projectTitle}</strong><span>{application.selectedRole}</span></div><SubmittedApplicationActions application={application} /></div>
          <p>{application.introduction}</p>
        </article>)}</div> : <p className="teamup-muted">You haven’t applied to a team yet. <Link href="/projects" className="text-link">Explore projects <ArrowRight size={14} /></Link></p>}
      </section>
    </div>

    <section className="teamup-panel">
      <div className="teamup-section-heading"><div><span className="card-kicker">MEMBER-ONLY DETAILS</span><h3>Your team rosters</h3></div></div>
      {data.rosters.length ? <div className="teamup-grid roster-grid">{data.rosters.map(roster => <article className="roster-card" key={roster.project.id}>
        <div><span className="category-pill">{roster.project.category}</span><h3>{roster.project.title}</h3></div>
        <p>{roster.project.description}</p>
        {(roster.project.repositoryUrl || roster.project.demoUrl) && <div className="project-links">{roster.project.repositoryUrl && <a href={roster.project.repositoryUrl} target="_blank" rel="noreferrer">Repository <ExternalLink size={13} /></a>}{roster.project.demoUrl && <a href={roster.project.demoUrl} target="_blank" rel="noreferrer">Demo <ExternalLink size={13} /></a>}</div>}
        <ul className="roster-members">{roster.members.map(member => <li key={member.userId}><span className="profile-avatar small-avatar">{initials(member.name)}</span><span><strong>{member.name}</strong><small>{member.role}</small></span></li>)}</ul>
      </article>)}</div> : <p className="teamup-muted">Your private team rosters will appear here when you join a project.</p>}
    </section>
    {data.joinedProjects.length > 0 && <section className="teamup-panel"><div className="teamup-section-heading"><div><span className="card-kicker">TEAMS YOU JOINED</span><h3>Joined projects</h3></div></div><div className="teamup-grid">{data.joinedProjects.map(project => <article className="joined-project" key={project.id}><span className="category-pill">{project.category}</span><h3>{project.title}</h3><p>{project.description}</p><div className="project-meta"><span>{project.memberCount} / {project.totalCapacity} members</span><span>{project.ownerName} leads</span></div></article>)}</div></section>}
  </section>;
}

function ApplicationDecision({ application }: { application: Application }) {
  const queryClient = useQueryClient();
  const accept = useAcceptApplication();
  const reject = useRejectApplication();
  const [error, setError] = useState('');
  const busy = accept.isPending || reject.isPending;
  const act = (decision: 'accept' | 'reject') => {
    setError('');
    const onSuccess = () => invalidateTeamup(queryClient);
    const onError = (cause: unknown) => setError(readableError(cause, 'Could not update this application.'));
    if (decision === 'accept') accept.mutate({ applicationId: application.id }, { onSuccess, onError });
    else reject.mutate({ applicationId: application.id }, { onSuccess, onError });
  };
  return <div className="application-actions"><button className="btn btn-primary btn-small" disabled={busy} onClick={() => act('accept')}>Accept</button><button className="btn btn-soft btn-small" disabled={busy} onClick={() => act('reject')}>Decline</button>{error && <span className="helper field-error" role="alert">{error}</span>}</div>;
}
