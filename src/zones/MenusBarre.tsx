// Les trois menus de la barre principale (ADR-0006) : Vue, Edition, Fichier. Chacun lit ce qu'il
// montre dans les contextes de l'editeur, pour que la barre n'ait ni a les connaitre ni a les passer.

import { useEffect, useState } from 'react';
import { sousChemins } from '../engine/editionSvg.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSignalVisite } from './contexteGuide.js';
import { useBoiteRaccourcis, useElementsAide } from './AideEditeur.js';
import { DialogueCredits, type PoliceCreditee } from './Credits.js';
import { useTexte } from './contexteTexte.js';
import { estIdCatalogue } from '../model/cataloguePolices.js';
import { LICENCES_POLICES, sourcePolices } from '../model/sourcesPolices.js';
import { variantesEmployees } from '../io/policesEnLigne.js';
import { allerAuChamp } from './OutilsTrace.js';
import { useActionsTexte } from './actionsTexte.js';
import { MODES_VECTORISATION, NOMS_MODES } from '../engine/texte/vectoriser.js';
import { useRubriquesProduction } from './Production.js';
import { operationsApplicables } from '../engine/preparation.js';
import { AutresFormatsRepliees, useElementRecuperer } from './Recuperer.js';
import { MenuDeroulant, type ElementMenu, type SectionMenu } from './commun/Menu.js';
import type { NomIcone } from './icones.js';
import type { Fond } from './typesEditeur.js';
import { aEnregistrer } from './enregistrement.js';
import { useElementsRepetition, useElementsReperes } from './menusOutilsPro.js';
import { BoiteInsererAdresse } from './InsererAdresse.js';
import { adressesPermises } from './OuvrirAdresse.js';
import { useElementsNuancier } from './actionsNuancier.js';
import { elementsSelection } from './commandesSelection.js';
import { useStockage } from './contexteStockage.js';

const FONDS: ReadonlyArray<readonly [Fond, NomIcone, string]> = [['damier', 'fond-damier', 'Fond damier'], ['blanc', 'fond-blanc', 'Fond blanc'], ['sombre', 'fond-sombre', 'Fond sombre']];

/** Les elements du menu Vue. `avecZoom` ajoute zoomer et dezoomer (en dernier), que la barre des petits ecrans ne porte plus. */
function useElementsVue(avecZoom: boolean): ElementMenu[] {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), reperes = useElementsReperes();
  const { vues } = ui;
  // En contexte de decoupe, « Ajuster » cadre le tapis entier (le dessin dedans) : un tapis de 12 po qui sortait de l'ecran ne
  // montrait pas ce que la machine verrait. « Ajuster au dessin » garde l'ancien cadrage, sous sa propre touche.
  const tapis = ui.profil?.procede === 'decoupe';
  return [
    // « 0 » (zero) et « O » (contours) se confondent en chasse fixe : le chiffre se dit en toutes lettres.
    { id: 'ajuster', libelle: tapis ? 'Ajuster au tapis' : 'Ajuster à l’écran', icone: 'ajuster', raccourci: '0 (zéro)', onClick: ac.ajuster },
    ...(tapis ? [{ id: 'ajuster-dessin', libelle: 'Ajuster au dessin', raccourci: 'D', onClick: ac.ajusterAuDessin } satisfies ElementMenu] : []),
    { id: 'reel', libelle: 'Taille réelle (100 %)', icone: 'taille-reelle', raccourci: '1', onClick: vues.centrer100 },
    { id: 'selection', libelle: 'Zoomer sur la sélection', icone: 'zoom-selection', raccourci: 'Z', desactive: !mo.sel.length, onClick: ac.zoomerSelection },
    { id: 'grille', libelle: 'Grille magnétique (pas ' + ui.pas + ')', raccourci: 'G', coche: ui.grille, separateur: true, onClick: () => ac.poserGrille(!ui.grille) },
    { id: 'aimants', libelle: 'Aimants vers les formes et les repères', raccourci: 'M', coche: ui.aimants, onClick: () => ac.poserAimants(!ui.aimants) },
    { id: 'contours', libelle: 'Vue contours', raccourci: 'O', coche: ui.contours, onClick: () => ac.poserContours(c => !c) },
    // Les regles et les reperes (ADR-0038).
    ...reperes,
    // L'apercu de la machine (ADR-0028) : en contexte Cricut qui coupe ou ecrit, la toile montre ce que la lame detache et ce que le
    // stylo trace ; ce reglage le retire pour revenir aux couleurs du dessin. La vue contours (O) le remplace tant qu'elle est active.
    ...(ui.profil && operationsApplicables(ui.profil.procede)
      ? [{ id: 'apercu-machine', libelle: 'Aperçu de la machine', raccourci: 'Maj+O', coche: ui.apercuMachine, onClick: () => ac.poserApercuMachine(a => !a) } satisfies ElementMenu]
      : []),
    ...FONDS.map(([f, icone, libelle], i): ElementMenu => ({ id: 'fond-' + f, libelle, icone, coche: ui.fond === f, separateur: i === 0, onClick: () => ac.poserFond(f) })),
    // Au telephone, le zoom vient en dernier : le pincement de deux doigts le fait deja, et le niveau reste dans la barre.
    ...(avecZoom ? [
      { id: 'zoomer', libelle: 'Zoomer', icone: 'zoom-plus', raccourci: '+', separateur: true, onClick: () => vues.zoomer(1.25) },
      { id: 'dezoomer', libelle: 'Dézoomer', icone: 'zoom-moins', raccourci: '-', onClick: () => vues.zoomer(0.8) }
    ] satisfies ElementMenu[] : [])
  ];
}

