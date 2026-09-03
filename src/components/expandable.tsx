import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { FullscreenModal } from './fullscreen-modal';

interface ExpandableProps {
  title?: string;
  /** Contenu inline, également affiché en plein écran si `expanded` n'est pas fourni. */
  children: ReactNode;
  /** Variante affichée en plein écran (ex. graphe plus haut, tableau défilant). */
  expanded?: ReactNode;
}

/** Rend son contenu avec une pastille « agrandir » ; un tap l'ouvre en plein écran. */
export function Expandable({ title, children, expanded }: ExpandableProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title ? `Agrandir : ${title}` : 'Agrandir'}
      >
        {children}
        <View
          pointerEvents="none"
          className="absolute left-2 top-2 rounded-full bg-gray-900/85 p-1.5"
        >
          <Ionicons name="expand" size={13} color="#9ca3af" />
        </View>
      </Pressable>

      <FullscreenModal visible={open} onClose={() => setOpen(false)} title={title}>
        {expanded ?? children}
      </FullscreenModal>
    </View>
  );
}
