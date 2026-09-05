import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DIM_STEP_COUNT } from '@/lib/always-on-comfort';
import type { AlwaysOnPreset } from '@/lib/always-on-layout';

import { zustandStorage } from './storage';

/** Verrouillage d'orientation demandé pour l'écran AlwaysOn uniquement. */
export type OrientationLock = 'auto' | 'landscape' | 'portrait';

/**
 * Dispositions de l'écran secondaire : définies avec le calcul de mise en page qui les
 * consomme (`cycle` alterne les autres, cf. `resolvePreset`).
 */
export type { AlwaysOnPreset };

/** Ordre parcouru par le bouton « disposition », le double tap et le balayage. */
export const PRESET_CYCLE: AlwaysOnPreset[] = [
  'overview',
  'amount',
  'focus',
  'planning',
  'activity',
  'cycle',
];

/** Intervalles proposés pour la rotation automatique entre favoris (0 = désactivée). */
export const ROTATION_OPTIONS = [0, 30, 60, 180] as const;

interface AlwaysOnState {
  orientationLock: OrientationLock;
  /** Index dans `DIM_STEPS`. */
  dimLevel: number;
  /** Déplacement lent du contenu pour limiter le marquage d'écran AMOLED. */
  antiBurnIn: boolean;
  preset: AlwaysOnPreset;
  /** Login Twitch (minuscules) épinglé en mode Focus, `null` = choix automatique. */
  focusTwitch: string | null;
  /** Période de rotation entre favoris en mode Focus, en secondes (0 = figé). */
  rotationSeconds: number;
  /** Gradation automatique sur la plage nocturne. */
  nightDim: boolean;
  /** Gradation automatique quand la batterie est basse et l'appareil non branché. */
  batterySaver: boolean;
  /**
   * Mode kiosque : l'écran ignore les appuis. Volontairement non persisté, pour ne
   * jamais rouvrir l'écran sur une interface qui semble figée.
   */
  touchLocked: boolean;
  hydrated: boolean;
  setOrientationLock: (lock: OrientationLock) => void;
  cycleDim: () => void;
  toggleAntiBurnIn: () => void;
  setPreset: (preset: AlwaysOnPreset) => void;
  stepPreset: (direction: 1 | -1) => void;
  setFocusTwitch: (twitch: string | null) => void;
  cycleRotation: () => void;
  toggleNightDim: () => void;
  toggleBatterySaver: () => void;
  setTouchLocked: (locked: boolean) => void;
}

export const useAlwaysOnStore = create<AlwaysOnState>()(
  persist(
    (set, get) => ({
      orientationLock: 'auto',
      dimLevel: 0,
      antiBurnIn: true,
      preset: 'overview',
      focusTwitch: null,
      rotationSeconds: 0,
      nightDim: false,
      batterySaver: true,
      touchLocked: false,
      hydrated: false,
      setOrientationLock: (orientationLock) => set({ orientationLock }),
      cycleDim: () => set({ dimLevel: (get().dimLevel + 1) % DIM_STEP_COUNT }),
      toggleAntiBurnIn: () => set({ antiBurnIn: !get().antiBurnIn }),
      setPreset: (preset) => set({ preset }),
      stepPreset: (direction) => {
        const index = PRESET_CYCLE.indexOf(get().preset);
        const next = (index + direction + PRESET_CYCLE.length) % PRESET_CYCLE.length;
        set({ preset: PRESET_CYCLE[next] });
      },
      setFocusTwitch: (twitch) => set({ focusTwitch: twitch ? twitch.toLowerCase() : null }),
      cycleRotation: () => {
        const index = ROTATION_OPTIONS.indexOf(
          get().rotationSeconds as (typeof ROTATION_OPTIONS)[number],
        );
        const next = (index + 1) % ROTATION_OPTIONS.length;
        set({ rotationSeconds: ROTATION_OPTIONS[next] });
      },
      toggleNightDim: () => set({ nightDim: !get().nightDim }),
      toggleBatterySaver: () => set({ batterySaver: !get().batterySaver }),
      setTouchLocked: (touchLocked) => set({ touchLocked }),
    }),
    {
      name: 'always-on',
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        orientationLock: state.orientationLock,
        dimLevel: state.dimLevel,
        antiBurnIn: state.antiBurnIn,
        preset: state.preset,
        focusTwitch: state.focusTwitch,
        rotationSeconds: state.rotationSeconds,
        nightDim: state.nightDim,
        batterySaver: state.batterySaver,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
