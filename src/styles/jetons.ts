// Le registre des jetons de couleur de l'interface (ADR-0007) : la seule source des couleurs de la page.
// Chaque jeton a un identifiant, un role, une valeur claire et une valeur sombre, et dit a quoi il sert.
// Le CSS des variables se genere d'ici (`cssJetons`, au build) ; la page n'en ecrit aucune a la main, et
// un test confronte le registre au CSS et au code : pas de couleur en dur, pas de jeton orphelin, pas
// de paire texte-fond sous 4,5:1. Les couleurs du dessin edite n'en font pas partie : elles sont a
// l'utilisateur (nuancier, palettes).

import { contraste, lireHex, versHex } from '../util/couleur.js';
import { declarationsEspaces, tableauEspaces } from './espaces.js';
import { declarationsTypographie, tableauTypographie } from './typographie.js';

export type RoleJeton = 'surface' | 'texte' | 'trait' | 'action' | 'etat' | 'toile' | 'relief' | 'repli';
export type Theme = 'clair' | 'sombre';

export interface Jeton {
  /** Le nom de la variable CSS, sans les deux tirets : `cyan` donne `--cyan`. */
  readonly id: string;
  readonly role: RoleJeton;
  readonly clair: string;
  readonly sombre: string;
  readonly description: string;
}

/** Les roles dans l'ordre ou on les lit, avec ce qu'ils regroupent. */
export const ROLES: ReadonlyArray<readonly [RoleJeton, string]> = [
  ['surface', 'Les fonds : la table de travail et les panneaux'],
  ['texte', 'Les encres : le texte et ses nuances'],
  ['trait', 'Les filets et séparations'],
  ['action', 'La couleur d’outil : une seule, pour l’action et l’état actif'],
  ['etat', 'Les messages : avertissement et échec, chacun avec son fond'],
  ['toile', 'Ce qui se voit derrière le dessin : les fonds du plan de travail et le damier'],
  ['relief', 'Les ombres et voiles, translucides'],
  ['repli', 'Les teintes de repli : ce que color-mix() calcule, déjà calculé pour un navigateur qui ne l’a pas (docs/navigateurs.md)']
];

const jeton = (id: string, role: RoleJeton, clair: string, sombre: string, description: string): Jeton => ({ id, role, clair, sombre, description });

