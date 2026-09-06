import { useCallback, useMemo, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTimeseries2026, useZeventState } from '@/api/queries';
import { LoadingState } from '@/components/screen-state';
import { ShareActions } from '@/components/share-actions';
import { buildShareCardModel, buildShareText, parisClock } from '@/lib/donations';
import { formatCount, formatEuros } from '@/lib/format';
import { recentDeltaEur, toElapsedSeries, type RawPoint } from '@/lib/timeseries';
import { useShareCapture } from '@/lib/use-share-capture';
import { useFavoritesStore } from '@/store/favorites';

/**
 * Carte « cagnotte à l'instant T » : rendu natif capturé en PNG puis partagé via la feuille
 * système. Sans module de partage (web, permission refusée), repli sur un partage texte.
 */
export default function ShareCardScreen() {
  const stateQuery = useZeventState();
  const timeseriesQuery = useTimeseries2026('10m');
  const favorites = useFavoritesStore((s) => s.favorites);
  const cardRef = useRef<View>(null);

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

  const share = useShareCapture(
    cardRef,
    useCallback(() => (model ? buildShareText(model) : null), [model]),
    'Partager la cagnotte ZEvent',
  );

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

        <ShareActions share={share} />

        <Text className="text-xs text-gray-600">
          La carte reprend l’état officiel zevent.fr au moment de l’ouverture de cet écran et vos
          favoris les mieux placés.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
