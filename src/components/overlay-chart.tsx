import { useMemo, useState } from 'react';
import {
  PanResponder,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import {
  minutesAtX,
  readSeriesAt,
  scrubCaption,
  valueRatio,
  xAtMinutes,
} from '@/lib/chart-scrub';
import { formatElapsedLabel } from '@/lib/stats-edition';
import type { ElapsedPoint } from '@/lib/timeseries';
import { colors } from '@/theme';

export interface ChartSeries {
  id: string;
  label: string;
  /** Couleur hex `#rrggbb` (une aire translucide de la même teinte est dérivée). */
  color: string;
  points: ElapsedPoint[];
}

/**
 * Lecture au doigt. Absente, le graphe reste ce qu'il était : une image, sans le moindre
 * gestionnaire tactile — c'est ce que la moitié des appels attendent (vignettes, cartes de
 * partage, aperçus repliés, où un geste n'aurait nulle part où s'afficher).
 */
export interface ChartScrub {
  /** Mise en forme des montants relevés — l'échelle est celle de l'écran, pas du graphe. */
  formatValue: (value: number) => string;
  /**
   * Mise en forme de l'instant. Par défaut le temps écoulé (« T+18 h ») : c'est l'axe des
   * comparaisons entre éditions. Un graphe dont l'axe X porte des heures de la journée
   * passera la conversion qui va avec.
   */
  formatX?: (minutes: number) => string;
}

interface OverlayChartProps {
  series: ChartSeries[];
  /** Étendue de l'axe X en minutes écoulées. */
  maxMinutes: number;
  /** Étendue de l'axe Y (même unité que `points[].eur`). */
  yMax: number;
  /**
   * Bas de l'axe Y, zéro par défaut.
   *
   * Une cagnotte ne redescend jamais : sur une fenêtre d'une heure, tracée depuis zéro,
   * elle donne une ligne plate collée en haut du cadre. Relever le plancher au pied de la
   * tranche est la seule façon d'y voir la pente.
   */
  yMin?: number;
  height?: number;
  referenceLines?: { value: number; label: string }[];
  xTicks?: { minutes: number; label: string }[];
  /** Lecture au doigt, désactivée tant qu'elle n'est pas demandée. */
  scrub?: ChartScrub;
}

const STROKE = 2;

/** Pastille posée sur chaque tracé à l'instant lu, et son liseré sombre qui l'en détache. */
const DOT = 8;
const DOT_RING = 2;

/**
 * Seuils de reconnaissance du geste de lecture : déplacement minimal avant de trancher, et
 * rapport horizontal/vertical exigé. Voir la négociation du responder, plus bas.
 *
 * Tenus bas volontairement. Un doigt qui suit une courbe ne trace pas une horizontale
 * parfaite, et chaque cran d'exigence supplémentaire se paie en gestes qui n'ont
 * simplement rien déclenché — le pire retour possible, puisque rien ne distingue alors un
 * seuil trop haut d'une fonction absente. Un défilement vertical, lui, garde une marge
 * confortable : son `dy` dépasse son `dx` d'un tout autre ordre.
 */
const SCRUB_SLOP_PX = 6;
const SCRUB_DIRECTION_RATIO = 1.2;

/** Ce que le bandeau dit au repos — c'est aussi la seule annonce du geste. */
const SCRUB_IDLE_HINT = 'Glissez sur la courbe pour lire une valeur';

/**
 * Hauteur du bandeau de lecture, réservée en permanence dès que le graphe se lit au
 * doigt. Exportée parce que ce qui vient se poser sur le cadre — la pastille
 * d'agrandissement — doit savoir de combien celui-ci est décalé vers le bas.
 */
export const SCRUB_CAPTION_HEIGHT = 20;

/** Hauteur d'un libellé de repère, en pixels : de quoi le poser juste au-dessus de son trait. */
const LABEL_HEIGHT = 14;

/**
 * Largeur allouée à un libellé de graduation, assez large pour « T+12 h » ou « 03h20 ».
 * Elle n'est là que pour permettre le centrage : sans boîte, un texte absolument
 * positionné n'a pas de milieu à aligner sur son trait.
 */
const TICK_WIDTH = 56;

/** Nombre de crans parcourant le graphe au lecteur d'écran. */
const SCRUB_STEPS = 20;

const SCRUB_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface SeriesPaths {
  id: string;
  color: string;
  line: string;
  area: string;
}

/** Construit le tracé (`line`) et l'aire fermée (`area`) d'une série, en pixels. */
function buildPaths(
  points: ElapsedPoint[],
  width: number,
  height: number,
  maxMinutes: number,
  yMax: number,
  yMin: number,
): { line: string; area: string } | null {
  const usable = points
    .filter((p) => Number.isFinite(p.minutes) && Number.isFinite(p.eur))
    .sort((a, b) => a.minutes - b.minutes);
  const span = yMax - yMin;
  if (usable.length < 2 || maxMinutes <= 0 || span <= 0 || width <= 0) return null;

  const xAt = (minutes: number) => xAtMinutes(minutes, width, maxMinutes);
  const yAt = (eur: number) => height - valueRatio(eur, yMin, yMax) * height;

  let line = '';
  for (let i = 0; i < usable.length; i += 1) {
    const x = xAt(usable[i].minutes);
    const y = yAt(usable[i].eur);
    line += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    if (i < usable.length - 1) line += ' ';
  }

  const firstX = xAt(usable[0].minutes);
  const lastX = xAt(usable[usable.length - 1].minutes);
  const area = `M${firstX.toFixed(2)} ${height} L${line.slice(1)} L${lastX.toFixed(2)} ${height} Z`;

  return { line, area };
}

/**
 * Courbes de collecte superposées. Le tracé de chaque série est une **ligne
 * continue** (un seul `Path` SVG) surmontant une aire translucide ; repères et
 * graduations restent des `View`. Les séries sont empilées dans l'ordre reçu.
 *
 * Avec `scrub`, le graphe se laisse lire au doigt : une ligne verticale suit le geste, une
 * pastille marque chaque tracé, et le détail se lit dans un bandeau posé **au-dessus** du
 * cadre — jamais sous le doigt, qui masque exactement ce qu'il désigne. Ce bandeau garde sa
 * hauteur en permanence : apparaissant au premier contact, il décalerait le graphe de vingt
 * pixels au moment précis où l'on vise un point dessus.
 */
export function OverlayChart({
  series,
  maxMinutes,
  yMax,
  yMin = 0,
  height = 200,
  referenceLines = [],
  xTicks = [],
  scrub,
}: OverlayChartProps) {
  const [width, setWidth] = useState(0);
  /** Instant lu, `null` au repos — le doigt n'est pas sur le graphe. */
  const [scrubMinutes, setScrubMinutes] = useState<number | null>(null);
  const safeYMin = Number.isFinite(yMin) ? yMin : 0;
  const safeYMax = yMax > safeYMin ? yMax : safeYMin + 1;

  const paths = useMemo<SeriesPaths[]>(() => {
    if (width <= 0) return [];
    const out: SeriesPaths[] = [];
    for (const s of series) {
      const built = buildPaths(s.points, width, height, maxMinutes, safeYMax, safeYMin);
      if (built) out.push({ id: s.id, color: s.color, ...built });
    }
    return out;
  }, [series, width, height, maxMinutes, safeYMax, safeYMin]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  // Le responder ferme sur la géométrie du cadre, et se refait quand elle change — mise en
  // page, ou fenêtre de données rafraîchie en direct. Cette reconstruction ne perturbe pas
  // un geste en cours : chaque relevé se lit dans la position du toucher, jamais dans le
  // cumul que `PanResponder` entretient de son côté — c'est ce cumul, lui, qui repartirait
  // de zéro.
  const pan = useMemo(() => {
    const readAt = (event: GestureResponderEvent) => {
      // `locationX` reste relatif au cadre : tout ce qu'il contient (repères, SVG, calque
      // de lecture) est en `pointerEvents="none"`, aucun enfant ne peut être la cible.
      setScrubMinutes(minutesAtX(event.nativeEvent.locationX, width, maxMinutes));
    };

    return PanResponder.create({
      /**
       * Le graphe ne réclame jamais le geste à la pose du doigt.
       *
       * `onStartShouldSetPanResponder` le prendrait dès le contact, et le `ScrollView` qui
       * porte la page ne pourrait plus jamais démarrer un défilement commencé sur le
       * graphe. Comme celui-ci occupe la moitié de l'écran de statistiques, la page
       * paraîtrait figée une fois sur deux — un défaut bien plus grave que l'absence de la
       * lecture qu'on ajoute ici.
       *
       * On attend donc le mouvement, et on ne prend le geste que s'il est franchement
       * horizontal : au-delà de `SCRUB_SLOP_PX`, et plus large que haut d'un cinquième. Un
       * balayage vertical part au défilement sans que le scrubber ne l'ait vu passer ; un
       * glissement horizontal, lui, n'avait de toute façon rien d'autre à faire ici.
       *
       * Encore faut-il que la négociation ait lieu : tant que ce cadre était enveloppé
       * dans le bouton « agrandir » de `Expandable`, celui-ci prenait le geste au premier
       * contact et le scrubber n'était jamais consulté. C'est pourquoi ce bouton ne
       * couvre plus que sa propre pastille.
       */
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_event, gesture) =>
        Math.abs(gesture.dx) > SCRUB_SLOP_PX &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * SCRUB_DIRECTION_RATIO,
      /**
       * Une fois le geste pris, on ne le rend plus : la dérive verticale d'un doigt qui
       * balaie l'écran suffirait à repasser la main au `ScrollView` en pleine lecture, et
       * la page partirait au défilement alors qu'on suivait une valeur.
       */
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: readAt,
      onPanResponderMove: readAt,
      // Au relâchement — comme à l'interruption par un appel ou une notification — le
      // bandeau reprend son texte d'invite : rien ne doit rester figé sur un instant que
      // plus aucun doigt ne désigne.
      onPanResponderRelease: () => setScrubMinutes(null),
      onPanResponderTerminate: () => setScrubMinutes(null),
    });
  }, [width, maxMinutes]);

  const readings = useMemo(
    () => (scrubMinutes === null ? [] : readSeriesAt(series, scrubMinutes)),
    [series, scrubMinutes],
  );

  const formatX = scrub?.formatX ?? formatElapsedLabel;
  const caption =
    scrub && scrubMinutes !== null
      ? scrubCaption(formatX(scrubMinutes), readings, scrub.formatValue)
      : SCRUB_IDLE_HINT;

  // Le glissement n'existe pas au lecteur d'écran : les deux actions standard d'un élément
  // « ajustable » sont le seul moyen d'y atteindre les valeurs intermédiaires. Sans elles,
  // le rôle annoncerait un réglage que rien ne permettrait de régler.
  const nudge = (direction: 1 | -1) => {
    if (maxMinutes <= 0) return;
    const step = maxMinutes / SCRUB_STEPS;
    setScrubMinutes((current) => clamp((current ?? maxMinutes) + direction * step, 0, maxMinutes));
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (actionName === 'increment') nudge(1);
    else if (actionName === 'decrement') nudge(-1);
  };

  const scrubProps = scrub
    ? {
        ...pan.panHandlers,
        accessible: true,
        accessibilityRole: 'adjustable' as const,
        accessibilityLabel: 'Courbe de collecte, glissez pour lire une valeur',
        accessibilityValue: { text: caption },
        accessibilityActions: SCRUB_ACTIONS,
        onAccessibilityAction,
      }
    : undefined;

  const scrubX = scrubMinutes === null ? 0 : xAtMinutes(scrubMinutes, width, maxMinutes);

  return (
    <View>
      {scrub ? (
        <View style={{ height: SCRUB_CAPTION_HEIGHT }} className="flex-row items-center">
          <Text
            numberOfLines={1}
            className={scrubMinutes === null ? 'text-xs text-gray-600' : 'text-xs text-gray-400'}
          >
            {caption}
          </Text>
        </View>
      ) : null}

      <View
        {...scrubProps}
        onLayout={onLayout}
        style={{ height }}
        className="overflow-hidden rounded-xl bg-gray-900/40"
      >
        {referenceLines
          .filter((line) => line.value > safeYMin && line.value <= safeYMax)
          .map((line) => {
            const bottom = valueRatio(line.value, safeYMin, safeYMax) * height;
            // Le libellé se pose au-dessus de son trait, sauf quand celui-ci frôle le
            // sommet : le cadre rogne ce qui déborde, et un repère posé sur `yMax` — ce
            // que font les échelles arrondies à la borne supérieure — perdait purement et
            // simplement son montant.
            const labelBelow = height - bottom < LABEL_HEIGHT;
            return (
              <View
                key={`${line.value}-${line.label}`}
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, bottom, zIndex: 1 }}
              >
                <View className="h-px w-full bg-gray-700" />
                <Text
                  style={{ position: 'absolute', right: 4, top: labelBelow ? 2 : -LABEL_HEIGHT }}
                  className="text-[10px] text-gray-500"
                >
                  {line.label}
                </Text>
              </View>
            );
          })}

        {width > 0 ? (
          <Svg
            width={width}
            height={height}
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, top: 0, zIndex: 2 }}
          >
            <Defs>
              {paths.map((p) => (
                <LinearGradient key={`grad-${p.id}`} id={`grad-${p.id}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={p.color} stopOpacity={0.35} />
                  <Stop offset="1" stopColor={p.color} stopOpacity={0.02} />
                </LinearGradient>
              ))}
            </Defs>
            {paths.map((p) => (
              <Path key={`area-${p.id}`} d={p.area} fill={`url(#grad-${p.id})`} />
            ))}
            {paths.map((p) => (
              <Path
                key={`line-${p.id}`}
                d={p.line}
                fill="none"
                stroke={p.color}
                strokeWidth={STROKE}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
          </Svg>
        ) : null}

        {scrub && scrubMinutes !== null && width > 0 ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 3 }}
          >
            <View
              className="bg-gray-600"
              style={{ position: 'absolute', left: scrubX, top: 0, bottom: 0, width: 1 }}
            />
            {readings.map((reading) =>
              reading.eur === null ? null : (
                <View
                  key={`scrub-${reading.id}`}
                  style={{
                    position: 'absolute',
                    left: scrubX - DOT / 2 - DOT_RING,
                    top:
                      height -
                      valueRatio(reading.eur, safeYMin, safeYMax) * height -
                      DOT / 2 -
                      DOT_RING,
                    width: DOT + DOT_RING * 2,
                    height: DOT + DOT_RING * 2,
                    borderRadius: DOT / 2 + DOT_RING,
                    backgroundColor: reading.color,
                    // Le liseré est de la couleur du fond de l'écran : sans lui, une
                    // pastille posée sur son propre tracé se confond avec lui, et deux
                    // séries qui se croisent n'en font plus qu'une.
                    borderWidth: DOT_RING,
                    borderColor: colors.background,
                  }}
                />
              ),
            )}
          </View>
        ) : null}
      </View>

      {xTicks.length > 0 && maxMinutes > 0 ? (
        <View className="mt-1 h-4">
          {xTicks
            .filter((tick) => tick.minutes >= 0 && tick.minutes <= maxMinutes)
            .map((tick) => {
              const ratio = tick.minutes / maxMinutes;
              // Un libellé simplement posé à l'abscisse de sa graduation s'étend vers la
              // droite : il désigne alors un instant postérieur au sien, d'autant plus
              // visiblement qu'il est long, et le dernier de l'axe finit hors du cadre.
              // On le centre donc sur son trait — sauf aux deux bords, où il n'y a plus
              // de place pour déborder et où l'alignement sur le bord dit la même chose.
              const anchor = ratio <= 0.02 ? 'left' : ratio >= 0.98 ? 'right' : 'center';
              return (
                <Text
                  key={`${tick.minutes}-${tick.label}`}
                  numberOfLines={1}
                  className="text-[10px] text-gray-500"
                  style={{
                    position: 'absolute',
                    left: `${ratio * 100}%`,
                    width: TICK_WIDTH,
                    marginLeft:
                      anchor === 'left' ? 0 : anchor === 'right' ? -TICK_WIDTH : -TICK_WIDTH / 2,
                    textAlign: anchor,
                  }}
                >
                  {tick.label}
                </Text>
              );
            })}
        </View>
      ) : null}
    </View>
  );
}
