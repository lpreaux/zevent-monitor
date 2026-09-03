import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export function LoadingState({ label = 'Chargement…' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-gray-950 px-6">
      <ActivityIndicator color="#a78bfa" />
      <Text className="text-sm text-gray-400">{label}</Text>
    </View>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-gray-950 px-6">
      <Text className="text-center text-base text-gray-300">{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          className="rounded-full bg-zevent-500 px-5 py-2.5 active:opacity-80"
        >
          <Text className="text-sm font-semibold text-white">Réessayer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View className="items-center justify-center px-6 py-16">
      <Text className="text-center text-sm text-gray-500">{message}</Text>
    </View>
  );
}
