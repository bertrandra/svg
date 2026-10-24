// Les gestes de « Par couleur » : choisir, recolorer, isoler, combiner, supprimer, nuances proches. Un crochet
// et non des fonctions du composant : les lignes recoivent des verbes STABLES (un objet qui ne change jamais
// d'identite, ADR-0010) pour pouvoir se memoiser, et chaque verbe lit l'etat au moment du geste par une
// reference mise a jour a chaque rendu.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  combiner, fusionnerCouleursProches, idsDeNuancesProches, montrerSeulement, remplacerCouleurSur, restaurerVisibilites, supprimer,
  visibilitesConformes, visibilitesDe, type DessinSvg, type GroupeCouleur, type SurCouleur, type Visibilites
} from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { precisionSur, type ActionsLigne } from './LigneCouleur.js';
import { useActions, useDessin } from './contexteEditeur.js';

/**
 * Un isolement en cours : la visibilite d'avant, et celle qu'il a produite (pour savoir s'il tient encore).
 * `quitteSur` est le dessin que « Quitter » a rendu : tant qu'on y est, on garde l'isolement en memoire, pour
 * que Ctrl+Z (qui le rend) lui redonne son bouton.
 */
interface Isolement { avant: Visibilites; apres: Visibilites; quitteSur: DessinSvg | null }
/** Un geste de couleur en cours : le dessin d'avant, d'ou chaque valeur du selecteur repart, et la cle qui les fond. */
interface GesteCouleur { cle: string; base: DessinSvg; de: string; sur: SurCouleur }
/** La ligne qu'on recolore change de couleur donc de cle : on lui garde sa cle d'avant le temps du geste. */
export interface SuiviCouleur { cle: string; vers: string }

const accord = (n: number) => (n > 1 ? 's' : '');
const nom = (c: string) => c.toUpperCase();

