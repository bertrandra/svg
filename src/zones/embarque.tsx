// L'editeur pour une page qui n'est pas la notre : une fonction `ouvrir` a appeler depuis du JavaScript
// ordinaire, sans React ni outil de build cote hote. Le composant est celui de la page (`EditeurSvg`),
// monte dans un conteneur a lui ; ses styles viennent avec, cantonnes a sa racine (util/cssPortee.ts)
// pour ne pas se melanger a ceux de l'hote. Le bundle (scripts/embarquer.mjs) pose l'API sur
// `window.EditeurSvg` ; ici, rien ne touche a `window` : on recoit la cible.

import { createRoot } from 'react-dom/client';
import { lireDessin } from '../engine/editionSvg.js';
import { definirBaseAnnexes } from '../io/annexes.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import { estStockage, stockageNavigateur, stockageProtege, type Stockage } from '../io/stockage.js';
import { porterCss, remEnPixels } from '../util/cssPortee.js';
import { editable, EditeurSvg, type Teinte } from './EditeurSvg.js';

/** La racine du composant : l'element que `EditeurSvg` pose lui-meme, et sous lequel tout est cantonne. */
export const RACINE_EDITEUR = '.editeur-svg';

/** Ce que l'hote donne a `ouvrir`. */
export interface OptionsEmbarquees {
  /** Le SVG a retoucher, tel quel. */
  svg: string;
  /** Le titre de la fenetre (par defaut « <nom>.svg »). */
  titre?: string;
  /** Le nom de fichier propose au telechargement, sans extension (par defaut « dessin »). */
  nom?: string;
  /** Les couleurs proposees dans l'inspecteur : un nom et un code #rrggbb. */
  nuancier?: readonly Teinte[];
  /** La bibliotheque de formes : deja chargee, ou « a-charger » (le fichier bibliotheque.js, au premier besoin). */
  bibliotheque?: Bibliotheque | 'a-charger';
  /** Le dossier ou chercher bibliotheque.js et polices.js, relatif a la page de l'hote ou absolu. Par defaut : a cote de la page. */
  baseAnnexes?: string;
  /**
   * Ou garder les versions nommees (cle `svg.versions`). Absent : le `localStorage` de la page de l'hote.
   * `false` ou `null` : rien ne se garde. Ou un objet { lire(cle), ecrire(cle, valeur), retirer(cle) }
   * (du JSON ; il ne doit pas lever, et s'il leve l'editeur le lit comme refuse).
   */
  stockage?: Stockage | false | null;
  /** Fermer l'editeur des que le dessin est enregistre. Vrai par defaut, comme la page. */
  fermerApresEnregistrer?: boolean;
  /** Recoit le SVG retouche, deja passe par `nettoyerSvg`, a chaque « Enregistrer ». */
  onEnregistrer: (svg: string) => void;
  /** Appelee une fois, quand l'editeur se ferme, quelle qu'en soit la cause. */
  onFermer?: () => void;
  /** Recoit le SVG du moment, une seconde apres la derniere modification. */
  onBrouillon?: (svg: string) => void;
}

/** Ce que `ouvrir` rend. */
export interface PoigneeEditeur {
  /** Ferme l'editeur sans rien enregistrer. Sans effet s'il est deja ferme. */
  fermer: () => void;
}

export interface ApiEditeurSvg {
  readonly version: string;
  readonly ouvrir: (options: OptionsEmbarquees) => PoigneeEditeur;
  readonly estEditable: (svg: unknown) => boolean;
}

const estFonction = (v: unknown): boolean => typeof v === 'function';

/** Le premier defaut des options, dit en clair, ou null quand elles sont bonnes. L'hote n'est pas type : on verifie. */
export function verifierOptions(options: unknown): string | null {
  if (typeof options !== 'object' || options === null) return 'ouvrir attend un objet d’options { svg, onEnregistrer, … }.';
  const o = options as Record<string, unknown>;
  if (typeof o.svg !== 'string' || o.svg.trim() === '') return 'L’option « svg » doit être le texte du SVG à retoucher.';
  if (!estFonction(o.onEnregistrer)) return 'L’option « onEnregistrer » est obligatoire : c’est une fonction qui reçoit le SVG retouché.';
  for (const cle of ['onFermer', 'onBrouillon'] as const) if (o[cle] !== undefined && !estFonction(o[cle])) return 'L’option « ' + cle + ' » doit être une fonction.';
  for (const cle of ['titre', 'nom', 'baseAnnexes'] as const) if (o[cle] !== undefined && typeof o[cle] !== 'string') return 'L’option « ' + cle + ' » doit être un texte.';
  if (o.nuancier !== undefined && !Array.isArray(o.nuancier)) return 'L’option « nuancier » doit être une liste de { nom, hex }.';
  if (o.bibliotheque !== undefined && o.bibliotheque !== 'a-charger' && (typeof o.bibliotheque !== 'object' || o.bibliotheque === null)) {
    return 'L’option « bibliotheque » doit être « a-charger » ou la bibliothèque déjà chargée.';
  }
  if (o.stockage !== undefined && o.stockage !== false && o.stockage !== null && !estStockage(o.stockage)) {
    return 'L’option « stockage » doit être false (ou null) pour ne rien garder, ou un objet { lire, ecrire, retirer } de trois fonctions.';
  }
  if (o.fermerApresEnregistrer !== undefined && typeof o.fermerApresEnregistrer !== 'boolean') return 'L’option « fermerApresEnregistrer » doit être vraie ou fausse.';
  return null;
}

