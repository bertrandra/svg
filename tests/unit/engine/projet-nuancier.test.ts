import { describe, expect, it } from 'vitest';
import { ecrireDessin, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { avecNuancier, nuancierDeSelection, poserNuancier } from '../../../src/engine/nuancier.js';
import { etatDuProjet, projetDe, texteDuProjet, type EtatProjet } from '../../../src/engine/projet.js';
import { lireProjet } from '../../../src/model/projet.js';
import { CHOIX_GENERIQUE } from '../../../src/model/contextes.js';

// Le nuancier du dessin dans le projet JSON (ADR-0037, ADR-0030) : il fait l'aller-retour exact avec sa provenance, un projet
// d'avant lui reste tel quel, la lecture refuse en le nommant ce qui n'est pas un nuancier, et le SVG ecrit n'en porte rien.

function dessin(corps: string): DessinSvg {
  const lu = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">' + corps + '</svg>');
  if ('erreur' in lu) throw new Error(lu.erreur);
  return lu.dessin;
}

const BASE = dessin('<rect x="0" y="0" width="100" height="100" fill="#1428a0" fill-opacity="0.5"/><circle cx="150" cy="50" r="20" fill="#c81e28" stroke="#000000" stroke-width="2"/>');
const etat = (d: DessinSvg): EtatProjet => ({ nom: 'essai', dessin: d, production: CHOIX_GENERIQUE, nuancier: [{ nom: 'Rouge', hex: '#c81e28' }], polices: [], images: [] });

function allerRetour(d: DessinSvg) {
  const texte = texteDuProjet(projetDe(etat(d)));
  const relu = lireProjet(JSON.parse(texte));
  if ('erreur' in relu) throw new Error(relu.erreur);
  const rouvert = etatDuProjet(relu.projet);
  if ('erreur' in rouvert) throw new Error(rouvert.erreur);
  return { texte, rouvert };
}

/** Le texte JSON d'un projet dont on remplace le nuancier du dessin par `n`, pour essayer la lecture. */
function avecNuancierBrut(n: unknown): unknown {
  const p = JSON.parse(texteDuProjet(projetDe(etat(BASE)))) as { dessin: Record<string, unknown> };
  p.dessin['nuancier'] = n;
  return p;
}

describe('le nuancier du dessin dans le projet', () => {
  it('fait l’aller-retour exact, provenance et opacites comprises', () => {
    const ouvert = avecNuancier(BASE);
    const { texte, rouvert } = allerRetour(ouvert);
    expect(rouvert.dessin.nuancier).toEqual(ouvert.nuancier);
    expect(rouvert.dessin.nuancier).toEqual({ provenance: 'dessin', teintes: [{ hex: '#1428a0', opacite: 0.5 }, { hex: '#c81e28' }, { hex: '#000000' }] });
    expect(texteDuProjet(projetDe(etat(rouvert.dessin)))).toBe(texte);
    expect(texte).toContain('"nuancier":{"provenance":"dessin","teintes":[{"hex":"#1428a0","opacite":0.5},{"hex":"#c81e28"},{"hex":"#000000"}]}');
  });

  it('garde la provenance d’un nuancier cree depuis la selection', () => {
    const r = nuancierDeSelection(BASE, [BASE.formes[1]?.id ?? ''], 'remplacer');
    if (!r) throw new Error('aucune couleur');
    const { rouvert } = allerRetour(poserNuancier(BASE, r.nuancier));
    expect(rouvert.dessin.nuancier).toEqual({ provenance: 'selection', teintes: [{ hex: '#c81e28' }, { hex: '#000000' }] });
  });

  it('laisse un projet d’avant le nuancier tel quel, octet pour octet', () => {
    const { texte, rouvert } = allerRetour(BASE);
    expect(texte).not.toContain('"provenance"');
    expect(rouvert.dessin.nuancier).toBeUndefined();
    // Rouvert dans l'editeur, il prend le nuancier de ses couleurs, comme un SVG.
    expect(avecNuancier(rouvert.dessin).nuancier?.provenance).toBe('dessin');
  });

  it('n’ecrit aucun octet de plus dans le SVG', () => {
    const ouvert = avecNuancier(BASE);
    expect(ecrireDessin(ouvert, 3)).toBe(ecrireDessin(BASE, 3));
  });

  it('refuse en le nommant ce qui n’est pas un nuancier', () => {
    const refus = (n: unknown) => { const r = lireProjet(avecNuancierBrut(n)); return 'erreur' in r ? r.erreur : ''; };
    expect(refus({ provenance: 'ailleurs', teintes: [] })).toContain('la provenance du nuancier');
    expect(refus({ provenance: 'dessin', teintes: [{ hex: 'red' }] })).toContain('#rrggbb');
    expect(refus({ provenance: 'dessin', teintes: [{ hex: '#C81E28' }] })).toContain('#rrggbb');
    expect(refus({ provenance: 'dessin', teintes: [{ hex: '#c81e28', opacite: 1 }] })).toContain('opacité pleine');
    expect(refus({ provenance: 'dessin', teintes: [{ hex: '#c81e28', opacite: 2 }] })).toContain('hors de ses bornes');
    expect(refus({ provenance: 'dessin', teintes: Array.from({ length: 257 }, () => ({ hex: '#000000' })) })).toContain('plus de 256');
    expect(refus([])).toContain('n’est pas un objet');
  });

  it('ne garde aucun champ inconnu d’une teinte', () => {
    const r = lireProjet(avecNuancierBrut({ provenance: 'mixte', teintes: [{ hex: '#c81e28', nom: 'Rouge', __proto__: { x: 1 } }], autre: 1 }));
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.projet.dessin.nuancier).toEqual({ provenance: 'mixte', teintes: [{ hex: '#c81e28' }] });
    expect(Object.keys(r.projet.dessin.nuancier ?? {})).toEqual(['provenance', 'teintes']);
  });
});
