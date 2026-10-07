import test from 'node:test';
import assert from 'node:assert/strict';
import { teamCoverage, compareApplicants, kickoffText, type FitPerson, type FitApplicant } from './team-fit.ts';

const member: FitPerson = { userId: 'owner', name: 'Owner', role: 'Developer', skills: ['Frontend development'], hoursAvailablePerWeek: 6, portfolioUrl: null, profileAvailable: true };
const applicant = (id: string, skills: string[], hours: number | null = 8): FitApplicant => ({ ...member, userId: id, name: id, applicationId: `application-${id}`, introduction: '', skills, hoursAvailablePerWeek: hours });

test('coverage normalizes and deduplicates skills and people', () => {
  const result = teamCoverage([' Frontend development ', 'frontend DEVELOPMENT', 'Backend development'], [member, member]);
  assert.equal(result.percent, 50);
  assert.deepEqual(result.missing, ['Backend development']);
  assert.equal(result.totalHours, 6);
  assert.equal(result.skills[0].people.length, 1);
});
test('complementary applicant outranks duplicate skills even with lower availability', () => {
  const results = compareApplicants(['Frontend development', 'Backend development'], [member], [applicant('A', ['Frontend development'], 20), applicant('B', ['Backend development'], 2)], 6);
  assert.equal(results[0].applicant.userId, 'B');
  assert.equal(results[0].afterPercent, 100);
  assert.equal(results[0].available, false);
  assert.deepEqual(results[0].adds, ['Backend development']);
});
test('existing members cannot be proposed twice and unknown availability stays unknown', () => {
  const results = compareApplicants(['Backend development'], [member], [applicant('owner', ['Backend development']), applicant('B', [], null)], 6);
  assert.equal(results.length, 1);
  assert.equal(results[0].available, null);
});
test('unspecified requirements do not produce a misleading perfect score', () => {
  const result = teamCoverage([], [{ ...member, profileAvailable: false, hoursAvailablePerWeek: null }]);
  assert.equal(result.percent, null);
  assert.equal(result.incomplete, true);
  assert.equal(result.totalHours, 0);
});
test('kickoff exports actual member information and planning caveat', () => {
  const text = kickoffText('Demo', ' Ship a signup flow ', [member], ['Backend development'], 6, null, null);
  assert.match(text, /One outcome to build: Ship a signup flow/);
  assert.match(text, /Owner: Developer; 6 declared hours/);
  assert.match(text, /Uncovered skills: Backend development/);
  assert.match(text, /not a commitment/);
});
