// Les petites aides de texte que plusieurs couches partagent.

/**
 * Un mot au pluriel : un « s » de plus, sauf aux mots deja termines par s, x ou z, qui ne changent pas (« tapis »,
 * « prix », « nez »). Une expression de plusieurs mots s'accorde mot a mot (« petite forme », « petites formes ») :
 * c'est le cas de nos libelles, un nom et son adjectif. Les pluriels irreguliers (-al, -eau) n'y sont pas : aucun
 * libelle de l'interface n'en emploie, et une regle de plus serait une regle a tenir.
 */
export const auPluriel = (mot: string): string => mot.split(' ').map(m => (m === '' || /[sxz]$/i.test(m) ? m : m + 's')).join(' ');

/** « 1 forme », « 3 formes », « 2 tapis » : le nombre, un blanc, le mot, accorde en nombre au-dela de un. */
export const pluriel = (n: number, mot: string): string => n + ' ' + (n > 1 ? auPluriel(mot) : mot);

/**
 * Les verbes de la souris, dits au doigt : une aide qui dit « Cliquez » a quelqu'un qui touche l'ecran le fait chercher
 * un geste qu'il n'a pas. Les remplacements vont du plus long au plus court, pour que « double-cliquez » ne devienne
 * pas « double-touchez ». Glisser, maintenir et choisir valent pour les deux : ils restent. Sans doigt, la phrase est rendue telle quelle.
 */
const AU_DOIGT: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDouble-cliquez\b/g, 'Touchez deux fois'],
  [/\bdouble-cliquez\b/g, 'touchez deux fois'],
  [/\bdouble-clic\b/g, 'double appui'],
  [/\bUn clic\b/g, 'Un appui'],
  [/\bun clic\b/g, 'un appui'],
  [/\bCliquez\b/g, 'Touchez'],
  [/\bcliquez\b/g, 'touchez']
];

export function selonSaisie(phrase: string, doigt: boolean): string {
  return doigt ? AU_DOIGT.reduce((t, [motif, mot]) => t.replace(motif, mot), phrase) : phrase;
}
