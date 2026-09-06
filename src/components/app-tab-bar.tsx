import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { colors } from '@/theme';

interface TabItemProps {
  label: string;
  icon: ReactNode;
  focused: boolean;
  accessibilityLabel?: string;
  onPress: () => void;
  onLongPress: () => void;
}

/** Un onglet : la pastille derrière l'icône apparaît en fondu sur l'onglet actif. */
function TabItem({ label, icon, focused, accessibilityLabel, onPress, onLongPress }: TabItemProps) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.8 + progress.value * 0.2 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      className="flex-1 items-center gap-1 py-1 active:opacity-70"
    >
      <View className="h-8 w-14 items-center justify-center">
        <Animated.View
          className="rounded-full bg-zevent-500/25"
          style={[StyleSheet.absoluteFill, pillStyle]}
        />
        {icon}
      </View>
      <Text
        numberOfLines={1}
        className={`text-[10px] font-semibold ${focused ? 'text-zevent-200' : 'text-gray-500'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Rangée d'onglets du socle : pastille animée sur l'onglet actif, icônes puisées dans les
 * `tabBarIcon` déclarés par le layout.
 *
 * Elle ne porte plus ni surface, ni bordure, ni marge de zone sûre : le socle qui la
 * contient est la pièce de mobilier, elle n'en est que l'étage du bas. Les faire porter
 * ici donnerait un filet au milieu du bloc, à l'endroit précis où il ne doit pas y en
 * avoir pour que la poignée, la ligne globale et les onglets se lisent d'un seul tenant.
 */
export function TabRow({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View className="flex-row px-1.5 pt-2">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? colors.brandSoft : colors.inactive;

        return (
          <TabItem
            key={route.key}
            label={options.title ?? route.name}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            icon={options.tabBarIcon?.({ focused, color, size: 22 })}
            focused={focused}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          />
        );
      })}
    </View>
  );
}
