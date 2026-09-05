import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useCompactOnScroll, type CompactOnScroll } from '@/lib/use-compact-on-scroll';
import { colors } from '@/theme';
import { Segmented } from './segmented';
import { SourceFreshness } from './source-freshness';

type IconName = keyof typeof Ionicons.glyphMap;

/** Bascule posée au bout du rail de tri : elle change ce que la liste contient, pas son ordre. */
export interface ListToggle {
  active: boolean;
  onPress: () => void;
  icon: IconName;
  activeIcon: IconName;
  /** Annonce vocale : le bouton n'affiche qu'une icône. */
  label: string;
}

interface ListControlsProps<T extends string> {
  /** Champ de recherche : rendu seulement si `onSearchChange` est fourni. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Tris proposés. Un seul (ou aucun) : le rail disparaît, seule la recherche reste. */
  sorts?: readonly { key: T; label: string }[];
  sort?: T;
  onSortChange?: (key: T) => void;
  toggle?: ListToggle;
  /**
   * Rangée de filtres propre à l'écran, posée sous les commandes. Comme l'explication,
   * elle s'efface au repli : filtrer se décide en tête de liste, pas en cours de lecture.
   */
  extra?: ReactNode;
  /** Ce que la liste montre à cet instant, après recherche et filtres. */
  summary: string;
  freshness?: { fetchedAt: string | null | undefined; stale: boolean };
  /** Sur quoi le tri courant classe. */
  hint?: string;
  /** Ce que la liste ne montre pas, quand ça mérite d'être dit. */
  note?: string;
  /** Barre repliée, une fois la liste défilée. Voir `useCompactOnScroll`. */
  compact: boolean;
  /**
   * Hauteurs mesurées des deux états, remontées dès qu'elles sont connues. L'écran s'en
   * sert pour deux choses : réserver la place au-dessus de sa liste — la barre flotte,
   * elle ne participe pas au flux, et c'est ce qui empêche son repli de bousculer le
   * défilement — et placer le seuil de bascule à l'endroit exact où le repli ne laisse
   * aucun trou. Voir `collapseThreshold`.
   */
  onHeights?: (heights: ControlsHeights) => void;
}

export interface ControlsHeights {
  expanded: number;
  collapsed: number;
}

/**
 * Hauteurs supposées avant la première mesure. Approximatives mais du bon ordre : elles
 * n'existent que pour éviter que le premier rendu ne démarre collé au haut, la mesure
 * réelle arrivant à la foulée suivante.
 */
export const DEFAULT_CONTROLS_HEIGHTS: ControlsHeights = { expanded: 150, collapsed: 64 };

/**
 * Défilement à partir duquel la barre doit se replier, et en deçà duquel elle doit se
 * redéployer.
 *
 * La réserve laissée en tête de liste vaut la hauteur déployée : à mi-parcours, ce qui
 * dépasse encore sous une barre repliée mesure `expanded - collapsed - y`. Basculer
 * précisément là où cette quantité s'annule fait que le contenu vient toujours affleurer
 * le bas de la barre — trop tôt et il reste un trou, trop tard et il passe dessous alors
 * qu'il y avait encore la place de tout montrer.
 */
export function collapseThreshold({ expanded, collapsed }: ControlsHeights): number {
  return Math.max(0, expanded - collapsed);
}

/**
 * Câblage complet d'une barre flottante : hauteurs mesurées, seuil de repli et réserve à
 * laisser en tête de liste. Les trois vont toujours ensemble — la réserve vaut la hauteur
 * déployée, le seuil vaut ce que le repli fait perdre — et les recopier écran par écran
 * finissait par en désaccorder un.
 */
export function useFloatingControls(): {
  compact: boolean;
  onScroll: CompactOnScroll['onScroll'];
  onHeights: (next: ControlsHeights) => void;
  /** Réserve à poser en tête de contenu, la barre ne participant pas au flux. */
  paddingTop: number;
} {
  const [heights, setHeights] = useState<ControlsHeights>(DEFAULT_CONTROLS_HEIGHTS);
  const { compact, onScroll } = useCompactOnScroll(collapseThreshold(heights));

  // Une hauteur nulle est un relevé qui n'a pas encore eu lieu : on garde la précédente.
  const onHeights = useCallback(
    (next: ControlsHeights) =>
      setHeights((prev) => ({
        expanded: next.expanded || prev.expanded,
        collapsed: next.collapsed || prev.collapsed,
      })),
    [],
  );

  return { compact, onScroll, onHeights, paddingTop: heights.expanded };
}

