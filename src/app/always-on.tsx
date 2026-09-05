import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';

import { usePlanning, useStreamerGoals, useTimeseries2026, useZeventState } from '@/api/queries';
import type { Streamer } from '@/api/types';
import { AlwaysOnFavoriteRow } from '@/components/always-on-favorite-row';
import { AlwaysOnFocusCard } from '@/components/always-on-focus-card';
import { AlwaysOnMilestone } from '@/components/always-on-milestone';
import { AlwaysOnPlanningRow } from '@/components/always-on-planning-row';
import { AnimatedEuros } from '@/components/animated-euros';
import { LoadingState } from '@/components/screen-state';
import {
  dimBrightness,
  dimOpacity,
  effectiveDimLevel,
  isNightDimActive,
  shouldBatterySave,
} from '@/lib/always-on-comfort';
import {
  entriesForStreamer,
  nextGoalProgress,
  orderFavorites,
  planningFocus,
  resolveFocus,
  stepFocus,
  streamerStanding,
} from '@/lib/always-on-focus';
import {
  computeAlwaysOnLayout,
  CYCLE_STEP_MS,
  resolvePreset,
  type ResolvedPreset,
} from '@/lib/always-on-layout';
import { formatCount, formatEuros, formatPercent, formatRelativeTime } from '@/lib/format';
import { currentAndUpcoming } from '@/lib/planning';
import { recentDeltaEur, toElapsedSeries, type RawPoint } from '@/lib/timeseries';
import { useAppBrightness, useBatteryStatus } from '@/lib/use-screen-comfort';
import { useAlwaysOnStore, type AlwaysOnPreset, type OrientationLock } from '@/store/always-on';
import { useFavoritesStore } from '@/store/favorites';

/** Fenêtre de progression affichée sous la cagnotte. */
const DELTA_WINDOW_MINUTES = 60;

/** Durée d'un aller anti burn-in : assez lent pour être imperceptible. */
const BURN_IN_CYCLE_MS = 90_000;

/** Délai avant masquage automatique des contrôles. */
const CONTROLS_TIMEOUT_MS = 6_000;

/** Deux appuis rapprochés changent de disposition. */
const DOUBLE_TAP_MS = 320;

/** Un balayage plus court est probablement un appui qui a glissé. */
const SWIPE_THRESHOLD_PX = 40;

const ORIENTATION_CYCLE: OrientationLock[] = ['auto', 'landscape', 'portrait'];

const ORIENTATION_META: Record<
  OrientationLock,
  { icon: 'sync' | 'tablet-landscape' | 'tablet-portrait'; label: string }
> = {
  auto: { icon: 'sync', label: 'Rotation libre' },
  landscape: { icon: 'tablet-landscape', label: 'Paysage verrouillé' },
  portrait: { icon: 'tablet-portrait', label: 'Portrait verrouillé' },
};

const PRESET_META: Record<
  AlwaysOnPreset,
  { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }
> = {
  overview: { icon: 'apps', label: 'Vue d’ensemble' },
  amount: { icon: 'cash', label: 'Cagnotte XXL' },
  focus: { icon: 'person', label: 'Focus streamer' },
  planning: { icon: 'calendar', label: 'Planning' },
  cycle: { icon: 'shuffle', label: 'Cycle auto' },
};

/** Tag du verrou d'écran, pour ne relâcher que celui posé par cet écran. */
const KEEP_AWAKE_TAG = 'zevent-always-on';

/**
 * Maintient l'écran allumé pendant l'écran secondaire. On n'utilise pas `useKeepAwake`
 * car son échec (Wake Lock refusée quand la page n'a pas le focus, sur web) remonte en
 * rejet non capturé ; ici l'écran continue de fonctionner sans veille prolongée.
 */
function useAlwaysOnKeepAwake() {
  useEffect(() => {
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // Verrou jamais posé : rien à relâcher.
      }
    };
  }, []);
}

/** Verrouille l'orientation le temps de l'écran, puis la relâche au démontage. */
function useOrientationLock(lock: OrientationLock) {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const apply = async () => {
      try {
        if (lock === 'landscape') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
        } else if (lock === 'portrait') {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } else {
          await ScreenOrientation.unlockAsync();
        }
      } catch {
        // Certains appareils refusent le verrouillage : on reste en rotation libre.
      }
    };
    void apply();

    return () => {
      // Critère d'acceptation : le paysage ne doit jamais être forcé sur les autres écrans.
      void ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [lock]);
}

