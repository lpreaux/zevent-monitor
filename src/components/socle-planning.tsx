import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { usePlanning } from '@/api/queries';
import type { PlanningEntry } from '@/api/types';
import { currentAndUpcoming, entryStatus, formatCountdown, formatParisTime } from '@/lib/planning';
import { useNow } from '@/lib/use-now';

/** Émissions montrées dans le dépliage. Trois lignes : au-delà, le socle mange l'écran. */
const PANEL_ROWS = 3;
const ROW_HEIGHT = 26;

/** Pastille de statut : rouge à l'antenne, violette pour ce qui arrive. */
function StatusDot({ live }: { live: boolean }) {
  return <View className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-red-500' : 'bg-zevent-400'}`} />;
}

interface Highlights {
  /** En cours d'abord, puis à venir, tronqué à `limit`. */
  entries: PlanningEntry[];
  /** Combien passent à l'antenne en ce moment, avant troncature. */
  liveCount: number;
  /** Combien sont en cours ou à venir en tout. */
  total: number;
  now: number;
}

/**
 * Entrées à mettre en avant, réévaluées au rythme de l'horloge partagée : une émission
 * qui démarre bascule d'elle-même en « en cours » sans attendre un refetch du planning.
 */
function useHighlights(limit: number): Highlights {
  const { entries } = usePlanning();
  const now = useNow(30_000);
  const all = useMemo(() => currentAndUpcoming(entries, now, entries.length), [entries, now]);
  return {
    entries: useMemo(() => all.slice(0, limit), [all, limit]),
    liveCount: useMemo(() => all.filter((e) => entryStatus(e, now) === 'live').length, [all, now]),
    total: all.length,
    now,
  };
}

/**
 * Ce qui passe, en une ligne, pour la ligne permanente du socle.
 *
 * Elle remplace le compte des viewers et celui des streamers en direct. Ces deux nombres
 * bougeaient sans qu'on puisse rien en faire — on ne va pas voir un chiffre —, alors qu'un
 * titre d'émission est une raison d'ouvrir un onglet. Ils n'ont pas disparu pour autant :
 * le dépliage les porte, à un geste, et c'est là qu'on va les chercher quand on les veut.
 *
 * Rien n'y tourne. La place est comptée — la cagnotte et deux boutons occupent déjà la
 * ligne —, mais surtout un bandeau qui roule au bas de l'écran attire l'œil en
 * permanence vers ce qu'on n'a pas demandé à lire.
 */
export function SocleNowLine({ onOpen }: { onOpen: () => void }) {
  const { entries, liveCount, now } = useHighlights(1);
  const entry = entries[0];
  if (!entry) return null;

  const live = entryStatus(entry, now) === 'live';
  const others = live ? liveCount - 1 : 0;
  const countdown = live ? null : formatCountdown(entry.startsAt, now);

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${live ? 'À l’antenne' : 'À suivre'} : ${entry.title}. Ouvrir le planning`}
      className="flex-1 flex-row items-center gap-1.5 active:opacity-60"
    >
      <StatusDot live={live} />
      <Text numberOfLines={1} className="shrink text-[11px] text-gray-400">
        {entry.title}
      </Text>
      {/* Ce qui situe le titre : le nombre d'émissions parallèles quand on est à
          l'antenne, l'attente restante quand la suivante n'a pas commencé. */}
      {others > 0 ? (
        <Text className="text-[11px] text-gray-600">{`+${others}`}</Text>
      ) : countdown ? (
        <Text numberOfLines={1} className="text-[11px] text-gray-600">
          {countdown}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Une émission du bloc : statut, heure, titre, et ce qu'il reste à attendre. */
function HighlightRow({ entry, now }: { entry: PlanningEntry; now: number }) {
  const live = entryStatus(entry, now) === 'live';
  const countdown = formatCountdown(entry.startsAt, now);

  return (
    <View className="flex-row items-center gap-2" style={{ height: ROW_HEIGHT }}>
      <StatusDot live={live} />
      <Text className="w-12 text-[12px] font-semibold text-gray-400">
        {formatParisTime(entry.startsAt)}
      </Text>
      <Text numberOfLines={1} className="flex-1 text-[13px] text-gray-200">
        {entry.title}
      </Text>
      <Text className={`text-[11px] ${live ? 'font-semibold text-red-400' : 'text-zevent-300'}`}>
        {live ? 'En cours' : (countdown ?? '')}
      </Text>
    </View>
  );
}

/**
 * Le programme dans le dépliage du socle : trois émissions à plat, alignées en colonnes.
 *
 * Elles ne tournent plus. Une fenêtre glissante y roulait d'un cran toutes les quatre
 * secondes et demie, chaque ligne portant ses propres animations d'entrée et de sortie —
 * un mouvement perpétuel sous le doigt, dans un bloc qu'on ouvre justement pour le lire.
 * Au repli du socle, ces sorties se déclenchaient de surcroît toutes ensemble et duraient
 * une demi-seconde : les lignes survivaient au bloc qui les contenait. Ce n'est pas le
 * clignotement qui a été signalé — celui-là venait de la racine du socle, voir
 * `app-socle` — mais c'en était un second, en embuscade.
 *
 * Trois lignes plutôt que deux, puisqu'il n'y a plus de rotation pour montrer les
 * suivantes, et le compteur de l'en-tête dit combien il y en a en tout : elles ne
 * laissent plus croire que le programme s'arrête là.
 *
 * L'ouverture du planning est passée en paramètre plutôt que prise sur le routeur : le
 * socle doit se replier en même temps qu'il navigue, et ce bloc n'a pas à savoir qu'il vit
 * dans quelque chose de dépliable.
 */
export function SoclePlanning({ onOpen }: { onOpen: () => void }) {
  const { entries, total, now } = useHighlights(PANEL_ROWS);

  if (entries.length === 0) return null;

  return (
    <View>
      <View className="h-px w-full bg-white/5" />
      <View className="mt-2.5 flex-row items-center justify-between">
        <Text className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500">
          Au programme
          {total > entries.length ? (
            <Text className="text-gray-600">{`  ·  ${total} à venir`}</Text>
          ) : null}
        </Text>
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir le planning"
          hitSlop={8}
          className="active:opacity-60"
        >
          <Text className="text-[11px] text-zevent-300">Tout le planning</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir le planning"
        className="mt-1 active:opacity-70"
      >
        {entries.map((entry) => (
          <HighlightRow key={entry.id} entry={entry} now={now} />
        ))}
      </Pressable>
    </View>
  );
}
