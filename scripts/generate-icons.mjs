/**
 * Génère les icônes de l'application à partir d'une définition vectorielle.
 *
 * Dessin original (un « Z » géométrique dans la palette violette du projet) : l'app est
 * communautaire et non officielle, elle ne réutilise donc aucun logo du ZEvent.
 *
 * Usage : node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'assets');

/** Échantillonnage 4×4 par pixel, suffisant pour lisser des arêtes droites. */
const SAMPLES = 4;

const BACKGROUND_TOP = [139, 92, 246]; // zevent-500
const BACKGROUND_BOTTOM = [46, 16, 101];
const GLOW = [196, 181, 253]; // zevent-300
const FOREGROUND = [250, 249, 255];

/**
 * « Z » stylisé en coordonnées normalisées (0 → 1), tracé d'un seul contour :
 * italique, terminaisons coupées en biais et diagonale nettement plus épaisse
 * que les barres, pour un rendu lisible jusqu'en 48 px.
 */
function zPolygons() {
  const left = 0.19;
  const right = 0.81;
  const top = 0.2;
  const bottom = 0.8;
  const bar = 0.15;
  /** Décalage horizontal des extrémités de la diagonale. */
  const gap = 0.2;
  /** Coupe en biais des terminaisons de barres. */
  const cut = 0.07;
  /** Inclinaison italique appliquée après coup. */
  const slant = 0.13;

  const outline = [
    [left + cut, top],
    [right, top],
    [left + gap, bottom - bar],
    [right, bottom - bar],
    [right - cut, bottom],
    [left, bottom],
    [right - gap, top + bar],
    [left, top + bar],
  ];

  const middle = (top + bottom) / 2;
  return [outline.map(([x, y]) => [x + slant * (middle - y), y])];
}

function insidePolygon(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Couverture du glyphe pour un pixel, entre 0 et 1 (anti-aliasing). */
function coverage(polygons, px, py, size, scale, offset) {
  let hits = 0;
  for (let sy = 0; sy < SAMPLES; sy += 1) {
    for (let sx = 0; sx < SAMPLES; sx += 1) {
      const x = ((px + (sx + 0.5) / SAMPLES) / size - offset) / scale;
      const y = ((py + (sy + 0.5) / SAMPLES) / size - offset) / scale;
      if (polygons.some((polygon) => insidePolygon(polygon, x, y))) hits += 1;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** Encode un buffer RGBA (`size * size * 4`) en PNG, sans dépendance externe. */
function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits par canal
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filtre « None »
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * @param {object} options
 * @param {number} options.size côté de l'image en pixels
 * @param {boolean} options.background dégradé de fond (icône pleine) ou transparent (masque)
 * @param {number} options.scale taille du glyphe relative à l'image
 * @param {[number, number, number]} options.color couleur du glyphe
 */
function render({ size, background, scale, color }) {
  const polygons = zPolygons();
  const offset = (1 - scale) / 2;
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    const ratio = y / (size - 1);
    for (let x = 0; x < size; x += 1) {
      const alpha = coverage(polygons, x, y, size, scale, offset);
      const index = (y * size + x) * 4;

      if (background) {
        // Halo diffus derrière le glyphe, puis assombrissement progressif des angles.
        const dx = x / (size - 1) - 0.44;
        const dy = y / (size - 1) - 0.38;
        const glow = Math.max(0, 1 - Math.hypot(dx, dy) / 0.72) ** 2.2;
        const vignette = 1 - 0.28 * Math.min(1, Math.hypot(dx, dy) / 0.85) ** 2;

        for (let channel = 0; channel < 3; channel += 1) {
          const gradient =
            BACKGROUND_TOP[channel] +
            (BACKGROUND_BOTTOM[channel] - BACKGROUND_TOP[channel]) * ratio;
          const lit = (gradient + (GLOW[channel] - gradient) * glow * 0.45) * vignette;
          rgba[index + channel] = Math.round(lit * (1 - alpha) + color[channel] * alpha);
        }
        rgba[index + 3] = 255;
        continue;
      }

      rgba[index] = color[0];
      rgba[index + 1] = color[1];
      rgba[index + 2] = color[2];
      rgba[index + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, rgba);
}

mkdirSync(assets, { recursive: true });

const outputs = [
  // Icône principale : fond plein, le système applique lui-même son masque.
  { file: 'icon.png', options: { size: 1024, background: true, scale: 0.88, color: FOREGROUND } },
  // Icône adaptative Android : premier plan transparent, glyphe dans la zone sûre centrale.
  {
    file: 'adaptive-icon.png',
    options: { size: 1024, background: false, scale: 0.62, color: FOREGROUND },
  },
  // Icône de notification Android : silhouette blanche, utilisée comme masque monochrome.
  {
    file: 'notification-icon.png',
    options: { size: 96, background: false, scale: 0.78, color: [255, 255, 255] },
  },
  { file: 'favicon.png', options: { size: 64, background: true, scale: 0.9, color: FOREGROUND } },
];

for (const { file, options } of outputs) {
  writeFileSync(join(assets, file), render(options));
  console.log(`assets/${file} — ${options.size}×${options.size}`);
}
