// L'accueil guide (ADR-0019) : la visite de l'editeur en cinq etapes et les reperes de premiere rencontre. Tout est pur ici :
// les etapes et leurs textes, ce qui les fait avancer, ou poser la bulle, et la memoire de ce qui a deja ete vu. Le DOM, les
// gestes et le stockage vivent dans contexteGuide.tsx et BulleVisite.tsx.
//
// Pourquoi ce chemin : le moment ou un debutant comprend que l'outil est pour lui, c'est sa premiere retouche reussie
// (choisir une forme, changer sa couleur, recuperer le fichier). La visite ne montre que ce chemin, sur le vrai editeur.

import type { DessinSvg } from '../engine/editionSvg.js';
import { insecables } from '../util/texte.js';

export type EtapeVisite = 'choisir' | 'couleur' | 'annuler' | 'recuperer' | 'fin';

/** Les cinq etapes, dans l'ordre : pas une de plus, une visite longue n'est pas suivie. */
export const ETAPES: readonly EtapeVisite[] = ['choisir', 'couleur', 'annuler', 'recuperer', 'fin'];

/** Comment la personne recupere son dessin : la page le telecharge, un hote le recoit par « Enregistrer ». */
export type Recuperation = 'telecharger' | 'enregistrer';

/** Ce qui s'est passe dans l'editeur et que la visite ecoute : chaque etape attend le sien. */
export type SignalVisite = 'selection' | 'couleur' | 'annule' | 'recupere';

const ATTENDU: Readonly<Record<EtapeVisite, SignalVisite | null>> = { choisir: 'selection', couleur: 'couleur', annuler: 'annule', recuperer: 'recupere', fin: null };

/** Le rang d'une etape, de 1 a 5. */
export const rang = (e: EtapeVisite): number => ETAPES.indexOf(e) + 1;

/** L'etape d'apres, ou null apres la derniere (la visite se ferme). */
export function suivante(e: EtapeVisite): EtapeVisite | null {
  return ETAPES[ETAPES.indexOf(e) + 1] ?? null;
}

/** L'etape d'avant, ou la premiere. */
export function precedente(e: EtapeVisite): EtapeVisite {
  return ETAPES[Math.max(0, ETAPES.indexOf(e) - 1)] ?? 'choisir';
}

/**
 * L'etape apres un signal : seul le geste qu'attend l'etape du moment la fait avancer. Telecharger avant d'avoir recolore ne
 * saute pas la recoloration : c'est elle, la retouche.
 */
export function apresSignal(e: EtapeVisite, s: SignalVisite): EtapeVisite {
  return ATTENDU[e] === s ? suivante(e) ?? e : e;
}

/** « Étape 2 sur 5 » : ce que la bulle affiche au-dessus de son titre. */
export const progression = (e: EtapeVisite): string => 'Étape ' + rang(e) + ' sur ' + ETAPES.length;

/**
 * Quand la visite s'ouvre d'elle-meme : `toujours` (la page, quand on a demande « Essayer avec la visite guidée »), `si-nouveau`
 * (un hote qui l'a activee : une fois, tant que la memoire ne l'a pas vue), `jamais` (on la lance du menu Aide).
 */
export type Demarrage = 'toujours' | 'si-nouveau' | 'jamais';

export const ouvreSeule = (d: Demarrage, vue: boolean): boolean => d === 'toujours' || (d === 'si-nouveau' && !vue);

/** Ce qui change le texte d'une etape : l'ecran (sous 640 px, les menus sont dans « Plus »), le doigt, la selection, le moyen de recuperer. */
export interface ContexteVisite {
  readonly telephone: boolean;
  /** Un doigt plutot qu'une souris : on touche, on ne clique pas. */
  readonly doigt?: boolean;
  readonly selection: boolean;
  readonly recuperation: Recuperation;
  /** Le libelle du geste de fin, quand le dessin se recupere par lui (« Enregistrer », ou celui de l'hote). */
  readonly libelleFin?: string;
}

