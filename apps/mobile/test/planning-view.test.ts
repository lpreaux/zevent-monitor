import { describe, expect, it } from 'vitest';

import type { PlanningEntry, PlanningParticipant } from '../src/api/types';
import { broadcastLogin, buildPlanningView } from '../src/lib/planning-view';

function participant(partial: Partial<PlanningParticipant> & { name: string }): PlanningParticipant {
  return {
    twitch: partial.twitch ?? null,
    profileUrl: partial.profileUrl ?? null,
    role: partial.role ?? 'participant',
    broadcaster: partial.broadcaster ?? false,
    name: partial.name,
  };
}

function entry(partial: Partial<PlanningEntry> & { startsAt: string }): PlanningEntry {
  return {
    id: partial.id ?? partial.startsAt,
    title: partial.title ?? 'Émission',
    description: partial.description ?? '',
    endsAt: partial.endsAt ?? null,
    allDay: partial.allDay ?? false,
    source: partial.source ?? 'ingdoc',
    participants: partial.participants ?? [],
    startsAt: partial.startsAt,
  };
}

/** Samedi après-midi : deux directs qui se chevauchent, dont un stand ouvert jusqu'au soir. */
const CROC = entry({
  id: 'croc',
  title: 'Croc Lanta',
  startsAt: '2026-09-05T13:00:00Z',
  endsAt: '2026-09-05T15:00:00Z',
  participants: [participant({ name: 'Ultia', twitch: 'ultia' })],
});
const STAND = entry({
  id: 'stand',
  title: 'Stand maquillage',
  startsAt: '2026-09-05T13:00:00Z',
  endsAt: '2026-09-05T22:00:00Z',
});
const QUIZ = entry({
  id: 'quiz',
  title: 'Questions pour un Streamer',
  startsAt: '2026-09-05T18:30:00Z',
  endsAt: '2026-09-05T21:00:00Z',
});
const RUSH = entry({
  id: 'rush',
  title: 'Rush final',
  startsAt: '2026-09-06T18:00:00Z',
  endsAt: '2026-09-06T23:00:00Z',
});

const ENTRIES = [QUIZ, STAND, CROC, RUSH];
const AFTERNOON = Date.parse('2026-09-05T14:00:00Z');

function view(now = AFTERNOON, options: Partial<Parameters<typeof buildPlanningView>[2]> = {}) {
  return buildPlanningView(ENTRIES, now, { favorites: [], ...options });
}

