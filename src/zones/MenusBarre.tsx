// Les trois menus de la barre principale (ADR-0006) : Vue, Edition, Fichier. Chacun lit ce qu'il
// montre dans les contextes de l'editeur, pour que la barre n'ait ni a les connaitre ni a les passer.

import { useState } from 'react';
import { ecrireDessin } from '../engine/editionSvg.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { DialogueCredits } from './Credits.js';
import { ContenuExport } from './Exporter.js';
import { MenuDeroulant, type ElementMenu } from './commun/Menu.js';
import type { NomIcone } from './icones.js';
import type { Fond } from './typesEditeur.js';

const FONDS: ReadonlyArray<readonly [Fond, NomIcone, string]> = [['damier', 'fond-damier', 'Fond damier'], ['blanc', 'fond-blanc', 'Fond blanc'], ['sombre', 'fond-sombre', 'Fond sombre']];

export function MenuVue() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const { vues } = ui;
  const elements: ElementMenu[] = [
    { id: 'ajuster', libelle: 'Ajuster à l’écran', icone: 'ajuster', raccourci: '0', onClick: vues.ajuster },
    { id: 'reel', libelle: 'Taille réelle (100 %)', icone: 'taille-reelle', raccourci: '1', onClick: vues.centrer100 },
    { id: 'selection', libelle: 'Zoomer sur la sélection', icone: 'zoom-selection', raccourci: 'Z', desactive: !mo.sel.length, onClick: ac.zoomerSelection },
    { id: 'grille', libelle: 'Grille magnétique (pas ' + ui.pas + ')', raccourci: 'G', coche: ui.grille, separateur: true, onClick: () => ac.poserGrille(!ui.grille) },
    { id: 'aimants', libelle: 'Aimants vers les autres formes', raccourci: 'M', coche: ui.aimants, onClick: () => ac.poserAimants(!ui.aimants) },
    { id: 'contours', libelle: 'Vue contours', raccourci: 'O', coche: ui.contours, onClick: () => ac.poserContours(c => !c) },
    ...FONDS.map(([f, icone, libelle], i): ElementMenu => ({ id: 'fond-' + f, libelle, icone, coche: ui.fond === f, separateur: i === 0, onClick: () => ac.poserFond(f) }))
  ];
  return <MenuDeroulant etiquette="Vue" libelle="Vue" elements={elements} />;
}

export function MenuEdition() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const rien = !mo.sel.length;
  const elements: ElementMenu[] = [
    { id: 'annuler', libelle: 'Annuler', icone: 'annuler', raccourci: 'Ctrl+Z', desactive: !mo.h.passe.length, onClick: ac.defaire },
    { id: 'retablir', libelle: 'Rétablir', icone: 'retablir', raccourci: 'Ctrl+Maj+Z', desactive: !mo.h.futur.length, onClick: ac.refaire },
    { id: 'copier', libelle: 'Copier', icone: 'copier', raccourci: 'Ctrl+C', desactive: rien, separateur: true, onClick: ac.copierSelection },
    { id: 'couper', libelle: 'Couper', icone: 'couper', raccourci: 'Ctrl+X', desactive: rien, onClick: ac.couperSelection },
    { id: 'coller', libelle: 'Coller', icone: 'coller', raccourci: 'Ctrl+V', desactive: !mo.presse.length, onClick: ac.collerPresse },
    { id: 'dupliquer', libelle: 'Dupliquer', icone: 'dupliquer', raccourci: 'Ctrl+D', desactive: rien, onClick: ac.dupliquerSelection },
    { id: 'tout', libelle: 'Tout sélectionner', icone: 'tout-selectionner', raccourci: 'Ctrl+A', separateur: true, desactive: !mo.dessin.formes.length, onClick: () => ac.choisir(mo.dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id)) },
    { id: 'meme-couleur', libelle: 'Sélectionner la même couleur', icone: 'palette', raccourci: 'C', desactive: rien, onClick: ac.choisirMemeCouleur },
    { id: 'aucun', libelle: 'Ne rien sélectionner', icone: 'aucune-selection', raccourci: 'Échap', desactive: rien, onClick: () => { ac.choisir([]); ac.poserPoint(null); } },
    { id: 'lisser-booleens', libelle: 'Booléens : rebâtir les courbes', coche: ui.lisserBooleens, separateur: true, onClick: () => ac.poserLisserBooleens(!ui.lisserBooleens) },
    { id: 'supprimer', libelle: 'Supprimer', icone: 'supprimer', raccourci: 'Suppr', danger: true, separateur: true, desactive: rien, onClick: ac.supprimerSelection }
  ];
  return <MenuDeroulant etiquette="Édition" libelle="Édition" elements={elements} />;
}

/** Fichier : enregistrer, telecharger, copier, credits, fermer, et les formats d'export en dessous. */
export function MenuFichier({ nom }: { nom: string }) {
  const mo = useDessin(), ac = useActions();
  const [credits, poserCredits] = useState(false);
  const elements: ElementMenu[] = [
    { id: 'enregistrer', libelle: 'Enregistrer', icone: 'enregistrer', raccourci: 'Ctrl+S', desactive: !mo.h.passe.length, onClick: ac.enregistrerTout },
    { id: 'telecharger', libelle: 'Télécharger le SVG', icone: 'telecharger', onClick: () => { void proposer(nom + '.svg', texteOctets(ecrireDessin(mo.dessin, 3))).then(ac.dire); } },
    { id: 'copier-code', libelle: 'Copier le code SVG', icone: 'copier', onClick: () => { void copier(ecrireDessin(mo.dessin, 3)).then(ok => ac.dire(ok ? 'Code SVG copié.' : 'La page n’a pas le droit d’écrire dans le presse-papiers.')); } },
    { id: 'credits', libelle: 'À propos et crédits', onClick: () => poserCredits(true) },
    { id: 'fermer', libelle: 'Fermer l’éditeur', icone: 'fermer', raccourci: 'Échap', separateur: true, onClick: ac.demanderFermeture }
  ];
  return (
    <>
      <MenuDeroulant etiquette="Fichier" libelle="Fichier" alignement="droite" elements={elements}
        enfants={<><hr className="menu-filet" /><p className="menu-titre">Exporter</p><ContenuExport svg="" dessin={mo.dessin} nom={nom} dire={ac.dire} /></>} />
      {/* Posee dans la racine de l'editeur : ses styles y sont cantonnes, et le reste de l'editeur devient inerte derriere elle. */}
      {credits ? <DialogueCredits fermer={() => poserCredits(false)} conteneur={document.querySelector<HTMLElement>('.editeur-svg') ?? document.body} /> : null}
    </>
  );
}
