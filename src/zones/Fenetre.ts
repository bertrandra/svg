// Le fenetrage d'une longue liste dans un panneau qui defile : le crochet mesure (position de la
// liste, hauteur visible, pas entre deux lignes), `util/fenetre.ts` decide quelles lignes dessiner.
// Un panneau de calques de cinq mille formes ne dessine ainsi qu'une quarantaine de lignes.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { defilementPour, fenetre, SEUIL_FENETRE, type Fenetre } from '../util/fenetre.js';

/** Le pas avant la premiere mesure : une ligne de 26 px et 1 px d'espace. Il se lit ensuite dans la page. */
const PAS_INITIAL = 27;

interface Mesure { defile: number; visible: number; pas: number }

export interface FenetreListe {
  /** Le conteneur qui defile : a poser sur le panneau. */
  racine: RefObject<HTMLElement | null>;
  /** La liste dont les lignes se fenetrent : a poser sur l'`ol` ou l'`ul`. */
  liste: RefObject<HTMLOListElement | null>;
  fenetre: Fenetre;
  /** Faux sous le seuil : toutes les lignes sont dessinees et rien ne se mesure. */
  actif: boolean;
  /** Fait defiler le panneau jusqu'a ce que la ligne soit entierement visible. */
  montrer: (index: number) => void;
}

/** Les lignes a dessiner d'une liste de `total` lignes de meme hauteur. */
export function useFenetre(total: number): FenetreListe {
  const racine = useRef<HTMLElement | null>(null), liste = useRef<HTMLOListElement | null>(null);
  const [mesure, poserMesure] = useState<Mesure>({ defile: 0, visible: 0, pas: PAS_INITIAL });
  const pas = useRef(PAS_INITIAL);
  const actif = total > SEUIL_FENETRE;

  const mesurer = useCallback((immediat = false) => {
    const r = racine.current, l = liste.current;
    if (!r || !l) return;
    const haut = r.getBoundingClientRect().top - l.getBoundingClientRect().top;
    const a = l.children[0], b = l.children[1];
    // Le pas se lit entre deux lignes voisines : la hauteur change au doigt (cibles de 40 px).
    // Les rectangles sont fractionnaires, `offsetTop` arrondi : un pas de 25 pour 24,4 ferait deriver la liste de 600 px sur mille lignes.
    const lu = a && b ? b.getBoundingClientRect().top - a.getBoundingClientRect().top : a ? a.getBoundingClientRect().height + 1 : 0;
    if (lu > 0) pas.current = lu;
    // Arrondi a la ligne : on ne redessine pas a chaque pixel de defilement.
    const defile = Math.floor(Math.max(0, haut) / pas.current) * pas.current, visible = r.clientHeight;
    const poser = () => poserMesure(m => (m.defile === defile && m.visible === visible && m.pas === pas.current ? m : { defile, visible, pas: pas.current }));
    // Au defilement, les lignes se dessinent avant l'image suivante : sinon la zone reste vide un instant.
    if (immediat) flushSync(poser); else poser();
  }, []);

  // Une mesure des que la liste existe, puis seulement quand quelque chose bouge : relire la page a chaque
  // dessin forcerait une mise en page en plein geste (28 ms par deplacement pour 5000 formes).
  useLayoutEffect(() => { if (actif) mesurer(); }, [actif, mesurer]);
  useEffect(() => {
    const r = racine.current;
    if (!actif || !r) return;
    const defiler = () => mesurer(true), changer = () => mesurer();
    r.addEventListener('scroll', defiler, { passive: true });
    // `toggle` ne remonte pas : on l'ecoute en capture pour les sections qui se replient au-dessus de la liste.
    r.addEventListener('toggle', changer, true);
    // Ce qui change de hauteur au-dessus de la liste (couleurs en plus ou en moins) la deplace sans defilement ;
    // la liste elle-meme change de hauteur quand le pas change (cibles de 40 px au doigt).
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(changer);
    if (obs) { obs.observe(r); for (const e of Array.from(r.children)) obs.observe(e); }
    return () => { r.removeEventListener('scroll', defiler); r.removeEventListener('toggle', changer, true); obs?.disconnect(); };
  }, [actif, mesurer]);

  const montrer = useCallback((index: number) => {
    const r = racine.current, l = liste.current;
    if (!r || !l) return;
    // La hauteur fractionnaire, pas `clientHeight` arrondi : la ligne doit tenir tout entiere, au dixieme de pixel pres.
    const zone = r.getBoundingClientRect();
    const delta = defilementPour(index, pas.current, zone.top - l.getBoundingClientRect().top, zone.height);
    if (delta) r.scrollTop += delta;
  }, []);

  return { racine, liste, fenetre: fenetre(total, mesure.pas, mesure.defile, mesure.visible), actif, montrer };
}
