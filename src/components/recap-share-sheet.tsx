import { useRef } from 'react';
import { Text, View } from 'react-native';

import type { Recap } from '@/api/recaps';
import { FullscreenModal } from '@/components/fullscreen-modal';
import { RecapSparkline } from '@/components/recap-sparkline';
import { ShareActions } from '@/components/share-actions';
import { formatCount, formatEuros } from '@/lib/format';
import { buildRecapShareText, recapSubtitle, recapTitle } from '@/lib/recap-view';
import { useShareCapture } from '@/lib/use-share-capture';

interface RecapShareSheetProps {
  visible: boolean;
  recap: Recap;
  onClose: () => void;
}

/**
 * Partage d'un récap, avec la carte sous les yeux avant de l'envoyer.
 *
 * Montrer l'image plutôt que la produire en coulisse : on partage ce qu'on a vu, et la
 * capture porte sur une vue réellement dessinée à l'écran — une carte rendue hors cadre
 * revient vide sur certains appareils.
 */
export function RecapShareSheet({ visible, recap, onClose }: RecapShareSheetProps) {
  const cardRef = useRef<View>(null);
  const share = useShareCapture(cardRef, () => buildRecapShareText(recap), 'Partager ce récap');
  const { summary, counts } = recap.content;
  const points = recap.content.series?.points.map((point) => point.cents) ?? [];

  return (
    <FullscreenModal visible={visible} onClose={onClose} title="Partager ce récap">
      <View className="gap-4">
        <View
          ref={cardRef}
          collapsable={false}
          style={{ backgroundColor: '#12082b' }}
          className="gap-5 rounded-3xl border border-zevent-500/40 p-6"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-widest text-zevent-300">
              ZEvent 2026
            </Text>
            <Text className="text-xs text-gray-400">{recapTitle(recap)}</Text>
          </View>

          <View>
            <Text className="text-sm text-gray-300">{recapSubtitle(recap)}</Text>
            <Text
              className="mt-1 text-5xl font-extrabold text-white"
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              +{formatEuros(summary.raisedCents / 100)}
            </Text>
            {summary.endCents !== null ? (
              <Text className="mt-1 text-base font-semibold text-zevent-200">
                cagnotte à {formatEuros(summary.endCents / 100)}
              </Text>
            ) : null}
          </View>

          {points.length > 1 ? <RecapSparkline points={points} height={46} /> : null}

          <View className="flex-row gap-3">
            <View className="flex-1 rounded-2xl bg-white/5 p-3">
              <Text className="text-[11px] uppercase tracking-wider text-gray-400">Goals</Text>
              <Text className="mt-0.5 text-xl font-bold text-white">{counts.goalsReached}</Text>
            </View>
            <View className="flex-1 rounded-2xl bg-white/5 p-3">
              <Text className="text-[11px] uppercase tracking-wider text-gray-400">Pic viewers</Text>
              <Text className="mt-0.5 text-xl font-bold text-white">
                {formatCount(summary.peakViewers)}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-400">zevent.fr/don</Text>
            <Text className="text-xs text-gray-600">ZEvent Monitor</Text>
          </View>
        </View>

        <ShareActions share={share} />

      </View>
    </FullscreenModal>
  );
}
