// Les commandes des decoupes et des masques (ADR-0012, etape 8, paquet A ; annexe 6 §3) : « Créer une découpe », « Libérer la
// découpe », « Créer un masque », « Inverser le masque », « Libérer le masque », au menu Edition, apres les groupes. Elles n'existent
// qu'en modele riche (`groupesActifs` : le reglage, ou un dessin deja riche) ; a plat, aucun element de menu de plus.
//
// Pas de bouton dans la rangee de la selection (annexe 6 §3 : « jamais un bouton de plus dans la barre », ADR-0006 : le rare dans les
// menus), et pas de raccourci : Illustrator prend Ctrl+7 et Ctrl+Alt+7, qu'un clavier AZERTY n'atteint qu'avec Maj et qu'AltGr
// (Ctrl+Alt) confond ; aucune touche libre ne vaut sur tous les claviers (la conclusion de l'annexe 9, question 1, pour Combiner).
// Une commande indisponible reste visible et grisee, sa raison dans son infobulle. « Modifier la découpe » et « Modifier le masque »
// (paquet 8-D) se cherchent la aussi, et par un double-clic sur la pastille du groupe dans les calques.

import { unites } from '../engine/editionSvg.js';
import type { ElementMenu } from './commun/Menu.js';
import { groupesActifs } from './commandesGroupes.js';
import { porteurDe } from './actionsContenus.js';
import { RAISONS_CONTENUS, RAISONS_LENTILLE } from './phrasesContenus.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from './typesEditeur.js';
import { dessinComplet, lentilleDe, niveauEdition } from './lentille.js';
import { t } from '../util/i18n.js';

/**
 * Les elements des decoupes et des masques au menu Edition, en modele riche seulement (vide sinon). « Modifier la découpe » et « Modifier
 * le masque » (paquet 8-D) en font modifier le contenu sur place ; dans une decoupe ou un masque, ce qui ne passe pas par la lentille
 * reste visible et grise, avec sa raison.
 */
export function elementsContenus(m: Pick<ModeleDessin, 'dessin' | 'sel' | 'complet'>, u: Pick<EtatInterface, 'modele' | 'contexte'>, ac: ActionsEditeur): ElementMenu[] {
  if (!groupesActifs(dessinComplet(m), u.modele)) return [];
  const l = lentilleDe(u.contexte), dansDecoupe = l?.genre === 'decoupe';
  const deux = unites(m.dessin, m.sel).length >= 2, contexte = niveauEdition(u.contexte);
  const decoupe = l ? l.genre === 'decoupe' : porteurDe(m.dessin, m.sel, contexte, 'decoupe') !== null;
  const masque = l ? l.genre === 'masque' : porteurDe(m.dessin, m.sel, contexte, 'masque') !== null;
  return [
    { id: 'creer-decoupe', libelle: t('Créer une découpe'), icone: 'decoupe', separateur: true, desactive: !deux, raison: t(RAISONS_CONTENUS.deux), onClick: ac.creerDecoupe },
    { id: 'modifier-decoupe', libelle: t('Modifier la découpe'), desactive: !!l || !decoupe, raison: t(l ? RAISONS_LENTILLE.dejaDedans : RAISONS_LENTILLE.modifierDecoupe), onClick: () => { ac.modifierContenu('decoupe'); } },
    { id: 'liberer-decoupe', libelle: t('Libérer la découpe'), desactive: !decoupe, raison: t(l ? RAISONS_LENTILLE.autreContenu : RAISONS_CONTENUS.decoupe), onClick: ac.libererDecoupe },
    { id: 'creer-masque', libelle: t('Créer un masque'), icone: 'masque', desactive: !deux || dansDecoupe, raison: t(dansDecoupe ? RAISONS_LENTILLE.decoupe : RAISONS_CONTENUS.deux), onClick: ac.creerMasque },
    { id: 'modifier-masque', libelle: t('Modifier le masque'), desactive: !!l || !masque, raison: t(l ? RAISONS_LENTILLE.dejaDedans : RAISONS_LENTILLE.modifierMasque), onClick: () => { ac.modifierContenu('masque'); } },
    { id: 'inverser-masque', libelle: t('Inverser le masque'), desactive: !masque, raison: t(l ? RAISONS_LENTILLE.autreContenu : RAISONS_CONTENUS.masque), onClick: ac.inverserMasque },
    { id: 'liberer-masque', libelle: t('Libérer le masque'), desactive: !masque, raison: t(l ? RAISONS_LENTILLE.autreContenu : RAISONS_CONTENUS.masque), onClick: ac.libererMasque }
  ];
}
