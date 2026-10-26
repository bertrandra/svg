// Les operateurs de trace d'un PDF (ADR-0004, ADR-0018) : une forme en operateurs de chemin (m, l, c, h), remplie et contournee avec
// ses couleurs, son opacite et sa regle de remplissage. Sortis de `pdf.ts` tels quels (un dessin plat garde ses octets) pour que
// l'ecriture native d'un dessin riche (`pdfNatif.ts`, etape 13a) les partage. Pur et deterministe.

import { LIMITE_MITRE_DEFAUT, depart, opaciteDuContour, opaciteDuRemplissage, pointillesEcrits, type Chemin, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import { versCmjnNaif } from '../util/couleur.js';

export const nb = (v: number) => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? '0' : String(r); };

/** Un nombre a `k` decimales au plus, sans zero inutile ni « -0 ». */
export const nbk = (v: number, k: number) => { const r = Number(v.toFixed(k)); return Object.is(r, -0) ? '0' : String(r); };

/** Les composantes 0..1 d'une couleur #rrggbb ; noir si elle ne se lit pas. */
export function composantes(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1] ?? '0', 16) / 255, parseInt(m[2] ?? '0', 16) / 255, parseInt(m[3] ?? '0', 16) / 255] : [0, 0, 0];
}

/**
 * La couleur d'une peinture en operateur PDF : `rg`/`RG` (DeviceRGB, par defaut) ou `k`/`K` (DeviceCMYK
 * naif, sans profil ICC). Le noir pur reste « 0 0 0 1 k » : un texte ou un filet noir ne se separe jamais en quatre encres.
 */
export function couleurPdf(hex: string, trait: boolean, cmjn: boolean): string {
  const [r, g, b] = composantes(hex);
  if (!cmjn) return [r, g, b].map(nb).join(' ') + (trait ? ' RG' : ' rg');
  const m = versCmjnNaif({ r: r * 255, g: g * 255, b: b * 255 });
  return [m.c, m.m, m.j, m.n].map(v => nb(v / 100)).join(' ') + (trait ? ' K' : ' k');
}

/**
 * Comment les couleurs s'ecrivent : RVB, CMJN naif, ou en gris (`g`/`G`), le gris etant la luminance de la couleur — ce que lit un
 * masque d'opacite de luminance (coefficients de SVG, `luminanceToAlpha`, sur les composantes sRVB, comme les navigateurs).
 */
export type ModeCouleur = 'rvb' | 'cmjn' | 'gris';

/** La luminance d'une couleur, 0..1. */
export const luminance = (hex: string): number => { const [r, g, b] = composantes(hex); return 0.2125 * r + 0.7154 * g + 0.0721 * b; };

export function couleurMode(hex: string, trait: boolean, mode: ModeCouleur): string {
  return mode === 'gris' ? nb(luminance(hex)) + (trait ? ' G' : ' g') : couleurPdf(hex, trait, mode === 'cmjn');
}

/** Les operateurs de trace d'un chemin, dans le repere du PDF (origine en bas a gauche). */
export function operateurs(d: Chemin, vb: DessinSvg['vb']): string {
  const [vx, vy, , vh] = vb;
  const X = (x: number) => nb(x - vx), Y = (y: number) => nb(vh - (y - vy));
  const parts: string[] = [];
  d.forEach((c, i) => {
    const p = c.p;
    if (c.c === 'M') parts.push(X(p[0] ?? 0) + ' ' + Y(p[1] ?? 0) + ' m');
    else if (c.c === 'L') parts.push(X(p[0] ?? 0) + ' ' + Y(p[1] ?? 0) + ' l');
    else if (c.c === 'C') parts.push([X(p[0] ?? 0), Y(p[1] ?? 0), X(p[2] ?? 0), Y(p[3] ?? 0), X(p[4] ?? 0), Y(p[5] ?? 0)].join(' ') + ' c');
    else if (c.c === 'Q') {
      // Une quadratique en cubique equivalente : les poignees aux deux tiers.
      const [x0, y0] = depart(d, i), [x1, y1, x, y] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0];
      parts.push([X(x0 + (2 / 3) * (x1 - x0)), Y(y0 + (2 / 3) * (y1 - y0)), X(x + (2 / 3) * (x1 - x)), Y(y + (2 / 3) * (y1 - y)), X(x), Y(y)].join(' ') + ' c');
    } else parts.push('h');
  });
  return parts.join('\n');
}

/**
 * L'opacite du remplissage (ca) et celle du trait (CA) : celle de la forme, multipliee par la leur.
 * Sans opacite propre, les deux valent celle de la forme, comme avant.
 */
export function opacitesPdf(f: Forme): { ca: string; CA: string } {
  return { ca: nb(f.opacite * opaciteDuRemplissage(f)), CA: nb(f.opacite * opaciteDuContour(f)) };
}

/** Le nom stable de l'etat graphique d'une forme, ou null si elle est pleinement opaque. */
export const cleEtat = (f: Forme): string | null => {
  const { ca, CA } = opacitesPdf(f);
  return ca === '1' && CA === '1' ? null : ca === CA ? ca : ca + '/' + CA;
};

/** Les valeurs d'un etat graphique d'opacite, d'apres sa cle (« ca » ou « ca/CA »). */
export const valeursEtat = (cle: string) => { const [ca = '1', CA = ca] = cle.split('/'); return '/ca ' + ca + ' /CA ' + CA; };

/** Un trait d'epaisseur nulle est invisible en SVG, mais un filet en PDF (« 0 w » = le plus fin que l'appareil sait tracer) : on ne le trace pas. */
export const traite = (f: Forme) => f.contour !== null && f.epaisseur > 0;

/**
 * Le style du trait en operateurs PDF : bout (J), jonction (j), limite de pointe (M), pointilles (d). Le bout
 * plat est celui du PDF par defaut et ne s'ecrit pas ; la jonction ronde s'ecrit toujours (« 1 j »), comme avant.
 * La limite de pointe du PDF vaut 10 faute d'ecrire mieux : elle s'ecrit donc des qu'il y a une pointe, 4 comme SVG.
 */
export function operateursTrait(f: Forme): string[] {
  const r: string[] = [];
  if (f.bout) r.push((f.bout === 'round' ? '1' : '2') + ' J');
  r.push(f.jonction === 'miter' ? '0 j' : f.jonction === 'bevel' ? '2 j' : '1 j');
  if (f.jonction === 'miter') r.push(nb(f.limiteMitre ?? LIMITE_MITRE_DEFAUT) + ' M');
  const p = pointillesEcrits(f);
  if (p) r.push('[' + p.liste.join(' ') + '] ' + p.decalage + ' d');
  return r;
}

/** Une forme en operateurs, dans son `q … Q`, avec son etat graphique d'opacite s'il y en a un. */
export function contenuForme(f: Forme, vb: DessinSvg['vb'], etat: string | null, mode: ModeCouleur = 'rvb'): string {
  const lignes: string[] = ['q'];
  if (etat) lignes.push('/' + etat + ' gs');
  if (f.remplissage) lignes.push(couleurMode(f.remplissage, false, mode));
  if (f.contour && traite(f)) lignes.push(couleurMode(f.contour, true, mode), nb(f.epaisseur) + ' w', ...operateursTrait(f));
  lignes.push(operateurs(f.d, vb));
  const pair = f.regle === 'evenodd' ? '*' : '';
  const trait = traite(f);
  lignes.push(f.remplissage && trait ? 'B' + pair : f.remplissage ? 'f' + pair : trait ? 'S' : 'n', 'Q');
  return lignes.join('\n');
}
