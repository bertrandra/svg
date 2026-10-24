// Contour en forme (« Outline Stroke ») : le trait d'une forme devient une forme pleine qui a
// exactement sa silhouette. Le trace est aplati comme pour les booleens, epaissi morceau par morceau
// (epaissir.ts : segments, jonctions, bouts), decoupe en tirets si la forme en a, puis l'union des
// morceaux (polygon-clipping) en etablit le bord : un recouvrement, une boucle qui se croise ou un
// angle aigu ne demandent aucun cas particulier. Un trace ferme donne un anneau exterieur et un anneau
// interieur. A la demande (`lisser`), les arcs reviennent en courbes (ajustement.ts) a la tolerance pres.
//
// Le resultat prend la couleur du trait pour remplissage, perd son contour, et garde l'alpha du trait
// comme alpha de fond : la forme se voit comme avant.

import type { MultiPolygon } from 'polygon-clipping';
import type { Chemin, DessinSvg, Forme } from '../edition/types.js';
import { boiteForme } from '../edition/geometrie.js';
import { prochainId } from '../edition/operations.js';
import { opaciteDuContour } from '../edition/opacites.js';
import { LIMITE_MITRE_DEFAUT } from '../edition/trait.js';
import { toleranceBooleen } from '../booleens.js';
import { decouperEnTirets } from './tirets.js';
import { anneauxDeTrait, type ReglageBord } from './epaissir.js';
import { polylignesDeChemin, type Polyligne } from './polylignes.js';
import { aireDeRegion, cheminDeRegionChoisie, unirAnneaux } from './region.js';

export interface OptionsEtendre {
  /** L'ecart maximal du resultat au trace epaissi ; par defaut un vingt-millieme de la forme. */
  tolerance?: number;
  /** Rebatir les arcs en courbes cubiques (defaut : non, comme les booleens). */
  lisser?: boolean;
  /** Un chemin par tiret (ou par morceau separe) plutot qu'un chemin compose. */
  separer?: boolean;
}

export const MSG_SANS_TRAIT = 'Cette forme n’a pas de contour à transformer : donnez-lui une couleur et une épaisseur de contour.';
export const MSG_TIRETS_TROP_FINS = 'Les tirets sont trop fins pour être transformés en formes : agrandissez le motif.';

/** Les polylignes du trait de la forme : le trace tel quel, ou ses tirets. `null` si le motif est trop fin. */
function traitsDe(f: Forme, tolerance: number): Polyligne[] | null {
  const lignes = polylignesDeChemin(f.d, tolerance);
  if (!f.pointilles?.length) return lignes;
  const morceaux: Polyligne[] = [];
  for (const l of lignes) {
    const tirets = decouperEnTirets(l, f.pointilles, f.decalagePointilles ?? 0);
    if (!tirets) return null;
    morceaux.push(...tirets);
  }
  return morceaux;
}

/** Le reglage du bord que dit le style de trait d'une forme (les valeurs absentes sont celles de SVG). */
export const reglageDeForme = (f: Forme, tolerance: number): ReglageBord => ({
  demi: f.epaisseur / 2, bout: f.bout ?? 'butt', jonction: f.jonction ?? 'round', limite: f.limiteMitre ?? LIMITE_MITRE_DEFAUT, tolerance
});

/**
 * La region que peint le trait d'une forme, ou une erreur dite. Un trace tres enchevetre (milliers de
 * croisements presque tangents) peut mettre le moteur de decoupe en echec : on reessaie alors a une
 * tolerance plus large, donc avec un autre aplatissement, avant de renoncer. Le resultat reste
 * deterministe : les essais se suivent toujours dans le meme ordre.
 */
export function regionDuTrait(f: Forme, tolerance: number): MultiPolygon | { erreur: string } {
  if (!f.contour || !(f.epaisseur > 0)) return { erreur: MSG_SANS_TRAIT };
  for (const facteur of [1, 3, 9]) {
    const tol = tolerance * facteur;
    const traits = traitsDe(f, tol);
    if (!traits) return { erreur: MSG_TIRETS_TROP_FINS };
    const r = reglageDeForme(f, tol);
    try {
      return unirAnneaux(traits.flatMap(l => anneauxDeTrait(l, r)));
    } catch { /* un autre aplatissement defait souvent l'incidence qui a fait echouer le balayage */ }
  }
  return { erreur: 'Le contour est trop enchevêtré pour être transformé : simplifiez le tracé, puis recommencez.' };
}

