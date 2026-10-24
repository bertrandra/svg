// Cantonner une feuille de style a un element : l'editeur s'embarque dans la page d'un autre, dont les
// regles ne doivent ni entrer chez lui ni recevoir les siennes. Les styles de l'editeur sont ecrits
// pour une page entiere (`body`, `button`, `*`, `:root`) ; ici chaque selecteur est repris sous une
// racine, pour qu'ils ne touchent que ce qu'elle contient. Pur : du texte en entree, du texte en sortie.
//
// Le lecteur est volontairement petit : il comprend ce que la feuille de l'editeur ecrit (regles,
// @media, @supports, @keyframes, chaines) et laisse passer le reste tel quel.

/** Les noms d'animation sont globaux : on les prefixe pour qu'ils ne heurtent pas ceux de l'hote. */
const PREFIXE_ANIMATION = 'editeur-';

/** Retire les commentaires. Une feuille de l'editeur n'en porte pas dans ses chaines. */
const sansCommentaires = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** L'indice de l'accolade fermante qui referme celle ouverte juste avant `debut`, chaines ignorees. */
function fermeture(css: string, debut: number): number {
  let profondeur = 1;
  for (let i = debut; i < css.length; i++) {
    const c = css.charAt(i);
    if (c === '"' || c === '\'') {
      for (i++; i < css.length && css.charAt(i) !== c; i++) if (css.charAt(i) === '\\') i++;
    } else if (c === '{') profondeur++;
    else if (c === '}' && --profondeur === 0) return i;
  }
  return css.length;
}

/** Coupe une liste de selecteurs aux virgules qui ne sont ni dans une parenthese ni dans un crochet. */
export function separerSelecteurs(liste: string): string[] {
  const parties: string[] = [];
  let profondeur = 0, debut = 0;
  for (let i = 0; i < liste.length; i++) {
    const c = liste.charAt(i);
    if (c === '(' || c === '[') profondeur++;
    else if (c === ')' || c === ']') profondeur--;
    else if (c === ',' && profondeur === 0) { parties.push(liste.slice(debut, i)); debut = i + 1; }
  }
  parties.push(liste.slice(debut));
  return parties.map(s => s.trim()).filter(s => s !== '');
}

/**
 * Un selecteur repris sous la racine ; une liste vide quand il vise un element que la racine remplace.
 * - `html` n'a pas d'equivalent : la racine n'a pas de parent a styler ;
 * - `body` et `:root` deviennent la racine (la feuille y pose la police et les jetons de couleur) ;
 * - `:root:not([data-theme="light"])` reste attache au vrai `:root` de l'hote, qui peut ainsi choisir le theme ;
 * - `*` couvre la racine elle-meme ;
 * - un selecteur qui part deja de la racine est laisse tel quel.
 */
export function porterSelecteur(selecteur: string, racine: string): string[] {
  const s = selecteur.trim();
  if (s === 'html') return [];
  if (s === 'body' || s === ':root') return [racine];
  if (s === '*') return [racine, racine + ' *'];
  if (s.startsWith(racine) && !/[\w-]/.test(s.charAt(racine.length))) return [s];
  if (s.startsWith(':root')) return [s + ' ' + racine];
  return [racine + ' ' + s];
}

function porterRegle(selecteurs: string, corps: string, racine: string): string {
  const portes = separerSelecteurs(selecteurs).flatMap(s => porterSelecteur(s, racine));
  return portes.length ? [...new Set(portes)].join(',') + '{' + corps + '}' : '';
}

/** Les at-rules dont le bloc contient des regles : on y descend. */
const AT_REGLES_IMBRIQUEES = /^@(media|supports|container|layer)\b/;

function porterBloc(css: string, racine: string): string {
  let sortie = '', i = 0;
  while (i < css.length) {
    const ouvrante = css.indexOf('{', i), point = css.indexOf(';', i);
    // Une instruction sans bloc (@import, @charset) passe telle quelle.
    if (point !== -1 && (ouvrante === -1 || point < ouvrante) && css.slice(i, point).trim().startsWith('@')) {
      sortie += css.slice(i, point + 1).trim(); i = point + 1; continue;
    }
    if (ouvrante === -1) break;
    const prelude = css.slice(i, ouvrante).trim();
    const fin = fermeture(css, ouvrante + 1);
    const corps = css.slice(ouvrante + 1, fin);
    if (AT_REGLES_IMBRIQUEES.test(prelude)) sortie += prelude + '{' + porterBloc(corps, racine) + '}';
    else if (prelude.startsWith('@')) sortie += prelude + '{' + corps + '}';
    else sortie += porterRegle(prelude, corps, racine);
    i = fin + 1;
  }
  return sortie;
}

/** Prefixe les noms d'animation, dans les `@keyframes` et dans les declarations qui les emploient. */
function renommerAnimations(css: string): string {
  const noms = [...css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)].map(m => m[1] ?? '');
  let r = css;
  for (const nom of new Set(noms)) {
    const motif = new RegExp('(?<![\\w.#-])' + nom.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '(?![\\w-])', 'g');
    r = r.replace(/(@(?:-webkit-)?keyframes\s+)([\w-]+)/g, (tout, tete: string, n: string) => (n === nom ? tete + PREFIXE_ANIMATION + n : tout));
    r = r.replace(/(animation(?:-name)?\s*:)([^;}]*)/g, (_t, tete: string, valeur: string) => tete + valeur.replace(motif, PREFIXE_ANIMATION + nom));
  }
  return r;
}

/**
 * Les `rem` de la feuille en pixels, a raison de `base` pixels le rem (16, la taille du navigateur). Le `rem`
 * suit la taille du `<html>` de l'hote, que beaucoup reglent (`html { font-size: 62.5% }`) : l'editeur
 * deviendrait minuscule ou geant. En pixels, il garde la taille de la page autonome.
 */
export function remEnPixels(css: string, base = 16): string {
  return css.replace(/(?<![\w.-])(-?\d*\.?\d+)rem\b/g, (_t, n: string) => String(Math.round(Number.parseFloat(n) * base * 1000) / 1000) + 'px');
}

/**
 * La feuille `css` reprise sous `racine` (un selecteur de classe, par exemple `.editeur-svg`) : chaque
 * regle ne s'applique plus qu'a ce que la racine contient, et les animations portent un nom a elles.
 */
export function porterCss(css: string, racine: string): string {
  return renommerAnimations(porterBloc(sansCommentaires(css), racine));
}