export function MenuVue() {
  return <MenuDeroulant etiquette="Vue" libelle="Vue" elements={useElementsVue(false)} />;
}

function useElementsEdition(): ElementMenu[] {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), at = useActionsTexte(), repetition = useElementsRepetition(), stockage = useStockage();
  const rien = !mo.sel.length, sansTexte = !mo.dessin.formes.some(f => f.texte && mo.choisies.has(f.id));
  const nuancier = useElementsNuancier();
  // Vectoriser le texte (ADR-0022) : les trois modes ; le raccourci fait celui du moment (souder en decoupe Cricut).
  const vectoriser: ElementMenu[] = MODES_VECTORISATION.map((m, i) => ({
    id: 'vectoriser-' + m, libelle: 'Vectoriser le texte : ' + NOMS_MODES[m].toLowerCase(), separateur: i === 0, desactive: sansTexte,
    ...(m === at.mode ? { raccourci: 'Ctrl+Maj+O' } : {}), onClick: () => { void at.vectoriser(m); }
  }));
  return [
    { id: 'annuler', libelle: 'Annuler', icone: 'annuler', raccourci: 'Ctrl+Z', desactive: !mo.h.passe.length, onClick: ac.defaire },
    { id: 'retablir', libelle: 'Rétablir', icone: 'retablir', raccourci: 'Ctrl+Maj+Z', desactive: !mo.h.futur.length, onClick: ac.refaire },
    { id: 'copier', libelle: 'Copier', icone: 'copier', raccourci: 'Ctrl+C', desactive: rien, separateur: true, onClick: ac.copierSelection },
    { id: 'couper', libelle: 'Couper', icone: 'couper', raccourci: 'Ctrl+X', desactive: rien, onClick: ac.couperSelection },
    { id: 'coller', libelle: 'Coller', icone: 'coller', raccourci: 'Ctrl+V', desactive: !mo.presse.length, onClick: ac.collerPresse },
    { id: 'dupliquer', libelle: 'Dupliquer', icone: 'dupliquer', raccourci: 'Ctrl+D', desactive: rien, onClick: ac.dupliquerSelection },
    // Repeter la selection : grille, radiale, symetrie (ADR-0038).
    ...repetition,
    // Choisir (ADR-0035) : tout, rien, inverser, meme fond, meme contour, meme type, et en Cricut ce qui est a couper ou a ecrire.
    ...elementsSelection(mo, ui, ac),
    // Le nuancier du dessin depuis la selection (ADR-0037) : le remplacer ou le completer.
    ...nuancier,
    // Couper ou ecrire (ADR-0028), en contexte Cricut qui coupe ou ecrit : la selection passe d'un groupe a l'autre.
    ...(ui.profil && operationsApplicables(ui.profil.procede) ? [
      { id: 'operation-decoupe', libelle: 'Sélection à couper', icone: 'couper', raccourci: 'Maj+X', separateur: true, desactive: rien, onClick: () => ac.poserOperation('decoupe') },
      { id: 'operation-ecriture', libelle: 'Sélection à écrire au stylo', icone: 'stylo', raccourci: 'Maj+E', desactive: rien, onClick: () => ac.poserOperation('ecriture') }
    ] satisfies ElementMenu[] : []),
    { id: 'lisser-booleens', libelle: 'Booléens : rebâtir les courbes', coche: ui.lisserBooleens, separateur: true, onClick: () => ac.poserLisserBooleens(!ui.lisserBooleens) },
    // Le modele de lecture (ADR-0012, annexe 5 §3) : garde par le stockage injecte, absent sans lui ou quand l'hote l'a fixe.
    ...(stockage && !ui.modeleFixe ? [{ id: 'modele-riche', libelle: 'Groupes, dégradés, effets (bêta)', coche: ui.modele === 'riche', onClick: () => ac.poserModele(ui.modele === 'riche' ? 'plat' : 'riche') } satisfies ElementMenu] : []),
    ...vectoriser,
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

/**
 * Les elements du menu Fichier : le geste de fin (son libelle vient de la page ou de l'hote), garder un brouillon (Ctrl+S, qui ne
 * ferme jamais), les credits, fermer. Recuperer le fichier n'y est plus : il a son bouton dans la barre (au bureau), ou vient en
 * tete de cette rubrique sur un telephone (`recuperer`).
 */
function useElementsFichier(poserCredits: (ouvert: boolean) => void, recuperer: ElementMenu | null, poserAdresse: (ouvert: boolean) => void): ElementMenu[] {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), signaler = useSignalVisite();
  const rien = !aEnregistrer(mo.h.passe.length > 0, ui.productionModifiee, ui.enregistrement);
  // Les gestes de l'hote (« Enregistrer sous… » sur le site, ADR-0030) suivent le geste de fin ; ils recoivent l'etat du moment.
  const hote: ElementMenu[] = (ui.fin.actionsHote ?? []).map(a => ({ id: 'hote-' + a.id, libelle: a.libelle, onClick: () => a.faire({ dessin: mo.dessin, production: ui.production }) }));
  return [
    ...(recuperer ? [recuperer] : []),
    // Le geste de fin acheve l'etape « Récupérez votre dessin » chez un hote, ou le dessin se recupere par lui (sans visite, rien).
    // Pas de coche pour « Terminer » : dans un menu, la colonne des icones dit aussi un etat coche, et on y lirait un choix fait.
    { id: 'enregistrer', libelle: ui.fin.libelle, ...(ui.fin.fermerSansModification ? {} : { icone: 'enregistrer' as const }), ...(ui.fin.ctrlSEnregistre ? { raccourci: 'Ctrl+S' } : {}), separateur: !!recuperer, desactive: rien && !ui.fin.fermerSansModification, onClick: () => { if (!rien) signaler('recupere'); ac.terminer(); } },
    ...hote,
    ...(ui.fin.brouillon ? [{ id: 'brouillon', libelle: 'Garder un brouillon', raccourci: 'Ctrl+S', onClick: ac.garderBrouillon } satisfies ElementMenu] : []),
    // Inserer un SVG (ou la premiere page d'un PDF) depuis une adresse (ADR-0036) : seulement chez un hote qui l'a pose.
    ...(adressesPermises() ? [{ id: 'inserer-adresse', libelle: 'Insérer depuis une adresse…', separateur: true, onClick: () => poserAdresse(true) } satisfies ElementMenu] : []),
    { id: 'credits', libelle: 'À propos et crédits', onClick: () => poserCredits(true) },
    { id: 'fermer', libelle: 'Fermer l’éditeur', icone: 'fermer', raccourci: 'Échap', separateur: true, onClick: ac.demanderFermeture }
  ];
}

