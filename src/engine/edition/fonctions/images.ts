// Les images integrees du modele v2 (ADR-0012, annexe 4 partie C, etape 12) : une <image> devient une FEUILLE, dont `d` est le
// rectangle dans le plan (boite, selection, deplacement, alignement marchent sans code), `remplissage` et `contour` null, et dont
// `image` garde les donnees, le cadre (x, y, l, h, dans le repere de l'element), la matrice composee et `preserveAspectRatio`.
//
// Seule une adresse `data:image/(png|jpeg|gif|webp);base64,…` se lit, et ses OCTETS decident (natureOctets.ts, ADR-0036) : une
// « image » qui est un SVG est refusee (une image ne doit jamais porter de script ni de recursion), une adresse exterieure aussi
// (pixel espion, requete a l'ouverture : ADR-0014). Bornes : 4 Mo par image, 16 Mo par dessin, 64 millions de pixels lus dans
// l'en-tete (dimensionsImage.ts), pour que la bombe de decompression n'atteigne jamais le decodeur du navigateur. Un type annonce
// qui ment sur un format admis (un JPEG annonce PNG) est corrige d'apres les octets, et dit.
//
// L'ecriture est l'element entier, `xlink:href` (les outils anciens ne lisent que lui) : memes entrees, memes octets. Une matrice
// qui, une fois arrondie, n'est qu'une translation et une echelle positive (uniforme, ou quelconque sous `none`) se plie dans le
// cadre : deplacer une image change son x et son y, comme on l'attend en ouvrant le fichier ailleurs.

import type { Chemin, Forme, ImageIntegree, Matrice } from '../types.js';
import { IDENTITE } from '../types.js';
import { facteur, multiplier, transformerChemin } from '../geometrie.js';
import { nb } from '../chemins.js';
import { longueurUse } from '../clones.js';
import { COORDONNEE_MAX, coordonneeSaine } from '../limites.js';
import { completerFeuille, type Fonctionnalite, type LecteurElement } from '../fonctionnalites.js';
import type { Parcours } from '../parcours.js';
import { natureDesOctets } from '../../natureOctets.js';
import { decoderBase64, dimensionsImage, octetsBase64, type NatureImageIntegree } from '../dimensionsImage.js';
import { nombre, t } from '../../../util/i18n.js';

// ---------------------------------------------------------------- bornes (annexe 5 §2, question 7 de l'annexe 9)

/** Une image : 4 Mo d'octets decodes. */
export const IMAGE_OCTETS_MAX = 4 * 1024 * 1024;
/** Toutes les images d'un dessin : 16 Mo (une image clonee par <use> compte a chaque clone). */
export const IMAGES_OCTETS_MAX = 16 * 1024 * 1024;
/** Les pixels annonces par l'en-tete : 64 millions (8 000 x 8 000). */
export const IMAGE_PIXELS_MAX = 64_000_000;

// ---------------------------------------------------------------- phrases

// Les constantes de messages sont des cles : evaluees au chargement, avant que la langue de l'interface soit posee, elles valent
// leur phrase francaise ; `t(MSG_X)` au point d'usage les traduit (t rend telle quelle une phrase deja traduite), et un hote ou un
// test qui lisent la constante lisent le francais.
export const MSG_IMAGE_EXTERIEURE = t('une image qui renvoie à un fichier ou une adresse extérieurs');
export const MSG_IMAGE_SVG = t('une image SVG imbriquée (une image ne peut pas être elle-même un SVG)');
export const MSG_IMAGE_PAS_BASE64 = t('une image dont les données ne sont pas en base64');
export const MSG_IMAGE_ILLISIBLE = t('une image illisible (données base64 abîmées)');
export const MSG_IMAGE_CONTENU = t('une image dont le contenu n’est ni un PNG, ni un JPEG, ni un GIF, ni un WebP');
export const MSG_IMAGE_ENTETE = t('une image dont l’en-tête ne donne pas les dimensions');
export const MSG_IMAGE_LOURDE = t('une image trop grande (plus de 4 Mo)');
export const MSG_IMAGES_LOURDES = t('des images trop lourdes (plus de 16 Mo en tout, clones compris)');
export const MSG_IMAGE_UNITE = t('une image dont une longueur (x, y, width, height) n’est ni un nombre, ni des pixels, ni un pourcentage');
export const MSG_IMAGE_PETITE = t('une image trop petite pour s’écrire (moins d’un millième d’unité de côté)');
export const MSG_POINTS_IMAGE = t('Les points d’une image ne se modifient pas : déplacez-la, tournez-la ou redimensionnez-la, ou vectorisez-la pour obtenir des formes.');

