import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface SectionHeaderProps {
  title: string;
  /** Ce que la section montre, ou sa fraîcheur : une ligne grise sous le titre. */
  hint?: string;
  /** Accessoire aligné sur le titre : compteur, sélecteur de fenêtre. */
  accessory?: ReactNode;
}

/**
 * En-tête d'une section d'écran. Toutes les sections partagent ce gabarit : c'est lui
 * qui donne le rythme d'une page faite de listes, en marquant chaque reprise sans
 * recourir à un encadré.
 *
 * Le titre est nettement plus gros que tout ce qui le suit — c'est ce saut de taille,
 * plus qu'un trait, qui fait comprendre qu'un chapitre s'ouvre.
 */
export function SectionHeader({ title, hint, accessory }: SectionHeaderProps) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="shrink text-xl font-extrabold tracking-tight text-white">{title}</Text>
        {accessory}
      </View>
      {hint ? <Text className="text-[11px] text-gray-500">{hint}</Text> : null}
    </View>
  );
}
