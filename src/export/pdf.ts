// Un PDF vectoriel du dessin (ADR-0004), ecrit a la main : une page a la taille du plan, chaque
// forme en operateurs de trace (m, l, c, h), remplie et contournee avec ses couleurs, son opacite et
// sa regle de remplissage. Pur et deterministe : ni date, ni identifiant tire au sort, pour que le
// meme dessin donne toujours les memes octets.
//
// Un dessin riche arrive avec sa scene native (`aplatirPour`, ADR-0012 etape 13a) : degrades en `shading`, decoupes en chemin de
// decoupe, masques en masque doux, images en XObject (`pdfNatif.ts`). Sans scene, ce sont les octets d'avant.

import { originesDe, type Forme } from '../engine/editionSvg.js';
import type { DessinPlat, Scene } from '../engine/aplatir.js';
import { mentionOrigines } from '../model/credits.js';
import { fluxMisEnPage, infoPdf, miseEnPage, tableau, type OptionsPdf } from './pdfPage.js';
import { assemblerPdf } from './pdfObjets.js';
import { cleEtat, contenuForme, nb, valeursEtat } from './pdfTrace.js';
import { ecrireScene } from './pdfNatif.js';
import type { ImagesPdf } from './pdfImages.js';

export type { OptionsPdf, FormatPage } from './pdfPage.js';
export { composantes, couleurPdf, operateurs } from './pdfTrace.js';

/** Ce que la descente laisse au PDF d'un dessin riche : sa scene, et ses images deja preparees (`preparerImagesPdf`). */
export interface NatifPdf {
  readonly scene: Scene;
  readonly images?: ImagesPdf;
}

/**
 * Le PDF complet, en octets. Les formes masquees ne s'ecrivent pas, comme dans le SVG. Sans options, ou avec
 * des options qui ne changent ni la page ni les couleurs, ce sont les octets d'avant ; la page, le fond perdu,
 * les reperes, le CMJN et les metadonnees sont des options (voir `OptionsPdf`), jamais un effet de bord. Avec une
 * scene native, le dessin s'ecrit d'apres elle (le `DessinPlat` ne donne plus que le plan et les credits).
 */
export function ecrirePdf(dessin: DessinPlat, options: OptionsPdf = {}, natif?: NatifPdf): Uint8Array {
  const [, , l, h] = dessin.vb;
  const cmjn = options.cmjn === true, mise = miseEnPage(dessin.vb, options);
  const visibles = dessin.formes.filter(f => f.visible);
  const boites = mise ? ' /MediaBox ' + tableau(mise.media) + (mise.boites ? ' /CropBox ' + tableau(mise.media) + ' /BleedBox ' + tableau(mise.bleed) + ' /TrimBox ' + tableau(mise.trim) : '') : ' /MediaBox [0 0 ' + nb(l) + ' ' + nb(h) + ']';
  if (natif) {
    const e = ecrireScene(natif.scene, dessin.vb, cmjn, mise, natif.images);
    const contenu = mise ? fluxMisEnPage(e.contenu, mise, cmjn) : e.contenu;
    return assemblerPdf([
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R' + boites + ' /Contents 4 0 R /Resources 6 0 R >>',
      '<< /Length ' + contenu.length + ' >>\nstream\n' + contenu + '\nendstream',
      infoPdf(options, sujetDeCredit(visibles)),
      e.ressources,
      ...e.objets
    ]);
  }
  // Un etat graphique par opacite distincte, nomme de facon stable.
  const opacites = [...new Set(visibles.map(cleEtat).filter((c): c is string => c !== null))].sort();
  const etats = new Map(opacites.map((o, i) => [o, 'GS' + i]));
  const trace = visibles.map(f => { const c = cleEtat(f); return contenuForme(f, dessin.vb, c === null ? null : etats.get(c) ?? null, cmjn ? 'cmjn' : 'rvb'); }).join('\n');
  const contenu = mise ? fluxMisEnPage(trace, mise, cmjn) : trace;
  const extg = opacites.length ? ' /ExtGState << ' + opacites.map(o => '/' + etats.get(o) + ' << ' + valeursEtat(o) + ' >>').join(' ') + ' >>' : '';
  return assemblerPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R' + boites + ' /Contents 4 0 R /Resources <<' + extg + ' >> >>',
    '<< /Length ' + contenu.length + ' >>\nstream\n' + contenu + '\nendstream',
    infoPdf(options, sujetDeCredit(visibles))
  ]);
}

/** La mention des formes creditees (CC BY 3.0) pour le `/Subject` du dictionnaire d'informations, ou rien sans forme creditee. */
function sujetDeCredit(visibles: readonly Forme[]): string {
  return mentionOrigines(originesDe(visibles));
}
