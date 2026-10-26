// L'aller-retour : chaque PDF que le projet sait ecrire (export/pdf.ts : page au format du dessin, A4 avec marge, fond perdu et
// reperes, CMJN) se relit en formes geometriquement fideles. Les entrees sont les SVG de reference (tests/fixtures/svg) : SVG ->
// lireDessin -> ecrirePdf -> lirePdf, puis chaque forme relue est confrontee a la forme d'origine portee dans la page (boite
// exacte, aire, couleurs, opacites, trait). Les ecarts maximaux sont ecrits dans la sortie du test (ADR-0020).

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boiteChemin, depart, lireDessin, opaciteDuContour, opaciteDuRemplissage, transformerChemin, type Chemin, type DessinSvg, type Forme, type Matrice } from '../../../../src/engine/editionSvg.js';
import { type OptionsPdf } from '../../../../src/export/pdf.js';
import { miseEnPage } from '../../../../src/export/pdfPage.js';
import { lu } from './fabrique.js';
import { ecrirePdf } from '../../export/plats.js';

const DOSSIER = resolve(__dirname, '../../../fixtures/svg');

/** L'aire d'un chemin (somme des aires absolues de ses sous-traces), courbes approchees par 32 segments. */
export function aire(d: Chemin): number {
  let total = 0, poly: Array<[number, number]> = [];
  const fermer = () => {
    let s = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i] ?? [0, 0], b = poly[(i + 1) % poly.length] ?? [0, 0]; s += a[0] * b[1] - b[0] * a[1]; }
    total += Math.abs(s) / 2;
    poly = [];
  };
  d.forEach((c, i) => {
    const p = c.p;
    if (c.c === 'M') { if (poly.length) fermer(); poly.push([p[0] ?? 0, p[1] ?? 0]); }
    else if (c.c === 'L') poly.push([p[0] ?? 0, p[1] ?? 0]);
    else if (c.c === 'C' || c.c === 'Q') {
      const [x0, y0] = depart(d, i);
      for (let k = 1; k <= 32; k++) {
        const t = k / 32, u = 1 - t;
        if (c.c === 'C') poly.push([u * u * u * x0 + 3 * u * u * t * (p[0] ?? 0) + 3 * u * t * t * (p[2] ?? 0) + t * t * t * (p[4] ?? 0), u * u * u * y0 + 3 * u * u * t * (p[1] ?? 0) + 3 * u * t * t * (p[3] ?? 0) + t * t * t * (p[5] ?? 0)]);
        else poly.push([u * u * x0 + 2 * u * t * (p[0] ?? 0) + t * t * (p[2] ?? 0), u * u * y0 + 2 * u * t * (p[1] ?? 0) + t * t * (p[3] ?? 0)]);
      }
    } else if (poly.length) fermer();
  });
  if (poly.length) fermer();
  return total;
}

const dessinDe = (nom: string, svg: string): Array<[string, DessinSvg]> => {
  const r = lireDessin(svg);
  return 'erreur' in r ? [] : [[nom, r.dessin]];
};

/** Les SVG de reference que la lecture accepte, avec leur dessin. */
const entrees = (): Array<[string, DessinSvg]> =>
  readdirSync(DOSSIER).filter(n => n.endsWith('.svg') && !n.endsWith('.attendu.svg')).sort().flatMap(n => dessinDe(n, readFileSync(resolve(DOSSIER, n), 'utf8')));

