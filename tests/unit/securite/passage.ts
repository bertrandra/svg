// Faire passer un texte par les chemins reels d'entree de la page et de l'embarquement, en mesurant chaque appel
// et en verifiant les invariants de chaque sortie. `performance.now()` ne sert qu'ici, dans les tests : le coeur
// pur ne connait pas l'horloge.

import { ecrireDessin, lireDessin } from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from './invariants.js';

/** Le temps accorde a un appel (nettoyage, lecture ou ecriture), en millisecondes. */
export const BUDGET_MS = Number(process.env.BUDGET_MS ?? 1500);

export interface Passage {
  /** Le plus long des appels, en ms, et lequel. */
  readonly plusLong: { readonly ms: number; readonly appel: string };
  /** Une exception qui s'echappe d'un appel : jamais permise. */
  readonly plantage: string | null;
  /** Les invariants rompus, chacun precede de l'etape. */
  readonly defauts: string[];
  /** Ce qui a refuse, nomme : « nettoyage », « lecture » ou le message de la lecture. */
  readonly refus: string[];
  /** Vrai quand le dessin s'ouvre par le chemin de la page. */
  readonly ouvre: boolean;
  /** Les sorties, pour les tests qui veulent les regarder. */
  readonly nettoye: string | null;
  readonly ecrit: string | null;
}

/** Un SVG ecrit ne doit pas grossir sans mesure : un clone de <use> coute au plus quelques centaines d'octets. */
export const tailleMax = (entree: number): number => 12 * entree + 6_000_000;

/**
 * Le passage d'un texte par tous les chemins de la page. Le budget de temps vise un calcul pathologique (quadratique, non
 * borne), lent a chaque passage ; une machine chargee peut ralentir une seule mesure : un depassement se remesure donc une
 * fois, et seul un depassement qui se repete reste un defaut. Le reste du verdict ne depend pas de l'horloge.
 */
export function passer(texte: string, budgetMs = BUDGET_MS, leger = false): Passage {
  const premier = passerUneFois(texte, budgetMs, leger);
  if (!premier.defauts.some(d => d.startsWith('temps : '))) return premier;
  const second = passerUneFois(texte, budgetMs, leger);
  return second.defauts.some(d => d.startsWith('temps : ')) ? premier : second;
}

function passerUneFois(texte: string, budgetMs: number, leger: boolean): Passage {
  const defauts: string[] = [], refus: string[] = [];
  let plusLong = { ms: 0, appel: '' }, plantage: string | null = null, ouvre = false, nettoye: string | null = null, ecrit: string | null = null;

  const appeler = <T>(nom: string, f: () => T): T | undefined => {
    const t0 = performance.now();
    try { return f(); } catch (e) {
      plantage = plantage ?? nom + ' : ' + (e instanceof Error ? e.name + ' ' + e.message : String(e)).slice(0, 200);
      return undefined;
    } finally {
      const ms = performance.now() - t0;
      if (ms > plusLong.ms) plusLong = { ms, appel: nom };
    }
  };
  const verifierEcriture = (etape: string, dessin: Parameters<typeof ecrireDessin>[0]): void => {
    const e = appeler(etape + '/ecrireDessin', () => ecrireDessin(dessin, 3));
    if (e === undefined) return;
    ecrit = e;
    for (const v of violationsEcriture(e)) defauts.push(etape + '/ecriture : ' + v);
    if (e.length > tailleMax(texte.length)) defauts.push(etape + '/ecriture : sortie de ' + e.length + ' caracteres pour ' + texte.length + ' en entree');
    // « Enregistrer » passe l'ecriture par le nettoyage : il ne doit rien y changer.
    const net = appeler(etape + '/nettoyerSvg(ecrit)', () => nettoyerSvg(e));
    if (net === undefined) return;
    if (net === null || net.svg !== e) defauts.push(etape + '/enregistrement : le nettoyage change une ecriture');
    // La relecture de son propre resultat redonne les memes octets (sauf en mode leger : un million de points se relit en sept secondes).
    if (leger) return;
    const relu = appeler(etape + '/relecture', () => lireDessin(e));
    if (relu === undefined) return;
    if ('erreur' in relu) defauts.push(etape + '/relecture : l ecriture ne se relit pas (' + relu.erreur + ')');
    else {
      const encore = appeler(etape + '/reecriture', () => ecrireDessin(relu.dessin, 3));
      if (encore !== undefined && encore !== e) defauts.push(etape + '/relecture : la relecture ne redonne pas les memes octets');
    }
  };

  // 1. Le chemin de la page : nettoyage, puis lecture de ce que le nettoyage a laisse.
  const propre = appeler('nettoyerSvg', () => nettoyerSvg(texte));
  if (propre === null) refus.push('nettoyage');
  else if (propre !== undefined) {
    nettoye = propre.svg;
    for (const v of violationsNettoyage(propre.svg)) defauts.push('nettoyage : ' + v);
    if (propre.svg.length > tailleMax(texte.length)) defauts.push('nettoyage : sortie de ' + propre.svg.length + ' caracteres pour ' + texte.length + ' en entree');
    if (!(propre.ratio > 0 && Number.isFinite(propre.ratio))) defauts.push('nettoyage : ratio ' + propre.ratio);
    const lu = appeler('lireDessin(nettoye)', () => lireDessin(propre.svg));
    if (lu !== undefined) {
      if ('erreur' in lu) refus.push(lu.erreur); else { ouvre = true; verifierEcriture('page', lu.dessin); }
    }
  }
  // 2. Le chemin de l'embarquement : l'hote donne son texte tel quel, sans nettoyage prealable.
  const direct = leger ? undefined : appeler('lireDessin(brut)', () => lireDessin(texte));
  if (direct !== undefined) {
    if ('erreur' in direct) refus.push(direct.erreur); else verifierEcriture('embarque', direct.dessin);
  }
  if (plusLong.ms > budgetMs) defauts.push('temps : ' + plusLong.appel + ' a pris ' + Math.round(plusLong.ms) + ' ms (budget ' + budgetMs + ' ms)');
  return { plusLong, plantage, defauts, refus, ouvre, nettoye, ecrit };
}
