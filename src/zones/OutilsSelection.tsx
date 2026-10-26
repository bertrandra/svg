// Les outils de selection dans la barre (ADR-0035, ADR-0006 : le frequent dans la barre, le rare dans un menu). Un seul bouton
// reprend le dernier outil de selection employe (Selection, Cadre, Lasso), comme celui des formes ; son chevron liste les trois
// avec leur raccourci, puis ce que le cadre et le lasso prennent : les formes touchees (defaut) ou entierement dedans. Au doigt,
// le bouton et le chevron ont la cible de 40 px de la barre : le Cadre y est le seul moyen de choisir plusieurs formes d'un geste.
// Sur un telephone, « Points et poignees » rejoint ce menu (`avecPoints`) : sa cible de 40 px laisse la place au chevron, et la
// ligne des outils tient encore dans 320 px.

import { useEffect, useState } from 'react';
import { useActions, useInterface } from './contexteEditeur.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu } from './commun/Menu.js';
import { estOutilSelection, LIBELLES_REGLE, OUTILS_SELECTION, type OutilSelection } from './commandesSelection.js';
import type { NomIcone } from './icones.js';
import type { Outil } from './typesEditeur.js';

interface OutilDuMenu { readonly outil: Outil; readonly icone: NomIcone; readonly libelle: string; readonly raccourci: string }

/** « Points et poignees », que le menu ne porte que sur un telephone. */
const POINTS: OutilDuMenu = { outil: 'points', icone: 'points', libelle: 'Points et poignées', raccourci: 'A' };

/**
 * Ce que dit l'infobulle d'un outil, qui est aussi son nom : son nom, son raccourci, ses touches. La regle n'y est pas : un nom qui
 * changerait avec elle serait relu ; le menu la coche et la barre d'etat la dit.
 */
function aideOutil(o: OutilDuMenu): string {
  return o.libelle + ' (' + o.raccourci + ')' + (o.outil === 'cadre' ? ' : glissez, même sur une forme · Maj ajoute, Alt retire' : o.outil === 'lasso' ? ' : entourez à main levée · Maj ajoute, Alt retire' : '');
}

export function OutilSelectionBarre({ avecPoints = false }: { avecPoints?: boolean }) {
  const { outil, regleZone } = useInterface(), ac = useActions();
  const famille: readonly OutilDuMenu[] = avecPoints ? [OUTILS_SELECTION[0], POINTS, OUTILS_SELECTION[1], OUTILS_SELECTION[2]] : OUTILS_SELECTION;
  const [dernier, poserDernier] = useState<OutilSelection | 'points'>('selection');
  useEffect(() => { if (estOutilSelection(outil) || (avecPoints && outil === 'points')) poserDernier(outil); }, [outil, avecPoints]);
  const courant = famille.find(o => o.outil === dernier) ?? OUTILS_SELECTION[0];
  const outils: ElementMenu[] = famille.map(o => ({ id: o.outil, libelle: o.libelle, icone: o.icone, raccourci: o.raccourci, radio: true, coche: outil === o.outil, onClick: () => ac.poserOutil(o.outil) }));
  const regles: ElementMenu[] = (['touche', 'dedans'] as const).map(r => ({ id: 'regle-' + r, libelle: LIBELLES_REGLE[r], radio: true, coche: regleZone === r, onClick: () => ac.poserRegleZone(r) }));
  return (
    <span className="outil-selection-groupe">
      <Bouton icone={courant.icone} aide={aideOutil(courant)} pressed={outil === courant.outil} onClick={() => ac.poserOutil(courant.outil)} />
      <MenuDeroulant etiquette="Choisir un outil de sélection" className="chevron-seul"
        sections={[{ id: 'outils', titre: 'Outil de sélection', elements: outils }, { id: 'regle', titre: 'Le cadre et le lasso prennent', elements: regles }]} />
    </span>
  );
}
