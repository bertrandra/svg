// Decaler le contour (« Offset Path ») : un chemin ferme grandit (distance positive) ou retrecit (negative)
// de la distance donnee, un chemin ouvert est entoure. Meme machinerie que le contour en forme : la
// region peinte du chemin (selon sa regle, trous compris) est decalee en lui ajoutant, ou en lui
// retirant, le trace de son bord, epaissi de la distance de chaque cote avec la jonction voulue.
//   - vers l'exterieur : region U trace du bord ; un coin saillant prend la jonction (pointe, arc, biseau),
//     un coin rentrant se resout de lui-meme, et un trou se referme quand il est plus petit que la distance ;
//   - vers l'interieur : region - trace du bord ; la region disparait quand la distance la depasse.
// L'union et la difference sont celles de polygon-clipping, qui defont les auto-intersections : aucun cas
// particulier pour un decalage plus grand qu'un detail.

import type { MultiPolygon } from 'polygon-clipping';
import clipping from 'polygon-clipping';
import { regionDeChemin, toleranceBooleen } from '../booleens.js';
import type { Chemin, Commande, DessinSvg, Forme } from '../edition/types.js';
import { LIMITE_MITRE_DEFAUT } from '../edition/trait.js';
import { nombreFr } from '../description.js';
import { anneauxDeTrait, type Jonction, type ReglageBord } from './epaissir.js';
import { polyligneDAnneau, polylignesDeChemin, type Polyligne, type Pt } from './polylignes.js';
import { cheminDeRegionChoisie, unirAnneaux } from './region.js';

export interface OptionsDecalage {
  /** Le rapport de pointe a distance au-dela duquel une pointe est biseautee (4 en SVG). */
  limite?: number;
  /** La regle de remplissage du chemin (celle de la forme) ; defaut : selon le sens du trace. */
  regle?: Forme['regle'];
  /** Traiter les sous-chemins ouverts comme fermes (une forme avec un fond se peint fermee). */
  fermerOuverts?: boolean;
  tolerance?: number;
  /** Rebatir les arcs en courbes cubiques. */
  lisser?: boolean;
}

export type ResultatDecalage = { chemin: Chemin } | { erreur: string; vide?: true };

/** Les sous-chemins d'un chemin : chacun avec son M, jusqu'au M suivant. */
function sousCheminsBruts(d: Chemin): Commande[][] {
  const r: Commande[][] = [];
  for (const c of d) {
    if (c.c === 'M' || !r.length) r.push([]);
    r[r.length - 1]?.push(c);
  }
  return r;
}

/** Les anneaux de la frontiere d'une region, en polylignes fermees (sans le point de fermeture repete). */
function bordsDe(region: MultiPolygon): Polyligne[] {
  const lignes: Polyligne[] = [];
  for (const poly of region) for (const a of poly) {
    const pts = a.map((p): Pt => [p[0], p[1]]);
    const premier = pts[0], dernier = pts[pts.length - 1];
    if (premier && dernier && pts.length > 1 && premier[0] === dernier[0] && premier[1] === dernier[1]) pts.pop();
    if (pts.length > 2) lignes.push(polyligneDAnneau(pts));
  }
  return lignes;
}

const MSG_OUVERT_NEGATIF = 'Un tracé ouvert n’a pas d’intérieur : décalez-le vers l’extérieur (distance positive).';

/** Le trace d'un bord : l'union des anneaux de ses polylignes. */
const traceDe = (lignes: readonly Polyligne[], r: ReglageBord): MultiPolygon => unirAnneaux(lignes.flatMap(l => anneauxDeTrait(l, r)));

