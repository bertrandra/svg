// Le reglage du modele (ADR-0012, etape 2, paquet 2-0 ; annexe 5 §3) : garde par le stockage injecte et valide comme tout ce qui en
// vient (ADR-0014), `plat` sans lui ; un brouillon ou une version ecrits en riche ne se rouvrent pas a plat, et le disent ; l'hote
// qui embarque l'editeur fixe le modele, `plat` par defaut.

import { describe, expect, it } from 'vitest';
import { ecrireDessin, lireDessin } from '../../../src/engine/editionSvg.js';
import { stockageMemoire } from '../../../src/io/stockage.js';
import { CLE_MODELE, estModele, garderModele, lireModele, MODELE_PAGE, modeleRetenu, optionsModele, porteModeleRiche, refusAvecRepli, refusModele } from '../../../src/zones/modele.js';
import { estEditable, verifierOptions } from '../../../src/zones/embarque.js';
import { editable } from '../../../src/zones/EditeurSvg.js';

const GROUPE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g opacity="0.5"><path d="M0 0h10v10h-10z" fill="#c81e28"/></g></svg>';
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" width="4" height="4"/></svg>';
const ok = (): void => undefined;

/** Le SVG qu'ecrit l'editeur pour un fichier a groupes ouvert en riche : il porte le marqueur du modele v2. */
const ecritRiche = (): string => { const r = lireDessin(GROUPE, { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return ecrireDessin(r.dessin, 3); };

describe('le reglage du modele, garde par le stockage', () => {
  it('se lit seulement sous la forme ecrite ; tout le reste vaut `plat`', () => {
    expect(lireModele({ modele: 'riche' })).toBe('riche');
    expect(lireModele({ modele: 'plat' })).toBe('plat');
    for (const v of [null, undefined, 'riche', ['riche'], {}, { modele: 'RICHE' }, { modele: 2 }, 42]) expect(lireModele(v), JSON.stringify(v)).toBeNull();
    expect(modeleRetenu(null)).toBe('plat');
    expect(modeleRetenu(stockageMemoire({ [CLE_MODELE]: 'riche' }))).toBe('plat');
    expect(modeleRetenu(stockageMemoire({ [CLE_MODELE]: { modele: 'riche' } }))).toBe('riche');
    expect(estModele('riche') && estModele('plat') && !estModele('Riche')).toBe(true);
  });

  it('prend le defaut que l appelant donne quand le stockage ne garde rien de lisible, jamais au-dessus d un reglage garde', () => {
    expect(modeleRetenu(null, 'riche')).toBe('riche');
    expect(modeleRetenu(stockageMemoire(), 'riche')).toBe('riche');
    expect(modeleRetenu(stockageMemoire({ [CLE_MODELE]: 'plat' }), 'riche')).toBe('riche');
    expect(modeleRetenu(stockageMemoire({ [CLE_MODELE]: { modele: 'plat' } }), 'riche')).toBe('plat');
    expect(modeleRetenu(stockageMemoire({ [CLE_MODELE]: { modele: 'riche' } }), 'plat')).toBe('riche');
  });

  it('s ecrit en objet et se relit ; sans stockage, rien n est garde', () => {
    const s = stockageMemoire();
    expect(garderModele(s, 'riche')).toBe(true);
    expect(s.lire(CLE_MODELE)).toEqual({ modele: 'riche' });
    expect(modeleRetenu(s)).toBe('riche');
    expect(garderModele(null, 'riche')).toBe(false);
  });

  it('donne les options de lecture : rien pour plat (le contrat d avant), le mode pour riche', () => {
    expect(optionsModele('plat')).toEqual({});
    expect(optionsModele(undefined)).toEqual({});
    expect(optionsModele('riche')).toEqual({ modele: 'riche' });
  });
});

describe('un brouillon ou une version ecrits en riche, rouverts a plat', () => {
  it('reconnait le marqueur sur la balise <svg> seulement', () => {
    expect(porteModeleRiche(ecritRiche())).toBe(true);
    expect(porteModeleRiche(GROUPE)).toBe(false);
    expect(porteModeleRiche('<svg viewBox="0 0 1 1"><path data-ed-modele="2" d="M0 0"/></svg>')).toBe(false);
    expect(porteModeleRiche('pas un svg')).toBe(false);
  });

  it('le dit sans rien effacer, et laisse passer tout le reste', () => {
    expect(refusModele(ecritRiche(), 'plat', 'version')).toBe('Cette version emploie des groupes, des dégradés ou des effets ; activez le modèle riche (« Groupes, dégradés, effets », menu Édition) pour l’ouvrir.');
    expect(refusModele(ecritRiche(), 'plat', 'brouillon')).toMatch(/^Ce brouillon emploie des groupes/);
    expect(refusModele(ecritRiche(), 'riche', 'version')).toBeNull();
    expect(refusModele(GROUPE, 'plat', 'version')).toBeNull();
  });
});

describe('la bascule (ADR-0012, etape 14)', () => {
  it('la page et le site lisent en riche sans reglage lisible ; tout autre appelant, l embarquement compris, a plat', () => {
    expect(MODELE_PAGE).toBe('riche');
    expect(modeleRetenu(stockageMemoire(), MODELE_PAGE)).toBe('riche');
    expect(modeleRetenu(stockageMemoire({ [CLE_MODELE]: { modele: 'plat' } }), MODELE_PAGE)).toBe('plat');
    expect(modeleRetenu(stockageMemoire())).toBe('plat');
    expect(estEditable(GROUPE.replace('fill="#c81e28"', 'fill="url(#a)"'))).toBe(false);
  });
});

describe('un refus propre a la lecture riche', () => {
  it('dit que la lecture a plat l ouvrirait, et seulement alors', () => {
    const profond = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' + '<g>'.repeat(65) + '<path d="M0 0h10v10z"/>' + '</g>'.repeat(65) + '</svg>';
    const r = lireDessin(profond, { modele: 'riche' });
    if (!('erreur' in r)) throw new Error('65 niveaux devaient etre refuses en riche');
    expect(refusAvecRepli(profond, r.erreur, 'riche')).toBe(r.erreur + ' Lu à plat, ses groupes fondus, il s’ouvrirait : décochez « Groupes, dégradés, effets » au menu Édition de l’éditeur, puis rouvrez-le.');
    expect(refusAvecRepli(profond, r.erreur, 'plat')).toBe(r.erreur);
    const degrade = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="a" href="#a"/></defs><path d="M0 0h10v10z" fill="url(#a)"/></svg>';
    const d = lireDessin(degrade, { modele: 'riche' });
    if (!('erreur' in d)) throw new Error('un cycle de degrades devait etre refuse');
    expect(refusAvecRepli(degrade, d.erreur, 'riche')).toBe(d.erreur);
  });
});

describe('le modele chez un hote qui embarque l editeur', () => {
  it('admet « plat », « riche » ou rien, et nomme toute autre valeur', () => {
    for (const modele of ['plat', 'riche', undefined]) expect(verifierOptions({ svg: GROUPE, onEnregistrer: ok, modele })).toBeNull();
    for (const modele of ['RICHE', true, 2, null, {}]) expect(verifierOptions({ svg: GROUPE, onEnregistrer: ok, modele }), String(modele)).toMatch(/« modele »/);
  });

  it('decide de ce qui s edite selon le modele : une image integree seulement en riche', () => {
    expect(estEditable(IMAGE)).toBe(false);
    expect(estEditable(IMAGE, 'plat')).toBe(false);
    expect(estEditable(IMAGE, 'riche')).toBe(true);
    expect(estEditable(IMAGE, 'n importe quoi')).toBe(false);
    expect(editable(IMAGE)).toBe(false);
    expect(editable(IMAGE, 'riche')).toBe(true);
  });
});
