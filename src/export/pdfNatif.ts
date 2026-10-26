// L'ecriture native d'une scene dans un PDF (ADR-0012, etape 13a ; ISO 32000-1) : ce que la descente laisse au PDF d'un dessin riche.
//  - un degrade de fond : la forme en chemin de decoupe (`W n`, `W* n` selon sa regle), puis le shading pose par sa matrice (`sh`) ;
//    de trait : un motif de shading (`/Pattern`, type 2), sa matrice rapportee a l'espace du motif (la page, ou le groupe qui le peint) ;
//    l'opacite des arrets, constante, dans l'etat graphique ; variable, en masque doux de luminance (un shading gris) ;
//  - une decoupe : son chemin en `W n` dans un `q … Q`, qui rogne aussi le trait, exactement ;
//  - un masque d'opacite : le contenu masque en groupe de transparence (un XObject de formulaire), peint sous un masque doux
//    (`/SMask` d'un `ExtGState`, `/S /Luminosity` ou `/Alpha`) dont le groupe est le contenu du masque, ecrit en gris de luminance ;
//    la region du masque est la boite des deux groupes ;
//  - un groupe translucide dont les feuilles se recouvrent : un groupe de transparence peint a son opacite ;
//  - une image : son XObject (`pdfImages.ts`), pose par `cm` sur son cadre (`pdfPlacement.ts`), rognee a son cadre en `slice`.
// Les objets suivent ceux de la page (`pdfRessources.ts`). Pur et deterministe.

