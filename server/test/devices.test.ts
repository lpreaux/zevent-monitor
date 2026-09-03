import { describe, expect, it } from 'vitest';

import { hashSecret, secretMatches } from '../src/routes/devices.js';

describe('authentification des appareils', () => {
  const salt = 'a1b2c3d4e5f60718';
  const secret = 'f'.repeat(64);
  const hash = hashSecret(secret, salt);

  it('accepte le secret enregistré', () => {
    expect(secretMatches(secret, salt, hash)).toBe(true);
  });

  it('rejette un secret ou un sel différent', () => {
    expect(secretMatches(`${'e'.repeat(64)}`, salt, hash)).toBe(false);
    expect(secretMatches(secret, 'ffffffffffffffff', hash)).toBe(false);
  });

  it('ne stocke jamais le secret en clair', () => {
    expect(hash).not.toContain(secret);
    expect(hash).toHaveLength(64);
  });

  it('rejette une empreinte de longueur inattendue sans lever', () => {
    expect(secretMatches(secret, salt, 'deadbeef')).toBe(false);
  });
});
