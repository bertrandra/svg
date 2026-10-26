// L'export Cricut sans recalage automatique (ADR-0039) : le plan est le tapis, un cadre de reperage par couleur passe sous les formes,
// les formes gardent leurs coordonnees. Avec le recalage (le defaut), l'export d'avant a l'octet. Les references neuves vivent dans
// tests/fixtures/cricut-recalage/ ; elles se refont, relues, par :
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/export/recalage.test.ts

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { poserOperation, resoudreProfil, type ProfilProduction } from '../../../src/engine/preparation.js';
import { modeDEmploiOperations } from '../../../src/export/operations.js';
import { CHOIX_CRICUT_DEFAUT, type ChoixMachine } from '../../../src/model/contextes.js';
import { violationsNettoyage } from '../securite/invariants.js';
import { exportParOperation, plat, svgCricut, svgPourStylo } from './plats.js';

const DOSSIER = resolve(__dirname, '../../fixtures/cricut-recalage'), SVG = resolve(__dirname, '../../fixtures/svg');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';
const lire = (t: string): DessinSvg => { const r = lireDessin(t); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
const profil = (c: Partial<ChoixMachine> = {}): ProfilProduction => { const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in', ...c }); if (!p) throw new Error('profil'); return p; };
const FIXE = profil({ recalage: false });

/** Un dessin pose au milieu d'un tapis de 12 po (le plan est le tapis) : un carre rouge, un disque bleu, et un trait a ecrire. */
const MILIEU = lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1152 1152">'
  + '<rect x="480" y="528" width="192" height="96" fill="#c81e28"/>'
  + '<circle cx="768" cy="576" r="48" fill="#1428a0"/>'
  + '<path d="M480 672L672 672" fill="none" stroke="#15181d" stroke-width="2"/></svg>');
const SANS_TRAIT: DessinSvg = { ...MILIEU, formes: MILIEU.formes.slice(0, 2) };

const reference = (nom: string, obtenu: string) => {
  const chemin = resolve(DOSSIER, nom);
  if (ACTUALISER) { mkdirSync(DOSSIER, { recursive: true }); writeFileSync(chemin, obtenu); return; }
  expect(existsSync(chemin), 'reference absente : ' + nom).toBe(true);
  expect(obtenu).toBe(readFileSync(chemin, 'utf8'));
};
const coupe = (d: DessinSvg, p: ProfilProduction): string => { const r = svgCricut(d, p); if ('erreur' in r) throw new Error(r.erreur); return r.svg; };
const chemins = (s: string): string[] => [...s.matchAll(/<path d="([^"]*)"/g)].map(m => m[1] ?? '');

describe('l export Cricut avec le recalage automatique', () => {
  it('est celui d avant, a l octet (la reference cricut-export, sans la regenerer)', () => {
    const entree = lire(readFileSync(resolve(SVG, 'cricut.svg'), 'utf8'));
    expect(coupe(entree, profil())).toBe(readFileSync(resolve(SVG, 'cricut-export.attendu.svg'), 'utf8'));
  });

  it('ne depend pas de la feuille : elle n est jamais ecrite dans un export', () => {
    expect(coupe(SANS_TRAIT, profil({ feuille: { x: 96, y: 96, l: 480, h: 480 } }))).toBe(coupe(SANS_TRAIT, profil()));
    expect(coupe(SANS_TRAIT, profil({ recalage: false, feuille: { x: 96, y: 96, l: 480, h: 480 } }))).toBe(coupe(SANS_TRAIT, FIXE));
  });
});

describe('l export Cricut sans recalage automatique', () => {
  it('garde le tapis pour plan, un cadre de reperage par couleur sous les formes, et les coordonnees des formes', () => {
    const avec = coupe(SANS_TRAIT, profil()), sans = coupe(SANS_TRAIT, FIXE);
    expect(sans).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 1152 1152" width="12in" height="12in" data-ed-contexte="cricut"/);
    expect(sans).not.toContain('data-ed-recalage');
    expect(sans).not.toContain('data-ed-feuille');
    const formes = chemins(avec), tout = chemins(sans);
    // Deux couleurs, deux cadres d'abord : la zone utile (11,5 po, a un quart de pouce du bord), creusee d'un anneau.
    expect(tout.length).toBe(formes.length + 2);
    expect(tout[0]).toBe('M24 24L1128 24L1128 1128L24 1128ZM26 26L26 1126L1126 1126L1126 26Z');
    expect(tout[1]).toBe(tout[0]);
    expect([...sans.matchAll(/fill="(#[0-9a-f]+)"/g)].slice(0, 2).map(m => m[1])).toEqual(['#c81e28', '#1428a0']);
    // Les formes, elles, ne bougent pas d'une coordonnee.
    expect(tout.slice(2)).toEqual(formes);
    expect(violationsNettoyage(sans)).toEqual([]);
    reference('cricut-fixe.attendu.svg', sans);
  });

  it('pose au stylo un cadre en trait par couleur de stylo', () => {
    const r = svgPourStylo(MILIEU, profil({ recalage: false, procede: 'dessin-stylo' }));
    if (r.erreur !== undefined) throw new Error(r.erreur);
    expect(r.svg).toContain('viewBox="0 0 1152 1152" width="12in" height="12in"');
    expect(chemins(r.svg)[0]).toBe('M24 24L1128 24L1128 1128L24 1128Z');
    reference('stylo-fixe.attendu.svg', r.svg);
  });

  it('livre l archive d un dessin mele avec ses cadres, et le mode d emploi le dit', () => {
    const d = poserOperation(MILIEU, ['f3'], 'ecriture', 'decoupe').dessin;
    const r = exportParOperation(d, FIXE);
    if ('erreur' in r || r.genre !== 'mixte') throw new Error('mixte attendu');
    expect(r.combine).toMatch(/<g id="a-couper"><path d="M24 24L1128 24/);
    const lisezmoi = modeDEmploiOperations('essai', plat(d), FIXE, r);
    expect(lisezmoi).toContain('Recalage automatique désactivé');
    expect(lisezmoi).toContain('font 12 × 12 po');
    reference('couper-ecrire-fixe-combine.attendu.svg', r.combine);
    reference('couper-ecrire-fixe-lisezmoi.attendu.txt', lisezmoi);
  });
});
