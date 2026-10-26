// Les gestes du texte vivant (ADR-0022) : creer un texte, le retaper ou le restyler, le vectoriser. Le moteur compose et
// pose (engine/texte/) ; ici, on trouve la fonte, on lui demande les contours, et on passe le resultat aux operations pures
// par les verbes de l'editeur (une entree d'historique par geste, une saisie fondue par sa cle).

import { useCallback } from 'react';
import { boiteChemin, MARGE_DEFAUT, MARGE_ENVELOPPE_DEFAUT, sansDisposition, transformerTexte, translation, type Chemin, type DessinSvg, type DispositionTexte, type Forme, type PoliceTexte, type TexteVivant } from '../engine/editionSvg.js';
import { cheminDuTexte, lettresDuTexte } from '../engine/texte/bloc.js';
import { composerDansDessin, peutPorter, texteDispose } from '../engine/texte/disposition.js';
import { traceFerme } from '../engine/texte/surTrace.js';
import type { Pose } from '../engine/texte/pose.js';
import { avecTrace, basculerPeinture, creerTexte, natureDuTexte, nouveauTexte, peintureDuTexte, poserTexte } from '../engine/texte/vivant.js';
import { NOMS_MODES, vectoriserLettresEnGroupes, vectoriserTextes, type ModeVectorisation } from '../engine/texte/vectoriser.js';
import { toleranceBooleen } from '../engine/booleens.js';
import { NOMS_POLICES, estPoliceLivree } from '../model/polices.js';
import { estIdCatalogue } from '../model/cataloguePolices.js';
import type { ChoixProduction } from '../model/contextes.js';
import { toutesLesPolices, type Police } from '../io/polices.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useTexte } from './contexteTexte.js';
import { groupesActifs } from './modele.js';
import type { ProfilProduction } from '../engine/preparation.js';

/** Le texte d'exemple de l'apercu quand le champ est vide. */
export const TEXTE_APERCU = 'Abc';

/**
 * L'epaisseur du trait d'un texte a trait unique : celle du stylo du contexte de production quand il en a une, sinon un
 * vingtieme de la taille (un trait de plume lisible a l'ecran, que l'inspecteur regle ensuite comme tout contour).
 */
export function largeurTrait(taille: number, profil: ProfilProduction | null): number {
  const stylo = profil?.largeurStylo;
  return stylo && stylo > 0 ? stylo : Math.round(taille * 50) / 1000;
}

/** Le mode de vectorisation par defaut : souder en decoupe Cricut (la lame ne coupe pas une lettre a travers sa voisine), sinon lettres separees. */
export const modeParDefaut = (production: ChoixProduction): ModeVectorisation =>
  production.contexte === 'cricut' && production.procede === 'decoupe' ? 'souder-touchantes' : 'lettres';

/** Le nom lisible d'une police d'apres son identifiant (une fonte livree, une fonte deposee connue, sinon sa famille gardee). */
export function nomDePolice(id: string, polices: readonly Police[] | null, famille?: string): string {
  if (estPoliceLivree(id)) return NOMS_POLICES[id];
  return polices?.find(p => p.id === id)?.nom ?? famille ?? id;
}

/** Les contours d'un texte avec cette fonte (sa ligne au milieu du trait, en trace median) ; vides si rien ne se dessine. */
export const contoursDe = (t: TexteVivant, police: Police): Chemin => cheminDuTexte(t, police.glyphes);

/**
 * Ce qui change d'un texte : les reglages, eventuellement la police (et donc sa version), le trace (ADR-0027), et sa disposition sur
 * ou dans une forme (ADR-0031 ; null : il redevient libre).
 */
export type ChangementTexte = Partial<Pick<TexteVivant, 'texte' | 'taille' | 'interlettrage' | 'interligne' | 'alignement' | 'ligatures'>> & { police?: Police; trace?: TraceTexte; disposition?: DispositionTexte | null };

/** Le trace des lettres, tel que la barre le propose : pleines (celui de la police), ou une ligne au milieu du trait. */
export type TraceTexte = 'plein' | 'median';
/** Le trace d'un texte : median s'il le porte ou si sa police est a trait unique (sa ligne native), plein sinon. */
export const traceDe = (t: Pick<TexteVivant, 'police' | 'trace'>): TraceTexte => (natureDuTexte(t) === 'trait' ? 'median' : 'plein');

