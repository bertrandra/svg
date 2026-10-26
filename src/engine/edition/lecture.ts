// La lecture d'un SVG en dessin a plat : peintures, feuille <style>, heritage, transformations des
// groupes, clones <use>, formes de base ramenees a des chemins. Ce qui ne se ramene pas a des chemins
// pleins est refuse avec son nom : on n'edite pas un dessin qu'on ne saurait pas reecrire. Les details
// vivent a cote : `cascade.ts` (feuilles, attributs, style), `parcours.ts` (la marche et les clones),
// `heritage.ts` (ce qui se transmet), `elements.ts` (les formes de base).

import { analyserXml, phraseErreurXml } from '../../util/xml.js';
import type { DessinSvg, Forme, Groupe } from './types.js';
import { phrasesRemplacements, type ContexteTexte, type PolicesTexte } from './texteSvg.js';
import { IDENTITE } from './types.js';
import { lireOpacite } from './opacites.js';
import { heriter, refusDe } from './heritage.js';
import { analyser, proprietesDe } from './cascade.js';
import { visiter, type Parcours } from './parcours.js';
import { COORDONNEE_MAX, coordonneeSaine, CONFRONTATIONS_MAX } from './limites.js';
import { lireProduction, type MarqueProduction } from './production.js';
import { resoudreLiens } from './texteVivant.js';
import { prisesDe, type Fonctionnalite } from './fonctionnalites.js';
import { FONCTIONNALITES } from './catalogue.js';
import { ATTRIBUT_MODELE, VERSION_MODELE } from './ecritureRiche.js';
import { ignoresDeFusion } from './fusion.js';
import { normaliser } from './arbre.js';

/**
 * Un dessin lu, avec ce que la lecture a laisse tomber sans refuser (voir `ignores.ts`) : vide quand rien ne s'est perdu.
 * `production` est la marque de contexte de la racine (production.ts), absente d'un SVG qui n'en porte pas.
 */
export interface DessinLu { dessin: DessinSvg; ignores: readonly string[]; production?: MarqueProduction }
export type LectureDessin = DessinLu | { erreur: string };

