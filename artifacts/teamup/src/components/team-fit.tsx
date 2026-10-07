import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customFetch, type Project } from '@workspace/api-client-react';
import { Download, FlaskConical, Target, Clock3, ChevronDown } from 'lucide-react';
import { compareApplicants, kickoffText, teamCoverage, type FitPerson, type FitApplicant } from '@/lib/team-fit';

interface Insights { project: Project; isOwner: boolean; members: FitPerson[]; applicants: FitApplicant[] }

export function TeamFit({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return <section className="fit-shell">
    <button className="fit-toggle" type="button" aria-expanded={open} aria-controls={`fit-${projectId}`} onClick={() => setOpen(v => !v)}>
      <span><Target size={18} /> Team Fit Studio <small>Find what your team is missing</small></span><ChevronDown size={18} />
    </button>
    {open && <div id={`fit-${projectId}`}><TeamFitContent projectId={projectId} /></div>}
  </section>;
}

function TeamFitContent({ projectId }: { projectId: string }) {
  const [weeklyTarget, setWeeklyTarget] = useState(6);
  const [selected, setSelected] = useState<string[]>([]);
  const [objective, setObjective] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const query = useQuery<Insights>({
    queryKey: ['team-fit', projectId],
    queryFn: ({ signal }) => customFetch(`/api/projects/${projectId}/insights`, { signal }),
    staleTime: 0,
  });
  if (query.isPending) return <p className="fit-body" role="status">Loading your team’s current skills…</p>;
  if (query.isError) return <div className="fit-body" role="alert"><p>{query.error.message}</p><button className="btn btn-soft" onClick={() => void query.refetch()}>Retry team analysis</button></div>;
  const { project, members, applicants, isOwner } = query.data;
  const baseline = teamCoverage(project.requiredSkills, members);
  const candidates = compareApplicants(project.requiredSkills, members, applicants, weeklyTarget);
  const slots = Math.max(0, project.totalCapacity - members.length);
  const chosen = candidates.filter(c => selected.includes(c.applicant.userId)).slice(0, slots).map(c => c.applicant);
  const simulated = teamCoverage(project.requiredSkills, [...members, ...chosen]);
  const minimum = Math.min(...members.map(m => m.hoursAvailablePerWeek ?? 0));
  const count = members.filter(m => m.hoursAvailablePerWeek !== null && m.hoursAvailablePerWeek >= weeklyTarget).length;

  function download() {
    const content = kickoffText(project.title, objective, members, baseline.missing, weeklyTarget, project.repositoryUrl, project.demoUrl);
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `${project.title.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 65) || 'team'}-kickoff.txt`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setDownloaded(true);
  }

  return <div className="fit-body">
    <div className="fit-intro"><span className="card-kicker">BUILD A BALANCED TEAM</span><h3>Complement each other.</h3><p>Look at what the whole team can cover, not just individual match scores.</p></div>
    {baseline.incomplete && <p className="warning-box" role="status">Some member profiles are missing. This analysis may understate coverage.</p>}
    <div className="fit-stats">
      <div><strong>{baseline.percent === null ? '—' : `${baseline.percent}%`}</strong><span>Listed skills covered</span></div>
      <div><strong>{baseline.missing.length}</strong><span>Skills still needed</span></div>
      <div><strong>{slots}</strong><span>Places remaining</span></div>
      <div><strong>{baseline.totalHours}h</strong><span>Declared hours / week</span></div>
    </div>
    <p className="fit-note">Skills and hours are self-reported. Coverage is not a quality score; hours do not imply overlapping schedules.</p>
    <h4>Team skill map</h4>
    {baseline.skills.length ? <div className="fit-skill-map">{baseline.skills.map(item => <div className={`fit-skill ${item.people.length ? 'fit-covered' : 'fit-missing'}`} key={item.skill}><strong>{item.skill}</strong><span>{item.people.length ? item.people.map(p => p.name).join(', ') : 'No member lists this skill yet'}</span><small>{item.people.length === 1 ? 'One person covers this — consider a backup' : item.people.length > 1 ? `${item.people.length} members can contribute` : 'Recruit or learn together'}</small></div>)}</div> : <p className="teamup-muted">Add required skills to your project to see a coverage map.</p>}
    <div className="fit-planning"><h4><Clock3 size={17} /> Availability check</h4><label htmlFor={`hours-${projectId}`}>Planning target: <strong>{weeklyTarget} hours per person / week</strong></label><input id={`hours-${projectId}`} type="range" min="1" max="40" value={weeklyTarget} onChange={e => setWeeklyTarget(Number(e.target.value))} /><p>{count} of {members.length} members meet this target in their profiles.{members.length > 0 && minimum > 0 ? ` The lowest declared availability is ${minimum} hours/week.` : ''}</p><p className="fit-note">This slider is a what-if assumption for this view, not a saved project requirement or a commitment.</p></div>
    {isOwner && <div className="fit-candidates"><h4><FlaskConical size={17} /> Applicant comparison & what-if team</h4><p>Ordered by uncovered skills added, then whether the planning target is met. You make the decision.</p>
      {candidates.length ? <><div className="fit-simulation" role="status"><strong>Coverage: {baseline.percent === null ? 'not specified' : `${baseline.percent}%`} → {simulated.percent === null ? 'not specified' : `${simulated.percent}%`}</strong><span>{chosen.length} hypothetical addition{chosen.length === 1 ? '' : 's'} · {simulated.missing.length} uncovered skills remaining</span></div>
      <div className="fit-candidate-list">{candidates.map(({ applicant, adds, available }) => {
        const checked = chosen.some(p => p.userId === applicant.userId);
        return <label className={`fit-candidate ${checked ? 'fit-selected' : ''}`} key={applicant.applicationId}><input type="checkbox" checked={checked} disabled={!checked && chosen.length >= slots} onChange={() => setSelected(current => checked ? current.filter(id => id !== applicant.userId) : [...current, applicant.userId])} /><span><strong>{applicant.name} <small>· {applicant.role}</small></strong><span className="fit-adds">{adds.length ? `Adds ${adds.length} missing skill${adds.length === 1 ? '' : 's'}: ${adds.join(', ')}` : 'No additional listed skill coverage; consider role fit and experience.'}</span><span>{applicant.hoursAvailablePerWeek ?? 'Unknown'} hours/week · {available === null ? 'Availability unknown' : available ? 'Meets planning target' : 'Below planning target'}</span>{!applicant.profileAvailable && <span>Profile unavailable — compare with care.</span>}</span></label>;
      })}</div><p className="fit-note">Selecting people only simulates a team. Accept or decline actual requests in Applications received. Existing capacity rules still apply.</p></> : <p className="teamup-muted">No pending applicants to compare. This view fills automatically when students apply.</p>}
    </div>}
    <div className="fit-kickoff"><h4>From matched to making</h4><p>Turn the current team and skill gaps into a practical first-session brief.</p><label htmlFor={`outcome-${projectId}`}>What is the first outcome you want to demonstrate?</label><textarea id={`outcome-${projectId}`} className="control" maxLength={500} value={objective} onChange={e => { setObjective(e.target.value); setDownloaded(false); }} placeholder="For example: a student can post a project and another student can apply." /><ol><li>Agree one small outcome and what to leave out.</li><li>Choose a meeting time, task owners, and a shared channel.</li><li>Build one full user journey and record the demo.</li></ol><button className="btn btn-primary btn-small" type="button" onClick={download}><Download size={15} /> Download team kickoff brief</button>{downloaded && <p role="status">Brief downloaded. Share it with your team.</p>}<p className="fit-note">The draft stays in this open view only. Download to keep it. The export uses actual members, not the hypothetical team.</p></div>
  </div>;
}
