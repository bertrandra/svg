// Les sources libres de la bibliotheque (model/sourcesFormes.ts) : quelles icones d'un jeu on garde, sous quel nom, dans
// quels evenements, sur quel plan. Pur et deterministe : le meme paquet donne toujours la meme annexe. game-icons garde sa
// construction d'avant (bibliotheque.ts, `construireBibliotheque`) : son annexe ne change pas d'un octet.
//
// Ce qui change d'une source a l'autre est dans le registre, pas ici : les variantes retenues (plein, ligne), les
// exclusions (logos de marque), l'ordre des mots de l'identifiant (« bell-off » se lit deja tete en premier).

import { NATURE_PROPOSEE_PAR_PROCEDE, SOURCE_PAR_DEFAUT, SOURCES_FORMES, naturesDe, type NatureForme, type SourceFormes, type VarianteSource } from './sourcesFormes.js';
import { classer, contient, nomFrancais, type EntreeBibliotheque, type IconeSource } from './bibliotheque.js';
import type { Procede } from './contextes.js';

/** Une icone d'un jeu iconify : `hidden` marque une icone retiree, gardee pour la compatibilite. */
export interface IconeJeu extends IconeSource { hidden?: boolean }

/** Le fichier icons.json d'un paquet @iconify-json, reduit a ce qu'on en lit. */
export interface JeuIcones {
  readonly icons: Readonly<Record<string, IconeJeu>>;
  readonly width?: number;
  readonly height?: number;
}

/** Les categories du fichier metadata.json d'un paquet : un nom, des identifiants. */
export type CategoriesJeu = Readonly<Record<string, readonly string[]>>;

/** Les terminaisons connues d'une source, la plus longue d'abord (`outline-24px` avant `24px`). */
const terminaisons = (s: SourceFormes): string[] =>
  [...s.variantes.map(v => v.suffixe), ...s.suffixesEcartes].filter(Boolean).sort((a, b) => b.length - a.length || (a < b ? -1 : 1));

/**
 * La variante d'un identifiant et son nom de base (`heart-fill` : `heart`, variante `fill`), ou undefined quand sa variante
 * n'est pas retenue. Un identifiant sans terminaison connue est la variante sans suffixe.
 */
export function varianteDe(s: SourceFormes, id: string): { base: string; variante: VarianteSource } | undefined {
  const suffixe = terminaisons(s).find(t => id.length > t.length + 1 && id.endsWith('-' + t)) ?? '';
  const variante = s.variantes.find(v => v.suffixe === suffixe);
  return variante ? { base: suffixe ? id.slice(0, -suffixe.length - 1) : id, variante } : undefined;
}

/** Les identifiants des categories ecartees par la source, lus dans le metadata.json du paquet. */
export function idsCategoriesEcartees(s: SourceFormes, categories: CategoriesJeu): ReadonlySet<string> {
  return new Set((s.exclusions.categories ?? []).flatMap(nom => categories[nom] ?? []));
}

/** Vrai quand une regle d'exclusion de la source ecarte cet identifiant (un logo de marque, le plus souvent). */
export function ecartee(s: SourceFormes, id: string, ecarteesParCategorie: ReadonlySet<string>): boolean {
  const x = s.exclusions;
  const mots = id.split('-');
  return ecarteesParCategorie.has(id)
    || (x.identifiants ?? []).includes(id)
    || (x.prefixes ?? []).some(p => id.startsWith(p))
    || (x.mots ?? []).some(m => mots.includes(m));
}

/**
 * Le SVG d'une icone pose sur le plan carre de la source : le dessin d'origine dans un groupe mis a l'echelle, pour que
 * toutes les sources libres partagent un meme plan (480, soit 5 pouces a 96 unites par pouce) quel que soit le leur (24,
 * 48, 256). Le facteur est exact en binaire (20, 10, 1,875) : la lecture ne cree aucune decimale qu'on n'ait voulue.
 */
export function svgSurPlan(icone: IconeSource, largeur: number, hauteur: number, plan: number): string {
  const k = plan / Math.max(largeur, hauteur);
  const l = (icone.width ?? largeur) * k, h = (icone.height ?? hauteur) * k;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + l + ' ' + h + '"><g transform="scale(' + k + ')">' + icone.body.replace(/currentColor/g, '#000000') + '</g></svg>';
}