/**
 * Ce qu'un texte vivant garde de sa police : l'identifiant, la version, et le nom de famille pour une fonte deposee ou une
 * police du catalogue (ADR-0025), de quoi dire « Police absente : … » sans le fichier ni l'index. Le nom est borne a 60
 * caracteres, la borne de la relecture : un texte relu reste un point fixe.
 */
export function policeDuTexte(police: Police): PoliceTexte {
  const nommee = police.id.startsWith('u-') || estIdCatalogue(police.id);
  return { id: police.id, version: police.version, ...(nommee ? { famille: police.nom.slice(0, 60) } : {}) };
}

/** Le texte vivant modifie : les reglages, la police (avec sa version, et sa famille si elle est deposee ou telechargee). */
export function texteModifie(t: TexteVivant, c: ChangementTexte): TexteVivant {
  const { police, trace, disposition, ...reglages } = c;
  const brut: TexteVivant = { ...t, ...reglages, police: police ? policeDuTexte(police) : t.police };
  const m = disposition === null ? sansDisposition(brut) : disposition ? { ...brut, disposition } : brut;
  return avecTrace(m, (trace ?? (t.trace === 'median' ? 'median' : 'plein')) === 'median');
}

/** Ou se pose le texte sur un trace ouvert selon son alignement (ADR-0031) : au debut, au milieu, a la fin. */
const DEPART_OUVERT = { gauche: 0, centre: 0.5, droite: 1 } as const;

/**
 * La disposition d'un texte qu'on pose sur ou dans une forme : centre, au point le plus haut d'une forme fermee (a l'exterieur), au
 * milieu d'un trace ouvert ; dans une forme, en lignes ou deforme (ADR-0032), la marge par defaut. Une disposition deja la sur la
 * meme forme garde ses reglages.
 */
export function dispositionPour(mode: DispositionTexte['mode'], base: Forme, avant?: DispositionTexte): DispositionTexte {
  if (avant?.mode === mode) return { ...avant, forme: base.id };
  if (mode === 'sur') return { mode, forme: base.id, depart: traceFerme(base) ? 0 : 0.5, cote: 'dessus', repartir: false };
  return mode === 'dans' ? { mode, forme: base.id, marge: MARGE_DEFAUT, ajuster: false, justifier: false } : { mode, forme: base.id, marge: MARGE_ENVELOPPE_DEFAUT };
}

/** Le dessin ou le texte `id` prend ces changements, recompose avec sa fonte ; le meme dessin s'il ne se compose pas. */
export function appliquerChangement(d: DessinSvg, id: string, c: ChangementTexte, police: Police, profil: ProfilProduction | null): DessinSvg {
  const f = d.formes.find(x => x.id === id);
  if (!f?.texte) return d;
  // Sur un trace ouvert, changer l'alignement pose le texte au debut, au milieu ou a la fin du trace (sans quoi il deborderait).
  const p = f.texte.disposition, base = p ? d.formes.find(x => x.id === p.forme) : undefined;
  const realigne = c.alignement && c.disposition === undefined && p?.mode === 'sur' && base && !traceFerme(base) ? { ...c, disposition: { ...p, depart: DEPART_OUVERT[c.alignement] } } : c;
  const compose = composerDansDessin(d, id, texteModifie(f.texte, realigne), police.glyphes), t = compose.texte, chemin = compose.d;
  // Un texte qui change de nature (une police a trait unique, ou le trace median, ou l'inverse) change aussi la peinture : un fond ou un trait.
  const avant = natureDuTexte(f.texte), apres = natureDuTexte(t);
  const peinture = avant !== apres ? basculerPeinture(f, apres, largeurTrait(t.taille * Math.sqrt(Math.abs(t.matrice[0] * t.matrice[3] - t.matrice[1] * t.matrice[2])), profil)) : undefined;
  return poserTexte(d, id, t, chemin, peinture);
}

