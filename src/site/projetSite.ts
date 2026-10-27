// Ce que le site (ADR-0030) fait entre l'editeur et le serveur : composer le projet a enregistrer depuis l'etat que l'editeur rend,
// dire si le travail est enregistre, ouvrir un SVG comme un projet neuf. L'editeur n'en sait rien : il rend un dessin, le site en
// fait un projet.

import { lireDessin, type DessinSvg } from '../engine/editionSvg.js';
import { choixDeMarque } from '../engine/preparation.js';
import { etatDuProjet, policesDeposeesDu, projetDe, type EtatProjet } from '../engine/projet.js';
import { BORNES_PROJET, type ImageProjet, type PoliceProjet, type Projet, type TeinteProjet, type TypeImage } from '../model/projet.js';
import type { ChoixProduction } from '../model/contextes.js';
import { octetsDeposee, retenirFonteDuProjet } from '../io/polices.js';
import { contientTexte, lettresDuSvg } from '../io/texteSvg.js';
import { nettoyerSvgNomme } from '../util/svg.js';
import { t } from '../util/i18n.js';
import type { EtatRendu } from '../zones/EditeurSvg.js';

/** Le travail ouvert dans l'editeur : ce qu'il faut pour l'enregistrer, et ou (un projet neuf n'a ni identifiant ni revision). */
export interface TravailOuvert {
  readonly id: string | null;
  readonly revision: number | null;
  readonly nom: string;
  readonly dessin: DessinSvg;
  readonly production: ChoixProduction;
  readonly nuancier: readonly TeinteProjet[];
  /** Les fontes deposees connues du projet (relues a l'ouverture) : gardees tant qu'un texte les emploie. */
  readonly polices: readonly PoliceProjet[];
  readonly images: readonly ImageProjet[];
  readonly creeLe?: string | undefined;
  readonly modifieLe?: string | undefined;
  /** Ce que la lecture d'un SVG d'origine a laisse tomber, dit a l'ouverture. */
  readonly ignores?: readonly string[] | undefined;
}

const base64 = (o: Uint8Array): string => {
  let t = '';
  for (let i = 0; i < o.length; i += 0x8000) t += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(t);
};

const octetsDe64 = (b: string): Uint8Array => {
  const bin = atob(b), o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return o;
};

/** Le nom de famille qu'un texte du dessin garde pour cette fonte (de quoi dire « Police absente : … » sans elle). */
function familleDe(dessin: DessinSvg, id: string): string {
  for (const f of dessin.formes) if (f.texte?.police.id === id) return f.texte.police.famille ?? id;
  return id;
}

/**
 * Les fontes deposees qu'emploient les textes du dessin, incluses dans le projet : les octets de la session d'abord (la fonte deposee
 * tout a l'heure), sinon ceux que le projet portait deja. Une fonte qu'on n'a plus du tout (ni l'un ni l'autre) ne s'invente pas :
 * le texte garde ses contours et dira « Police absente » a la reouverture.
 */
export function policesPourProjet(dessin: DessinSvg, connues: readonly PoliceProjet[]): PoliceProjet[] {
  const sortie: PoliceProjet[] = [];
  for (const id of policesDeposeesDu(dessin)) {
    const octets = octetsDeposee(id);
    const deja = connues.find(p => p.id === id);
    if (octets) sortie.push({ id, famille: (deja?.famille ?? familleDe(dessin, id)).slice(0, BORNES_PROJET.famille), donnees: base64(octets) });
    else if (deja) sortie.push(deja);
  }
  return sortie.slice(0, BORNES_PROJET.polices);
}