const JETONS_DE_BASE: readonly Jeton[] = [
  jeton('table', 'surface', '#e9ecef', '#121518', 'Le fond de la page, et du champ de travail autour du plan'),
  jeton('panneau', 'surface', '#f7f8f9', '#1a1e22', 'Les barres, panneaux, cartes et menus : ce qui se pose sur la table'),
  jeton('selection', 'surface', '#c6dde6', '#2a4b5a', 'Le fond du texte sélectionné : la couleur d’outil adoucie, sous l’encre'),
  jeton('encre', 'texte', '#15181d', '#e6e9ec', 'Le texte courant et les icônes'),
  jeton('encre-douce', 'texte', '#555c66', '#9aa3ad', 'Le texte secondaire : aides, légendes, libellés de champ'),
  jeton('filet', 'trait', '#cfd4da', '#2f353c', 'Les bordures et séparations ; décoratif, il ne porte jamais seul une information'),
  jeton('filet-fort', 'trait', '#7d848d', '#69717b', 'Le bord qui doit se voir : pastille de couleur (une encre sur un panneau sombre), poignée des barres de défilement'),
  jeton('poignee-degrade', 'trait', '#9c2a7a', '#e07ac0', 'Les poignées de dégradé sur la toile (ADR-0012, étape 4) : l’axe, le rail et le cerne des arrêts, posés sur leur halo de panneau ; une teinte à part du cyan de la sélection'),
  jeton('arret-selectionne', 'trait', '#15181d', '#e6e9ec', 'L’arrêt de dégradé choisi : le bord de son option dans la liste des arrêts, l’anneau de la poignée qui a le focus (sur son halo de panneau)'),
  jeton('cyan', 'action', '#00719c', '#4fb3dc', 'La couleur d’outil : action primaire, état actif, focus, liens'),
  jeton('cyan-survol', 'action', '#006186', '#4fb3dc', 'Le texte d’un bouton discret survolé : le cyan s’assombrit en clair, où le voile du survol le ferait passer sous 4,5:1'),
  jeton('sur-cyan', 'action', '#ffffff', '#08202b', 'Le texte posé sur la couleur d’outil'),
  jeton('alerte', 'etat', '#8a5a00', '#e3b45a', 'Avertissement : le texte'),
  jeton('alerte-fond', 'etat', '#f8ecd2', '#33280f', 'Avertissement : le fond du message'),
  jeton('echec', 'etat', '#a8322a', '#f08b80', 'Échec et geste destructif : le texte et le contour'),
  jeton('echec-fond', 'etat', '#f7e0dd', '#3a1c19', 'Échec et geste destructif : le fond au survol'),
  jeton('damier-a', 'toile', '#ffffff', '#ffffff', 'Le damier de transparence : les cases claires'),
  jeton('damier-b', 'toile', '#e6e6e6', '#e6e6e6', 'Le damier de transparence : les cases grises'),
  jeton('toile-blanc', 'toile', '#ffffff', '#ffffff', 'Le plan de travail en fond blanc'),
  jeton('toile-sombre', 'toile', '#1b1d20', '#1b1d20', 'Le plan de travail en fond sombre'),
  jeton('encre-toile', 'toile', '#15181d', '#15181d', 'L’encre des aperçus de police « forme / ligne », posés sur le plan blanc dans les deux thèmes (comme le papier qu’on découpe)'),
  jeton('apercu-coupe', 'toile', '#cc4a1a', '#cc4a1a', 'L’aperçu de la machine : les hachures de la zone que la lame découpe et le contour de coupe ; lisible sur le plan blanc, sombre et en damier'),
  jeton('apercu-stylo', 'toile', '#3d6fe0', '#3d6fe0', 'L’aperçu de la machine : la ligne que trace le stylo, à sa largeur ; lisible sur le plan blanc, sombre et en damier'),
  jeton('contour-decoupe', 'toile', '#8e5bd4', '#8e5bd4', 'Le contenu d’une découpe qu’on modifie (ADR-0012, paquet 8-D) : sa géométrie tracée en contour sur la toile, le reste estompé ; lisible sur le plan blanc, sombre et en damier'),
  jeton('contour-masque', 'toile', '#1e8f6a', '#1e8f6a', 'Le contenu d’un masque qu’on modifie (ADR-0012, paquet 8-D) : le filet qui cerne ses formes, peintes telles quelles, et les tirets de sa région ; lisible sur le plan blanc, sombre et en damier'),
  jeton('ombre-menu', 'relief', 'rgba(0, 0, 0, 0.2)', 'rgba(0, 0, 0, 0.2)', 'L’ombre des menus déroulants'),
  jeton('ombre-tiroir', 'relief', 'rgba(0, 0, 0, 0.25)', 'rgba(0, 0, 0, 0.25)', 'L’ombre des tiroirs mobiles'),
  jeton('voile', 'relief', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.35)', 'Le voile qui assombrit la toile derrière un tiroir ouvert')
];

/**
 * Une teinte de repli : ce que `color-mix(in srgb, var(--base) part%, dessous)` donne, calculé ici pour chaque thème.
 * Les feuilles gardent color-mix(), qui suit le jeton de base si l'hôte le change ; un navigateur qui ne le connaît
 * pas (avant Chrome 111, Firefox 113, Safari 16.2) lit ces valeurs fixes, dans un bloc `@supports not`. `dessous` est
 * `null` pour « transparent » (la teinte est alors la couleur de base à `part` % d'opacité) ou un jeton opaque.
 */
function repli(id: string, base: string, part: number, dessous: string | null, description: string): Jeton {
  const pour = (theme: Theme): string => {
    const haut = lireHex(valeurDeBase(base, theme));
    if (!haut) throw new Error('Repli sur un jeton qui n’est pas un hexadécimal : ' + base);
    if (dessous === null) return 'rgba(' + haut.r + ', ' + haut.g + ', ' + haut.b + ', ' + String(part / 100) + ')';
    const bas = lireHex(dessous.startsWith('#') ? dessous : valeurDeBase(dessous, theme));
    if (!bas) throw new Error('Repli sur un jeton qui n’est pas un hexadécimal : ' + dessous);
    const k = part / 100;
    return versHex({ r: haut.r * k + bas.r * (1 - k), g: haut.g * k + bas.g * (1 - k), b: haut.b * k + bas.b * (1 - k) });
  };
  return jeton(id, 'repli', pour('clair'), pour('sombre'), description);
}

