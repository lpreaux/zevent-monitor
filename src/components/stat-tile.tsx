import { Text, View } from 'react-native';

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  /** Valeur exacte, quand `value` est une forme abrégée. Voir `formatEurosTile`. */
  exact?: string;
}

/**
 * Un chiffre et ce qu'il désigne, dans une tuile de demi-largeur.
 *
 * La valeur tient sur une ligne, quoi qu'il arrive : elle rétrécit plutôt que de passer à
 * la ligne. Un montant coupé en deux morceaux — « 16 636 » au-dessus de « 297 € » — ne se
 * lit plus comme un nombre, et c'est exactement ce que produit un montant à sept chiffres
 * dans la largeur disponible ici.
 */
export function StatTile({ label, value, hint, exact }: StatTileProps) {
  return (
    <View className="flex-1 rounded-2xl border border-white/10 bg-surface p-4">
      <Text numberOfLines={1} className="text-xs font-medium uppercase tracking-wider text-gray-400">
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        className="mt-1 text-2xl font-bold text-white"
      >
        {value}
      </Text>
      {exact ? (
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-gray-400">
          {exact}
        </Text>
      ) : null}
      {hint ? (
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-gray-500">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
