import { describe, expect, it } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { stockageMemoire } from '../../../src/io/stockage.js';
import { verifierOptions } from '../../../src/zones/embarque.js';
import {
  apresSignal, avecRepere, avecVisite, CLE_GUIDE, cibleEtape, couleurChangee, ETAPES, fusionner, lireMemoire, MEMOIRE_VIDE, ouvreSeule, phraseEtape,
  cadrage, phraseFin, placerBulle, precedente, progression, REPERES, suivante, texteEtape, type ContexteVisite, type EtapeVisite
} from '../../../src/zones/visite.js';

/** Les textes portent des espaces insecables (typographie francaise) : on les compare a espaces ordinaires. */
const n = (t: string): string => t.replace(/\u00a0/g, ' ');
const BUREAU: ContexteVisite = { telephone: false, selection: true, recuperation: 'telecharger' };
const TELEPHONE: ContexteVisite = { telephone: true, selection: true, recuperation: 'telecharger' };

function dessin(svg: string): DessinSvg {
  const lu = lireDessin(svg);
  if ('erreur' in lu) throw new Error(lu.erreur);
  return lu.dessin;
}
const DEUX = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H40V40H10Z" fill="#c81e28"/><path d="M50 50H90V90H50Z" fill="#1428a0" stroke="#15181d"/></svg>';

describe('les etapes de la visite', () => {
  it('sont cinq, de « choisir » a « fin », et se suivent', () => {
    expect(ETAPES).toEqual(['choisir', 'couleur', 'annuler', 'recuperer', 'fin']);
    expect(ETAPES.map(suivante)).toEqual(['couleur', 'annuler', 'recuperer', 'fin', null]);
    expect(ETAPES.map(precedente)).toEqual(['choisir', 'choisir', 'couleur', 'annuler', 'recuperer']);
    expect(ETAPES.map(progression)).toEqual(['Étape 1 sur 5', 'Étape 2 sur 5', 'Étape 3 sur 5', 'Étape 4 sur 5', 'Étape 5 sur 5']);
  });

  it('avancent sur le geste attendu par l etape du moment, et sur lui seul', () => {
    expect(apresSignal('choisir', 'selection')).toBe('couleur');
    expect(apresSignal('couleur', 'couleur')).toBe('annuler');
    expect(apresSignal('annuler', 'annule')).toBe('recuperer');
    expect(apresSignal('recuperer', 'recupere')).toBe('fin');
    // Telecharger avant d'avoir recolore ne saute pas la recoloration ; la fin n'attend plus rien.
    expect(apresSignal('choisir', 'recupere')).toBe('choisir');
    expect(apresSignal('couleur', 'selection')).toBe('couleur');
    expect(apresSignal('annuler', 'couleur')).toBe('annuler');
    for (const s of ['selection', 'couleur', 'annule', 'recupere'] as const) expect(apresSignal('fin', s)).toBe('fin');
  });

  it('s ouvrent seules sur demande, ou une fois chez un hote qui les a activees', () => {
    expect(ouvreSeule('toujours', true)).toBe(true);
    expect(ouvreSeule('si-nouveau', false)).toBe(true);
    expect(ouvreSeule('si-nouveau', true)).toBe(false);
    expect(ouvreSeule('jamais', false)).toBe(false);
  });
});

