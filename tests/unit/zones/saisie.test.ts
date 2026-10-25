// La saisie du texte sur la toile, sa part pure (ADR-0027) : le texte neuf pose au point d'insertion, le dessin apres chaque
// frappe (une forme seulement a la premiere lettre dessinee), la fusion de toute une frappe en un geste de l'historique, et
// les phrases de la fin.

import { describe, expect, it } from 'vitest';
import type { DessinSvg } from '../../../src/engine/editionSvg.js';
import type { Police } from '../../../src/io/polices.js';
import { annuler, avancer, historique } from '../../../src/util/historique.js';
import { dessine, frapper, NOUVEAU_TEXTE, phraseFinSaisie, policeNouveauTexte, tailleNouveauTexte, texteNeuf } from '../../../src/zones/saisie.js';
import { glyphesCarres } from '../engine/glyphesFactices.js';

const police: Police = { id: 'inter', nom: 'Inter', version: '0123456789abcd', nature: 'contour', glyphes: glyphesCarres };
const plan: DessinSvg = { vb: [0, 0, 400, 200], formes: [{ id: 'f1', d: [{ c: 'M', p: [0, 0] }, { c: 'L', p: [40, 0] }, { c: 'L', p: [40, 40] }, { c: 'Z', p: [] }], remplissage: '#1f4e8c', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false }] };
const peinture = { remplissage: '#000000', contour: null, epaisseur: 0 };

describe('le texte neuf de la saisie', () => {
  it('prend les reglages du prochain texte : la taille d un sixieme du plan, la premiere fonte', () => {
    expect(tailleNouveauTexte(NOUVEAU_TEXTE, plan.vb)).toBe(33);
    expect(tailleNouveauTexte({ ...NOUVEAU_TEXTE, taille: 12 }, plan.vb)).toBe(12);
    expect(policeNouveauTexte(NOUVEAU_TEXTE, [police])).toBe(police);
    expect(policeNouveauTexte({ ...NOUVEAU_TEXTE, police: 'absente' }, null)).toBeNull();
  });

  it('pose le milieu du curseur sur le point d insertion, arrondi au centieme', () => {
    const t = texteNeuf('', [100.123456, 50.987654], NOUVEAU_TEXTE, 20, police);
    // La ligne de base passe a 0,3 taille sous le point : le cadratin (0,8 au-dessus, 0,2 dessous) y est centre.
    expect(t.matrice).toEqual([1, 0, 0, 1, 100.12, 56.99]);
    expect(t).toMatchObject({ texte: '', taille: 20, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false, police: { id: 'inter', version: '0123456789abcd' } });
    expect(texteNeuf('a', [0, 0], { ...NOUVEAU_TEXTE, alignement: 'centre', interligne: 1.5 }, 20, police)).toMatchObject({ alignement: 'centre', interligne: 1.5 });
  });

  it('ne dessine rien d un texte vide ou fait de blancs', () => {
    expect(dessine(texteNeuf('', [0, 0], NOUVEAU_TEXTE, 20, police), police)).toBe(false);
    expect(dessine(texteNeuf(' \n ', [0, 0], NOUVEAU_TEXTE, 20, police), police)).toBe(false);
    expect(dessine(texteNeuf('a', [0, 0], NOUVEAU_TEXTE, 20, police), police)).toBe(true);
  });
});

describe('la frappe', () => {
  const neuf = texteNeuf('', [100, 100], NOUVEAU_TEXTE, 20, police);

  it('ne cree la forme qu a la premiere lettre dessinee, puis recompose son texte', () => {
    expect(frapper(plan, { id: null, neuf }, '', police, peinture, null)).toEqual({ dessin: plan, id: null, dessine: false });
    expect(frapper(plan, { id: null, neuf }, '  ', police, peinture, null).dessin).toBe(plan);
    const a = frapper(plan, { id: null, neuf }, 'A', police, peinture, null);
    expect(a.id).toBe('f2');
    expect(a.dessin.formes[1]?.texte?.texte).toBe('A');
    const ab = frapper(a.dessin, { id: 'f2', neuf: null }, 'AB', police, peinture, null);
    expect(ab.dessin.formes[1]?.texte?.texte).toBe('AB');
    expect(ab.dessin.formes[1]?.d.length).toBeGreaterThan(a.dessin.formes[1]?.d.length ?? 0);
    // Des blancs seulement : la forme reste telle quelle (la toile la cache le temps de la saisie).
    const blanc = frapper(ab.dessin, { id: 'f2', neuf: null }, '   ', police, peinture, null);
    expect(blanc).toEqual({ dessin: ab.dessin, id: 'f2', dessine: false });
  });

  it('fond toute une frappe en une entree d historique ; une autre cle en ouvre une autre ; annuler rend le dessin d avant', () => {
    let h = historique(plan), d = plan, id: string | null = null;
    for (const v of ['B', 'Bo', 'Bon', 'Bonj']) {
      const r = frapper(d, { id, neuf: id ? null : neuf }, v, police, peinture, null);
      d = r.dessin; id = r.id;
      h = avancer(h, d, 'saisie-1');
    }
    expect(h.passe).toHaveLength(1);
    expect(h.present.formes[1]?.texte?.texte).toBe('Bonj');
    h = avancer(h, frapper(h.present, { id, neuf: null }, 'Bonjour', police, peinture, null).dessin, 'saisie-2');
    expect(h.passe).toHaveLength(2);
    expect(annuler(annuler(h)).present).toBe(plan);
  });
});

describe('la phrase de la fin de la saisie', () => {
  const o = { cree: false, retire: false, vide: false, avant: 'Bonne fête', apres: 'Bonne fête', police: 'Inter' };
  it('dit ce qui est arrive au texte, sur une ligne', () => {
    expect(phraseFinSaisie({ ...o, cree: true, apres: 'Bonjour\nLéa' })).toBe('Texte ajouté en Inter : « Bonjour / Léa ». Il reste modifiable : double-clic ou Entrée.');
    expect(phraseFinSaisie({ ...o, apres: 'Bonne fête Léa' })).toBe('Texte modifié : « Bonne fête Léa ».');
    expect(phraseFinSaisie(o)).toBe('Texte inchangé.');
    expect(phraseFinSaisie({ ...o, vide: true })).toBe('Texte vide : rien n’est ajouté.');
    expect(phraseFinSaisie({ ...o, vide: true, retire: true })).toBe('Texte vide : la forme est retirée. Ctrl+Z la rend.');
    expect(phraseFinSaisie({ ...o, apres: 'x'.repeat(60) })).toBe('Texte modifié : « ' + 'x'.repeat(39) + '… ».');
  });
});
