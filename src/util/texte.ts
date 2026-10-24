// Les petites aides de texte que plusieurs couches partagent.

/** « 1 forme », « 3 formes » : le nombre, un blanc, le mot, accorde en nombre par un « s ». */
export const pluriel = (n: number, mot: string): string => n + ' ' + mot + (n > 1 ? 's' : '');