function valeurDeBase(id: string, theme: Theme): string {
  const j = JETONS_DE_BASE.find(b => b.id === id);
  if (!j) throw new Error('Jeton de base inconnu : « ' + id + ' »');
  return j[theme];
}

/** Les mélanges que les feuilles écrivent avec color-mix() : un jeton de repli chacun, et pas un de plus (un test le confronte aux feuilles). */
const JETONS_DE_REPLI: readonly Jeton[] = [
  repli('repli-cyan-10', 'cyan', 10, null, 'La couleur d’outil à 10 % : survol d’un bouton discret, cadre de sélection'),
  repli('repli-cyan-12', 'cyan', 12, null, 'La couleur d’outil à 12 % : survol d’un bouton d’icône, d’un menu, du zoom'),
  repli('repli-cyan-14', 'cyan', 14, null, 'La couleur d’outil à 14 % : bouton d’icône dont le menu est ouvert, élément de menu survolé'),
  repli('repli-cyan-18', 'cyan', 18, null, 'La couleur d’outil à 18 % : ligne choisie des calques et des couleurs'),
  repli('repli-cyan-35', 'cyan', 35, null, 'La couleur d’outil à 35 % : le trait de la grille magnétique'),
  repli('repli-cyan-6-panneau', 'cyan', 6, 'panneau', 'La couleur d’outil à 6 % sur un panneau : la rangée de la sélection'),
  repli('repli-cyan-7-panneau', 'cyan', 7, 'panneau', 'La couleur d’outil à 7 % sur un panneau : la voie choisie de l’accueil'),
  repli('repli-cyan-8-panneau', 'cyan', 8, 'panneau', 'La couleur d’outil à 8 % sur un panneau : la zone de dépôt survolée, le bandeau de reprise'),
  repli('repli-cyan-fonce', 'cyan', 86, '#000000', 'La couleur d’outil assombrie de 14 % : survol de l’action primaire')
];

export const JETONS: readonly Jeton[] = [...JETONS_DE_BASE, ...JETONS_DE_REPLI];

/** Un texte sur un fond : le contraste minimal qu'il doit tenir dans les deux thèmes. */
export interface PaireContraste { readonly texte: string; readonly fond: string; readonly minimum: number; readonly usage: string }

/** WCAG 2.x AA, texte courant : 4,5:1. Le filet est décoratif et n'y figure pas. */
export const AA = 4.5;

export const PAIRES: readonly PaireContraste[] = [
  { texte: 'encre', fond: 'table', minimum: AA, usage: 'texte sur la page' },
  { texte: 'encre', fond: 'panneau', minimum: AA, usage: 'texte dans les panneaux et menus' },
  { texte: 'encre-douce', fond: 'table', minimum: AA, usage: 'aides sur la page, texte d’exemple d’un champ (::placeholder)' },
  { texte: 'encre-douce', fond: 'panneau', minimum: AA, usage: 'aides dans les panneaux' },
  { texte: 'encre', fond: 'selection', minimum: AA, usage: 'texte sélectionné (::selection)' },
  { texte: 'cyan', fond: 'table', minimum: AA, usage: 'liens et boutons discrets sur la page' },
  { texte: 'cyan', fond: 'panneau', minimum: AA, usage: 'liens et boutons discrets dans les panneaux' },
  { texte: 'cyan-survol', fond: 'panneau', minimum: AA, usage: 'bouton discret survolé dans un panneau (le voile de survol à 10 % est vérifié par un test de rendu)' },
  { texte: 'cyan-survol', fond: 'table', minimum: AA, usage: 'bouton discret survolé sur la page' },
  { texte: 'sur-cyan', fond: 'cyan', minimum: AA, usage: 'libellé de l’action primaire et de l’outil actif' },
  { texte: 'alerte', fond: 'alerte-fond', minimum: AA, usage: 'message d’avertissement' },
  { texte: 'echec', fond: 'echec-fond', minimum: AA, usage: 'message d’échec, survol d’un geste destructif' },
  { texte: 'echec', fond: 'panneau', minimum: AA, usage: 'geste destructif au repos' }
];

