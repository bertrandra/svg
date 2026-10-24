import { afterEach, describe, expect, it, vi } from 'vitest';
import { estStockage, stockageMemoire, stockageNavigateur, stockageProtege, type Stockage } from '../../../src/io/stockage.js';

/** Un localStorage factice, avec de quoi le faire refuser. */
function localStorageFactice(refus: { lire?: boolean; ecrire?: boolean } = {}) {
  const textes = new Map<string, string>();
  return {
    textes,
    getItem: (cle: string): string | null => { if (refus.lire) throw new Error('bloque'); return textes.get(cle) ?? null; },
    setItem: (cle: string, v: string): void => { if (refus.ecrire) throw new Error('plein'); textes.set(cle, v); },
    removeItem: (cle: string): void => { textes.delete(cle); }
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('stockageNavigateur', () => {
  it('garde, relit et oublie du JSON dans le localStorage', () => {
    const ls = localStorageFactice();
    vi.stubGlobal('localStorage', ls);
    const s = stockageNavigateur();
    expect(s.ecrire('cle', { a: [1, 2] })).toBe(true);
    expect(ls.textes.get('cle')).toBe('{"a":[1,2]}');
    expect(s.lire('cle')).toEqual({ a: [1, 2] });
    s.retirer('cle');
    expect(s.lire('cle')).toBeNull();
  });

  it('lit comme absent un texte qui n est pas du JSON', () => {
    const ls = localStorageFactice();
    ls.textes.set('cle', '{pas du json');
    vi.stubGlobal('localStorage', ls);
    expect(stockageNavigateur().lire('cle')).toBeNull();
  });

  it('ne leve jamais quand le navigateur refuse', () => {
    vi.stubGlobal('localStorage', localStorageFactice({ lire: true, ecrire: true }));
    const s = stockageNavigateur();
    expect(s.lire('cle')).toBeNull();
    expect(s.ecrire('cle', 1)).toBe(false);
    expect(() => s.retirer('cle')).not.toThrow();
  });

  it('ne leve pas quand l acces meme au localStorage leve (fenetre privee, cadre sans allow-same-origin)', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    try {
      const s = stockageNavigateur();
      expect(s.lire('cle')).toBeNull();
      expect(s.ecrire('cle', 1)).toBe(false);
      expect(() => s.retirer('cle')).not.toThrow();
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('refuse une valeur qui ne se serialise pas', () => {
    vi.stubGlobal('localStorage', localStorageFactice());
    const s = stockageNavigateur();
    expect(s.ecrire('cle', undefined)).toBe(false);
    const cercle: Record<string, unknown> = {};
    cercle.moi = cercle;
    expect(s.ecrire('cle', cercle)).toBe(false);
  });
});

describe('stockageMemoire', () => {
  it('garde le temps de l objet, sans toucher au navigateur', () => {
    const s = stockageMemoire();
    expect(s.lire('x')).toBeNull();
    expect(s.ecrire('x', [1, 'deux'])).toBe(true);
    expect(s.lire('x')).toEqual([1, 'deux']);
    s.retirer('x');
    expect(s.lire('x')).toBeNull();
  });

  it('part d un contenu, et rend des copies comme le ferait un vrai stockage', () => {
    const depart = { versions: [{ id: 'v1' }] };
    const s = stockageMemoire(depart);
    const lu = s.lire<{ id: string }[]>('versions');
    expect(lu).toEqual([{ id: 'v1' }]);
    lu?.push({ id: 'v2' });
    expect(s.lire('versions')).toEqual([{ id: 'v1' }]);
    expect(depart.versions).toHaveLength(1);
  });

  it('deux stockages en memoire ne se partagent rien', () => {
    const a = stockageMemoire(), b = stockageMemoire();
    a.ecrire('x', 1);
    expect(b.lire('x')).toBeNull();
  });
});

describe('estStockage et stockageProtege', () => {
  it('reconnait les trois verbes, rien de moins', () => {
    expect(estStockage(stockageMemoire())).toBe(true);
    expect(estStockage({ lire: () => null, ecrire: () => true })).toBe(false);
    expect(estStockage(null)).toBe(false);
    expect(estStockage('stockage')).toBe(false);
  });

  it('lit comme refuse un stockage d hote qui leve', () => {
    const mechant: Stockage = {
      lire: () => { throw new Error('boum'); },
      ecrire: () => { throw new Error('boum'); },
      retirer: () => { throw new Error('boum'); }
    };
    const s = stockageProtege(mechant);
    expect(s.lire('x')).toBeNull();
    expect(s.ecrire('x', 1)).toBe(false);
    expect(() => s.retirer('x')).not.toThrow();
  });

  it('laisse passer un stockage d hote qui marche', () => {
    const s = stockageProtege(stockageMemoire());
    expect(s.ecrire('x', { a: 1 })).toBe(true);
    expect(s.lire('x')).toEqual({ a: 1 });
  });
});
