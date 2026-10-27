// La rangee de la selection (ADR-0006) : ce qu'on fait d'un geste des formes choisies. Elle n'existe
// que quand quelque chose est choisi. Au doigt sur un petit ecran, elle garde le geste frequent et range
// le reste dans son menu « Plus » : rien n'est retire, mais rien ne se cache derriere un defilement.

import { memo } from 'react';
import { aligner, retourner, sousChemins, tourner, type Alignement, type Ordre } from '../engine/editionSvg.js';
import type { Booleen } from '../engine/booleens.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { aUnGroupe, groupesActifs } from './commandesGroupes.js';
import { useReperes } from './contexteGuide.js';
import { Bouton } from './commun/Bouton.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import { empiler } from './empilement.js';
import type { NomIcone } from './icones.js';
import { phraseAlignement, phraseMiroir } from './phrasesSelection.js';
import { phraseRotation } from './annonces.js';
import { useRangeeCompacte } from './Vue.js';
import { OperationSelection } from './OperationSelection.js';
import { DispositionSelection, useSectionDisposition } from './ChoixDisposition.js';
import { useElementsRepetition } from './menusOutilsPro.js';
import { MenuNuancierSelection } from './SectionNuancier.js';
import { useSectionNuancier } from './actionsNuancier.js';
import { dessinComplet } from './lentille.js';
import { t } from '../util/i18n.js';

// Des fonctions : les libelles se traduisent au rendu, une fois la langue posee (ADR-0042), jamais au chargement du module.
const alignementsIcones = (): ReadonlyArray<readonly [Alignement, NomIcone, string]> => [
  ['gauche', 'aligner-gauche', t('Aligner à gauche')], ['centreH', 'aligner-centre-h', t('Centrer horizontalement')], ['droite', 'aligner-droite', t('Aligner à droite')],
  ['haut', 'aligner-haut', t('Aligner en haut')], ['centreV', 'aligner-centre-v', t('Centrer verticalement')], ['bas', 'aligner-bas', t('Aligner en bas')]
];
/** L'ordre, son icone, son nom et son raccourci (l'infobulle les reunit, le menu les separe). */
const ordresIcones = (): ReadonlyArray<readonly [Ordre, NomIcone, string, string]> => [
  ['premier', 'premier-plan', t('Premier plan'), t('Ctrl+Maj+]')], ['avant', 'avancer', t('Avancer'), 'Ctrl+]'], ['arriere', 'reculer', t('Reculer'), 'Ctrl+['], ['dernier', 'arriere-plan', t('Arrière-plan'), t('Ctrl+Maj+[')]
];
export const booleensIcones = (): ReadonlyArray<readonly [Booleen, NomIcone, string]> => [
  ['union', 'union', t('Union : réunir les formes en une seule')], ['soustraction', 'soustraction', t('Soustraction : la plus basse moins les autres')],
  ['intersection', 'intersection', t('Intersection : ce que les formes ont en commun')], ['exclusion', 'exclusion', t('Exclusion : tout sauf les recouvrements')]
];

/** Les gestes de la rangee, une fois pour ses deux mises en page : chacun a son nom, son icone et ce qu'il fait. */
function useGestes() {
  const mo = useDessin(), { sel, formeSeule, dessin } = mo, ac = useActions(), { rencontrer } = useReperes(), { modele } = useInterface();
  const separable = !!formeSeule && sousChemins(formeSeule.d).length > 1;
  // Le modele riche (ADR-0012, etape 2) : Grouper et Degrouper rejoignent les formes, et prennent Ctrl+G a Combiner et Separer.
  const riche = groupesActifs(dessinComplet(mo), modele), degroupable = riche && aUnGroupe({ dessin, sel });
  const surPlan = sel.length > 1 ? '' : t(' (sur le plan)');
  return {
    sel, ac, surPlan,
    aligner: (a: Alignement) => ac.faire(d => aligner(d, sel, a), phraseAlignement(a, sel.length)),
    miroir: (sens: 'h' | 'v') => ac.faire(d => retourner(d, sel, sens), phraseMiroir(sens)),
    tourner: (angle: number) => ac.faire(d => tourner(d, sel, angle), phraseRotation(angle)),
    empiler: (o: Ordre) => empiler(ac, dessin, sel, o),
    // Le repere du premier booleen ne se montre que si l'operation a reussi (ADR-0019).
    booleen: (op: Booleen) => { if (ac.booleen(op)) rencontrer('booleen'); },
    separable, riche, degroupable
  };
}

