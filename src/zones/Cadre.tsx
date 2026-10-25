// Le cadre de l'editeur : la grille des zones (barre, calques, toile, inspecteur, etat) et les petits
// panneaux qui s'y posent. Chaque zone lit seule ce qu'elle montre (contexteEditeur.tsx) ; le cadre ne
// lit que ce qui fait sa classe : l'outil, le tiroir, et ce qui retire une action pleine (menu, confirmation, contexte).

import { memo, useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { RegionVocale } from './RegionVocale.js';
import { Barre, BoutonEnregistrer } from './BarreOutils.js';
import { useTactile, useTelephone } from './Vue.js';
import { BarreSelection } from './BarreSelection.js';
import { Calques } from './Calques.js';
import { useClavier } from './Clavier.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Inspecteur } from './Inspecteur.js';
import { PanneauDessin } from './PanneauDessin.js';
import { PanneauCricut } from './Production.js';
import { ToileEditeur } from './ToileEditeur.js';
import { Bouton } from './commun/Bouton.js';
import { FournisseurMenusOuverts } from './commun/Menu.js';
import { FORMES, phraseAbandon } from './aidesEditeur.js';
import { pluriel, selonSaisie } from '../util/texte.js';
import type { Outil, Tiroir } from './typesEditeur.js';

/** Les raccourcis clavier : un composant sans rendu, pour que le crochet vive sous les contextes. */
function Raccourcis({ toile }: { toile: RefObject<HTMLDivElement | null> }) {
  useClavier(toile);
  return null;
}

/**
 * Le lien d'evitement : la toile vient apres la barre, la rangee de selection et les calques, soit des
 * dizaines de Tab. Invisible tant qu'il n'a pas le focus, c'est le premier arret du clavier. C'est un vrai
 * lien vers l'ancre de la toile (axe et les lecteurs d'ecran reconnaissent ainsi un lien d'evitement, ce
 * qu'un bouton n'est pas) ; le clic est retenu pour ne pas changer l'adresse de la page d'hote.
 */
function LienToile({ svgRef, idToile }: { svgRef: RefObject<SVGSVGElement | null>; idToile: string }) {
  return <a className="saut" href={'#' + idToile} onClick={e => { e.preventDefault(); svgRef.current?.focus(); }}>Aller à la toile</a>;
}

/** Le panneau de droite : l'inspecteur d'une selection, le panneau du dessin sinon (ou avec un outil de trace). */
function PanneauLateral({ nom }: { nom: string }) {
  const { sel } = useDessin(), { outil } = useInterface();
  return (
    <aside className="editeur-inspecteur" aria-label="Inspecteur" tabIndex={-1}>
      {/* Le panneau de production (ADR-0013) vient d'abord, avec ou sans selection : il juge le dessin entier. */}
      <PanneauCricut nom={nom} />
      {sel.length && !FORMES.has(outil) && outil !== 'plume' && outil !== 'texte' ? <Inspecteur /> : <PanneauDessin />}
    </aside>
  );
}

/**
 * La confirmation prend le focus a son apparition (sur « Continuer l'édition », le choix sans perte) et le
 * rend a ce qui l'avait quand elle disparait. Echap la referme (Clavier.ts). Elle n'est pas modale : Tab en sort.
 */
function ConfirmerAbandon() {
  const { h } = useDessin(), { quitter } = useInterface(), ac = useActions();
  const racine = useRef<HTMLDivElement>(null), idMessage = useId();
  useEffect(() => {
    if (!quitter) return;
    // La toile est un <svg> : un SVGElement se focalise comme un HTMLElement.
    const avant = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
    racine.current?.querySelector<HTMLButtonElement>('button.primaire')?.focus();
    return () => {
      // Si l'editeur se ferme, `avant` n'est plus dans la page et l'hote reprend son focus lui-meme (EditeurSvg).
      // Le focus etait dans la confirmation : en la retirant du DOM, il est tombe sur le corps de la page.
      if (avant?.isConnected && document.activeElement === document.body) avant.focus();
    };
  }, [quitter]);
  if (!quitter) return null;
  const n = h.passe.length;
  return (
    <div className="editeur-confirmer" role="alertdialog" aria-label="Abandonner les modifications" aria-describedby={idMessage} ref={racine}>
      <span id={idMessage}>{phraseAbandon(n)}</span>
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
  if (outil === 'plume') return nTrace ? nTrace + ' point' + (nTrace > 1 ? 's' : '') + ' · Entrée ou double-clic ferme le tracé, Retour arrière retire le dernier point, Échap abandonne.' : 'Plume : cliquez les points du tracé, ou au clavier : flèches puis Entrée.';
  if (FORMES.has(outil)) return 'Glissez sur la toile pour tracer (Maj : proportions), ou au clavier : flèches puis Entrée.';
  if (nSel) return nSel + ' sélectionnée' + (nSel > 1 ? 's' : '') + (outil === 'selection' ? ' · glissez pour déplacer, les coins pour redimensionner (Maj : proportions)' : '');
  return 'Cliquez une forme, ou tracez un cadre pour en choisir plusieurs ; au clavier, Page suivante choisit la première.';
}

function BarreEtat() {
  const { h, sel } = useDessin(), { tiroir, outil, trace, message } = useInterface(), ac = useActions();
  const telephone = useTelephone(), doigt = useTactile();
  return (
    <footer className="editeur-etat">
      <span className="tiroirs">
        <Bouton icone="panneau-gauche" aide="Calques" pressed={tiroir === 'calques'} onClick={() => ac.poserTiroir(tiroir === 'calques' ? null : 'calques')} />
        <Bouton icone="panneau-droit" aide="Inspecteur" pressed={tiroir === 'inspecteur'} onClick={() => ac.poserTiroir(tiroir === 'inspecteur' ? null : 'inspecteur')} />
      </span>
      <span className="message-etat">{selonSaisie(message || etatParDefaut(outil, trace.length, sel.length), doigt)}</span>
      <span className="espace" />
      <span className="compte-modifications">{pluriel(h.passe.length, 'modification')}</span>
      {telephone ? <BoutonEnregistrer /> : null}
    </footer>
  );
}

interface ProprietesCadre { titre: string; nom: string; toile: RefObject<HTMLDivElement | null>; svgRef: RefObject<SVGSVGElement | null> }

/**
 * Un tiroir qui s'ouvre prend le focus (le clavier doit pouvoir y entrer) ; en se fermant il le rend a son
 * bouton de la barre d'etat, a moins que le focus ait deja ete porte ailleurs. Ferme, un tiroir est
 * `visibility: hidden` : ses controles ne sont plus tabulables.
 */
function useFocusTiroir(cadre: RefObject<HTMLDivElement | null>, tiroir: Tiroir) {
  const avant = useRef<Tiroir>(null);
  useEffect(() => {
    const precedent = avant.current;
    avant.current = tiroir;
    const racine = cadre.current;
    if (!racine || tiroir === precedent) return;
    if (tiroir) { racine.querySelector<HTMLElement>(tiroir === 'calques' ? '.editeur-calques' : '.editeur-inspecteur')?.focus({ preventScroll: true }); return; }
    const actif = document.activeElement;
    const dansLeTiroir = !!actif && !!actif.closest('.editeur-calques, .editeur-inspecteur');
    if (actif === document.body || actif === null || dansLeTiroir) racine.querySelector<HTMLElement>('.editeur-etat button[aria-label="' + (precedent === 'calques' ? 'Calques' : 'Inspecteur') + '"]')?.focus();
  }, [cadre, tiroir]);
}

/**
 * Les etats du cadre qui retirent une action pleine (DESIGN.md, l'encre unique) : un menu ouvert (compte, les menus se signalent),
 * la confirmation d'abandon, un contexte de production dont le panneau porte l'export. Ce ne sont que des classes : le sens des
 * boutons ne change pas.
 */
function useClassesInstant(): { classes: string; signaler: (ouvert: boolean) => void } {
  const { quitter, profil } = useInterface();
  const [menus, poserMenus] = useState(0);
  const signaler = useCallback((ouvert: boolean) => poserMenus(n => Math.max(0, n + (ouvert ? 1 : -1))), []);
  return { classes: (menus ? ' menu-ouvert' : '') + (quitter ? ' confirmation-ouverte' : '') + (profil ? ' production' : ''), signaler };
}

export const Cadre = memo(function Cadre({ titre, nom, toile, svgRef }: ProprietesCadre) {
  const { outil, tiroir } = useInterface();
  const racine = useRef<HTMLDivElement>(null), idToile = useId();
  const { classes, signaler } = useClassesInstant();
  useFocusTiroir(racine, tiroir);
  return (
    <FournisseurMenusOuverts value={signaler}>
      <div className={'editeur-cadre outil-' + outil + (tiroir ? ' tiroir-' + tiroir : '') + classes} ref={racine}>
        <Raccourcis toile={toile} />
        <LienToile svgRef={svgRef} idToile={idToile} />
        <RegionVocale />
        <Barre titre={titre} nom={nom} />
        <BarreSelection />
        <ConfirmerAbandon />
        <Calques />
        <Voile />
        <ToileEditeur titre={titre} toile={toile} svgRef={svgRef} idToile={idToile} />
        <PanneauLateral nom={nom} />
        <BarreEtat />
      </div>
    </FournisseurMenusOuverts>
  );
});
