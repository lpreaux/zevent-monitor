import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandStorage } from './storage';

/** Verrouillage d'orientation demandé pour l'écran AlwaysOn uniquement. */
export type OrientationLock = 'auto' | 'landscape' | 'portrait';

/** Paliers de gradation logicielle (opacité du voile noir appliqué au contenu). */
export const DIM_LEVELS = [0, 0.35, 0.6, 0.8] as const;

interface AlwaysOnState {
  orientationLock: OrientationLock;
  /** Index dans `DIM_LEVELS`. */
  dimLevel: number;
  /** Déplacement lent du contenu pour limiter le marquage d'écran AMOLED. */
  antiBurnIn: boolean;
  hydrated: boolean;
  setOrientationLock: (lock: OrientationLock) => void;
  cycleDim: () => void;
  toggleAntiBurnIn: () => void;
}

export const useAlwaysOnStore = create<AlwaysOnState>()(
  persist(
    (set, get) => ({
      orientationLock: 'auto',
      dimLevel: 0,
      antiBurnIn: true,
      hydrated: false,
      setOrientationLock: (orientationLock) => set({ orientationLock }),
      cycleDim: () => set({ dimLevel: (get().dimLevel + 1) % DIM_LEVELS.length }),
      toggleAntiBurnIn: () => set({ antiBurnIn: !get().antiBurnIn }),
    }),
    {
      name: 'always-on',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        orientationLock: state.orientationLock,
        dimLevel: state.dimLevel,
        antiBurnIn: state.antiBurnIn,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/** Opacité du voile de gradation pour l'index de palier courant. */
export function dimOpacity(level: number): number {
  return DIM_LEVELS[Math.min(Math.max(level, 0), DIM_LEVELS.length - 1)] ?? 0;
}