/** La rangee de la selection : aligner, retourner, tourner, empiler, booleens, combiner, separer, et le reste d'un geste. */
export const BarreSelection = memo(function BarreSelection() {
  const { sel } = useDessin();
  const compacte = useRangeeCompacte();
  // Sans selection, la place de la rangee reste prise par une cale vide : la premiere selection ne pousse plus les panneaux et la
  // toile vers le bas (un double-clic tombait alors a cote de sa cible).
  if (!sel.length) return <div className="editeur-cale-selection" aria-hidden="true" />;
  return compacte ? <RangeeCompacte /> : <RangeeEntiere />;
});

export const libelleSelection = (n: number) => (n > 1 ? t('{n} sélectionnées', { n }) : t('{n} sélectionnée', { n }));

function RangeeEntiere() {
  const g = useGestes(), { sel, ac, surPlan } = g, repetition = useElementsRepetition();
  return (
    <div className="editeur-barre-selection" role="toolbar" aria-label={t('Sélection')}>
      <span className="aide">{libelleSelection(sel.length)}</span>
      <OperationSelection />
      <DispositionSelection />
      <div className="groupe" role="group" aria-label={t('Aligner')}>
        {alignementsIcones().map(([a, icone, aide]) => <Bouton key={a} icone={icone} aide={aide + surPlan} onClick={() => g.aligner(a)} />)}
      </div>
      <div className="groupe" role="group" aria-label={t('Transformer')}>
        <Bouton icone="miroir-h" aide={t('Miroir horizontal')} onClick={() => g.miroir('h')} />
        <Bouton icone="miroir-v" aide={t('Miroir vertical')} onClick={() => g.miroir('v')} />
        <Bouton icone="rotation-gauche" aide={t('Tourner de 90° vers la gauche')} onClick={() => g.tourner(-90)} />
        <Bouton icone="rotation-droite" aide={t('Tourner de 90° vers la droite')} onClick={() => g.tourner(90)} />
        {/* Repeter la selection (ADR-0038) : grille, radiale, symetrie, chacune dans son panneau sur la toile. */}
        <MenuDeroulant etiquette={t('Répéter : grille, radiale, symétrie')} icone="repeter" chevron={false} elements={repetition} />
      </div>
      <div className="groupe" role="group" aria-label={t('Empiler')}>
        {ordresIcones().map(([o, icone, nom, raccourci]) => <Bouton key={o} icone={icone} aide={nom + ' (' + raccourci + ')'} onClick={() => g.empiler(o)} />)}
      </div>
      <div className="groupe" role="group" aria-label={t('Booléens')}>
        {booleensIcones().map(([op, icone, aide]) => <Bouton key={op} icone={icone} aide={aide} disabled={sel.length < 2} onClick={() => g.booleen(op)} />)}
      </div>
      <div className="groupe" role="group" aria-label={t('Formes')}>
        {g.riche ? <>
          <Bouton icone="grouper" aide={t('Grouper (Ctrl+G)')} onClick={ac.grouper} />
          <Bouton icone="degrouper" aide={t('Dégrouper (Ctrl+Maj+G)')} disabled={!g.degroupable} onClick={ac.degrouper} />
        </> : null}
        <Bouton icone="combiner" aide={g.riche ? t('Combiner en une forme') : t('Combiner en une forme (Ctrl+G)')} disabled={sel.length < 2} onClick={ac.combinerSelection} />
        <Bouton icone="separer" aide={g.riche ? t('Séparer les tracés') : t('Séparer les tracés (Ctrl+Maj+G)')} disabled={!g.separable} onClick={ac.separerSelection} />
        <Bouton icone="dupliquer" aide={t('Dupliquer (Ctrl+D)')} onClick={ac.dupliquerSelection} />
        <Bouton icone="masquer" aide={t('Masquer')} onClick={ac.masquerSelection} />
        <Bouton icone="verrouiller" aide={t('Verrouiller')} onClick={ac.verrouillerSelection} />
        <Bouton icone="supprimer" aide={t('Supprimer (Suppr)')} className="danger" onClick={ac.supprimerSelection} />
      </div>
      <div className="groupe" role="group" aria-label={t('Nuancier')}>
        <MenuNuancierSelection />
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
  const disposition = useSectionDisposition(), repetition = useElementsRepetition();
  const nuancier = useSectionNuancier();
  const transformer: ElementMenu[] = [
    ...(complet ? [{ id: 'dupliquer', libelle: t('Dupliquer'), icone: 'dupliquer', raccourci: 'Ctrl+D', onClick: ac.dupliquerSelection } as const, { id: 'miroir-h', libelle: t('Miroir horizontal'), icone: 'miroir-h', onClick: () => g.miroir('h') } as const] : []),
    { id: 'miroir-v', libelle: t('Miroir vertical'), icone: 'miroir-v', onClick: () => g.miroir('v') },
    { id: 'rotation-gauche', libelle: t('Tourner de 90° vers la gauche'), icone: 'rotation-gauche', onClick: () => g.tourner(-90) },
    ...(complet ? [{ id: 'rotation-droite', libelle: t('Tourner de 90° vers la droite'), icone: 'rotation-droite', onClick: () => g.tourner(90) } as const] : [])
  ];
  return [
    ...(disposition ? [disposition] : []),
    { id: 'transformer', titre: t('Transformer'), elements: transformer },
    { id: 'repeter', titre: t('Répéter'), elements: repetition },
    { id: 'aligner', titre: t('Aligner') + surPlan, elements: alignementsIcones().map(([a, icone, nom]): ElementMenu => ({ id: 'aligner-' + a, libelle: nom, icone, onClick: () => g.aligner(a) })) },
    { id: 'empiler', titre: t('Empiler'), elements: ordresIcones().map(([o, icone, nom, raccourci]): ElementMenu => ({ id: 'ordre-' + o, libelle: nom, icone, raccourci, onClick: () => g.empiler(o) })) },
    { id: 'booleens', titre: t('Booléens'), elements: booleensIcones().map(([op, icone, nom]): ElementMenu => ({ id: 'booleen-' + op, libelle: nom, icone, desactive: sel.length < 2, onClick: () => g.booleen(op) })) },
    { id: 'formes', titre: t('Formes'), elements: [
      ...(g.riche ? [
        { id: 'grouper', libelle: t('Grouper'), icone: 'grouper', raccourci: 'Ctrl+G', onClick: ac.grouper },
        { id: 'degrouper', libelle: t('Dégrouper'), icone: 'degrouper', raccourci: t('Ctrl+Maj+G'), desactive: !g.degroupable, onClick: ac.degrouper }
      ] satisfies ElementMenu[] : []),
      { id: 'combiner', libelle: t('Combiner en une forme'), icone: 'combiner', ...(g.riche ? {} : { raccourci: 'Ctrl+G' }), desactive: sel.length < 2, onClick: ac.combinerSelection },
      { id: 'separer', libelle: t('Séparer les tracés'), icone: 'separer', ...(g.riche ? {} : { raccourci: t('Ctrl+Maj+G') }), desactive: !g.separable, onClick: ac.separerSelection },
      { id: 'masquer', libelle: t('Masquer'), icone: 'masquer', onClick: ac.masquerSelection },
      { id: 'verrouiller', libelle: t('Verrouiller'), icone: 'verrouiller', onClick: ac.verrouillerSelection }
    ] },
    nuancier
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
    <div className="editeur-barre-selection compacte" role="toolbar" aria-label={t('Sélection')}>
      <span className="aide">{libelleSelection(sel.length)}</span>
      <OperationSelection compacte />
      <div className="groupe" role="group" aria-label={t('Gestes fréquents')}>
        <Bouton icone="dupliquer" aide={t('Dupliquer (Ctrl+D)')} onClick={ac.dupliquerSelection} />
        <Bouton icone="miroir-h" aide={t('Miroir horizontal')} onClick={() => g.miroir('h')} />
        <Bouton icone="rotation-droite" aide={t('Tourner de 90° vers la droite')} onClick={() => g.tourner(90)} />
        <MenuDeroulant etiquette={t('Plus de gestes : aligner, empiler, booléens, combiner')} icone="options" chevron={false} alignement="droite" sections={sections} />
      </div>
      <div className="groupe" role="group" aria-label={t('Supprimer')}>
        <Bouton icone="supprimer" aide={t('Supprimer (Suppr)')} className="danger" onClick={ac.supprimerSelection} />
      </div>
    </div>
  );
}
