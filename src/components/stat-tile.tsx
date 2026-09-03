import { Text, View } from 'react-native';

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
}

export function StatTile({ label, value, hint }: StatTileProps) {
  return (
    <View className="flex-1 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <Text className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</Text>
      <Text className="mt-1 text-2xl font-bold text-white">{value}</Text>
      {hint ? <Text className="mt-0.5 text-xs text-gray-500">{hint}</Text> : null}
    </View>
  );
}
