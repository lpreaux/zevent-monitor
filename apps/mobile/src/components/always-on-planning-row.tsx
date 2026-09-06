import { Text, View } from 'react-native';

import type { PlanningEntry } from '@/api/types';
import { entryStatus, formatCountdown, formatParisRange } from '@/lib/planning';

interface AlwaysOnPlanningRowProps {
  entry: PlanningEntry;
  now: number;
  captionFontSize: number;
  valueFontSize: number;
}

/** Trois noms suffisent de loin ; au-delà on compte le reste. */
const MAX_PARTICIPANTS = 3;

function participantsLabel(entry: PlanningEntry): string | null {
  const names = entry.participants.map((p) => p.name).filter(Boolean);
  if (names.length === 0) return null;
  const shown = names.slice(0, MAX_PARTICIPANTS).join(', ');
  const rest = names.length - MAX_PARTICIPANTS;
  return rest > 0 ? `${shown} +${rest}` : shown;
}

/**
 * Entrée de planning pour l'écran secondaire : créneau, statut et participants,
 * sans interaction ni bordure claire (fond AMOLED noir, cf. docs/plans/2026-mobile-app.md §4 P1).
 */
export function AlwaysOnPlanningRow({
  entry,
  now,
  captionFontSize,
  valueFontSize,
}: AlwaysOnPlanningRowProps) {
  const status = entryStatus(entry, now);
  const countdown = formatCountdown(entry.startsAt, now);
  const participants = participantsLabel(entry);

  return (
    <View className="py-1.5">
      <View className="flex-row items-center gap-2">
        {status === 'live' ? (
          <View
            style={{ width: captionFontSize * 0.5, height: captionFontSize * 0.5 }}
            className="rounded-full bg-red-500"
          />
        ) : null}
        <Text
          numberOfLines={1}
          style={{ fontSize: valueFontSize * 0.82 }}
          className="flex-1 font-semibold text-gray-200"
        >
          {entry.title}
        </Text>
        <Text
          style={{ fontSize: captionFontSize }}
          className={status === 'live' ? 'font-semibold text-red-400' : 'text-zevent-300'}
        >
          {status === 'live' ? 'En cours' : (countdown ?? '')}
        </Text>
      </View>

      <Text numberOfLines={1} style={{ fontSize: captionFontSize }} className="mt-0.5 text-gray-500">
        {formatParisRange(entry.startsAt, entry.endsAt)}
        {participants ? ` — ${participants}` : ''}
      </Text>
    </View>
  );
}
