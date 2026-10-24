// Les gestes du panneau « Couleurs du dessin » : choisir les formes d'une couleur, la changer partout, la
// remplacer par une teinte du nuancier. Un crochet et non des fonctions du composant : les lignes recoivent des
// verbes STABLES (un objet qui ne change jamais d'identite, ADR-0010) pour pouvoir se memoiser, et chaque verbe
// lit l'etat au moment du geste par une reference mise a jour a chaque rendu.

import { useMemo, useRef, useState } from 'react';
import { idsDeCouleur, remplacerCouleur } from '../engine/editionSvg.js';
import type { SuiviCouleur } from './actionsCouleur.js';
import { useActions, useDessin } from './contexteEditeur.js';

/** Ce que le panneau prete a chaque ligne. Les verbes ne changent jamais d'identite. */
export interface ActionsCouleurDessin {
  /** Choisit les formes (visibles, non verrouillees) de la couleur. */
  choisir: (couleur: string) => void;
  /** Un nouveau geste de couleur commence (le selecteur s'ouvre) : le precedent est clos. */
  debuterRecolorer: () => void;
  /** Une valeur du selecteur, en cours de glisse. `rang` (de 1) nomme le geste ; les valeurs d'un geste se fondent en une entree d'historique. */
  recolorer: (couleur: string, vers: string, rang: number) => void;
  finirRecolorer: () => void;
  /** Remplace la couleur partout par une teinte du nuancier, en une entree d'historique. */
  remplacer: (couleur: string, vers: string) => void;
}

/** Un geste en cours : la cle qui fond ses entrees, la ligne qu'il tient (sa couleur d'avant le geste) et sa couleur du moment. */
interface Geste { cle: string; ligne: string; actuelle: string }

export function useActionsCouleursDessin() {
  const ac = useActions(), { dessin } = useDessin();
  // La ligne qu'on recolore change de couleur donc de cle : on lui garde sa cle d'avant le geste, sans quoi elle
  // serait remontee et le selecteur natif se fermerait sous le doigt (et, fenetree, elle serait epinglee).
  const [suivi, poserSuivi] = useState<SuiviCouleur | null>(null);
  const geste = useRef<Geste | null>(null);
  const dessinVivant = useRef(dessin);
  dessinVivant.current = dessin;

  const actions = useMemo<ActionsCouleurDessin>(() => ({
    choisir: couleur => ac.choisir(idsDeCouleur(dessinVivant.current, couleur)),
    debuterRecolorer: () => { ac.finir(); geste.current = null; },
    recolorer: (couleur, vers, rang) => {
      // Le geste continue tant que la ligne porte la couleur qu'il lui a donnee ; sinon c'est un autre geste.
      const g = geste.current && geste.current.actuelle === couleur ? geste.current : { cle: 'recolorer-' + (rang - 1), ligne: couleur, actuelle: couleur };
      geste.current = { ...g, actuelle: vers };
      ac.appliquer(d => remplacerCouleur(d, couleur, vers), g.cle);
      poserSuivi({ cle: g.ligne, vers });
    },
    finirRecolorer: () => { geste.current = null; poserSuivi(null); ac.finir(); },
    remplacer: (couleur, vers) => ac.faire(d => remplacerCouleur(d, couleur, vers))
  }), [ac]);

  return { actions, suivi };
}
