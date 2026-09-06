import type { ReactNode } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui/icon-button';
import { icons } from '@/lib/icons';

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
          <IconButton variant="overlay" icon={icons.close} label="Fermer" onPress={onClose} />
        </View>
        <View className="flex-1 px-4 pb-4">{children}</View>
      </SafeAreaView>
    </Modal>
  );
}
