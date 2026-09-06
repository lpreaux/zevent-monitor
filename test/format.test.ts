import { describe, expect, it } from 'vitest';

import { formatEurosTile } from '@/lib/format';

/** Espace fine insécable, celle qu'emploie tout le formatage de l'application. */
const NBSP = ' ';

describe('montant d’une tuile étroite', () => {
  it('écrit en entier ce qui tient dans la largeur', () => {
    expect(formatEurosTile(0)).toEqual({ value: `0${NBSP}€` });
    expect(formatEurosTile(999_999)).toEqual({ value: `999${NBSP}999${NBSP}€` });
  });

  it('abrège au-delà du million et garde l’exact à part', () => {
    // La cagnotte du ZEvent vit ici : treize caractères écrits en entier, contre neuf
    // que laisse une tuile de demi-largeur.
    expect(formatEurosTile(16_636_297)).toEqual({
      value: `16,6${NBSP}M€`,
      exact: `16${NBSP}636${NBSP}297${NBSP}€`,
    });
  });

  it('ne prétend rien sur une valeur qui n’en est pas une', () => {
    expect(formatEurosTile(Number.NaN).value).toContain('—');
  });
});
