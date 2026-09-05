import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PlanningEntry } from '@/api/types';
import {
  canRemind,
  cancelReminder,
  REMINDER_LEAD_MS,
  scheduleReminder,
} from '@/lib/planning-reminders';
import { zustandStorage } from './storage';

/** Rappel programmé, avec l'horaire visé au moment où il a été posé. */
interface ScheduledReminder {
  notificationId: string;
  /** Début de l'émission tel que connu alors : sert à détecter un planning qui a bougé. */
  startsAt: string;
}

interface PlanningRemindersState {
  /** Id d'entrée du planning → rappel programmé sur l'appareil. */
  scheduled: Record<string, ScheduledReminder>;
  hydrated: boolean;
  /** Dernier refus rencontré (permission, plateforme), à afficher une fois puis oublier. */
  error: string | null;
  toggle: (entry: PlanningEntry) => Promise<void>;
  dismissError: () => void;
  /** Réaligne les rappels sur le planning courant. Voir `sync` ci-dessous. */
  sync: (entries: PlanningEntry[], now: number) => Promise<void>;
}

/**
 * Rappels d'émission posés par l'utilisateur.
 *
 * Le magasin ne garde que le lien entre une entrée du planning et la notification
 * programmée pour elle ; la notification elle-même vit dans le système, et lui survivra à
 * la fermeture de l'application. C'est ce qui oblige à `sync` : le planning communautaire
 * change en direct, et un rappel programmé pour 18h00 doit suivre l'émission déplacée à
 * 19h00 plutôt que de sonner dans le vide.
 */
export const usePlanningRemindersStore = create<PlanningRemindersState>()(
  persist(
    (set, get) => ({
      scheduled: {},
      hydrated: false,
      error: null,

      toggle: async (entry) => {
        const current = get().scheduled[entry.id];
        if (current) {
          await cancelReminder(current.notificationId);
          set((state) => {
            const { [entry.id]: _removed, ...rest } = state.scheduled;
            return { scheduled: rest, error: null };
          });
          return;
        }

        const outcome = await scheduleReminder(entry);
        if (!outcome.ok) {
          set({ error: outcome.reason });
          return;
        }
        set((state) => ({
          scheduled: {
            ...state.scheduled,
            [entry.id]: { notificationId: outcome.notificationId, startsAt: entry.startsAt },
          },
          error: null,
        }));
      },

      dismissError: () => set({ error: null }),

      sync: async (entries, now) => {
        const scheduled = get().scheduled;
        const ids = Object.keys(scheduled);
        if (ids.length === 0) return;

        const byId = new Map(entries.map((entry) => [entry.id, entry]));
        const next: Record<string, ScheduledReminder> = {};
        let changed = false;

        for (const id of ids) {
          const reminder = scheduled[id];
          const entry = byId.get(id);

          // Émission disparue du planning, ou rappel dont l'heure est passée : la
          // notification a déjà été délivrée, ou ne le sera jamais. Dans les deux cas
          // l'entrée n'a plus à figurer ici — la cloche doit redevenir décochée.
          const firesAt = Date.parse(reminder.startsAt) - REMINDER_LEAD_MS;
          if (!entry || firesAt <= now) {
            if (!entry) await cancelReminder(reminder.notificationId);
            changed = true;
            continue;
          }

          if (entry.startsAt === reminder.startsAt) {
            next[id] = reminder;
            continue;
          }

          // Horaire déplacé : on reprogramme sur le nouveau, et on abandonne le rappel
          // si l'émission a été avancée au point qu'il n'y a plus rien à annoncer.
          await cancelReminder(reminder.notificationId);
          changed = true;
          if (!canRemind(entry, now)) continue;
          const outcome = await scheduleReminder(entry);
          if (outcome.ok) {
            next[id] = { notificationId: outcome.notificationId, startsAt: entry.startsAt };
          }
        }

        if (changed) set({ scheduled: next });
      },
    }),
    {
      name: 'planning-reminders',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ scheduled: state.scheduled }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
