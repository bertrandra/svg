// Les gestes d'export : chacun fabrique les octets d'un format (par un writer pur de `export/`) puis les
// remet par `proposer`. Aucun etat ici ; ce que la personne a regle arrive dans `ContexteExport`.

import { ecrireDessin, type DessinSvg } from '../engine/editionSvg.js';
import { aplatirPour, phrasePertes, type Capacites, type DessinPlat } from '../engine/aplatir.js';
import { CAPACITES_DXF, CAPACITES_EPS, CAPACITES_SVG_DECOUPE } from '../export/capacites.js';
import { ecrireDxf } from '../export/dxf.js';
import { ecrireEps } from '../export/eps.js';
import { largeurRaster, optionsDxf, optionsEps, optionsPdf, optionsSvg, tailleDe, type OptionsExport } from '../export/options.js';
import { avecDpiPng } from '../export/png.js';
import { svgDecoupe, svgExporte } from '../export/svgs.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';
import { pdfDuDessin } from '../io/exportPdf.js';
import { versPng } from '../io/image.js';
import { EXTENSIONS, versRaster, type FormatRaster } from '../io/rasters.js';
import type { ChoixProduction } from '../model/contextes.js';
import { svgDocument } from './actionsProduction.js';

export interface ContexteExport {
  /** Le dessin lu ; null si le SVG donne ne se lit pas (les formats vectoriels sont alors indisponibles). */
  readonly lu: DessinSvg | null;
  /** Le SVG tel que l'ecrit l'editeur, a 3 decimales : c'est ce que les rasters peignent. */
  readonly svgPropre: string;
  readonly nom: string;
  readonly options: OptionsExport;
  readonly couleurDecoupe: string;
  readonly largeurPng: number;
  readonly dire: (t: string) => void;
}

const remettre = (c: ContexteExport, fichier: string, donnees: Uint8Array | Blob, suite = '') => { void proposer(fichier, donnees).then(m => c.dire(suite ? m + ' ' + suite : m)); };

/**
 * Le dessin lu tel qu'un exporteur de ces capacites le recoit (ADR-0012 §6), et la phrase de ce qu'il approche : le meme dessin et
 * rien a dire pour un dessin plat. null sans dessin lu.
 */
function descendu(c: ContexteExport, capacites: Capacites): { readonly dessin: DessinPlat; readonly approche: string } | null {
  if (!c.lu) return null;
  const r = aplatirPour(c.lu, capacites);
  return { dessin: r.dessin, approche: phrasePertes(r.pertes, r.perdus) };
}

/** Le SVG avec les options d'export (precision, taille, optimise) ; sans dessin lu, le SVG donne tel quel. */
export const svgFinal = (c: ContexteExport): string => (c.lu ? svgExporte(c.lu, optionsSvg(c.options)) : c.svgPropre);

export const exporterSvg = (c: ContexteExport) => remettre(c, c.nom + '.svg', texteOctets(svgFinal(c)));

export function copierSvg(c: ContexteExport): void {
  void copier(svgFinal(c)).then(ok => c.dire(ok ? 'Code SVG copié.' : 'La page n’a pas le droit d’écrire dans le presse-papiers.'));
}

export function exporterDecoupe(c: ContexteExport): void {
  const d = descendu(c, CAPACITES_SVG_DECOUPE);
  if (d) remettre(c, c.nom + '-decoupe.svg', texteOctets(svgDecoupe(d.dessin, c.couleurDecoupe, 0.25, 3, tailleDe(c.options))), d.approche);
}

/** Le PDF : un dessin riche y garde ses degrades, decoupes, masques et images (etape 13a), apres la decompression de ses PNG. */
export function exporterPdf(c: ContexteExport): void {
  if (!c.lu) return;
  pdfDuDessin(c.lu, optionsPdf(c.options))
    .then(r => { remettre(c, c.nom + '.pdf', new Blob([r.octets as BlobPart], { type: 'application/pdf' }), phrasePertes(r.pertes, r.perdus)); })
    .catch(() => c.dire('L’écriture du PDF a échoué.'));
}

export function exporterEps(c: ContexteExport): void {
  const d = descendu(c, CAPACITES_EPS);
  if (!d) return;
  const { eps, avertissements } = ecrireEps(d.dessin, optionsEps(c.options));
  void proposer(c.nom + '.eps', new Blob([texteOctets(eps) as BlobPart], { type: 'application/postscript' })).then(m => c.dire([m, ...avertissements, ...(d.approche ? [d.approche] : [])].join(' ')));
}

export function exporterDxf(c: ContexteExport): void {
  const d = descendu(c, CAPACITES_DXF);
  if (d) remettre(c, c.nom + '.dxf', new Blob([texteOctets(ecrireDxf(d.dessin, optionsDxf(c.options))) as BlobPart], { type: 'application/dxf' }), d.approche);
}

/** Le PNG a la largeur choisie (ou deduite de la taille et de la resolution), avec sa resolution quand elle est donnee. */
export function exporterPng(c: ContexteExport): void {
  const largeur = largeurRaster(c.options, c.largeurPng), dpi = c.options.dpi;
  versPng(c.svgPropre, largeur)
    .then(async b => (dpi ? avecDpiPng(new Uint8Array(await b.arrayBuffer()), dpi) : b))
    .then(donnees => { remettre(c, c.nom + '-' + largeur + '.png', donnees); })
    .catch(() => c.dire('Le rendu PNG a échoué.'));
}

/** Un JPEG (sur le fond choisi, il n'a pas d'alpha) ou un WebP (transparent), a la qualite choisie. */
export function exporterRaster(c: ContexteExport, format: FormatRaster): void {
  const largeur = largeurRaster(c.options, c.largeurPng);
  versRaster(c.svgPropre, { format, largeur, qualite: c.options.qualite / 100, fond: format === 'image/jpeg' ? c.options.fond : null })
    .then(({ octets, type }) => {
      if (type !== format) { c.dire('Ce navigateur ne sait pas écrire ce format d’image : essayez le PNG.'); return; }
      remettre(c, c.nom + '-' + largeur + '.' + EXTENSIONS[format], octets);
    })
    .catch(() => c.dire('Le rendu de l’image a échoué.'));
}

/** Le SVG propre d'un dessin lu, ou le SVG donne. */
export const svgPropreDe = (lu: DessinSvg | null, svg: string): string => (lu ? ecrireDessin(lu, 3) : svg);

/**
 * Le SVG que « Télécharger le SVG » de l'editeur remet. Options neutres : le document tel qu'on l'enregistre (marque du contexte
 * comprise), les octets que donnait « Fichier > Télécharger le SVG ». Options touchees (precision, taille, optimise) : le SVG avec
 * ces options, les octets que donnait le bouton « SVG » des exports. Aucun geste d'hier ne change d'octet.
 */
export function svgATelecharger(dessin: DessinSvg, production: ChoixProduction, o: OptionsExport): string {
  const neutre = o.precision === 3 && !o.optimise && tailleDe(o) === null;
  return neutre ? svgDocument(dessin, production) : svgExporte(dessin, optionsSvg(o));
}
