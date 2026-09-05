import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { useTimeseries2026, useZeventState } from '@/api/queries';
import { LoadingState } from '@/components/screen-state';
import { buildShareCardModel, buildShareText, parisClock } from '@/lib/donations';
import { formatCount, formatEuros } from '@/lib/format';
import { recentDeltaEur, toElapsedSeries, type RawPoint } from '@/lib/timeseries';
import { useFavoritesStore } from '@/store/favorites';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string } | { kind: 'done' };

/**
 * Carte « cagnotte à l'instant T » : rendu natif capturé en PNG puis partagé via la feuille
 * système. Sans module de partage (web, permission refusée), repli sur un partage texte.
 */
export default function ShareCardScreen() {
  const stateQuery = useZeventState();
  const timeseriesQuery = useTimeseries2026('10m');
  const favorites = useFavoritesStore((s) => s.favorites);
  const cardRef = useRef<View>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const model = useMemo(() => {
    const state = stateQuery.data?.data;
    if (!state) return null;
    const raw: RawPoint[] = (timeseriesQuery.data?.points ?? []).map((point) => ({
      t: Date.parse(point.bucket),
      eur: Number(point.donation_cents) / 100,
    }));
    const elapsed = toElapsedSeries(raw);
    const delta = recentDeltaEur(elapsed.points, 60, state.donationAmount.number);
    return buildShareCardModel(state, favorites, delta, stateQuery.data?.sampledAt);
  }, [stateQuery.data, timeseriesQuery.data, favorites]);

  const shareText = useCallback(async () => {
    if (!model) return;
    setStatus({ kind: 'busy' });
    try {
      await Share.share({ message: buildShareText(model) });
      setStatus({ kind: 'done' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Partage impossible' });
    }
  }, [model]);

  const shareImage = useCallback(async () => {
    if (!model || !cardRef.current) return;
    setStatus({ kind: 'busy' });
    try {
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        await Share.share({ message: buildShareText(model) });
        setStatus({ kind: 'done' });
        return;
      }
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Partager la cagnotte ZEvent',
      });
      setStatus({ kind: 'done' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Partage impossible' });
    }
  }, [model]);

  if (!model) {
    return stateQuery.isError ? (
      <View className="flex-1 items-center justify-center bg-gray-950 px-6">
        <Text className="text-center text-sm text-gray-400">
          Backend injoignable : impossible de composer la carte.
        </Text>
      </View>
    ) : (
      <LoadingState label="Composition de la carte…" />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4">
        <View
          ref={cardRef}
          collapsable={false}
          style={{ backgroundColor: '#12082b' }}
          className="gap-5 rounded-3xl border border-zevent-500/40 p-6"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-widest text-zevent-300">
              ZEvent 2026
            </Text>
            <Text className="text-xs text-gray-400">{parisClock(model.capturedAt)} · Paris</Text>
          </View>

          <View>
            <Text className="text-sm text-gray-300">Cagnotte à cet instant</Text>
            <Text className="mt-1 text-5xl font-extrabold text-white" adjustsFontSizeToFit numberOfLines={1}>
              {formatEuros(model.totalEur)}
            </Text>
            {model.deltaHourEur !== null && model.deltaHourEur > 0 ? (
              <Text className="mt-1 text-base font-semibold text-emerald-400">
                +{formatEuros(model.deltaHourEur)} sur la dernière heure
              </Text>
            ) : null}
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white/5 p-3">
              <Text className="text-[11px] uppercase tracking-wider text-gray-400">Viewers</Text>
              <Text className="mt-0.5 text-xl font-bold text-white">{formatCount(model.viewers)}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/5 p-3">
              <Text className="text-[11px] uppercase tracking-wider text-gray-400">En live</Text>
              <Text className="mt-0.5 text-xl font-bold text-white">
                {model.liveCount}
                <Text className="text-sm text-gray-400"> / {model.streamerCount}</Text>
              </Text>
            </View>
          </View>

          {model.favorites.length > 0 ? (
            <View className="gap-2 rounded-2xl bg-white/5 p-3">
              <Text className="text-[11px] uppercase tracking-wider text-gray-400">Mes favoris</Text>
              {model.favorites.map((favorite) => (
                <View key={favorite.display} className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    {favorite.online ? <View className="h-1.5 w-1.5 rounded-full bg-red-500" /> : null}
                    <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                      {favorite.display}
                    </Text>
                  </View>
                  <Text className="text-sm font-bold text-zevent-300">
                    {formatEuros(favorite.donationAmount.number)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-400">zevent.fr/don</Text>
            <Text className="text-xs text-gray-600">ZEvent Monitor</Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => void shareImage()}
            disabled={status.kind === 'busy'}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-zevent-500 py-3.5 active:opacity-80"
          >
            <Ionicons name="image-outline" size={18} color="#ffffff" />
            <Text className="text-sm font-bold text-white">Partager l’image</Text>
          </Pressable>
          <Pressable
            onPress={() => void shareText()}
            disabled={status.kind === 'busy'}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-zevent-500 py-3.5 active:opacity-80"
          >
            <Ionicons name="text-outline" size={18} color="#ddd6fe" />
            <Text className="text-sm font-bold text-zevent-200">Texte</Text>
          </Pressable>
        </View>

        {status.kind === 'error' ? (
          <Text className="text-xs text-red-300">Partage impossible : {status.message}</Text>
        ) : status.kind === 'busy' ? (
          <Text className="text-xs text-gray-500">Préparation du partage…</Text>
        ) : null}

        <Text className="text-xs text-gray-600">
          La carte reprend l’état officiel zevent.fr au moment de l’ouverture de cet écran et vos
          favoris les mieux placés.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
