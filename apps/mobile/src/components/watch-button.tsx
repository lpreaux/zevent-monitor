import { IconButton } from '@/components/ui/icon-button';
import { icons } from '@/lib/icons';
import { openTwitchStream } from '@/lib/links';

interface WatchButtonProps {
  twitch: string;
  /** Nom affiché, pour l'annonce vocale du bouton. */
  display: string;
}

/**
 * Rond « lecture » posé au bout d'une ligne de streamer : le raccourci vers le stream,
 * sans passer par la fiche. Même dessin partout où une ligne mène à un direct.
 *
 * La correction optique du triangle de « play » — sa masse se concentre au tiers gauche,
 * et sans un décalage d'un cheveu vers la droite il paraît collé au bord du rond — a
 * quitté ce fichier pour `ICON_NUDGE`, où elle profite à toutes les icônes seules dans un
 * cadre plutôt qu'à celle-ci uniquement.
 */
export function WatchButton({ twitch, display }: WatchButtonProps) {
  return (
    <IconButton
      size="sm"
      variant="accent"
      icon={icons.watch}
      label={`Regarder ${display} sur Twitch`}
      onPress={() => void openTwitchStream(twitch)}
    />
  );
}
