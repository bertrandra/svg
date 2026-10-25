// Les mots qu'on cherche et que les noms ne portent pas : « sapin » quand la forme s'appelle « pin », « chaton »
// quand elle s'appelle « chat ». Un petit dictionnaire en donnees, qui ne touche pas au classement (les
// evenements restent ceux des regles de bibliotheque.ts) : il dit seulement quels mots des noms une recherche
// peut aussi accepter, et vers quels evenements la renvoyer quand elle ne trouve rien.
//
// Les cles et les mots sont ecrits sans accents ni majuscules, comme la recherche les compare ; chaque mot
// propose doit figurer dans au moins un nom de la bibliotheque (un test le verifie), pour qu'aucune entree ne
// promette ce que les noms ne tiennent pas. Les mots d'une entree vont du plus proche au plus lointain : la
// recherche classe d'abord ce que donne le premier.

export interface Synonyme {
  /** Les mots (ou suites de mots) des noms que la recherche accepte aussi, le plus proche d'abord. */
  readonly mots: readonly string[];
  /** Les evenements vers lesquels renvoyer cette recherche (« Voir aussi », ou quand elle ne trouve rien). */
  readonly evenements?: readonly string[];
}

export const SYNONYMES: Readonly<Record<string, Synonyme>> = {
  sapin: { mots: ['pin', 'arbre'], evenements: ['noel'] },
  conifere: { mots: ['pin', 'arbre'] },
  chaton: { mots: ['chat'] },
  felin: { mots: ['chat', 'lion', 'tigre'] },
  chiot: { mots: ['chien'] },
  toutou: { mots: ['chien'] },
  lievre: { mots: ['lapin'], evenements: ['paques'] },
  agneau: { mots: ['mouton'], evenements: ['paques'] },
  poussin: { mots: ['poule', 'oeuf'], evenements: ['paques'] },
  chouette: { mots: ['hibou'] },
  renne: { mots: ['cerf'], evenements: ['noel'] },
  lutin: { mots: ['elfe'], evenements: ['noel'] },
  bicyclette: { mots: ['velo'] },
  princesse: { mots: ['reine', 'couronne'] },
  legume: { mots: ['carotte', 'tomate', 'mais'], evenements: ['nourriture'] },
  alliance: { mots: ['anneau'], evenements: ['mariage'] },
  mariee: { mots: ['robe', 'anneau'], evenements: ['mariage'] },
  bisou: { mots: ['levres', 'coeur'], evenements: ['saint-valentin'] },
  baiser: { mots: ['levres', 'coeur'], evenements: ['saint-valentin'] },
  amoureux: { mots: ['coeur', 'amour'], evenements: ['saint-valentin'] },
  maman: { mots: ['femme'], evenements: ['fete-des-meres'] },
  papa: { mots: ['homme'], evenements: ['fete-des-peres'] },
  ecole: { mots: ['livre', 'crayon'], evenements: ['rentree', 'etudes'] },
  vacances: { mots: ['plage', 'valise', 'soleil'], evenements: ['ete', 'voyage'] },
  petard: { mots: ['feu d artifice'], evenements: ['nouvel-an', 'quatorze-juillet'] },
  lampion: { mots: ['lanterne'], evenements: ['quatorze-juillet'] },
  confetti: { mots: ['ballon'], evenements: ['fete', 'anniversaire'] },
  orage: { mots: ['eclair', 'nuage'] },
  tasse: { mots: ['chope', 'cafe'] },
  gateau: { mots: ['piece montee', 'cupcake'], evenements: ['anniversaire'] }
};

/** Les exemples que le champ de recherche propose : un test exige que chacun trouve des formes. */
export const EXEMPLES_RECHERCHE: readonly string[] = ['sapin', 'lapin', 'cœur'];
