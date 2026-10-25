// Un PDF vectoriel du dessin (ADR-0004), ecrit a la main : une page a la taille du plan, chaque
// forme en operateurs de trace (m, l, c, h), remplie et contournee avec ses couleurs, son opacite et
// sa regle de remplissage. Pur et deterministe : ni date, ni identifiant tire au sort, pour que le
// meme dessin donne toujours les memes octets.

import { LIMITE_MITRE_DEFAUT, depart, opaciteDuContour, opaciteDuRemplissage, originesDe, pointillesEcrits, type Chemin, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import type { DessinPlat } from '../engine/aplatir.js';
import { mentionOrigines } from '../model/credits.js';
import { versCmjnNaif } from '../util/couleur.js';
import { fluxMisEnPage, infoPdf, miseEnPage, tableau, type OptionsPdf } from './pdfPage.js';

export type { OptionsPdf, FormatPage } from './pdfPage.js';

const nb = (v: number) => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? '0' : String(r); };

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
function opacitesPdf(f: Forme): { ca: string; CA: string } {
  return { ca: nb(f.opacite * opaciteDuRemplissage(f)), CA: nb(f.opacite * opaciteDuContour(f)) };
}

/** Le nom stable de l'etat graphique d'une forme, ou null si elle est pleinement opaque. */
const cleEtat = (f: Forme): string | null => {
  const { ca, CA } = opacitesPdf(f);
  return ca === '1' && CA === '1' ? null : ca === CA ? ca : ca + '/' + CA;
};

/** Un trait d'epaisseur nulle est invisible en SVG, mais un filet en PDF (« 0 w » = le plus fin que l'appareil sait tracer) : on ne le trace pas. */
const traite = (f: Forme) => f.contour !== null && f.epaisseur > 0;

/**
 * Le style du trait en operateurs PDF : bout (J), jonction (j), limite de pointe (M), pointilles (d). Le bout
 * plat est celui du PDF par defaut et ne s'ecrit pas ; la jonction ronde s'ecrit toujours (« 1 j »), comme avant.
 * La limite de pointe du PDF vaut 10 faute d'ecrire mieux : elle s'ecrit donc des qu'il y a une pointe, 4 comme SVG.
 */
function operateursTrait(f: Forme): string[] {
  const r: string[] = [];
  if (f.bout) r.push((f.bout === 'round' ? '1' : '2') + ' J');
  r.push(f.jonction === 'miter' ? '0 j' : f.jonction === 'bevel' ? '2 j' : '1 j');
  if (f.jonction === 'miter') r.push(nb(f.limiteMitre ?? LIMITE_MITRE_DEFAUT) + ' M');
  const p = pointillesEcrits(f);
  if (p) r.push('[' + p.liste.join(' ') + '] ' + p.decalage + ' d');
  return r;
}

function contenuForme(f: Forme, vb: DessinSvg['vb'], etat: string | null, cmjn = false): string {
  const lignes: string[] = ['q'];
  if (etat) lignes.push('/' + etat + ' gs');
  if (f.remplissage) lignes.push(couleurPdf(f.remplissage, false, cmjn));
  if (f.contour && traite(f)) lignes.push(couleurPdf(f.contour, true, cmjn), nb(f.epaisseur) + ' w', ...operateursTrait(f));
  lignes.push(operateurs(f.d, vb));
  const pair = f.regle === 'evenodd' ? '*' : '';
  const trait = traite(f);
  lignes.push(f.remplissage && trait ? 'B' + pair : f.remplissage ? 'f' + pair : trait ? 'S' : 'n', 'Q');
  return lignes.join('\n');
}

/**
 * Le PDF complet, en octets. Les formes masquees ne s'ecrivent pas, comme dans le SVG. Sans options, ou avec
 * des options qui ne changent ni la page ni les couleurs, ce sont les octets d'avant ; la page, le fond perdu,
 * les reperes, le CMJN et les metadonnees sont des options (voir `OptionsPdf`), jamais un effet de bord.
 */
export function ecrirePdf(dessin: DessinPlat, options: OptionsPdf = {}): Uint8Array {
  const [, , l, h] = dessin.vb;
  const cmjn = options.cmjn === true, mise = miseEnPage(dessin.vb, options);
  const visibles = dessin.formes.filter(f => f.visible);
  // Un etat graphique par opacite distincte, nomme de facon stable.
  const opacites = [...new Set(visibles.map(cleEtat).filter((c): c is string => c !== null))].sort();
  const etats = new Map(opacites.map((o, i) => [o, 'GS' + i]));
  const trace = visibles.map(f => { const c = cleEtat(f); return contenuForme(f, dessin.vb, c === null ? null : etats.get(c) ?? null, cmjn); }).join('\n');
  const contenu = mise ? fluxMisEnPage(trace, mise, cmjn) : trace;
  const boites = mise ? ' /MediaBox ' + tableau(mise.media) + (mise.boites ? ' /CropBox ' + tableau(mise.media) + ' /BleedBox ' + tableau(mise.bleed) + ' /TrimBox ' + tableau(mise.trim) : '') : ' /MediaBox [0 0 ' + nb(l) + ' ' + nb(h) + ']';
  const valeurs = (cle: string) => { const [ca = '1', CA = ca] = cle.split('/'); return '/ca ' + ca + ' /CA ' + CA; };
  const extg = opacites.length ? ' /ExtGState << ' + opacites.map(o => '/' + etats.get(o) + ' << ' + valeurs(o) + ' >>').join(' ') + ' >>' : '';
  const objets = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R' + boites + ' /Contents 4 0 R /Resources <<' + extg + ' >> >>',
    '<< /Length ' + octetsDe(contenu) + ' >>\nstream\n' + contenu + '\nendstream',
    infoPdf(options, sujetDeCredit(visibles))
  ];
  let corps = '%PDF-1.4\n%âãÏÓ\n';
  const positions: number[] = [];
  objets.forEach((o, i) => { positions.push(octetsDe(corps)); corps += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = octetsDe(corps);
  corps += 'xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n' + positions.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  corps += 'trailer\n<< /Size ' + (objets.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return latin1(corps);
}

/** La mention des formes creditees (CC BY 3.0) pour le `/Subject` du dictionnaire d'informations, ou rien sans forme creditee. */
function sujetDeCredit(visibles: readonly Forme[]): string {
  return mentionOrigines(originesDe(visibles));
}

/** La longueur en octets d'un texte ecrit en latin-1 : un octet par caractere. */
const octetsDe = (t: string) => t.length;

function latin1(t: string): Uint8Array {
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i) & 0xff;
  return out;
}
