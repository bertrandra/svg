// Les gestes du nuancier (ADR-0037) : creer le nuancier du dessin depuis la selection (le remplacer ou le completer), le
// reprendre de tout le dessin, poser une teinte sur le remplissage ou le contour, exporter le nuancier. Le calcul est pur
// (engine/nuancier.ts) ; ici, l'entree d'historique, la phrase dite, le fichier propose.
//
// Le nuancier du dessin fait partie du dessin (`DessinSvg.nuancier`) : le creer est une entree d'historique, que Ctrl+Z defait,
// et il ne s'ecrit jamais dans le SVG.

import { modifier, type DessinSvg, type Style } from '../engine/editionSvg.js';
import { nuancierDeSelection, nuancierDuDessin, nuancierEffectif, poserNuancier, type ModeNuancier } from '../engine/nuancier.js';
import { ecrireAse, ecrireGpl, type TeinteExportee } from '../export/nuancier.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { nomDeCouleur, phraseOpacite } from '../model/nomsCouleurs.js';
import type { TeinteDessin } from '../model/nuancier.js';
import { pluriel } from '../util/texte.js';
import type { ElementMenu, SectionMenu } from './commun/Menu.js';
import { useActions, useDessin } from './contexteEditeur.js';
import type { ActionsEditeur } from './typesEditeur.js';

/** Les raccourcis de la commande, libres ailleurs dans l'editeur (Clavier.ts) : N pour nuancier. */
export const RACCOURCI_REMPLACER = 'Maj+N';
export const RACCOURCI_AJOUTER = 'Alt+Maj+N';

/** Le nom d'une teinte du dessin, tel qu'on le dit et qu'on l'exporte : son nom approche, son code, son opacite si elle n'est pas pleine. */
export function nomDeTeinte(t: TeinteDessin): string {
  const o = phraseOpacite(t.opacite);
  return nomDeCouleur(t.hex) + ' ' + t.hex.toUpperCase() + (o ? ', ' + o : '');
}

/**
 * « Créer le nuancier depuis la sélection » : une entree d'historique (Ctrl+Z la defait), et la phrase qui dit ce qui a change.
 * Rien a faire sans selection, ou si les formes choisies n'ont aucune couleur employee : on le dit, sans entree d'historique.
 */
export function creerNuancierDepuisSelection(ac: ActionsEditeur, dessin: DessinSvg, sel: readonly string[], mode: ModeNuancier): void {
  if (!sel.length) { ac.dire('Choisissez des formes : leurs couleurs feront le nuancier du dessin.'); return; }
  const r = nuancierDeSelection(dessin, sel, mode);
  if (!r) { ac.dire('Les formes choisies n’ont ni remplissage ni contour visibles : aucune couleur à prendre.'); return; }
  const apres = poserNuancier(dessin, r.nuancier);
  if (apres === dessin) { ac.dire(mode === 'ajouter' ? 'Le nuancier du dessin a déjà ces couleurs.' : 'Le nuancier du dessin est déjà celui de la sélection.'); return; }
  ac.appliquer(() => apres, ac.nouvelleCle());
  ac.dire(mode === 'remplacer'
    ? 'Nuancier du dessin remplacé par ' + pluriel(r.lues, 'couleur') + ' de la sélection. Ctrl+Z le rend.'
    : r.ajoutees ? pluriel(r.ajoutees, 'couleur') + ' de la sélection ' + (r.ajoutees > 1 ? 'ajoutées' : 'ajoutée') + ' au nuancier du dessin. Ctrl+Z les retire.'
      : 'Le nuancier du dessin a déjà ces couleurs.');
}

/** « Reprendre les couleurs du dessin » : le nuancier tire de tout le dessin du moment, une entree d'historique. */
export function reprendreNuancierDuDessin(ac: ActionsEditeur, dessin: DessinSvg): void {
  const n = nuancierDuDessin(dessin), apres = poserNuancier(dessin, n);
  if (apres === dessin) { ac.dire('Le nuancier est déjà celui du dessin.'); return; }
  ac.appliquer(() => apres, ac.nouvelleCle());
  ac.dire(n.teintes.length ? 'Nuancier repris du dessin : ' + pluriel(n.teintes.length, 'couleur') + '. Ctrl+Z rend le précédent.' : 'Le dessin n’emploie aucune couleur : le nuancier du dessin est vide.');
}