describe('les textes de la visite', () => {
  it('disent les titres voulus, au vouvoiement, sans jargon', () => {
    const titres = ETAPES.map(e => texteEtape(e, BUREAU).titre);
    expect(titres).toEqual(['Choisissez une forme', 'Changez sa couleur', 'Vous pouvez toujours revenir en arrière', 'Récupérez votre dessin', 'Votre première retouche est faite']);
    const tout = ETAPES.flatMap(e => [texteEtape(e, BUREAU), texteEtape(e, TELEPHONE)]).map(t => t.titre + ' ' + t.corps).join(' ');
    for (const jargon of ['nœud', 'noeud', 'booléen', 'tracé composé', 'path', 'fill']) expect(tout.toLowerCase(), jargon).not.toContain(jargon);
    expect(tout).not.toMatch(/\btu\b|\bton\b|\bta\b/);
  });

  it('dit ou trouver « Télécharger le SVG » selon l ecran, et « Enregistrer » chez un hote', () => {
    expect(n(texteEtape('recuperer', BUREAU).corps)).toContain('menu « Fichier »');
    expect(n(texteEtape('recuperer', TELEPHONE).corps)).toContain('« Plus »');
    expect(n(texteEtape('recuperer', { ...BUREAU, recuperation: 'enregistrer' }).corps)).toContain('« Enregistrer »');
  });

  it('demande d abord une forme quand rien n est choisi a l etape de la couleur', () => {
    expect(texteEtape('couleur', { ...BUREAU, selection: false }).corps).toMatch(/^Choisissez d’abord une forme/);
    expect(n(texteEtape('couleur', BUREAU).corps)).toMatch(/^Cliquez la pastille « Remplissage »/);
  });

  it('dit « Touchez » au doigt, et tient la typographie francaise : rien ne commence une ligne par « ; » ou « : »', () => {
    expect(texteEtape('choisir', { ...TELEPHONE, doigt: true }).corps).toMatch(/^Touchez une des formes/);
    expect(texteEtape('couleur', { ...TELEPHONE, doigt: true }).corps).toMatch(/^Touchez la pastille/);
    for (const e of ETAPES) {
      const t = texteEtape(e, TELEPHONE);
      expect(t.titre + t.corps, e).not.toMatch(/ [;:?!»]|« /);
    }
  });

  it('se disent dans la region vocale avec leur rang, et la premiere dit comment atteindre la bulle', () => {
    expect(n(phraseEtape('couleur', BUREAU))).toBe(n('Visite guidée, étape 2 sur 5 : Changez sa couleur. ' + texteEtape('couleur', BUREAU).corps));
    expect(phraseEtape('choisir', BUREAU)).toContain('F6 mène à la bulle');
    expect(phraseEtape('couleur', BUREAU)).not.toContain('F6');
    expect(n(phraseFin(false, false))).toBe('Visite guidée quittée. Elle se rejoue depuis le menu Aide.');
    expect(n(phraseFin(true, true))).toBe('Visite guidée terminée. Elle se rejoue depuis « Plus », rubrique Aide.');
  });

  it('visent la toile, la pastille, Annuler, puis Fichier, Plus ou Enregistrer', () => {
    const cibles = (c: ContexteVisite) => ETAPES.map(e => cibleEtape(e, c));
    expect(cibles(BUREAU)).toEqual(['.editeur-toile', '.editeur-barre .style-courant .pastille-style', '.editeur-barre button[aria-label="Annuler (Ctrl+Z)"]', '.editeur-barre .groupe.fin .menu-bouton', '.editeur-toile']);
    expect(cibleEtape('recuperer', TELEPHONE)).toBe('.editeur-barre .groupe.plus .menu-bouton');
    expect(cibleEtape('recuperer', { ...BUREAU, recuperation: 'enregistrer' })).toBe('.editeur-barre .groupe.fin button.primaire');
    expect(cibleEtape('recuperer', { ...TELEPHONE, recuperation: 'enregistrer' })).toBe('.editeur-etat button.primaire');
  });
});

describe('couleurChangee', () => {
  it('voit un remplissage ou un contour qui change, pas un deplacement ni une forme ajoutee', () => {
    const avant = dessin(DEUX);
    const f1 = avant.formes[0], f2 = avant.formes[1];
    if (!f1 || !f2) throw new Error('deux formes attendues');
    expect(couleurChangee(avant, avant)).toBe(false);
    expect(couleurChangee(avant, { ...avant, formes: [{ ...f1, remplissage: '#00ff00' }, f2] })).toBe(true);
    expect(couleurChangee(avant, { ...avant, formes: [f1, { ...f2, contour: null }] })).toBe(true);
    expect(couleurChangee(avant, { ...avant, formes: [{ ...f1, opacite: 0.5 }, f2] })).toBe(false);
    expect(couleurChangee(avant, { ...avant, formes: [f1, f2, { ...f1, id: 'f9', remplissage: '#00ff00' }] })).toBe(false);
  });
});

describe('placerBulle', () => {
  const ECRAN = { l: 1280, h: 800 }, BULLE = { l: 340, h: 160 };
  // La toile du bureau : entre les calques (220 px) et l'inspecteur (300 px), sous la barre et la rangee de la selection.
  const TOILE = { x: 220, y: 72, l: 760, h: 694 };

  it('pose la bulle en haut de la toile sous une cible de la barre, sa fleche sur le centre de la cible', () => {
    const p = placerBulle({ x: 320, y: 4, l: 30, h: 30 }, BULLE, ECRAN, TOILE);
    // Sous la rangee de la selection (la toile commence a 72), jamais dessus.
    expect(p).toMatchObject({ cote: 'dessous', y: 82 });
    expect(p.x + (p.fleche ?? 0)).toBe(335);
    expect(p.reserve).toEqual({ haut: 82 + 160 - 72 + 8, bas: 0 });
  });

  it('garde la bulle dans la largeur de la toile : une cible au-dessus de l inspecteur n a plus de fleche', () => {
    const p = placerBulle({ x: 1060, y: 4, l: 80, h: 30 }, BULLE, ECRAN, TOILE);
    expect(p.x).toBe(220 + 760 - 8 - 340);
    expect(p.fleche).toBeNull();
    expect(placerBulle({ x: 0, y: 4, l: 20, h: 20 }, BULLE, ECRAN, TOILE).x).toBe(228);
  });

  it('pose la bulle en bas de la toile pour la toile elle-meme ou une cible de la barre d etat, et rend la bande du bas', () => {
    const toile = placerBulle(TOILE, BULLE, ECRAN, TOILE);
    expect(toile).toMatchObject({ cote: 'dedans', y: 72 + 694 - 8 - 160, fleche: null, reserve: { haut: 0, bas: 160 + 16 } });
    const etat = placerBulle({ x: 1100, y: 770, l: 160, h: 26 }, BULLE, ECRAN, TOILE);
    expect(etat).toMatchObject({ cote: 'dessus', y: 72 + 694 - 8 - 160 });
    expect(placerBulle(null, BULLE, ECRAN)).toMatchObject({ cote: 'dedans', x: (1280 - 340) / 2, y: 800 - 8 - 160 });
  });

  it('tient sur un telephone de 390 px : une bulle plus large que la toile prend la largeur de l ecran, a la marge', () => {
    const p = placerBulle({ x: 100, y: 60, l: 40, h: 40 }, { l: 374, h: 200 }, { l: 390, h: 800 }, { x: 0, y: 140, l: 390, h: 560 });
    expect(p).toMatchObject({ x: 8, cote: 'dessous', y: 150 });
  });
});

