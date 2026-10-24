// Le cadre de l'editeur : la grille des zones (barre, calques, toile, inspecteur, etat) et les petits
// panneaux qui s'y posent. Chaque zone lit seule ce qu'elle montre (contexteEditeur.tsx) ; le cadre ne
// lit que l'outil et le tiroir, pour sa classe.

import { memo, type RefObject } from 'react';
import { Barre } from './BarreOutils.js';
import { BarreSelection } from './BarreSelection.js';
import { Calques } from './Calques.js';
import { useClavier } from './Clavier.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Inspecteur } from './Inspecteur.js';
import { PanneauDessin } from './PanneauDessin.js';
import { ToileEditeur } from './ToileEditeur.js';
import { Bouton } from './commun/Bouton.js';
import { FORMES } from './aidesEditeur.js';
import { pluriel } from '../util/texte.js';
import type { Outil } from './typesEditeur.js';

/** Les raccourcis clavier : un composant sans rendu, pour que le crochet vive sous les contextes. */
function Raccourcis() {
  useClavier();
  return null;
}

/** Le panneau de droite : l'inspecteur d'une selection, le panneau du dessin sinon (ou avec un outil de trace). */
function PanneauLateral() {
  const { sel } = useDessin(), { outil } = useInterface();
  return (
    <aside className="editeur-inspecteur" aria-label="Inspecteur">
      {sel.length && !FORMES.has(outil) && outil !== 'plume' && outil !== 'texte' ? <Inspecteur /> : <PanneauDessin />}
    </aside>
  );
}

function ConfirmerAbandon() {
  const { h } = useDessin(), { quitter } = useInterface(), ac = useActions();
  if (!quitter) return null;
  const n = h.passe.length;
  return (
    <div className="editeur-confirmer" role="alertdialog" aria-label="Abandonner les modifications">
      <span>Abandonner les {n} modification{n > 1 ? 's' : ''} non enregistrée{n > 1 ? 's' : ''} ?</span>
      <button type="button" onClick={ac.fermer}>Abandonner</button>
      <button type="button" className="primaire" onClick={ac.continuerEdition}>Continuer l’édition</button>
    </div>
  );
}

/** Le voile qui ferme le tiroir ouvert, au doigt. */
function Voile() {
  const { tiroir } = useInterface(), ac = useActions();
  return tiroir ? <div className="voile" aria-hidden="true" onClick={() => ac.poserTiroir(null)} /> : null;
}

function etatParDefaut(outil: Outil, nTrace: number, nSel: number): string {
  if (outil === 'plume') return nTrace ? nTrace + ' point' + (nTrace > 1 ? 's' : '') + ' · Entrée ou double-clic ferme le tracé, Retour arrière retire le dernier point, Échap abandonne.' : 'Plume : cliquez les points du tracé.';
  if (FORMES.has(outil)) return 'Glissez sur la toile pour tracer (Maj : proportions).';
  if (nSel) return nSel + ' sélectionnée' + (nSel > 1 ? 's' : '') + (outil === 'selection' ? ' · glissez pour déplacer, les coins pour redimensionner (Maj : proportions)' : '');
  return 'Cliquez une forme, ou tracez un cadre pour en choisir plusieurs.';
}

function BarreEtat() {
  const { h, sel } = useDessin(), { tiroir, outil, trace, message } = useInterface(), ac = useActions();
  return (
    <footer className="editeur-etat" role="status">
      <span className="tiroirs">
        <Bouton icone="panneau-gauche" aide="Calques" pressed={tiroir === 'calques'} onClick={() => ac.poserTiroir(tiroir === 'calques' ? null : 'calques')} />
        <Bouton icone="panneau-droit" aide="Inspecteur" pressed={tiroir === 'inspecteur'} onClick={() => ac.poserTiroir(tiroir === 'inspecteur' ? null : 'inspecteur')} />
      </span>
      <span className="message-etat">{message || etatParDefaut(outil, trace.length, sel.length)}</span>
      <span className="espace" />
      {pluriel(h.passe.length, 'modification')}
    </footer>
  );
}

interface ProprietesCadre { titre: string; nom: string; toile: RefObject<HTMLDivElement | null>; svgRef: RefObject<SVGSVGElement | null> }

export const Cadre = memo(function Cadre({ titre, nom, toile, svgRef }: ProprietesCadre) {
  const { outil, tiroir } = useInterface();
  return (
    <div className={'editeur-cadre outil-' + outil + (tiroir ? ' tiroir-' + tiroir : '')}>
      <Raccourcis />
      <Barre titre={titre} nom={nom} />
      <BarreSelection />
      <ConfirmerAbandon />
      <Calques />
      <Voile />
      <ToileEditeur titre={titre} toile={toile} svgRef={svgRef} />
      <PanneauLateral />
      <BarreEtat />
    </div>
  );
});
