// La rangee de la selection (ADR-0006) : ce qu'on fait d'un geste des formes choisies. Elle n'existe
// que quand quelque chose est choisi. Au doigt sur un petit ecran, elle garde le geste frequent et range
// le reste dans son menu « Plus » : rien n'est retire, mais rien ne se cache derriere un defilement.

import { memo } from 'react';
import { aligner, retourner, sousChemins, tourner, type Alignement, type Ordre } from '../engine/editionSvg.js';
import type { Booleen } from '../engine/booleens.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useReperes } from './contexteGuide.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import { empiler } from './empilement.js';
import type { NomIcone } from './icones.js';
import { phraseAlignement, phraseMiroir } from './phrasesSelection.js';
import { phraseRotation } from './annonces.js';
import { useRangeeCompacte } from './Vue.js';

const ALIGNEMENTS_ICONES: ReadonlyArray<readonly [Alignement, NomIcone, string]> = [
  ['gauche', 'aligner-gauche', 'Aligner à gauche'], ['centreH', 'aligner-centre-h', 'Centrer horizontalement'], ['droite', 'aligner-droite', 'Aligner à droite'],
  ['haut', 'aligner-haut', 'Aligner en haut'], ['centreV', 'aligner-centre-v', 'Centrer verticalement'], ['bas', 'aligner-bas', 'Aligner en bas']
];
/** L'ordre, son icone, son nom et son raccourci (l'infobulle les reunit, le menu les separe). */
const ORDRES_ICONES: ReadonlyArray<readonly [Ordre, NomIcone, string, string]> = [
  ['premier', 'premier-plan', 'Premier plan', 'Ctrl+Maj+]'], ['avant', 'avancer', 'Avancer', 'Ctrl+]'], ['arriere', 'reculer', 'Reculer', 'Ctrl+['], ['dernier', 'arriere-plan', 'Arrière-plan', 'Ctrl+Maj+[']
];
export const BOOLEENS_ICONES: ReadonlyArray<readonly [Booleen, NomIcone, string]> = [
  ['union', 'union', 'Union : réunir les formes en une seule'], ['soustraction', 'soustraction', 'Soustraction : la plus basse moins les autres'],
  ['intersection', 'intersection', 'Intersection : ce que les formes ont en commun'], ['exclusion', 'exclusion', 'Exclusion : tout sauf les recouvrements']
];

/** Les gestes de la rangee, une fois pour ses deux mises en page : chacun a son nom, son icone et ce qu'il fait. */
function useGestes() {
  const { sel, formeSeule, dessin } = useDessin(), ac = useActions(), { rencontrer } = useReperes();
  const separable = !!formeSeule && sousChemins(formeSeule.d).length > 1;
  const surPlan = sel.length > 1 ? '' : ' (sur le plan)';
  return {
    sel, ac, surPlan,
    aligner: (a: Alignement) => ac.faire(d => aligner(d, sel, a), phraseAlignement(a, sel.length)),
    miroir: (sens: 'h' | 'v') => ac.faire(d => retourner(d, sel, sens), phraseMiroir(sens)),
    tourner: (angle: number) => ac.faire(d => tourner(d, sel, angle), phraseRotation(angle)),
    empiler: (o: Ordre) => empiler(ac, dessin, sel, o),
    // Le repere du premier booleen ne se montre que si l'operation a reussi (ADR-0019).
    booleen: (op: Booleen) => { if (ac.booleen(op)) rencontrer('booleen'); },
    separable
  };
}

/** La rangee de la selection : aligner, retourner, tourner, empiler, booleens, combiner, separer, et le reste d'un geste. */
export const BarreSelection = memo(function BarreSelection() {
  const { sel } = useDessin();
  const compacte = useRangeeCompacte();
  if (!sel.length) return null;
  return compacte ? <RangeeCompacte /> : <RangeeEntiere />;
});

export const libelleSelection = (n: number) => n + ' sélectionnée' + (n > 1 ? 's' : '');

function RangeeEntiere() {
  const g = useGestes(), { sel, ac, surPlan } = g;
  return (
    <div className="editeur-barre-selection" role="toolbar" aria-label="Sélection">
      <span className="aide">{libelleSelection(sel.length)}</span>
      <div className="groupe" role="group" aria-label="Aligner">
        {ALIGNEMENTS_ICONES.map(([a, icone, aide]) => <Bouton key={a} icone={icone} aide={aide + surPlan} onClick={() => g.aligner(a)} />)}
      </div>
      <div className="groupe" role="group" aria-label="Transformer">
        <Bouton icone="miroir-h" aide="Miroir horizontal" onClick={() => g.miroir('h')} />
        <Bouton icone="miroir-v" aide="Miroir vertical" onClick={() => g.miroir('v')} />
        <Bouton icone="rotation-gauche" aide="Tourner de 90° vers la gauche" onClick={() => g.tourner(-90)} />
        <Bouton icone="rotation-droite" aide="Tourner de 90° vers la droite" onClick={() => g.tourner(90)} />
      </div>
      <div className="groupe" role="group" aria-label="Empiler">
        {ORDRES_ICONES.map(([o, icone, nom, raccourci]) => <Bouton key={o} icone={icone} aide={nom + ' (' + raccourci + ')'} onClick={() => g.empiler(o)} />)}
      </div>
      <div className="groupe" role="group" aria-label="Booléens">
        {BOOLEENS_ICONES.map(([op, icone, aide]) => <Bouton key={op} icone={icone} aide={aide} disabled={sel.length < 2} onClick={() => g.booleen(op)} />)}
      </div>
      <div className="groupe" role="group" aria-label="Formes">
        <Bouton icone="combiner" aide="Combiner en une forme (Ctrl+G)" disabled={sel.length < 2} onClick={ac.combinerSelection} />
        <Bouton icone="separer" aide="Séparer les tracés (Ctrl+Maj+G)" disabled={!g.separable} onClick={ac.separerSelection} />
        <Bouton icone="dupliquer" aide="Dupliquer (Ctrl+D)" onClick={ac.dupliquerSelection} />
        <Bouton icone="masquer" aide="Masquer" onClick={ac.masquerSelection} />
        <Bouton icone="verrouiller" aide="Verrouiller" onClick={ac.verrouillerSelection} />
        <Bouton icone="supprimer" aide="Supprimer (Suppr)" className="danger" onClick={ac.supprimerSelection} />
      </div>
    </div>
  );
}