export type CibleTeinte = 'remplissage' | 'contour';

/**
 * Pose une teinte : sur le remplissage ou le contour des formes choisies (une entree d'historique), ou, sans selection, sur le
 * style des formes nouvelles (rien ne change dans le dessin).
 */
export function poserTeinte(ac: ActionsEditeur, sel: readonly string[], style: Style, hex: string, cible: CibleTeinte, nom: string): void {
  const ou = cible === 'remplissage' ? 'remplissage' : 'contour';
  if (sel.length) {
    ac.appliquer(d => modifier(d, sel, cible === 'remplissage' ? { remplissage: hex } : { contour: hex }), ac.nouvelleCle());
    ac.dire(nom + ' posé sur le ' + ou + (sel.length > 1 ? ' des ' + sel.length + ' formes choisies.' : ' de la forme choisie.'));
    return;
  }
  ac.poserStyle(cible === 'remplissage' ? { ...style, remplissage: hex } : { ...style, contour: hex });
  ac.dire('Les formes nouvelles prendront ' + nom + ' en ' + ou + '.');
}

export type FormatNuancier = 'gpl' | 'ase';

/** Le nom de fichier et le titre de la palette exportee. */
const NOM_EXPORT = 'nuancier-du-dessin', TITRE_EXPORT = 'Couleurs du dessin';

/** Propose le nuancier du dessin en fichier : `.gpl` (GIMP, Inkscape) ou `.ase` (Adobe). Rend la phrase a dire. */
export async function exporterNuancier(teintes: readonly TeinteDessin[], format: FormatNuancier): Promise<string> {
  if (!teintes.length) return 'Le nuancier du dessin est vide : rien à exporter.';
  const t: TeinteExportee[] = teintes.map(x => ({ nom: nomDeTeinte(x), hex: x.hex }));
  const octets = format === 'gpl' ? texteOctets(ecrireGpl(TITRE_EXPORT, t)) : ecrireAse(TITRE_EXPORT, t);
  return proposer(NOM_EXPORT + '.' + format, octets);
}

/**
 * Les deux elements de la commande, pour le menu Edition et celui de la selection : remplacer le nuancier du dessin par les couleurs
 * de la selection, ou les y ajouter. Inactifs sans selection.
 */
export function useElementsNuancier(separateur = true): ElementMenu[] {
  const { dessin, sel } = useDessin(), ac = useActions(), rien = !sel.length;
  return [
    { id: 'nuancier-remplacer', libelle: 'Créer le nuancier depuis la sélection : remplacer', icone: 'palette', raccourci: RACCOURCI_REMPLACER, separateur, desactive: rien, onClick: () => creerNuancierDepuisSelection(ac, dessin, sel, 'remplacer') },
    { id: 'nuancier-ajouter', libelle: 'Créer le nuancier depuis la sélection : ajouter', raccourci: RACCOURCI_AJOUTER, desactive: rien, onClick: () => creerNuancierDepuisSelection(ac, dessin, sel, 'ajouter') }
  ];
}

/** La rubrique du menu « Plus » de la rangee de la selection resserree : la meme commande, ses deux choix. */
export function useSectionNuancier(): SectionMenu {
  const { dessin, sel } = useDessin(), ac = useActions();
  return { id: 'nuancier', titre: 'Créer le nuancier depuis la sélection', elements: [
    { id: 'nuancier-remplacer', libelle: 'Remplacer', icone: 'palette', raccourci: RACCOURCI_REMPLACER, onClick: () => creerNuancierDepuisSelection(ac, dessin, sel, 'remplacer') },
    { id: 'nuancier-ajouter', libelle: 'Ajouter', raccourci: RACCOURCI_AJOUTER, onClick: () => creerNuancierDepuisSelection(ac, dessin, sel, 'ajouter') }
  ] };
}

/** Le nuancier du dessin que l'editeur montre : celui que porte le dessin, ou celui qu'on lit sur ses couleurs. */
export const useNuancierDuDessin = () => nuancierEffectif(useDessin().dessin);
