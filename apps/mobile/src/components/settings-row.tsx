import type { ReactNode } from 'react';
import { Switch, Text, View } from 'react-native';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <View className="gap-3 rounded-3xl border border-gray-800 bg-gray-900/60 p-4">
      <View className="gap-1">
        <Text className="text-base font-bold text-white">{title}</Text>
        {description ? <Text className="text-xs text-gray-400">{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}

/** Un interrupteur par catégorie : chaque réglage est indépendant des autres. */
export function SwitchRow({ label, hint, value, disabled, onValueChange }: SwitchRowProps) {
  return (
    <View className={`flex-row items-center gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold text-gray-100">{label}</Text>
        {hint ? <Text className="text-xs text-gray-500">{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: '#374151', true: '#7c3aed' }}
        thumbColor={value ? '#ddd6fe' : '#9ca3af'}
      />
    </View>
  );
}
