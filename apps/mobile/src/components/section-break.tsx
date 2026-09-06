import { View } from 'react-native';

/**
 * Respiration entre deux sections d'un écran, en plus de l'espacement courant du contenu.
 *
 * Rien à dessiner : c'est le vide qui sépare. Un filet bord à bord ferait le travail lui
 * aussi, mais il donnerait à une page de contenu l'air d'une liste de réglages — et il
 * dispenserait les titres de section d'être assez forts pour ouvrir un chapitre.
 */
const BREAK = 16;

export function SectionBreak() {
  return <View style={{ height: BREAK }} />;
}
