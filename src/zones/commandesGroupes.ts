// Les commandes des groupes (ADR-0012, etape 2, paquet 2-C ; annexe 6 §2, annexe 9 question 1) : grouper, degrouper, entrer dans
// un groupe, en sortir, remonter par le fil d'Ariane, et le « SVG à plat » du menu Fichier. Elles n'existent qu'en modele riche (le
// reglage, ou un dessin deja riche, comme un projet du site) : a plat, aucun element de menu de plus, Ctrl+G combine et Ctrl+Maj+G
// separe comme avant. Le menu (MenusBarre.tsx), la rangee (BarreSelection.tsx), le clavier (Clavier.ts, ClavierToile.ts) et le fil
// d'Ariane (FilAriane.tsx) appellent les memes fonctions, sur l'etat qu'on leur donne : rien n'est capture.

import { aplatirPour, CAPACITES_PLAT, phrasePertes } from '../engine/aplatir.js';
import { estPlat, groupeDe, uniteDans, type DessinSvg } from '../engine/editionSvg.js';
import { formeVoisine } from '../engine/navigation.js';
import type { ChoixProduction } from '../model/contextes.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { svgDocument } from './actionsProduction.js';
import { phraseSelection } from './annonces.js';
import type { ElementMenu } from './commun/Menu.js';
import { phraseEntreeGroupe, phraseNiveau } from './phrasesGroupes.js';
import type { ActionsEditeur, EtatInterface, Modele, ModeleDessin } from './typesEditeur.js';

/**
 * Les groupes se commandent-ils ? En modele riche, ou sur un dessin deja riche (un projet du site s'ouvre tel qu'il a ete enregistre,
 * quel que soit le reglage) : ses groupes se voient, on doit pouvoir y entrer et en sortir. Un dessin plat lu a plat : non.
 */
export const groupesActifs = (d: DessinSvg, modele: Modele): boolean => modele === 'riche' || !estPlat(d);

/** Le groupe choisi seul, ou null : ce dans quoi Entree ou « Entrer dans le groupe » font entrer. */
export const groupeSeul = (m: Pick<ModeleDessin, 'dessin' | 'sel'>): string | null => {
  const [id] = m.sel;
  return m.sel.length === 1 && id !== undefined && groupeDe(m.dessin, id) ? id : null;
};

/** Vrai si la selection compte au moins un groupe (de quoi degrouper). */
export const aUnGroupe = (m: Pick<ModeleDessin, 'dessin' | 'sel'>): boolean => m.sel.some(id => groupeDe(m.dessin, id) !== undefined);

/**
 * Entrer dans un groupe sans souris (Entree, menu) : on y entre, et son premier enfant choisissable est choisi, pour que Tab parcoure
 * aussitot ses freres (sans selection, Tab quitterait la toile, ADR-0011). Une seule phrase dit les deux.
 */
export function entrerDansGroupe(m: Pick<ModeleDessin, 'dessin'>, ac: ActionsEditeur, id: string): boolean {
  if (!ac.entrerGroupe(id)) return false;
  const premier = formeVoisine(m.dessin, [], 1, false, id);
  if (premier !== null) {
    ac.choisir([premier]);
    ac.annoncer((phraseEntreeGroupe(m.dessin, id) ?? '') + ' ' + phraseSelection(m.dessin, [premier]));
  }
  return true;
}

/** Sortir d'un niveau (Maj+Entree, menu) ; a la racine, le dire plutot que ne rien faire en silence. */
export function sortirDuGroupe(ac: ActionsEditeur): void {
  if (!ac.sortirGroupe()) ac.annoncer('Vous êtes déjà à la racine du dessin.');
}

/**
 * Remonter du contexte jusqu'a `cible` (un ancetre, ou la racine : null), par le fil d'Ariane : le groupe d'ou l'on vient (l'enfant de
 * `cible` sur le chemin) reste choisi, comme quand on sort d'un niveau, et le niveau d'arrivee se dit.
 */