/** Soixante formes de la bibliotheque (game-icons), prises a intervalles reguliers : des courbes en nombre. */
function formesBibliotheque(): Array<[string, DessinSvg]> {
  const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { icons: Record<string, { body: string }> };
  const noms = Object.keys(jeu.icons).sort();
  return Array.from({ length: 60 }, (_, k) => noms[Math.floor((k * noms.length) / 60)] ?? '')
    .flatMap(n => dessinDe(n, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' + (jeu.icons[n]?.body ?? '') + '</svg>'));
}

/** Ce que le writer peint : une forme visible remplie, ou tracee d'une epaisseur non nulle. */
const peinte = (f: Forme) => f.visible && (f.remplissage !== null || (f.contour !== null && f.epaisseur > 0));

/** La matrice qui porte le repere du SVG dans celui du dessin relu (Y vers le bas, origine en haut a gauche de la page). */
function matrice(dessin: DessinSvg, o: OptionsPdf): { m: Matrice; echelle: number; reperes: number } {
  const [vx, vy, , vh] = dessin.vb, mise = miseEnPage(dessin.vb, o);
  if (!mise) return { m: [1, 0, 0, 1, -vx, -vy], echelle: 1, reperes: 0 };
  const H = mise.media[3], e = Number(mise.echelle.toFixed(6));
  // PDF : X = dx + e (x - vx), Y = dy + e (vh - (y - vy)) ; relu : x' = X, y' = H - Y.
  return { m: [e, 0, 0, e, mise.dx - e * vx, H - mise.dy - e * (vh + vy)], echelle: e, reperes: mise.reperes ? 8 : 0 };
}

/** Les formes que le fond perdu rogne (leur boite, trait compris, en deborde), dans le repere relu. */
function debordantes(dessin: DessinSvg, o: OptionsPdf, formes: readonly Forme[], m: Matrice): number {
  const mise = miseEnPage(dessin.vb, o);
  if (!mise?.boites) return 0;
  const H = mise.media[3], [bx0, by0, bx1, by1] = mise.bleed, k = m[0];
  return formes.filter(f => {
    const b = boiteChemin(transformerChemin(f.d, m)), t = f.contour && f.epaisseur > 0 ? (f.epaisseur * k) / 2 : 0;
    return b !== null && (b.x - t < bx0 - 0.01 || b.x + b.l + t > bx1 + 0.01 || b.y - t < H - by1 - 0.01 || b.y + b.h + t > H - by0 + 0.01);
  }).length;
}

const hexVers = (h: string | null) => (h ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) : null);

interface Ecarts { formes: number; boite: number; aire: number; couleur: number; opacite: number; epaisseur: number }

function confronter(nom: string, dessin: DessinSvg, o: OptionsPdf, e: Ecarts): void {
  const attendues = dessin.formes.filter(peinte);
  const relu = lu(ecrirePdf(dessin, o));
  const { m, echelle, reperes } = matrice(dessin, o);
  expect(relu.dessin.formes.length, nom + ' : nombre de formes').toBe(attendues.length + reperes);
  // Rien n'est perdu, sauf ce que le PDF a vraiment coupe : le writer decoupe au fond perdu, et un trait qui deborde du plan
  // plus que le fond perdu y est rogne. La lecture le dit pour ces formes-la exactement ; le CMJN se dit approche.
  const coupees = debordantes(dessin, o, attendues, m);
  expect(relu.ignores, nom + ' : pertes dites').toEqual([
    ...(coupees ? ['les découpes (masques d’écrêtage) de ' + coupees + ' forme' + (coupees > 1 ? 's' : '') + ' : ce qu’elles cachaient se voit'] : []),
    ...(o.cmjn ? ['les couleurs CMJN, converties en RVB sans profil (valeurs approchées)'] : [])
  ]);
  attendues.forEach((f, i) => {
    const g = relu.dessin.formes[i];
    if (!g) throw new Error(nom + ' : forme ' + i + ' absente');
    const quoi = nom + ' forme ' + i + ' (' + f.id + ')';
    const d0 = transformerChemin(f.d, m), b0 = boiteChemin(d0), b1 = boiteChemin(g.d);
    if (b0 && b1) {
      const ecart = Math.max(Math.abs(b0.x - b1.x), Math.abs(b0.y - b1.y), Math.abs(b0.l - b1.l), Math.abs(b0.h - b1.h));
      e.boite = Math.max(e.boite, ecart / Math.max(echelle, 1));
      expect(ecart, quoi + ' : boite').toBeLessThan(0.0021 * Math.max(echelle, 1) + 0.0011);
    }
    const a0 = aire(d0), a1 = aire(g.d), ra = Math.abs(a0 - a1) / Math.max(a0, 1);
    e.aire = Math.max(e.aire, ra);
    expect(ra, quoi + ' : aire ' + a0 + ' contre ' + a1).toBeLessThan(2e-3);
    const tolerance = o.cmjn ? 2 : 0;
    for (const [a, b] of [[f.remplissage, g.remplissage], [f.contour && f.epaisseur > 0 ? f.contour : null, g.contour]] as const) {
      const ca = hexVers(a), cb = hexVers(b);
      expect(cb === null, quoi + ' : peinture presente ' + a + ' / ' + b).toBe(ca === null);
      if (ca && cb) { const d = Math.max(...ca.map((v, k) => Math.abs(v - (cb[k] ?? 0)))); e.couleur = Math.max(e.couleur, d); expect(d, quoi + ' : couleur ' + a + ' / ' + b).toBeLessThanOrEqual(tolerance); }
    }
    expect(g.regle, quoi + ' : regle').toBe(f.regle);
    const fond = (x: Forme) => x.opacite * opaciteDuRemplissage(x), trait = (x: Forme) => x.opacite * opaciteDuContour(x);
    if (f.remplissage) { const d = Math.abs(fond(f) - fond(g)); e.opacite = Math.max(e.opacite, d); expect(d, quoi + ' : opacite du fond').toBeLessThan(0.0011); }
    if (g.contour) {
      const d = Math.abs(trait(f) - trait(g)); e.opacite = Math.max(e.opacite, d); expect(d, quoi + ' : opacite du trait').toBeLessThan(0.0011);
      const de = Math.abs(f.epaisseur * echelle - g.epaisseur) / echelle;
      e.epaisseur = Math.max(e.epaisseur, de);
      expect(de, quoi + ' : epaisseur').toBeLessThan(0.0011);
      expect([g.bout, g.jonction, g.pointilles?.length ?? 0], quoi + ' : style du trait').toEqual([f.bout, f.jonction, f.pointilles?.length ?? 0]);
    }
    e.formes++;
  });
}

const VARIANTES: ReadonlyArray<readonly [string, OptionsPdf]> = [
  ['page du dessin', {}],
  ['A4, marge, fond perdu et reperes', { page: 'A4', marge: 10, fondPerdu: 3, reperes: true }],
  ['CMJN', { cmjn: true }],
  ['A4 CMJN avec reperes', { page: 'A4', fondPerdu: 3, reperes: true, cmjn: true }]
];

describe('aller-retour : ce que l export PDF ecrit se relit en formes fideles', () => {
  const references = entrees(), jeu = [...references, ...formesBibliotheque()];

  it('dispose de la plupart des SVG de reference, et de soixante formes de la bibliotheque', () => {
    expect(references.length).toBeGreaterThanOrEqual(30);
    expect(jeu.length).toBe(references.length + 60);
  });

  for (const [titre, o] of VARIANTES) {
    it(titre, () => {
      const e: Ecarts = { formes: 0, boite: 0, aire: 0, couleur: 0, opacite: 0, epaisseur: 0 };
      for (const [nom, dessin] of jeu) confronter(nom, dessin, o, e);
      console.log('aller-retour ' + titre + ' : ' + references.length + ' SVG de reference et ' + (jeu.length - references.length) + ' formes de la bibliotheque, ' + e.formes + ' formes ; ecarts maximaux : boite ' + e.boite.toExponential(2) + ', aire ' + e.aire.toExponential(2) + ' (relatif), couleur ' + e.couleur + '/255, opacite ' + e.opacite.toFixed(4) + ', epaisseur ' + e.epaisseur.toExponential(2));
      expect(e.formes).toBeGreaterThan(240);
    });
  }
});
