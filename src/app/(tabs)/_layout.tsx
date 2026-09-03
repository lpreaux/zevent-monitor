import { Tabs } from 'expo-router';

const tabBarStyle = {
  backgroundColor: '#111827',
  borderTopColor: '#374151',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#111827' },
        headerTintColor: '#f9fafb',
        tabBarActiveTintColor: '#a78bfa',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accueil' }} />
      <Tabs.Screen name="streamers" options={{ title: 'Streamers' }} />
      <Tabs.Screen name="planning" options={{ title: 'Planning' }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats' }} />
      <Tabs.Screen name="recaps" options={{ title: 'Récaps' }} />
    </Tabs>
  );
}
