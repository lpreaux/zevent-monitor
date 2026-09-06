import { describe, expect, it } from 'vitest';

import { selectOverviewParticipants, toGoalsSnapshotEntries } from '../src/jobs/goals-sync.js';

describe('selectOverviewParticipants', () => {
  it('keeps only participations with a Twitch login and at least one goal', () => {
    const overview = [
      {
        id: 'p1',
        name: 'Adyce_',
        donation_goals_count: 13,
        socials: { twitch: { login: 'adyce_' } },
      },
      { id: 'p2', name: 'Sans palier', donation_goals_count: 0, socials: { twitch: { login: 'sans-palier' } } },
      { id: 'p3', name: 'Sans Twitch', donation_goals_count: 3, socials: {} },
      { id: 'p4', name: 'Champ invalide', donation_goals_count: 'beaucoup' },
    ];

    expect(selectOverviewParticipants(overview)).toEqual([{ id: 'p1', name: 'Adyce_', twitch: 'adyce_' }]);
  });
});

describe('toGoalsSnapshotEntries', () => {
  it('normalizes goal entries and tolerates malformed items', () => {
    const goals = [
      { id: 'goal-1', name: 'Défi surprise', amount: 200000, category: 'donation', reached: false, links: [] },
      { id: 'goal-2', name: 'Sans catégorie', amount: 5000 },
      { name: 'Sans id ni montant' },
    ];

    expect(toGoalsSnapshotEntries(goals)).toEqual([
      { id: 'goal-1', amountCents: 200000, label: 'Défi surprise', category: 'donation', reached: false },
      { id: 'goal-2', amountCents: 5000, label: 'Sans catégorie', category: null, reached: false },
    ]);
  });
});
