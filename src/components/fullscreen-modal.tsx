import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

interface FullscreenModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Feuille plein écran générique (graphe, tableau…) avec bouton de fermeture. */
export function FullscreenModal({ visible, onClose, title, children }: FullscreenModalProps) {
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      <SafeAreaView className="flex-1 bg-gray-950" edges={['top', 'bottom', 'left', 'right']}>
        <View className="flex-row items-center justify-between gap-3 px-5 py-3">
          <Text className="flex-1 text-base font-bold text-white" numberOfLines={1}>
            {title ?? ''}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            className="rounded-full bg-gray-800 p-2 active:opacity-70"
          >
            <Ionicons name="close" size={20} color="#f9fafb" />
          </Pressable>
        </View>
        <View className="flex-1 px-4 pb-4">{children}</View>
      </SafeAreaView>
    </Modal>
  );
}
