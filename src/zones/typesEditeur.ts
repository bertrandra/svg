// Les types que l'editeur et ses panneaux se partagent. Un module de types seuls : tout le monde
// l'importe (ou le relit par EditeurSvg.tsx) sans jamais creer de cycle a l'execution.

import type { Boite, DessinSvg, Forme, FormeDeBase, Operation, ParametresFormes, PoliceTexte, ReglageEffets, Style, TypeNoeud } from '../engine/editionSvg.js';
import type { Glyphes } from '../engine/texte.js';
import type { Booleen } from '../engine/booleens.js';
import type { Jonction } from '../engine/contours.js';
import type { Focale } from '../engine/navigation.js';
import type { Aimant } from '../engine/transformations.js';
import type { CodeConstat, CodeCorrection, Constat, Couche, ProfilProduction } from '../engine/preparation.js';
import type { ChoixProduction } from '../model/contextes.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import type { Historique } from '../util/historique.js';
import type { Annonce } from './annonces.js';
import type { Version } from './session.js';
import type { RegleZone } from '../engine/selection.js';
import type { Cotes } from '../engine/proportions.js';

/** Une couleur du nuancier propose dans l'inspecteur : un nom et un code #rrggbb en minuscules. */
export interface Teinte { nom: string; hex: string }

/** Les outils qui tracent une forme d'un glisser ou au reticule : les formes de base de la palette (ADR-0033). */
export type OutilForme = FormeDeBase;
/** Les outils qui choisissent par une zone (ADR-0035) : le cadre, commence meme sur une forme, et le lasso. */
export type OutilZone = 'cadre' | 'lasso';
export type Outil = 'selection' | 'points' | 'main' | 'plume' | 'texte' | OutilForme | OutilZone;
export type Coin = 'nw' | 'ne' | 'sw' | 'se';
export type Point = readonly [number, number];
export interface Vue { zoom: number; x: number; y: number }
export type Fond = 'damier' | 'blanc' | 'sombre';
export type Tiroir = 'calques' | 'inspecteur' | null;
/** Ce qui suit « Exporter pour Cricut » dans le panneau : la confirmation tant qu'un point reste a corriger, puis les etapes dans Design Space. */
export type SuiteCricut = 'confirmer' | 'design-space' | null;

/**
 * Le geste de fin, tel que la page ou l'hote le veut : son libelle (« Terminer » dans la page, « Enregistrer » par defaut), s'il
 * ferme l'editeur meme sans modification (la page : on revient a la fiche, rien n'est reecrit), et s'il existe un brouillon a garder
 * (Ctrl+S). L'editeur ne devine pas ou il est : on le lui dit.
 */
export interface OptionsFin {
  readonly libelle: string; readonly fermerSansModification: boolean; readonly brouillon: boolean;
  /** Ctrl+S rend le dessin a l'hote, sans fermer (le site, ADR-0030) ; faux ou absent : Ctrl+S garde un brouillon, comme partout. */
  readonly ctrlSEnregistre?: boolean;
  /** Les gestes que l'hote ajoute au menu Fichier (« Enregistrer sous… » sur le site) ; absents chez tout autre hote. */
  readonly actionsHote?: readonly ActionHote[];
}

/**
 * Le modele de lecture (ADR-0012, annexe 5 §3) : `plat` (defaut de l'API et de l'embarquement, le contrat de l'ADR-0001) ou `riche`
 * (groupes, degrades, decoupes, masques, effets, images). Il ne decide que de la lecture d'un SVG ; un dessin lu s'affiche et
 * s'ecrit selon ce qu'il porte.
 */
export type Modele = 'plat' | 'riche';

/**
 * Le contexte d'edition (ADR-0012, annexe 6 §2) : le groupe ou l'on est entre, et, s'il le faut, sa decoupe ou son masque (paquet 8-D :
 * on en modifie alors le contenu par la lentille, `zones/lentille.ts`) ; la tuile d'un motif (`motif`) reste a faire. Null : la racine.
 * `sous` : dans une decoupe ou un masque, le groupe du contenu ou l'on est entre (absent : la racine du contenu). La prise, le cadre,
 * le lasso et les aimants ne voient que les noeuds de ce niveau ; le reste de la toile est estompe. Un etat d'interface, jamais ecrit
 * ni garde dans l'historique.
 */
export interface ContexteEdition { readonly groupe: string; readonly dans?: 'decoupe' | 'masque' | 'motif'; readonly sous?: string }

/** Ce que l'editeur rend a l'hote avec le SVG (ADR-0030) : le dessin du modele et le contexte choisi, de quoi ecrire un projet. */
export interface EtatRendu { readonly dessin: DessinSvg; readonly production: ChoixProduction }

