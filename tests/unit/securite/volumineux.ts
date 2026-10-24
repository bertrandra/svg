// Les entrees trop grosses pour etre commitees (plusieurs Mo) : engendrees a la volee, une fois chacune. Le corpus de
// tests/fixtures/hostile en porte une version reduite ; ici, la taille de l'enonce des attaques (docs/securite.md).

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const FORME = '<path d="M10 10h80v80h-80z" fill="#c81e28"/>';
const svg = (interieur: string): string => `<svg ${NS} viewBox="0 0 100 100">${interieur}${FORME}</svg>`;
const rep = (s: string, n: number): string => s.repeat(n);

export interface Volumineux {
  readonly nom: string;
  readonly vecteur: string;
  readonly genere: () => string;
  /** 'ouvre' : le dessin doit s'ouvrir ; 'refus' : un refus nomme ; null : l'un ou l'autre. */
  readonly attendu: 'ouvre' | 'refus' | null;
  /** La phrase du refus attendue (un morceau), pour les limites nommees. */
  readonly refus?: string;
  /** Le temps accorde a chaque appel, quand 1,5 s serait deraisonnable pour la taille (dit pourquoi). */
  readonly budgetMs?: number;
  /** Vrai : seul le chemin de la page est passe, sans relecture de l'ecriture (la lecture d'un million de points prend sept secondes). */
  readonly leger?: boolean;
}

function chemin(points: number): string {
  const morceaux: string[] = ['M0 0'];
  for (let i = 0; i < points; i++) morceaux.push('L' + ((i * 7) % 100) + ' ' + ((i * 13) % 100));
  return svg(`<path d="${morceaux.join('')}Z" fill="#1428a0" stroke="#000"/>`);
}
const cheminMillion = (): string => chemin(1_000_000);

function bombeRires(): string {
  const entites = ['<!ENTITY a "aaaaaaaaaa">'];
  for (let i = 1; i < 12; i++) entites.push(`<!ENTITY ${String.fromCharCode(97 + i)} "${rep(`&${String.fromCharCode(96 + i)};`, 10)}">`);
  return `<!DOCTYPE svg [${entites.join('')}]><svg ${NS} viewBox="0 0 100 100"><title>&l;</title>${FORME}</svg>`;
}

function selecteursProfonds(): string {
  const regle = (i: number) => `g g g g g g g g g g g g g g g g g g g g g g g g g g g g g g.c${i}`;
  const css = Array.from({ length: 200 }, (_, i) => regle(i)).join(',') + '{fill:#c81e28}';
  return svg(`<style>${css}</style>${rep('<g>', 800)}<path d="M0 0h10v10z" class="c1"/>${rep('</g>', 800)}`);
}

