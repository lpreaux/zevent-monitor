import { useCallback, useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useZeventState } from '@/api/queries';
import { LoadingState } from '@/components/screen-state';
import { ShareActions } from '@/components/share-actions';
import { StatsShareCard } from '@/components/stats-share-card';
import { formatEuros } from '@/lib/format';
import { formatElapsedLabel } from '@/lib/stats-edition';
import { useEditionComparison } from '@/lib/use-edition-comparison';
import { useShareCapture } from '@/lib/use-share-capture';

/** Adresse de don publiée quand l'état officiel n'a pas (encore) répondu la sienne. */
const FALLBACK_DONATION_URL = 'https://zevent.fr/don';

/**
 * Carte « les deux éditions à cet instant », à publier. Même mécanique que la carte de la
 * cagnotte globale et que celle d'un streamer — capture PNG, repli texte — mais sur ce
 * qui fait le sel du week-end : l'écart avec l'édition précédente au même moment.
 *
 * L'en-tête vient de la déclaration de route (présentation modale) : le rendre ici en
 * doublerait un.
 */
export default function StatsShareScreen() {
  const { comparison, history, noBackend, isLoading } = useEditionComparison();
  const stateQuery = useZeventState();
  const cardRef = useRef<View>(null);

  const capturedAt = stateQuery.data?.sampledAt ?? new Date().toISOString();
  const donationUrl = stateQuery.data?.data.globalDonationUrl ?? FALLBACK_DONATION_URL;

  /**
   * Le repli texte part là où l'image ne passe pas — le web, un partage refusé, un champ
   * de saisie. Il ne peut donc pas commenter la carte : il la remplace, et se lit comme
   * une phrase qu'on aurait tapée soi-même, lien de don compris.
   */
  const buildText = useCallback(() => {
    const elapsed =
      comparison.has2026Curve && comparison.current2026Minutes > 0
        ? formatElapsedLabel(comparison.current2026Minutes)
        : null;
    const lines: string[] = [];

    if (comparison.current2026Eur > 0) {
      const head = `ZEvent 2026${elapsed ? `, ${elapsed}` : ''} : ${formatEuros(comparison.current2026Eur)} collectés`;
      lines.push(
        comparison.deltaEur === null
          ? `${head}.`
          : comparison.deltaEur >= 0
            ? `${head}, soit ${formatEuros(comparison.deltaEur)} d’avance sur 2025 au même moment.`
            : `${head}, soit ${formatEuros(-comparison.deltaEur)} de retard sur 2025 au même moment.`,
      );
      if (comparison.projected2026Eur !== null) {
        lines.push(
          `Projection de fin d’édition, estimation : ${formatEuros(comparison.projected2026Eur)}.`,
        );
      }
    } else {
      lines.push(
        `ZEvent 2026 : la cagnotte n’est pas encore comparable à 2025, dont l’édition s’était close à ${formatEuros(comparison.final2025Eur)}.`,
      );
    }

    lines.push(`Courbe 2025 : ${history.provenance.provider}.`);
    lines.push(donationUrl);
    return lines.join('\n');
  }, [comparison, history.provenance.provider, donationUrl]);

  const share = useShareCapture(cardRef, buildText, 'Partager la comparaison des éditions');

  // La courbe 2025 est embarquée dans l'application : dès que le réseau a tranché, dans un
  // sens ou dans l'autre, il y a toujours une carte à composer. On n'attend que sa réponse.
  if (isLoading && !stateQuery.data) {
    return <LoadingState label="Composition de la carte…" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4">
        <StatsShareCard
          ref={cardRef}
          comparison={comparison}
          provenance={history.provenance}
          noBackend={noBackend}
          capturedAt={capturedAt}
        />

        <ShareActions share={share} />

        <Text className="text-xs text-gray-600">
          La carte reprend l’état officiel zevent.fr au moment de l’ouverture de cet écran et la
          courbe 2025 figée dans l’application (InGDoc / EvenMoreStats). La projection est une
          estimation tirée du rapport entre les deux éditions, pas une annonce.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
