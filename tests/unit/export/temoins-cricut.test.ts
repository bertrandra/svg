// Les SVG temoins du protocole Cricut (docs/cricut/protocole.md) : six essais a faire sur une vraie machine pour
// figer les valeurs `aVerifier` des profils. Ils sont fabriques ici par les memes fonctions que l'editeur (export
// Cricut, Print Then Cut, ou l'ecriture ordinaire quand l'essai porte justement sur ce que l'export refuse), et
// compares aux fichiers commites : un temoin ne derive jamais du code qui l'a produit.
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/export/temoins-cricut.test.ts

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, marquerProduction, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { constatsPreparation, marqueDeProfil, resoudreProfil, type ProfilProduction } from '../../../src/engine/preparation.js';
import { svgCricut } from '../../../src/export/cricut.js';
import { printThenCut } from '../../../src/export/printThenCut.js';
import { svgExporte } from '../../../src/export/svgs.js';
import { CHOIX_CRICUT_DEFAUT } from '../../../src/model/contextes.js';

const DOSSIER = resolve(__dirname, '../../../docs/cricut/temoins');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';
const P = 96;

const lire = (corps: string, l: number, h: number): DessinSvg => {
  const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + l * P + ' ' + h * P + '">' + corps + '</svg>');
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const profilDe = (procede: 'decoupe' | 'imprimer-decouper'): ProfilProduction => {
  // Les temoins sont en pouces, l'unite de Design Space et du protocole : le millimetre par defaut de l'interface ne les touche pas.
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, unite: 'in', procede });
  if (!p) throw new Error('profil');
  return p;
};
const MAKER = profilDe('decoupe'), PTC = profilDe('imprimer-decouper');
const rect = (x: number, y: number, l: number, h: number, couleur: string) => '<rect x="' + x * P + '" y="' + y * P + '" width="' + l * P + '" height="' + h * P + '" fill="' + couleur + '"/>';
const pourCricut = (d: DessinSvg): string => { const r = svgCricut(d, MAKER); if ('erreur' in r) throw new Error(r.erreur); return r.svg; };
/** L'ecriture d'un dessin que l'export Cricut refuserait (c'est l'objet de l'essai) : taille physique et marque quand meme. */
const brut = (d: DessinSvg): string => marquerProduction(svgExporte(d, { precision: 3, taille: { largeur: d.vb[2] / P, unite: 'in' } }), marqueDeProfil(MAKER));

/** Une regle de 6 po : une bande de 1/2 po, une encoche de 1/8 po de large tous les pouces (1/4 po de profond) et demi-pouces (1/8 po). */
function regle(): string {
  const y = 2.75, encoches: string[] = [];
  for (let k = 1; k < 12; k++) {
    const x = 0.5 + k / 2, profondeur = k % 2 === 0 ? 0.25 : 0.125;
    // L'encoche est un trou ouvert sur le bord haut : on la dessine en creux dans le contour de la bande.
    encoches.push('L' + (x - 1 / 16) * P + ' ' + y * P + 'L' + (x - 1 / 16) * P + ' ' + (y + profondeur) * P + 'L' + (x + 1 / 16) * P + ' ' + (y + profondeur) * P + 'L' + (x + 1 / 16) * P + ' ' + y * P);
  }
  return '<path d="M' + 0.5 * P + ' ' + y * P + encoches.join('') + 'L' + 6.5 * P + ' ' + y * P + 'L' + 6.5 * P + ' ' + (y + 0.5) * P + 'L' + 0.5 * P + ' ' + (y + 0.5) * P + 'Z" fill="#15181d"/>';
}

const ANNEAU = (cx: number, sensInverse: boolean) => {
  const r = P, t = P / 2, x = cx * P, y = 1.5 * P;
  const exterieur = 'M' + (x - r) + ' ' + y + 'A' + r + ' ' + r + ' 0 1 1 ' + (x + r) + ' ' + y + 'A' + r + ' ' + r + ' 0 1 1 ' + (x - r) + ' ' + y + 'Z';
  const s = sensInverse ? '0' : '1';
  const interieur = 'M' + (x - t) + ' ' + y + 'A' + t + ' ' + t + ' 0 1 ' + s + ' ' + (x + t) + ' ' + y + 'A' + t + ' ' + t + ' 0 1 ' + s + ' ' + (x - t) + ' ' + y + 'Z';
  return exterieur + ' ' + interieur;
};

