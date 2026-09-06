import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { icons } from '@/lib/icons';
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

      {/* Posé au-dessus du tracé : le SVG d'une courbe monte lui-même en `zIndex` à
          l'intérieur de son cadre, et sur Android un frère sans rang finit dessous. */}
      <View style={{ position: 'absolute', left: 8, top: handleTop, zIndex: 3 }}>
        <IconButton
          size="sm"
          variant="overlay"
          tone="muted"
          icon={icons.fullscreen}
          label={title ? `Agrandir : ${title}` : 'Agrandir'}
          onPress={() => setOpen(true)}
        />
      </View>

      <FullscreenModal visible={open} onClose={() => setOpen(false)} title={title}>
        {expanded ?? children}
      </FullscreenModal>
    </View>
  );
}