/** Vrai quand l'editeur sait ouvrir ce SVG : du texte, sans image enveloppee, et que le moteur sait lire. */
export function estEditable(svg: unknown): boolean {
  return typeof svg === 'string' && editable(svg) && !('erreur' in lireDessin(svg));
}

/** Le stockage voulu par l'hote : celui du navigateur par defaut, aucun pour `false` ou `null`, le sien (protege) sinon. */
export function stockageDe(option: Stockage | false | null | undefined): Stockage | null {
  if (option === undefined) return stockageNavigateur();
  return option === false || option === null ? null : stockageProtege(option);
}

const ID_STYLE = 'editeur-svg-embarque-style';

/** La feuille de l'editeur, posee une fois dans la page de l'hote (au premier `ouvrir`, jamais avant). */
function poserStyle(css: string): void {
  if (document.getElementById(ID_STYLE)) return;
  const s = document.createElement('style');
  s.id = ID_STYLE;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * Les proprietes heritees que l'hote regle volontiers sur `body`. A la racine, on les remet a leur valeur
 * de depart plutot que de poser `all: initial`, qui ferait aussi perdre la langue (`lang`) du document.
 * La police, la taille, l'interligne et la couleur, eux, sont poses par la feuille de l'editeur.
 */
const HERITAGE_REMIS = 'display:block;direction:ltr;writing-mode:horizontal-tb;letter-spacing:normal;word-spacing:normal;text-align:start;text-indent:0;'
  + 'text-transform:none;text-shadow:none;white-space:normal;word-break:normal;overflow-wrap:normal;hyphens:manual;font-style:normal;font-weight:400;'
  + 'font-variant:normal;font-stretch:normal;font-kerning:auto;font-feature-settings:normal;font-size-adjust:none;visibility:visible;pointer-events:auto;'
  + 'cursor:auto;quotes:auto;tab-size:8;color-scheme:normal;accent-color:auto;caret-color:auto';

/**
 * Le bouclier, pose avant toute regle de l'editeur. La racine remet l'heritage de l'hote a zero ;
 * `all: revert` rend a chaque element dedans le style du navigateur, ce qui efface les regles d'element
 * de l'hote (`button { … }`, `h3 { … }`) qu'aucune regle de l'editeur ne recouvre. Le dessin (svg) en est
 * exclu : ses attributs de presentation (`fill="…"`) ont moins de poids qu'une regle d'auteur et
 * seraient effaces. La specificite du bouclier est la plus basse de la feuille : toute regle de l'editeur
 * l'emporte.
 */
const BOUCLIER = RACINE_EDITEUR + '{' + HERITAGE_REMIS + '}' + RACINE_EDITEUR + ' :where(:not(svg,svg *)){all:revert}';

/**
 * L'API pour une feuille de style donnee (celle de scripts/feuilles.mjs, d'un seul tenant), cantonnee a la
 * racine de l'editeur et precedee du bouclier.
 */
export function creerApi(version: string, css: string): ApiEditeurSvg {
  const feuille = BOUCLIER + porterCss(remEnPixels(css), RACINE_EDITEUR);
  let ouvert: PoigneeEditeur | null = null;

  const ouvrir = (options: OptionsEmbarquees): PoigneeEditeur => {
    const defaut = verifierOptions(options);
    if (defaut !== null) throw new TypeError('EditeurSvg.ouvrir : ' + defaut);
    if (ouvert) throw new Error('EditeurSvg.ouvrir : un éditeur est déjà ouvert ; fermez-le d’abord (poignée.fermer()).');
    poserStyle(feuille);
    definirBaseAnnexes(options.baseAnnexes ?? '');
    const conteneur = document.createElement('div');
    document.body.appendChild(conteneur);
    const racine = createRoot(conteneur);
    let ferme = false;
    const fermer = (): void => {
      if (ferme) return;
      ferme = true;
      ouvert = null;
      racine.unmount();
      conteneur.remove();
      options.onFermer?.();
    };
    const nom = options.nom ?? 'dessin';
    const apresEnregistrer = options.fermerApresEnregistrer ?? true;
    const stockage = stockageDe(options.stockage);
    racine.render(
      <EditeurSvg svg={options.svg} titre={options.titre ?? nom + '.svg'} nom={nom} nuancier={options.nuancier ?? []}
        {...(options.bibliotheque === undefined ? {} : { bibliotheque: options.bibliotheque })}
        {...(options.onBrouillon === undefined ? {} : { brouillon: options.onBrouillon })}
        stockage={stockage} fermer={fermer}
        enregistrer={svgPropre => { options.onEnregistrer(svgPropre); if (apresEnregistrer) fermer(); }} />
    );
    ouvert = { fermer };
    return ouvert;
  };

  return Object.freeze({ version, ouvrir, estEditable });
}
