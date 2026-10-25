// Les petites aides de texte que plusieurs couches partagent.

/** « 1 forme », « 3 formes » : le nombre, un blanc, le mot, accorde en nombre par un « s ». */
export const pluriel = (n: number, mot: string): string => n + ' ' + mot + (n > 1 ? 's' : '');

/**
 * La distance d'edition (Damerau-Levenshtein restreinte : insertion, suppression, substitution, inversion de deux lettres
 * voisines) entre deux mots, bornee : au-dela de `plafond`, on rend `plafond + 1` sans finir le calcul. Une faute de frappe
 * (« halowen », « guitarre ») est a une ou deux operations du mot voulu.
 */
export function distanceEdition(a: string, b: string, plafond = 2): number {
  if (Math.abs(a.length - b.length) > plafond) return plafond + 1;
  // Trois lignes de la matrice suffisent : l'inversion lit deux lignes en arriere.
  let precedente: number[] = [];
  let courante: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const suivante: number[] = [i];
    let minimum = i;
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min((courante[j] ?? 0) + 1, (suivante[j - 1] ?? 0) + 1, (courante[j - 1] ?? 0) + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, (precedente[j - 2] ?? 0) + 1);
      suivante.push(d);
      minimum = Math.min(minimum, d);
    }
    if (minimum > plafond) return plafond + 1;
    precedente = courante;
    courante = suivante;
  }
  return Math.min(courante[b.length] ?? plafond + 1, plafond + 1);
}