/** WCAG 2.x 1.4.11, ce qui n'est pas du texte (le bord d'une commande, une forme qui informe) : 3:1. */
export const AA_GRAPHIQUE = 3;

/**
 * Les bords qui portent une information (une pastille dont la couleur se confond avec le panneau, la poignee d'une barre
 * de defilement) : 3:1 contre les deux fonds, dans les deux themes. Le filet ordinaire, decoratif, n'y figure pas.
 */
export const PAIRES_GRAPHIQUES: readonly PaireContraste[] = [
  { texte: 'filet-fort', fond: 'panneau', minimum: AA_GRAPHIQUE, usage: 'bord d’une pastille de couleur, poignée de défilement, sur un panneau' },
  { texte: 'filet-fort', fond: 'table', minimum: AA_GRAPHIQUE, usage: 'bord d’une pastille de couleur, poignée de défilement, sur la table' },
  { texte: 'encre-toile', fond: 'toile-blanc', minimum: AA_GRAPHIQUE, usage: 'les lettres d’un aperçu de police (forme pleine ou ligne de stylo) sur le plan blanc' },
  { texte: 'cyan', fond: 'panneau', minimum: AA_GRAPHIQUE, usage: 'le liseré de survol d’une forme sur la toile, filet cyan sur son halo de panneau (ADR-0029)' },
  { texte: 'poignee-degrade', fond: 'panneau', minimum: AA_GRAPHIQUE, usage: 'l’axe et les poignées d’un dégradé sur la toile, filet sur son halo de panneau (ADR-0012, étape 4)' },
  { texte: 'arret-selectionne', fond: 'panneau', minimum: AA_GRAPHIQUE, usage: 'le bord de l’arrêt choisi dans la liste, l’anneau de la poignée focalisée sur son halo de panneau' },
  // L'apercu de la machine (ADR-0028) se pose sur le plan, quel que soit son fond : blanc, sombre, ou les deux cases du damier.
  { texte: 'apercu-coupe', fond: 'toile-blanc', minimum: AA_GRAPHIQUE, usage: 'hachures et contour de coupe de l’aperçu de la machine sur le plan blanc' },
  { texte: 'apercu-coupe', fond: 'toile-sombre', minimum: AA_GRAPHIQUE, usage: 'hachures et contour de coupe de l’aperçu de la machine sur le plan sombre' },
  { texte: 'apercu-coupe', fond: 'damier-b', minimum: AA_GRAPHIQUE, usage: 'hachures et contour de coupe de l’aperçu de la machine sur la case grise du damier' },
  { texte: 'apercu-stylo', fond: 'toile-blanc', minimum: AA_GRAPHIQUE, usage: 'ligne du stylo de l’aperçu de la machine sur le plan blanc' },
  { texte: 'apercu-stylo', fond: 'toile-sombre', minimum: AA_GRAPHIQUE, usage: 'ligne du stylo de l’aperçu de la machine sur le plan sombre' },
  { texte: 'apercu-stylo', fond: 'damier-b', minimum: AA_GRAPHIQUE, usage: 'ligne du stylo de l’aperçu de la machine sur la case grise du damier' },
  // Le contenu d'une decoupe ou d'un masque qu'on modifie (paquet 8-D) se trace sur le plan, quel que soit son fond.
  { texte: 'contour-decoupe', fond: 'toile-blanc', minimum: AA_GRAPHIQUE, usage: 'le contour du contenu d’une découpe qu’on modifie, sur le plan blanc' },
  { texte: 'contour-decoupe', fond: 'toile-sombre', minimum: AA_GRAPHIQUE, usage: 'le contour du contenu d’une découpe qu’on modifie, sur le plan sombre' },
  { texte: 'contour-decoupe', fond: 'damier-b', minimum: AA_GRAPHIQUE, usage: 'le contour du contenu d’une découpe qu’on modifie, sur la case grise du damier' },
  { texte: 'contour-masque', fond: 'toile-blanc', minimum: AA_GRAPHIQUE, usage: 'le filet et la région du contenu d’un masque qu’on modifie, sur le plan blanc' },
  { texte: 'contour-masque', fond: 'toile-sombre', minimum: AA_GRAPHIQUE, usage: 'le filet et la région du contenu d’un masque qu’on modifie, sur le plan sombre' },
  { texte: 'contour-masque', fond: 'damier-b', minimum: AA_GRAPHIQUE, usage: 'le filet et la région du contenu d’un masque qu’on modifie, sur la case grise du damier' }
];

