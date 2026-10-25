// Les trois menus de la barre principale (ADR-0006) : Vue, Edition, Fichier. Chacun lit ce qu'il
// montre dans les contextes de l'editeur, pour que la barre n'ait ni a les connaitre ni a les passer.

import { useState } from 'react';
import { sousChemins } from '../engine/editionSvg.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSignalVisite } from './contexteGuide.js';
import { useBoiteRaccourcis, useElementsAide } from './AideEditeur.js';
import { DialogueCredits } from './Credits.js';
import { ContenuExport } from './Exporter.js';
import { allerAuChamp } from './OutilsTrace.js';
import { svgDocument } from './actionsProduction.js';
import { useRubriquesProduction } from './Production.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import type { NomIcone } from './icones.js';
import type { Fond } from './typesEditeur.js';

const FONDS: ReadonlyArray<readonly [Fond, NomIcone, string]> = [['damier', 'fond-damier', 'Fond damier'], ['blanc', 'fond-blanc', 'Fond blanc'], ['sombre', 'fond-sombre', 'Fond sombre']];

/** Les elements du menu Vue. `avecZoom` ajoute zoomer et dezoomer, que la barre des petits ecrans ne porte plus. */
function useElementsVue(avecZoom: boolean): ElementMenu[] {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const { vues } = ui;
  return [
    ...(avecZoom ? [
      { id: 'zoomer', libelle: 'Zoomer', icone: 'zoom-plus', raccourci: '+', onClick: () => vues.zoomer(1.25) },
      { id: 'dezoomer', libelle: 'Dézoomer', icone: 'zoom-moins', raccourci: '-', onClick: () => vues.zoomer(0.8) }
    ] satisfies ElementMenu[] : []),
    { id: 'ajuster', libelle: 'Ajuster à l’écran', icone: 'ajuster', raccourci: '0', onClick: vues.ajuster },
    { id: 'reel', libelle: 'Taille réelle (100 %)', icone: 'taille-reelle', raccourci: '1', onClick: vues.centrer100 },
    { id: 'selection', libelle: 'Zoomer sur la sélection', icone: 'zoom-selection', raccourci: 'Z', desactive: !mo.sel.length, onClick: ac.zoomerSelection },
    { id: 'grille', libelle: 'Grille magnétique (pas ' + ui.pas + ')', raccourci: 'G', coche: ui.grille, separateur: true, onClick: () => ac.poserGrille(!ui.grille) },
    { id: 'aimants', libelle: 'Aimants vers les autres formes', raccourci: 'M', coche: ui.aimants, onClick: () => ac.poserAimants(!ui.aimants) },
    { id: 'contours', libelle: 'Vue contours', raccourci: 'O', coche: ui.contours, onClick: () => ac.poserContours(c => !c) },
    ...FONDS.map(([f, icone, libelle], i): ElementMenu => ({ id: 'fond-' + f, libelle, icone, coche: ui.fond === f, separateur: i === 0, onClick: () => ac.poserFond(f) }))
  ];
}

export function MenuVue() {
  return <MenuDeroulant etiquette="Vue" libelle="Vue" elements={useElementsVue(false)} />;
}

function useElementsEdition(): ElementMenu[] {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const rien = !mo.sel.length;
  return [
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
    { id: 'contour-en-forme', libelle: 'Contour en forme', separateur: true, desactive: rien, onClick: ac.contourEnForme },
    { id: 'decaler-contour', libelle: 'Décaler le contour…', desactive: rien, onClick: () => allerAuChamp(ac, 'decalage') },
    { id: 'arrondir-angles', libelle: 'Arrondir les angles…', desactive: rien, onClick: () => allerAuChamp(ac, 'rayon') },
    { id: 'joindre-traces', libelle: 'Joindre ou fermer les tracés', desactive: mo.sel.length < 1 || mo.sel.length > 2, onClick: ac.joindreSelection },
    { id: 'inverser-sens', libelle: 'Inverser le sens du tracé', desactive: rien, onClick: ac.inverserSens },
    { id: 'combiner', libelle: 'Combiner en un tracé composé', icone: 'combiner', raccourci: 'Ctrl+G', desactive: mo.sel.length < 2, onClick: ac.combinerSelection },
    { id: 'separer', libelle: 'Séparer les tracés', icone: 'separer', raccourci: 'Ctrl+Maj+G', desactive: !mo.formeSeule || sousChemins(mo.formeSeule.d).length < 2, onClick: ac.separerSelection },
    { id: 'supprimer', libelle: 'Supprimer', icone: 'supprimer', raccourci: 'Suppr', danger: true, separateur: true, desactive: rien, onClick: ac.supprimerSelection }
  ];
}

export function MenuEdition() {
  return <MenuDeroulant etiquette="Édition" libelle="Édition" elements={useElementsEdition()} />;
}