/**
 * Instant courant, rafraîchi toutes les 20 s : il pilote à la fois l'horloge, les
 * comptes à rebours du planning et la détection de la plage nocturne.
 */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Heure locale `HH:MM`. */
function formatClock(now: number): string {
  const date = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ControlButton({
  icon,
  label,
  active,
  compact,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  active?: boolean;
  /** Écran étroit : icône seule, le libellé reste dans l'étiquette d'accessibilité. */
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`flex-row items-center gap-2 rounded-full px-3.5 py-2 active:opacity-70 ${
        active ? 'bg-zevent-500/25' : 'bg-gray-900'
      }`}
    >
      <Ionicons name={icon} size={16} color={active ? '#c4b5fd' : '#9ca3af'} />
      {compact ? null : (
        <Text className={`text-xs font-semibold ${active ? 'text-zevent-200' : 'text-gray-400'}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export default function AlwaysOnScreen() {
  useAlwaysOnKeepAwake();

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const now = useNow();

  const stateQuery = useZeventState();
  const timeseriesQuery = useTimeseries2026('10m');
  const planningResult = usePlanning();
  const favorites = useFavoritesStore((s) => s.favorites);

  const orientationLock = useAlwaysOnStore((s) => s.orientationLock);
  const setOrientationLock = useAlwaysOnStore((s) => s.setOrientationLock);
  const dimLevel = useAlwaysOnStore((s) => s.dimLevel);
  const cycleDim = useAlwaysOnStore((s) => s.cycleDim);
  const antiBurnIn = useAlwaysOnStore((s) => s.antiBurnIn);
  const toggleAntiBurnIn = useAlwaysOnStore((s) => s.toggleAntiBurnIn);
  const preset = useAlwaysOnStore((s) => s.preset);
  const setPreset = useAlwaysOnStore((s) => s.setPreset);
  const stepPreset = useAlwaysOnStore((s) => s.stepPreset);
  const focusTwitch = useAlwaysOnStore((s) => s.focusTwitch);
  const setFocusTwitch = useAlwaysOnStore((s) => s.setFocusTwitch);
  const rotationSeconds = useAlwaysOnStore((s) => s.rotationSeconds);
  const cycleRotation = useAlwaysOnStore((s) => s.cycleRotation);
  const nightDim = useAlwaysOnStore((s) => s.nightDim);
  const toggleNightDim = useAlwaysOnStore((s) => s.toggleNightDim);
  const batterySaver = useAlwaysOnStore((s) => s.batterySaver);
  const toggleBatterySaver = useAlwaysOnStore((s) => s.toggleBatterySaver);
  const touchLocked = useAlwaysOnStore((s) => s.touchLocked);
  const setTouchLocked = useAlwaysOnStore((s) => s.setTouchLocked);

  useOrientationLock(orientationLock);

  const [controlsVisible, setControlsVisible] = useState(true);
  const [lockHintVisible, setLockHintVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const exit = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const state = stateQuery.data?.data;

  // Ordre commun à la liste des favoris et à la rotation du mode Focus : les lives
  // d'abord, puis par cagnotte décroissante.
  const order = useMemo<Streamer[]>(
    () => orderFavorites(state?.live ?? [], favorites),
    [state, favorites],
  );
  const focusStreamer = useMemo(() => resolveFocus(order, focusTwitch), [order, focusTwitch]);

  // Le mode `cycle` change de disposition toutes les 30 s : on ne garde qu'un compteur,
  // la disposition elle-même est dérivée par `resolvePreset`. Le compteur n'est jamais
  // remis à zéro — hors mode cycle il est ignoré, et y revenir reprend simplement la
  // rotation là où elle s'était arrêtée.
  const [cycleElapsed, setCycleElapsed] = useState(0);
  useEffect(() => {
    if (preset !== 'cycle') return;
    const id = setInterval(() => setCycleElapsed((ms) => ms + CYCLE_STEP_MS), CYCLE_STEP_MS);
    return () => clearInterval(id);
  }, [preset]);

  const resolved: ResolvedPreset = resolvePreset(preset, cycleElapsed, {
    hasFocus: Boolean(focusStreamer),
  });

  // `order` est reconstruit à chaque rafraîchissement de l'état (15 s) : le lire dans une
  // référence évite de relancer l'intervalle de rotation avant qu'il ait pu se déclencher.
  const orderRef = useRef(order);
  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  // Rotation automatique entre favoris, uniquement quand le Focus est à l'écran.
  useEffect(() => {
    if (rotationSeconds <= 0 || resolved !== 'focus') return;
    const id = setInterval(() => {
      const rotation = orderRef.current;
      if (rotation.length < 2) return;
      setFocusTwitch(stepFocus(rotation, useAlwaysOnStore.getState().focusTwitch, 1));
    }, rotationSeconds * 1000);
    return () => clearInterval(id);
  }, [rotationSeconds, resolved, setFocusTwitch]);

  const goalsResult = useStreamerGoals(focusStreamer?.twitch);

  const planningEntries = useMemo(
    () => currentAndUpcoming(planningResult.entries, now),
    [planningResult.entries, now],
  );

  // En mode Focus la colonne latérale montre les autres favoris : répéter celui déjà
  // affiché en grand ne servirait à rien.
  const listFavorites = useMemo(() => {
    if (resolved !== 'focus' || !focusStreamer) return order;
    return order.filter((s) => s.twitch_id !== focusStreamer.twitch_id);
  }, [order, resolved, focusStreamer]);

  const layout = useMemo(
    () =>
      computeAlwaysOnLayout({
        width,
        height,
        insets,
        preset: resolved,
        favoriteCount: listFavorites.length,
        planningCount: planningEntries.length,
      }),
    [width, height, insets, resolved, listFavorites.length, planningEntries.length],
  );

  const delta = useMemo(() => {
    const raw: RawPoint[] = (timeseriesQuery.data?.points ?? []).map((point) => ({
      t: Date.parse(point.bucket),
      eur: Number(point.donation_cents) / 100,
    }));
    const elapsed = toElapsedSeries(raw);
    return recentDeltaEur(elapsed.points, DELTA_WINDOW_MINUTES, state?.donationAmount.number);
  }, [timeseriesQuery.data, state]);

  // Gradation : le réglage manuel, relevé au minimum par la nuit automatique et par
  // l'économie de batterie. La luminosité réelle est pilotée en priorité, le voile noir
  // ne prend le relais qu'en dessous du plancher matériel (ou faute de module natif).
  const battery = useBatteryStatus();
  const batterySaving = batterySaver && shouldBatterySave(battery.level, battery.charging);
  const nightActive = nightDim && isNightDimActive(new Date(now));
  const activeDimLevel = effectiveDimLevel(dimLevel, {
    night: nightActive,
    battery: batterySaving,
  });
  const brightnessSupported = useAppBrightness(
    activeDimLevel > 0 ? dimBrightness(activeDimLevel) : null,
  );
  const veilOpacity = dimOpacity(activeDimLevel, brightnessSupported);

  // Déplacement lent en figure de Lissajous : aucun pixel ne reste fixe longtemps.
  const phase = useSharedValue(0);
  useEffect(() => {
    if (!antiBurnIn) {
      phase.value = withTiming(0, { duration: 400 });
      return;
    }
    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: BURN_IN_CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [antiBurnIn, phase]);

  const amplitude = layout.burnInAmplitude;
  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.sin(phase.value * Math.PI * 2) * amplitude },
      { translateY: Math.cos(phase.value * Math.PI * 2 * 0.6) * amplitude },
    ],
  }));

  const handlePress = useCallback(() => {
    const at = Date.now();
    const isDoubleTap = at - lastTapAt.current < DOUBLE_TAP_MS;
    lastTapAt.current = at;

    if (touchLocked) {
      setLockHintVisible(true);
      setTimeout(() => setLockHintVisible(false), 2_000);
      return;
    }
    if (isDoubleTap) stepPreset(1);
    revealControls();
  }, [touchLocked, stepPreset, revealControls]);

  const handleLongPress = useCallback(() => {
    if (touchLocked) {
      setTouchLocked(false);
      setLockHintVisible(false);
      revealControls();
      return;
    }
    exit();
  }, [touchLocked, setTouchLocked, revealControls, exit]);

  // Balayage horizontal : favori suivant en mode Focus, disposition suivante ailleurs.
  const handleSwipe = useCallback(
    (direction: 1 | -1) => {
      if (touchLocked) return;
      if (resolved === 'focus' && order.length > 1) {
        setFocusTwitch(stepFocus(order, focusStreamer?.twitch ?? null, direction));
      } else {
        stepPreset(direction);
      }
      revealControls();
    },
    [touchLocked, resolved, order, focusStreamer, setFocusTwitch, stepPreset, revealControls],
  );

  // Négociation du responder à la main plutôt qu'avec `PanResponder` : il faut capturer
  // le geste *avant* le `Pressable` enfant, ce que seule la phase de capture permet.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const recordTouchStart = useCallback((event: GestureResponderEvent) => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    return false;
  }, []);

  const shouldCaptureSwipe = useCallback((event: GestureResponderEvent) => {
    const start = touchStart.current;
    if (!start) return false;
    const dx = event.nativeEvent.pageX - start.x;
    const dy = event.nativeEvent.pageY - start.y;
    return Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.5;
  }, []);

  const releaseSwipe = useCallback(
    (event: GestureResponderEvent) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const dx = event.nativeEvent.pageX - start.x;
      if (Math.abs(dx) > SWIPE_THRESHOLD_PX) handleSwipe(dx < 0 ? 1 : -1);
    },
    [handleSwipe],
  );

  if (!state) {
    return (
      <View className="flex-1 bg-black">
        <StatusBar hidden />
        <LoadingState label="Écran secondaire — connexion…" />
      </View>
    );
  }

  // Sous 480 px de large, les libellés des contrôles passeraient à la ligne sur le contenu.
  const compactControls = width < 480;
  const liveCount = state.live.filter((s) => s.online).length;
  const stale = stateQuery.data?.source.stale ?? false;
  const visibleFavorites = listFavorites.slice(0, layout.favoriteSlots);
  const visiblePlanning = planningEntries.slice(0, layout.planningSlots);
  const deltaLabel =
    delta == null
      ? '— dernière heure'
      : `${delta >= 0 ? '+' : '−'}${formatEuros(Math.abs(delta))} en 1 h`;

  const statsBlock = (
    <View className="flex-row flex-wrap gap-x-6 gap-y-1">
      <View>
        <Text
          style={{ fontSize: layout.captionFontSize }}
          className="uppercase tracking-widest text-gray-600"
        >
          Viewers
        </Text>
        <Text
          style={{ fontSize: layout.statValueFontSize }}
          className="font-bold text-gray-200"
        >
          {formatCount(state.viewersCount.number)}
        </Text>
      </View>
      <View>
        <Text
          style={{ fontSize: layout.captionFontSize }}
          className="uppercase tracking-widest text-gray-600"
        >
          En live
        </Text>
        <Text
          style={{ fontSize: layout.statValueFontSize }}
          className="font-bold text-gray-200"
        >
          {formatCount(liveCount)}
          <Text
            style={{ fontSize: layout.captionFontSize }}
            className="font-normal text-gray-600"
          >
            {` / ${state.live.length}`}
          </Text>
        </Text>
      </View>
      <View>
        <Text
          style={{ fontSize: layout.captionFontSize }}
          className="uppercase tracking-widest text-gray-600"
        >
          Heure
        </Text>
        <Text
          style={{ fontSize: layout.statValueFontSize }}
          className="font-bold text-gray-200"
        >
          {formatClock(now)}
        </Text>
      </View>
    </View>
  );

  const favoritesBlock =
    visibleFavorites.length > 0 ? (
      <View
        className={layout.twoColumns ? 'flex-1' : ''}
        style={{ width: layout.sideWidth || undefined }}
      >
        <Text
          style={{ fontSize: layout.captionFontSize }}
          className="mb-1 uppercase tracking-widest text-gray-600"
        >
          {resolved === 'focus' ? 'Autres favoris' : 'Favoris'}
        </Text>
        {visibleFavorites.map((streamer) => (
          <Pressable
            key={streamer.twitch_id}
            accessibilityRole="button"
            accessibilityLabel={`Mettre ${streamer.display} en focus`}
            onPress={() => {
              if (touchLocked) return;
              setFocusTwitch(streamer.twitch);
              // Depuis une autre disposition, épingler sans basculer ne montrerait rien.
              if (preset !== 'focus' && preset !== 'cycle') setPreset('focus');
              revealControls();
            }}
          >
            <AlwaysOnFavoriteRow
              streamer={streamer}
              valueFontSize={layout.statValueFontSize}
              captionFontSize={layout.captionFontSize}
            />
          </Pressable>
        ))}
      </View>
    ) : null;

  const planningBlock =
    visiblePlanning.length > 0 ? (
      <View
        className={layout.twoColumns ? 'flex-1' : ''}
        style={{ width: layout.sideWidth || undefined }}
      >
        <Text
          style={{ fontSize: layout.captionFontSize }}
          className="mb-1 uppercase tracking-widest text-gray-600"
        >
          Au programme
        </Text>
        {visiblePlanning.map((entry) => (
          <AlwaysOnPlanningRow
            key={entry.id}
            entry={entry}
            now={now}
            captionFontSize={layout.captionFontSize}
            valueFontSize={layout.statValueFontSize}
          />
        ))}
      </View>
    ) : null;

  const globalBlock = (
    <>
      <Text
        style={{ fontSize: layout.captionFontSize }}
        className="uppercase tracking-widest text-zevent-400"
      >
        ZEvent 2026 — cagnotte globale
      </Text>
      <AnimatedEuros
        value={state.donationAmount.number}
        style={{ fontSize: layout.amountFontSize, marginTop: 4 }}
      />
      <Text
        style={{ fontSize: layout.deltaFontSize }}
        className={`font-semibold ${
          delta == null ? 'text-gray-600' : delta >= 0 ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {deltaLabel}
      </Text>
      {layout.showMilestone ? (
        <View className="mt-3">
          <AlwaysOnMilestone
            amountEuros={state.donationAmount.number}
            eurPerHour={delta}
            captionFontSize={layout.captionFontSize}
            valueFontSize={layout.statValueFontSize}
          />
        </View>
      ) : null}
      {layout.showStats ? <View className="mt-3">{statsBlock}</View> : null}
    </>
  );

  const focusBlock = focusStreamer ? (
    <>
      <AlwaysOnFocusCard
        streamer={focusStreamer}
        standing={streamerStanding(state.live, focusStreamer, state.donationAmount.number)}
        goal={nextGoalProgress(goalsResult.goals, focusStreamer.donationAmount.number)}
        planning={planningFocus(
          entriesForStreamer(planningResult.entries, focusStreamer.twitch),
          now,
        )}
        now={now}
        amountFontSize={layout.amountFontSize}
        deltaFontSize={layout.deltaFontSize}
        statValueFontSize={layout.statValueFontSize}
        captionFontSize={layout.captionFontSize}
        avatarSize={layout.focusAvatarSize}
      />
      {/* La cagnotte globale ne disparaît jamais : c'est l'information de référence. */}
      <Text
        style={{ fontSize: layout.captionFontSize }}
        className="mt-3 uppercase tracking-widest text-gray-600"
      >
        Cagnotte globale
      </Text>
      <Text
        style={{ fontSize: layout.statValueFontSize }}
        className="font-bold text-gray-300"
      >
        {formatEuros(state.donationAmount.number)}
        <Text
          style={{ fontSize: layout.captionFontSize }}
          className={`font-normal ${delta == null ? 'text-gray-600' : 'text-emerald-500'}`}
        >
          {`  ${deltaLabel}`}
        </Text>
      </Text>
    </>
  ) : null;

  const mainBlock = (
    <View
      style={{ width: layout.twoColumns ? layout.mainWidth : undefined }}
      className="justify-center"
    >
      {resolved === 'focus' && focusBlock ? focusBlock : globalBlock}
    </View>
  );

  const sideBlock = resolved === 'planning' ? planningBlock : favoritesBlock;

  return (
    <View
      className="flex-1 bg-black"
      onStartShouldSetResponderCapture={recordTouchStart}
      onMoveShouldSetResponderCapture={shouldCaptureSwipe}
      onResponderRelease={releaseSwipe}
    >
      <StatusBar hidden />

      <Pressable
        className="flex-1"
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={touchLocked ? 1_200 : 900}
        accessibilityLabel={
          touchLocked ? 'Écran verrouillé, appui long pour déverrouiller' : 'Afficher les contrôles'
        }
      >
        <Animated.View
          style={[
            driftStyle,
            {
              flex: 1,
              paddingTop: insets.top + layout.paddingV,
              paddingBottom: insets.bottom + layout.paddingV,
              paddingLeft: insets.left + layout.paddingH,
              paddingRight: insets.right + layout.paddingH,
            },
          ]}
        >
          {layout.twoColumns ? (
            <View className="flex-1 flex-row items-center gap-6">
              {mainBlock}
              {sideBlock}
            </View>
          ) : (
            <View className="flex-1 justify-center gap-4">
              {mainBlock}
              {sideBlock}
            </View>
          )}

          <View className="flex-row items-center gap-2">
            <View
              className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-amber-500' : 'bg-emerald-600'}`}
            />
            <Text style={{ fontSize: layout.captionFontSize }} className="flex-1 text-gray-700">
              {stale
                ? `Dernier état connu ${formatRelativeTime(stateQuery.data?.source.fetchedAt)}`
                : `À jour ${formatRelativeTime(stateQuery.data?.source.fetchedAt)}`}
            </Text>
            {battery.supported && battery.level != null ? (
              <Text style={{ fontSize: layout.captionFontSize }} className="text-gray-700">
                {`${formatPercent(battery.level)}${battery.charging ? ' ⚡' : ''}`}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>

      {/* Gradation logicielle : voile noir au-dessus du contenu, sous les contrôles. */}
      {veilOpacity > 0 ? (
        <View
          pointerEvents="none"
          style={{ opacity: veilOpacity }}
          className="absolute inset-0 bg-black"
        />
      ) : null}

      {touchLocked ? (
        lockHintVisible ? (
          <View
            pointerEvents="none"
            className="absolute items-center"
            style={{ left: insets.left + 12, right: insets.right + 12, bottom: insets.bottom + 12 }}
          >
            <Text style={{ fontSize: layout.captionFontSize }} className="text-gray-500">
              Écran verrouillé — appui long pour déverrouiller
            </Text>
          </View>
        ) : null
      ) : controlsVisible ? (
        <View
          className="absolute items-center gap-2"
          style={{ left: insets.left + 12, right: insets.right + 12, bottom: insets.bottom + 12 }}
        >
          <Text
            style={{ fontSize: layout.captionFontSize }}
            className="text-center text-gray-700"
          >
            {resolved === 'focus'
              ? 'Balayer : favori suivant · Double tap : disposition · Appui long : quitter'
              : 'Balayer : disposition · Double tap : disposition · Appui long : quitter'}
          </Text>
          <View className="flex-row flex-wrap items-center justify-center gap-2">
            <ControlButton icon="close" label="Quitter" compact={compactControls} onPress={exit} />
            <ControlButton
              icon={PRESET_META[preset].icon}
              label={PRESET_META[preset].label}
              active={preset !== 'overview'}
              compact={compactControls}
              onPress={() => {
                stepPreset(1);
                revealControls();
              }}
            />
            <ControlButton
              icon="repeat"
              label={rotationSeconds > 0 ? `Rotation ${rotationSeconds} s` : 'Rotation'}
              active={rotationSeconds > 0}
              compact={compactControls}
              onPress={() => {
                cycleRotation();
                revealControls();
              }}
            />
            <ControlButton
              icon={ORIENTATION_META[orientationLock].icon}
              label={ORIENTATION_META[orientationLock].label}
              active={orientationLock !== 'auto'}
              compact={compactControls}
              onPress={() => {
                const next =
                  ORIENTATION_CYCLE[
                    (ORIENTATION_CYCLE.indexOf(orientationLock) + 1) % ORIENTATION_CYCLE.length
                  ];
                setOrientationLock(next);
                revealControls();
              }}
            />
            <ControlButton
              icon="moon"
              label={dimLevel === 0 ? 'Luminosité' : `Assombri ${dimLevel}/3`}
              active={dimLevel > 0}
              compact={compactControls}
              onPress={() => {
                cycleDim();
                revealControls();
              }}
            />
            <ControlButton
              icon="moon-outline"
              label={nightActive ? 'Nuit auto (active)' : 'Nuit auto'}
              active={nightDim}
              compact={compactControls}
              onPress={() => {
                toggleNightDim();
                revealControls();
              }}
            />
            {battery.supported ? (
              <ControlButton
                icon="battery-half"
                label={batterySaving ? 'Éco batterie (active)' : 'Éco batterie'}
                active={batterySaver}
                compact={compactControls}
                onPress={() => {
                  toggleBatterySaver();
                  revealControls();
                }}
              />
            ) : null}
            <ControlButton
              icon="move"
              label={antiBurnIn ? 'Anti burn-in' : 'Fixe'}
              active={antiBurnIn}
              compact={compactControls}
              onPress={() => {
                toggleAntiBurnIn();
                revealControls();
              }}
            />
            <ControlButton
              icon="lock-closed"
              label="Verrouiller l’écran"
              compact={compactControls}
              onPress={() => {
                setTouchLocked(true);
                setControlsVisible(false);
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
