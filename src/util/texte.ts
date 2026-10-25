// Les petites aides de texte que plusieurs couches partagent.

/** « 1 forme », « 3 formes » : le nombre, un blanc, le mot, accorde en nombre par un « s ». */
export const pluriel = (n: number, mot: string): string => n + ' ' + mot + (n > 1 ? 's' : '');

/**
 * La typographie francaise : une espace insecable avant « ; : ? ! » et le guillemet fermant, apres le guillemet ouvrant. Sans elle,
 * une ligne etroite (une bulle sur un telephone) commence par « ; » ou laisse un « « » seul en fin de ligne.
 */
export const insecables = (t: string): string => t.replace(/ ([;:?!»])/g, ' $1').replace(/« /g, '« ');