export interface TexteEtape { readonly titre: string; readonly corps: string }

/** Le titre et le corps d'une etape : des phrases courtes, sans mot de metier qui ne soit dit autrement, en typographie francaise. */
export function texteEtape(e: EtapeVisite, c: ContexteVisite): TexteEtape {
  const t = texteBrut(e, c), verbe = c.doigt ? 'Touchez' : 'Cliquez';
  return { titre: insecables(t.titre), corps: insecables(t.corps.replace(/\bCliquez\b/g, verbe)) };
}

function texteBrut(e: EtapeVisite, c: ContexteVisite): TexteEtape {
  switch (e) {
    case 'choisir':
      return { titre: 'Choisissez une forme', corps: 'Cliquez une des formes du dessin : un cadre l’entoure, elle est choisie. Au clavier, Page suivante en choisit une.' };
    case 'couleur':
      return {
        titre: 'Changez sa couleur',
        corps: c.selection
          ? 'Cliquez la pastille « Remplissage », en haut, puis choisissez une couleur. La forme change aussitôt.'
          : 'Choisissez d’abord une forme sur la toile, puis cliquez la pastille « Remplissage », en haut.'
      };
    case 'annuler':
      return { titre: 'Vous pouvez toujours revenir en arrière', corps: 'Cette flèche annule le dernier changement (Ctrl+Z) ; sa voisine le refait. Essayez si vous voulez, ou passez à la suite.' };
    case 'recuperer':
      // Le geste de fin n'est plus qu'une icone : la bulle dit son nom et ou le trouver (le bouton plein, en haut, ou en bas au telephone).
      if (c.recuperation === 'enregistrer') return { titre: 'Récupérez votre dessin', corps: 'Cliquez « ' + (c.libelleFin ?? 'Enregistrer') + ' », le bouton plein ' + (c.telephone ? 'en bas' : 'en haut') + ' à droite : votre dessin retouché revient dans la page qui a ouvert l’éditeur.' };
      // Au bureau, le menu Fichier (une icone de feuille) le porte en tete ; le telephone le range dans « Plus », rubrique Récupérer le dessin.
      return {
        titre: 'Récupérez votre dessin',
        corps: (c.telephone ? 'Touchez « Plus » (les trois points), puis « Télécharger le SVG ».' : 'Cliquez « Fichier », l’icône de feuille en haut à droite, puis « Télécharger le SVG ».') + ' Le fichier arrive dans vos téléchargements.'
      };
    case 'fin':
      return { titre: 'Votre première retouche est faite', corps: 'Choisir une forme, changer sa couleur, récupérer le fichier : vous connaissez le chemin. Pour la suite :' };
  }
}

/** Ou retrouver la visite : le menu Aide, range dans « Plus » sur un telephone. */
export const ouRejouer = (telephone: boolean): string => (telephone ? 'Elle se rejoue depuis « Plus », rubrique Aide.' : 'Elle se rejoue depuis le menu Aide.');

/** La phrase dite dans la region vocale a chaque etape ; la premiere dit aussi comment atteindre la bulle au clavier. */
export function phraseEtape(e: EtapeVisite, c: ContexteVisite): string {
  const t = texteEtape(e, c);
  const debut = 'Visite guidée, ' + progression(e).toLowerCase() + ' : ' + t.titre + '. ' + t.corps;
  return insecables(e === 'choisir' ? debut + ' F6 mène à la bulle de la visite et revient à la toile ; dans la bulle, Échap quitte la visite.' : debut);
}

/** La phrase dite quand la visite se ferme, terminee ou passee. */
export const phraseFin = (terminee: boolean, telephone: boolean): string => insecables('Visite guidée ' + (terminee ? 'terminée' : 'quittée') + '. ' + ouRejouer(telephone));