/** La tolerance d'une forme seule : un vingt-millieme de sa plus grande dimension, trait compris. */
export function toleranceDeForme(f: Forme): number {
  const b = boiteForme(f);
  return Math.max(b ? Math.max(b.l, b.h) : 0, f.epaisseur, 1e-3) / 20000;
}

/** Les chemins de la silhouette du trait d'une forme : un chemin compose, ou un par morceau si `separer`. */
export function etendreTrait(f: Forme, options: OptionsEtendre = {}): { chemins: Chemin[] } | { erreur: string } {
  const tolerance = options.tolerance ?? toleranceDeForme(f);
  const region = regionDuTrait(f, tolerance);
  if ('erreur' in region) return region;
  if (!region.length) return { erreur: 'Le contour n’a pas d’épaisseur visible : il ne reste rien à transformer.' };
  const lisser = options.lisser === true;
  if (options.separer) return { chemins: region.map(poly => cheminDeRegionChoisie([poly], lisser, tolerance)) };
  return { chemins: [cheminDeRegionChoisie(region, lisser, tolerance)] };
}

/** L'aire que le trait d'une forme peint, mesuree sur la region exacte (pour les controles). */
export function aireDuTrait(f: Forme, tolerance = toleranceDeForme(f)): number {
  const r = regionDuTrait(f, tolerance);
  return 'erreur' in r ? 0 : aireDeRegion(r);
}

const CHAMPS_TRAIT = ['pointilles', 'decalagePointilles', 'bout', 'jonction', 'limiteMitre', 'opaciteContour'];

/** La forme privee de ces champs : ils ne se retirent pas en les mettant a `undefined` (exactOptionalPropertyTypes). */
const sansChamps = (f: Forme, cles: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(f).filter(([c]) => !cles.includes(c)));

/** La forme sans contour ni rien de son style de trait : son fond reste tel quel. */
const sansContour = (f: Forme): Forme => ({ ...sansChamps(f, CHAMPS_TRAIT), contour: null } as Forme);

/** La silhouette du trait de `f` : couleur du trait en fond, son alpha en alpha de fond, plus de contour. */
function silhouette(f: Forme, id: string, d: Chemin): Forme {
  const alpha = opaciteDuContour(f);
  return { ...sansChamps(f, [...CHAMPS_TRAIT, 'opaciteRemplissage']), id, d, remplissage: f.contour, contour: null, regle: 'nonzero', ...(alpha < 1 ? { opaciteRemplissage: alpha } : {}) } as Forme;
}

export interface ResultatEtendre {
  dessin: DessinSvg;
  /** Les formes qui sont maintenant le contour (a choisir apres l'operation). */
  ids: string[];
  /** Le nombre de formes dont le contour est devenu une forme. */
  etendus: number;
  /** Le nombre de formes laissees telles quelles : sans contour, ou dont le contour est trop fin pour etre transforme. */
  ignorees: number;
  /** Le premier refus dit, quand rien n'a pu etre fait. */
  erreur?: string;
}

/**
 * Transforme le contour des formes choisies (visibles, deverrouillees) en formes pleines. Une forme sans
 * fond devient sa propre silhouette ; une forme avec un fond reste telle quelle, sans contour, et la
 * silhouette se pose juste au-dessus d'elle, ce qui se voit comme avant.
 */
export function etendreTraits(dessin: DessinSvg, ids: readonly string[], options: OptionsEtendre = {}): ResultatEtendre {
  const voulus = new Set(ids);
  let n = prochainId(dessin), etendus = 0, ignorees = 0, erreur: string | undefined;
  const nouveaux: string[] = [];
  const formes = dessin.formes.flatMap((f): Forme[] => {
    if (!voulus.has(f.id) || f.verrouille || !f.visible) return [f];
    const r = etendreTrait(f, { ...options, tolerance: options.tolerance ?? toleranceBooleen(dessin) });
    if ('erreur' in r) { ignorees++; erreur ??= r.erreur; return [f]; }
    etendus++;
    const seule = f.remplissage === null;
    const sorties = r.chemins.map((d, k) => {
      const id = seule && k === 0 ? f.id : 'f' + n++;
      nouveaux.push(id);
      return silhouette(f, id, d);
    });
    return seule ? sorties : [sansContour(f), ...sorties];
  });
  if (!etendus) return { dessin, ids: [], etendus, ignorees, ...(erreur ? { erreur } : {}) };
  return { dessin: { ...dessin, formes }, ids: nouveaux, etendus, ignorees };
}