import { boiteChemin, type Chemin, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import type { FeuilleScene, ImageScene, NoeudScene, PeintureScene, PorteeScene, Scene } from '../engine/aplatir.js';
import type { MiseEnPage } from './pdfPage.js';
import { fluxOctets } from './pdfObjets.js';
import { arretUnique, opaciteConstante, shading } from './pdfDegrades.js';
import type { ImagesPdf } from './pdfImages.js';
import { placementImage } from './pdfPlacement.js';
import { RessourcesPdf } from './pdfRessources.js';
import type { ObjetPdf } from './pdfObjets.js';
import { cleEtat, contenuForme, couleurMode, nb, nbk, opacitesPdf, operateurs, operateursTrait, traite, valeursEtat, type ModeCouleur } from './pdfTrace.js';

type Mat = readonly [number, number, number, number, number, number];
const IDENTITE: Mat = [1, 0, 0, 1, 0, 0];

/** `a` puis `b` (la convention de SVG et du PDF : x' = a x + c y + e). */
export const composer = (a: readonly number[], b: readonly number[]): Mat => {
  const [a0 = 1, a1 = 0, a2 = 0, a3 = 1, a4 = 0, a5 = 0] = a, [b0 = 1, b1 = 0, b2 = 0, b3 = 1, b4 = 0, b5 = 0] = b;
  return [a0 * b0 + a1 * b2, a0 * b1 + a1 * b3, a2 * b0 + a3 * b2, a2 * b1 + a3 * b3, a4 * b0 + a5 * b2 + b4, a4 * b1 + a5 * b3 + b5];
};
/** Une matrice : six decimales pour la partie lineaire, quatre pour la translation. */
export const matrice = (m: readonly number[]): string => m.map((v, i) => nbk(v, i < 4 ? 6 : 4)).join(' ');

/** Le contexte d'un flux : comment s'ecrivent ses couleurs, et la matrice de son espace par rapport a celui d'un motif. */
interface Flux { readonly mode: ModeCouleur; readonly base: Mat }

export interface SceneEcrite {
  /** Le contenu de la page, dans le repere du plan (avant la mise en page). */
  readonly contenu: string;
  /** Le dictionnaire des ressources, objet 6. */
  readonly ressources: string;
  /** Les objets 7 et suivants. */
  readonly objets: readonly ObjetPdf[];
}

/** L'opacite propre d'une peinture : celle d'une couleur unique, la constante des arrets, ou 1 (un masque doux s'en charge). */
function peinture(p: PeintureScene | undefined) {
  const u = p ? arretUnique(p.degrade) : null, constante = p && !u ? opaciteConstante(p.degrade) : null;
  return { u, degrade: p && !u ? p : null, alpha: u ? (u.opacite ?? 1) : constante ?? 1, masque: !!p && !u && constante === null };
}

/** L'ecrivain d'une scene : ses ressources, et le plan retourne du PDF. */
class EcrivainScene {
  readonly r = new RessourcesPdf();
  private readonly F: Mat;
  private readonly imagesEcrites = new Map<string, string>();

  constructor(private readonly vb: DessinSvg['vb'], private readonly images: ImagesPdf | undefined) {
    const [vx, vy, , vh] = vb;
    this.F = [1, 0, 0, -1, -vx, vh + vy];
  }

  private pdf(x: number, y: number): [number, number] { return [x - this.vb[0], this.vb[3] - (y - this.vb[1])]; }

  /** La boite d'un chemin dans le repere du PDF, elargie de `marge`. */
  private boite(d: Chemin, marge: number): number[] {
    const b = boiteChemin(d) ?? { x: 0, y: 0, l: 0, h: 0 }, [x0, y1] = this.pdf(b.x, b.y), [x1, y0] = this.pdf(b.x + b.l, b.y + b.h);
    return [x0 - marge, y0 - marge, x1 + marge, y1 + marge];
  }

  /** La matrice qui pose un degrade dans le repere du flux (le plan retourne). */
  private pose(p: PeintureScene): Mat { return composer(p.degrade.matrice ?? IDENTITE, this.F); }

  /** Le masque doux des opacites variables d'un degrade, sur la boite de ce qu'il peint. */
  private masqueAlpha(p: PeintureScene, bbox: readonly number[]): string {
    const g = this.r.groupe(bbox, ' /CS /DeviceGray', 'q\n' + matrice(this.pose(p)) + ' cm\n/' + this.r.shading(shading(p, 'gris', true, this.r.fonction)) + ' sh\nQ');
    return this.r.etat('<< /SMask << /Type /Mask /S /Luminosity /G ' + g + ' 0 R >> >>');
  }

  private remplir(f: Forme, p: PeintureScene | undefined, op: number, flux: Flux): string {
    const x = peinture(p), a = nb(op * x.alpha), regle = f.regle === 'evenodd' ? '*' : '', l = ['q'];
    if (a !== '1') l.push('/' + this.r.etat('<< /ca ' + a + ' >>') + ' gs');
    if (!x.degrade) l.push(couleurMode(x.u?.couleur ?? f.remplissage ?? '#000000', false, flux.mode), operateurs(f.d, this.vb), 'f' + regle);
    else {
      if (x.masque) l.push('/' + this.masqueAlpha(x.degrade, this.boite(f.d, 1)) + ' gs');
      l.push(operateurs(f.d, this.vb), 'W' + regle + ' n', matrice(this.pose(x.degrade)) + ' cm', '/' + this.r.shading(shading(x.degrade, flux.mode, false, this.r.fonction)) + ' sh');
    }
    l.push('Q');
    return l.join('\n');
  }

  private tracer(f: Forme, p: PeintureScene | undefined, op: number, flux: Flux): string {
    const x = peinture(p), a = nb(op * x.alpha), l = ['q'];
    if (a !== '1') l.push('/' + this.r.etat('<< /CA ' + a + ' >>') + ' gs');
    if (x.masque && x.degrade) l.push('/' + this.masqueAlpha(x.degrade, this.boite(f.d, (f.epaisseur * Math.max(1, f.limiteMitre ?? 4)) / 2 + 1)) + ' gs');
    if (!x.degrade) l.push(couleurMode(x.u?.couleur ?? f.contour ?? '#000000', true, flux.mode));
    else {
      const motif = '<< /PatternType 2 /Shading ' + shading(x.degrade, flux.mode, false, this.r.fonction) + ' /Matrix [' + matrice(composer(this.pose(x.degrade), flux.base)) + '] >>';
      l.push('/Pattern CS /' + this.r.motif(motif) + ' SCN');
    }
    l.push(nb(f.epaisseur) + ' w', ...operateursTrait(f), operateurs(f.d, this.vb), 'S', 'Q');
    return l.join('\n');
  }

  private feuille(n: FeuilleScene, flux: Flux): string {
    const f = n.forme;
    if (!n.fond && !n.trait) { const c = cleEtat(f); return contenuForme(f, this.vb, c === null ? null : this.r.etat('<< ' + valeursEtat(c) + ' >>'), flux.mode); }
    // Fond puis trait, chacun avec sa peinture (comme SVG : le trait se pose sur le fond).
    const { ca, CA } = opacitesPdf(f), l: string[] = [];
    if (f.remplissage !== null) l.push(this.remplir(f, n.fond, Number(ca), flux));
    if (traite(f)) l.push(this.tracer(f, n.trait, Number(CA), flux));
    return l.join('\n');
  }

  private incrustation(n: ImageScene): string {
    const img = this.images?.parDonnees.get(n.source.donnees);
    if (!img) return '';
    let x = this.imagesEcrites.get(n.source.donnees);
    if (!x) {
      const alpha = img.alpha ? this.r.ajouter(fluxOctets(img.alpha.dict, img.alpha.flux)) : null;
      x = this.r.xobjet(this.r.ajouter(fluxOctets(img.dict + (alpha === null ? '' : ' /SMask ' + alpha + ' 0 R'), img.flux)));
      this.imagesEcrites.set(n.source.donnees, x);
    }
    const { m, cadre } = placementImage(n.source, img, this.vb), a = nb(n.opacite), l = ['q'];
    if (a !== '1') l.push('/' + this.r.etat('<< /ca ' + a + ' >>') + ' gs');
    if (cadre) l.push(operateurs(cadre, this.vb), 'W n');
    l.push(matrice(m) + ' cm', '/' + x + ' Do', 'Q');
    return l.join('\n');
  }

  private portee(n: PorteeScene, flux: Flux): string {
    // Une decoupe vide ne laisse rien voir.
    if (n.decoupe && !n.decoupe.d.length) return '';
    const l = ['q'];
    if (n.decoupe) l.push(operateurs(n.decoupe.d, this.vb), 'W' + (n.decoupe.regle === 'evenodd' ? '*' : '') + ' n');
    if (n.masque || n.opacite !== undefined) {
      // Le groupe de transparence : la region du masque, ou l'etendue des feuilles (d'un point de plus, pour l'anticrenelage).
      const b = n.masque?.region ?? n.boite ?? { x: 0, y: 0, l: 0, h: 0 }, m = n.masque ? 0 : 1;
      const [x0, y1] = this.pdf(b.x - m, b.y - m), [x1, y0] = this.pdf(b.x + b.l + m, b.y + b.h + m), bbox = [x0, y0, x1, y1];
      if (n.masque) {
        const g = this.r.groupe(bbox, ' /CS /DeviceGray', this.noeuds(n.masque.contenu.noeuds, { mode: 'gris', base: IDENTITE }));
        l.push('/' + this.r.etat('<< /SMask << /Type /Mask /S /' + (n.masque.type === 'alpha' ? 'Alpha' : 'Luminosity') + ' /G ' + g + ' 0 R >> >>') + ' gs');
      }
      const a = n.opacite === undefined ? '1' : nb(n.opacite);
      if (a !== '1') l.push('/' + this.r.etat('<< /ca ' + a + ' /CA ' + a + ' >>') + ' gs');
      // Dans un groupe, un motif se rapporte a l'espace du groupe : la matrice de base y est l'identite.
      l.push('/' + this.r.xobjet(this.r.groupe(bbox, '', this.noeuds(n.enfants, { mode: flux.mode, base: IDENTITE }))) + ' Do');
    } else l.push(this.noeuds(n.enfants, flux));
    l.push('Q');
    return l.join('\n');
  }

  noeuds(liste: readonly NoeudScene[], flux: Flux): string {
    return liste.map(n => (n.genre === 'forme' ? this.feuille(n, flux) : n.genre === 'image' ? this.incrustation(n) : this.portee(n, flux))).filter(Boolean).join('\n');
  }
}

/** La scene en contenu de page, ressources et objets. `mise` donne la matrice de la page, a laquelle un motif se rapporte. */
export function ecrireScene(scene: Scene, vb: DessinSvg['vb'], cmjn: boolean, mise: MiseEnPage | null, images?: ImagesPdf): SceneEcrite {
  const e = new EcrivainScene(vb, images);
  // La matrice de la page telle que `fluxMisEnPage` l'ecrit : l'espace d'un motif peint par la page.
  const echelle = mise ? Number(mise.echelle.toFixed(6)) : 1;
  const base: Mat = mise ? [echelle, 0, 0, echelle, Number(nb(mise.dx)), Number(nb(mise.dy))] : IDENTITE;
  const contenu = e.noeuds(scene.noeuds, { mode: cmjn ? 'cmjn' : 'rvb', base });
  return { contenu, ressources: e.r.dictionnaire(), objets: e.r.objets };
}