export function remonterVers(m: Pick<ModeleDessin, 'dessin'>, u: Pick<EtatInterface, 'contexte'>, ac: ActionsEditeur, cible: string | null): void {
  const actuel = u.contexte?.groupe ?? null;
  if (actuel === null || cible === actuel) return;
  const quitte = uniteDans(m.dessin, actuel, cible);
  ac.poserContexte(cible !== null ? { groupe: cible } : null);
  ac.choisir(quitte !== null ? [quitte] : []);
  ac.poserPoint(null);
  ac.annoncer(phraseNiveau(m.dessin, cible));
}

/**
 * Les elements des groupes au menu Edition, en modele riche seulement (vide sinon) : chacun avec son raccourci, grise quand la
 * selection ne s'y prete pas.
 */
export function elementsGroupes(m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur): ElementMenu[] {
  if (!groupesActifs(m.dessin, u.modele)) return [];
  const seul = groupeSeul(m);
  return [
    { id: 'grouper', libelle: 'Grouper', icone: 'grouper', raccourci: 'Ctrl+G', separateur: true, desactive: !m.sel.length, onClick: ac.grouper },
    { id: 'degrouper', libelle: 'Dégrouper', icone: 'degrouper', raccourci: 'Ctrl+Maj+G', desactive: !aUnGroupe(m), onClick: ac.degrouper },
    { id: 'entrer-groupe', libelle: 'Entrer dans le groupe', raccourci: 'Entrée', desactive: seul === null, onClick: () => { if (seul !== null) entrerDansGroupe(m, ac, seul); } },
    { id: 'sortir-groupe', libelle: 'Sortir du groupe', raccourci: 'Maj+Entrée', desactive: !u.contexte, onClick: () => sortirDuGroupe(ac) }
  ];
}

/**
 * Ctrl+G et Ctrl+Maj+G (annexe 9, question 1) : en modele riche ils groupent et degroupent ; a plat, ils combinent et separent comme
 * avant. Combiner et Separer restent au menu Edition et dans la rangee, sans raccourci en riche : aucune touche libre ne vaut sur
 * tous les claviers (AltGr est Ctrl+Alt, l'AZERTY prend les chiffres sans Maj).
 */
export function ctrlG(m: Pick<ModeleDessin, 'dessin'>, u: Pick<EtatInterface, 'modele'>, ac: ActionsEditeur, maj: boolean): void {
  if (groupesActifs(m.dessin, u.modele)) { if (maj) ac.degrouper(); else ac.grouper(); } else if (maj) ac.separerSelection(); else ac.combinerSelection();
}

/**
 * Entree et Maj+Entree sur la toile, a l'outil selection, en modele riche : Entree sur un groupe choisi seul y entre, Maj+Entree sort
 * d'un niveau. Vrai quand la touche est prise ; Entree sur une feuille garde son sens d'avant (ses points, ou la saisie d'un texte).
 */
export function toucheGroupes(e: KeyboardEvent, m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur): boolean {
  if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || u.outil !== 'selection' || !groupesActifs(m.dessin, u.modele)) return false;
  if (e.shiftKey) { sortirDuGroupe(ac); return true; }
  const seul = groupeSeul(m);
  return seul !== null && entrerDansGroupe(m, ac, seul);
}

/**
 * « Télécharger le SVG à plat » (menu Fichier, modele riche) : les octets du contrat d'avant le modele v2 (ADR-0012 §6), par la
 * descente `CAPACITES_PLAT` ecrite comme « Télécharger le SVG » ecrit un dessin plat (`svgDocument`), et ce qui a ete approche, dit.
 * Recuperer un fichier n'est pas un enregistrement : rien n'est rendu a l'hote.
 */
export function telechargerAPlat(dessin: DessinSvg, production: ChoixProduction, nom: string, dire: (t: string) => void): void {
  const { dessin: plat, pertes } = aplatirPour(dessin, CAPACITES_PLAT), approche = phrasePertes(pertes);
  void proposer(nom + '-a-plat.svg', texteOctets(svgDocument(plat, production))).then(m => dire(approche ? m + ' ' + approche : m));
}
