// Le fenetrage d'une longue liste dans un panneau qui defile : le crochet mesure (position de la
// liste, hauteur visible, pas entre deux lignes), `util/fenetre.ts` decide quelles lignes dessiner.
// Un panneau de calques de cinq mille formes ne dessine ainsi qu'une quarantaine de lignes.
//
// Deux cas : la liste est dans un panneau qui defile (`useFenetre`, les calques), ou la liste est elle-meme
// le conteneur qui defile (`useFenetreDefilante`, les couleurs : une liste de 260 px dans le panneau).

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { defilementPour, fenetre, SEUIL_FENETRE, type Fenetre } from '../util/fenetre.js';

/** Le pas avant la premiere mesure : une ligne de 26 px et 1 px d'espace. Il se lit ensuite dans la page. */
const PAS_INITIAL = 27;

/** Les cales qui tiennent la place des lignes non dessinees portent cet attribut (`data-cale`, ListeCouleurs.tsx) : ce ne sont pas des lignes. */
const ATTRIBUT_CALE = 'data-cale';

interface Mesure { defile: number; visible: number; pas: number }

export interface FenetreListe {
  /** Le conteneur qui defile : a poser sur le panneau. */
  racine: RefObject<HTMLElement | null>;
  /** La liste dont les lignes se fenetrent : a poser sur l'`ol` ou l'`ul`. */
  liste: RefObject<HTMLOListElement | null>;
  fenetre: Fenetre;
  /** Le pas mesure entre deux lignes, que `segmentsFenetre` emploie pour la hauteur des cales. */
  pas: number;
  /** Faux sous le seuil : toutes les lignes sont dessinees et rien ne se mesure. */
  actif: boolean;
  /** Fait defiler le panneau jusqu'a ce que la ligne soit entierement visible. */
  montrer: (index: number) => void;
}

/** Une liste qui defile elle-meme : un seul element a poser, la liste est son propre conteneur. */
export interface FenetreDefilante<L extends HTMLElement> {
  liste: RefObject<L | null>;
  fenetre: Fenetre;
  /** Le pas mesure entre deux lignes, que `segmentsFenetre` emploie pour la hauteur des cales. */
  pas: number;
  actif: boolean;
  montrer: (index: number) => void;
}

/** Les deux premieres vraies lignes d'une liste (les cales n'en sont pas) : le pas se lit entre elles. */
function deuxLignes(l: HTMLElement): [Element | undefined, Element | undefined] {
  const lignes: Element[] = [];
  for (const e of Array.from(l.children)) {
    if (e.hasAttribute(ATTRIBUT_CALE)) continue;
    lignes.push(e);
    if (lignes.length === 2) break;
  }
  return [lignes[0], lignes[1]];
}

