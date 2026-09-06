import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { ShareCapture } from '@/lib/use-share-capture';

/**
 * Les deux sorties d'une carte à partager : l'image, et le texte pour les endroits qui
 * n'en veulent pas. Même paire partout, pour que « partager » ne se présente pas
 * autrement selon l'écran d'où l'on vient.
 */
export function ShareActions({ share }: { share: ShareCapture }) {
  return (
    <View className="gap-2">
      <View className="flex-row gap-3">
        <Pressable
          onPress={() => void share.shareImage()}
          disabled={share.busy}
          accessibilityRole="button"
          accessibilityLabel="Partager la carte en image"
          className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-zevent-500 py-3.5 active:opacity-80"
        >
          <Ionicons name="image-outline" size={18} color="#ffffff" />
          <Text className="text-sm font-bold text-white">Partager l’image</Text>
        </Pressable>
        <Pressable
          onPress={() => void share.shareText()}
          disabled={share.busy}
          accessibilityRole="button"
          accessibilityLabel="Partager en texte"
          className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-zevent-500 py-3.5 active:opacity-80"
        >
          <Ionicons name="text-outline" size={18} color="#ddd6fe" />
          <Text className="text-sm font-bold text-zevent-200">Texte</Text>
        </Pressable>
      </View>

      {share.status.kind === 'error' ? (
        <Text className="text-xs text-red-300">Partage impossible : {share.status.message}</Text>
      ) : share.status.kind === 'busy' ? (
        <Text className="text-xs text-gray-500">Préparation du partage…</Text>
      ) : null}
    </View>
  );
}
