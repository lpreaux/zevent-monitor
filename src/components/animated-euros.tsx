import { useEffect } from 'react';
import { StyleSheet, TextInput, type TextInputProps, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Regroupement des milliers exécuté sur le thread UI. */
function formatWorklet(value: number): string {
  'worklet';
  const rounded = Math.round(value > 0 ? value : 0);
  const digits = String(rounded);
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ' ';
    out += digits[i];
  }
  return `${out} €`;
}

interface AnimatedEurosProps {
  value: number;
  style?: TextStyle | TextStyle[];
  durationMs?: number;
}

/**
 * Compteur d'euros qui défile jusqu'à `value` (astuce `animatedProps.text` sur un
 * TextInput non éditable : la mise à jour reste sur le thread UI).
 */
export function AnimatedEuros({ value, style, durationMs = 900 }: AnimatedEurosProps) {
  const progress = useSharedValue(value);

  useEffect(() => {
    progress.value = withTiming(value, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [value, durationMs, progress]);

  const animatedProps = useAnimatedProps(() => {
    const text = formatWorklet(progress.value);
    // `text` est un prop natif du TextInput non exposé par les types RN.
    return { text, defaultValue: text } as unknown as Partial<TextInputProps>;
  });

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      scrollEnabled={false}
      style={[styles.base, style]}
      defaultValue={formatWorklet(value)}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    color: '#ffffff',
    fontSize: 44,
    fontWeight: '800',
    padding: 0,
  },
});
