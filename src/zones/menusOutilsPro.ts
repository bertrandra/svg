// Les elements de menu des outils de l'ADR-0038 : les regles et les reperes (menu Vue), la repetition de la selection (menu
// Edition et menu de la selection). Ils vivent ici pour que les menus de la barre n'aient qu'a les etaler.

import { nombreReperes } from '../engine/editionSvg.js';
import { useDessin, useInterface } from './contexteEditeur.js';
import { operationsApplicables } from '../engine/preparation.js';
import { TITRE_FEUILLE } from './PanneauFeuille.js';
import { TITRE_LIENS } from './PanneauLiens.js';
import { useActionsRegles, useRegles } from './contexteRegles.js';
import type { ElementMenu } from './commun/Menu.js';
import { TITRES_REPETITION } from './PanneauRepetition.js';
import { t } from '../util/i18n.js';

/** Regles et reperes, dans le menu Vue : trois bascules, le panneau des valeurs exactes, l'effacement. */
export function useElementsReperes(): ElementMenu[] {
  const rg = useRegles(), arg = useActionsRegles(), { dessin } = useDessin();
  const n = nombreReperes(dessin);
  return [
    { id: 'regles', libelle: t('Afficher les règles'), icone: 'regle', raccourci: t('Maj+R'), coche: rg.regles, separateur: true, onClick: arg.basculerRegles },
    { id: 'reperes', libelle: t('Afficher les repères'), raccourci: 'Ctrl+;', coche: rg.reperesVisibles, onClick: arg.basculerReperes },
    { id: 'verrouiller-reperes', libelle: t('Verrouiller les repères'), raccourci: 'Ctrl+Alt+;', coche: rg.verrouilles, onClick: arg.basculerVerrou },
    { id: 'poser-repere', libelle: t('Repères : valeurs exactes…'), onClick: () => arg.ouvrir('reperes') },
    { id: 'effacer-reperes', libelle: t('Effacer les repères'), raccourci: t('Ctrl+Maj+;'), desactive: !n, onClick: arg.effacer }
  ];
}

/**
 * Repeter la selection : chaque element ouvre son panneau sur la toile, apercu compris. En contexte Cricut qui coupe ou ecrit,
 * « Dupliquer sur la feuille » range des copies sur la feuille du tapis (ADR-0039), et « Ajouter des liens » retient les ilots des
 * formes a couper (ADR-0040) : deux gestes de la machine sur la selection, qui viennent avec elle dans les deux menus.
 */
export function useElementsRepetition(separateur = false): ElementMenu[] {
  const { sel } = useDessin(), arg = useActionsRegles(), { profil } = useInterface();
  const rien = !sel.length;
  const feuille = !!profil && operationsApplicables(profil.procede);
  return [
    ...(feuille ? [
      // Les titres des panneaux sont des cles francaises : ils se traduisent ici, au moment d'etaler le menu (ADR-0042).
      { id: 'dupliquer-feuille', libelle: t(TITRE_FEUILLE) + '…', icone: 'repeter', separateur, desactive: rien, onClick: () => arg.ouvrir('feuille') },
      { id: 'ajouter-liens', libelle: t(TITRE_LIENS) + '…', desactive: rien, onClick: () => arg.ouvrir('liens') }
    ] satisfies ElementMenu[] : []),
    { id: 'repeter-grille', libelle: t(TITRES_REPETITION.grille) + '…', icone: 'repeter', separateur: separateur && !feuille, desactive: rien, onClick: () => arg.ouvrir('grille') },
    { id: 'repeter-radiale', libelle: t(TITRES_REPETITION.radiale) + '…', icone: 'radiale', desactive: rien, onClick: () => arg.ouvrir('radiale') },
    { id: 'repeter-symetrie', libelle: t(TITRES_REPETITION.symetrie) + '…', icone: 'symetrie', desactive: rien, onClick: () => arg.ouvrir('symetrie') }
  ];
}
