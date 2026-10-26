// Les outils de selection (ADR-0035) cote interface : les commandes du menu Edition qui choisissent (tout, rien, inverser, meme
// fond, meme contour, meme type, a couper, a ecrire), leurs raccourcis, et les phrases du cadre et du lasso. Le choix est pur
// (engine/selection.ts) ; ici, le fil vers la selection et la region vocale. Le menu (MenusBarre.tsx) et le clavier (Clavier.ts)
// appellent les memes fonctions, qui lisent l'etat qu'on leur donne : rien n'est capture.

import { couleurDite } from '../engine/description.js';
import { operationsApplicables } from '../engine/preparation.js';
import { formesParOperation, inverserSelection, memeContour, memeType, toutesChoisissables, type EffetZone, type RegleZone, type TypeForme } from '../engine/selection.js';
import { estPlat, type Operation } from '../engine/editionSvg.js';
import { noeudsChoisissables } from '../engine/navigation.js';
import { pluriel } from '../util/texte.js';
import type { ElementMenu } from './commun/Menu.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin, Outil, OutilZone } from './typesEditeur.js';
import { niveauEdition } from './lentille.js';

/** Les outils de selection, dans l'ordre du menu : leur icone, leur nom, leur raccourci. */
export const OUTILS_SELECTION = [
  { outil: 'selection', icone: 'selection', libelle: 'Sélection', raccourci: 'V' },
  { outil: 'cadre', icone: 'cadre-selection', libelle: 'Cadre de sélection', raccourci: 'B' },
  { outil: 'lasso', icone: 'lasso', libelle: 'Lasso', raccourci: 'Q' }
] as const;

export type OutilSelection = typeof OUTILS_SELECTION[number]['outil'];

export const estOutilZone = (o: Outil): o is OutilZone => o === 'cadre' || o === 'lasso';
export const estOutilSelection = (o: Outil): o is OutilSelection => o === 'selection' || estOutilZone(o);

/** Les deux regles, telles que le menu les nomme. */
export const LIBELLES_REGLE: Readonly<Record<RegleZone, string>> = { touche: 'Les formes touchées, même en partie', dedans: 'Les formes entièrement dedans' };

/** L'effet d'un geste de zone selon ses touches : Alt retire, Maj ajoute (Alt l'emporte), sinon la selection est remplacee. */
export const effetDe = (e: { readonly shiftKey: boolean; readonly altKey: boolean }): EffetZone => (e.altKey ? 'retirer' : e.shiftKey ? 'ajouter' : 'remplacer');

const choisies = (n: number): string => (n ? pluriel(n, 'forme') + ' choisie' + (n > 1 ? 's' : '') : 'aucune forme choisie');

/**
 * Ce que dit le relachement d'un cadre ou d'un lasso : « 3 formes choisies. », « 2 formes ajoutées : 5 formes choisies. »,
 * « 1 forme retirée : aucune forme choisie. », ou « Aucune forme dans le cadre. ».
 */
export function phraseZone(forme: OutilZone, effet: EffetZone, avant: readonly string[], apres: readonly string[]): string {
  if (effet === 'remplacer') return apres.length ? choisies(apres.length).replace(/^./, c => c.toUpperCase()) + '.' : 'Aucune forme dans le ' + forme + '.';
  const n = effet === 'ajouter' ? apres.length - avant.length : avant.length - apres.length;
  const verbe = effet === 'ajouter' ? 'ajoutée' : 'retirée';
  return (n ? pluriel(n, 'forme') + ' ' + verbe + (n > 1 ? 's' : '') : 'Aucune forme ' + verbe) + ' : ' + choisies(apres.length) + '.';
}

/** La barre d'etat des outils de zone : ce que fait le geste, la regle, et le clavier. */
export function etatOutilZone(outil: OutilZone, regle: RegleZone, nTrace: number): string {
  const prend = regle === 'touche' ? 'les formes touchées' : 'les formes entièrement dedans';
  if (outil === 'cadre') {
    return nTrace === 1
      ? 'Premier coin posé : flèches pour l’autre coin, Entrée prend ' + prend + ', Maj et Entrée les ajoute, Échap annule.'
      : 'Cadre : glissez, même sur une forme, pour prendre ' + prend + ' (Maj ajoute, Alt retire) ; au clavier, flèches puis Espace.';
  }
  return nTrace
    ? pluriel(nTrace, 'point') + ' · Espace pose un point, Entrée ferme le lasso et prend ' + prend + ', Retour arrière retire le dernier point.'
    : 'Lasso : entourez à main levée pour prendre ' + prend + ' (Maj ajoute, Alt retire) ; au clavier, flèches puis Espace.';
}

const NOMS_TYPES: Readonly<Record<TypeForme, readonly [string, string]>> = { texte: ['texte', 'choisi'], trait: ['trait', 'choisi'], pleine: ['forme pleine', 'choisie'] };

/** Choisit `ids`, rend le point actif et le dit. */
function choisir(ac: ActionsEditeur, ids: string[], phrase: string): void {
  ac.choisir(ids);
  ac.poserPoint(null);
  ac.dire(phrase);
}