/** Le projet a enregistrer pour l'etat que l'editeur rend, sous le nom voulu. */
export function projetAEnregistrer(t: TravailOuvert, etat: EtatRendu, nom: string = t.nom): Projet {
  const e: EtatProjet = {
    nom, dessin: etat.dessin, production: etat.production, nuancier: t.nuancier,
    polices: policesPourProjet(etat.dessin, t.polices), images: t.images,
    ...(t.creeLe !== undefined ? { creeLe: t.creeLe } : {}), ...(t.modifieLe !== undefined ? { modifieLe: t.modifieLe } : {})
  };
  return projetDe(e);
}

/** Vrai quand deux etats ont le meme dessin (le meme objet : l'historique garde les etats tels quels) et le meme contexte. */
export const memeEtat = (a: EtatRendu | null, b: EtatRendu | null): boolean =>
  a !== null && b !== null && a.dessin === b.dessin && JSON.stringify(a.production) === JSON.stringify(b.production);

/**
 * Le travail d'un projet rouvert : le dessin, et ses fontes deposees retenues pour la session (une fonte dont les octets ne
 * redonnent pas l'identifiant est ecartee, et c'est dit). `id` et `revision` : ou il est enregistre.
 */
export function travailDuProjet(p: Projet, id: string, revision: number): { travail: TravailOuvert; ecartees: readonly string[] } | { erreur: string } {
  const e = etatDuProjet(p);
  if ('erreur' in e) return e;
  const ecartees: string[] = [];
  const polices = e.polices.filter(f => {
    const ok = retenirFonteDuProjet(f.id, f.famille, octetsDe64(f.donnees)) !== null;
    if (!ok) ecartees.push(f.famille);
    return ok;
  });
  return { travail: { id, revision, nom: e.nom, dessin: e.dessin, production: e.production, nuancier: e.nuancier, polices, images: e.images, creeLe: e.creeLe, modifieLe: e.modifieLe }, ecartees };
}

/**
 * Un SVG (fichier, code colle, bibliotheque, conversion) ouvert comme un projet neuf : nettoye, ses lettres mises en formes s'il
 * porte du texte, lu en dessin dans le modele donne (ADR-0012, annexe 5 §3 : `plat` par defaut, `riche` garde ses groupes) ; le
 * contexte vient de sa marque. Ou la phrase qui dit pourquoi il ne s'ouvre pas.
 */
export async function travailDuSvg(nom: string, texte: string, nuancier: readonly TeinteProjet[], ignoresAvant: readonly string[] = [], modele: 'plat' | 'riche' = 'plat'): Promise<TravailOuvert | { erreur: string }> {
  const propre = nettoyerSvgNomme(texte);
  if (propre && 'erreur' in propre) return { erreur: propre.erreur };
  if (!propre) return { erreur: t('Ce contenu n’est pas un SVG lisible : il lui faut une balise <svg> avec un viewBox ou des dimensions.') };
  let svg = propre.svg, ignores = [...ignoresAvant];
  if (contientTexte(svg)) {
    const r = await lettresDuSvg(svg, undefined, modele);
    if ('erreur' in r) return { erreur: r.erreur };
    svg = r.svg; ignores = [...ignores, ...r.ignores];
  }
  const lu = lireDessin(svg, modele === 'riche' ? { modele } : {});
  if ('erreur' in lu) return { erreur: lu.erreur };
  return {
    id: null, revision: null, nom, dessin: lu.dessin, production: choixDeMarque(lu.production).choix, nuancier,
    polices: [], images: [], ignores: [...ignores, ...lu.ignores]
  };
}

const TYPES: readonly TypeImage[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** L'image source d'une conversion, a garder dans le projet ; null si elle est trop lourde ou d'un type que le format n'admet pas. */
export async function imageSource(nom: string, f: File): Promise<ImageProjet | null> {
  const type = TYPES.find(t => t === f.type);
  if (!type || f.size > (BORNES_PROJET.base64Image / 4) * 3) return null;
  try { return { role: 'source', nom: nom.slice(0, BORNES_PROJET.nom), type, donnees: base64(new Uint8Array(await f.arrayBuffer())) }; } catch { return null; }
}
