// Couper ou ecrire, forme par forme (ADR-0028). Le procede du contexte (decoupe, dessin au stylo) ne vaut plus pour tout le dessin :
// il donne l'operation par defaut, et chaque forme peut en porter une autre. Une regle pure propose « ecrire » pour ce qui n'est
// qu'une ligne ; la personne decide du reste, dans le panneau de gauche, la rangee de la selection ou au clavier. Pur.
//
// Ce module dit aussi ce que le fichier garde : l'operation d'une forme ne s'ecrit (`data-ed-operation`) qu'en contexte Cricut, et
// seulement quand elle differe de ce que la regle proposerait. Un fichier Generique, ou un dessin ou personne n'a rien change,
// garde ses octets.

import { naturePolice } from '../../model/polices.js';
import type { Procede } from '../../model/contextes.js';
import type { DessinSvg, Forme, Operation } from '../editionSvg.js';
import { pluriel } from '../../util/texte.js';

/** Les procedes ou l'operation se choisit forme par forme : Print Then Cut imprime tout et ne decoupe que la silhouette. */
export const operationsApplicables = (procede: Procede): boolean => procede !== 'imprimer-decouper';

/**
 * L'operation que la regle propose pour une forme, sans choix de la personne :
 * - au stylo (procede « Dessin au stylo »), tout s'ecrit : c'est le defaut du procede ;
 * - un texte vivant en police a trait unique s'ecrit : ses lettres sont des tracés ouverts, la lame ne saurait qu'en faire ;
 * - une forme sans remplissage (un trait seul, une ligne mediane, une hachure) s'ecrit : il n'y a rien a detacher ;
 * - le reste (une forme pleine) se decoupe, ce qui est le defaut de la decoupe et de Print Then Cut.
 */
export function operationProposee(f: Forme, procede: Procede): Operation {
  if (procede === 'dessin-stylo') return 'ecriture';
  if (f.texte && naturePolice(f.texte.police.id) === 'trait') return 'ecriture';
  return f.remplissage === null ? 'ecriture' : 'decoupe';
}

/** L'operation d'une forme : celle qu'on a choisie, sinon celle que la regle propose. */
export const operationDe = (f: Forme, procede: Procede): Operation => f.operation ?? operationProposee(f, procede);

/** Le dessin partage en deux, au meme cadre : les formes a couper et les formes a ecrire, chacune dans l'ordre du dessin. */
export interface Operations { readonly decoupe: DessinSvg; readonly ecriture: DessinSvg }

const partages = new WeakMap<DessinSvg, Map<Procede, Operations>>();

/**
 * Le partage du dessin par operation. Memorise par dessin et par procede : le jugement, l'apercu et le panneau le lisent chacun a
 * chaque rendu. Un dessin qui ne porte qu'une operation rend lui-meme d'un cote (et un dessin vide de l'autre).
 */
export function partagerOperations(dessin: DessinSvg, procede: Procede): Operations {
  let parProcede = partages.get(dessin);
  if (!parProcede) { parProcede = new Map(); partages.set(dessin, parProcede); }
  const connu = parProcede.get(procede);
  if (connu) return connu;
  const decoupe: Forme[] = [], ecriture: Forme[] = [];
  for (const f of dessin.formes) (operationDe(f, procede) === 'decoupe' ? decoupe : ecriture).push(f);
  const vide: DessinSvg = { vb: dessin.vb, formes: [] };
  const r: Operations = {
    decoupe: !ecriture.length ? dessin : decoupe.length ? { vb: dessin.vb, formes: decoupe } : vide,
    ecriture: !decoupe.length ? dessin : ecriture.length ? { vb: dessin.vb, formes: ecriture } : vide
  };
  parProcede.set(procede, r);
  return r;
}

/** Combien de formes visibles se coupent et s'ecrivent. */
export function compterOperations(dessin: DessinSvg, procede: Procede): { readonly decoupe: number; readonly ecriture: number } {
  let decoupe = 0, ecriture = 0;
  for (const f of dessin.formes) if (f.visible) { if (operationDe(f, procede) === 'decoupe') decoupe++; else ecriture++; }
  return { decoupe, ecriture };
}

/** Vrai quand le dessin visible mele les deux operations : l'export livre alors un fichier par operation. */
export function operationsMelees(dessin: DessinSvg, procede: Procede): boolean {
  const n = compterOperations(dessin, procede);
  return n.decoupe > 0 && n.ecriture > 0;
}

/** Le resultat d'un changement d'operation : le dessin (le meme objet s'il n'a pas change) et ce qu'il faut en dire. */
export interface ResultatOperation { readonly dessin: DessinSvg; readonly changees: number; readonly phrase: string }

/**
 * Pose l'operation sur les formes nommees. Le choix s'ecrit dans la forme meme quand il vaut ce que la regle proposerait : changer
 * ensuite de procede ne defait pas ce que la personne a decide. Une forme verrouillee ne change pas (on ne retouche pas ce qu'on a
 * verrouille). Pur : une operation de l'historique comme une autre, que Ctrl+Z defait.
 */
export function poserOperation(dessin: DessinSvg, ids: readonly string[], operation: Operation, procede: Procede): ResultatOperation {
  const voulus = new Set(ids);
  let changees = 0;
  const formes = dessin.formes.map(f => {
    if (!voulus.has(f.id) || f.verrouille) return f;
    if (operationDe(f, procede) !== operation) changees++;
    return f.operation === operation ? f : { ...f, operation };
  });
  const touche = formes.some((f, i) => f !== dessin.formes[i]);
  return { dessin: touche ? { ...dessin, formes } : dessin, changees, phrase: phraseOperation(changees, operation) };
}

/** « 2 formes passent à l’écriture au stylo. », « Une forme passe à la découpe. », ou ce qui n'a pas change. */
export function phraseOperation(n: number, operation: Operation): string {
  const vers = operation === 'decoupe' ? 'à la découpe' : 'à l’écriture au stylo';
  if (!n) return operation === 'decoupe' ? 'Ces formes sont déjà à couper.' : 'Ces formes sont déjà à écrire.';
  return (n > 1 ? pluriel(n, 'forme') + ' passent ' : 'Une forme passe ') + vers + '.';
}

/**
 * Le dessin tel que le document l'ecrit : en Generique (`procede` null), aucune operation ; en contexte Cricut, seulement celles qui
 * different de la regle. Rend le meme objet quand rien n'est a retirer, pour que l'ecriture garde ses formes en cache.
 */
export function operationsAEcrire(dessin: DessinSvg, procede: Procede | null): DessinSvg {
  const garder = (f: Forme): boolean => procede !== null && f.operation !== undefined && f.operation !== operationProposee(f, procede);
  if (!dessin.formes.some(f => f.operation !== undefined && !garder(f))) return dessin;
  return {
    ...dessin,
    formes: dessin.formes.map(f => {
      if (f.operation === undefined || garder(f)) return f;
      const { operation: _o, ...reste } = f;
      void _o;
      return reste;
    })
  };
}

/** La forme sans son operation : ce que les exports ecrivent (le fichier d'une operation n'a pas a la redire). */
export function sansOperation(f: Forme): Forme {
  if (f.operation === undefined) return f;
  const { operation: _o, ...reste } = f;
  void _o;
  return reste;
}