/** Durée du repli. */
const CONTROLS_TRANSITION_MS = 220;

/** Délai après lequel une hauteur relevée est tenue pour définitive : la fin de l'animation, avec un peu de marge. */
const SETTLE_MS = CONTROLS_TRANSITION_MS + 80;

/** Replié, l'en-tête reste lisible sans réclamer l'attention : il n'est plus le sujet. */
const COMPACT_OPACITY = 0.72;

const transition = LinearTransition.duration(CONTROLS_TRANSITION_MS);

/**
 * En-tête commun aux listes de l'application — streamers, favoris, dons : recherche, tri,
 * filtres, puis ce que la liste montre et la fraîcheur des données. Un seul composant pour
 * toutes — des en-têtes voisins dessinés séparément finissent toujours par diverger d'un
 * padding. Chaque partie est facultative : sans recherche, le rail de tri prend la rangée ;
 * sans tri, la recherche l'occupe seule.
 *
 * Il se replie au défilement plutôt que de disparaître : la recherche perd son cadre, le
 * rail de tri se resserre, le résumé rétrécit, et ce qui n'est que de l'explication — le
 * mode de classement, ce qui manque — s'efface. Rien d'utile ne part : on peut toujours
 * chercher et trier sans remonter.
 *
 * Aucun élément ne change de dessin en chemin, seulement de taille : c'est à cette
 * condition que le passage d'un état à l'autre se laisse animer. Et chacun porte sa
 * propre transition de disposition — un seul voisin non animé au milieu des autres et
 * c'est lui qu'on voit sauter.
 *
 * À poser en absolu au-dessus de la liste, jamais dans le flux au-dessus d'elle : une
 * barre qui rétrécit dans le flux redimensionne sa voisine, et une liste qu'on
 * redimensionne pendant qu'on la fait défiler corrige son offset toute seule. Ces
 * corrections repartaient en événements de défilement, qui repliaient ou dépliaient de
 * nouveau la barre — la boucle se voyait aux sauts, et à la roue de rafraîchissement qui
 * apparaissait en plein milieu de la liste. `onHeights` donne à l'écran de quoi
 * réserver la place correspondante en tête de contenu.
 */