/** Le plan de travail d'un <svg> : son viewBox, a defaut ses dimensions ; null s'il n'a ni l'un ni l'autre. */
function planDe(attributs: Readonly<Record<string, string>>): [number, number, number, number] | null {
  const vb = (attributs.viewBox ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const l = Number.parseFloat(attributs.width ?? ''), h = Number.parseFloat(attributs.height ?? '');
  return vb.length === 4 && vb.every(Number.isFinite) && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0
    ? [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 0, vb[3] ?? 0] : l > 0 && h > 0 && Number.isFinite(l) && Number.isFinite(h) ? [0, 0, l, h] : null;
}

/** Ce que la lecture peut recevoir en plus du texte du SVG. */
export interface OptionsLecture {
  /**
   * Les fontes pour lire le texte en lettres (ADR-0020). Absentes, un <text> est refuse en le nommant, comme avant : la lecture
   * d'un SVG sans texte ne change jamais, et celle d'un SVG avec texte ne change que si on lui donne de quoi le dessiner.
   */
  readonly polices?: PolicesTexte;
  /**
   * Le modele lu (ADR-0012, annexe 2 §1). `plat`, le defaut : le contrat de l'ADR-0001, fige (les groupes se fondent ; decoupes, masques,
   * filtres, degrades, motifs, images refuses en les nommant). `riche` : la lecture consulte aussi les fonctionnalites du catalogue
   * (catalogue.ts) : les <g> et les <a> restent des groupes (etape 1), avec leur opacite et leur nom ; un SVG sans groupe se lit
   * exactement comme en `plat`.
   */
  readonly modele?: 'plat' | 'riche';
}

const AUCUNE: readonly Fonctionnalite[] = [];

/**
 * Le refus d'un fichier ecrit par une version plus recente du modele (ADR-0012, annexe 5 §3) : jamais lu « au mieux », dans les deux
 * modes. Un marqueur egal ou inferieur a celui qu'on connait, ou illisible, se lit normalement (il n'est pas requis pour lire).
 */
function refusDuMarqueur(attributs: Readonly<Record<string, string>>): string | null {
  const m = /^\s*(\d{1,9})\s*$/.exec(attributs[ATTRIBUT_MODELE] ?? '');
  const v = m ? Number(m[1]) : 0;
  return v > VERSION_MODELE ? 'Ce fichier vient d’une version plus récente de l’éditeur (modèle ' + v + ') : mettez l’éditeur à jour pour l’ouvrir.' : null;
}

/** Le dessin d'un SVG et ce qu'il a fallu laisser tomber, ou ce qui empeche de l'editer. Ne leve jamais : un texte hostile est un refus nomme. */
export function lireDessin(svg: string, options: OptionsLecture = {}): LectureDessin {
  return lireDessinAvec(svg, options, options.modele === 'riche' ? FONCTIONNALITES : AUCUNE);
}

/** `lireDessin` avec une liste de fonctionnalites donnee (les tests des points d'extension) ; vide, la lecture plate. */
export function lireDessinAvec(svg: string, options: OptionsLecture, fonctions: readonly Fonctionnalite[]): LectureDessin {
  try {
    return lireDessinSansFiltre(svg, options, fonctions);
  } catch (e) {
    // Dernier filet : une pile de fonctions recursives qui deborde malgre les bornes se dit, elle ne fait pas planter la page.
    if (e instanceof RangeError) return { erreur: 'Ce SVG est trop complexe pour être lu (imbrication trop profonde) : simplifiez-le dans votre logiciel.' };
    throw e;
  }
}

function lireDessinSansFiltre(svg: string, options: OptionsLecture, fonctions: readonly Fonctionnalite[]): LectureDessin {
  const doc = analyserXml(svg);
  if ('erreur' in doc) return { erreur: phraseErreurXml(doc.erreur) };
  const racine = doc.racine.enfants.find(e => e.nom === 'svg');
  if (!racine) return { erreur: 'Ce SVG ne se lit pas.' };
  const plan = planDe(racine.attributs);
  const marqueur = refusDuMarqueur(racine.attributs);
  if (marqueur) return { erreur: marqueur };
  if (!plan) return { erreur: 'Ce SVG n’a ni viewBox ni dimensions.' };
  if (!plan.every(coordonneeSaine)) return { erreur: 'Ce SVG a un plan de travail démesuré (au-delà de ± ' + COORDONNEE_MAX.toLocaleString('fr-FR') + ') : corrigez son viewBox.' };
  // L'ecriture garde le millieme : un plan plus petit s'ecrirait « width="0" », que plus rien ne relit.
  if (plan[2] < 0.001 || plan[3] < 0.001) return { erreur: 'Ce SVG a un plan de travail trop petit (moins de 0,001 unité) : corrigez son viewBox.' };
  const analyse = analyser(racine);
  const formesLues: Forme[] = [], refus = new Set<string>();
  const texte: ContexteTexte | null = options.polices ? { analyse, polices: options.polices, formes: formesLues, refus, remplacements: new Map(), caracteres: 0 } : null;
  // Le mode riche : la table ou le lecteur des groupes range ce qu'il lit (absente en plat, ou les groupes se fondent).
  const groupesLus = fonctions.length ? new Map<string, Groupe>() : undefined;
  const p: Parcours = { analyse, plan, formes: formesLues, refus, actifs: new Set([racine]), clones: 0, trop: false, donnees: 0, texte, liens: [], fonctions, ...(groupesLus ? { groupes: groupesLus } : {}) };
  // La balise <svg> est un element comme un groupe : ce qu'elle pose se transmet aux formes. `opacity` s'y
  // applique au dessin entier, donc se multiplie a chaque forme comme celle d'un <g> (le dessin etant a plat,
  // il n'y a pas de groupe a composer : voir lireOpacites). Masque, decoupe et filtre se refusent comme ailleurs.
  const prRacine = proprietesDe(analyse, racine);
  const refusRacine = refusDe(prRacine, prisesDe(fonctions));
  if (refusRacine) p.refus.add(refusRacine);
  for (const msg of ignoresDeFusion(prRacine, racine)) analyse.ignores.add(msg);
  const ctx = { m: IDENTITE, heritees: heriter({}, prRacine), opacite: lireOpacite(prRacine.opacity), profondeur: 0 };
  racine.enfants.forEach(e => visiter(p, e, ctx));
  if (analyse.effort.depasse) {
    return { erreur: 'Ce SVG a trop de règles de style (' + analyse.regles.length.toLocaleString('fr-FR') + ') pour ses éléments (plus de ' + (CONFRONTATIONS_MAX / 1e6).toLocaleString('fr-FR') + ' millions de confrontations) : simplifiez-le dans votre logiciel.' };
  }
  if (p.refus.size) return { erreur: 'Ce SVG contient ' + [...p.refus].join(', ') + ' : il ne s’édite pas ici. Vectorisez l’image, ou simplifiez-le dans votre logiciel.' };
  // Une forme sans aucune commande (chemin vide, nombre illisible) ne se dessine pas : un SVG qui n'en a que de telles formes est vide.
  const formes = resoudreLiens(p.formes, p.liens ?? []).filter(f => f.d.length > 0);
  if (!formes.length) return { erreur: 'Ce SVG ne contient aucune forme à éditer.' };
  const production = lireProduction(racine.attributs);
  // Les groupes du mode riche : un groupe dont aucune feuille n'a ete gardee part (en cascade), la table vide aussi (arbre.ts).
  const dessin: DessinSvg = groupesLus?.size ? normaliser({ vb: plan, formes, groupes: Object.fromEntries(groupesLus) }) : { vb: plan, formes };
  return { dessin, ignores: [...analyse.ignores, ...(texte ? phrasesRemplacements(texte) : [])], ...(production ? { production } : {}) };
}