/**
 * Ce que l'hote dit de l'enregistrement, quand il garde lui-meme des projets (le site, ADR-0030) : enregistre, modifie depuis, en
 * cours, ou en echec, avec la phrase a dire. L'editeur l'affiche dans sa barre et en tire « y a-t-il quelque chose a enregistrer ».
 */
export interface EtatEnregistrement { readonly etat: 'enregistre' | 'modifie' | 'en-cours' | 'echec'; readonly message?: string }

/** Un geste de l'hote dans le menu Fichier : il recoit l'etat du moment (« Enregistrer sous… »). */
export interface ActionHote { readonly id: string; readonly libelle: string; readonly faire: (etat: EtatRendu) => void }

// L'editeur se partage en trois contextes (contexteEditeur.tsx), pour qu'un panneau ne se redessine que
// pour ce qu'il lit : le dessin (ce qu'on voit), l'interface (l'outil et la vue), les actions (les verbes).

/** Le dessin et ce qu'on en tire : l'historique, la selection, le nuancier, les versions, le presse-papiers. */
export interface ModeleDessin {
  h: Historique<DessinSvg>;
  /**
   * Le dessin qu'on edite : celui de l'historique, ou, dans une decoupe ou un masque (paquet 8-D), le dessin de travail que la lentille
   * en tire (`contenuEnDessin`) ; la toile, la prise, la selection, l'inspecteur et les calques le lisent.
   */
  dessin: DessinSvg;
  /** Le dessin complet, celui de l'historique, quand `dessin` est un dessin de travail ; absent : `dessin` (voir `dessinComplet`). */
  complet?: DessinSvg;
  sel: string[];
  /** Les memes identifiants en ensemble : savoir si une forme est choisie sans parcourir toute la selection. */
  choisies: ReadonlySet<string>;
  boite: Boite | null;
  formeSeule: Forme | null;
  nuancier: readonly Teinte[];
  /** Ce que la lecture du SVG ouvert n'a pas repris (voir `lireDessin`) ; vide pour un dessin sans perte. */
  ignores: readonly string[];
  bibliotheque: Bibliotheque | 'a-charger' | null;
  versions: readonly Version[];
  presse: readonly Forme[];
  /** Le jugement du dessin pour la machine du contexte (ADR-0013) ; null en Generique, ou avant la premiere analyse. */
  preparation: EtatPreparation | null;
}

/** Ce que le panneau « Pret pour Cricut » montre : les constats d'un dessin pour un profil, ses couches et sa taille finale. */
export interface EtatPreparation {
  readonly profil: ProfilProduction;
  /** Le dessin juge : le panneau suit le dessin d'un instant de retard, pour ne pas mesurer pendant un geste. */
  readonly dessin: DessinSvg;
  readonly constats: readonly Constat[];
  readonly couches: readonly Couche[];
  readonly taille: { readonly l: number; readonly h: number } | null;
}

