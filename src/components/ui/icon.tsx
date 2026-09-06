import { Platform, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ICON_NUDGE, type IconName } from '@/lib/icons';

/**
 * Rattrapage du remplissage de police sur Android.
 *
 * `Ionicons` ne rend rien d'autre qu'un `<Text>` portant le glyphe (voir `create-icon-set`
 * dans le paquet) : centrer l'icône, c'est donc centrer une boîte de texte. Or Android
 * ajoute par défaut à cette boîte les montante et descendante déclarées par la police —
 * et Ionicons les déclare très dissymétriques, 18 contre 3 à 20 px. La boîte se retrouve
 * bien centrée, le glyphe non : il descend.
 *
 * `includeFontPadding: false` fait mesurer la boîte sur l'encre plutôt que sur les
 * métriques déclarées. Les deux propriétés n'existent que sur Android, d'où le garde :
 * les poser ailleurs n'aurait aucun effet mais ferait râler react-native-web.
 */
const ANDROID_FONT_FIX: TextStyle | null =
  Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : null;

interface IconProps {
  name: IconName;
  size: number;
  color: string;
  /**
   * Applique la correction optique de `ICON_NUDGE`. Réservé au glyphe seul dans un cadre :
   * accompagné d'un libellé, c'est le couple icône + texte qui est centré, et déplacer
   * l'icône dans son coin ne ferait que la décoller de son mot.
   */
  optical?: boolean;
}

/**
 * Le glyphe, et lui seul. `Button` et `IconButton` passent tous deux par ici, pour que le
 * rattrapage Android et la correction optique n'aient qu'un seul endroit où vivre.
 *
 * Le décalage se fait en translation et non en marge : une marge entre dans le calcul de
 * l'espace libre que la disposition répartit, si bien qu'un décalage demandé au centre
 * d'une rangée n'arrivait qu'à moitié à l'écran. Une translation déplace le rendu sans
 * toucher à la place occupée — ce qui est exactement ce qu'on demande à une correction
 * qui ne doit se voir que d'un cheveu.
 */
export function Icon({ name, size, color, optical = false }: IconProps) {
  const nudge = optical ? ICON_NUDGE[name] : undefined;
  const translate = nudge
    ? [{ translateX: (nudge.x ?? 0) * size }, { translateY: (nudge.y ?? 0) * size }]
    : undefined;

  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      style={[ANDROID_FONT_FIX, translate ? { transform: translate } : null]}
    />
  );
}
