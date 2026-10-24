// Decouper des polylignes en tirets selon un motif de pointilles (trait, blanc, trait, blanc...), comme
// le fait un navigateur : le motif commence au debut de chaque sous-chemin, decale de `decalage`, et
// un tiret de longueur nulle est un point (que seul un bout rond ou carre rend visible). Un tiret
// garde les sommets du trace qu'il traverse, pour que ses jonctions soient celles du trace.

import { fois, moins, norme, plus, unitaire, type Polyligne, type Pt } from './polylignes.js';

/** Au-dela, le motif est si fin que le resultat n'aurait plus de sens ni de poids : on refuse plutot que de figer la page. */
export const TIRETS_MAX = 20000;

/** La longueur d'une polyligne, fermeture comprise. */
export function longueurDe(l: Polyligne): number {
  const n = l.pts.length;
  let total = 0;
  for (let k = 0; k < (l.ferme ? n : n - 1); k++) {
    const a = l.pts[k], b = l.pts[(k + 1) % n];
    if (a && b) total += norme(moins(b, a));
  }
  return total;
}

/** Ou en est le motif apres `decalage` : l'indice de l'element et ce qui lui reste a parcourir (0 pour un point pose pile au depart). */
function phaseInitiale(motif: readonly number[], decalage: number): { indice: number; reste: number } {
  const total = motif.reduce((s, v) => s + v, 0);
  let pos = total > 0 ? decalage - Math.floor(decalage / total) * total : 0;
  for (let i = 0; i < motif.length; i++) {
    const v = motif[i] ?? 0;
    if (pos < v || (v === 0 && pos === 0)) return { indice: i, reste: v - pos };
    pos -= v;
  }
  return { indice: 0, reste: motif[0] ?? 0 };
}

const EPS = 1e-12;

/**
 * Les tirets d'une polyligne. Le nombre de tirets est estime avant de les construire (`TIRETS_MAX`) ;
 * `null` quand le motif en produirait trop.
 */
export function decouperEnTirets(l: Polyligne, motif: readonly number[], decalage: number): Polyligne[] | null {
  const total = motif.reduce((s, v) => s + v, 0);
  if (!(total > 0) || motif.length < 2) return [l];
  if ((longueurDe(l) / total) * (motif.length / 2) > TIRETS_MAX) return null;
  const n = l.pts.length, nSegments = l.ferme ? n : n - 1, sortie: Polyligne[] = [];
  let { indice, reste } = phaseInitiale(motif, decalage);
  let pts: Pt[] = [], coin: boolean[] = [], direction: Pt = [1, 0];
  const allume = () => indice % 2 === 0;
  const finir = () => {
    if (pts.length === 1) sortie.push({ pts, ferme: false, coin, direction });
    else if (pts.length > 1) sortie.push({ pts, ferme: false, coin });
    pts = []; coin = [];
  };
  // Les elements de longueur nulle du motif : un point depose sur place si l'element est un trait, rien si c'est un blanc.
  const consommerNuls = (ici: Pt) => {
    for (let garde = 0; garde < motif.length && reste === 0; garde++) {
      if (allume()) { pts = [ici]; coin = [false]; finir(); }
      indice = (indice + 1) % motif.length;
      reste = motif[indice] ?? 0;
    }
  };
  const avancerMotif = (ici: Pt) => { indice = (indice + 1) % motif.length; reste = motif[indice] ?? 0; consommerNuls(ici); };
  const a0 = l.pts[0], b0 = l.pts[1];
  if (a0 && b0) { direction = unitaire(moins(b0, a0)); consommerNuls(a0); }
  for (let k = 0; k < nSegments; k++) {
    const a = l.pts[k], b = l.pts[(k + 1) % n];
    if (!a || !b) continue;
    const longueur = norme(moins(b, a)), e = unitaire(moins(b, a));
    direction = e;
    let t = 0;
    // Un segment peut contenir plusieurs elements du motif, ou n'en entamer qu'un.
    while (t < longueur) {
      if (allume() && pts.length === 0) { pts = [plus(a, fois(e, t))]; coin = [false]; }
      const pas = Math.min(reste, longueur - t);
      t += pas; reste -= pas;
      if (reste <= EPS) {
        const fin = t >= longueur ? b : plus(a, fois(e, t));
        if (allume()) { pts.push(fin); coin.push(false); finir(); }
        avancerMotif(fin);
      } else if (allume()) {
        pts.push(b); coin.push(l.coin[(k + 1) % n] ?? false);
      }
    }
  }
  // Un tiret encore ouvert au bout du trace s'arrete la.
  finir();
  return sortie;
}
