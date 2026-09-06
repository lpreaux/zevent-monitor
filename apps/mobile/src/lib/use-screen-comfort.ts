/**
 * Prise en main du matériel pour l'écran secondaire : luminosité réelle et batterie.
 *
 * Les deux modules natifs sont chargés paresseusement et toute erreur est absorbée :
 * sur le web, ou sur un dev client construit avant leur ajout, l'écran continue de
 * fonctionner en repli logiciel (voile de gradation seul, pas d'indicateur de batterie).
 */

import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type BrightnessModule = typeof import('expo-brightness');
type BatteryModule = typeof import('expo-battery');

let brightnessModule: Promise<BrightnessModule | null> | null = null;
let batteryModule: Promise<BatteryModule | null> | null = null;

function loadBrightness(): Promise<BrightnessModule | null> {
  brightnessModule ??= import('expo-brightness').catch(() => null);
  return brightnessModule;
}

function loadBattery(): Promise<BatteryModule | null> {
  batteryModule ??= import('expo-battery').catch(() => null);
  return batteryModule;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Applique `target` à la luminosité de la fenêtre applicative et rend `true` quand le
 * pilotage est effectif. La luminosité système est restaurée au démontage de l'écran :
 * une gradation nocturne ne doit pas survivre à la sortie du mode AlwaysOn.
 */
export function useAppBrightness(target: number | null): boolean {
  const [supported, setSupported] = useState(false);
  const applied = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void loadBrightness().then(async (module) => {
      if (!module || cancelled) return;
      try {
        const available = await module.isAvailableAsync();
        if (!cancelled) setSupported(available);
      } catch {
        // Module présent mais plateforme sans pilotage : on reste en repli logiciel.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    // `target` à `null` = ne pas confisquer la luminosité système : on la rend dès que
    // l'utilisateur revient au palier « plein écran ».
    if (target == null) {
      if (!applied.current) return;
      applied.current = false;
      void loadBrightness().then((module) => module?.restoreSystemBrightnessAsync());
      return;
    }
    applied.current = true;
    void loadBrightness().then((module) => module?.setBrightnessAsync(clamp01(target)));
  }, [supported, target]);

  useEffect(
    () => () => {
      if (!applied.current) return;
      void loadBrightness().then((module) => module?.restoreSystemBrightnessAsync());
    },
    [],
  );

  return supported;
}

export interface BatteryStatus {
  /** Charge restante dans `[0, 1]`, `null` tant qu'elle est inconnue. */
  level: number | null;
  charging: boolean;
  supported: boolean;
}

const UNKNOWN_BATTERY: BatteryStatus = { level: null, charging: false, supported: false };

/**
 * Niveau de batterie et état de charge, suivis en direct. L'abonnement est indépendant
 * du réglage d'économie : l'indicateur, et donc le bouton qui le pilote, doivent rester
 * visibles même quand l'économie est désactivée.
 */
export function useBatteryStatus(): BatteryStatus {
  const [status, setStatus] = useState<BatteryStatus>(UNKNOWN_BATTERY);

  useEffect(() => {
    let cancelled = false;
    const subscriptions: { remove: () => void }[] = [];

    void loadBattery().then(async (module) => {
      if (!module || cancelled) return;
      const isCharging = (state: number) =>
        state === module.BatteryState.CHARGING || state === module.BatteryState.FULL;
      try {
        if (!(await module.isAvailableAsync())) return;
        const power = await module.getPowerStateAsync();
        if (cancelled) return;
        setStatus({
          level: power.batteryLevel,
          charging: isCharging(power.batteryState),
          supported: true,
        });
        subscriptions.push(
          module.addBatteryLevelListener(({ batteryLevel }) =>
            setStatus((previous) => ({ ...previous, level: batteryLevel, supported: true })),
          ),
          module.addBatteryStateListener(({ batteryState }) =>
            setStatus((previous) => ({
              ...previous,
              charging: isCharging(batteryState),
              supported: true,
            })),
          ),
        );
      } catch {
        // Batterie non lisible (émulateur, web) : l'indicateur reste masqué.
      }
    });

    return () => {
      cancelled = true;
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);

  return status;
}
