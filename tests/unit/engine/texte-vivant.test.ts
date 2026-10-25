// Le texte vivant (ADR-0022) : encodage, ecriture et relecture idempotentes, survie au nettoyage, garde des outils qui
// cassent le texte, transformations qui le suivent, composition en bloc.

import { describe, expect, it } from 'vitest';
import {
  decoderTexte, deplacer, dessinSansTextes, dupliquer, ecrireDessin, encoderTexte, garderTextes, lireDessin, modifier, tourner,
  MSG_TEXTE_ILLISIBLE, type DessinSvg, type Forme, type TexteVivant
} from '../../../src/engine/editionSvg.js';
import { appliquerBooleen } from '../../../src/engine/booleens.js';
import { cheminDuTexte, composerBloc, lettresDuTexte } from '../../../src/engine/texte/bloc.js';
import { basculerPeinture, creerTexte, nouveauTexte, peintureDuTexte, poserTexte } from '../../../src/engine/texte/vivant.js';
import { composer } from '../../../src/engine/texte.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { glyphesCarres } from './glyphesFactices.js';

const vide: DessinSvg = { vb: [0, 0, 200, 100], formes: [] };
const police = { id: 'inter', version: '0123456789abcd' };

function texteDe(t: string, reglages: Partial<TexteVivant> = {}): { dessin: DessinSvg; id: string; texte: TexteVivant } {
  const texte = { ...nouveauTexte(t, police, 20, [1, 0, 0, 1, 10, 50]), ...reglages };
  const r = creerTexte(vide, texte, cheminDuTexte(texte, glyphesCarres), peintureDuTexte('contour', { remplissage: '#c81e28', contour: null, epaisseur: 1 }, 1));
  if (!r.id) throw new Error('aucun texte');
  return { dessin: r.dessin, id: r.id, texte };
}

const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const enregistrer = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';
const forme = (d: DessinSvg, id: string): Forme => { const f = d.formes.find(x => x.id === id); if (!f) throw new Error('forme ' + id); return f; };

describe('l encodage du texte', () => {
  it('ne laisse en clair que les lettres ASCII et les chiffres', () => {
    expect(encoderTexte('Noël 2026')).toBe('No%C3%ABl%202026');
    expect(encoderTexte('a-b_c.d!e~f*g\'h(i)j')).toMatch(/^[A-Za-z0-9%]+$/);
    for (const t of ['javascript:alert(1)', 'url(https://x)', '@import "a"', '-moz-binding', 'on a gagné=oui', '<script>', '"&\'', 'expression(1)', 'data:text/html']) {
      const e = encoderTexte(t);
      expect(e, t).toMatch(/^(?:[A-Za-z0-9]|%[0-9A-F]{2})*$/);
      expect(decoderTexte(e)).toBe(t);
    }
  });

  it('fait l aller-retour de tout texte, retours a la ligne, emoji et lettres de toutes les ecritures compris', () => {
    for (const t of ['', 'Joyeux\nanniversaire', 'œ Œ æ ß « » — …', '👩‍👩‍👧 ✂', 'こんにちは', 'مرحبا', '\t  ']) expect(decoderTexte(encoderTexte(t))).toBe(t);
  });

  it('remplace une moitie de paire de substitution isolee, et refuse ce qui n est pas de son ecriture', () => {
    expect(decoderTexte(encoderTexte('a\uD800b'))).toBe('a�b');
    for (const v of ['%C3', '%zz', 'a b', '%e9', '%C3%28', 'é']) expect(decoderTexte(v), v).toBeNull();
  });
});

