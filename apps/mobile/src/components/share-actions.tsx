import { Text, View } from 'react-native';

import { Button, ButtonRow } from '@/components/ui/button';
import type { ShareCapture } from '@/lib/use-share-capture';

/**
 * Les deux sorties d'une carte à partager : l'image, et le texte pour les endroits qui
 * n'en veulent pas. Même paire partout, pour que « partager » ne se présente pas
 * autrement selon l'écran d'où l'on vient.
 */
export function ShareActions({ share }: { share: ShareCapture }) {
  return (
    <View className="gap-2">
      <ButtonRow>
        <Button
          grow
          size="lg"
          icon="image-outline"
          label="Partager l’image"
          accessibilityLabel="Partager la carte en image"
          disabled={share.busy}
          onPress={() => void share.shareImage()}
        />
        <Button
          grow
          size="lg"
          variant="secondary"
          icon="text-outline"
          label="Texte"
          accessibilityLabel="Partager en texte"
          disabled={share.busy}
          onPress={() => void share.shareText()}
        />
      </ButtonRow>

      {share.status.kind === 'error' ? (
        <Text className="text-xs text-red-300">Partage impossible : {share.status.message}</Text>
      ) : share.status.kind === 'busy' ? (
        <Text className="text-xs text-gray-500">Préparation du partage…</Text>
      ) : null}
    </View>
  );
}
