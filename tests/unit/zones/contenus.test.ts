// Les commandes des decoupes, des masques, des effets et des images (ADR-0012, etape 8) : en modele riche seulement, grisees avec leur
// raison, sans raccourci ; le groupe porteur se trouve depuis un groupe choisi, un element qu'il contient ou le contexte ; les verbes
// appliquent l'operation du moteur, choisissent ce qui suit et le disent ; les pastilles des groupes dans les calques.

import { describe, expect, it, vi } from 'vitest';
import { creerDecoupe, creerMasque, lireDessin, poserEffets, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { actionsContenus, porteurDe, type EtatContenus } from '../../../src/zones/actionsContenus.js';
import { elementsContenus } from '../../../src/zones/commandesContenus.js';
import { pastillesGroupe } from '../../../src/zones/lignesCalques.js';
import { phraseDecoupeCreee, phraseImageInseree, phraseImageRefusee, phraseMasqueLibere, RAISONS_CONTENUS } from '../../../src/zones/phrasesContenus.js';
import type { Leviers } from '../../../src/zones/actions.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from '../../../src/zones/typesEditeur.js';

const lire = (svg: string, modele: 'plat' | 'riche'): DessinSvg => {
  const r = lireDessin(svg, modele === 'riche' ? { modele } : {});
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h40v40h-40z" fill="#c81e28"/>'
  + '<path d="M20 20h40v40h-40z" fill="#1428a0"/><circle cx="40" cy="40" r="15" fill="#ffffff"/></svg>';
const plat = lire(SVG, 'plat');
const PNG_1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mM4IacBAALAAQ/kvR8uAAAAAElFTkSuQmCC';

/** Les verbes sur un etat donne : ce que `appliquer` produit est garde, ce qui est dit et choisi aussi. */
function monter(dessin: DessinSvg, sel: string[], contexte: string | null = null) {
  const etat: { dessin: DessinSvg; dit: string[]; choisis: string[]; contexte: unknown } = { dessin, dit: [], choisis: [], contexte: undefined };
  const l = {
    appliquer: vi.fn((f: (d: DessinSvg) => DessinSvg) => { etat.dessin = f(etat.dessin); }), choisir: vi.fn((ids: string[]) => { etat.choisis = ids; }),
    poserPoint: vi.fn(), poserOutil: vi.fn(), poserOutilBrut: vi.fn(), poserTrace: vi.fn(), poserPresse: vi.fn(), dire: vi.fn((t: string) => { etat.dit.push(t); }),
    toile: { current: null }
  } as unknown as Leviers;
  const lu = () => ({ dessin: etat.dessin, sel, contexte: contexte !== null ? { groupe: contexte } : null, vues: { vue: { zoom: 1, x: 0, y: 0 } } }) as unknown as EtatContenus;
  const ac = actionsContenus(lu, l, c => { etat.contexte = c; });
  return { ac, etat, l };
}

describe('les commandes des decoupes et des masques', () => {
  const menu = (dessin: DessinSvg, sel: string[], modele: 'plat' | 'riche', contexte: string | null = null) =>
    elementsContenus({ dessin, sel } as unknown as ModeleDessin, { modele, contexte: contexte !== null ? { groupe: contexte } : null } as unknown as EtatInterface, {} as ActionsEditeur);

  it('n existent qu en modele riche ; sans raccourci ; grisees avec leur raison', () => {
    expect(menu(plat, ['f1', 'f2'], 'plat')).toEqual([]);
    const els = menu(plat, ['f1'], 'riche');
    expect(els.map(e => [e.id, e.raccourci, !!e.desactive])).toEqual([
      ['creer-decoupe', undefined, true], ['modifier-decoupe', undefined, true], ['liberer-decoupe', undefined, true], ['creer-masque', undefined, true],
      ['modifier-masque', undefined, true], ['inverser-masque', undefined, true], ['liberer-masque', undefined, true]
    ]);
    expect(els[0]?.raison).toBe(RAISONS_CONTENUS.deux);
    expect(menu(plat, ['f1', 'f3'], 'riche').filter(e => !e.desactive).map(e => e.id)).toEqual(['creer-decoupe', 'creer-masque']);
  });

  it('trouvent le porteur : le groupe choisi, l ancetre d un element choisi, ou le contexte', () => {
    const r = creerDecoupe(plat, ['f1', 'f2', 'f3']), g = r.id ?? '';
    const enfant = r.dessin.formes.find(f => f.parent === g)?.id ?? '';
    expect(porteurDe(r.dessin, [g], null, 'decoupe')).toBe(g);
    expect(porteurDe(r.dessin, [enfant], null, 'decoupe')).toBe(g);
    expect(porteurDe(r.dessin, [], g, 'decoupe')).toBe(g);
    expect(porteurDe(r.dessin, [g], null, 'masque')).toBeNull();
    expect(menu(r.dessin, [enfant], 'plat').filter(e => !e.desactive).map(e => e.id)).toEqual(['modifier-decoupe', 'liberer-decoupe']);
  });
});

describe('les verbes', () => {
  it('creer une decoupe choisit le groupe et le dit ; liberer rend la forme, choisie, dans le groupe devenu le contexte', () => {
    const { ac, etat } = monter(plat, ['f1', 'f2', 'f3']);
    ac.creerDecoupe();
    const g = etat.choisis[0] ?? '';
    expect(etat.dessin.groupes?.[g]?.decoupe).toBeDefined();
    expect(etat.dit).toEqual([phraseDecoupeCreee(plat, ['f1', 'f2'])]);
    const suite = monter(etat.dessin, [g]);
    suite.ac.libererDecoupe();
    expect(suite.etat.dessin.groupes?.[g]?.decoupe).toBeUndefined();
    expect(suite.etat.choisis).toEqual(['f3']);
    expect(suite.etat.contexte).toEqual({ groupe: g });
    expect(suite.etat.dit[0]).toMatch(/^Découpe libérée : la forme revient au premier plan du groupe, sans fond, d’un trait noir\.$/);
  });

  it('un refus du moteur se dit tel quel, sans rien appliquer', () => {
    const { ac, etat, l } = monter(plat, ['f1']);
    ac.creerMasque();
    expect(l.appliquer).not.toHaveBeenCalled();
    expect(etat.dit[0]).toMatch(/au moins deux éléments/);
    ac.libererMasque();
    expect(etat.dit[1]).toBe('Choisissez un groupe masqué.');
  });

  it('creer, inverser et liberer un masque', () => {
    const r = creerMasque(plat, ['f1', 'f2', 'f3']), g = r.id ?? '';
    const { ac, etat } = monter(r.dessin, [g]);
    ac.inverserMasque();
    expect(etat.dessin.groupes?.[g]?.masque?.contenu.formes[0]?.remplissage).toBe('#ffffff');
    ac.libererMasque();
    expect(etat.dessin.groupes?.[g]?.masque).toBeUndefined();
    expect(etat.dit.at(-1)).toBe(phraseMasqueLibere(2));
  });

  it('pose des effets sur la selection, un geste continu fondu par sa cle', () => {
    const { ac, etat, l } = monter(plat, ['f1']);
    ac.poserEffets({ flou: { ecart: 3 } }, 'flou-ecart');
    expect(etat.dessin.formes[0]?.effets).toEqual({ flou: { ecart: 3 } });
    expect(l.appliquer).toHaveBeenCalledWith(expect.any(Function), 'effets:flou-ecart:f1');
    expect(etat.dessin).not.toBe(plat);
    expect(poserEffets(etat.dessin, ['f1'], { flou: { ecart: 3 } })).toBe(etat.dessin);
  });

  it('insere une image au centre du plan (sans toile mesurable), dans le groupe du contexte, ou dit le refus', () => {
    const r = creerDecoupe(plat, ['f1', 'f2', 'f3']), g = r.id ?? '';
    const { ac, etat } = monter(r.dessin, [], g);
    expect(ac.insererImage(PNG_1)).toBe(true);
    const img = etat.dessin.formes.find(f => f.image);
    expect(img?.image).toMatchObject({ x: 49.5, y: 49.5, l: 1, h: 1 });
    expect(img?.parent).toBe(g);
    expect(etat.choisis).toEqual([img?.id]);
    expect(etat.dit).toEqual([phraseImageInseree(1, 1, false)]);
    expect(ac.insererImage('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false);
    expect(etat.dit.at(-1)).toBe(phraseImageRefusee('une image SVG imbriquée (une image ne peut pas être elle-même un SVG)'));
  });
});

describe('les pastilles des groupes', () => {
  it('une icone et un mot par ce que le groupe porte, dans l ordre ; rien pour un groupe nu', () => {
    const r = creerDecoupe(plat, ['f1', 'f2', 'f3']), g = r.dessin.groupes?.[r.id ?? ''];
    if (!g) throw new Error('pas de groupe');
    expect(pastillesGroupe({ ...g, decoupe: undefined } as never)).toEqual([]);
    const tout = { ...g, masque: { contenu: { formes: [] }, type: 'luminance' as const, region: { x: 0, y: 0, l: 1, h: 1 } }, effets: { flou: { ecart: 1 }, ombre: { dx: 1, dy: 1, ecart: 1, couleur: '#000000', opacite: 0.5 } }, opacite: 0.5 };
    expect(pastillesGroupe(tout).map(p => p.mot)).toEqual(['découpe', 'masque', 'flou', 'ombre', 'opacité 50 %']);
    expect(pastillesGroupe(tout).map(p => p.icone)).toEqual(['decoupe', 'masque', 'flou', 'ombre', 'opacite']);
  });
});
