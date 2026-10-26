// Les commandes des decoupes et des masques (ADR-0012, etape 8, paquet A ; annexe 6 §3) : « Créer une découpe », « Libérer la
// découpe », « Créer un masque », « Inverser le masque », « Libérer le masque », au menu Edition, apres les groupes. Elles n'existent
// qu'en modele riche (`groupesActifs` : le reglage, ou un dessin deja riche) ; a plat, aucun element de menu de plus.
//
// Pas de bouton dans la rangee de la selection (annexe 6 §3 : « jamais un bouton de plus dans la barre », ADR-0006 : le rare dans les
// menus), et pas de raccourci : Illustrator prend Ctrl+7 et Ctrl+Alt+7, qu'un clavier AZERTY n'atteint qu'avec Maj et qu'AltGr
// (Ctrl+Alt) confond ; aucune touche libre ne vaut sur tous les claviers (la conclusion de l'annexe 9, question 1, pour Combiner).
// Une commande indisponible reste visible et grisee, sa raison dans son infobulle.

import { unites } from '../engine/editionSvg.js';
import type { ElementMenu } from './commun/Menu.js';
import { groupesActifs } from './commandesGroupes.js';
import { porteurDe } from './actionsContenus.js';
import { RAISONS_CONTENUS } from './phrasesContenus.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from './typesEditeur.js';

/** Les elements des decoupes et des masques au menu Edition, en modele riche seulement (vide sinon). */
export function elementsContenus(m: Pick<ModeleDessin, 'dessin' | 'sel'>, u: Pick<EtatInterface, 'modele' | 'contexte'>, ac: ActionsEditeur): ElementMenu[] {
  if (!groupesActifs(m.dessin, u.modele)) return [];
  const deux = unites(m.dessin, m.sel).length >= 2, contexte = u.contexte?.groupe ?? null;
  const decoupe = porteurDe(m.dessin, m.sel, contexte, 'decoupe') !== null, masque = porteurDe(m.dessin, m.sel, contexte, 'masque') !== null;
  return [
    { id: 'creer-decoupe', libelle: 'Créer une découpe', icone: 'decoupe', separateur: true, desactive: !deux, raison: RAISONS_CONTENUS.deux, onClick: ac.creerDecoupe },
    { id: 'liberer-decoupe', libelle: 'Libérer la découpe', desactive: !decoupe, raison: RAISONS_CONTENUS.decoupe, onClick: ac.libererDecoupe },
    { id: 'creer-masque', libelle: 'Créer un masque', icone: 'masque', desactive: !deux, raison: RAISONS_CONTENUS.deux, onClick: ac.creerMasque },
    { id: 'inverser-masque', libelle: 'Inverser le masque', desactive: !masque, raison: RAISONS_CONTENUS.masque, onClick: ac.inverserMasque },
    { id: 'liberer-masque', libelle: 'Libérer le masque', desactive: !masque, raison: RAISONS_CONTENUS.masque, onClick: ac.libererMasque }
  ];
}