describe('buildPlanningView', () => {
  it('sépare ce qui passe de ce qui suit', () => {
    const result = view();
    expect(result.live.map((item) => item.id)).toEqual(['croc', 'stand']);
    expect(result.next.map((item) => item.id)).toEqual(['quiz', 'rush']);
  });

  it('range les créneaux au long cours derrière les rendez-vous qui vont se terminer', () => {
    // « Stand maquillage » tient jusqu'au soir : il ne réclame aucune décision, contrairement
    // à « Croc Lanta » qui se termine dans l'heure.
    const result = view();
    expect(result.live[0].id).toBe('croc');
    expect(result.live[1].longRun).toBe(true);
  });

  it('compte les émissions en parallèle sur le planning entier', () => {
    const result = view();
    const stand = result.live.find((item) => item.id === 'stand');
    // Le stand recoupe Croc Lanta et le quiz, mais pas le rush du lendemain.
    expect(stand?.parallel).toBe(2);
    expect(result.live.find((item) => item.id === 'croc')?.parallel).toBe(1);
  });

  it('groupe par journée parisienne, dans l’ordre du week-end', () => {
    const result = view();
    expect(result.days.map((day) => day.short)).toEqual(['Sam 5', 'Dim 6']);
    expect(result.days[0].label).toBe('samedi 5 septembre');
  });

  it('pose le repère du présent avant la première émission encore à venir', () => {
    const result = view();
    const { sectionIndex, itemIndex } = result.nowLocation!;
    expect(result.sections[sectionIndex].data[itemIndex]).toEqual({ kind: 'now', id: 'now' });
    // Samedi : Croc Lanta et le stand ont commencé, le quiz non.
    expect(itemIndex).toBe(2);
    const after = result.sections[sectionIndex].data[itemIndex + 1];
    expect(after.kind === 'entry' && after.id).toBe('quiz');
  });

  it('pose le repère en fin de journée quand celle-ci est déjà terminée', () => {
    // Dimanche 20h : le rush a commencé à 20h heure de Paris, plus rien après lui.
    const result = view(Date.parse('2026-09-06T21:00:00Z'));
    const { sectionIndex, itemIndex } = result.nowLocation!;
    expect(result.sections[sectionIndex].key).toBe('2026-09-06');
    expect(itemIndex).toBe(result.sections[sectionIndex].data.length - 1);
  });

  it('n’affiche aucun repère les jours où le planning ne dit rien', () => {
    // Lundi : le week-end est fini, aucune journée du fil n’est celle du jour.
    expect(view(Date.parse('2026-09-07T12:00:00Z')).nowLocation).toBeNull();
  });

  it('borne le fil à une journée sans toucher aux émissions en cours', () => {
    const result = view(AFTERNOON, { day: '2026-09-06' });
    expect(result.sections.map((section) => section.key)).toEqual(['2026-09-06']);
    expect(result.counts.shown).toBe(1);
    // Le rail garde toutes les journées : c’est lui qui porte le filtre.
    expect(result.days.map((item) => item.short)).toEqual(['Sam 5', 'Dim 6']);
    // Ce qui passe maintenant ne dépend d’aucun filtre de journée.
    expect(result.live.map((item) => item.id)).toEqual(['croc', 'stand']);
    // Et le repère reste dans la journée en cours, donc hors de ce fil.
    expect(result.nowLocation).toBeNull();
  });

  it('signale les favoris annoncés, et sait n’en garder que les émissions', () => {
    const all = view(AFTERNOON, { favorites: ['ULTIA'] });
    expect(all.counts.withFavorites).toBe(1);
    expect(all.live.find((item) => item.id === 'croc')?.favorites.map((p) => p.name)).toEqual([
      'Ultia',
    ]);

    const filtered = view(AFTERNOON, { favorites: ['ultia'], favoritesOnly: true });
    expect(filtered.counts.shown).toBe(1);
    expect(filtered.counts.total).toBe(4);
    expect(filtered.days.map((item) => item.short)).toEqual(['Sam 5']);
    expect(filtered.sections).toHaveLength(1);
    // Le nombre d'émissions en parallèle décrit le week-end, pas l'état des filtres.
    expect(filtered.live[0].parallel).toBe(1);
  });

  it('ne rend aucun repère sur un planning vide', () => {
    const empty = buildPlanningView([], AFTERNOON, { favorites: [] });
    expect(empty.nowLocation).toBeNull();
    expect(empty.sections).toEqual([]);
  });
});

describe('broadcastLogin', () => {
  it('préfère la chaîne diffusante à celle de l’animation', () => {
    const show = entry({
      startsAt: '2026-09-05T13:00:00Z',
      participants: [
        participant({ name: 'Hôte', twitch: 'hote', role: 'host' }),
        participant({ name: 'ZEvent', twitch: 'zevent', role: 'guest', broadcaster: true }),
      ],
    });
    expect(broadcastLogin(show)).toBe('zevent');
  });

  it('se rabat sur l’animation, puis sur rien du tout', () => {
    expect(
      broadcastLogin(
        entry({
          startsAt: '2026-09-05T13:00:00Z',
          participants: [participant({ name: 'Hôte', twitch: 'hote', role: 'host' })],
        }),
      ),
    ).toBe('hote');
    expect(broadcastLogin(CROC)).toBeNull();
  });
});
