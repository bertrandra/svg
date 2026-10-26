// La selection additive, au clavier, quand la toile a le focus : Maj+Page suivante (ou precedente) ajoute la
// forme voisine a la selection, Espace ajoute ou retire la forme au curseur. Le choix est pur
// (engine/navigation.ts, zones/annonces.ts) ; ici, le fil des touches.
//
// Le cadre et le lasso du clavier passent par le reticule de leur outil (F, Q ; ClavierZone.ts, ADR-0035) ; Ctrl+A,
// I (inverser), C, Alt+C et Y (meme fond, meme contour, meme type) completent Maj+Page suivante.

import { basculerDansSelection, formeAuCurseur, formeVoisine, type Sens } from '../engine/navigation.js';
import { phraseBascule, phraseSansCurseur } from './annonces.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from './typesEditeur.js';
import { niveauEdition } from './lentille.js';
import { t } from '../util/i18n.js';

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
  const { m, u, ac } = c, contexte = niveauEdition(u.contexte), courant = formeAuCurseur(m.dessin, m.sel, u.focale, contexte);
  const id = formeVoisine(m.dessin, courant ? [courant] : [], sens, true, contexte);
  if (id === null) { ac.annoncer(t('Aucune forme à choisir : elles sont toutes masquées ou verrouillées.')); return true; }
  const deja = m.sel.includes(id), apres = deja ? m.sel : [...m.sel, id];
  poserSelection(c, apres, id);
  ac.annoncer(phraseBascule(id, deja ? 'deja' : 'ajoutee', apres.length));
  return true;
}

/** Espace : la forme au curseur entre dans la selection, ou en sort si elle y etait. */
export function basculerCurseur(c: ContexteSelection): true {
  const { m, u, ac } = c, courant = formeAuCurseur(m.dessin, m.sel, u.focale, niveauEdition(u.contexte));
  if (courant === null) { ac.annoncer(phraseSansCurseur()); return true; }
  const r = basculerDansSelection(m.sel, courant);
  poserSelection(c, r.sel, courant);
  ac.annoncer(phraseBascule(courant, r.ajoutee ? 'ajoutee' : 'retiree', r.sel.length));
  return true;
}
