// Les variantes du SVG ecrit : le dessin tel quel (editionSvg.ecrireDessin) et la version
// « decoupe », contours seuls d'une couleur et d'une epaisseur donnees, pour un traceur de decoupe,
// une gravure laser ou un gabarit. Pur.

import { ecrireChemin, ecrireDessin, lireChemin, originesDe, regrouper, type Chemin, type DessinSvg } from '../engine/editionSvg.js';
import { mentionOrigines } from '../model/credits.js';
import { hauteurPour, tailleValide, type Taille } from './dimensions.js';

const nb = (v: number) => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? '0' : String(r); };

/** Une longueur SVG avec son unite : trois decimales (quatre au pouce, dont le millieme vaut 0,025 mm). */
const longueur = (v: number, t: Taille) => { const r = Number(v.toFixed(t.unite === 'in' ? 4 : 3)); return String(Object.is(r, -0) ? 0 : r) + t.unite; };

/**
 * Le SVG en contours seuls : chaque forme visible, sans remplissage, au trait donne. Sans `taille`, une unite du
 * plan vaut un millimetre (l'usage de ce fichier depuis son origine) ; avec, la largeur voulue repartie sur le plan.
 * Le fichier ne garde que des contours, pas la marque des formes : si l'une d'elles vient d'une source creditee,
 * la mention passe en commentaire.
 */
export function svgDecoupe(dessin: DessinSvg, couleur = '#ff0000', epaisseur = 0.25, precision = 3, taille?: Taille | null): string {
  const [x, y, l, h] = dessin.vb, t = tailleValide(taille);
  const corps = dessin.formes.filter(f => f.visible)
    .map(f => '<path d="' + ecrireChemin(f.d, precision) + '" fill="none" stroke="' + couleur + '" stroke-width="' + nb(epaisseur) + '" stroke-linejoin="round"/>')
    .join('');
  const mention = mentionOrigines(originesDe(dessin.formes.filter(f => f.visible)));
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x, y, l, h].map(nb).join(' ') + '" width="' + (t ? longueur(t.largeur, t) : nb(l) + 'mm') + '" height="' + (t ? longueur(hauteurPour(dessin.vb, t), t) : nb(h) + 'mm') + '">' + (mention ? '<!-- ' + mention + ' -->' : '') + corps + '</svg>';
}

// ---------------------------------------------------------------- le SVG exporte, avec ses options

export interface OptionsSvg {
  /** Les decimales des coordonnees, de 1 a 4 (defaut 3 : ce que le projet ecrit depuis toujours). */
  readonly precision?: number;
  /** La taille physique : `width` et `height` dans l'unite voulue, le `viewBox` ne bouge pas (le dessin se met a l'echelle). */
  readonly taille?: Taille | null;
  /** Regrouper les formes voisines de meme style et ecrire les chemins en relatif et compact. Le rendu est identique. */
  readonly optimise?: boolean;
}

/** Un nombre ecrit au plus court : sans zero avant la virgule (`.5`, `-.5`). */
function court(v: number, precision: number): string {
  const r = Number(v.toFixed(precision));
  if (r === 0) return '0';
  return String(r).replace(/^(-?)0\./, '$1.');
}

/** Assemble lettres et nombres au plus court : un espace entre deux nombres seulement, et pas devant un `-` ni devant un `.` qui suit un nombre deja decimal. */
function assembler(jetons: readonly string[]): string {
  let s = '', precedent: string | null = null;
  for (const j of jetons) {
    const lettre = /^[a-zA-Z]$/.test(j);
    if (!lettre && precedent !== null && !j.startsWith('-') && !(j.startsWith('.') && precedent.includes('.'))) s += ' ';
    s += j;
    precedent = lettre ? null : j;
  }
  return s;
}

/**
 * Un chemin en commandes relatives, au plus court (h et v pour les droites, lettre omise quand elle se repete).
 * Les ecarts se calculent sur les points DEJA arrondis a la precision : l'arrondi ne s'accumule pas, un
 * lecteur retrouve les memes points que l'ecriture absolue.
 */
export function cheminCompact(d: Chemin, precision: number): string {
  const R = (v: number) => Number(v.toFixed(precision));
  let cx = 0, cy = 0, sx = 0, sy = 0, derniere = '';
  const jetons: string[] = [];
  const emettre = (lettre: string, nombres: number[], repetable: boolean) => {
    if (!(repetable && lettre === derniere)) jetons.push(lettre);
    jetons.push(...nombres.map(n => court(n, precision)));
    derniere = lettre;
  };
  d.forEach((c, i) => {
    const p = c.p.map(R);
    if (c.c === 'Z') { emettre('z', [], false); cx = sx; cy = sy; return; }
    const rel = p.map((v, k) => v - (k % 2 === 0 ? cx : cy));
    const [ax, ay] = [p[p.length - 2] ?? 0, p[p.length - 1] ?? 0];
    if (c.c === 'M') {
      if (i === 0) emettre('M', p, false); else emettre('m', rel, false);
      sx = ax; sy = ay;
    } else if (c.c === 'L') {
      if (ay === cy) emettre('h', [rel[0] ?? 0], true); else if (ax === cx) emettre('v', [rel[1] ?? 0], true); else emettre('l', rel, true);
    } else emettre(c.c === 'C' ? 'c' : 'q', rel, true);
    cx = ax; cy = ay;
  });
  return assembler(jetons);
}

/** Les attributs `width` et `height` de la balise racine, et elle seule : le reste du fichier (dont une eventuelle attribution) n'est pas touche. */
export function tailleRacine(svg: string, t: Taille, vb: DessinSvg['vb']): string {
  const fin = svg.indexOf('>');
  if (fin < 0) return svg;
  const tete = svg.slice(0, fin).replace(/ width="[^"]*"/, ' width="' + longueur(t.largeur, t) + '"').replace(/ height="[^"]*"/, ' height="' + longueur(hauteurPour(vb, t), t) + '"');
  return tete + svg.slice(fin);
}

/**
 * Le SVG du dessin avec les options d'export. Sans options, c'est exactement `ecrireDessin(dessin, 3)`. Tout
 * passe par `ecrireDessin` puis par des retouches ciblees de sa sortie (balise racine, attribut `d`) : ce que
 * l'ecriture ajoute ailleurs (une attribution de licence dans un `<metadata>`) ne se retire jamais ici.
 */
export function svgExporte(dessin: DessinSvg, options: OptionsSvg = {}): string {
  const precision = Math.min(4, Math.max(1, Math.round(options.precision ?? 3)));
  const source = options.optimise ? regrouper(dessin).dessin : dessin;
  let svg = ecrireDessin(source, precision);
  if (options.optimise) svg = svg.replace(/<path d="([^"]*)"/g, (_, d: string) => '<path d="' + cheminCompact(lireChemin(d), precision) + '"');
  const t = tailleValide(options.taille);
  return t ? tailleRacine(svg, t, dessin.vb) : svg;
}
