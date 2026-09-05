import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { TopDonor } from '@/api/donations';
import { formatCount, formatEuros } from '@/lib/format';
import { useDonationsPrefs } from '@/store/donations';

interface DonorIdentityProps {
  /** Place trouvée dans le classement chargé, `null` si le nom n'y figure pas. */
  standing: TopDonor | null;
  /** Profondeur du classement chargé : ce que « absent » veut dire ici. */
  depth: number;
  /** Fenêtre du classement, en toutes lettres (« sur les 24 dernières heures »). */
  windowLabel: string;
}

/**
 * « Me repérer dans le classement ».
 *
 * Les dons ne sont rattachés à aucun compte : Streamlabs ne connaît qu'un nom saisi à la
 * main, don par don. On ne peut donc pas reconnaître l'utilisateur — seulement lui
 * proposer de déclarer sous quel nom il donne, et surligner ce nom là où il apparaît. Le
 * nom reste sur l'appareil : rien ne prouve qu'il appartienne à qui le saisit.
 */
export function DonorIdentity({ standing, depth, windowLabel }: DonorIdentityProps) {
  const donorName = useDonationsPrefs((s) => s.donorName);
  const setDonorName = useDonationsPrefs((s) => s.setDonorName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEditing = () => {
    setDraft(donorName ?? '');
    setEditing(true);
  };

  const save = () => {
    setDonorName(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <View className="gap-2 rounded-2xl border border-white/10 bg-surface-raised p-3">
        <Text className="text-[11px] text-gray-500">
          Le nom que vous laissez en donnant, tel qu’il s’affiche sur le classement.
        </Text>
        <View className="flex-row items-center gap-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Votre nom de donateur"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
            maxLength={60}
            className="flex-1 rounded-xl border border-white/10 bg-gray-900 px-3 py-2 text-sm text-white"
          />
          <Pressable
            onPress={save}
            accessibilityRole="button"
            accessibilityLabel="Enregistrer mon nom de donateur"
            className="rounded-full bg-zevent-500 px-3.5 py-2 active:opacity-80"
          >
            <Text className="text-xs font-bold text-white">OK</Text>
          </Pressable>
          <Pressable
            onPress={() => setEditing(false)}
            accessibilityRole="button"
            accessibilityLabel="Annuler"
            hitSlop={8}
            className="px-1 active:opacity-60"
          >
            <Ionicons name="close" size={18} color="#9ca3af" />
          </Pressable>
        </View>
      </View>
    );
  }

  if (!donorName) {
    return (
      <Pressable
        onPress={startEditing}
        accessibilityRole="button"
        className="flex-row items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-2.5 active:opacity-60"
      >
        <Ionicons name="person-outline" size={13} color="#9ca3af" />
        <Text className="text-xs font-semibold text-gray-300">Me repérer dans le classement</Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-1.5 rounded-2xl border border-zevent-500/30 bg-zevent-500/10 p-3">
      <View className="flex-row items-center gap-2">
        <Ionicons name="person" size={13} color="#c4b5fd" />
        <Text numberOfLines={1} className="shrink text-sm font-semibold text-white">
          {donorName}
        </Text>
        <View className="flex-1" />
        <Pressable
          onPress={startEditing}
          accessibilityRole="button"
          accessibilityLabel="Modifier mon nom de donateur"
          hitSlop={8}
          className="active:opacity-60"
        >
          <Ionicons name="pencil" size={14} color="#9ca3af" />
        </Pressable>
        <Pressable
          onPress={() => setDonorName(null)}
          accessibilityRole="button"
          accessibilityLabel="Oublier mon nom de donateur"
          hitSlop={8}
          className="ml-3 active:opacity-60"
        >
          <Ionicons name="trash-outline" size={14} color="#9ca3af" />
        </Pressable>
      </View>

      {standing ? (
        <Text className="text-[11px] text-zevent-200">
          {standing.rank}
          {standing.rank === 1 ? 'er' : 'e'} {windowLabel} · {formatEuros(standing.totalCents / 100)}{' '}
          en {formatCount(standing.count)} don{standing.count > 1 ? 's' : ''}
        </Text>
      ) : (
        <Text className="text-[11px] text-gray-500">
          Hors des {formatCount(depth)} premiers {windowLabel}. Les dons anonymes ne sont pas
          classés, et un même nom peut regrouper plusieurs personnes.
        </Text>
      )}
    </View>
  );
}