/**
 * Vrai si ce changement ne laisserait rien de dessine d'un texte pose (ADR-0031 : aucune lettre sur le trace, aucun mot dans la
 * forme) : le changement ne se fait pas (une forme sans contours ne s'ecrit pas), et l'interface le dit.
 */
export function rienNeSePose(d: DessinSvg, id: string, c: ChangementTexte, police: Police): boolean {
  const f = d.formes.find(x => x.id === id);
  if (!f?.texte?.disposition || c.disposition === null) return false;
  const r = composerDansDessin(d, id, texteModifie(f.texte, c), police.glyphes);
  return !!r.texte.disposition && !r.d.some(x => x.c !== 'M' && x.c !== 'Z');
}

/** La pose qu'aurait le texte avec ce changement (null s'il serait libre) : de quoi dire pourquoi un texte ne se deforme pas (ADR-0032). */
export function poseApres(d: DessinSvg, id: string, c: ChangementTexte, police: Police): Pose | null {
  const f = d.formes.find(x => x.id === id);
  return f?.texte ? composerDansDessin(d, id, texteModifie(f.texte, c), police.glyphes).pose : null;
}

/** Les lettres d'un texte vivant dans ce dessin : posees sur ou dans sa forme s'il en a une (ADR-0031), en ligne droite sinon. */
export const lettresDansDessin = (d: DessinSvg, f: Forme, police: Police): Chemin[] =>
  (texteDispose(d, f, police.glyphes)?.pose.lettres ?? (f.texte ? lettresDuTexte(f.texte, police.glyphes) : [])).map(l => l.d);

/** La forme peut-elle porter ce texte (ADR-0031) : ni un texte, ni lui-meme, et un trace a elle. */
export const formePorteuse = (d: DessinSvg, idForme: string, idTexte: string): Forme | null => {
  const f = d.formes.find(x => x.id === idForme);
  return peutPorter(f, idTexte) ? f : null;
};

/** La fonte d'un texte parmi celles chargees, ou null (fonte deposee absente). */
export const policeDe = (f: Forme | null | undefined, polices: readonly Police[] | null): Police | null =>
  (f?.texte && polices ? polices.find(p => p.id === f.texte?.police.id) ?? null : null);

