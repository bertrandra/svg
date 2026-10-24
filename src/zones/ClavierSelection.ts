// La selection additive et le texte, au clavier, quand la toile a le focus : Maj+Page suivante (ou precedente)
// ajoute la forme voisine a la selection, Espace ajoute ou retire la forme au curseur, Entree avec l'outil texte
// va au champ du panneau. Le choix est pur (engine/navigation.ts, zones/annonces.ts) ; ici, le fil des touches.
//
// Pas d'equivalent au cadre de selection de la souris : choisir « tout ce qui est dans un rectangle » demande
// deux coins ET une regle (croiser ou contenir) que le clavier n'a pas de facon sobre. Ctrl+A, « Tout » et
// « Inverser » (calques), « C » (meme couleur) et Maj+Page suivante couvrent les memes besoins.

import { basculerDansSelection, formeAuCurseur, formeVoisine, type Sens } from '../engine/navigation.js';
import {
  phraseBascule, PHRASE_CHAMP_TEXTE, PHRASE_PANNEAU_TEXTE, PHRASE_SANS_CURSEUR
} from './annonces.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from './typesEditeur.js';

export interface ContexteSelection { m: ModeleDessin; u: EtatInterface; ac: ActionsEditeur }

/** Pose la selection ET son curseur ensemble : le curseur n'est cru que tant que la selection est ce tableau-la. */
function poserSelection({ ac }: ContexteSelection, sel: string[], curseur: string): void {
  ac.choisir(sel);
  ac.poserPoint(null);
  ac.poserFocale({ id: curseur, sel });
}

/**
 * Maj+Page suivante ou precedente : le curseur passe a la forme voisine (en boucle) et elle rejoint la
 * selection. Une forme deja choisie y reste : le curseur avance seulement, ce qui permet de la depasser.
 */
export function etendreSelection(c: ContexteSelection, sens: Sens): true {
  const { m, u, ac } = c, courant = formeAuCurseur(m.dessin, m.sel, u.focale);
  const id = formeVoisine(m.dessin, courant ? [courant] : [], sens, true);
  if (id === null) { ac.annoncer('Aucune forme à choisir : elles sont toutes masquées ou verrouillées.'); return true; }
  const deja = m.sel.includes(id), apres = deja ? m.sel : [...m.sel, id];
  poserSelection(c, apres, id);
  ac.annoncer(phraseBascule(id, deja ? 'deja' : 'ajoutee', apres.length));
  return true;
}

/** Espace : la forme au curseur entre dans la selection, ou en sort si elle y etait. */
export function basculerCurseur(c: ContexteSelection): true {
  const { m, u, ac } = c, courant = formeAuCurseur(m.dessin, m.sel, u.focale);
  if (courant === null) { ac.annoncer(PHRASE_SANS_CURSEUR); return true; }
  const r = basculerDansSelection(m.sel, courant);
  poserSelection(c, r.sel, courant);
  ac.annoncer(phraseBascule(courant, r.ajoutee ? 'ajoutee' : 'retiree', r.sel.length));
  return true;
}

/**
 * Entree avec l'outil texte : le focus va au champ « Texte » du panneau. Le texte se place au centre du plan
 * (c'est ce que fait le bouton « Ajouter le texte »), pas au reticule. Sur un petit ecran le panneau est un
 * tiroir ferme : on l'ouvre, et le tiroir prend le focus (Tab mene ensuite au champ).
 */
export function ouvrirChampTexte({ ac }: ContexteSelection, cadre: Element | null): true {
  const champ = cadre?.querySelector<HTMLTextAreaElement>('.editeur-inspecteur textarea[aria-label="Texte"]') ?? null;
  if (champ && getComputedStyle(champ).visibility !== 'hidden') {
    champ.focus();
    ac.annoncer(PHRASE_CHAMP_TEXTE);
  } else {
    ac.poserTiroir('inspecteur');
    ac.annoncer(PHRASE_PANNEAU_TEXTE);
  }
  return true;
}
