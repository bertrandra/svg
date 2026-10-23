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