describe('l ecriture et la relecture', () => {
  it('ecrit les contours et les attributs d edition, dans l ordre, chacun absent quand il vaut son defaut', () => {
    const { dessin } = texteDe('AV', { interlettrage: 0.1, alignement: 'centre', ligatures: true });
    const svg = ecrireDessin(dessin, 3);
    expect(svg).not.toContain('<text');
    expect(svg).toMatch(/<path d="M[^"]+" fill="#c81e28" data-ed-texte="AV" data-ed-police="inter" data-ed-police-version="0123456789abcd" data-ed-taille="20" data-ed-interlettrage="0\.1" data-ed-alignement="centre" data-ed-ligatures="1" data-ed-matrice="1 0 0 1 10 50"\/>/);
    expect(ecrireDessin(texteDe('x').dessin, 3)).not.toMatch(/interlettrage|interligne|alignement|ligatures/);
  });

  it('relu, redonne le texte vivant ; reecrit, ne bouge plus d un octet', () => {
    const { dessin, texte } = texteDe('Noël\nà tous : 100 %', { interligne: 1.5, alignement: 'droite' });
    const premier = enregistrer(dessin);
    const relu = lire(premier);
    expect(relu.formes).toHaveLength(1);
    expect(forme(relu, 'f1').texte).toEqual(texte);
    expect(enregistrer(relu)).toBe(premier);
  });

  it('survit au nettoyage, et respecte les invariants de l ecriture et du nettoyage', () => {
    const { dessin } = texteDe('javascript:alert(1) url(x) @import -moz-binding on=1 <b>');
    const brut = ecrireDessin(dessin, 3), propre = enregistrer(dessin);
    expect(propre).toBe(brut);
    expect(violationsEcriture(brut)).toEqual([]);
    expect(violationsNettoyage(propre)).toEqual([]);
    expect(forme(lire(propre), 'f1').texte?.texte).toBe('javascript:alert(1) url(x) @import -moz-binding on=1 <b>');
  });

  it('compose la matrice des groupes qui entourent le chemin', () => {
    const svg = enregistrer(texteDe('A').dessin).replace(/<path/, '<g transform="translate(5 7)"><path').replace('</svg>', '</g></svg>');
    expect(forme(lire(svg), 'f1').texte?.matrice).toEqual([1, 0, 0, 1, 15, 57]);
  });

  it('un chemin d ailleurs reste un chemin ; des donnees hors bornes laissent les contours et le disent', () => {
    expect(forme(lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L5 5L0 5Z"/></svg>'), 'f1').texte).toBeUndefined();
    const base = enregistrer(texteDe('A').dessin);
    for (const [quoi, par] of [
      ['data-ed-taille="20"', 'data-ed-taille="-3"'], ['data-ed-taille="20"', 'data-ed-taille="1e9"'], ['data-ed-texte="A"', 'data-ed-texte="%ZZ"'],
      ['data-ed-texte="A"', 'data-ed-texte="%20"'], ['data-ed-police="inter"', 'data-ed-police="Inter Bold"'], ['data-ed-matrice="1 0 0 1 10 50"', 'data-ed-matrice="0 0 0 0 1 1"'],
      ['data-ed-taille="20"', 'data-ed-taille="20" data-ed-alignement="justifie"'], ['data-ed-texte="A"', 'data-ed-texte="' + 'A'.repeat(10_001) + '"']
    ] as const) {
      const r = lireDessin(base.replace(quoi, par));
      if ('erreur' in r) throw new Error(r.erreur);
      expect(r.dessin.formes[0]?.texte, par.slice(0, 40)).toBeUndefined();
      expect(r.ignores, par.slice(0, 40)).toContain(MSG_TEXTE_ILLISIBLE);
    }
  });

  it('une police inconnue est remplacee par la regle, et c est dit', () => {
    const svg = enregistrer(texteDe('A').dessin).replace('data-ed-police="inter" data-ed-police-version="0123456789abcd"', 'data-ed-police="arial"');
    const r = lireDessin(svg);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes[0]?.texte?.police).toEqual({ id: 'inter' });
    expect(r.ignores.join(' ')).toMatch(/police remplacée par Inter/);
  });

  // ADR-0025 : une police du catalogue telechargeable (`c-` et 14 chiffres) se garde a la relecture, avec sa version et son nom :
  // l'interface la retrouve dans l'index ; elle n'est jamais remplacee par la regle, et la relecture reste un point fixe.
  it('une police du catalogue se garde telle quelle, avec sa version et son nom, et se relit a l identique', () => {
    const catalogue = { id: 'c-1b0c5ca30f8f68', version: 'fedcba98765432', famille: 'Roboto Grasse italique' };
    const { dessin } = texteDe('Été', { police: catalogue });
    const svg = enregistrer(dessin);
    expect(svg).toContain('data-ed-police="c-1b0c5ca30f8f68" data-ed-police-version="fedcba98765432" data-ed-famille="Roboto%20Grasse%20italique"');
    const r = lireDessin(svg);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes[0]?.texte?.police).toEqual(catalogue);
    expect(r.ignores.join(' ')).not.toMatch(/remplacée/);
    expect(enregistrer(r.dessin)).toBe(svg);
    expect(violationsEcriture(svg)).toEqual([]);
  });

  it('un dessin sans texte s ecrit exactement comme avant ; dessinSansTextes retire les attributs', () => {
    const { dessin } = texteDe('A');
    expect(ecrireDessin(dessinSansTextes(dessin), 3)).not.toContain('data-ed-');
    const sans: DessinSvg = { vb: [0, 0, 10, 10], formes: [] };
    expect(dessinSansTextes(sans)).toBe(sans);
  });
});