/** Des coordonnees hors bornes, le nombre formate dans la langue au moment du refus. */
const msgCoordonnees = (): string => t('des coordonnées démesurées (au-delà de ± {max})', { max: nombre(COORDONNEE_MAX) });

const NOMS: Readonly<Record<NatureImageIntegree, string>> = { png: 'PNG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP' };

/** Une image d'un type que l'editeur ne garde pas ; le type n'est repris que s'il a la forme d'un type MIME. */
export const msgImageType = (mime: string): string =>
  /^[a-z0-9.+-]{1,40}\/[a-z0-9.+-]{1,40}$/.test(mime)
    ? t('une image d’un type que l’éditeur ne garde pas (« {type} » ; PNG, JPEG, GIF ou WebP seulement)', { type: mime })
    : t('une image d’un type que l’éditeur ne garde pas ( ; PNG, JPEG, GIF ou WebP seulement)');

export const msgImagePixels = (l: number, h: number): string =>
  t('une image trop grande ({l} × {h} pixels, plus de 64 millions)', { l: nombre(l), h: nombre(h) });

export const msgTypeCorrige = (annonce: NatureImageIntegree, lu: NatureImageIntegree): string =>
  t('le type annoncé d’une image ({annonce}) ne correspondait pas à son contenu ({lu}) : il est corrigé', { annonce: NOMS[annonce], lu: NOMS[lu] });

// ---------------------------------------------------------------- les donnees

const TYPES_ANNONCES: Readonly<Record<string, NatureImageIntegree>> = {
  'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/pjpeg': 'jpeg', 'image/gif': 'gif', 'image/webp': 'webp'
};
/** La forme exacte de donnees ecrites : le type d'apres les octets, le base64 sans blanc. */
export const DONNEES_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
/** Au-dela, le texte de l'adresse n'est meme pas examine : deux fois le base64 de la borne laisse la place aux retours a la ligne. */
const ADRESSE_MAX = 2 * Math.ceil(IMAGE_OCTETS_MAX / 3) * 4 + 256;

export interface DonneesVerifiees {
  /** `data:image/<nature>;base64,<base64 sans blanc>`. */
  readonly donnees: string;
  readonly nature: NatureImageIntegree;
  /** Le type annonce, quand il differait des octets (un format admis, corrige). */
  readonly annonce?: NatureImageIntegree;
  /** Dimensions en pixels, lues dans l'en-tete. */
  readonly l: number;
  readonly h: number;
  readonly octets: number;
}

/**
 * Les donnees d'une image, verifiees sur leurs octets : une adresse `data:` en base64 d'un PNG, JPEG, GIF ou WebP, dans les bornes ;
 * sinon la phrase du refus. Sert a la lecture d'un SVG et a celle d'un projet (qui ne se croit pas sur parole non plus). Ne leve jamais.
 */
export function verifierDonneesImage(adresse: string): DonneesVerifiees | { readonly refus: string } {
  if (adresse.length > ADRESSE_MAX) return /^\s*data:/i.test(adresse.slice(0, 64)) ? { refus: t(MSG_IMAGE_LOURDE) } : { refus: t(MSG_IMAGE_EXTERIEURE) };
  const texte = adresse.trim();
  if (!/^data:/i.test(texte)) return { refus: t(MSG_IMAGE_EXTERIEURE) };
  const virgule = texte.indexOf(',');
  if (virgule < 0 || virgule > 200) return { refus: t(MSG_IMAGE_ILLISIBLE) };
  const parties = texte.slice(5, virgule).toLowerCase().split(';').map(x => x.trim());
  const mime = parties[0] ?? '';
  if (mime === 'image/svg+xml') return { refus: t(MSG_IMAGE_SVG) };
  const annonce = TYPES_ANNONCES[mime];
  if (!annonce) return { refus: msgImageType(mime) };
  if (parties.length < 2 || parties[parties.length - 1] !== 'base64') return { refus: t(MSG_IMAGE_PAS_BASE64) };
  const b64 = texte.slice(virgule + 1).replace(/[\t\n\f\r ]+/g, '');
  if (octetsBase64(b64) > IMAGE_OCTETS_MAX) return { refus: t(MSG_IMAGE_LOURDE) };
  const octets = decoderBase64(b64);
  if (!octets) return { refus: t(MSG_IMAGE_ILLISIBLE) };
  const dim = dimensionsImage(octets);
  if (!dim) {
    const nature = natureDesOctets(octets);
    if (nature === 'svg') return { refus: t(MSG_IMAGE_SVG) };
    return { refus: nature === 'png' || nature === 'jpeg' || nature === 'gif' || nature === 'webp' ? t(MSG_IMAGE_ENTETE) : t(MSG_IMAGE_CONTENU) };
  }
  if (dim.l * dim.h > IMAGE_PIXELS_MAX) return { refus: msgImagePixels(dim.l, dim.h) };
  return {
    donnees: 'data:image/' + dim.nature + ';base64,' + b64, nature: dim.nature, ...(annonce !== dim.nature ? { annonce } : {}),
    l: dim.l, h: dim.h, octets: octets.length
  };
}

