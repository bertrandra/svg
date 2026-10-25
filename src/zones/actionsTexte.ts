// Les gestes du texte vivant (ADR-0022) : creer un texte, le retaper ou le restyler, le vectoriser. Le moteur compose et
// pose (engine/texte/) ; ici, on trouve la fonte, on lui demande les contours, et on passe le resultat aux operations pures
// par les verbes de l'editeur (une entree d'historique par geste, une saisie fondue par sa cle).

import { useCallback } from 'react';
import { boiteChemin, transformerTexte, translation, type Chemin, type DessinSvg, type Forme, type TexteVivant } from '../engine/editionSvg.js';
import { cheminDuTexte, lettresDuTexte } from '../engine/texte/bloc.js';
import { basculerPeinture, creerTexte, nouveauTexte, peintureDuTexte, poserTexte } from '../engine/texte/vivant.js';
import { NOMS_MODES, vectoriserTextes, type ModeVectorisation } from '../engine/texte/vectoriser.js';
import { toleranceBooleen } from '../engine/booleens.js';
import { NOMS_POLICES, estPoliceLivree, naturePolice } from '../model/polices.js';
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

/** Les contours d'un texte avec cette fonte ; vides si rien ne se dessine. */
export const contoursDe = (t: TexteVivant, police: Police): Chemin => cheminDuTexte(t, police.glyphes);

/** Ce qui change d'un texte : les reglages, et eventuellement la police (et donc sa version). */
export type ChangementTexte = Partial<Pick<TexteVivant, 'texte' | 'taille' | 'interlettrage' | 'interligne' | 'alignement' | 'ligatures'>> & { police?: Police };

/** Le texte vivant modifie : les reglages, la police (avec sa version, et sa famille si elle est deposee). */
export function texteModifie(t: TexteVivant, c: ChangementTexte): TexteVivant {
  const { police, ...reglages } = c;
  const p = police ? { id: police.id, version: police.version, ...(police.id.startsWith('u-') ? { famille: police.nom } : {}) } : t.police;
  return { ...t, ...reglages, police: p };
}

/** Le dessin ou le texte `id` prend ces changements, recompose avec sa fonte ; le meme dessin s'il ne se compose pas. */
export function appliquerChangement(d: DessinSvg, id: string, c: ChangementTexte, police: Police, profil: ProfilProduction | null): DessinSvg {
  const f = d.formes.find(x => x.id === id);
  if (!f?.texte) return d;
  const t = texteModifie(f.texte, c), chemin = contoursDe(t, police);
  // Une police qui change de nature (contour vers trait unique, ou l'inverse) change aussi la peinture : un fond ou un trait.
  const peinture = c.police && naturePolice(c.police.id) !== naturePolice(f.texte.police.id) ? basculerPeinture(f, naturePolice(c.police.id), largeurTrait(t.taille * Math.sqrt(Math.abs(t.matrice[0] * t.matrice[3] - t.matrice[1] * t.matrice[2])), profil)) : undefined;
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
  const creer = useCallback((texte: string, police: Police, taille: number, reglages: Partial<Pick<TexteVivant, 'interlettrage' | 'ligatures'>>) => {
    const t0 = nouveauTexte(texte, { id: police.id, version: police.version, ...(police.id.startsWith('u-') ? { famille: police.nom } : {}) }, taille, [1, 0, 0, 1, 0, 0], reglages);
    const b = boiteChemin(contoursDe(t0, police));
    if (!b) { ac.dire('Ce texte ne donne aucune forme avec cette police.'); return null; }
    const [vx, vy, vl, vh] = dessin.vb;
    const t = transformerTexte(t0, translation(vx + (vl - b.l) / 2 - b.x, vy + (vh - b.h) / 2 - b.y));
    const r = creerTexte(dessin, t, contoursDe(t, police), peintureDuTexte(police.nature, style, largeurTrait(taille, profil)));
    if (!r.id) return null;
    const id = r.id;
    ac.appliquer(() => r.dessin);
    ac.choisir([id]);
    ac.poserOutil('selection');
    ac.dire('Texte ajouté en ' + police.nom + (police.nature === 'trait' ? ', en traits ouverts pour le stylo' : '') + ' : il reste modifiable, un double-clic ou Entrée le retape.');
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

  return { creer, vectoriser, mode: tx.mode ?? modeParDefaut(production) };
}
