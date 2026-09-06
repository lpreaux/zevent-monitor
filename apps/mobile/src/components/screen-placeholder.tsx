import type { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenPlaceholderProps = PropsWithChildren<{
  title: string;
  description: string;
}>;

export function ScreenPlaceholder({
  title,
  description,
  children,
}: ScreenPlaceholderProps) {
  return (
    <SafeAreaView className="flex-1 bg-gray-950" edges={['bottom']}>
      <View className="flex-1 justify-center px-6">
        <Text className="text-sm font-semibold uppercase tracking-widest text-zevent-400">
          ZEvent Monitor 2026
        </Text>
        <Text className="mt-3 text-4xl font-bold text-white">{title}</Text>
        <Text className="mt-4 text-base leading-6 text-gray-400">{description}</Text>
        {children}
      </View>
    </SafeAreaView>
  );
}