/** Le nom francais d'une icone d'une source : sa base traduite dans l'ordre de la source, et le qualificatif de sa variante. */
export function nomDansSource(s: SourceFormes, base: string, variante: VarianteSource): string {
  const nom = nomFrancais(base, s.ordreDesMots, true);
  return variante.qualificatif ? nom + ' ' + variante.qualificatif : nom;
}

/** Les evenements d'une icone d'une source : ceux des regles communes, moins ceux que la source exclut pour un de ses mots. */
export function classerDansSource(s: SourceFormes, base: string): string[] {
  const mots = base.split('-');
  const sauf = s.saufParEvenement ?? {};
  return classer(base).filter(ev => !(sauf[ev] ?? []).some(m => contient(mots, m)));
}

/**
 * Les entrees d'une source, triees par identifiant : les icones retirees, les variantes non retenues et les exclusions en
 * moins. Chaque entree porte sa source et sa nature ; le classement se fait sur la base (« heart » pour « heart-fill »).
 */
export function construireSource(s: SourceFormes, jeu: JeuIcones, categories: CategoriesJeu = {}): EntreeBibliotheque[] {
  const largeur = jeu.width ?? 16, hauteur = jeu.height ?? largeur;
  const parCategorie = idsCategoriesEcartees(s, categories);
  const entrees: EntreeBibliotheque[] = [];
  for (const id of Object.keys(jeu.icons).sort()) {
    const icone = jeu.icons[id];
    const v = varianteDe(s, id);
    if (!icone || icone.hidden || !v || ecartee(s, id, parCategorie)) continue;
    entrees.push({ id, nom: nomDansSource(s, v.base, v.variante), evenements: classerDansSource(s, v.base), svg: svgSurPlan(icone, largeur, hauteur, s.plan), source: s.id, nature: v.variante.nature });
  }
  return entrees;
}

/** La source d'une entree : celle qu'elle porte, game-icons a defaut (une bibliotheque d'avant le registre, ou d'un hote). */
export const sourceDeEntree = (e: EntreeBibliotheque): string => e.source ?? SOURCE_PAR_DEFAUT;

/** La cle d'une entree, unique toutes sources confondues : son origine (`mdi:heart`), qui sert aussi de cle d'affichage. */
export const cleEntree = (e: EntreeBibliotheque): string => sourceDeEntree(e) + ':' + e.id;

/** La nature d'une entree : plein a defaut (game-icons ne porte que des silhouettes pleines). */
export const natureDeEntree = (e: EntreeBibliotheque): NatureForme => e.nature ?? 'plein';

/** Le rang d'une source dans le registre : l'ordre ou les sources se presentent, et le departage de deux formes de meme nom. */
export const rangDeSource = (id: string): number => {
  const i = SOURCES_FORMES.findIndex(s => s.id === id);
  return i < 0 ? SOURCES_FORMES.length : i;
};

/** Les entrees d'une source (null : toutes) et d'une nature (null : toutes). */
export function filtrerEntrees(entrees: readonly EntreeBibliotheque[], source: string | null, nature: NatureForme | null): EntreeBibliotheque[] {
  return entrees.filter(e => (source === null || sourceDeEntree(e) === source) && (nature === null || natureDeEntree(e) === nature));
}

/**
 * Les sources a charger pour montrer ce filtre : celle choisie (ou toutes), parmi celles qui proposent la nature choisie.
 * Une source qui n'a pas de forme de cette nature n'est pas demandee : choisir « En ligne » ne charge pas Material.
 */
export function sourcesDemandees(source: string | null, nature: NatureForme | null): SourceFormes[] {
  return SOURCES_FORMES.filter(s => (source === null || s.id === source) && (nature === null || naturesDe(s).includes(nature)));
}

/** Les natures dans l'ordre ou les proposer : celle que le procede du contexte appelle d'abord (le stylo : en ligne). */
export function naturesDansLOrdre(procede: Procede | undefined): NatureForme[] {
  const d = procede === undefined ? undefined : NATURE_PROPOSEE_PAR_PROCEDE[procede];
  return d === 'ligne' ? ['ligne', 'plein'] : ['plein', 'ligne'];
}