const parId = new Map(JETONS.map(j => [j.id, j] as const));

/** Le jeton d'un identifiant, ou une erreur qui le nomme : une faute de frappe ne passe pas en silence. */
export function lire(id: string): Jeton {
  const j = parId.get(id);
  if (!j) throw new Error('Jeton de couleur inconnu : « ' + id + ' »');
  return j;
}

export const valeur = (id: string, theme: Theme): string => lire(id)[theme];

/** Le contraste d'une paire dans un thème ; les deux jetons doivent être des couleurs opaques en hexadécimal. */
export function contrasteDe(p: PaireContraste, theme: Theme): number {
  const t = lireHex(valeur(p.texte, theme)), f = lireHex(valeur(p.fond, theme));
  if (!t || !f) throw new Error('Paire non hexadécimale : ' + p.texte + ' sur ' + p.fond);
  return contraste(t, f);
}

const declarations = (jetons: readonly Jeton[], theme: Theme, retrait: string): string =>
  jetons.map(j => retrait + '--' + j.id + ': ' + j[theme] + ';').join('\n');

/**
 * Le CSS des variables : le thème clair par défaut, le sombre quand le système le demande (sauf si la
 * page force « clair »), et le sombre quand la page le force. Seuls les jetons qui changent d'un thème
 * à l'autre figurent dans les blocs sombres.
 */
export function cssJetons(): string {
  const changent = JETONS.filter(j => j.clair !== j.sombre);
  return [
    '/* Généré depuis src/styles/jetons.ts : ne pas modifier ici. */',
    ':root {',
    declarations(JETONS, 'clair', '  '),
    declarationsTypographie('  '),
    declarationsEspaces('  '),
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    declarations(changent, 'sombre', '    '),
    '    color-scheme: dark;',
    '  }',
    '}',
    ':root[data-theme="dark"] {',
    declarations(changent, 'sombre', '  '),
    '  color-scheme: dark;',
    '}'
  ].join('\n');
}

const cellule = (v: string) => '`' + v + '`';

/** La table de docs/jetons.md : un tableau par rôle, puis les paires de contraste avec leur rapport réel. */
export function tableauJetons(): string {
  const sections = ROLES.map(([role, titre]) => {
    const lignes = JETONS.filter(j => j.role === role).map(j => '| ' + cellule('--' + j.id) + ' | ' + cellule(j.clair) + ' | ' + cellule(j.sombre) + ' | ' + j.description + ' |');
    return ['### ' + titre, '', '| Jeton | Clair | Sombre | Rôle |', '|---|---|---|---|', ...lignes].join('\n');
  });
  const ligne = (p: PaireContraste) => '| ' + cellule('--' + p.texte) + ' sur ' + cellule('--' + p.fond) + ' | ' + contrasteDe(p, 'clair').toFixed(2) + ' | ' + contrasteDe(p, 'sombre').toFixed(2) + ' | ' + p.usage + ' |';
  const paires = PAIRES.map(ligne);
  return [
    ...sections.flatMap(s => [s, '']),
    '### Contrastes exigés (WCAG 2.x AA, au moins ' + AA + ':1)',
    '',
    '| Paire | Clair | Sombre | Usage |',
    '|---|---|---|---|',
    ...paires,
    '',
    '### Contrastes exigés hors texte (WCAG 2.x 1.4.11, au moins ' + AA_GRAPHIQUE + ':1)',
    '',
    '| Paire | Clair | Sombre | Usage |',
    '|---|---|---|---|',
    ...PAIRES_GRAPHIQUES.map(ligne),
    '',
    tableauTypographie(),
    '',
    tableauEspaces(),
    ''
  ].join('\n');
}
