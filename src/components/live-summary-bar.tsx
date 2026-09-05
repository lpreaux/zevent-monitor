import { Linking, Pressable, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { useZeventState } from '@/api/queries';
import { AnimatedEuros } from '@/components/animated-euros';
import { PlanningHighlights, PlanningTicker } from '@/components/live-summary-planning';
import { formatCount, formatEuros, formatRelativeTime } from '@/lib/format';
import { useLiveBarStore, type LiveBarDensity } from '@/store/live-bar';
import { colors } from '@/theme';

const EM_DASH = '—';

const DENSITY_TOGGLE = {
  comfort: { icon: 'contract-outline', label: 'Réduire le résumé du direct' },
  compact: { icon: 'expand-outline', label: 'Agrandir le résumé du direct' },
} as const satisfies Record<LiveBarDensity, { icon: keyof typeof Ionicons.glyphMap; label: string }>;

/** Chiffre clé posé à plat, sans encadré : la lecture repose sur la hiérarchie typographique. */
function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
        {label}
      </Text>
      <Text className="mt-0.5 text-lg font-bold text-white">{value}</Text>
      {hint ? <Text className="text-[11px] text-gray-600">{hint}</Text> : null}
    </View>
  );
}

/** Pastille de fraîcheur : verte quand la source répond, ambre sur dernier état connu. */
function FreshnessDot({ stale }: { stale: boolean }) {
  return <View className={`h-1.5 w-1.5 rounded-full ${stale ? 'bg-amber-400' : 'bg-emerald-400'}`} />;
}

function ActionIcon({
  icon,
  label,
  onPress,
  small = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Variante du mode réduit : c'est la hauteur des boutons qui y fixe celle de la ligne. */
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      className={`items-center justify-center rounded-full border border-white/10 bg-white/5 active:opacity-60 ${small ? 'h-8 w-8' : 'h-9 w-9'}`}
    >
      <Ionicons name={icon} size={small ? 15 : 17} color={colors.brandSoft} />
    </Pressable>
  );
}

/**
 * Poignée du bas de barre : elle masque tout le résumé et le réaffiche. Même
 * dessin dans les deux états, seul le chevron s'inverse ; la zone tactile, elle,
 * court sur toute la largeur pour rester facile à viser quand la barre est masquée.
 */
function Grabber({ hidden, onPress }: { hidden: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Afficher le résumé du direct' : 'Masquer le résumé du direct'}
      hitSlop={{ top: 10, bottom: 10 }}
      className={`w-full flex-row items-center justify-center gap-1.5 active:opacity-60 ${hidden ? 'py-2' : 'pb-1.5 pt-1'}`}
    >
      <View className="h-px w-8 rounded-full bg-white/15" />
      <Ionicons name={hidden ? 'chevron-down' : 'chevron-up'} size={12} color="#6b7280" />
      <View className="h-px w-8 rounded-full bg-white/15" />
    </Pressable>
  );
}

/**
 * Résumé permanent du direct (cagnotte, viewers, streamers, dons) épinglé sous la
 * barre du haut et donc visible sur tous les écrans. Deux commandes indépendantes,
 * mémorisées d'une session à l'autre : le bouton de densité bascule confort ⇄ réduit,
 * la poignée du bas masque ou réaffiche l'ensemble sans perdre la densité choisie.
 */
export function LiveSummaryBar() {
  const router = useRouter();
  const { data } = useZeventState();
  const mode = useLiveBarStore((s) => s.mode);
  const toggleDensity = useLiveBarStore((s) => s.toggleDensity);
  const toggleHidden = useLiveBarStore((s) => s.toggleHidden);

  const state = data?.data;
  const stale = data?.source.stale ?? false;
  const liveCount = state ? state.live.filter((s) => s.online).length : 0;
  const onDonate = () => {
    if (state) void Linking.openURL(state.globalDonationUrl);
  };
  const onShare = () => router.push('/share-card');
  const densityToggle = DENSITY_TOGGLE[mode === 'hidden' ? 'comfort' : mode];

  // Racine unique quel que soit le palier : la transition de hauteur reste continue
  // quand l'utilisateur passe de confort à réduit puis à caché.
  return (
    <Animated.View layout={LinearTransition.duration(200)}>
      {mode === 'comfort' ? (
        <View className="px-5">
          <View className="flex-row items-start justify-between gap-3 pt-1">
            <View className="flex-1">
              <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
                Cagnotte globale
              </Text>
              {state ? (
                <AnimatedEuros value={state.donationAmount.number} style={{ fontSize: 36 }} />
              ) : (
                <Text className="text-[36px] font-extrabold text-white">{EM_DASH}</Text>
              )}
            </View>
            <View className="mt-1 flex-row items-center gap-1.5">
              <FreshnessDot stale={stale} />
              <Text className="text-[11px] text-gray-500">
                {stale ? 'Dernier état connu' : 'À jour'} {formatRelativeTime(data?.source.fetchedAt)}
              </Text>
            </View>
          </View>

          <View className="mt-3 h-px w-full bg-white/5" />

          <View className="mt-3 flex-row items-center">
            <Metric
              label="Viewers cumulés"
              value={state ? formatCount(state.viewersCount.number) : EM_DASH}
            />
            <View className="mx-4 h-8 w-px bg-white/10" />
            <Metric
              label="Streamers en live"
              value={state ? formatCount(liveCount) : EM_DASH}
              hint={state ? `sur ${formatCount(state.live.length)} inscrits` : undefined}
            />
          </View>

          <PlanningHighlights />

          <View className="mt-3.5 flex-row items-center gap-2">
            <Pressable
              onPress={onDonate}
              accessibilityRole="button"
              accessibilityLabel="Faire un don"
              disabled={!state}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-full bg-zevent-500 py-3 active:opacity-80 ${state ? '' : 'opacity-40'}`}
            >
              <Ionicons name="heart" size={16} color="#ffffff" />
              <Text className="text-sm font-bold text-white">Faire un don</Text>
            </Pressable>
            <ActionIcon icon="share-social-outline" label="Partager la cagnotte" onPress={onShare} />
            <ActionIcon {...densityToggle} onPress={toggleDensity} />
          </View>
        </View>
      ) : null}

      {mode === 'compact' ? (
        <>
          <View className="flex-row items-center gap-2 px-5">
            <FreshnessDot stale={stale} />
            <Text className="text-base font-extrabold text-white">
              {state ? formatEuros(state.donationAmount.number) : EM_DASH}
            </Text>
            <Text numberOfLines={1} className="flex-1 text-[11px] text-gray-500">
              {state
                ? `${formatCount(state.viewersCount.number)} viewers · ${formatCount(liveCount)} en live`
                : 'Chargement…'}
            </Text>
            <ActionIcon small icon="heart" label="Faire un don" onPress={onDonate} />
            <ActionIcon small icon="share-social-outline" label="Partager la cagnotte" onPress={onShare} />
            <ActionIcon small {...densityToggle} onPress={toggleDensity} />
          </View>
          <PlanningTicker />
        </>
      ) : null}

      <Grabber hidden={mode === 'hidden'} onPress={toggleHidden} />
    </Animated.View>
  );
}
