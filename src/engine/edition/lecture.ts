// La lecture d'un SVG en dessin a plat : peintures, feuille <style>, heritage, transformations des
// groupes, clones <use>, formes de base ramenees a des chemins. Ce qui ne se ramene pas a des chemins
// pleins est refuse avec son nom : on n'edite pas un dessin qu'on ne saurait pas reecrire. Les details
// vivent a cote : `cascade.ts` (feuilles, attributs, style), `parcours.ts` (la marche et les clones),
// `heritage.ts` (ce qui se transmet), `elements.ts` (les formes de base).

import { analyserXml, phraseErreurXml } from '../../util/xml.js';
import type { DessinSvg } from './types.js';
import { IDENTITE } from './types.js';
import { lireOpacite } from './opacites.js';
import { heriter, refusDe } from './heritage.js';
import { analyser, proprietesDe } from './cascade.js';
import { visiter, type Parcours } from './parcours.js';
import { COORDONNEE_MAX, coordonneeSaine, REGLES_FOIS_ELEMENTS_MAX } from './limites.js';

/** Un dessin lu, avec ce que la lecture a laisse tomber sans refuser (voir `ignores.ts`) : vide quand rien ne s'est perdu. */
export interface DessinLu { dessin: DessinSvg; ignores: readonly string[] }
export type LectureDessin = DessinLu | { erreur: string };

/** Le plan de travail d'un <svg> : son viewBox, a defaut ses dimensions ; null s'il n'a ni l'un ni l'autre. */
function planDe(attributs: Readonly<Record<string, string>>): [number, number, number, number] | null {
  const vb = (attributs.viewBox ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const l = Number.parseFloat(attributs.width ?? ''), h = Number.parseFloat(attributs.height ?? '');
  return vb.length === 4 && vb.every(Number.isFinite) && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0
    ? [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 0, vb[3] ?? 0] : l > 0 && h > 0 && Number.isFinite(l) && Number.isFinite(h) ? [0, 0, l, h] : null;
}

/** Le dessin d'un SVG et ce qu'il a fallu laisser tomber, ou ce qui empeche de l'editer. Ne leve jamais : un texte hostile est un refus nomme. */
export function lireDessin(svg: string): LectureDessin {
  try {
    return lireDessinSansFiltre(svg);
  } catch (e) {
    // Dernier filet : une pile de fonctions recursives qui deborde malgre les bornes se dit, elle ne fait pas planter la page.
    if (e instanceof RangeError) return { erreur: 'Ce SVG est trop complexe pour être lu (imbrication trop profonde) : simplifiez-le dans votre logiciel.' };
    throw e;
  }
}

function lireDessinSansFiltre(svg: string): LectureDessin {
  const doc = analyserXml(svg);
  if ('erreur' in doc) return { erreur: phraseErreurXml(doc.erreur) };
  const racine = doc.racine.enfants.find(e => e.nom === 'svg');
  if (!racine) return { erreur: 'Ce SVG ne se lit pas.' };
  const plan = planDe(racine.attributs);
  if (!plan) return { erreur: 'Ce SVG n’a ni viewBox ni dimensions.' };
  if (!plan.every(coordonneeSaine)) return { erreur: 'Ce SVG a un plan de travail démesuré (au-delà de ± ' + COORDONNEE_MAX.toLocaleString('fr-FR') + ') : corrigez son viewBox.' };
  const analyse = analyser(racine);
  if (analyse.regles.length * analyse.parents.size > REGLES_FOIS_ELEMENTS_MAX) {
    return { erreur: 'Ce SVG a trop de règles de style (' + analyse.regles.length.toLocaleString('fr-FR') + ') pour ses ' + analyse.parents.size.toLocaleString('fr-FR') + ' éléments : simplifiez-le dans votre logiciel.' };
  }
  const p: Parcours = { analyse, plan, formes: [], refus: new Set(), actifs: new Set([racine]), clones: 0, trop: false };
  // La balise <svg> est un element comme un groupe : ce qu'elle pose se transmet aux formes. `opacity` s'y
  // applique au dessin entier, donc se multiplie a chaque forme comme celle d'un <g> (le dessin etant a plat,
  // il n'y a pas de groupe a composer : voir lireOpacites). Masque, decoupe et filtre se refusent comme ailleurs.
  const prRacine = proprietesDe(analyse, racine);
  const refusRacine = refusDe(prRacine);
  if (refusRacine) p.refus.add(refusRacine);
  const ctx = { m: IDENTITE, heritees: heriter({}, prRacine), opacite: lireOpacite(prRacine.opacity), profondeur: 0 };
  racine.enfants.forEach(e => visiter(p, e, ctx));
  if (p.refus.size) return { erreur: 'Ce SVG contient ' + [...p.refus].join(', ') + ' : il ne s’édite pas ici. Vectorisez l’image, ou simplifiez-le dans votre logiciel.' };
  // Une forme sans aucune commande (chemin vide, nombre illisible) ne se dessine pas : un SVG qui n'en a que de telles formes est vide.
  const formes = p.formes.filter(f => f.d.length > 0);
  if (!formes.length) return { erreur: 'Ce SVG ne contient aucune forme à éditer.' };
  return { dessin: { vb: plan, formes }, ignores: [...analyse.ignores] };
}
