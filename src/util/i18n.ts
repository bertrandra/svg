// L'interface en plusieurs langues (ADR-0042) : la cle d'un texte est la phrase francaise elle-meme, un dictionnaire par autre
// langue, le francais par defaut. `t('Annuler')` rend la cle en francais, l'entree du dictionnaire en anglais, la cle si elle manque
// (le test de couverture, tests/unit/i18n, empeche qu'il en manque).
//
// La langue et les dictionnaires sont un etat de module, pose par l'hote avant tout rendu (io/langue.ts) : la seule entorse admise
// a « tout se passe en parametre ». Elle tient parce que la langue ne change pas pendant une session (en changer recharge
// l'interface), et parce qu'aucun octet ecrit dans un fichier n'en depend : l'ecriture SVG, les exports et les projets ne passent
// jamais par `t`. Ici, rien du DOM : poser `document.documentElement.lang` est l'affaire d'io/langue.ts.

export type Langue = 'fr' | 'en';

/** Les langues de l'interface, dans l'ordre ou on les propose ; `fr` est la premiere et le defaut partout. */
export const LANGUES: readonly Langue[] = ['fr', 'en'];

/** Vrai pour une langue connue : tout ce qui vient d'un stockage ou d'un hote se valide (ADR-0014). */
export const estLangue = (v: unknown): v is Langue => v === 'fr' || v === 'en';

/** Un dictionnaire : la phrase francaise vers sa traduction, les `{valeurs}` gardees telles quelles. */
export type Dictionnaire = Readonly<Record<string, string>>;

/** Un dictionnaire pose a la forme attendue : un objet de textes vers des textes, rien d'autre n'en sort ; undefined sinon. */
export function validerDictionnaire(v: unknown): Dictionnaire | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const table: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(v as Record<string, unknown>)) {
    if (typeof valeur !== 'string') return undefined;
    table[cle] = valeur;
  }
  return table;
}

/** La globale que l'hote pose avant de charger ce code quand la langue est deja choisie : `__langueSvgLangue = 'en'`. */
export const GLOBALE_LANGUE = '__langueSvgLangue';

/** La globale que pose l'annexe du dictionnaire d'une langue (`langue-en.js` : `window.__langueSvg_en = {…}`). */
export const globaleDictionnaire = (l: Langue): string => '__langueSvg_' + l;

/** Ce que `t` interpole : une valeur par nom, telle quelle (un nombre a formater passe d'abord par `nombre`). */
export type Valeurs = Readonly<Record<string, string | number>>;

/** La locale de chaque langue, pour les nombres et les dates. */
const LOCALES: Readonly<Record<Langue, string>> = { fr: 'fr-FR', en: 'en-US' };

let courante: Langue = 'fr';
const dictionnaires = new Map<Langue, Dictionnaire>();

/** Pose la langue de l'interface pour la suite de la session. */
export function definirLangue(l: Langue): void { courante = l; }

/** La langue de l'interface, `fr` tant que personne ne l'a posee. */
export const langue = (): Langue => courante;

/**
 * Pose le dictionnaire d'une langue (la table de l'annexe langue-<l>.js). Le francais n'en a pas : ses cles sont le texte ; lui en
 * poser un marcherait, mais rien ne le fait.
 */
export function definirDictionnaire(l: Langue, table: Dictionnaire): void { dictionnaires.set(l, table); }

/** Vrai quand le dictionnaire de cette langue est pose (`fr` l'est toujours : il n'en a pas besoin). */
export const dictionnairePose = (l: Langue): boolean => l === 'fr' || dictionnaires.has(l);

const aLaCle = (table: Readonly<Record<string, unknown>>, cle: string): boolean => Object.prototype.hasOwnProperty.call(table, cle);

/** L'entree du dictionnaire de la langue courante pour cette cle, sans interpolation ; undefined sans dictionnaire ou sans entree. */
export function traduction(cle: string): string | undefined {
  const table = dictionnaires.get(courante);
  return table !== undefined && aLaCle(table, cle) ? table[cle] : undefined;
}

/** Remplace chaque `{nom}` par sa valeur ; un nom sans valeur reste tel quel, pour qu'on le voie. */
export function interpoler(texte: string, valeurs: Valeurs): string {
  return texte.replace(/\{(\w+)\}/g, (tout: string, nom: string) => (aLaCle(valeurs, nom) ? String(valeurs[nom]) : tout));
}

/**
 * Le texte de l'interface pour cette phrase francaise : la phrase en francais, sa traduction dans la langue courante, ou la phrase
 * quand la traduction manque. Les `{nom}` se remplacent par `valeurs` : `t('Projet « {nom} » enregistré.', { nom })`.
 */
export function t(cle: string, valeurs?: Valeurs): string {
  const texte = traduction(cle) ?? cle;
  return valeurs === undefined ? texte : interpoler(texte, valeurs);
}

/** La locale de la langue courante : `fr-FR`, `en-US`. */
export const locale = (): string => LOCALES[courante];

/**
 * Un nombre dit dans la langue courante (« 5 000 » en francais, « 5,000 » en anglais) ; `decimales` borne les chiffres apres la
 * virgule, sinon la regle de la locale (trois au plus). C'est l'unique chemin des `toLocaleString` de l'interface.
 */
export function nombre(v: number, decimales?: number): string {
  return v.toLocaleString(locale(), decimales === undefined ? undefined : { maximumFractionDigits: decimales });
}

/**
 * L'amorce : la langue et son dictionnaire poses AVANT ce code par l'hote, lus a l'initialisation de ce module. Pourquoi : des
 * constantes de module (`const X = t('…')`) et des objets de donnees s'evaluent au chargement, avant que `preparerLangue` (io) ait
 * pu poser quoi que ce soit ; sans amorce, ils resteraient en francais chez une personne qui lit l'anglais. La page autonome (un
 * script d'amorce avant le moteur), le site PHP (sa page) et un hote qui embarque posent donc `globalThis.__langueSvgLangue` et
 * chargent `langue-en.js` avant le bundle ; ici, si la langue est connue et le dictionnaire bien forme, les deux se posent tout de
 * suite. C'est la seule lecture d'un global du coeur pur, et elle reste pure : le choix est deja fait quand ce code se charge,
 * rien du DOM, de l'horloge ni du hasard n'y entre, et un global absent ou mal forme ne change rien (le francais, comme avant).
 * `preparerLangue` garde la voie tardive (un hote qui appelle `ouvrir({ langue: 'en' })` sans amorce) et ne recharge pas une
 * annexe deja posee ici.
 */
function amorcer(): void {
  const globaux = globalThis as unknown as Readonly<Record<string, unknown>>;
  const l = globaux[GLOBALE_LANGUE];
  if (!estLangue(l) || l === 'fr') return;
  const table = validerDictionnaire(globaux[globaleDictionnaire(l)]);
  if (table === undefined) return;
  dictionnaires.set(l, table);
  courante = l;
}
amorcer();