/** La boite des credits : posee dans la racine de l'editeur, ses styles y sont cantonnes, et le reste de l'editeur devient inerte derriere elle. */
function BoiteCredits({ fermer }: { fermer: () => void }) {
  const polices = usePolicesDuDessin();
  return <DialogueCredits fermer={fermer} conteneur={document.querySelector<HTMLElement>('.editeur-svg') ?? document.body} polices={polices} />;
}

/**
 * Les polices telechargees qu'emploie le dessin (ADR-0025), pour nommer leur licence dans les credits. Sans l'index (un hote
 * sans polices en ligne), le nom de famille garde par le texte suffit ; la licence se lit alors dans l'index, ailleurs.
 */
function usePolicesDuDessin(): PoliceCreditee[] {
  const mo = useDessin(), tx = useTexte();
  const textes = mo.dessin.formes.flatMap(f => (f.texte && estIdCatalogue(f.texte.police.id) ? [f.texte.police] : []));
  const avecCatalogue = textes.length > 0 && tx.enLigne;
  useEffect(() => { if (avecCatalogue) tx.chargerCatalogue(); }, [avecCatalogue, tx]);
  const lues = variantesEmployees(tx.catalogue, textes);
  if (lues.length) return lues.map(v => ({ nom: v.famille.nom, source: sourcePolices(v.famille.source)?.nom ?? v.famille.source, licence: LICENCES_POLICES[v.famille.licence] }));
  return [...new Set(textes.map(p => p.famille ?? p.id))].map(nom => ({ nom, source: '', licence: null }));
}