/** L'element vise par une etape, en selecteur sous `.editeur-cadre` : la toile, une pastille, un bouton de la barre. */
export function cibleEtape(e: EtapeVisite, c: Pick<ContexteVisite, 'telephone' | 'recuperation'>): string {
  switch (e) {
    case 'choisir':
    case 'fin':
      return '.editeur-toile';
    case 'couleur':
      return '.editeur-barre .style-courant .pastille-style';
    case 'annuler':
      return '.editeur-barre button[aria-label="Annuler (Ctrl+Z)"]';
    case 'recuperer':
      if (c.recuperation === 'enregistrer') return c.telephone ? '.editeur-etat button.primaire' : '.editeur-barre .groupe.fin button.primaire';
      return c.telephone ? '.editeur-barre .groupe.plus .menu-bouton' : '.editeur-barre .menu-fichier .menu-bouton';
  }
}

/** Vrai quand une forme presente des deux cotes a change de remplissage ou de contour : la recoloration de l'etape 2. */
export function couleurChangee(avant: DessinSvg, apres: DessinSvg): boolean {
  if (avant === apres) return false;
  const parId = new Map(avant.formes.map(f => [f.id, f] as const));
  return apres.formes.some(f => {
    const a = parId.get(f.id);
    return !!a && (a.remplissage !== f.remplissage || a.contour !== f.contour);
  });
}

// ---------------------------------------------------------------------------------------------
// La bulle : ou la poser pour qu'elle ne cache pas ce qu'elle montre.
// ---------------------------------------------------------------------------------------------

export interface Rect { readonly x: number; readonly y: number; readonly l: number; readonly h: number }
export interface Taille { readonly l: number; readonly h: number }

/**
 * Ou poser la bulle : son coin haut gauche, le cote de la cible ou elle se tient, ou pointe sa fleche (depuis son bord gauche ;
 * null quand la cible est hors de sa largeur), et la bande de la toile qu'elle occupe, en haut ou en bas (de quoi recadrer le dessin).
 */
export interface Placement {
  readonly x: number; readonly y: number; readonly cote: 'dessous' | 'dessus' | 'dedans'; readonly fleche: number | null;
  readonly reserve: { readonly haut: number; readonly bas: number };
}

const borner = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Pose la bulle dans la toile (`zone`), au plus pres de sa cible, sans couvrir ni la barre, ni la rangee de la selection, ni les
 * panneaux : dessous une cible de la barre (en haut de la toile), dessus une cible de la barre d'etat (en bas), et en bas de la
 * toile quand la cible est la toile elle-meme. Sa largeur reste dans celle de la toile quand elle y tient ; sa fleche pointe la
 * cible quand la cible est au-dessus ou au-dessous d'elle. La bande qu'elle occupe est rendue : la vue s'y recadre (cadrage), le
 * dessin ne passe jamais sous la bulle. Sans zone, l'ecran sert de zone.
 */
export function placerBulle(cible: Rect | null, bulle: Taille, ecran: Taille, zone: Rect | null = null, marge = 8, ecart = 10): Placement {
  const z = zone ?? { x: 0, y: 0, l: ecran.l, h: ecran.h };
  const tient = bulle.l <= z.l - 2 * marge;
  const xMin = tient ? z.x + marge : marge, xMax = tient ? z.x + z.l - marge - bulle.l : ecran.l - marge - bulle.l;
  const centre = cible ? cible.x + cible.l / 2 : z.x + z.l / 2;
  const x = borner(centre - bulle.l / 2, xMin, xMax);
  const fleche = cible && centre - x >= 16 && centre - x <= bulle.l - 16 ? centre - x : null;
  const bas = borner(z.y + z.h - marge - bulle.h, marge, ecran.h - marge - bulle.h);
  const enBas = (cote: Placement['cote'], f: number | null): Placement => ({ x, y: bas, cote, fleche: f, reserve: { haut: 0, bas: z.y + z.h - bas + marge } });
  if (!cible || (cible.h > z.h / 2 && cible.l > z.l / 2)) return enBas('dedans', null);
  if (cible.y + cible.h <= z.y + z.h / 2) {
    const y = borner(Math.max(cible.y + cible.h, z.y) + ecart, marge, ecran.h - marge - bulle.h);
    return { x, y, cote: 'dessous', fleche, reserve: { haut: y + bulle.h - z.y + marge, bas: 0 } };
  }
  return enBas('dessus', fleche);
}

