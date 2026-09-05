import { Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { openTwitchStream } from '@/lib/links';

interface WatchButtonProps {
  twitch: string;
  /** Nom affiché, pour l'annonce vocale du bouton. */
  display: string;
}

/**
 * Rond « lecture » posé au bout d'une ligne de streamer : le raccourci vers le stream,
 * sans passer par la fiche. Même dessin partout où une ligne mène à un direct.
 */
export function WatchButton({ twitch, display }: WatchButtonProps) {
  return (
    <Pressable
      onPress={() => void openTwitchStream(twitch)}
      accessibilityRole="button"
      accessibilityLabel={`Regarder ${display} sur Twitch`}
      hitSlop={8}
      className="h-8 w-8 items-center justify-center rounded-full border border-zevent-500/40 bg-zevent-500/15 active:opacity-60"
    >
      {/* Correction optique : le triangle de « play » est bien centré géométriquement,
          mais sa masse se concentre au tiers gauche. Sans ce décalage d'un cheveu vers
          la droite, il paraît collé au bord gauche du rond. */}
      <Ionicons name="play" size={13} color="#c4b5fd" style={{ marginLeft: 1.5 }} />
    </Pressable>
  );
}