export const VOLUMINEUX: readonly Volumineux[] = [
  { nom: 'imbrication-100000', vecteur: '100 000 groupes imbriques', genere: () => svg(rep('<g>', 100_000) + rep('</g>', 100_000)), attendu: 'refus', refus: 'trop profond' },
  { nom: 'imbrication-1000', vecteur: '1 000 groupes imbriques : sous la limite, la pile des fonctions recursives doit tenir', genere: () => svg(rep('<g>', 1000) + rep('</g>', 1000)), attendu: 'ouvre' },
  { nom: 'imbrication-1025', vecteur: '1 025 niveaux : juste au-dessus de la limite', genere: () => `<svg ${NS} viewBox="0 0 100 100">${rep('<g>', 1024)}${FORME}${rep('</g>', 1024)}</svg>`, attendu: 'refus', refus: 'trop profond' },
  { nom: 'freres-100000', vecteur: '100 000 elements freres', genere: () => svg(rep('<g/>', 100_000)), attendu: 'ouvre' },
  { nom: 'freres-1100000', vecteur: 'plus d\'un million d\'elements : la limite du nombre d\'elements', genere: () => svg(rep('<g/>', 1_100_000)), attendu: 'refus', refus: 'éléments', budgetMs: 6000 },
  // Un million de points (7 Mo de trace) tient sous la borne des donnees de trace et se lit en quelques secondes : c'est le plus gros
  // chemin que l'editeur accepte, et le temps accorde (20 s) est celui de la borne, pas celui d'un dessin ordinaire.
  { nom: 'chemin-1000000-points', vecteur: 'un chemin d\'un million de points', genere: cheminMillion, attendu: 'ouvre', budgetMs: 20000, leger: true },
  { nom: 'chemin-100000-points', vecteur: 'un chemin de 100 000 points, tous les invariants et le budget ordinaire', genere: () => chemin(100_000), attendu: 'ouvre' },
  { nom: 'chemin-2000000-points', vecteur: 'un chemin de deux millions de points : au-dela de la borne des donnees de trace', genere: () => cheminMillion().replace('Z"', rep('L50 50', 1_000_000) + 'Z"'), attendu: 'refus', refus: 'données de tracé', budgetMs: 8000, leger: true },
  { nom: 'clones-d-un-gros-chemin', vecteur: 'un chemin de 600 Ko cloné 10 000 fois par <use> (6 Go de trace si on relit a chaque clone)', genere: () => svg(`<defs><path id="g" d="${'M0 0' + rep('L5 5', 150_000)}"/></defs>${rep('<use href="#g"/>', 10_000)}`), attendu: 'refus', refus: 'données de tracé', budgetMs: 8000, leger: true },
  { nom: 'attributs-10000', vecteur: 'un element a 10 000 attributs', genere: () => svg(`<g ${Array.from({ length: 10_000 }, (_, i) => `a${i}="${i}"`).join(' ')}/>`), attendu: 'refus', refus: 'attributs' },
  { nom: 'regles-50000-sur-300-formes', vecteur: '50 000 regles de style sur 300 formes (15 millions de confrontations)', genere: () => svg(`<style>${Array.from({ length: 50_000 }, (_, i) => `.c${i}{fill:#${(i % 4096).toString(16).padStart(3, '0')}}`).join('')}</style>${Array.from({ length: 300 }, (_, i) => `<rect class="c${i}" width="1" height="1" x="${i % 100}" y="${Math.floor(i / 100)}"/>`).join('')}`), attendu: null },
  { nom: 'regles-universelles-100000', vecteur: '100 000 regles « * » sur 1 000 formes : le produit passe la limite', genere: () => svg(`<style>${rep('*{fill:#abc}', 100_000)}</style>${rep('<rect width="1" height="1"/>', 1000)}`), attendu: 'refus', refus: 'règles de style', budgetMs: 4000 },
  { nom: 'selecteurs-profonds', vecteur: 'selecteurs a 30 descendants sur 800 niveaux', genere: selecteursProfonds, attendu: null },
  { nom: 'chiffres-100000', vecteur: 'un nombre de 100 000 chiffres dans un chemin, un viewBox et un transform', genere: () => `<svg ${NS} viewBox="0 0 ${rep('9', 100_000)} 100"><path d="M${rep('1', 100_000)} 1L5 5Z" transform="translate(${rep('7', 100_000)} 1)" fill="#c81e28"/></svg>`, attendu: null },
  { nom: 'transform-scale-non-fermes-200000', vecteur: '200 000 « scale( » jamais fermes dans un transform (quadratique avec une recherche globale)', genere: () => svg(`<g transform="${rep('scale(', 200_000)}"><rect width="1" height="1"/></g>`), attendu: null },
  { nom: 'transform-100000-fonctions', vecteur: '100 000 fonctions de transformation composees', genere: () => svg(`<g transform="${rep('translate(1 1) ', 100_000)}"><rect width="1" height="1"/></g>`), attendu: null },
  { nom: 'id-1-mo', vecteur: 'un identifiant d\'un million de caracteres', genere: () => svg(`<defs><path id="${rep('i', 1_000_000)}" d="M0 0h10v10z"/></defs><use href="#${rep('i', 1_000_000)}"/>`), attendu: 'ouvre' },
  { nom: 'valeur-10-mo', vecteur: 'un attribut data de 10 Mo', genere: () => svg(`<g data-x="${rep('x', 10_000_000)}"/>`), attendu: 'ouvre' },
  { nom: 'plus-de-64-millions', vecteur: 'un texte de plus de 64 millions de caracteres', genere: () => svg(`<title>${rep('x', 65 * 1024 * 1024)}</title>`), attendu: 'refus', refus: 'dépasse', budgetMs: 4000 },
  { nom: 'milliard-de-rires-reel', vecteur: 'billion laughs sur 11 niveaux (10^11 si on developpe)', genere: bombeRires, attendu: 'ouvre' },
  { nom: 'commentaires-300000', vecteur: '300 000 commentaires et instructions', genere: () => svg(rep('<!-- c --><?p x?>', 300_000)), attendu: 'ouvre' },
  { nom: 'balise-jamais-fermee-1-mo', vecteur: 'une balise ouverte jamais fermee sur 1 Mo d\'attributs', genere: () => `<svg ${NS} viewBox="0 0 100 100"><g ${rep('a="1"', 200_000)}`, attendu: 'refus' },
  { nom: 'cdata-jamais-ferme-5-mo', vecteur: 'une section CDATA jamais fermee sur 5 Mo', genere: () => `<svg ${NS} viewBox="0 0 100 100"><style><![CDATA[${rep('a{}', 1_300_000)}`, attendu: 'refus' },
  { nom: 'ampersands-800000', vecteur: '800 000 esperluettes dans un attribut et un texte (chacune devient « &amp; » : cinq fois plus)', genere: () => svg(`<title>${rep('&', 400_000)}</title><g data-x="${rep('&', 400_000)}"/>`), attendu: null },
  { nom: 'parentheses-css', vecteur: 'une feuille de 2 Mo de parentheses et accolades ouvertes', genere: () => svg(`<style>${rep('{(', 1_000_000)}</style>`), attendu: null },
  { nom: 'url-non-fermes', vecteur: '200 000 « url( » non fermes dans une feuille', genere: () => svg(`<style>${rep('a{fill:url(http://x.invalid/', 100_000)}</style>`), attendu: null }
];
