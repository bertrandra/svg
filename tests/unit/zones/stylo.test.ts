// Le procede « Dessin au stylo » dans le parcours Cricut (ADR-0022) : le libelle de l'export, les etapes dans Design Space, le
// selecteur, la marque relue, le jugement et l'export du stylo.

import { describe, expect, it } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { choixDeMarque, constatsBloquants, constatsPreparation, resoudreProfil, type ProfilProduction } from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT, NOMS_PROCEDE, OUTILS_A_VENIR } from '../../../src/model/contextes.js';
import { etapesDesignSpace, etatExport, libelleExport, libelleSelecteur } from '../../../src/zones/parcoursCricut.js';
import { modeParDefaut } from '../../../src/zones/actionsTexte.js';
import { svgPourStylo } from '../export/plats.js';

const STYLO = { contexte: 'cricut' as const, ...CHOIX_CRICUT_DEFAUT, procede: 'dessin-stylo' as const };
const profil = (): ProfilProduction => { const p = resoudreProfil(STYLO); if (!p) throw new Error('profil'); return p; };
const lire = (corps: string, l = 480, h = 288): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + l + ' ' + h + '">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

describe('le procede « Dessin au stylo »', () => {
  it('se nomme, se resout avec la largeur du stylo (0,4 mm a 96 ppp), et se relit d une marque', () => {
    expect(NOMS_PROCEDE['dessin-stylo']).toBe('Dessin au stylo');
    expect(profil().largeurStylo).toBeCloseTo((0.4 / 25.4) * 96, 9);
    expect(choixDeMarque({ contexte: 'cricut', procede: 'dessin-stylo' }).choix).toMatchObject({ procede: 'dessin-stylo' });
    expect(OUTILS_A_VENIR.map(o => o.id)).toEqual(['gravure', 'dorure']);
  });

  it('dit son export et son selecteur', () => {
    expect(libelleExport('dessin-stylo')).toBe('Exporter pour le stylo');
    expect(etatExport([], 'dessin-stylo').libelle).toBe('Exporter pour le stylo');
    expect(etatExport([]).libelle).toBe('Exporter pour Cricut');
    expect(libelleSelecteur(STYLO)).toBe('Cricut Maker · 12 × 12 · Stylo');
    expect(modeParDefaut(STYLO)).toBe('lettres');
  });

  it('donne ses etapes dans Design Space, « Dessiner » et les lignes ouvertes marquees a verifier', () => {
    const e = etapesDesignSpace(profil(), 'carte', { l: 96, h: 48 });
    expect(e.map(x => x.texte)).toContain('Choisissez le fichier carte-stylo.svg, importez-le, puis ajoutez-le au projet.');
    expect(e.find(x => x.texte.startsWith('Pour chaque couche, choisissez « Dessiner »'))?.aVerifier).toBe(true);
    expect(e.find(x => x.texte.startsWith('Vérifiez que les lignes restent ouvertes'))?.aVerifier).toBe(true);
  });

  it('juge : une forme pleine se dit, une ligne non ; trop grand pour le tapis bloque', () => {
    expect(constatsPreparation(lire('<path d="M48 48H240V240H48Z" fill="#c81e28"/>'), profil()).map(c => c.code)).toEqual(['stylo-plein']);
    const c = constatsPreparation(lire('<path d="M48 48H240V240H48Z" fill="#c81e28"/>'), profil())[0];
    expect(c).toMatchObject({ correction: 'garder-contour', autres: ['hachurer'] });
    expect(constatsPreparation(lire('<path d="M48 48L240 240" stroke="#000" fill="none"/>'), profil())).toEqual([]);
    expect(constatsBloquants(lire('<path d="M0 0H1500V40H0Z" fill="#000"/>', 1600, 100), profil()).map(c => c.code)).toEqual(['piece-trop-grande']);
  });

  it('exporte des traits sans fond, a la taille du profil, avec sa marque ; refuse une piece trop grande', () => {
    const r = svgPourStylo(lire('<path d="M48 48H240V240H48Z" fill="#c81e28"/><path d="M288 96L432 96" stroke="#1f4e8c" stroke-width="2" fill="none"/>'), profil());
    if (r.erreur !== undefined) throw new Error(r.erreur);
    expect(r).toMatchObject({ couches: 2, pourtours: 1 });
    expect(r.svg).toContain('width="127mm" height="76.2mm"');
    expect(r.svg).toContain('data-ed-procede="dessin-stylo"');
    expect([...r.svg.matchAll(/ fill="([^"]*)"/g)].every(m => m[1] === 'none')).toBe(true);
    expect('erreur' in svgPourStylo(lire('<path d="M0 0H1500V40H0Z" fill="#000"/>', 1600, 100), profil())).toBe(true);
  });
});
