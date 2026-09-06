import { Button } from '@/components/ui/button';
import { icons } from '@/lib/icons';

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
 * À ne pas confondre avec `SectionLink`, qui envoie ailleurs. La distinction se joue
 * maintenant sur deux traits plutôt qu'un : le cadre — on reste, il y a donc quelque
 * chose dessous à encadrer — et le gris du rang `neutral`, quand le lien de section garde
 * le violet de ce qui mène ailleurs. Déplier est un service rendu à la lecture, pas une
 * proposition : cela ne doit pas appeler l'œil autant qu'une sortie.
 */
export function DisclosureButton({
  expanded,
  onPress,
  label,
  expandedLabel,
}: DisclosureButtonProps) {
  return (
    <Button
      block
      size="sm"
      variant="neutral"
      icon={expanded ? icons.collapse : icons.expand}
      label={expanded ? (expandedLabel ?? label) : label}
      onPress={onPress}
    />
  );
}