/**
 * La vue qui montre tout le plan entre deux bandes de la toile (`reserve` en haut et en bas, en pixels) : la bulle s'y pose sans
 * cacher le dessin. Le meme cadrage que « Ajuster à l'écran » (88 % de la place), dans la place qui reste. `vb` est le plan
 * (x, y, largeur, hauteur), `toile` la taille de la toile a l'ecran ; la vue est dans les coordonnees de la toile.
 */
export function cadrage(vb: readonly [number, number, number, number], toile: Taille, reserve: { readonly haut: number; readonly bas: number }): { zoom: number; x: number; y: number } {
  const [x, y, l, h] = vb, haut = Math.max(1, toile.h - reserve.haut - reserve.bas);
  const zoom = Math.max(0.01, Math.min(toile.l / l, haut / h) * 0.88);
  return { zoom, x: (toile.l - l * zoom) / 2 - x * zoom, y: reserve.haut + (haut - h * zoom) / 2 - y * zoom };
}

// ---------------------------------------------------------------------------------------------
// La memoire : ce qui a ete vu ne se repropose pas. Un confort du stockage injecte, jamais un besoin.
// ---------------------------------------------------------------------------------------------

/** La cle de la memoire dans le stockage donne a l'editeur ou a la page. */
export const CLE_GUIDE = 'svg.guide';

/** Les reperes de premiere rencontre : ou un debutant bloque (ADR-0019, « Les reperes »). */
export type IdRepere = 'points' | 'cricut' | 'conversion' | 'booleen';
export const REPERES: readonly IdRepere[] = ['points', 'cricut', 'conversion', 'booleen'];

export interface MemoireGuide {
  /** La visite a deja ete proposee et ouverte une fois. */
  readonly visite: boolean;
  /** Les reperes refermes par « Compris ». */
  readonly reperes: readonly IdRepere[];
}

export const MEMOIRE_VIDE: MemoireGuide = { visite: false, reperes: [] };

const estRepere = (v: unknown): v is IdRepere => typeof v === 'string' && (REPERES as readonly string[]).includes(v);

/**
 * La memoire lue dans un stockage, validee champ par champ : une valeur qu'on n'a pas ecrite (abimee, empoisonnee, d'une version
 * future) se lit comme ce qu'elle a de valide, et jamais ne leve. Les reperes inconnus sont ecartes, les doublons aussi.
 */
export function lireMemoire(v: unknown): MemoireGuide {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return MEMOIRE_VIDE;
  const o = v as Record<string, unknown>;
  const reperes = Array.isArray(o.reperes) ? REPERES.filter(id => (o.reperes as unknown[]).some(x => estRepere(x) && x === id)) : [];
  return { visite: o.visite === true, reperes };
}

/** Ce que les deux memoires ont vu : celle du stockage, et celle de la session (sans stockage, la visite ne revient pas avant le rechargement). */
export function fusionner(a: MemoireGuide, b: MemoireGuide): MemoireGuide {
  return { visite: a.visite || b.visite, reperes: REPERES.filter(id => a.reperes.includes(id) || b.reperes.includes(id)) };
}

export const avecVisite = (m: MemoireGuide): MemoireGuide => (m.visite ? m : { ...m, visite: true });
export const avecRepere = (m: MemoireGuide, id: IdRepere): MemoireGuide => (m.reperes.includes(id) ? m : { ...m, reperes: REPERES.filter(r => r === id || m.reperes.includes(r)) });
