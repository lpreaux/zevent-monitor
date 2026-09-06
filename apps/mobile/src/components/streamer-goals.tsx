import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useStreamerGoals } from '@/api/queries';
import { GoalProgress } from '@/components/goal-progress';
import { SectionLink } from '@/components/section-link';
import { SectionTitle } from '@/components/section-title';
import { formatCount, formatEuros, formatRelativeTime } from '@/lib/format';
import { splitGoals, type GoalSplit } from '@/lib/streamer-profile';

/** Fraîcheur de la source communautaire, en une poignée de mots. */
function freshnessLabel(origin: 'live' | 'bundled', stale: boolean, fetchedAt: string | null) {
  if (origin !== 'live') return 'copie embarquée';
  return stale ? 'snapshot en repli' : `relevé ${formatRelativeTime(fetchedAt)}`;
}

/** Mention de provenance, obligatoire partout où ces paliers s'affichent. */
function SourceNote() {
  return (
    <Text className="text-[11px] text-gray-600">
      Paliers : InGDoc / EvenMoreStats — source communautaire non officielle.
    </Text>
  );
}

/** Tous les paliers franchis : il n'y a plus de prochain gage à annoncer, mais c'est une nouvelle. */
function AllReached({ split }: { split: GoalSplit }) {
  const last = split.reached[split.reached.length - 1];
  return (
    <View className="flex-row items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
      <Ionicons name="trophy" size={14} color="#6ee7b7" />
      <Text className="flex-1 text-sm text-emerald-200">
        {`Tous ses paliers sont franchis, jusqu’à ${formatEuros(last.amountCents / 100)}.`}
      </Text>
    </View>
  );
}

interface StreamerGoalsProps {
  twitch: string;
  /** Cagnotte personnelle officielle, en euros. */
  raisedEuros: number;
}

/**
 * Le palier qui se joue, posé sous la carte du streamer.
 *
 * Un streamer aligne couramment quinze paliers, dont la moitié franchis dès le samedi
 * matin : les dérouler sur la fiche noyait la seule ligne qu'on vient y lire — combien il
 * manque pour le prochain gage. Le reste part sur sa propre page, à un tap.
 *
 * Sans aucun palier connu, la section disparaît : la source communautaire n'en publie pas
 * pour tout le monde, et un encadré « rien à afficher » n'apprend rien à personne.
 */
export function StreamerNextGoal({ twitch, raisedEuros }: StreamerGoalsProps) {
  const router = useRouter();
  const result = useStreamerGoals(twitch);
  const split = useMemo(() => splitGoals(result.goals, raisedEuros), [result.goals, raisedEuros]);

  if (result.goals.length === 0) return null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="flag-outline" size={12} color="#c4b5fd" />
        <Text className="flex-1 text-[10px] font-bold uppercase tracking-[1.4px] text-zevent-300">
          {split.next ? 'Prochain palier' : 'Paliers'}
        </Text>
        <Text className="text-[11px] text-gray-500">
          {`${formatCount(split.reached.length)} / ${formatCount(result.goals.length)} franchis`}
        </Text>
      </View>

      {split.next ? (
        <GoalProgress goal={split.next.goal} raisedEuros={raisedEuros} highlighted />
      ) : (
        <AllReached split={split} />
      )}

      <SectionLink
        label={`Tous ses paliers (${formatCount(result.goals.length)})`}
        accessibilityLabel={`Ouvrir les ${result.goals.length} paliers de ${twitch}`}
        onPress={() =>
          router.push({ pathname: '/streamer/[twitch]/goals', params: { twitch } })
        }
      />
    </View>
  );
}

/**
 * Tous les paliers d'un streamer, dans l'ordre où ils se vivent : celui qui se joue, ceux
 * qui restent, puis le mur de ce qui est fait.
 *
 * Ici rien n'est replié — on ne vient sur cette page que pour tout voir, et un bouton
 * « déplier » y demanderait un geste de plus pour ce qu'on est venu chercher.
 */
export function StreamerGoalsList({ twitch, raisedEuros }: StreamerGoalsProps) {
  const result = useStreamerGoals(twitch);
  const split = useMemo(() => splitGoals(result.goals, raisedEuros), [result.goals, raisedEuros]);

  if (result.goals.length === 0) {
    return (
      <View className="gap-3">
        <Text className="text-sm text-gray-500">
          Aucun palier connu pour ce streamer — la source communautaire n’en publie pas, ou
          pas encore.
        </Text>
        <SourceNote />
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Text className="text-[11px] text-gray-500">
        {`Cagnotte actuelle ${formatEuros(raisedEuros)} · ${freshnessLabel(result.origin, result.stale, result.fetchedAt)}`}
      </Text>

      <View className="gap-2">
        <SectionTitle label={split.next ? 'Le palier en cours' : 'Tout est franchi'} />
        {split.next ? (
          <GoalProgress goal={split.next.goal} raisedEuros={raisedEuros} highlighted />
        ) : (
          <AllReached split={split} />
        )}
      </View>

      {split.later.length > 0 ? (
        <View className="gap-2">
          <SectionTitle label="Ensuite" count={split.later.length} />
          {split.later.map((goal) => (
            <GoalProgress key={String(goal.id)} goal={goal} raisedEuros={raisedEuros} />
          ))}
        </View>
      ) : null}

      {split.reached.length > 0 ? (
        <View className="gap-2">
          <SectionTitle label="Déjà franchis" count={split.reached.length} />
          {/* Du dernier franchi au premier : on remonte le fil de ce qui vient d'arriver,
              plutôt que de repartir du gage de départ. */}
          {[...split.reached].reverse().map((goal) => (
            <GoalProgress key={String(goal.id)} goal={goal} raisedEuros={raisedEuros} />
          ))}
        </View>
      ) : null}

      <SourceNote />
    </View>
  );
}
