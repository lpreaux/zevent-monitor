import { Image, View } from 'react-native';

interface StreamerAvatarProps {
  uri: string;
  /** Diamètre de la photo, hors anneau. */
  size?: number;
  /** Anneau rouge autour de la photo : la seule marque de direct dont la ligne a besoin. */
  online?: boolean;
  /** Photo estompée, pour les listes hors ligne reléguées au second plan. */
  dim?: boolean;
}

/**
 * Photo de profil d'un streamer, avec anneau de direct optionnel. Centralisée pour que
 * cartes, lignes de favoris et listes gardent exactement le même repère visuel.
 */
export function StreamerAvatar({ uri, size = 40, online = false, dim = false }: StreamerAvatarProps) {
  const ring = online ? 2 : 0;
  const outer = size + ring * 4;

  return (
    <View
      style={{ width: outer, height: outer, borderRadius: outer / 2, borderWidth: ring, padding: ring }}
      className={online ? 'items-center justify-center border-red-500/80' : ''}
    >
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className={`bg-gray-800 ${dim ? 'opacity-60' : ''}`}
      />
    </View>
  );
}