/** Les commandes de selection, sur l'etat qu'on leur donne (celui du rendu, ou celui du moment pour le clavier). */
export function commandesSelection(m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur) {
  const procede = u.profil && operationsApplicables(u.profil.procede) ? u.profil.procede : null;
  // Un dessin riche (ADR-0012, annexe 6 §2) : tout choisir et inverser ne voient que les noeuds du niveau du contexte d'edition.
  const niveau = (): string[] | null => (estPlat(m.dessin) ? null : noeudsChoisissables(m.dessin, niveauEdition(u.contexte)));
  return {
    tout: () => { const ids = niveau() ?? toutesChoisissables(m.dessin); ac.choisir(ids); ac.poserPoint(null); },
    rien: () => { ac.choisir([]); ac.poserPoint(null); },
    inverser: () => {
      const n = niveau(), ids = n ? n.filter(id => !m.sel.includes(id)) : inverserSelection(m.dessin, m.sel);
      choisir(ac, ids, ids.length ? 'Sélection inversée : ' + choisies(ids.length) + '.' : 'Sélection inversée : aucune autre forme à choisir.');
    },
    memeContour: () => {
      if (!m.sel.length) return;
      const r = memeContour(m.dessin, m.sel);
      if (!r.valeurs.length) { ac.dire('La sélection n’a pas de contour : pas de couleur de contour à retrouver.'); return; }
      choisir(ac, r.ids, pluriel(r.ids.length, 'forme') + ' de même contour ' + r.valeurs.map(couleurDite).join(', ') + ' choisie' + (r.ids.length > 1 ? 's' : '') + '.');
    },
    memeType: () => {
      if (!m.sel.length) return;
      const r = memeType(m.dessin, m.sel), seul = r.valeurs.length === 1 ? r.valeurs[0] : undefined;
      const [nom, accord] = seul ? NOMS_TYPES[seul] : ['forme de même type', 'choisie'];
      const n = r.ids.length, mots = nom.split(' ');
      // « 3 formes pleines choisies », « 2 traits choisis » : chaque mot du nom s'accorde, sauf « de même type ».
      const dit = n > 1 ? (seul ? mots.map(x => x + 's').join(' ') : 'formes de même type') : nom;
      choisir(ac, r.ids, n + ' ' + dit + ' ' + accord + (n > 1 ? 's' : '') + '.');
    },
    /** En contexte Cricut qui coupe ou ecrit (ADR-0028) : tout ce que la lame coupe, ou que le stylo ecrit. */
    parOperation: (operation: Operation) => {
      if (!procede) return;
      const ids = formesParOperation(m.dessin, procede, operation), quoi = operation === 'decoupe' ? 'à couper' : 'à écrire';
      choisir(ac, ids, ids.length ? pluriel(ids.length, 'forme') + ' ' + quoi + ' choisie' + (ids.length > 1 ? 's' : '') + '.' : 'Aucune forme ' + quoi + '.');
    },
    /** Le contexte permet-il de choisir par operation ? */
    parOperationPossible: procede !== null
  };
}

/** Les elements « choisir » du menu Edition, ranges ensemble, chacun avec son raccourci. */
export function elementsSelection(m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur): ElementMenu[] {
  const c = commandesSelection(m, u, ac), rien = !m.sel.length, vide = !m.dessin.formes.length;
  return [
    { id: 'tout', libelle: 'Tout sélectionner', icone: 'tout-selectionner', raccourci: 'Ctrl+A', separateur: true, desactive: vide, onClick: c.tout },
    { id: 'aucun', libelle: 'Désélectionner', icone: 'aucune-selection', raccourci: 'Échap', desactive: rien, onClick: c.rien },
    { id: 'inverser', libelle: 'Inverser la sélection', icone: 'inverser-selection', raccourci: 'I', desactive: vide, onClick: c.inverser },
    { id: 'meme-couleur', libelle: 'Sélectionner la même couleur de fond', icone: 'palette', raccourci: 'C', desactive: rien, onClick: ac.choisirMemeCouleur },
    { id: 'meme-contour', libelle: 'Sélectionner la même couleur de contour', raccourci: 'Alt+C', desactive: rien, onClick: c.memeContour },
    { id: 'meme-type', libelle: 'Sélectionner le même type', raccourci: 'Y', desactive: rien, onClick: c.memeType },
    ...(c.parOperationPossible ? [
      { id: 'tout-decoupe', libelle: 'Sélectionner tout ce qui est à couper', raccourci: 'Alt+Maj+X', desactive: vide, onClick: () => c.parOperation('decoupe') },
      { id: 'tout-ecriture', libelle: 'Sélectionner tout ce qui est à écrire', raccourci: 'Alt+Maj+E', desactive: vide, onClick: () => c.parOperation('ecriture') }
    ] satisfies ElementMenu[] : [])
  ];
}

/**
 * Les raccourcis des commandes de selection, hors d'un champ : I, Y, Alt+C, Alt+Maj+X et Alt+Maj+E. Vrai quand la touche est
 * prise. Alt change la lettre sur macOS (Option+C ecrit « ç ») : la position de la touche (`code`) compte aussi ; C, E, I, X et Y
 * sont a la meme place en AZERTY et en QWERTY.
 */
export function toucheSelection(e: KeyboardEvent, m: ModeleDessin, u: EtatInterface, ac: ActionsEditeur): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  const t = e.key.toLowerCase(), lettre = (l: string) => t === l || e.code === 'Key' + l.toUpperCase();
  const c = commandesSelection(m, u, ac);
  if (e.altKey && e.shiftKey && c.parOperationPossible && (lettre('x') || lettre('e'))) { c.parOperation(lettre('x') ? 'decoupe' : 'ecriture'); return true; }
  if (e.altKey && !e.shiftKey && lettre('c')) { c.memeContour(); return true; }
  if (e.altKey) return false;
  if (t === 'i') { c.inverser(); return true; }
  if (t === 'y') { c.memeType(); return true; }
  return false;
}
