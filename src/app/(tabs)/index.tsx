import { Text, View } from 'react-native';

import { ScreenPlaceholder } from '@/components/screen-placeholder';

export default function DashboardScreen() {
  return (
    <ScreenPlaceholder
      title="Prêt pour le direct"
      description="La navigation Expo et les styles NativeWind sont opérationnels. Les données temps réel seront branchées à l’étape suivante."
    >
      <View className="mt-8 rounded-2xl border border-zevent-500/40 bg-zevent-500/10 p-5">
        <Text className="text-sm text-gray-300">Cagnotte globale</Text>
        <Text className="mt-2 text-3xl font-bold text-white">— €</Text>
      </View>
    </ScreenPlaceholder>
  );
}