/** Fichier : le geste de fin, le brouillon, les credits, fermer. */
export function MenuFichier() {
  const [credits, poserCredits] = useState(false);
  const [adresse, poserAdresse] = useState(false);
  const elements = useElementsFichier(poserCredits, null, poserAdresse);
  return (
    <>
      <MenuDeroulant etiquette="Fichier" libelle="Fichier" alignement="droite" elements={elements} />
      {credits ? <BoiteCredits fermer={() => poserCredits(false)} /> : null}
      {adresse ? <BoiteInsererAdresse fermer={() => poserAdresse(false)} /> : null}
    </>
  );
}

/**
 * « Plus » : sous une largeur de telephone, la barre ne porte plus que les outils, les couleurs et l'historique ; Vue, Edition et
 * Fichier (avec ses exports) tiennent dans ce seul menu, rubrique par rubrique. L'ordre est celui de l'usage : Aide d'abord, puis Edition (ce qu'on fait
 * de la selection), Fichier, puis Vue, le zoom en dernier, puis le contexte de production. Au doigt, les raccourcis se taisent (CSS).
 */
export function MenuPlus({ nom }: { nom: string }) {
  const [credits, poserCredits] = useState(false);
  const [adresse, poserAdresse] = useState(false);
  const raccourcis = useBoiteRaccourcis();
  const vue = useElementsVue(true), edition = useElementsEdition(), fichier = useElementsFichier(poserCredits, useElementRecuperer(nom), poserAdresse), production = useRubriquesProduction();
  const aide = useElementsAide(raccourcis.ouvrir);
  const sections: SectionMenu[] = [
    // L'aide d'abord : un debutant qui ouvre « Plus » la voit sans faire defiler un menu que l'export allonge.
    { id: 'aide', titre: 'Aide', elements: aide },
    { id: 'edition', titre: 'Édition', elements: edition },
    { id: 'fichier', titre: 'Fichier', elements: fichier, libre: <AutresFormatsRepliees nom={nom} /> },
    { id: 'vue', titre: 'Vue', elements: vue },
    // Le contexte de production (ADR-0013) : la barre du bureau le porte, le telephone le range ici, en dernier.
    ...production
  ];
  return (
    <>
      <MenuDeroulant etiquette="Plus d’actions : vue, édition, fichier" icone="options" chevron={false} alignement="droite" sections={sections} />
      {credits ? <BoiteCredits fermer={() => poserCredits(false)} /> : null}
      {adresse ? <BoiteInsererAdresse fermer={() => poserAdresse(false)} /> : null}
      {raccourcis.boite}
    </>
  );
}
