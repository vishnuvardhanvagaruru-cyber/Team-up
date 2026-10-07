export interface FitPerson {
  userId: string;
  name: string;
  role: string;
  skills: string[];
  hoursAvailablePerWeek: number | null;
  portfolioUrl: string | null;
  profileAvailable: boolean;
}

export interface FitApplicant extends FitPerson {
  applicationId: string;
  introduction: string;
}

export function normalizeSkill(value: string) {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
}

export function uniqueSkills(skills: string[]) {
  return [...new Map(skills.filter(s => s.trim()).map(s => [normalizeSkill(s), s.trim()])).values()];
}

export function teamCoverage(required: string[], people: FitPerson[]) {
  const members = [...new Map(people.map(p => [p.userId, p])).values()];
  const skills = uniqueSkills(required).map(skill => ({
    skill,
    people: members.filter(p => p.skills.some(s => normalizeSkill(s) === normalizeSkill(skill))),
  }));
  const covered = skills.filter(s => s.people.length > 0);
  return {
    skills,
    missing: skills.filter(s => s.people.length === 0).map(s => s.skill),
    coveredCount: covered.length,
    percent: skills.length ? Math.round(100 * covered.length / skills.length) : null,
    totalHours: members.reduce((sum, p) => sum + (p.hoursAvailablePerWeek ?? 0), 0),
    incomplete: members.some(p => !p.profileAvailable),
  };
}

export function compareApplicants(required: string[], members: FitPerson[], applicants: FitApplicant[], weeklyTarget: number) {
  const baseline = teamCoverage(required, members);
  const memberIds = new Set(members.map(m => m.userId));
  return applicants.filter(a => !memberIds.has(a.userId)).map(applicant => {
    const have = new Set(applicant.skills.map(normalizeSkill));
    const adds = baseline.missing.filter(s => have.has(normalizeSkill(s)));
    const after = teamCoverage(required, [...members, applicant]);
    return { applicant, adds, afterPercent: after.percent,
      available: applicant.hoursAvailablePerWeek === null ? null : applicant.hoursAvailablePerWeek >= weeklyTarget };
  }).sort((a, b) => b.adds.length - a.adds.length || Number(b.available === true) - Number(a.available === true) || a.applicant.name.localeCompare(b.applicant.name));
}

export function kickoffText(title: string, objective: string, members: FitPerson[], missing: string[], weeklyTarget: number, repository: string | null, demo: string | null) {
  return [
    `TEAMUP — ${title}`, '', 'TEAM KICKOFF BRIEF', '',
    `One outcome to build: ${objective.trim() || 'Agree one small, demonstrable outcome.'}`,
    `Planning assumption: ${weeklyTarget} hours per person per week (discuss and agree; not a commitment).`, '',
    'CURRENT TEAM', ...members.map(m => `- ${m.name}: ${m.role}; ${m.hoursAvailablePerWeek ?? 'unknown'} declared hours/week`), '',
    `Uncovered skills: ${missing.join(', ') || 'None among the listed requirements.'}`, '',
    'FIRST WORK SESSION',
    '[ ] Agree the smallest useful outcome and one feature to leave out.',
    '[ ] Pick a meeting time and communication channel everyone can use.',
    '[ ] Give every task an owner and an observable completion condition.',
    '[ ] Confirm that everyone can run the app and access the repository.',
    '[ ] Build and test one complete user journey together.',
    '[ ] Record a short demo and agree the next check-in.', '',
    `Repository: ${repository || 'Add a repository link to the project.'}`,
    `Demo: ${demo || 'Add a demo link when ready.'}`, '',
    'This brief uses self-reported skills and availability. Review it together; it does not verify expertise or guarantee team success.',
  ].join('\n');
}
