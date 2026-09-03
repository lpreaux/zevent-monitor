import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
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

import { useTimeseries2026, useZeventState } from '@/api/queries';
import type { Streamer } from '@/api/types';
import { AlwaysOnFavoriteRow } from '@/components/always-on-favorite-row';
import { AnimatedEuros } from '@/components/animated-euros';
import { LoadingState } from '@/components/screen-state';
import { computeAlwaysOnLayout } from '@/lib/always-on-layout';
import { formatCount, formatEuros, formatRelativeTime } from '@/lib/format';
import { recentDeltaEur, toElapsedSeries, type RawPoint } from '@/lib/timeseries';
import { dimOpacity, useAlwaysOnStore, type OrientationLock } from '@/store/always-on';
import { useFavoritesStore } from '@/store/favorites';

/** Fenêtre de progression affichée sous la cagnotte. */
const DELTA_WINDOW_MINUTES = 60;

/** Durée d'un aller anti burn-in : assez lent pour être imperceptible. */
const BURN_IN_CYCLE_MS = 90_000;

/** Délai avant masquage automatique des contrôles. */
const CONTROLS_TIMEOUT_MS = 6_000;

const ORIENTATION_CYCLE: OrientationLock[] = ['auto', 'landscape', 'portrait'];

const ORIENTATION_META: Record<OrientationLock, { icon: 'sync' | 'tablet-landscape' | 'tablet-portrait'; label: string }> = {
  auto: { icon: 'sync', label: 'Rotation libre' },
  landscape: { icon: 'tablet-landscape', label: 'Paysage verrouillé' },
  portrait: { icon: 'tablet-portrait', label: 'Portrait verrouillé' },
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

/** Heure locale `HH:MM`, rafraîchie toutes les 20 s. */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
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
  const clock = useClock();

  const stateQuery = useZeventState();
  const timeseriesQuery = useTimeseries2026('10m');
  const favorites = useFavoritesStore((s) => s.favorites);

  const orientationLock = useAlwaysOnStore((s) => s.orientationLock);
  const setOrientationLock = useAlwaysOnStore((s) => s.setOrientationLock);
  const dimLevel = useAlwaysOnStore((s) => s.dimLevel);
  const cycleDim = useAlwaysOnStore((s) => s.cycleDim);
  const antiBurnIn = useAlwaysOnStore((s) => s.antiBurnIn);
  const toggleAntiBurnIn = useAlwaysOnStore((s) => s.toggleAntiBurnIn);

  useOrientationLock(orientationLock);

  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const state = stateQuery.data?.data;

  const favoriteStreamers = useMemo<Streamer[]>(() => {
    if (!state) return [];
    const set = new Set(favorites);
    return state.live
      .filter((s) => set.has(s.twitch.toLowerCase()))
      .sort((a, b) => b.donationAmount.number - a.donationAmount.number);
  }, [state, favorites]);

  const layout = useMemo(
    () =>
      computeAlwaysOnLayout({
        width,
        height,
        insets,
        favoriteCount: favoriteStreamers.length,
      }),
    [width, height, insets, favoriteStreamers.length],
  );

  const delta = useMemo(() => {
    const raw: RawPoint[] = (timeseriesQuery.data?.points ?? []).map((point) => ({
      t: Date.parse(point.bucket),
      eur: Number(point.donation_cents) / 100,
    }));
    const elapsed = toElapsedSeries(raw);
    return recentDeltaEur(elapsed.points, DELTA_WINDOW_MINUTES, state?.donationAmount.number);
  }, [timeseriesQuery.data, state]);

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

  if (!state) {
    return (
      <View className="flex-1 bg-black">
        <StatusBar hidden />
        <LoadingState label="Écran secondaire — connexion…" />
      </View>
    );
  }

  // Sous 480 px de large, les quatre libellés passeraient à la ligne sur le contenu.
  const compactControls = width < 480;
  const liveCount = state.live.filter((s) => s.online).length;
  const stale = stateQuery.data?.source.stale ?? false;
  const visibleFavorites = favoriteStreamers.slice(0, layout.favoriteSlots);

  const statsBlock = (
    <View className="flex-row flex-wrap gap-x-6 gap-y-1">
      <View>
        <Text style={{ fontSize: layout.captionFontSize }} className="uppercase tracking-widest text-gray-600">
          Viewers
        </Text>
        <Text style={{ fontSize: layout.statValueFontSize }} className="font-bold text-gray-200">
          {formatCount(state.viewersCount.number)}
        </Text>
      </View>
      <View>
        <Text style={{ fontSize: layout.captionFontSize }} className="uppercase tracking-widest text-gray-600">
          En live
        </Text>
        <Text style={{ fontSize: layout.statValueFontSize }} className="font-bold text-gray-200">
          {formatCount(liveCount)}
          <Text style={{ fontSize: layout.captionFontSize }} className="font-normal text-gray-600">
            {` / ${state.live.length}`}
          </Text>
        </Text>
      </View>
      <View>
        <Text style={{ fontSize: layout.captionFontSize }} className="uppercase tracking-widest text-gray-600">
          Heure
        </Text>
        <Text style={{ fontSize: layout.statValueFontSize }} className="font-bold text-gray-200">
          {clock}
        </Text>
      </View>
    </View>
  );

  const favoritesBlock =
    visibleFavorites.length > 0 ? (
      <View className={layout.twoColumns ? 'flex-1' : ''} style={{ width: layout.sideWidth || undefined }}>
        <Text
          style={{ fontSize: layout.captionFontSize }}
          className="mb-1 uppercase tracking-widest text-gray-600"
        >
          Favoris
        </Text>
        {visibleFavorites.map((streamer) => (
          <AlwaysOnFavoriteRow
            key={streamer.twitch_id}
            streamer={streamer}
            valueFontSize={layout.statValueFontSize}
            captionFontSize={layout.captionFontSize}
          />
        ))}
      </View>
    ) : null;

  const mainBlock = (
    <View style={{ width: layout.twoColumns ? layout.mainWidth : undefined }} className="justify-center">
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
        className={`font-semibold ${delta == null ? 'text-gray-600' : delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
      >
        {delta == null
          ? '— dernière heure'
          : `${delta >= 0 ? '+' : '−'}${formatEuros(Math.abs(delta))} en 1 h`}
      </Text>
      <View className="mt-3">{statsBlock}</View>
    </View>
  );

  return (
    <View className="flex-1 bg-black">
      <StatusBar hidden />

      <Pressable className="flex-1" onPress={revealControls} accessibilityLabel="Afficher les contrôles">
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
              {favoritesBlock}
            </View>
          ) : (
            <View className="flex-1 justify-center gap-4">
              {mainBlock}
              {favoritesBlock}
            </View>
          )}

          <View className="flex-row items-center gap-2">
            <View className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-amber-500' : 'bg-emerald-600'}`} />
            <Text style={{ fontSize: layout.captionFontSize }} className="text-gray-700">
              {stale
                ? `Dernier état connu ${formatRelativeTime(stateQuery.data?.source.fetchedAt)}`
                : `À jour ${formatRelativeTime(stateQuery.data?.source.fetchedAt)}`}
            </Text>
          </View>
        </Animated.View>
      </Pressable>

      {/* Gradation logicielle : voile noir au-dessus du contenu, sous les contrôles. */}
      {dimOpacity(dimLevel) > 0 ? (
        <View
          pointerEvents="none"
          style={{ opacity: dimOpacity(dimLevel) }}
          className="absolute inset-0 bg-black"
        />
      ) : null}

      {controlsVisible ? (
        <View
          className="absolute flex-row flex-wrap items-center justify-center gap-2"
          style={{
            left: insets.left + 12,
            right: insets.right + 12,
            bottom: insets.bottom + 12,
          }}
        >
          <ControlButton
            icon="close"
            label="Quitter"
            compact={compactControls}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/');
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
            icon="move"
            label={antiBurnIn ? 'Anti burn-in' : 'Fixe'}
            active={antiBurnIn}
            compact={compactControls}
            onPress={() => {
              toggleAntiBurnIn();
              revealControls();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