describe('les transformations suivent le texte, les autres outils le vectorisent', () => {
  it('deplacer, tourner, dupliquer composent la matrice : recomposer redonne les memes contours', () => {
    const { dessin, id } = texteDe('AVW');
    for (const d of [deplacer(dessin, [id], 3, -4), tourner(dessin, [id], 30), dupliquer(dessin, [id], 5, 5).dessin]) {
      for (const f of d.formes) {
        expect(f.texte).toBeDefined();
        const recompose = cheminDuTexte(f.texte as TexteVivant, glyphesCarres);
        f.d.forEach((c, i) => c.p.forEach((v, k) => expect(Math.abs(v - (recompose[i]?.p[k] ?? NaN))).toBeLessThan(1e-6)));
      }
    }
  });

  it('un changement de couleur garde le texte ; un booleen le perd et la garde le dit', () => {
    const { dessin, id } = texteDe('AV');
    const carre: Forme = { id: 'f9', d: [{ c: 'M', p: [0, 0] }, { c: 'L', p: [40, 0] }, { c: 'L', p: [40, 60] }, { c: 'Z', p: [] }], remplissage: '#000000', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false };
    const avec: DessinSvg = { ...dessin, formes: [...dessin.formes, carre] };
    const recolore = modifier(avec, [id], { remplissage: '#00ff00' });
    expect(garderTextes(avec, recolore).vectorises).toEqual([]);
    const b = appliquerBooleen(avec, [id, 'f9'], 'union');
    const g = garderTextes(avec, b.dessin);
    expect(g.vectorises).toHaveLength(1);
    expect(g.dessin.formes.every(f => !f.texte)).toBe(true);
    expect(garderTextes(avec, avec).dessin).toBe(avec);
  });

  it('poser un texte retape le change ; le meme texte rend le meme dessin', () => {
    const { dessin, id, texte } = texteDe('AV');
    const neuf = { ...texte, texte: 'AVA' };
    const d = poserTexte(dessin, id, neuf, cheminDuTexte(neuf, glyphesCarres));
    expect(forme(d, id).texte?.texte).toBe('AVA');
    expect(garderTextes(dessin, d).vectorises).toEqual([]);
    expect(poserTexte(dessin, id, texte, forme(dessin, id).d)).toBe(dessin);
  });

  it('la peinture bascule avec la nature de la police', () => {
    const { dessin, id } = texteDe('A');
    const f = forme(dessin, id);
    expect(basculerPeinture(f, 'trait', 1.5)).toEqual({ remplissage: null, contour: '#c81e28', epaisseur: 1.5 });
    expect(basculerPeinture({ ...f, remplissage: null, contour: '#123456', epaisseur: 2 }, 'contour', 1)).toEqual({ remplissage: '#123456', contour: null, epaisseur: 0 });
    expect(peintureDuTexte('trait', { remplissage: '#c81e28', contour: null, epaisseur: 1 }, 1.5)).toEqual({ remplissage: null, contour: '#c81e28', epaisseur: 1.5 });
  });
});

describe('la composition en bloc', () => {
  it('une ligne alignee a gauche donne les lettres de composer', () => {
    const r = { texte: 'AVW', taille: 20, interlettrage: 0.05, interligne: 1.2, alignement: 'gauche' as const, ligatures: false };
    expect(composerBloc(r, glyphesCarres)).toEqual(composer('AVW', glyphesCarres, { taille: 20, interlettrage: 0.05, x: 0, y: 0 }));
  });

  it('centre et aligne a droite chaque ligne sur l origine, interligne compris', () => {
    const r = { texte: 'AA\nW', taille: 10, interlettrage: 0, interligne: 2, alignement: 'droite' as const, ligatures: false };
    const l = composerBloc(r, glyphesCarres);
    const fins = l.map(x => Math.max(...x.d.flatMap(c => c.p.filter((_, i) => i % 2 === 0))));
    expect(fins[1]).toBeCloseTo(-1, 6);
    expect(Math.min(...(l[2]?.d.flatMap(c => c.p.filter((_, i) => i % 2 === 1)) ?? []))).toBeCloseTo(20 - 7, 6);
    const centre = composerBloc({ ...r, alignement: 'centre' }, glyphesCarres);
    const xs = centre.slice(0, 2).flatMap(x => x.d.flatMap(c => c.p.filter((_, i) => i % 2 === 0)));
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(-1, 6);
  });

  it('pose les lettres par la matrice du texte', () => {
    const t = nouveauTexte('A', police, 10, [2, 0, 0, 2, 100, 100]);
    expect(lettresDuTexte(t, glyphesCarres)[0]?.d[0]).toEqual({ c: 'M', p: [100, 100] });
  });
});
