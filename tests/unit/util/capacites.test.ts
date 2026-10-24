import { describe, it, expect } from 'vitest';
import { CAPACITES, manquantes, phraseManquantes, type IdCapacite, type Sonde } from '../../../src/util/capacites.js';

const TOUT: Sonde = { objectHasOwn: true, pointeurs: true, blob: true, canvas: true, webassembly: true };
const sans = (...ids: IdCapacite[]): Sonde => ({ ...TOUT, ...Object.fromEntries(ids.map(id => [id, false])) });
const ids = (liste: readonly { id: IdCapacite }[]) => liste.map(c => c.id);

describe('manquantes', () => {
  it('ne rend rien d un navigateur complet, quel que soit le besoin', () => {
    for (const besoin of ['demarrage', 'image', 'vectorisation'] as const) expect(manquantes(TOUT, besoin)).toEqual([]);
  });

  it('exige au demarrage les pointeurs, Object.hasOwn et les fichiers en memoire', () => {
    expect(ids(manquantes(sans('pointeurs'), 'demarrage'))).toEqual(['pointeurs']);
    expect(ids(manquantes(sans('objectHasOwn', 'blob'), 'demarrage'))).toEqual(['objectHasOwn', 'blob']);
  });

  it('ne demande WebAssembly que pour vectoriser, et le canvas que pour lire une image', () => {
    const vieux = sans('webassembly', 'canvas');
    expect(manquantes(vieux, 'demarrage')).toEqual([]);
    expect(ids(manquantes(vieux, 'image'))).toEqual(['canvas']);
    expect(ids(manquantes(vieux, 'vectorisation'))).toEqual(['canvas', 'webassembly']);
  });

  it('couvre chaque capacite d une sonde, une fois chacune', () => {
    expect(new Set(ids(CAPACITES)).size).toBe(CAPACITES.length);
    expect(ids(CAPACITES).sort()).toEqual(Object.keys(TOUT).sort());
    expect(ids(manquantes(sans(...ids(CAPACITES)), 'vectorisation'))).toEqual(ids(CAPACITES));
  });
});

describe('phraseManquantes', () => {
  it('dit une capacite manquante et la marche a suivre, en francais', () => {
    const p = phraseManquantes(manquantes(sans('webassembly'), 'vectorisation'));
    expect(p).toContain('il lui manque WebAssembly, qui fait tourner le traceur.');
    expect(p).toMatch(/Mettez-le à jour/);
    expect(p).toMatch(/Chrome, Edge, Firefox ou Safari/);
  });

  it('en joint plusieurs par une virgule et « et »', () => {
    const p = phraseManquantes(manquantes(sans('pointeurs', 'blob', 'objectHasOwn'), 'demarrage'));
    expect(p).toContain('la lecture des noms de couleur (Object.hasOwn), les évènements de pointeur (souris, stylet et doigt) et les fichiers en mémoire');
  });
});
