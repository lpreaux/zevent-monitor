import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import type { Recap } from '@/api/recaps';
import { FullscreenModal } from '@/components/fullscreen-modal';
import { RecapSparkline } from '@/components/recap-sparkline';
import { formatCount, formatEuros } from '@/lib/format';
import { buildRecapShareText, recapSubtitle, recapTitle } from '@/lib/recap-view';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; message: string };

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
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const { summary, counts } = recap.content;
  const points = recap.content.series?.points.map((point) => point.cents) ?? [];

  const fail = (error: unknown) =>
    setStatus({
      kind: 'error',
      message: error instanceof Error ? error.message : 'Partage impossible',
    });

  const shareText = useCallback(async () => {
    setStatus({ kind: 'busy' });
    try {
      await Share.share({ message: buildRecapShareText(recap) });
      setStatus({ kind: 'idle' });
    } catch (error) {
      fail(error);
    }
  }, [recap]);

  const shareImage = useCallback(async () => {
    setStatus({ kind: 'busy' });
    try {
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        await Share.share({ message: buildRecapShareText(recap) });
        setStatus({ kind: 'idle' });
        return;
      }
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Partager ce récap' });
      setStatus({ kind: 'idle' });
    } catch (error) {
      fail(error);
    }
  }, [recap]);

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

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => void shareImage()}
            disabled={status.kind === 'busy'}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-zevent-500 py-3.5 active:opacity-80"
          >
            <Ionicons name="image-outline" size={18} color="#ffffff" />
            <Text className="text-sm font-bold text-white">Partager l’image</Text>
          </Pressable>
          <Pressable
            onPress={() => void shareText()}
            disabled={status.kind === 'busy'}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-zevent-500 py-3.5 active:opacity-80"
          >
            <Ionicons name="text-outline" size={18} color="#ddd6fe" />
            <Text className="text-sm font-bold text-zevent-200">Texte</Text>
          </Pressable>
        </View>

        {status.kind === 'error' ? (
          <Text className="text-xs text-red-300">Partage impossible : {status.message}</Text>
        ) : status.kind === 'busy' ? (
          <Text className="text-xs text-gray-500">Préparation du partage…</Text>
        ) : null}
      </View>
    </FullscreenModal>
  );
}