/** Ce que les deux crochets partagent. `interne` : la liste est son propre conteneur qui defile. */
function useMesureFenetre<L extends HTMLElement>(total: number, seuil: number, interne: boolean, externe?: RefObject<HTMLElement | null>) {
  const propre = useRef<HTMLElement | null>(null), liste = useRef<L | null>(null);
  // Deux listes dans le meme panneau (les groupes « À couper » et « À écrire », ADR-0028) partagent le conteneur qui defile.
  const racine = externe ?? propre;
  const [mesure, poserMesure] = useState<Mesure>({ defile: 0, visible: 0, pas: PAS_INITIAL });
  const pas = useRef(PAS_INITIAL);
  const actif = total > seuil;
  const conteneur = useCallback(() => (interne ? liste.current : racine.current), [interne]);

  const mesurer = useCallback((immediat = false) => {
    const r = conteneur(), l = liste.current;
    if (!r || !l) return;
    // Dans un panneau, la liste est plus bas que le haut visible de la valeur dont le panneau a defile ; la liste
    // qui defile elle-meme n'a que son propre defilement.
    const haut = interne ? r.scrollTop : r.getBoundingClientRect().top - l.getBoundingClientRect().top;
    const [a, b] = deuxLignes(l);
    // Le pas se lit entre deux lignes voisines : la hauteur change au doigt (cibles de 40 px).
    // Les rectangles sont fractionnaires, `offsetTop` arrondi : un pas de 25 pour 24,4 ferait deriver la liste de 600 px sur mille lignes.
    const lu = a && b ? b.getBoundingClientRect().top - a.getBoundingClientRect().top : a ? a.getBoundingClientRect().height + 1 : 0;
    if (lu > 0) pas.current = lu;
    // Arrondi a la ligne : on ne redessine pas a chaque pixel de defilement.
    const defile = Math.floor(Math.max(0, haut) / pas.current) * pas.current, visible = r.clientHeight;
    const poser = () => poserMesure(m => (m.defile === defile && m.visible === visible && m.pas === pas.current ? m : { defile, visible, pas: pas.current }));
    // Au defilement, les lignes se dessinent avant l'image suivante : sinon la zone reste vide un instant.
    if (immediat) flushSync(poser); else poser();
  }, [conteneur, interne]);

  // Une mesure des que la liste existe, puis seulement quand quelque chose bouge : relire la page a chaque
  // dessin forcerait une mise en page en plein geste (28 ms par deplacement pour 5000 formes).
  useLayoutEffect(() => { if (actif) mesurer(); }, [actif, mesurer]);
  useEffect(() => {
    const r = conteneur();
    if (!actif || !r) return;
    const defiler = () => mesurer(true), changer = () => mesurer();
    r.addEventListener('scroll', defiler, { passive: true });
    // `toggle` ne remonte pas : on l'ecoute en capture pour les sections qui se replient au-dessus de la liste.
    r.addEventListener('toggle', changer, true);
    // Ce qui change de hauteur au-dessus de la liste (couleurs en plus ou en moins) la deplace sans defilement ;
    // la liste elle-meme change de hauteur quand le pas change (cibles de 40 px au doigt).
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(changer);
    if (obs) {
      obs.observe(r);
      // Une liste qui defile elle-meme garde sa hauteur quand le pas change, et une section repliee la ramene a 0
      // sans `toggle` sur elle : le parent, qui suit le panneau, dit les deux.
      if (interne) { if (r.parentElement) obs.observe(r.parentElement); } else for (const e of Array.from(r.children)) obs.observe(e);
    }
    return () => { r.removeEventListener('scroll', defiler); r.removeEventListener('toggle', changer, true); obs?.disconnect(); };
  }, [actif, mesurer, conteneur, interne]);

  const montrer = useCallback((index: number) => {
    const r = conteneur(), l = liste.current;
    if (!r || !l) return;
    // La hauteur fractionnaire, pas `clientHeight` arrondi : la ligne doit tenir tout entiere, au dixieme de pixel pres.
    const zone = r.getBoundingClientRect();
    const delta = defilementPour(index, pas.current, interne ? r.scrollTop : zone.top - l.getBoundingClientRect().top, zone.height);
    if (delta) r.scrollTop += delta;
  }, [conteneur, interne]);

  return { racine, liste, fenetre: fenetre(total, mesure.pas, mesure.defile, mesure.visible, undefined, seuil), pas: mesure.pas, actif, montrer };
}

/**
 * A poser en `onFocus` sur une liste qui defile : quand un controle d'une ligne prend le focus au clavier, la ligne se montre
 * entiere. Chromium le fait deja en donnant le focus ; Firefox et WebKit ne defilent pas pour un controle a demi visible, et
 * Tab laissait le focus sur une ligne coupee par le bas de la liste (constate en CI, liste des couleurs du dessin). Un focus a
 * la souris ne fait rien defiler : la ligne bougerait sous le pointeur entre l'appui et le relachement.
 */
export function montrerLigneAuClavier(e: FocusEvent<HTMLElement>): void {
  const cible = e.target, ligne = cible.closest('li');
  if (!ligne || ligne.parentElement !== e.currentTarget) return;
  let auClavier = false;
  // Un moteur qui ne connait pas :focus-visible leve une erreur de selecteur : il garde son propre defilement.
  try { auClavier = cible.matches(':focus-visible'); } catch { return; }
  if (auClavier) ligne.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Les lignes a dessiner d'une liste de `total` lignes de meme hauteur, dans un panneau qui defile. `panneau` : le conteneur qui
 * defile, quand il est deja tenu ailleurs (plusieurs listes dans un meme panneau) ; absent, le crochet donne le sien (`racine`).
 */
export function useFenetre(total: number, panneau?: RefObject<HTMLElement | null>): FenetreListe {
  return useMesureFenetre<HTMLOListElement>(total, SEUIL_FENETRE, false, panneau);
}

/**
 * Les lignes a dessiner d'une liste qui defile elle-meme (hauteur maximale et `overflow: auto`). Au-dessus de
 * `seuil` lignes, le composant remplace les lignes absentes par deux cales (`data-cale`) de leur hauteur.
 */
export function useFenetreDefilante<L extends HTMLElement>(total: number, seuil: number): FenetreDefilante<L> {
  const { liste, fenetre: f, pas, actif, montrer } = useMesureFenetre<L>(total, seuil, true);
  return { liste, fenetre: f, pas, actif, montrer };
}
