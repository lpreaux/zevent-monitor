/**
 * Mesure le centrage des glyphes Ionicons directement dans la police.
 *
 * `ICON_NUDGE` (src/lib/icons.ts) n'accepte que des valeurs mesurées : une correction
 * posée au jugé décale un glyphe déjà juste. La première entrée, le `play`, avait été
 * relevée au canvas dans l'aperçu web ; l'aperçu web ne reproduit toutefois pas la mise
 * en boîte d'Android, qui est précisément ce qui décale les icônes sur téléphone.
 *
 * Ce script lit donc la table `glyf` : chaque glyphe y déclare sa propre boîte d'encre
 * (`xMin/yMin/xMax/yMax`), et `hhea` déclare la montante et la descendante sur lesquelles
 * Android assied la boîte de texte quand `includeFontPadding` vaut `false`. Comparer les
 * deux centres donne l'écart exact, en fraction de la taille demandée — c'est-à-dire dans
 * l'unité même d'`ICON_NUDGE`.
 *
 * Usage : node scripts/measure-icon-nudge.mjs heart play star …
 */

import fs from 'node:fs';

const VENDOR = 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons';
const TTF = `${VENDOR}/Fonts/Ionicons.ttf`;
const GLYPHMAP = `${VENDOR}/glyphmaps/Ionicons.json`;

const buf = fs.readFileSync(TTF);
const map = JSON.parse(fs.readFileSync(GLYPHMAP, 'utf8'));

const u16 = (o) => buf.readUInt16BE(o);
const i16 = (o) => buf.readInt16BE(o);
const u32 = (o) => buf.readUInt32BE(o);

const tables = {};
for (let i = 0; i < u16(4); i += 1) {
  const o = 12 + i * 16;
  tables[buf.toString('ascii', o, o + 4).trim()] = { off: u32(o + 8), len: u32(o + 12) };
}

const head = tables.head.off;
const unitsPerEm = u16(head + 18);
const longLoca = i16(head + 50) !== 0;

const hhea = tables.hhea.off;
const ascender = i16(hhea + 4);
const descender = i16(hhea + 6);
const numHMetrics = u16(hhea + 34);

/** Sous-table cmap Unicode : Windows BMP/full, à défaut Unicode. */
function unicodeSubtable() {
  const cmap = tables.cmap.off;
  let found = null;
  for (let i = 0; i < u16(cmap + 2); i += 1) {
    const rec = cmap + 4 + i * 8;
    const platform = u16(rec);
    const encoding = u16(rec + 2);
    if ((platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0) {
      found = cmap + u32(rec + 4);
    }
  }
  if (found === null) throw new Error('aucune sous-table cmap Unicode');
  if (u16(found) !== 4) throw new Error(`cmap format ${u16(found)} non géré`);
  return found;
}

const sub = unicodeSubtable();
const segX2 = u16(sub + 6);
const ends = sub + 14;
const starts = ends + segX2 + 2;
const deltas = starts + segX2;
const ranges = deltas + segX2;

function glyphId(codepoint) {
  for (let s = 0; s < segX2 / 2; s += 1) {
    if (codepoint > u16(ends + s * 2)) continue;
    const start = u16(starts + s * 2);
    if (codepoint < start) return 0;
    const offset = u16(ranges + s * 2);
    if (offset === 0) return (codepoint + i16(deltas + s * 2)) & 0xffff;
    const id = u16(ranges + s * 2 + offset + (codepoint - start) * 2);
    return id === 0 ? 0 : (id + i16(deltas + s * 2)) & 0xffff;
  }
  return 0;
}

const loca = tables.loca.off;
const glyf = tables.glyf.off;
const locaAt = (i) => (longLoca ? u32(loca + i * 4) : u16(loca + i * 2) * 2);

/** Boîte d'encre déclarée en tête du glyphe, ou `null` s'il est vide. */
function inkBox(gid) {
  const start = locaAt(gid);
  if (locaAt(gid + 1) === start) return null;
  const g = glyf + start;
  return { xMin: i16(g + 2), yMin: i16(g + 4), xMax: i16(g + 6), yMax: i16(g + 8) };
}

const hmtx = tables.hmtx.off;
const advance = (gid) => u16(hmtx + Math.min(gid, numHMetrics - 1) * 4);

/**
 * Contours du glyphe, aplatis en polygones.
 *
 * TrueType alterne points sur la courbe et points de contrôle ; deux points hors courbe
 * consécutifs sous-entendent un point sur la courbe à mi-chemin. On développe chaque
 * quadratique en segments — assez finement pour que l'aire ne dépende plus du pas.
 */
function contours(gid) {
  const start = locaAt(gid);
  if (locaAt(gid + 1) === start) return [];
  let o = glyf + start;
  const numContours = i16(o);
  if (numContours < 0) return []; // glyphe composite : hors sujet pour un jeu d'icônes
  o += 10;

  const endPts = [];
  for (let i = 0; i < numContours; i += 1, o += 2) endPts.push(u16(o));
  const numPts = endPts[numContours - 1] + 1;
  o += 2 + u16(o); // instructions

  const flags = [];
  while (flags.length < numPts) {
    const flag = buf.readUInt8(o);
    o += 1;
    flags.push(flag);
    if (flag & 8) {
      let repeat = buf.readUInt8(o);
      o += 1;
      while (repeat-- > 0) flags.push(flag);
    }
  }

  const readCoords = (shortBit, sameBit) => {
    const out = [];
    let value = 0;
    for (const flag of flags) {
      if (flag & shortBit) {
        const delta = buf.readUInt8(o);
        o += 1;
        value += flag & sameBit ? delta : -delta;
      } else if (!(flag & sameBit)) {
        value += i16(o);
        o += 2;
      }
      out.push(value);
    }
    return out;
  };
  const xs = readCoords(2, 16);
  const ys = readCoords(4, 32);

  const STEPS = 24;
  const polygons = [];
  let first = 0;
  for (const end of endPts) {
    const pts = [];
    for (let i = first; i <= end; i += 1) {
      pts.push({ x: xs[i], y: ys[i], on: (flags[i] & 1) !== 0 });
    }
    first = end + 1;
    if (pts.length === 0) continue;

    const poly = [];
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // Le contour doit démarrer sur la courbe : sinon on prend le point implicite.
    let startPoint = pts[0].on ? pts[0] : pts[pts.length - 1].on ? pts[pts.length - 1] : mid(pts[0], pts[pts.length - 1]);
    poly.push(startPoint);

    let current = startPoint;
    let control = null;
    const ordered = pts[0].on ? pts.slice(1).concat([pts[0]]) : pts.concat([startPoint]);
    for (const point of ordered) {
      if (point.on) {
        if (control === null) {
          poly.push(point);
        } else {
          for (let s = 1; s <= STEPS; s += 1) {
            const t = s / STEPS;
            const it = 1 - t;
            poly.push({
              x: it * it * current.x + 2 * it * t * control.x + t * t * point.x,
              y: it * it * current.y + 2 * it * t * control.y + t * t * point.y,
            });
          }
          control = null;
        }
        current = point;
      } else if (control === null) {
        control = point;
      } else {
        const implied = mid(control, point);
        for (let s = 1; s <= STEPS; s += 1) {
          const t = s / STEPS;
          const it = 1 - t;
          poly.push({
            x: it * it * current.x + 2 * it * t * control.x + t * t * implied.x,
            y: it * it * current.y + 2 * it * t * control.y + t * t * implied.y,
          });
        }
        current = implied;
        control = point;
      }
    }
    polygons.push(poly);
  }
  return polygons;
}

/**
 * Barycentre de la surface encrée, contre-formes comprises.
 *
 * L'aire signée d'un contour change de signe avec son sens de parcours : les évidements,
 * parcourus à l'envers, se retranchent d'eux-mêmes de la somme. C'est ce que fait le
 * remplissage non-nul du rendu, et donc ce qu'il faut reproduire ici.
 */
function centroid(gid) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (const poly of contours(gid)) {
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const cross = a.x * b.y - b.x * a.y;
      area += cross;
      cx += (a.x + b.x) * cross;
      cy += (a.y + b.y) * cross;
    }
  }
  if (area === 0) return null;
  return { x: cx / (3 * area), y: cy / (3 * area) };
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('usage : node scripts/measure-icon-nudge.mjs <nom-ionicon> [...]');
  process.exit(1);
}