// ---------------------------------------------------------------- geometrie

const estIdentite = (m: Matrice): boolean => m.every((v, i) => v === IDENTITE[i]);

/** Le rectangle d'une image dans le plan : son cadre, pose par sa matrice. C'est le `d` de sa feuille. */
export function rectangleImage(img: ImageIntegree): Chemin {
  const { x, y, l, h } = img;
  const cadre: Chemin = [{ c: 'M', p: [x, y] }, { c: 'L', p: [x + l, y] }, { c: 'L', p: [x + l, y + h] }, { c: 'L', p: [x, y + h] }, { c: 'Z', p: [] }];
  return img.matrice ? transformerChemin(cadre, img.matrice) : cadre;
}

const ALIGNEMENTS = new Set(['none', 'xMinYMin', 'xMidYMin', 'xMaxYMin', 'xMinYMid', 'xMidYMid', 'xMaxYMid', 'xMinYMax', 'xMidYMax', 'xMaxYMax']);
/** La forme exacte d'un `preserveAspectRatio` ecrit (le defaut, « xMidYMid meet », ne s'ecrit pas). */
export const ASPECT_IMAGE = /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max))(?: slice)?$/;

/**
 * `preserveAspectRatio` ramene a sa forme courte (« meet » est le defaut, « defer » ne vaut que pour une image SVG) ; absent pour le
 * defaut, et pour une valeur fautive, que le navigateur lit aussi comme le defaut.
 */
export function lireAspectImage(v: string | undefined): string | undefined {
  const mots = (v ?? '').trim().split(/\s+/).filter(Boolean);
  if (mots[0] === 'defer') mots.shift();
  const [align, mode, reste] = mots;
  if (align === undefined || reste !== undefined || !ALIGNEMENTS.has(align) || (mode !== undefined && mode !== 'meet' && mode !== 'slice')) return undefined;
  const court = align + (mode === 'slice' ? ' slice' : '');
  return court === 'xMidYMid' ? undefined : court;
}

/** Vrai quand la feuille admet l'edition de ses points : une image non (annexe 3 §2, « refuse, dit » par MSG_POINTS_IMAGE). */
export const dessinableEnPoints = (f: Forme): boolean => f.image === undefined;

// ---------------------------------------------------------------- lecture

const totaux = new WeakMap<Parcours, number>();

const lireImage: LecteurElement = (n, pret, marche) => {
  const p = marche.parcours;
  if ((pret.heritees.visibility ?? '').trim() === 'hidden') return;
  // SVG 2 : `href` l'emporte sur `xlink:href`. Le nettoyage retire toute adresse qui n'est pas une image en ligne : une image venue
  // d'ailleurs arrive donc ici sans adresse, et se refuse avec la meme phrase.
  const adresse = n.attributs.href ?? n.attributs['xlink:href'] ?? '';
  if (adresse.trim() === '') { marche.refuser(t(MSG_IMAGE_EXTERIEURE)); return; }
  const v = verifierDonneesImage(adresse);
  if ('refus' in v) { marche.refuser(v.refus); return; }
  const total = (totaux.get(p) ?? 0) + v.octets;
  totaux.set(p, total);
  if (total > IMAGES_OCTETS_MAX) { marche.refuser(t(MSG_IMAGES_LOURDES)); return; }
  const [, , lp, hp] = p.plan;
  const x = longueurUse(n.attributs.x, lp, 0), y = longueurUse(n.attributs.y, hp, 0);
  // Une largeur ou une hauteur absente (ou « auto », SVG 2) prend la taille de l'image, ou la proportion de l'autre.
  const auto = (a: string | undefined): boolean => a === undefined || a.trim() === '' || a.trim() === 'auto';
  const lu = auto(n.attributs.width) ? null : longueurUse(n.attributs.width, lp, 0), hu = auto(n.attributs.height) ? null : longueurUse(n.attributs.height, hp, 0);
  if (x === 'unite' || y === 'unite' || lu === 'unite' || hu === 'unite') { marche.refuser(t(MSG_IMAGE_UNITE)); return; }
  const l = lu ? lu.v : hu ? (hu.v * v.l) / v.h : v.l, h = hu ? hu.v : lu ? (lu.v * v.h) / v.l : v.h;
  const m = pret.m;
  // Une largeur ou une hauteur nulle ou negative, ou une matrice qui ecrase le plan : le navigateur ne dessine rien, rien ne se perd.
  if (!(l > 0 && h > 0) || Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-12) return;
  if (![x.v, y.v, l, h].every(coordonneeSaine)) { marche.refuser(msgCoordonnees()); return; }
  if (l < 0.0005 || h < 0.0005) { marche.ignorer(t(MSG_IMAGE_PETITE)); return; }
  if (v.annonce) marche.ignorer(msgTypeCorrige(v.annonce, v.nature));
  const aspect = lireAspectImage(n.attributs.preserveAspectRatio);
  const image: ImageIntegree = { donnees: v.donnees, x: x.v, y: y.v, l, h, ...(estIdentite(m) ? {} : { matrice: m }), ...(aspect ? { aspect } : {}) };
  const d = rectangleImage(image);
  if (!d.every(c => c.p.every(coordonneeSaine)) || !Number.isFinite(facteur(m))) { marche.refuser(msgCoordonnees()); return; }
  const forme: Forme = {
    id: 'f' + (p.formes.length + 1), d, remplissage: null, contour: null, epaisseur: 0, opacite: pret.opacite, regle: 'nonzero', visible: true, verrouille: false, image,
    // Dans un groupe du mode riche (etape 1), l'image en est une feuille, comme une forme posee par la marche.
    ...(pret.parent !== undefined ? { parent: pret.parent } : {})
  };
  p.formes.push(completerFeuille(p.fonctions ?? [], forme, n, pret, marche));
};

