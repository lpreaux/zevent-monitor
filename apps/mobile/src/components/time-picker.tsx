import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;
const COLUMN_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

const pad = (value: number): string => String(value).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export const isTimeValue = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function parse(value: string, minuteStep: number): { hour: number; minute: number } {
  const [hour = 0, minute = 0] = value.split(':').map(Number);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 0;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  return { hour: safeHour, minute: Math.round(safeMinute / minuteStep) * minuteStep % 60 };
}

interface ColumnProps {
  label: string;
  values: number[];
  value: number;
  onChange: (value: number) => void;
}

/**
 * Colonne de valeurs : on choisit d'une simple pression, sans calage de défilement.
 * C'est plus tolérant qu'une roue à inertie sur un écran tactile en une main.
 */
function Column({ label, values, value, onChange }: ColumnProps) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const index = values.indexOf(value);
    if (index < 0) return;
    // Centre la valeur courante à l'ouverture, sans animation pour éviter le à-coup.
    const offset = Math.max(0, index * ITEM_HEIGHT - (COLUMN_HEIGHT - ITEM_HEIGHT) / 2);
    const timer = setTimeout(() => ref.current?.scrollTo({ y: offset, animated: false }), 0);
    return () => clearTimeout(timer);
    // Uniquement au montage : ensuite l'utilisateur maîtrise le défilement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View className="flex-1 gap-2">
      <Text className="text-center text-xs uppercase tracking-wider text-gray-500">{label}</Text>
      <View
        className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950"
        style={{ height: COLUMN_HEIGHT }}
      >
        <ScrollView
          ref={ref}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
        >
          {values.map((item) => {
            const active = item === value;
            return (
              <Pressable
                key={item}
                onPress={() => onChange(item)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label} ${pad(item)}`}
                style={{ height: ITEM_HEIGHT }}
                className={`items-center justify-center ${active ? 'bg-zevent-500/20' : ''}`}
              >
                <Text
                  className={`text-xl ${active ? 'font-black text-zevent-200' : 'text-gray-400'}`}
                >
                  {pad(item)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

interface TimePickerProps {
  visible: boolean;
  /** Valeur initiale `HH:MM`. */
  value: string;
  title: string;
  confirmLabel?: string;
  /** Horaires déjà pris : la confirmation est bloquée dessus. */
  taken?: readonly string[];
  minuteStep?: number;
  presets?: readonly string[];
  onCancel: () => void;
  onConfirm: (time: string) => void;
}

/**
 * Sélecteur d'heure sans dépendance native : deux colonnes tactiles et quelques
 * raccourcis, à la place d'une saisie clavier « HH:MM » que l'on tape de travers.
 */
export function TimePicker({ visible, value, ...rest }: TimePickerProps) {
  // Monté seulement à l'ouverture : la valeur d'entrée sert alors d'état initial frais.
  if (!visible) return null;
  return <TimePickerSheet value={value} {...rest} />;
}

function TimePickerSheet({
  value,
  title,
  confirmLabel = 'Valider',
  taken = [],
  minuteStep = 5,
  presets = [],
  onCancel,
  onConfirm,
}: Omit<TimePickerProps, 'visible'>) {
  const initial = parse(value, minuteStep);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, i) => i * minuteStep);
  const selected = `${pad(hour)}:${pad(minute)}`;
  const duplicate = taken.includes(selected);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 justify-end bg-black/70" onPress={onCancel} accessibilityLabel="Fermer">
        <Pressable
          onPress={() => {}}
          className="gap-4 rounded-t-3xl border-t border-gray-800 bg-gray-900 p-5 pb-8"
        >
          <View className="items-center gap-1">
            <View className="h-1 w-10 rounded-full bg-gray-700" />
            <Text className="mt-2 text-base font-bold text-white">{title}</Text>
            <Text className="text-3xl font-black tracking-widest text-zevent-200">{selected}</Text>
          </View>

          {presets.length > 0 ? (
            <View className="flex-row flex-wrap justify-center gap-2">
              {presets.map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => {
                    const parsed = parse(preset, minuteStep);
                    setHour(parsed.hour);
                    setMinute(parsed.minute);
                  }}
                  className={`rounded-full border px-3 py-1.5 ${
                    preset === selected
                      ? 'border-zevent-500 bg-zevent-500/20'
                      : 'border-gray-800 bg-gray-950'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      preset === selected ? 'text-zevent-200' : 'text-gray-400'
                    }`}
                  >
                    {preset}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View className="flex-row gap-3">
            <Column label="Heure" values={HOURS} value={hour} onChange={setHour} />
            <Column label="Minute" values={minutes} value={minute} onChange={setMinute} />
          </View>

          {duplicate ? (
            <Text className="text-center text-xs text-amber-300">
              Cet horaire est déjà programmé.
            </Text>
          ) : null}

          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancel}
              className="flex-1 items-center rounded-2xl border border-gray-700 bg-gray-950 py-3 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-gray-300">Annuler</Text>
            </Pressable>
            <Pressable
              disabled={duplicate}
              onPress={() => onConfirm(selected)}
              className={`flex-1 items-center rounded-2xl py-3 active:opacity-80 ${
                duplicate ? 'bg-gray-800' : 'bg-zevent-500'
              }`}
            >
              <Text className={`text-sm font-bold ${duplicate ? 'text-gray-500' : 'text-white'}`}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