/** Les gestes du texte vivant, sur l'etat du moment. */
export function useActionsTexte() {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), tx = useTexte();
  const { dessin } = mo, { profil, production, style, lisserBooleens } = ui;

  /** Ajoute un texte vivant centre sur le plan, le choisit, et le dit. */
  const creer = useCallback((texte: string, police: Police, taille: number, reglages: Partial<Pick<TexteVivant, 'interlettrage' | 'interligne' | 'alignement' | 'ligatures'>>, trace: TraceTexte = 'plein') => {
    const t0 = avecTrace(nouveauTexte(texte, policeDuTexte(police), taille, [1, 0, 0, 1, 0, 0], reglages), trace === 'median');
    const b = boiteChemin(contoursDe(t0, police));
    if (!b) { ac.dire(t('Ce texte ne donne aucune forme avec cette police.')); return null; }
    const [vx, vy, vl, vh] = dessin.vb;
    const tx0 = transformerTexte(t0, translation(vx + (vl - b.l) / 2 - b.x, vy + (vh - b.h) / 2 - b.y));
    const r = creerTexte(dessin, tx0, contoursDe(tx0, police), peintureDuTexte(natureDuTexte(tx0), style, largeurTrait(taille, profil)));
    if (!r.id) return null;
    const id = r.id;
    ac.appliquer(() => r.dessin);
    ac.choisir([id]);
    ac.poserOutil('selection');
    ac.dire(natureDuTexte(tx0) === 'trait'
      ? t('Texte ajouté en {police}, en traits ouverts pour le stylo : il reste modifiable, un double-clic ou Entrée le retape.', { police: police.nom })
      : t('Texte ajouté en {police} : il reste modifiable, un double-clic ou Entrée le retape.', { police: police.nom }));
    return id;
  }, [ac, dessin.vb, profil, style]);

  /** Vectorise les textes choisis dans un mode : une entree d'historique, et le dit. */
  const vectoriser = useCallback(async (mode: ModeVectorisation) => {
    const textes = dessin.formes.filter(f => mo.choisies.has(f.id) && f.texte);
    if (!textes.length) { ac.dire(t('Choisissez d’abord un texte à vectoriser.')); return; }
    const polices = tx.polices ?? await toutesLesPolices().catch(() => [] as Police[]);
    const lettres = new Map<string, Chemin[]>();
    for (const f of textes) {
      const p = policeDe(f, polices);
      if (p && f.texte) lettres.set(f.id, lettresDansDessin(dessin, f, p));
    }
    const options = { lettres, tolerance: toleranceBooleen(dessin), lisser: lisserBooleens };
    // En modele riche, « Lettres séparées » rend les lettres de chaque texte en UN groupe « Texte « … » » (annexe 4 A §2 ; le moteur
    // l'avait, l'interface ne l'appelait pas) : le groupe est choisi, et la phrase le dit. A plat, les formes d'avant.
    const enGroupes = mode === 'lettres' && groupesActifs(dessin, ui.modele);
    const r = enGroupes ? vectoriserLettresEnGroupes(dessin, textes.map(f => f.id), options) : { ...vectoriserTextes(dessin, textes.map(f => f.id), mode, options), groupes: [] };
    if (!r.textes) { ac.dire(t('Ce texte est verrouillé : déverrouillez-le pour le vectoriser.')); return; }
    ac.appliquer(() => r.dessin);
    // Le choix : les groupes crees, et les lettres seules d'un texte qui n'a donne qu'une forme (les autres sont dans un groupe).
    const dansUnGroupe = new Set(r.groupes.flatMap(g => r.dessin.formes.filter(f => f.parent === g).map(f => f.id)));
    ac.choisir([...r.groupes, ...r.ids.filter(id => !dansUnGroupe.has(id))]);
    // Chaque morceau s'accorde en nombre a part, puis la phrase les assemble : le francais reste celui d'avant, mot pour mot.
    const n = r.ids.length, plusieurs = n > 1;
    const dits = r.textes > 1 ? t('{textes} vectorisés', { textes: pluriel(r.textes, 'texte') }) : t('{textes} vectorisé', { textes: pluriel(r.textes, 'texte') });
    const formes = plusieurs ? t('{formes} ordinaires', { formes: pluriel(n, 'forme') }) : t('{formes} ordinaire', { formes: pluriel(n, 'forme') });
    const groupes = r.groupes.length ? (r.groupes.length > 1 ? t(', en {n} groupes', { n: r.groupes.length }) : t(', en un groupe')) : '';
    const parties = r.parParties ? (plusieurs ? t(', coupées par parties de lettres faute de la police') : t(', coupée par parties de lettres faute de la police')) : '';
    ac.dire(t('{textes} ({mode}) : {formes}{groupes}{parties}. Ctrl+Z rend le texte modifiable.', { textes: dits, mode: t(NOMS_MODES[mode]).toLowerCase(), formes, groupes, parties }));
  }, [ac, dessin, lisserBooleens, mo.choisies, tx.polices, ui.modele]);

  /**
   * Remplace une police partout dans le dessin (ADR-0025) : chaque texte vivant qui la porte se recompose avec `police`, en une
   * seule entree d'historique. Un texte verrouille n'est pas touche.
   */
  const remplacerPartout = useCallback((de: string, police: Police) => {
    const ids = dessin.formes.filter(f => f.texte?.police.id === de && !f.verrouille).map(f => f.id);
    if (!ids.length) { ac.dire(t('Aucun texte modifiable n’emploie cette police.')); return; }
    ac.appliquer(d => ids.reduce((acc, id) => appliquerChangement(acc, id, { police }, police, profil), d));
    const v = { textes: pluriel(ids.length, 'texte'), police: police.nom };
    ac.dire(ids.length > 1 ? t('{textes} recomposés en {police}. Ctrl+Z annule.', v) : t('{textes} recomposé en {police}. Ctrl+Z annule.', v));
  }, [ac, dessin.formes, profil]);

  return { creer, vectoriser, remplacerPartout, mode: tx.mode ?? modeParDefaut(production) };
}
