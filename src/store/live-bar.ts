import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

/**
 * Palier d'affichage du résumé du direct épinglé sous la barre du haut :
 * `comfort` = zone détaillée, `compact` = une ligne, `hidden` = poignée seule.
 */
export type LiveBarMode = 'comfort' | 'compact' | 'hidden';

/** Paliers où la barre affiche quelque chose : la densité bascule entre les deux. */
export type LiveBarDensity = Exclude<LiveBarMode, 'hidden'>;

interface LiveBarState {
  mode: LiveBarMode;
  /** Densité retenue, restaurée telle quelle quand on réaffiche la barre. */
  density: LiveBarDensity;
  setMode: (mode: LiveBarMode) => void;
  /** Bascule confort ⇄ réduit, sans jamais masquer la barre. */
  toggleDensity: () => void;
  /** Masque tout, ou réaffiche la barre dans la densité retenue. */
  toggleHidden: () => void;
}

export const useLiveBarStore = create<LiveBarState>()(
  persist(
    (set, get) => ({
      mode: 'comfort',
      density: 'comfort',
      setMode: (mode) => set(mode === 'hidden' ? { mode } : { mode, density: mode }),
      toggleDensity: () => {
        const next: LiveBarDensity = get().density === 'comfort' ? 'compact' : 'comfort';
        set({ mode: next, density: next });
      },
      toggleHidden: () => {
        const { mode, density } = get();
        set({ mode: mode === 'hidden' ? density : 'hidden' });
      },
    }),
    {
      name: 'live-bar',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ mode: state.mode, density: state.density }),
    },
  ),
);
