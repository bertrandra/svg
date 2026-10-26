// La navigation au clavier d'un menu : quel element prend le focus apres une fleche, en sautant les
// elements desactives et en bouclant aux extremites. Pur : des booleens en entree, un index en sortie.

/**
 * L'index du prochain element actif depuis `depuis`, dans le sens donne, en boucle ; -1 s'il n'y en a
 * aucun. `depuis` vaut -1 quand rien n'a encore le focus : une fleche vers le haut y va au dernier.
 */
export function suivant(desactives: readonly boolean[], depuis: number, sens: 1 | -1): number {
  const n = desactives.length;
  if (!n) return -1;
  const debut = depuis < 0 && sens < 0 ? 0 : depuis;
  for (let i = 1; i <= n; i++) {
    const idx = (((debut + sens * i) % n) + n) % n;
    if (!desactives[idx]) return idx;
  }
  return -1;
}

/** Le premier element actif, ou -1. */
export const premier = (desactives: readonly boolean[]): number => suivant(desactives, -1, 1);

/** Le dernier element actif, ou -1. */
export const dernier = (desactives: readonly boolean[]): number => suivant(desactives, desactives.length, -1);

/** La place d'un element de grille a l'ecran : son coin haut gauche, sa taille, et s'il est desactive. */
export interface CaseGrille { readonly x: number; readonly y: number; readonly l: number; readonly h: number; readonly desactive?: boolean }

/**
 * Dans une grille de tuiles (la palette des formes, ses rubriques de longueurs inegales), l'element de la rangee juste au-dessous
 * (sens 1) ou au-dessus (sens -1) dont le centre est le plus proche en largeur ; -1 s'il n'y a pas de rangee de ce cote. Une
 * rangee est l'ensemble des elements dont le haut est le plus proche, a la moitie d'une hauteur pres. Pur : des boites en entree.
 */
export function voisinVertical(cases: readonly CaseGrille[], depuis: number, sens: 1 | -1): number {
  const ici = cases[depuis];
  if (!ici) return -1;
  const cx = ici.x + ici.l / 2, seuil = ici.h / 2;
  const candidates = cases.map((c, i) => ({ c, i })).filter(({ c }) => !c.desactive && (sens > 0 ? c.y > ici.y + seuil : c.y < ici.y - seuil));
  if (!candidates.length) return -1;
  const rangee = sens > 0 ? Math.min(...candidates.map(({ c }) => c.y)) : Math.max(...candidates.map(({ c }) => c.y));
  let meilleur = -1, ecart = Infinity;
  for (const { c, i } of candidates) {
    if (Math.abs(c.y - rangee) > seuil) continue;
    const e = Math.abs(c.x + c.l / 2 - cx);
    if (e < ecart) { ecart = e; meilleur = i; }
  }
  return meilleur;
}
