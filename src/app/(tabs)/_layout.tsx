import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { AppTabBar } from '@/components/app-tab-bar';

type IconName = keyof typeof Ionicons.glyphMap;

/** Icône d'onglet : variante pleine quand l'onglet est actif, contour sinon. */
function TabBarIcon({
  name,
  color,
  size,
  focused,
}: {
  name: IconName;
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IconName)}
      color={color}
      size={size}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      // Chaque écran fournit sa propre barre du haut (`AppHeader`), plus riche que
      // le titre par défaut : mode de l'événement, compteurs, actions.
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: (props) => <TabBarIcon name="home" {...props} />,
        }}
      />
      <Tabs.Screen
        name="streamers"
        options={{
          title: 'Streamers',
          tabBarIcon: (props) => <TabBarIcon name="people" {...props} />,
        }}
      />
      <Tabs.Screen
        name="donations"
        options={{
          title: 'Dons',
          tabBarIcon: (props) => <TabBarIcon name="heart" {...props} />,
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: 'Planning',
          tabBarIcon: (props) => <TabBarIcon name="calendar" {...props} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: (props) => <TabBarIcon name="stats-chart" {...props} />,
        }}
      />
      <Tabs.Screen
        name="recaps"
        options={{
          title: 'Récaps',
          tabBarIcon: (props) => <TabBarIcon name="newspaper" {...props} />,
        }}
      />
    </Tabs>
  );
}