// ---------------------------------------------------------------- ecriture

/** Une matrice arrondie qui n'est qu'une translation et une echelle positive, que le cadre peut porter sans changer le dessin. */
function pliable(r: readonly number[], img: ImageIntegree, precision: number): boolean {
  const [a = 0, b = 0, c = 0, d = 0] = r;
  return b === 0 && c === 0 && a > 0 && d > 0 && (a === d || img.aspect === 'none') && Number(nb(a * img.l, precision)) > 0 && Number(nb(d * img.h, precision)) > 0;
}

/**
 * L'element <image> d'une feuille, ou null pour une autre feuille. Des donnees, un cadre ou un aspect qui ne sont pas de la forme que
 * la lecture produit (un dessin construit par un appelant) ne s'ecrivent pas : rien plutot qu'un attribut libre.
 */
export function ecrireImage(f: Forme, precision: number): string | null {
  const img = f.image;
  if (!img) return null;
  if (!DONNEES_IMAGE.test(img.donnees) || (img.aspect !== undefined && !ASPECT_IMAGE.test(img.aspect))) return '';
  let { x, y, l, h } = img, transform = '';
  if (img.matrice) {
    // Six decimales pour les parts lineaires (une rotation reste une rotation), la precision du plan pour la translation.
    const textes = img.matrice.map((v, i) => nb(v, i < 4 ? 6 : precision)), r = textes.map(Number);
    if (pliable(r, img, precision)) {
      const [a = 1, , , d = 1, e = 0, g = 0] = r;
      x = a * x + e; y = d * y + g; l = a * l; h = d * h;
    } else transform = ' transform="matrix(' + textes.join(' ') + ')"';
  }
  if (![x, y, l, h, f.opacite].every(Number.isFinite)) return '';
  return '<image xlink:href="' + img.donnees + '" x="' + nb(x, precision) + '" y="' + nb(y, precision) + '" width="' + nb(l, precision) + '" height="' + nb(h, precision) + '"'
    + transform + (img.aspect ? ' preserveAspectRatio="' + img.aspect + '"' : '') + (f.opacite < 1 ? ' opacity="' + nb(f.opacite, 3) + '"' : '') + '/>';
}

// ---------------------------------------------------------------- transformation

/** L'image suit la transformation de sa feuille : sa matrice se compose, et `d` redevient exactement son rectangle. */
export function transformerImage(f: Forme, m: Matrice): Forme {
  if (!f.image) return f;
  const { matrice: _ancienne, ...reste } = f.image;
  void _ancienne;
  const composee = multiplier(m, f.image.matrice ?? IDENTITE);
  const image: ImageIntegree = estIdentite(composee) ? reste : { ...reste, matrice: composee };
  return { ...f, d: rectangleImage(image), image };
}

// ---------------------------------------------------------------- la fonctionnalite

export const images: Fonctionnalite = {
  nom: 'images',
  lecture: { elements: { image: lireImage } },
  ecriture: { elementFeuille: (f, e) => ecrireImage(f, e.precision) },
  transformation: { feuille: transformerImage }
};
