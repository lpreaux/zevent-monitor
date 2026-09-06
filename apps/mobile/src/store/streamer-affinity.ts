import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  noteAffinity,
  pruneAffinity,
  type AffinityEntry,
  type AffinityEvent,
} from '@/lib/favorite-relevance';
import { zustandStorage } from './storage';

interface StreamerAffinityState {
  /** Score d'intérêt par login Twitch (minuscules), amorti dans le temps. */
  entries: Record<string, AffinityEntry>;
  /** Enregistre une interaction : fiche ouverte, stream lancé, page de don visitée. */
  note: (twitch: string, event: AffinityEvent) => void;
  /** Remet le classement de pertinence à plat (réglages, changement de compte). */
  reset: () => void;
}

/**
 * Journal local des interactions avec les streamers. Il ne quitte jamais l'appareil et
 * ne sert qu'à ordonner les favoris : rien n'est envoyé au backend ni synchronisé.
 */
export const useStreamerAffinityStore = create<StreamerAffinityState>()(
  persist(
    (set, get) => ({
      entries: {},
      note: (twitch, event) => {
        const login = twitch.trim().toLowerCase();
        if (!login) return;
        const now = Date.now();
        const entries = pruneAffinity(get().entries, now);
        set({ entries: { ...entries, [login]: noteAffinity(entries[login], event, now) } });
      },
      reset: () => set({ entries: {} }),
    }),
    {
      name: 'streamer-affinity',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

/** Raccourci hors composant (ouverture d'un lien externe, effet de montage d'écran). */
export function noteStreamerInteraction(twitch: string, event: AffinityEvent): void {
  useStreamerAffinityStore.getState().note(twitch, event);
}