/** L'outil, la vue et ce qui n'est que d'affichage : rien de ce qui s'ecrit dans le SVG. */
export interface EtatInterface {
  outil: Outil;
  point: number | null;
  style: Style;
  /** Les reglages des formes a tracer (cotes, branches, rayon des coins…) : une donnee de la session, jamais ecrite (ADR-0033). */
  parametres: ParametresFormes;
  /** Croit a chaque demande d'ouvrir la palette des formes au clavier (F) : le bouton « Formes » l'ouvre alors. */
  demandeFormes: number;
  trace: readonly Point[];
  grille: boolean;
  aimants: boolean;
  /** Les booleens rebatissent en courbes les contours qui l'etaient (defaut : oui) ; sinon ils rendent des segments droits. */
  lisserBooleens: boolean;
  guides: readonly Aimant[];
  tiroir: Tiroir;
  contours: boolean;
  fond: Fond;
  pas: number;
  /** La valeur aimantee a la grille quand elle est active, telle quelle sinon. */
  aimant: (v: number) => number;
  vues: Vues;
  /** Le dernier message de la barre d'etat (vide : l'etat par defaut de l'outil). */
  message: string;
  /** La confirmation « Abandonner les modifications » est affichee. */
  quitter: boolean;
  /** Le reticule du clavier d'un outil de trace (null : pas encore deplace aux fleches). */
  curseur: Point | null;
  /** Le curseur de la selection au clavier (Maj+Page suivante, Espace), valable tant que la selection n'a pas change. */
  focale: Focale | null;
  /** La derniere phrase a dire aux lecteurs d'ecran (region unique, voir RegionVocale.tsx). */
  annonce: Annonce;
  /** Le contexte de production choisi dans la barre (ADR-0013) : il s'ecrit dans le SVG, mais n'est pas dans l'historique. */
  production: ChoixProduction;
  /** Son profil resolu ; null en Generique. */
  profil: ProfilProduction | null;
  /** Le contexte a change depuis l'ouverture : il y a quelque chose a enregistrer meme sans modification du dessin. */
  productionModifiee: boolean;
  /** La confirmation d'un export Cricut avec des points a corriger, ou la carte « Dans Design Space » apres l'export. */
  suiteCricut: SuiteCricut;
  /**
   * L'apercu de la machine (ADR-0028) : en contexte Cricut, la toile montre ce que la lame detache (hachure) et ce que le stylo trace
   * (un trait). Un reglage de vue, jamais ecrit ; vrai par defaut, sans effet hors d'un contexte qui coupe ou ecrit.
   */
  apercuMachine: boolean;
  /** Le geste de fin (libelle, fermeture sans modification, brouillon) : une donnee de la page ou de l'hote, constante. */
  fin: OptionsFin;
  /** L'etat de l'enregistrement que l'hote annonce (le site, ADR-0030) ; absent ou null chez un hote qui ne le dit pas. */
  enregistrement?: EtatEnregistrement | null;
  /** Ce que le cadre et le lasso prennent (ADR-0035) : les formes touchees (defaut) ou entierement dedans. Un reglage de la session. */
  regleZone: RegleZone;
  /**
   * « Conserver les proportions » : redimensionner garde la proportion de la selection (le coin, Maj l'inversant le temps du geste ;
   * les champs L et H ; Alt et fleches). Un reglage de la session, coupe a l'ouverture ; sans effet sur une ligne (un cote nul).
   */
  verrouProportions: boolean;
  /** Le modele de lecture du moment : celui de l'hote, ou le reglage du menu Edition (garde par le stockage injecte). */
  modele: Modele;
  /** L'hote a fixe le modele (`modele` donne a l'editeur) : le reglage du menu Edition ne se montre pas. */
  modeleFixe: boolean;
  /** Le contexte d'edition, ou null (la racine) ; toujours un groupe qui existe dans le dessin du moment. */
  contexte: ContexteEdition | null;
  /** Les groupes deplies dans la liste des calques (annexe 6 §1) : un etat d'interface, par editeur. */
  deplies: ReadonlySet<string>;
}

/**
 * Les verbes de l'editeur. Ce contexte ne change jamais d'identite : chaque verbe lit l'etat du moment
 * au moment de l'appel (une reference mise a jour a chaque rendu), jamais celui du rendu qui l'a cree.
 */
