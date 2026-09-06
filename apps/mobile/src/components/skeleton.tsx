import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/** Battement du squelette : lent, pour signaler l'attente sans attirer l'œil. */
const PULSE_MS = 900;

interface SkeletonBlockProps {
  width: DimensionValue;
  height: number;
  radius?: number;
}

/** Pavé gris qui respire, à la place d'un contenu qui arrive. */
export function SkeletonBlock({ width, height, radius = 6 }: SkeletonBlockProps) {
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.8, { duration: PULSE_MS }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        style,
        { width, height, borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.08)' },
      ]}
    />
  );
}

/**
 * Attente du feed de dons, dessinée à la forme de ce qui va s'afficher plutôt qu'en roue
 * qui tourne : la page ne bouge plus au moment où les vraies lignes prennent la place, et
 * l'on sait déjà ce qu'on attend.
 */
export function DonationsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View accessibilityLabel="Chargement des dons" className="gap-4 py-2">
      {[...Array(rows)].map((_, index) => (
        <View key={index} className="flex-row gap-3 px-2">
          <View className="w-[86px] items-end gap-1.5">
            <SkeletonBlock width={64} height={13} />
            <SkeletonBlock width={40} height={9} />
          </View>
          <View className="flex-1 gap-1.5">
            <SkeletonBlock width={index % 3 === 0 ? '55%' : '38%'} height={12} />
            {index % 2 === 0 ? <SkeletonBlock width="88%" height={11} /> : null}
            <SkeletonBlock width="30%" height={9} />
          </View>
        </View>
      ))}
    </View>
  );
}
