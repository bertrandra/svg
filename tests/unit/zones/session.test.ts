import { describe, expect, it } from 'vitest';
import { stockageMemoire } from '../../../src/io/stockage.js';
import { CLE_BROUILLON, CLE_VERSIONS, garderBrouillon, garderVersions, idVersion, lireBrouillon, lireVersions, oublierBrouillon, VERSIONS_MAX, type Version } from '../../../src/zones/session.js';

const version = (i: number): Version => ({ id: idVersion(1000, i), nom: 'v' + i, svg: '<svg/>', quand: 1000 + i });

describe('session : le brouillon', () => {
  it('se garde, se relit et s oublie, sous la cle svg.brouillon', () => {
    const s = stockageMemoire();
    expect(lireBrouillon(s)).toBeNull();
    expect(garderBrouillon(s, 'logo', '<svg/>', 42)).toBe(true);
    expect(s.lire(CLE_BROUILLON)).toEqual({ nom: 'logo', svg: '<svg/>', quand: 42 });
    expect(lireBrouillon(s)).toEqual({ nom: 'logo', svg: '<svg/>', quand: 42 });
    oublierBrouillon(s);
    expect(lireBrouillon(s)).toBeNull();
  });

  it('sans stockage, rien ne se garde et rien ne casse', () => {
    expect(lireBrouillon(null)).toBeNull();
    expect(garderBrouillon(null, 'logo', '<svg/>', 42)).toBe(false);
    expect(() => oublierBrouillon(null)).not.toThrow();
  });
});

describe('session : les versions nommees', () => {
  it('se gardent sous la cle svg.versions et se relisent dans l ordre', () => {
    const s = stockageMemoire();
    expect(lireVersions(s)).toEqual([]);
    expect(garderVersions(s, [version(2), version(1)])).toBe(true);
    expect(s.lire(CLE_VERSIONS)).toHaveLength(2);
    expect(lireVersions(s).map(v => v.nom)).toEqual(['v2', 'v1']);
  });

  it('en gardent trente au plus, les plus recentes d abord', () => {
    const s = stockageMemoire();
    garderVersions(s, Array.from({ length: VERSIONS_MAX + 5 }, (_, i) => version(i)));
    const gardees = lireVersions(s);
    expect(gardees).toHaveLength(VERSIONS_MAX);
    expect(gardees[0]?.nom).toBe('v0');
  });

  it('sans stockage, la liste est vide et rien ne se garde', () => {
    expect(lireVersions(null)).toEqual([]);
    expect(garderVersions(null, [version(1)])).toBe(false);
  });

  it('donnent a chaque version un identifiant stable', () => {
    expect(idVersion(1000, 3)).toBe(idVersion(1000, 3));
    expect(idVersion(1000, 3)).not.toBe(idVersion(1000, 4));
  });
});
