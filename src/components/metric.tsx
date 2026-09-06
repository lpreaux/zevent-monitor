import { Text, View } from 'react-native';

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
  /** Valeur exacte, quand `value` est une forme abrégée. Voir `formatEurosTile`. */
  exact?: string;
  /** `lg` pour un chiffre de tête de section ; `md` par défaut. */
  size?: 'md' | 'lg';
}

/**
 * Chiffre clé posé à plat, sans encadré : la lecture repose sur la hiérarchie
 * typographique — intitulé en petites capitales, valeur en gros, précision en gris.
 *
 * C'est le dessin du résumé du direct, sorti de la barre du haut pour que les écrans qui
 * alignent des chiffres n'aient pas à réinventer un cadre à chaque fois.
 *
 * La valeur tient sur une ligne, quoi qu'il arrive : elle rétrécit plutôt que de passer à
 * la ligne. Ces chiffres vivent en rangées de deux ou trois, donc dans un tiers de
 * largeur, et la cagnotte du ZEvent y compte treize caractères — écrite en entier, elle se
 * coupait en « 16 636 » au-dessus de « 297 € », ce qui ne se lit plus comme un nombre.
 */
export function Metric({ label, value, hint, exact, size = 'md' }: MetricProps) {
  return (
    <View className="flex-1">
      <Text
        numberOfLines={1}
        className="text-[10px] font-semibold uppercase tracking-[1.2px] text-gray-500"
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        className={`mt-0.5 font-bold text-white ${size === 'lg' ? 'text-2xl' : 'text-lg'}`}
      >
        {value}
      </Text>
      {exact ? (
        <Text numberOfLines={1} className="text-[10px] text-gray-400">
          {exact}
        </Text>
      ) : null}
      {hint ? (
        <Text numberOfLines={1} className="text-[11px] text-gray-500">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Filet vertical entre deux chiffres d'une même rangée. */
export function MetricDivider() {
  return <View className="mx-4 h-8 w-px bg-white/10" />;
}
