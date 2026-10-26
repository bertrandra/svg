// Le plan de travail pose sur le tapis fixe (ADR-0039, revision du 26 octobre 2026 : le tapis fixe est le defaut en Cricut). Choisir
// le contexte, changer de tapis ou decocher le recalage pose le plan ; un fichier ouvert directement en Cricut le recoit dans son etat
// initial. Pur : les formes ne bougent jamais d'une coordonnee, seul le viewBox change.

import type { DessinSvg } from '../editionSvg.js';
import type { ChoixProduction } from '../../model/contextes.js';
import { cadreFixe, cadreTapis, planDuTapis, resoudreProfil, unitesDePouces, type CadreTapis, type ProfilProduction } from './profil.js';
import { etendueVisible } from './mesures.js';
import { MARGE_DEFAUT } from './placement.js';

/** Vrai quand le plan a deja la taille du tapis (au millieme) : il a ete pose, on garde son coin. */
const dejaPose = (p: ProfilProduction, vb: DessinSvg['vb']): boolean =>
  Math.abs(vb[2] - unitesDePouces(p.tapis.largeur.valeur)) < 5e-4 && Math.abs(vb[3] - unitesDePouces(p.tapis.hauteur.valeur)) < 5e-4;

/**
 * Le tapis sur lequel poser le plan quand on passe de `avant` au profil `p` (sans recalage, hors Print Then Cut) :
 * - le tapis etait deja fixe a l'ecran : son coin reste, sa taille devient celle du nouveau tapis ;
 * - le plan a deja la taille du tapis (un document enregistre sans recalage, un plan pose avant de cocher la case) : il est garde tel
 *   quel, et les formes retrouvent leur place sur le tapis fixe ;
 * - sinon, le tapis suivait le dessin (recalage coche) : le tapis tel que la toile le montrait, rien ne bouge a l'ecran ;
 * - sinon, aucun tapis n'etait montre (Generique, Print Then Cut, une ouverture) : le tapis se pose comme Design Space poserait les
 *   pieces, au coin haut gauche de la zone utile, avec la marge par defaut de « Dupliquer sur la feuille » (2 mm) quand le dessin
 *   tient avec elle (moins, jusqu'a rien, sinon) : un trait qui s'epaissit, un pourtour hachure ou une forme poussee d'un cheveu ne
 *   sortent pas aussitot de la zone ; un dessin vide prend le tapis au coin du plan.
 * Un dessin plus grand que la zone utile n'est jamais deplace : le constat « hors-tapis » le dit, avec sa correction.
 */
function tapisPour(dessin: DessinSvg, p: ProfilProduction, avant: ProfilProduction | null): CadreTapis {
  const montre = avant && avant.procede !== 'imprimer-decouper' ? avant : null;
  if ((montre && !montre.recalage) || dejaPose(p, dessin.vb)) return cadreFixe(p, dessin.vb);
  const etendue = etendueVisible(dessin);
  if (montre) return cadreTapis(p, etendue ?? { x: dessin.vb[0], y: dessin.vb[1] });
  if (!etendue) return cadreFixe(p, dessin.vb);
  const marge = (zone: number, cote: number): number => Math.min(MARGE_DEFAUT, Math.max(0, (zone - cote) / 2));
  return cadreTapis(p, { x: etendue.x - marge(p.zoneUtile.l, etendue.l), y: etendue.y - marge(p.zoneUtile.h, etendue.h) });
}

/**
 * Le plan de travail que demande un nouveau choix, ou null quand il ne change pas : seulement en Cricut, sans recalage, a la lame ou
 * au stylo (Print Then Cut n'a pas de tapis a l'ecran ; avec le recalage, le tapis suit le dessin et le plan reste). Generique ne
 * change rien.
 */
export function planPourChoix(dessin: DessinSvg, avant: ChoixProduction, apres: ChoixProduction): DessinSvg | null {
  const p = resoudreProfil(apres);
  if (!p || p.recalage || p.procede === 'imprimer-decouper') return null;
  const d = planDuTapis(dessin, tapisPour(dessin, p, resoudreProfil(avant)));
  return d === dessin ? null : d;
}

/**
 * Le dessin d'ouverture dans un contexte : un fichier ouvert directement en Cricut (sa marque, le public « machine » de l'accueil, un
 * projet du site) recoit le plan du tapis dans son etat initial, comme le nuancier (ADR-0037) : ce n'est pas une modification. Le
 * meme objet en Generique, en Print Then Cut, avec le recalage, ou quand le plan est deja le tapis.
 */
export const planDOuverture = (dessin: DessinSvg, choix: ChoixProduction): DessinSvg => planPourChoix(dessin, { contexte: 'generique' }, choix) ?? dessin;
