import { describe, it, expect } from 'vitest';
import { EXTENSIONS, fondDe, qualiteDe } from '../../../src/io/rasters.js';

describe('rasters (la part pure)', () => {
  it('un JPEG n\'a pas d\'alpha : fond blanc faute d\'autre, le fond choisi sinon ; un WebP reste transparent', () => {
    expect(fondDe('image/jpeg', null)).toBe('#ffffff');
    expect(fondDe('image/jpeg', undefined)).toBe('#ffffff');
    expect(fondDe('image/jpeg', '#102030')).toBe('#102030');
    expect(fondDe('image/webp', null)).toBeNull();
    expect(fondDe('image/webp', '#102030')).toBe('#102030');
  });

  it('borne la qualite dans [0, 1], 0,9 par defaut', () => {
    expect(qualiteDe(undefined)).toBe(0.9);
    expect(qualiteDe(Number.NaN)).toBe(0.9);
    expect(qualiteDe(0.75)).toBe(0.75);
    expect(qualiteDe(3)).toBe(1);
    expect(qualiteDe(-1)).toBe(0);
  });

  it('nomme les extensions', () => {
    expect(EXTENSIONS).toEqual({ 'image/jpeg': 'jpg', 'image/webp': 'webp' });
  });
});
