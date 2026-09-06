import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { PlanningEntry } from '@/api/types';
import { canRemind } from '@/lib/planning-reminders';
import { usePlanningRemindersStore } from '@/store/planning-reminders';

interface ReminderBellProps {
  entry: PlanningEntry;
  now: number;
  size?: number;
}

/**
 * Rappel d'une émission à venir. Le bouton disparaît dès qu'il n'y a plus rien à
 * annoncer — une émission commencée, ou trop proche pour qu'un rappel arrive à temps :
 * une cloche qu'on peut cocher sans effet est pire que pas de cloche du tout.
 */
export function ReminderBell({ entry, now, size = 18 }: ReminderBellProps) {
  const scheduled = usePlanningRemindersStore((state) => Boolean(state.scheduled[entry.id]));
  const toggle = usePlanningRemindersStore((state) => state.toggle);

  if (!scheduled && !canRemind(entry, now)) return null;

  return (
    <Pressable
      onPress={() => void toggle(entry)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityState={{ selected: scheduled }}
      accessibilityLabel={
        scheduled ? `Annuler le rappel de ${entry.title}` : `Me rappeler ${entry.title}`
      }
      className="items-center justify-center active:opacity-60"
    >
      <Ionicons
        name={scheduled ? 'notifications' : 'notifications-outline'}
        size={size}
        color={scheduled ? '#c4b5fd' : '#6b7280'}
      />
    </Pressable>
  );
}
