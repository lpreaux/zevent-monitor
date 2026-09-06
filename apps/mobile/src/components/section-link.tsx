import { Pressable, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

interface SectionLinkProps {
  label: string;
  onPress: () => void;
  /** Annonce vocale, quand le libellé seul ne dit pas où l'on va. */
  accessibilityLabel?: string;
}

/**
 * Pied de section : le renvoi vers la liste complète dont la section n'a montré qu'un
 * extrait. Un lien centré plutôt qu'un bouton plein — la sortie d'une section ne doit pas
 * peser plus lourd que les lignes qu'elle prolonge. Même dessin partout : deux pieds
 * différents sur un même écran se liraient comme deux natures d'action.
 */
export function SectionLink({ label, onPress, accessibilityLabel }: SectionLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // Le lien est court et léger : le hitSlop lui rend une cible confortable au doigt.
      hitSlop={10}
      className="flex-row items-center justify-center gap-1 py-2 active:opacity-60"
    >
      <Text className="text-[11px] font-semibold text-zevent-300">{label}</Text>
      <Ionicons name="chevron-forward" size={11} color="#c4b5fd" />
    </Pressable>
  );
}