export function useActionsCouleur(sur: SurCouleur, tolerance: number, groupes: readonly GroupeCouleur[]) {
  const mo = useDessin(), ac = useActions();
  const { dessin, sel } = mo;
  const [rangee, poserRangee] = useState<string | null>(null);
  const [isolement, poserIsolement] = useState<Isolement | null>(null);
  // La ligne qu'on recolore change de couleur donc de cle : on lui garde sa cle d'avant le temps du geste,
  // sans quoi elle serait remontee et le selecteur natif se fermerait sous le doigt.
  const [suivi, poserSuivi] = useState<SuiviCouleur | null>(null);
  const geste = useRef<GesteCouleur | null>(null);

  // L'isolement tient tant que les formes qu'il a vues gardent la visibilite qu'il leur a donnee. Annuler
  // le defait sans l'oublier (on peut retablir) ; toute autre modification de visibilite l'oublie.
  const isolementTient = isolement !== null && visibilitesConformes(dessin, isolement.apres);
  const peutRetablir = mo.h.futur.length > 0;
  useEffect(() => { if (isolement && !isolementTient && !peutRetablir && isolement.quitteSur !== dessin) poserIsolement(null); }, [isolement, isolementTient, peutRetablir, dessin]);

  const choisirIds = (ids: string[], message: string) => {
    if (!ids.length) { ac.dire('Aucune forme à choisir : elles sont masquées ou verrouillées.'); return; }
    ac.choisir(ids);
    ac.poserPoint(null);
    ac.dire(message);
  };
  const choisir = (g: GroupeCouleur, ajout: boolean) => {
    if (!g.libres.length) { ac.dire('Les formes ' + nom(g.couleur) + ' sont masquées ou verrouillées.'); return; }
    ac.choisir(ajout ? [...new Set([...sel, ...g.libres])] : g.libres);
    ac.poserPoint(null);
    poserRangee(g.couleur);
  };
  // Des ensembles et non `includes` : retirer une couleur de cinq mille formes choisies serait n au carre.
  const horsSelection = (ids: readonly string[]) => { const retire = new Set(ids); ac.choisir(sel.filter(id => !retire.has(id))); };
  const isoler = (g: GroupeCouleur) => {
    const r = montrerSeulement(dessin, g.ids);
    // Un second isolement garde la visibilite d'avant le premier : c'est elle qu'on veut retrouver.
    const avant = isolementTient && isolement ? isolement.avant : visibilitesDe(dessin);
    const siens = new Set(g.ids);
    ac.faire(() => r, 'Seules les formes ' + nom(g.couleur) + ' restent affichées.');
    ac.choisir(sel.filter(id => siens.has(id)));
    if (r !== dessin) poserIsolement({ avant, apres: visibilitesDe(r), quitteSur: null });
  };
  const quitterIsolement = () => {
    if (!isolement) return;
    const r = restaurerVisibilites(dessin, isolement.avant);
    const visibles = new Set(r.formes.filter(f => f.visible).map(f => f.id));
    ac.faire(() => r, 'Affichage d’avant l’isolement rétabli.');
    ac.choisir(sel.filter(id => visibles.has(id)));
    poserIsolement({ ...isolement, quitteSur: r });
  };
  const recolorer = (g: GroupeCouleur, vers: string) => {
    const x = geste.current ?? { cle: ac.nouvelleCle(), base: dessin, de: g.couleur, sur };
    geste.current = x;
    ac.appliquer(() => remplacerCouleurSur(x.base, x.de, vers, x.sur), x.cle);
    poserSuivi({ cle: suivi && suivi.vers === g.couleur ? suivi.cle : g.couleur, vers });
    ac.dire(nom(x.de) + ' remplacée par ' + nom(vers) + precisionSur(x.sur) + ' : ' + pluriel(g.ids.length, 'forme') + '.');
  };
  const nuancesProchesDe = (couleur: string) => {
    const ids = idsDeNuancesProches(dessin, couleur, tolerance / 100, sur);
    choisirIds(ids, pluriel(ids.length, 'forme') + ' de nuance proche de ' + nom(couleur) + ' (tolérance ' + tolerance + ') choisie' + (ids.length > 1 ? 's' : '') + '.');
    poserRangee(couleur);
  };
  const combinerCouleur = (g: GroupeCouleur) => {
    const r = combiner(dessin, g.libres);
    if (!r.id) return;
    ac.appliquer(() => r.dessin);
    ac.choisir([r.id]);
    ac.dire(pluriel(g.libres.length, 'forme') + ' combinée' + accord(g.libres.length) + ' en une (' + nom(g.couleur) + ').');
  };
  const supprimerCouleur = (g: GroupeCouleur) => {
    const siens = new Set(g.libres);
    ac.faire(d => supprimer(d, g.libres), pluriel(g.libres.length, 'forme') + ' ' + nom(g.couleur) + ' supprimée' + accord(g.libres.length) + '.');
    ac.choisir(sel.filter(id => !siens.has(id)));
  };
  const fusionner = () => {
    const r = fusionnerCouleursProches(dessin, tolerance / 100, sur);
    if (!r.formes) {
      ac.dire(r.conservees ? 'Ces nuances sont sur des formes verrouillées : déverrouillez-les pour les fusionner.' : 'Aucune nuance proche à cette tolérance.');
      return;
    }
    const gardees = r.conservees ? ', ' + pluriel(r.conservees, 'couleur') + ' gardée' + (r.conservees > 1 ? 's' : '') + ' par des formes verrouillées' : '';
    ac.faire(() => r.dessin, pluriel(r.fusionnees, 'couleur') + ' fusionnée' + (r.fusionnees > 1 ? 's' : '') + precisionSur(sur) + ' : ' + pluriel(r.formes, 'forme') + ' recolorée' + (r.formes > 1 ? 's' : '') + gardees + '.');
  };

  // Les verbes que les lignes recoivent : le meme objet pendant toute la vie de la section, qui appelle les
  // fonctions du dernier rendu (celles qui voient la selection et le dessin d'aujourd'hui).
  const vivant = useRef({ choisir, horsSelection, recolorer, isoler, nuancesProchesDe, combinerCouleur, supprimerCouleur });
  vivant.current = { choisir, horsSelection, recolorer, isoler, nuancesProchesDe, combinerCouleur, supprimerCouleur };
  const actions = useMemo<ActionsLigne>(() => ({
    choisir: (g, ajout) => vivant.current.choisir(g, ajout),
    horsSelection: ids => vivant.current.horsSelection(ids),
    debuterRecolorer: () => { ac.finir(); geste.current = null; },
    recolorer: (g, vers) => vivant.current.recolorer(g, vers),
    finirRecolorer: () => { geste.current = null; poserSuivi(null); ac.finir(); },
    isoler: g => vivant.current.isoler(g),
    nuancesProches: g => vivant.current.nuancesProchesDe(g.couleur),
    combiner: g => vivant.current.combinerCouleur(g),
    supprimer: g => vivant.current.supprimerCouleur(g)
  }), [ac]);

  // De quelle couleur partir pour « Sélectionner les nuances proches » : la ligne choisie en dernier si elle l'est
  // encore, sinon la premiere ligne entierement choisie, sinon la couleur de la premiere forme choisie.
  const entiere = (g: GroupeCouleur) => g.libres.length > 0 && g.libres.every(id => mo.choisies.has(id));
  const premiere = sel[0] ? dessin.formes.find(f => f.id === sel[0]) : undefined;
  const depuisForme = premiere ? (sur === 'contour' ? premiere.contour : sur === 'remplissage' ? premiere.remplissage : premiere.remplissage ?? premiere.contour) : null;
  const reference = (rangee ? groupes.find(g => g.couleur === rangee && entiere(g)) : undefined)?.couleur ?? groupes.find(entiere)?.couleur ?? (depuisForme && groupes.some(g => g.couleur === depuisForme) ? depuisForme : null);

  return { actions, suivi, reference, isole: isolement !== null && isolementTient, quitterIsolement, nuancesProchesDe, fusionner };
}