export interface ActionsEditeur {
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void;
  /** Donne aux verbes les glyphes des polices chargees (ADR-0031) : un texte pose se recompose quand sa forme change. */
  poserGlyphes: (g: ((p: PoliceTexte) => Glyphes | null) | null) => void;
  faire: (f: (d: DessinSvg) => DessinSvg, texte?: string) => void;
  finir: () => void;
  annulerGeste: (cle: string) => void;
  defaire: () => void;
  refaire: () => void;
  nouvelleCle: () => string;
  dire: (t: string) => void;
  choisir: (ids: string[]) => void;
  poserPoint: (i: number | null) => void;
  poserOutil: (o: Outil) => void;
  poserStyle: (s: Style) => void;
  /** Change des reglages des formes a tracer, ramenes dans leurs bornes. */
  poserParametres: (p: Partial<ParametresFormes>) => void;
  /** Ouvre la palette des formes de la barre (le raccourci F), le focus sur la forme courante. */
  ouvrirFormes: () => void;
  poserTrace: (t: readonly Point[]) => void;
  poserGrille: (g: boolean) => void;
  poserAimants: (a: boolean) => void;
  poserLisserBooleens: (l: boolean) => void;
  poserGuides: (g: readonly Aimant[]) => void;
  poserTiroir: (t: Tiroir) => void;
  poserCurseur: (p: Point | null) => void;
  poserFocale: (f: Focale | null) => void;
  /** Dit une phrase aux lecteurs d'ecran sans l'afficher dans la barre d'etat. */
  annoncer: (t: string) => void;
  poserContours: (f: boolean | ((c: boolean) => boolean)) => void;
  poserFond: (f: Fond) => void;
  /** Ferme l'editeur, apres confirmation s'il y a des modifications. */
  demanderFermeture: () => void;
  /** Ferme l'editeur sans rien demander (la confirmation « Abandonner »). */
  fermer: () => void;
  /** Le bouton de fin : rend le dessin s'il a change, ferme sans rien reecrire si la page le veut, sinon dit pourquoi il n'y a rien a faire. */
  terminer: () => void;
  /** La confirmation d'abandon, troisieme choix : rendre le dessin, puis fermer (jamais fermer si le dessin n'a pas pu etre rendu). */
  enregistrerEtFermer: () => void;
  /** Ctrl+S : garde le brouillon du moment, sans fermer, et le dit. */
  garderBrouillon: () => void;
  /** « Ajuster » : le tapis entier en contexte de decoupe Cricut (le dessin dedans), le dessin sinon. */
  ajuster: () => void;
  /** « Ajuster au dessin » : le dessin seul, quel que soit le contexte. */
  ajusterAuDessin: () => void;
  /** Referme la confirmation et reprend l'edition. */
  continuerEdition: () => void;
  garderVersion: (nom: string, svg: string) => void;
  supprimerVersion: (id: string) => void;
  finirTrace: (fermer: boolean) => void;
  supprimerSelection: () => void;
  dupliquerSelection: () => void;
  copierSelection: () => void;
  couperSelection: () => void;
  collerPresse: () => void;
  combinerSelection: () => void;
  separerSelection: () => void;
  masquerSelection: () => void;
  verrouillerSelection: () => void;
  /** Choisit toutes les formes de la couleur de la premiere forme choisie (son remplissage, ou son contour sans remplissage). */
  choisirMemeCouleur: () => void;
  zoomerSelection: () => void;
  /** Rend le dessin nettoye a `enregistrer` ; faux quand il n'y a rien a rendre (aucune forme visible), et l'editeur l'a dit. */
  enregistrerTout: () => boolean;
  /** Insere une forme au centre ; `origine` (`game-icons:<id>`) la credite : elle fera ecrire la mention CC BY 3.0 (engine/edition/provenance.ts). */
  insererForme: (svgForme: string, origine?: string) => void;
  insererPlusieurs: (svgs: readonly { svg: string; x: number; y: number; taille: number; origine?: string }[]) => void;
  /** Unit, soustrait, croise ou exclut les formes choisies ; vrai quand le resultat a remplace les formes. */
  booleen: (op: Booleen) => boolean;
  transformerNumerique: (t: { rotation?: number; inclinaisonX?: number; inclinaisonY?: number; echelle?: number }) => void;
  /** Le contour des formes choisies devient une forme pleine (couleur du trait en fond). */
  contourEnForme: () => void;
  /** Decale le contour des formes choisies : positif vers l'exterieur, negatif vers l'interieur. */
  decalerContour: (distance: number, jonction: Jonction) => void;
  /** Hachure les formes pleines choisies a l'angle donne, a la largeur du stylo (ADR-0022) : des lignes, plus de fond. */
  hachurer: (angle: number) => void;
  /** Arrondit les angles des formes choisies au rayon donne, ramene la ou les segments sont trop courts. */
  arrondirAngles: (rayon: number) => void;
  /** Change le type du point actif (outil points) : angle, lisse ou symetrique. */
  convertirNoeud: (type: TypeNoeud) => void;
  /** Casse le tracé au point actif. */
  casserNoeud: () => void;
  /** Joint deux tracés ouverts par leurs bouts, ou ferme un tracé ouvert. */
  joindreSelection: () => void;
  /** Retire le point actif sans changer la courbe, ou dit pourquoi c'est impossible. */
  supprimerNoeudFidele: () => void;
  /** Inverse le sens du tracé des formes choisies. */
  inverserSens: () => void;
  /** Change le contexte de production (barre) ; un choix incoherent est ramene au plus proche valide, et dit. */
  poserProduction: (c: ChoixProduction) => void;
  /** Applique la correction d'un constat du panneau, rejuge sur le dessin du moment : une entree d'historique. */
  corrigerConstat: (code: CodeConstat, correction?: CodeCorrection) => void;
  /**
   * Exporte pour la machine du contexte : le SVG de decoupe, ou l'archive Print Then Cut. Tant qu'un constat « à corriger » reste,
   * l'export attend une confirmation dans le panneau (`quandMeme` la donne) ; un constat bloquant le refuse.
   */
  exporterPourCricut: (nom: string, quandMeme?: boolean) => void;
  /** Referme la confirmation de l'export ou la carte « Dans Design Space ». */
  fermerSuiteCricut: () => void;
  /**
   * Couper ou ecrire (ADR-0028) : pose l'operation sur les formes nommees, ou sur la selection ; une entree d'historique, dite a voix
   * haute. Hors d'un contexte Cricut qui coupe ou ecrit, ne change rien et le dit.
   */
  poserOperation: (operation: Operation, ids?: readonly string[]) => void;
  /** Montre ou retire l'apercu de la machine sur la toile, et le dit. */
  poserApercuMachine: (a: boolean | ((a: boolean) => boolean)) => void;
  /** Ce que le cadre et le lasso prennent (ADR-0035), et le dit. */
  poserRegleZone: (r: RegleZone) => void;
  /** Pose ou coupe « Conserver les proportions », et le dit ; pose, la proportion de la selection du moment devient la reference. */
  poserVerrouProportions: (v: boolean) => void;
  /**
   * La proportion a garder pour ces formes et leur boite : la reference du verrou (prise quand il a ete pose, ou quand la selection
   * ou sa proportion ont change ; voir engine/proportions.ts), ou null quand le verrou est coupe ou que la boite n'a pas de proportion.
   */
  proportionsDe: (ids: readonly string[], b: Boite | null) => Cotes | null;
  /** Change le reglage du modele (menu Edition), le garde dans le stockage injecte et le dit ; sans effet si l'hote l'a fixe. */
  poserModele: (m: Modele) => void;
  /** Pose le contexte d'edition tel quel (null : la racine) ; un groupe qui n'existe pas fait revenir a la racine. */
  poserContexte: (c: ContexteEdition | null) => void;
  /**
   * Pose le niveau ou l'on edite, dans le dessin qu'on voit : un groupe, ou la racine (null). Hors d'une lentille, c'est
   * `poserContexte({ groupe })` ; dans une decoupe ou un masque, le niveau est un groupe du contenu, et l'on y reste.
   */
  poserNiveau: (groupe: string | null) => void;
  /**
   * « Modifier la découpe », « Modifier le masque » (paquet 8-D) : le contenu de `groupe` (ou du groupe choisi, de celui qui contient
   * la selection, de celui du contexte) se modifie sur place ; son premier element est choisi, et c'est dit. Faux, et la raison dite, sinon.
   */
  modifierContenu: (genre: 'decoupe' | 'masque', groupe?: string) => boolean;
  /** Entre dans un groupe : il devient le contexte, la selection se vide, et c'est dit. Faux si ce n'est pas un groupe du dessin. */
  entrerGroupe: (id: string) => boolean;
  /** Sort d'un niveau : le parent du contexte devient le contexte, le groupe quitte est choisi, et c'est dit. Faux a la racine. */
  sortirGroupe: () => boolean;
  /** Deplie (vrai) ou replie (faux) ces groupes dans la liste des calques. */
  deplier: (ids: readonly string[], deplie: boolean) => void;
  /** Groupe les noeuds choisis sous un groupe nouveau, qui devient la selection, et le dit (modele riche, Ctrl+G). */
  grouper: () => void;
  /** Defait les groupes choisis : leurs enfants remontent et deviennent la selection, et c'est dit (modele riche, Ctrl+Maj+G). */
  degrouper: () => void;
  /** La forme du dessus de la selection decoupe les autres, reunies dans un groupe nouveau choisi ; c'est dit (modele riche, ADR-0012 etape 8). */
  creerDecoupe: () => void;
  /** Libere la decoupe du groupe choisi (ou qui contient la selection) : la forme revient, choisie, dans le groupe devenu le contexte. */
  libererDecoupe: () => void;
  /** L'element du dessus de la selection masque les autres, reunis dans un groupe nouveau choisi ; c'est dit. */
  creerMasque: () => void;
  /** Inverse le masque du groupe choisi (ou qui contient la selection), et le dit. */
  inverserMasque: () => void;
  /** Libere le masque du groupe choisi : son contenu revient, choisi, dans le groupe devenu le contexte. */
  libererMasque: () => void;
  /** Pose un reglage d'effets sur la selection ; `cle` fond un geste continu (un curseur, une frappe) en une entree d'historique. */
  poserEffets: (r: ReglageEffets, cle?: string | null) => void;
  /** Insere une image (`data:` base64) au centre de la vue, dans le groupe du contexte ; vrai si elle l'a ete, sinon le refus est dit. */
  insererImage: (donnees: string) => boolean;
}

export interface Vues {
  vue: Vue; poserVue: (v: Vue | ((v: Vue) => Vue)) => void; ajuster: () => void; zoomer: (f: number, cx?: number, cy?: number) => void; centrer100: () => void;
  /** Cadre une boite du plan (x, y, largeur, hauteur) a l'ecran, comme « Ajuster » cadre le dessin. */
  cadrer: (b: { readonly x: number; readonly y: number; readonly l: number; readonly h: number }) => void;
}
