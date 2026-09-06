import { Pressable, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

interface DisclosureButtonProps {
  expanded: boolean;
  onPress: () => void;
  /** Ce qu'un appui va montrer, ex. « 8 paliers franchis ». */
  label: string;
  /** Ce qu'un appui va replier ; le même libellé sinon. */
  expandedLabel?: string;
}

/**
 * Bouton qui déplie le reste d'une section sur place.
 *
 * À ne pas confondre avec `SectionLink`, qui envoie ailleurs : ici on reste, et c'est
 * pourquoi le bouton porte un cadre plutôt qu'un chevron de navigation. Même dessin
 * partout — paliers franchis, émissions passées, directs en trop — pour qu'un cadre
 * signifie toujours la même chose : il y en a d'autres, dessous.
 */
export function DisclosureButton({
  expanded,
  onPress,
  label,
  expandedLabel,
}: DisclosureButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      className="flex-row items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 active:opacity-70"
    >
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color="#c4b5fd" />
      <Text className="text-xs font-semibold text-zevent-200">
        {expanded ? (expandedLabel ?? label) : label}
      </Text>
    </Pressable>
  );
}
