// Print Then Cut pour Cricut (ADR-0013) : Design Space aplatit le dessin en une image, l'imprime, puis la
// decoupe autour. On remet donc deux choses, a la meme taille et au meme cadre pour qu'elles se superposent :
//
//   - l'image a imprimer, AVEC un fond perdu : au-dela de la silhouette, la couleur du bord est prolongee de la
//     distance du profil, pour qu'une coupe un peu decalee ne laisse pas de liseré blanc. Chaque forme est decalee
//     vers l'exterieur et ce decalage n'est garde que dans l'anneau du fond perdu, sous le dessin : un trou du
//     dessin ne se remplit jamais, et la couleur prolongee est celle de la forme la plus haute a cet endroit ;
//   - la ligne de coupe : la silhouette exterieure unie (tous les fonds et traits, sans les trous), une seule
//     forme, sans couleur d'impression.
//
// L'archive (un ZIP, export/zip.ts) les livre ensemble avec un mode d'emploi ; le PNG, rendu par le navigateur,
// s'y ajoute a cote (io). Les SVG et le texte sont purs et deterministes ; le PNG ne l'est pas a l'octet d'un
// navigateur a l'autre, et le mode d'emploi le dit.

import clipping, { type MultiPolygon } from 'polygon-clipping';
import { marquerProduction, prochainId, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import { cheminDeRegion, regionDeChemin, toleranceBooleen } from '../engine/booleens.js';
import { cheminDeRegionChoisie, decaler } from '../engine/contours.js';
import {
  aUnTrait, boiteDeRegion, constatsBloquants, marqueDeProfil, regionPeinte, silhouetteDe, texteMesure, texteTaille, versUnite,
  type Constat, type ProfilProduction
} from '../engine/preparation.js';
import { phraseRefus } from './cricut.js';
import { svgExporte } from './svgs.js';
import { ecrireZip, nomSur } from './zip.js';

/** Au-dela, le fond perdu forme par forme couterait trop : on le dit plutot que de figer la page. */
export const FORMES_MAX_PRINT_THEN_CUT = 400;

export interface FichiersPrintThenCut {
  /** L'image a imprimer, fond perdu compris, en SVG a taille physique. */
  readonly impression: string;
  /** La ligne de coupe, au meme cadre et a la meme taille. */
  readonly coupe: string;
  /** Le cadre commun (fond perdu compris), en unites du plan. */
  readonly vb: readonly [number, number, number, number];
  /** La taille de la silhouette, sans le fond perdu, en unites du plan. */
  readonly silhouette: { readonly l: number; readonly h: number };
}

export type ExportPrintThenCut = FichiersPrintThenCut | { readonly erreur: string; readonly constats: readonly Constat[] };

/** Une region decalee vers l'exterieur, ou vide si le moteur de decoupe renonce. */
function grossie(region: MultiPolygon, distance: number, tolerance: number): MultiPolygon {
  if (!region.length) return [];
  const r = decaler(cheminDeRegion(region, 6), distance, 'round', { regle: 'nonzero', tolerance });
  return 'erreur' in r ? [] : regionDeChemin(r.chemin, 'nonzero', tolerance);
}

const forme = (id: string, region: MultiPolygon, couleur: string, opacite: number, lisser: boolean, tolerance: number): Forme => ({
  id, d: cheminDeRegionChoisie(region, lisser, tolerance), remplissage: couleur, contour: null, epaisseur: 1,
  opacite, regle: 'nonzero', visible: true, verrouille: false
});

/** La couleur que la forme montre a son bord : celle du trait s'il y en a un, celle du fond sinon. */
const couleurDeBord = (f: Forme): string | null => (aUnTrait(f) ? f.contour : f.remplissage);

/** Les morceaux du fond perdu, du bas vers le haut, chacun de la couleur de bord de sa forme. */
function fondPerdu(dessin: DessinSvg, anneau: MultiPolygon, distance: number, tolerance: number): Forme[] {
  let n = prochainId(dessin);
  const morceaux: Forme[] = [];
  for (const f of dessin.formes) {
    const couleur = couleurDeBord(f);
    if (!f.visible || couleur === null) continue;
    const dans = clipping.intersection(grossie(regionPeinte(f, tolerance), distance, tolerance), anneau);
    if (dans.length) morceaux.push(forme('f' + n++, dans, couleur, f.opacite, true, tolerance));
  }
  return morceaux;
}

/** Les fichiers de Print Then Cut pour ce profil, ou le refus et ses raisons. */
export function printThenCut(dessin: DessinSvg, p: ProfilProduction): ExportPrintThenCut {
  const profil: ProfilProduction = p.procede === 'imprimer-decouper' ? p : { ...p, procede: 'imprimer-decouper' };
  const ptc = profil.printThenCut;
  if (!ptc) return { erreur: 'La ' + profil.machine.nom + ' ne fait pas Print Then Cut : choisissez une Explore ou une Maker.', constats: [] };
  const bloquants = constatsBloquants(dessin, profil);
  if (bloquants.length) return { erreur: phraseRefus(bloquants), constats: bloquants };
  const visibles = dessin.formes.filter(f => f.visible).length;
  if (visibles > FORMES_MAX_PRINT_THEN_CUT) {
    return { erreur: 'Le fond perdu se calcule forme par forme : au-delà de ' + FORMES_MAX_PRINT_THEN_CUT + ' formes (ici ' + visibles + '), regroupez ou simplifiez le dessin, ou laissez Design Space ajouter le sien.', constats: [] };
  }
  const tolerance = toleranceBooleen(dessin), fp = ptc.fondPerdu;
  const silhouette = silhouetteDe(dessin, tolerance);
  const boite = boiteDeRegion(silhouette);
  if (!boite) return { erreur: 'Le dessin n’a aucune forme visible : rien à imprimer.', constats: [] };
  const anneau = clipping.difference(grossie(silhouette, fp, tolerance), silhouette);
  const [x, y, l, h] = dessin.vb;
  const x0 = Math.min(x, boite.x - fp), y0 = Math.min(y, boite.y - fp);
  const vb: [number, number, number, number] = [x0, y0, Math.max(x + l, boite.x + boite.l + fp) - x0, Math.max(y + h, boite.y + boite.h + fp) - y0];
  const taille = { largeur: versUnite(vb[2], profil.unite), unite: profil.unite };
  const marque = marqueDeProfil(profil);
  const impression = svgExporte({ vb, formes: [...fondPerdu(dessin, anneau, fp, tolerance), ...dessin.formes.filter(f => f.visible)] }, { precision: 3, taille });
  const coupe = svgExporte({ vb, formes: [forme('f1', silhouette, '#000000', 1, true, tolerance)] }, { precision: 3, taille });
  return { impression: marquerProduction(impression, marque), coupe: marquerProduction(coupe, marque), vb, silhouette: { l: boite.l, h: boite.h } };
}

/** Le mode d'emploi joint a l'archive : ce qu'on y trouve, les tailles, et ce qui reste a verifier dans Design Space. */
export function modeDEmploi(nom: string, f: FichiersPrintThenCut, p: ProfilProduction, avecPng: boolean): string {
  const ptc = p.printThenCut, fp = ptc ? ptc.fondPerdu : 0, u = p.unite;
  return [
    'Print Then Cut — ' + nom,
    '',
    'Fichiers :',
    ...(avecPng ? ['- ' + nom + '-impression.png : l’image à imprimer, ' + (ptc ? ptc.resolution : 300) + ' ppp, fond perdu compris.'] : []),
    '- ' + nom + '-impression.svg : l’image à imprimer, en vectoriel, fond perdu compris (' + texteMesure(fp, u) + ' autour de la coupe).',
    '- ' + nom + '-coupe.svg : la ligne de coupe, la silhouette extérieure du dessin, sans couleur d’impression.',
    '',
    'Tailles : les deux fichiers font ' + texteTaille(f.vb[2], f.vb[3], u) + ' (même cadre : posés au même endroit, ils se superposent).',
    'La silhouette à découper mesure ' + texteTaille(f.silhouette.l, f.silhouette.h, u) + '.',
    '',
    'Dans Design Space (À VÉRIFIER, voir docs/cricut/protocole.md, témoin 6) :',
    '1. Importez l’image à imprimer et choisissez « Imprimer puis découper » ; vérifiez sa taille.',
    '2. Importez la ligne de coupe et donnez-lui la même taille ; alignez les deux (centrés l’un sur l’autre).',
    '3. Vérifiez sur l’aperçu du tapis que la coupe suit la silhouette et non le bord du fond perdu.',
    'Si Design Space ajoute son propre fond perdu, laissez-le ou coupez-le : notez ce que vous observez dans le protocole.',
    '',
    'Le PNG est rendu par votre navigateur : ses octets peuvent varier d’un navigateur à l’autre, pas ses dimensions.'
  ].join('\n') + '\n';
}

/** L'archive de Print Then Cut : le mode d'emploi, les deux SVG, et le PNG s'il est donne. Deterministe sans PNG. */
export function archivePrintThenCut(nom: string, f: FichiersPrintThenCut, p: ProfilProduction, png: Uint8Array | null): Uint8Array {
  const base = nomSur(nom), texte = new TextEncoder();
  return ecrireZip([
    { nom: 'LISEZMOI.txt', donnees: texte.encode(modeDEmploi(base, f, p, png !== null)) },
    ...(png ? [{ nom: base + '-impression.png', donnees: png }] : []),
    { nom: base + '-impression.svg', donnees: texte.encode(f.impression) },
    { nom: base + '-coupe.svg', donnees: texte.encode(f.coupe) }
  ]);
}