/**
 * Les gestes de la selection en rubriques de menu : ce que porte le menu « Plus » de la rangee resserree (sans les trois gestes
 * qu'elle montre), ou, `complet`, le menu de la barre de texte qui prend la place de la rangee (ADR-0027) : rien n'est retire.
 */
export function useSectionsSelection(complet: boolean): SectionMenu[] {
  const g = useGestes(), { sel, ac, surPlan } = g;
  const transformer: ElementMenu[] = [
    ...(complet ? [{ id: 'dupliquer', libelle: 'Dupliquer', icone: 'dupliquer', raccourci: 'Ctrl+D', onClick: ac.dupliquerSelection } as const, { id: 'miroir-h', libelle: 'Miroir horizontal', icone: 'miroir-h', onClick: () => g.miroir('h') } as const] : []),
    { id: 'miroir-v', libelle: 'Miroir vertical', icone: 'miroir-v', onClick: () => g.miroir('v') },
    { id: 'rotation-gauche', libelle: 'Tourner de 90° vers la gauche', icone: 'rotation-gauche', onClick: () => g.tourner(-90) },
    ...(complet ? [{ id: 'rotation-droite', libelle: 'Tourner de 90° vers la droite', icone: 'rotation-droite', onClick: () => g.tourner(90) } as const] : [])
  ];
  return [
    { id: 'transformer', titre: 'Transformer', elements: transformer },
    { id: 'aligner', titre: 'Aligner' + surPlan, elements: ALIGNEMENTS_ICONES.map(([a, icone, nom]): ElementMenu => ({ id: 'aligner-' + a, libelle: nom, icone, onClick: () => g.aligner(a) })) },
    { id: 'empiler', titre: 'Empiler', elements: ORDRES_ICONES.map(([o, icone, nom, raccourci]): ElementMenu => ({ id: 'ordre-' + o, libelle: nom, icone, raccourci, onClick: () => g.empiler(o) })) },
    { id: 'booleens', titre: 'Booléens', elements: BOOLEENS_ICONES.map(([op, icone, nom]): ElementMenu => ({ id: 'booleen-' + op, libelle: nom, icone, desactive: sel.length < 2, onClick: () => g.booleen(op) })) },
    { id: 'formes', titre: 'Formes', elements: [
      { id: 'combiner', libelle: 'Combiner en une forme', icone: 'combiner', raccourci: 'Ctrl+G', desactive: sel.length < 2, onClick: ac.combinerSelection },
      { id: 'separer', libelle: 'Séparer les tracés', icone: 'separer', raccourci: 'Ctrl+Maj+G', desactive: !g.separable, onClick: ac.separerSelection },
      { id: 'masquer', libelle: 'Masquer', icone: 'masquer', onClick: ac.masquerSelection },
      { id: 'verrouiller', libelle: 'Verrouiller', icone: 'verrouiller', onClick: ac.verrouillerSelection }
    ] }
  ];
}

/**
 * Au doigt sur un petit ecran (390 px) : le compte, les trois gestes qu'on fait le plus d'un doigt (dupliquer, retourner, tourner),
 * le menu « Plus » qui porte tout le reste, rubrique par rubrique, et Supprimer a part, au bout. La rangee entiere demandait 1 155 px.
 */
function RangeeCompacte() {
  const g = useGestes(), { sel, ac } = g;
  const sections = useSectionsSelection(false);
  return (
    <div className="editeur-barre-selection compacte" role="toolbar" aria-label="Sélection">
      <span className="aide">{libelleSelection(sel.length)}</span>
      <div className="groupe" role="group" aria-label="Gestes fréquents">
        <Bouton icone="dupliquer" aide="Dupliquer (Ctrl+D)" onClick={ac.dupliquerSelection} />
        <Bouton icone="miroir-h" aide="Miroir horizontal" onClick={() => g.miroir('h')} />
        <Bouton icone="rotation-droite" aide="Tourner de 90° vers la droite" onClick={() => g.tourner(90)} />
        <MenuDeroulant etiquette="Plus de gestes : aligner, empiler, booléens, combiner" icone="options" chevron={false} alignement="droite" sections={sections} />
      </div>
      <div className="groupe" role="group" aria-label="Supprimer">
        <Bouton icone="supprimer" aide="Supprimer (Suppr)" className="danger" onClick={ac.supprimerSelection} />
      </div>
    </div>
  );
}