describe('cadrage', () => {
  it('ajuste le plan a 88 % de la place laissee entre les bandes de la bulle, centre dans cette place', () => {
    const v = cadrage([0, 0, 240, 160], { l: 760, h: 694 }, { haut: 0, bas: 176 });
    // La place : 760 x 518 ; le plan 240 x 160 y tient par la largeur.
    expect(v.zoom).toBeCloseTo(Math.min(760 / 240, 518 / 160) * 0.88, 6);
    expect(v.y + 160 * v.zoom).toBeLessThanOrEqual(694 - 176);
    expect(v.x).toBeCloseTo((760 - 240 * v.zoom) / 2, 6);
    const haut = cadrage([10, 20, 100, 100], { l: 400, h: 600 }, { haut: 250, bas: 0 });
    expect(haut.y + 20 * haut.zoom).toBeGreaterThanOrEqual(250);
  });
});

describe('la memoire du guide', () => {
  it('lit une memoire valide, et ecarte ce qu elle ne connait pas sans jamais lever', () => {
    expect(lireMemoire({ visite: true, reperes: ['cricut', 'points'] })).toEqual({ visite: true, reperes: ['points', 'cricut'] });
    for (const abime of [null, undefined, 5, 'texte', [], { visite: 'oui' }, { reperes: 'points' }, { reperes: [1, null, {}, 'inconnu', 'points', 'points'] }]) {
      const m = lireMemoire(abime);
      expect(m.visite).toBe(false);
      expect(m.reperes.every(r => REPERES.includes(r))).toBe(true);
      expect(new Set(m.reperes).size).toBe(m.reperes.length);
    }
    // Une cle de prototype dans le stockage ne passe pas (le stockage la retire deja, la lecture ne recopie que ses champs).
    const empoisonnee = JSON.parse('{"__proto__":{"visite":true},"reperes":["booleen"]}') as unknown;
    expect(lireMemoire(empoisonnee)).toEqual({ visite: false, reperes: ['booleen'] });
  });

  it('note la visite et les reperes sans doublon, et fusionne stockage et session', () => {
    const m = avecRepere(avecRepere(avecVisite(MEMOIRE_VIDE), 'booleen'), 'booleen');
    expect(m).toEqual({ visite: true, reperes: ['booleen'] });
    expect(avecVisite(m)).toBe(m);
    expect(fusionner({ visite: false, reperes: ['points'] }, { visite: true, reperes: ['conversion'] })).toEqual({ visite: true, reperes: ['points', 'conversion'] });
  });

  it('se garde sous la cle svg.guide d un stockage injecte, en JSON', () => {
    const s = stockageMemoire();
    s.ecrire(CLE_GUIDE, avecRepere(MEMOIRE_VIDE, 'cricut'));
    expect(lireMemoire(s.lire(CLE_GUIDE))).toEqual({ visite: false, reperes: ['cricut'] });
    expect(lireMemoire(stockageMemoire().lire(CLE_GUIDE))).toEqual(MEMOIRE_VIDE);
  });
});

describe('l option d hote « visite »', () => {
  const ok = (): void => undefined;
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 0L10 10Z"/></svg>';

  it('accepte vrai, faux ou absent, et refuse le reste en le nommant', () => {
    for (const visite of [true, false, undefined]) expect(verifierOptions({ svg: SVG, onEnregistrer: ok, visite })).toBeNull();
    for (const visite of ['oui', 1, null, {}]) expect(verifierOptions({ svg: SVG, onEnregistrer: ok, visite })).toBe('L’option « visite » doit être vraie ou fausse.');
  });
});

// Une garde de plus : chaque etape a un titre et un corps non vides, dans les trois contextes.
describe('chaque etape, chaque contexte', () => {
  const CONTEXTES: readonly ContexteVisite[] = [BUREAU, TELEPHONE, { ...BUREAU, recuperation: 'enregistrer' }, { ...TELEPHONE, selection: false }];
  it.each(ETAPES as EtapeVisite[])('%s a un titre et un corps', e => {
    for (const c of CONTEXTES) {
      const t = texteEtape(e, c);
      expect(t.titre.length).toBeGreaterThan(5);
      expect(t.corps.length).toBeGreaterThan(20);
    }
  });
});
