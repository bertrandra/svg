// Les elements de menu des outils de l'ADR-0038 : les regles et les reperes (menu Vue), la repetition de la selection (menu
// Edition et menu de la selection). Ils vivent ici pour que les menus de la barre n'aient qu'a les etaler.

import { nombreReperes } from '../engine/editionSvg.js';
import { useDessin } from './contexteEditeur.js';
import { useActionsRegles, useRegles } from './contexteRegles.js';
import type { ElementMenu } from './commun/Menu.js';
import { TITRES_REPETITION } from './PanneauRepetition.js';

/** Regles et reperes, dans le menu Vue : trois bascules, le panneau des valeurs exactes, l'effacement. */
export function useElementsReperes(): ElementMenu[] {
  const rg = useRegles(), arg = useActionsRegles(), { dessin } = useDessin();
  const n = nombreReperes(dessin);
  return [
    { id: 'regles', libelle: 'Afficher les règles', icone: 'regle', raccourci: 'Maj+R', coche: rg.regles, separateur: true, onClick: arg.basculerRegles },
    { id: 'reperes', libelle: 'Afficher les repères', raccourci: 'Ctrl+;', coche: rg.reperesVisibles, onClick: arg.basculerReperes },
    { id: 'verrouiller-reperes', libelle: 'Verrouiller les repères', raccourci: 'Ctrl+Alt+;', coche: rg.verrouilles, onClick: arg.basculerVerrou },
    { id: 'poser-repere', libelle: 'Repères : valeurs exactes…', onClick: () => arg.ouvrir('reperes') },
    { id: 'effacer-reperes', libelle: 'Effacer les repères', raccourci: 'Ctrl+Maj+;', desactive: !n, onClick: arg.effacer }
  ];
}

/** Repeter la selection : chaque element ouvre son panneau sur la toile, apercu compris. */
export function useElementsRepetition(separateur = false): ElementMenu[] {
  const { sel } = useDessin(), arg = useActionsRegles();
  const rien = !sel.length;
  return [
    { id: 'repeter-grille', libelle: TITRES_REPETITION.grille + '…', icone: 'repeter', separateur, desactive: rien, onClick: () => arg.ouvrir('grille') },
    { id: 'repeter-radiale', libelle: TITRES_REPETITION.radiale + '…', icone: 'radiale', desactive: rien, onClick: () => arg.ouvrir('radiale') },
    { id: 'repeter-symetrie', libelle: TITRES_REPETITION.symetrie + '…', icone: 'symetrie', desactive: rien, onClick: () => arg.ouvrir('symetrie') }
  ];
}