console.log(`unitsPerEm ${unitsPerEm} — montante ${ascender}, descendante ${descender}`);
console.log(`boîte Android (includeFontPadding false) : ${ascender - descender} unités\n`);
console.log('                           |  boîte d’encre  |    barycentre   |');
console.log('glyphe                     |      dx |     dy |      dx |     dy |');
console.log('---------------------------|---------|--------|---------|--------|');

for (const name of names) {
  const codepoint = map[name];
  if (codepoint === undefined) {
    console.log(`${name.padEnd(26)} | inconnu du glyphmap`);
    continue;
  }
  const gid = glyphId(codepoint);
  const box = inkBox(gid);
  if (!box) {
    console.log(`${name.padEnd(26)} | glyphe vide`);
    continue;
  }
  const midX = advance(gid) / 2;
  const midY = (ascender + descender) / 2;
  const mass = centroid(gid);
  const cell = (value) => (value / unitsPerEm).toFixed(4).padStart(7);
  console.log(
    `${name.padEnd(26)} | ${cell((box.xMin + box.xMax) / 2 - midX)} |${cell(
      (box.yMin + box.yMax) / 2 - midY,
    )} | ${mass ? cell(mass.x - midX) : '      —'} |${mass ? cell(mass.y - midY) : '      —'} |`,
  );
}

// --- Les trois jeux de métriques verticales dont Android peut se servir ---
const os2 = tables['OS/2'].off;
const sets = {
  'hhea (includeFontPadding false)': [ascender, descender],
  'OS/2 sTypo': [i16(os2 + 68), i16(os2 + 70)],
  'OS/2 usWin (includeFontPadding true)': [u16(os2 + 74), -u16(os2 + 76)],
};
const fsSelection = u16(os2 + 62);

console.log(`\nfsSelection 0x${fsSelection.toString(16)} — USE_TYPO_METRICS ${(fsSelection & 128) !== 0}`);
console.log('\nécart vertical du glyphe selon la boîte retenue :\n');
console.log(`${''.padEnd(40)}| ${names.map((n) => n.padStart(9)).join(' |')}`);
for (const [label, [asc, desc]] of Object.entries(sets)) {
  const centre = (asc + desc) / 2;
  const cells = names.map((name) => {
    const box = inkBox(glyphId(map[name]));
    const dy = box ? ((box.yMin + box.yMax) / 2 - centre) / unitsPerEm : NaN;
    return dy.toFixed(4).padStart(9);
  });
  console.log(`${(label + ` [${asc}/${desc}]`).padEnd(40)}| ${cells.join(' |')}`);
}
