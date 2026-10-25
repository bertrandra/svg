// Les gestes du texte vivant (ADR-0022) : creer un texte, le retaper ou le restyler, le vectoriser. Le moteur compose et
// pose (engine/texte/) ; ici, on trouve la fonte, on lui demande les contours, et on passe le resultat aux operations pures
// par les verbes de l'editeur (une entree d'historique par geste, une saisie fondue par sa cle).

import { useCallback } from 'react';
import { boiteChemin, transformerTexte, translation, type Chemin, type DessinSvg, type Forme, type PoliceTexte, type TexteVivant } from '../engine/editionSvg.js';
import { cheminDuTexte, lettresDuTexte } from '../engine/texte/bloc.js';
import { avecTrace, basculerPeinture, creerTexte, natureDuTexte, nouveauTexte, peintureDuTexte, poserTexte } from '../engine/texte/vivant.js';
import { NOMS_MODES, vectoriserTextes, type ModeVectorisation } from '../engine/texte/vectoriser.js';
import { toleranceBooleen } from '../engine/booleens.js';
import { NOMS_POLICES, estPoliceLivree } from '../model/polices.js';
import { estIdCatalogue } from '../model/cataloguePolices.js';
import type { ChoixProduction } from '../model/contextes.js';
import { toutesLesPolices, type Police } from '../io/polices.js';
import { pluriel } from '../util/texte.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useTexte } from './contexteTexte.js';
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

/** Ce qui change d'un texte : les reglages, eventuellement la police (et donc sa version), et le trace (ADR-0027). */
export type ChangementTexte = Partial<Pick<TexteVivant, 'texte' | 'taille' | 'interlettrage' | 'interligne' | 'alignement' | 'ligatures'>> & { police?: Police; trace?: TraceTexte };

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
  const { police, trace, ...reglages } = c;
  const m: TexteVivant = { ...t, ...reglages, police: police ? policeDuTexte(police) : t.police };
  return avecTrace(m, (trace ?? (t.trace === 'median' ? 'median' : 'plein')) === 'median');
}

/** Le dessin ou le texte `id` prend ces changements, recompose avec sa fonte ; le meme dessin s'il ne se compose pas. */
export function appliquerChangement(d: DessinSvg, id: string, c: ChangementTexte, police: Police, profil: ProfilProduction | null): DessinSvg {
  const f = d.formes.find(x => x.id === id);
  if (!f?.texte) return d;
  const t = texteModifie(f.texte, c), chemin = contoursDe(t, police);
  // Un texte qui change de nature (une police a trait unique, ou le trace median, ou l'inverse) change aussi la peinture : un fond ou un trait.
  const avant = natureDuTexte(f.texte), apres = natureDuTexte(t);
  const peinture = avant !== apres ? basculerPeinture(f, apres, largeurTrait(t.taille * Math.sqrt(Math.abs(t.matrice[0] * t.matrice[3] - t.matrice[1] * t.matrice[2])), profil)) : undefined;
  return poserTexte(d, id, t, chemin, peinture);
}

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
    if (!b) { ac.dire('Ce texte ne donne aucune forme avec cette police.'); return null; }
    const [vx, vy, vl, vh] = dessin.vb;
    const t = transformerTexte(t0, translation(vx + (vl - b.l) / 2 - b.x, vy + (vh - b.h) / 2 - b.y));
    const r = creerTexte(dessin, t, contoursDe(t, police), peintureDuTexte(natureDuTexte(t), style, largeurTrait(taille, profil)));
    if (!r.id) return null;
    const id = r.id;
    ac.appliquer(() => r.dessin);
    ac.choisir([id]);
    ac.poserOutil('selection');
    ac.dire('Texte ajouté en ' + police.nom + (natureDuTexte(t) === 'trait' ? ', en traits ouverts pour le stylo' : '') + ' : il reste modifiable, un double-clic ou Entrée le retape.');
    return id;
  }, [ac, dessin.vb, profil, style]);

  /** Vectorise les textes choisis dans un mode : une entree d'historique, et le dit. */
  const vectoriser = useCallback(async (mode: ModeVectorisation) => {
    const textes = dessin.formes.filter(f => mo.choisies.has(f.id) && f.texte);
    if (!textes.length) { ac.dire('Choisissez d’abord un texte à vectoriser.'); return; }
    const polices = tx.polices ?? await toutesLesPolices().catch(() => [] as Police[]);
    const lettres = new Map<string, Chemin[]>();
    for (const f of textes) {
      const p = policeDe(f, polices);
      if (p && f.texte) lettres.set(f.id, lettresDuTexte(f.texte, p.glyphes).map(l => l.d));
    }
    const r = vectoriserTextes(dessin, textes.map(f => f.id), mode, { lettres, tolerance: toleranceBooleen(dessin), lisser: lisserBooleens });
    if (!r.textes) { ac.dire('Ce texte est verrouillé : déverrouillez-le pour le vectoriser.'); return; }
    ac.appliquer(() => r.dessin);
    ac.choisir(r.ids);
    ac.dire(pluriel(r.textes, 'texte') + ' vectorisé' + (r.textes > 1 ? 's' : '') + ' (' + NOMS_MODES[mode].toLowerCase() + ') : ' + pluriel(r.ids.length, 'forme') + ' ordinaire' + (r.ids.length > 1 ? 's' : '')
      + (r.parParties ? ', coupée' + (r.ids.length > 1 ? 's' : '') + ' par parties de lettres faute de la police' : '') + '. Ctrl+Z rend le texte modifiable.');
  }, [ac, dessin, lisserBooleens, mo.choisies, tx.polices]);

  /**
   * Remplace une police partout dans le dessin (ADR-0025) : chaque texte vivant qui la porte se recompose avec `police`, en une
   * seule entree d'historique. Un texte verrouille n'est pas touche.
   */
  const remplacerPartout = useCallback((de: string, police: Police) => {
    const ids = dessin.formes.filter(f => f.texte?.police.id === de && !f.verrouille).map(f => f.id);
    if (!ids.length) { ac.dire('Aucun texte modifiable n’emploie cette police.'); return; }
    ac.appliquer(d => ids.reduce((acc, id) => appliquerChangement(acc, id, { police }, police, profil), d));
    ac.dire(pluriel(ids.length, 'texte') + ' recomposé' + (ids.length > 1 ? 's' : '') + ' en ' + police.nom + '. Ctrl+Z annule.');
  }, [ac, dessin.formes, profil]);

  return { creer, vectoriser, remplacerPartout, mode: tx.mode ?? modeParDefaut(production) };
}
