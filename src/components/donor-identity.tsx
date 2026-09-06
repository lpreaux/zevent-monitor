import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { TopDonor } from '@/api/donations';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { formatCount, formatEuros } from '@/lib/format';
import { icons } from '@/lib/icons';
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
          <Button
            size="sm"
            label="OK"
            accessibilityLabel="Enregistrer mon nom de donateur"
            onPress={save}
          />
          <IconButton
            size="sm"
            tone="muted"
            icon={icons.close}
            label="Annuler"
            onPress={() => setEditing(false)}
          />
        </View>
      </View>
    );
  }

  if (!donorName) {
    return (
      <Button
        block
        size="sm"
        variant="neutral"
        icon="person-outline"
        label="Me repérer dans le classement"
        onPress={startEditing}
      />
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
        <IconButton
          size="sm"
          tone="muted"
          icon="pencil"
          label="Modifier mon nom de donateur"
          onPress={startEditing}
        />
        <IconButton
          size="sm"
          tone="muted"
          icon="trash-outline"
          label="Oublier mon nom de donateur"
          onPress={() => setDonorName(null)}
        />
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