const TEMOINS: ReadonlyArray<{ nom: string; fabriquer: () => string }> = [
  // 1. La taille exacte : un carre de 2 po et une regle de 6 po, avec unites ; puis le meme sans unite (a 96 ppp).
  { nom: 'temoin-1-taille.svg', fabriquer: () => pourCricut(lire(rect(0.5, 0.5, 2, 2, '#15181d') + regle(), 7, 3.5)) },
  { nom: 'temoin-1b-sans-unite.svg', fabriquer: () => ecrireDessin(lire(rect(0.5, 0.5, 2, 2, '#15181d') + regle(), 7, 3.5), 3) },
  // 2. Le trou : deux anneaux de 2 po (trou de 1 po), a gauche en pair-impair, a droite selon le sens du trace.
  { nom: 'temoin-2-trou.svg', fabriquer: () => pourCricut(lire('<path d="' + ANNEAU(1.5, false) + '" fill="#1428a0" fill-rule="evenodd"/><path d="' + ANNEAU(4, true) + '" fill="#1428a0"/>', 5.5, 3)) },
  // 3. Deux nuances a environ 2 % d'ecart (0,0196 en OKLab) : deux tapis, ou un ?
  { nom: 'temoin-3-couleurs-proches.svg', fabriquer: () => pourCricut(lire(rect(0.5, 0.5, 1.5, 1.5, '#c81e28') + rect(2.5, 0.5, 1.5, 1.5, '#d1212b'), 4.5, 2.5)) },
  // 4. Un trait epais non converti (1/8 po), et des bandes de 1/32, 1/16, 3/32 et 1/8 po pour regler le detail minimal.
  {
    nom: 'temoin-4-trait.svg',
    fabriquer: () => brut(lire('<rect x="' + 0.75 * P + '" y="' + 0.75 * P + '" width="' + 1.5 * P + '" height="' + 1.5 * P + '" fill="#c81e28" stroke="#15181d" stroke-width="' + P / 8 + '"/>'
      + [1 / 32, 1 / 16, 3 / 32, 1 / 8].map((l, i) => rect(3 + i * 0.5, 0.5, l, 2, '#15181d')).join(''), 5.5, 3))
  },
  // 5. Plus grand que le tapis : 11,5 po (la zone utile supposee), 11,75 po et 12,5 po de large, une couleur chacun.
  { nom: 'temoin-5-depasse-le-tapis.svg', fabriquer: () => brut(lire(rect(0.25, 0.25, 11.5, 1, '#15181d') + rect(0.25, 1.5, 11.75, 1, '#1428a0') + rect(0.25, 2.75, 12.5, 1, '#c81e28'), 13, 4)) },
  // 6. Print Then Cut : un dessin en couleurs, son image a imprimer avec fond perdu, et sa ligne de coupe.
  ...(['impression', 'coupe'] as const).map(fichier => ({
    nom: 'temoin-6-print-then-cut-' + fichier + '.svg',
    fabriquer: () => {
      const d = lire('<circle cx="' + 1.5 * P + '" cy="' + 1.5 * P + '" r="' + P + '" fill="#f2c14e"/><path d="M' + 1.5 * P + ' ' + 0.5 * P + 'A' + P + ' ' + P + ' 0 0 1 ' + 2.5 * P + ' ' + 1.5 * P + 'L' + 1.5 * P + ' ' + 1.5 * P + 'Z" fill="#c81e28"/>'
        + rect(3, 0.75, 1.5, 1.5, '#1428a0') + '<path d="M' + 3.25 * P + ' ' + 1.5 * P + 'H' + 4.25 * P + '" stroke="#ffffff" stroke-width="' + P / 16 + '" fill="none"/>', 5, 3);
      const r = printThenCut(d, PTC);
      if ('erreur' in r) throw new Error(r.erreur);
      return r[fichier];
    }
  }))
];

describe('les temoins du protocole Cricut', () => {
  if (ACTUALISER && !existsSync(DOSSIER)) mkdirSync(DOSSIER, { recursive: true });
  for (const t of TEMOINS) {
    it('fabrique ' + t.nom + ' comme le fichier commite', () => {
      const obtenu = t.fabriquer();
      const chemin = resolve(DOSSIER, t.nom);
      if (ACTUALISER) { writeFileSync(chemin, obtenu); return; }
      expect(readFileSync(chemin, 'utf8')).toBe(obtenu);
    });
  }

  it('ne garde dans le dossier que les temoins fabriques ici, et le protocole les nomme tous', () => {
    expect(readdirSync(DOSSIER).sort()).toEqual(TEMOINS.map(t => t.nom).sort());
    const protocole = readFileSync(resolve(__dirname, '../../../docs/cricut/protocole.md'), 'utf8');
    for (const t of TEMOINS) expect(protocole, t.nom).toContain(t.nom);
  });

  it('fait voir au panneau ce que chaque essai doit montrer', () => {
    const constats = (nom: string, p = MAKER) => {
      const r = lireDessin(readFileSync(resolve(DOSSIER, nom), 'utf8'));
      if ('erreur' in r) throw new Error(r.erreur);
      return constatsPreparation(r.dessin, p).map(c => c.code);
    };
    expect(constats('temoin-1-taille.svg')).toEqual([]);
    expect(constats('temoin-2-trou.svg')).toEqual(['pair-impair']);
    expect(constats('temoin-3-couleurs-proches.svg')).toEqual(['nuances-proches']);
    expect(constats('temoin-4-trait.svg')).toEqual(['trait', 'detail-fin']);
    expect(constats('temoin-5-depasse-le-tapis.svg')).toEqual(['piece-trop-grande']);
    expect(constats('temoin-6-print-then-cut-impression.svg', PTC)).toEqual([]);
  });
});