export function ListControls<T extends string>({
  search = '',
  onSearchChange,
  searchPlaceholder,
  sorts = [],
  sort,
  onSortChange,
  toggle,
  extra,
  summary,
  freshness,
  hint,
  note,
  compact,
  onHeights,
}: ListControlsProps<T>) {
  // Écrire dans un champ réclame de la place : tant qu'il a le focus, l'en-tête reste
  // déployé, quoi qu'ait fait le défilement.
  const [focused, setFocused] = useState(false);
  const collapsed = compact && !focused;

  // Les hauteurs sont relevées pendant que la barre s'anime, donc à travers toutes les
  // valeurs intermédiaires. On ne garde que le dernier relevé de chaque état, une fois la
  // mise en page retombée au calme : retenir la plus grande jamais vue serait plus
  // simple, mais la réserve laissée en tête de liste ne pourrait alors que croître — un
  // tri qui ajoute une ligne d'explication, puis un retour en arrière, laisserait un vide
  // que plus rien ne viendrait reprendre.
  const measured = useRef<ControlsHeights>({ expanded: 0, collapsed: 0 });
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    // Un relevé quasi nul arrive avant le premier vrai passage de mise en page.
    if (height < 24) return;

    if (collapsed) measured.current.collapsed = height;
    else measured.current.expanded = height;

    if (settle.current) clearTimeout(settle.current);
    // Émis même incomplet : la hauteur déployée sert dès le premier rendu, bien avant
    // que le premier repli n'ait révélé l'autre. À l'écran de garder ce qu'il sait déjà.
    settle.current = setTimeout(() => onHeights?.({ ...measured.current }), SETTLE_MS);
  };

  const fade = useAnimatedStyle(() => ({
    opacity: withTiming(collapsed ? COMPACT_OPACITY : 1, { duration: CONTROLS_TRANSITION_MS }),
  }));

  const showSorts = sorts.length > 1 && sort !== undefined && onSortChange !== undefined;
  // Sans champ de recherche, le rail de tri prend seul la première rangée.
  const showSearch = Boolean(onSearchChange);

  return (
    <Animated.View
      layout={transition}
      onLayout={handleLayout}
      // Le fond est posé en dur plutôt qu'en classe : la barre flotte au-dessus de la
      // liste, et si l'opacité venait à manquer, le contenu se lirait au travers. Trop
      // structurel pour dépendre d'une classe que la vue animée n'applique pas toujours.
      style={{ backgroundColor: colors.background }}
      className={`border-b border-white/5 px-5 ${collapsed ? 'pb-2 pt-2' : 'pb-3 pt-3'}`}
    >
      {/* Une seule rangée qui se replie : déployée, la recherche prend toute la largeur et
          repousse le tri à la ligne suivante ; repliée, tout tient côte à côte. Passer
          par le retour à la ligne plutôt que par deux dispositions distinctes garde le
          champ de saisie au même endroit de l'arbre — donc le focus et le clavier avec. */}
      <View className={`flex-row flex-wrap items-center ${collapsed ? 'gap-1.5' : 'gap-2'}`}>
        {showSearch ? (
          <Animated.View
            layout={transition}
            style={collapsed ? { flexGrow: 1, flexShrink: 1, flexBasis: 72 } : { width: '100%' }}
            className={
              collapsed
                ? 'flex-row items-center gap-1.5'
                : 'flex-row items-center gap-2 rounded-2xl border border-white/10 bg-surface-raised px-3.5'
            }
          >
            <Ionicons name="search" size={collapsed ? 13 : 16} color="#6b7280" />
            <TextInput
              value={search}
              onChangeText={onSearchChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={searchPlaceholder}
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              className={
                // Assez haut pour rester une cible confortable, pas plus : le champ est en
                // tête d'écran, chaque pixel qu'il prend est pris à la liste.
                collapsed
                  ? 'flex-1 py-1 text-[13px] text-white'
                  : 'flex-1 py-2.5 text-[15px] text-white'
              }
            />
            {search ? (
              <Pressable
                onPress={() => onSearchChange?.('')}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Effacer la recherche"
              >
                <Ionicons name="close-circle" size={collapsed ? 13 : 16} color="#6b7280" />
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}

        {showSorts ? (
          <Animated.View
            layout={transition}
            style={collapsed ? undefined : { flexGrow: 1, flexShrink: 1, flexBasis: 0 }}
          >
            <Segmented compact={collapsed} options={sorts} value={sort} onChange={onSortChange} />
          </Animated.View>
        ) : null}

        {toggle ? (
          <Animated.View layout={transition}>
            <Pressable
              onPress={toggle.onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: toggle.active }}
              accessibilityLabel={toggle.label}
              hitSlop={6}
              className={`items-center justify-center rounded-full border active:opacity-70 ${
                collapsed ? 'h-7 w-7' : 'h-9 w-9'
              } ${
                toggle.active ? 'border-zevent-500 bg-zevent-500/20' : 'border-gray-800 bg-gray-900'
              }`}
            >
              <Ionicons
                name={toggle.active ? toggle.activeIcon : toggle.icon}
                size={collapsed ? 13 : 16}
                color={toggle.active ? '#c4b5fd' : '#9ca3af'}
              />
            </Pressable>
          </Animated.View>
        ) : null}
      </View>

      {!collapsed && extra ? (
        <Animated.View
          layout={transition}
          entering={FadeIn.duration(CONTROLS_TRANSITION_MS)}
          exiting={FadeOut.duration(CONTROLS_TRANSITION_MS / 2)}
          className="pt-2.5"
        >
          {extra}
        </Animated.View>
      ) : null}

      <Animated.View
        layout={transition}
        style={fade}
        className={collapsed ? 'pt-1.5' : 'gap-1.5 pt-2.5'}
      >
        <View className="flex-row items-baseline justify-between gap-3">
          <Text
            numberOfLines={1}
            className={
              collapsed ? 'shrink text-[11px] text-gray-500' : 'shrink text-sm text-gray-400'
            }
          >
            {summary}
          </Text>
          {freshness ? <SourceFreshness {...freshness} compact={collapsed} /> : null}
        </View>

        {/* L'explication est ce qui se perd en premier : on la lit une fois, en arrivant. */}
        {!collapsed && hint ? (
          <Animated.Text
            entering={FadeIn.duration(CONTROLS_TRANSITION_MS)}
            exiting={FadeOut.duration(CONTROLS_TRANSITION_MS / 2)}
            className="text-xs text-gray-600"
          >
            {hint}
          </Animated.Text>
        ) : null}

        {!collapsed && note ? (
          <Animated.Text
            entering={FadeIn.duration(CONTROLS_TRANSITION_MS)}
            exiting={FadeOut.duration(CONTROLS_TRANSITION_MS / 2)}
            className="text-[11px] text-gray-600"
          >
            {note}
          </Animated.Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