function decalerUneFois(d: Chemin, distance: number, jonction: Jonction, o: OptionsDecalage, tolerance: number): ResultatDecalage {
  const h = Math.abs(distance);
  const sous = sousCheminsBruts(d);
  const estFerme = (s: Chemin) => o.fermerOuverts === true || s.some(c => c.c === 'Z');
  const fermes = sous.filter(estFerme).flat(), ouverts = sous.filter(s => !estFerme(s));
  const region = fermes.length ? regionDeChemin(fermes, o.regle ?? 'nonzero', tolerance) : [];
  const reglage: ReglageBord = { demi: h, bout: 'round', jonction, limite: o.limite ?? LIMITE_MITRE_DEFAUT, tolerance };
  const lignesOuvertes = ouverts.flatMap(s => polylignesDeChemin(s, tolerance));
  if (distance < 0 && !fermes.length) return { erreur: MSG_OUVERT_NEGATIF };
  let resultat: MultiPolygon;
  if (distance > 0) {
    const bord = traceDe([...bordsDe(region), ...lignesOuvertes], reglage);
    resultat = region.length && bord.length ? clipping.union(region, bord) : region.length ? region : bord;
  } else {
    const bord = traceDe(bordsDe(region), reglage);
    resultat = region.length && bord.length ? clipping.difference(region, bord) : region;
  }
  const lisser = o.lisser === true;
  // En decalage rentrant, les sous-chemins ouverts n'ont pas de sens : ils restent tels quels.
  const conserves = distance < 0 ? ouverts.flat() : [];
  const chemin = [...cheminDeRegionChoisie(resultat, lisser, tolerance), ...conserves];
  if (!chemin.length) return { erreur: 'Le décalage de ' + nombreFr(distance) + ' dépasse la forme : il ne reste rien.', vide: true };
  return { chemin };
}

/**
 * Le chemin decale de `distance` (positif : vers l'exterieur, negatif : vers l'interieur) avec la jonction
 * donnee. Un echec du moteur de decoupe (trace tres enchevetre) se retente a une tolerance plus large.
 */
export function decaler(d: Chemin, distance: number, jonction: Jonction, options: OptionsDecalage = {}): ResultatDecalage {
  if (!Number.isFinite(distance) || distance === 0) return { chemin: d };
  const base = options.tolerance ?? 0.01;
  for (const facteur of [1, 3, 9]) {
    try {
      return decalerUneFois(d, distance, jonction, options, base * facteur);
    } catch { /* un autre aplatissement defait souvent l'incidence qui a fait echouer le balayage */ }
  }
  return { erreur: 'Le tracé est trop enchevêtré pour être décalé : simplifiez-le, puis recommencez.' };
}

export interface ResultatDecalageFormes {
  dessin: DessinSvg;
  /** Le nombre de formes decalees. */
  decalees: number;
  /** Les identifiants des formes qui n'ont plus rien et ont ete retirees. */
  retirees: string[];
  /** Le nombre de formes laissees telles quelles : un trace ouvert qu'on decale vers l'interieur n'a pas d'interieur. */
  refusees: number;
  /** Le premier refus dit, quand rien n'a pu etre fait. */
  erreur?: string;
}

/**
 * Decale les formes choisies (visibles, deverrouillees). Une forme qui ne laisse plus rien est retiree et
 * nommee : annuler la rend. Le dessin est rendu tel quel quand rien ne change.
 */
export function decalerFormes(dessin: DessinSvg, ids: readonly string[], distance: number, jonction: Jonction, options: OptionsDecalage = {}): ResultatDecalageFormes {
  const voulus = new Set(ids), retirees: string[] = [];
  let decalees = 0, refusees = 0, erreur: string | undefined, change = false;
  const formes = dessin.formes.flatMap((f): Forme[] => {
    if (!voulus.has(f.id) || f.verrouille || !f.visible) return [f];
    const r = decaler(f.d, distance, jonction, {
      tolerance: toleranceBooleen(dessin), limite: f.limiteMitre ?? LIMITE_MITRE_DEFAUT, regle: f.regle, fermerOuverts: f.remplissage !== null, ...options
    });
    if ('erreur' in r) {
      if (r.vide) { retirees.push(f.id); change = true; return []; }
      refusees++;
      erreur ??= r.erreur;
      return [f];
    }
    if (r.chemin === f.d) return [f];
    decalees++; change = true;
    return [{ ...f, d: r.chemin, regle: 'nonzero' }];
  });
  if (!change) return { dessin, decalees: 0, retirees, refusees, ...(erreur ? { erreur } : {}) };
  return { dessin: { ...dessin, formes }, decalees, retirees, refusees };
}
