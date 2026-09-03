import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import type { ElapsedPoint } from '@/lib/timeseries';

export interface ChartSeries {
  id: string;
  label: string;
  /** Couleur hex `#rrggbb` (une aire translucide de la même teinte est dérivée). */
  color: string;
  points: ElapsedPoint[];
}

interface OverlayChartProps {
  series: ChartSeries[];
  /** Étendue de l'axe X en minutes écoulées. */
  maxMinutes: number;
  /** Étendue de l'axe Y (même unité que `points[].eur`). */
  yMax: number;
  height?: number;
  referenceLines?: { value: number; label: string }[];
  xTicks?: { minutes: number; label: string }[];
}

const STROKE = 2;

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
): { line: string; area: string } | null {
  const usable = points
    .filter((p) => Number.isFinite(p.minutes) && Number.isFinite(p.eur))
    .sort((a, b) => a.minutes - b.minutes);
  if (usable.length < 2 || maxMinutes <= 0 || yMax <= 0 || width <= 0) return null;

  const xAt = (minutes: number) => clamp((minutes / maxMinutes) * width, 0, width);
  const yAt = (eur: number) => height - clamp((eur / yMax) * height, 0, height);

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
 */
export function OverlayChart({
  series,
  maxMinutes,
  yMax,
  height = 200,
  referenceLines = [],
  xTicks = [],
}: OverlayChartProps) {
  const [width, setWidth] = useState(0);
  const safeYMax = yMax > 0 ? yMax : 1;

  const paths = useMemo<SeriesPaths[]>(() => {
    if (width <= 0) return [];
    const out: SeriesPaths[] = [];
    for (const s of series) {
      const built = buildPaths(s.points, width, height, maxMinutes, safeYMax);
      if (built) out.push({ id: s.id, color: s.color, ...built });
    }
    return out;
  }, [series, width, height, maxMinutes, safeYMax]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View>
      <View
        onLayout={onLayout}
        style={{ height }}
        className="overflow-hidden rounded-xl bg-gray-900/40"
      >
        {referenceLines
          .filter((line) => line.value > 0 && line.value <= safeYMax)
          .map((line) => {
            const bottom = clamp((line.value / safeYMax) * height, 0, height);
            return (
              <View
                key={line.label}
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, bottom, zIndex: 1 }}
              >
                <View className="h-px w-full bg-gray-700" />
                <Text className="absolute right-1 -top-3.5 text-[10px] text-gray-500">
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
      </View>

      {xTicks.length > 0 && maxMinutes > 0 ? (
        <View className="mt-1 h-4">
          {xTicks
            .filter((tick) => tick.minutes >= 0 && tick.minutes <= maxMinutes)
            .map((tick) => (
              <Text
                key={tick.label}
                className="absolute text-[10px] text-gray-500"
                style={{ left: `${(tick.minutes / maxMinutes) * 100}%` }}
              >
                {tick.label}
              </Text>
            ))}
        </View>
      ) : null}
    </View>
  );
}
