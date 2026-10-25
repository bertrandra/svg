// La rangee de la selection (ADR-0006) : ce qu'on fait d'un geste des formes choisies. Elle n'existe
// que quand quelque chose est choisi.

import { memo } from 'react';
import { aligner, retourner, sousChemins, tourner, type Alignement, type Ordre } from '../engine/editionSvg.js';
import type { Booleen } from '../engine/booleens.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useReperes } from './contexteGuide.js';
import { Bouton } from './commun/Bouton.js';
import { empiler } from './empilement.js';
import type { NomIcone } from './icones.js';
import { phraseAlignement, phraseMiroir } from './phrasesSelection.js';
import { phraseRotation } from './annonces.js';

const ALIGNEMENTS_ICONES: ReadonlyArray<readonly [Alignement, NomIcone, string]> = [
  ['gauche', 'aligner-gauche', 'Aligner à gauche'], ['centreH', 'aligner-centre-h', 'Centrer horizontalement'], ['droite', 'aligner-droite', 'Aligner à droite'],
  ['haut', 'aligner-haut', 'Aligner en haut'], ['centreV', 'aligner-centre-v', 'Centrer verticalement'], ['bas', 'aligner-bas', 'Aligner en bas']
];
const ORDRES_ICONES: ReadonlyArray<readonly [Ordre, NomIcone, string]> = [['premier', 'premier-plan', 'Premier plan (Ctrl+Maj+])'], ['avant', 'avancer', 'Avancer (Ctrl+])'], ['arriere', 'reculer', 'Reculer (Ctrl+[)'], ['dernier', 'arriere-plan', 'Arrière-plan (Ctrl+Maj+[)']];
export const BOOLEENS_ICONES: ReadonlyArray<readonly [Booleen, NomIcone, string]> = [
  ['union', 'union', 'Union : réunir les formes en une seule'], ['soustraction', 'soustraction', 'Soustraction : la plus basse moins les autres'],
  ['intersection', 'intersection', 'Intersection : ce que les formes ont en commun'], ['exclusion', 'exclusion', 'Exclusion : tout sauf les recouvrements']
];

/** La rangee de la selection : aligner, retourner, tourner, empiler, booleens, combiner, separer, et le reste d'un geste. */
export const BarreSelection = memo(function BarreSelection() {
  const { sel, formeSeule, dessin } = useDessin(), ac = useActions(), { rencontrer } = useReperes();
  if (!sel.length) return null;
  const separable = !!formeSeule && sousChemins(formeSeule.d).length > 1;
  const surPlan = sel.length > 1 ? '' : ' (sur le plan)';
  return (
    <div className="editeur-barre-selection" role="toolbar" aria-label="Sélection">
      <span className="aide">{sel.length} sélectionnée{sel.length > 1 ? 's' : ''}</span>
      <div className="groupe" role="group" aria-label="Aligner">
        {ALIGNEMENTS_ICONES.map(([a, icone, aide]) => <Bouton key={a} icone={icone} aide={aide + surPlan} onClick={() => ac.faire(d => aligner(d, sel, a), phraseAlignement(a, sel.length))} />)}
      </div>
      <div className="groupe" role="group" aria-label="Transformer">
        <Bouton icone="miroir-h" aide="Miroir horizontal" onClick={() => ac.faire(d => retourner(d, sel, 'h'), phraseMiroir('h'))} />
        <Bouton icone="miroir-v" aide="Miroir vertical" onClick={() => ac.faire(d => retourner(d, sel, 'v'), phraseMiroir('v'))} />
        <Bouton icone="rotation-gauche" aide="Tourner de 90° vers la gauche" onClick={() => ac.faire(d => tourner(d, sel, -90), phraseRotation(-90))} />
        <Bouton icone="rotation-droite" aide="Tourner de 90° vers la droite" onClick={() => ac.faire(d => tourner(d, sel, 90), phraseRotation(90))} />
      </div>
      <div className="groupe" role="group" aria-label="Empiler">
        {ORDRES_ICONES.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} onClick={() => empiler(ac, dessin, sel, o)} />)}
      </div>
      <div className="groupe" role="group" aria-label="Booléens">
        {BOOLEENS_ICONES.map(([op, icone, aide]) => <Bouton key={op} icone={icone} aide={aide} disabled={sel.length < 2} onClick={() => { if (ac.booleen(op)) rencontrer('booleen'); }} />)}
      </div>
      <div className="groupe" role="group" aria-label="Formes">
        <Bouton icone="combiner" aide="Combiner en une forme (Ctrl+G)" disabled={sel.length < 2} onClick={ac.combinerSelection} />
        <Bouton icone="separer" aide="Séparer les tracés (Ctrl+Maj+G)" disabled={!separable} onClick={ac.separerSelection} />
        <Bouton icone="dupliquer" aide="Dupliquer (Ctrl+D)" onClick={ac.dupliquerSelection} />
        <Bouton icone="masquer" aide="Masquer" onClick={ac.masquerSelection} />
        <Bouton icone="verrouiller" aide="Verrouiller" onClick={ac.verrouillerSelection} />
        <Bouton icone="supprimer" aide="Supprimer (Suppr)" className="danger" onClick={ac.supprimerSelection} />
      </div>
    </div>
  );
});
