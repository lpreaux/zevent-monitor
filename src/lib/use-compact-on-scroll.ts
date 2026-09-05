import { useCallback, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Repli de la barre de filtres au fil du défilement.
 *
 * En haut de liste, les contrôles ont droit à toute leur place : c'est là qu'on choisit
 * comment lire ce qui suit. Une fois la liste lancée, ils se serrent sur une ligne — on
 * est venu voir des streamers, pas des réglages. Revenir en haut les redéploie.
 *
 * La bascule se joue sur la position atteinte, jamais sur le sens du geste. Suivre la
 * direction paraît plus vivant, mais un doigt posé qui traîne alterne sans cesse entre
 * quelques pixels vers le haut et vers le bas : chaque inversion relançait l'animation
 * depuis son début, et le repli sautait au lieu de se faire une fois.
 *
 * Le seuil vient de l'appelant, qui seul connaît la hauteur de sa barre — le placer au
 * jugé laissait un trou entre le bas de la barre repliée et le début du contenu.
 */

/**
 * Écart entre le seuil de repli et celui de retour. Étroit, parce que le seuil est
 * calculé pour tomber pile où le contenu affleure le bas de la barre : s'en éloigner
 * rouvrirait un trou. Il ne sert plus qu'à éviter qu'un doigt posé exactement dessus ne
 * fasse battre l'en-tête.
 */
const HYSTERESIS = 12;

export interface CompactOnScroll {
  compact: boolean;
  /** À brancher sur `onScroll`, avec `scrollEventThrottle={16}`. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

/**
 * @param collapseAt Défilement à partir duquel se replier, en pixels. Voir
 * `collapseThreshold` : il vaut la hauteur que la barre perd en se repliant, de sorte
 * que la bascule tombe exactement là où le contenu vient affleurer son bas.
 */
export function useCompactOnScroll(collapseAt: number): CompactOnScroll {
  const [compact, setCompact] = useState(false);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const expandAt = Math.max(0, collapseAt - HYSTERESIS);
      // Rendu inchangé quand la valeur ne change pas : React s'arrête là, malgré un
      // événement par image.
      setCompact((current) => (current ? y > expandAt : y >= collapseAt));
    },
    [collapseAt],
  );

  return { compact, onScroll };
}