/** Les elements du menu Fichier : enregistrer, telecharger, copier, credits, fermer. */
function useElementsFichier(nom: string, poserCredits: (ouvert: boolean) => void): ElementMenu[] {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), signaler = useSignalVisite();
  const svg = () => svgDocument(mo.dessin, ui.production);
  // Chaque facon de recuperer le dessin acheve l'etape « Récupérez votre dessin » de la visite (sans visite, rien).
  return [
    { id: 'enregistrer', libelle: 'Enregistrer', icone: 'enregistrer', raccourci: 'Ctrl+S', desactive: !mo.h.passe.length && !ui.productionModifiee, onClick: () => { signaler('recupere'); ac.enregistrerTout(); } },
    { id: 'telecharger', libelle: 'Télécharger le SVG', icone: 'telecharger', onClick: () => { void proposer(nom + '.svg', texteOctets(svg())).then(m => { ac.dire(m); signaler('recupere'); }); } },
    { id: 'copier-code', libelle: 'Copier le code SVG', icone: 'copier', onClick: () => { void copier(svg()).then(ok => { ac.dire(ok ? 'Code SVG copié.' : 'La page n’a pas le droit d’écrire dans le presse-papiers.'); if (ok) signaler('recupere'); }); } },
    { id: 'credits', libelle: 'À propos et crédits', onClick: () => poserCredits(true) },
    { id: 'fermer', libelle: 'Fermer l’éditeur', icone: 'fermer', raccourci: 'Échap', separateur: true, onClick: ac.demanderFermeture }
  ];
}

/** Le panneau d'export, sous les elements du menu Fichier. */
function PanneauExport({ nom }: { nom: string }) {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), signaler = useSignalVisite();
  // Un export dit son issue par `dire` : c'est aussi le signal qu'un fichier a ete recupere (visite guidee).
  const dire = (t: string) => { ac.dire(t); signaler('recupere'); };
  return <><hr className="menu-filet" /><p className="menu-titre">Exporter</p><ContenuExport svg="" dessin={mo.dessin} nom={nom} dire={dire} {...(ui.profil ? { pourCricut: () => { ac.exporterPourCricut(nom); signaler('recupere'); } } : {})} /></>;
}

/** La boite des credits : posee dans la racine de l'editeur, ses styles y sont cantonnes, et le reste de l'editeur devient inerte derriere elle. */
function BoiteCredits({ fermer }: { fermer: () => void }) {
  return <DialogueCredits fermer={fermer} conteneur={document.querySelector<HTMLElement>('.editeur-svg') ?? document.body} />;
}

/** Fichier : enregistrer, telecharger, copier, credits, fermer, et les formats d'export en dessous. */
export function MenuFichier({ nom }: { nom: string }) {
  const [credits, poserCredits] = useState(false);
  const elements = useElementsFichier(nom, poserCredits);
  return (
    <>
      <MenuDeroulant etiquette="Fichier" libelle="Fichier" alignement="droite" elements={elements} enfants={<PanneauExport nom={nom} />} />
      {credits ? <BoiteCredits fermer={() => poserCredits(false)} /> : null}
    </>
  );
}

/**
 * « Plus » : sous une largeur de telephone, la barre ne porte plus que les outils, les couleurs et l'historique ; Vue, Edition et
 * Fichier (avec ses exports) tiennent dans ce seul menu, rubrique par rubrique, chacune avec ses raccourcis. Le zoom y entre aussi.
 */
export function MenuPlus({ nom }: { nom: string }) {
  const [credits, poserCredits] = useState(false);
  const raccourcis = useBoiteRaccourcis();
  const vue = useElementsVue(true), edition = useElementsEdition(), fichier = useElementsFichier(nom, poserCredits), production = useRubriquesProduction();
  const aide = useElementsAide(raccourcis.ouvrir);
  const sections: SectionMenu[] = [
    // L'aide d'abord : un debutant qui ouvre « Plus » la voit sans faire defiler un menu que l'export allonge.
    { id: 'aide', titre: 'Aide', elements: aide },
    { id: 'vue', titre: 'Vue', elements: vue },
    { id: 'fichier', titre: 'Fichier', elements: fichier, libre: <PanneauExport nom={nom} /> },
    { id: 'edition', titre: 'Édition', elements: edition },
    // Le contexte de production (ADR-0013) : la barre du bureau le porte, le telephone le range ici, en dernier.
    ...production
  ];
  return (
    <>
      <MenuDeroulant etiquette="Plus d’actions : vue, édition, fichier" icone="options" chevron={false} alignement="droite" sections={sections} />
      {credits ? <BoiteCredits fermer={() => poserCredits(false)} /> : null}
      {raccourcis.boite}
    </>
  );
}
