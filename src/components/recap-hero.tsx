import { Text, View } from 'react-native';

import { formatCount, formatEuros, formatEurosTile, formatPercent } from '@/lib/format';

const hourMinute = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Une valeur de la rangée : ce qu'elle mesure, sa forme courte, et sa précision dessous. */
function Cell({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View className="flex-1 gap-0.5 px-1">
      <Text numberOfLines={1} className="text-[10px] font-medium text-gray-400">
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        className="text-lg font-bold text-white"
      >
        {value}
      </Text>
      {detail ? (
        <Text numberOfLines={1} className="text-[10px] text-gray-500">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

interface RecapHeroProps {
  raisedCents: number;
  endCents: number | null;
  shareOfTotal?: number | null;
  peakViewers: number;
  bestHour?: { start: string; raisedCents: number } | null;
}

/**
 * Tête de la fiche de récap : le montant, puis les trois valeurs qui le situent.
 *
 * Un seul bloc, et une seule chose mise en avant. La grille de quatre tuiles qui occupait
 * cette place donnait quatre chiffres de quatre natures — des euros, des viewers, une
 * heure, un compte — tous du même poids : l'œil s'y arrêtait quatre fois sans savoir
 * lequel comptait. Ici le cumul est le sujet, le reste l'accompagne sur une rangée qui se
 * lit d'un balayage, chaque valeur gardant sa précision en dessous.
 */
export function RecapHero({
  raisedCents, endCents, shareOfTotal, peakViewers, bestHour,
}: RecapHeroProps) {
  // Le cumul reste écrit en entier : il a toute la largeur, et c'est le chiffre qu'on
  // vient lire. Seules les valeurs de la rangée, à un tiers de largeur, sont abrégées.
  const total = endCents === null ? null : formatEurosTile(endCents / 100);

  return (
    <View className="gap-4 rounded-3xl border border-white/10 bg-surface p-5">
      <View className="gap-1">
        <Text className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
          Collecté sur la période
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          className="text-4xl font-black text-white"
        >
          +{formatEuros(raisedCents / 100)}
        </Text>
        {shareOfTotal ? (
          <Text className="text-sm text-gray-400">
            soit {formatPercent(shareOfTotal)} de la cagnotte atteinte
          </Text>
        ) : null}
      </View>

      <View className="flex-row border-t border-white/[0.06] pt-4">
        <Cell
          label="Cagnotte"
          value={total?.value ?? '—'}
          {...(total?.exact ? { detail: total.exact } : {})}
        />
        <View className="w-px bg-white/[0.06]" />
        <Cell label="Pic viewers" value={formatCount(peakViewers)} />
        <View className="w-px bg-white/[0.06]" />
        <Cell
          label="Meilleure heure"
          value={bestHour ? hourMinute.format(new Date(bestHour.start)) : '—'}
          {...(bestHour ? { detail: `+${formatEuros(bestHour.raisedCents / 100)}` } : {})}
        />
      </View>
    </View>
  );
}
