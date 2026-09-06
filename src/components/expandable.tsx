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
  /**
   * Décalage de la pastille depuis le haut du contenu.
   *
   * Elle doit tomber dans le cadre du graphe, et un graphe ne commence pas toujours par
   * son cadre : celui qui se lit au doigt réserve une ligne au-dessus pour la valeur
   * relevée, et la pastille posée à huit pixels du haut atterrissait alors sur ce texte.
   */
  handleTop?: number;
}

/**
 * Rend son contenu avec une pastille « agrandir » qui l'ouvre en plein écran.
 *
 * Seule la pastille est pressable, jamais le contenu. Envelopper celui-ci dans un bouton
 * était plus commode à viser, mais le bouton prenait le geste dès le premier contact :
 * les courbes qui se lisent au doigt ne recevaient plus rien, puisqu'elles n'attendent
 * le leur qu'au mouvement — et il ne restait plus personne pour le leur céder. C'est
 * aussi ce qui faisait annoncer « bouton Agrandir » par le lecteur d'écran sur toute la
 * surface d'un graphe.
 */
export function Expandable({ title, children, expanded, handleTop = 8 }: ExpandableProps) {
  const [open, setOpen] = useState(false);

  return (
    <View>
      {children}

      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title ? `Agrandir : ${title}` : 'Agrandir'}
        hitSlop={10}
        // Posé au-dessus du tracé : le SVG d'une courbe monte lui-même en `zIndex` à
        // l'intérieur de son cadre, et sur Android un frère sans rang finit dessous.
        style={{ position: 'absolute', left: 8, top: handleTop, zIndex: 3 }}
        className="rounded-full bg-gray-900/85 p-1.5 active:opacity-60"
      >
        <Ionicons name="expand" size={13} color="#9ca3af" />
      </Pressable>

      <FullscreenModal visible={open} onClose={() => setOpen(false)} title={title}>
        {expanded ?? children}
      </FullscreenModal>
    </View>
  );
}
