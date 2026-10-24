// Les calques par couleur (ADR-0006) : chaque couleur du dessin, avec ses formes, et ce qu'on peut en
// faire d'un geste : les choisir, la changer partout, les afficher ou les masquer, les verrouiller,
// n'afficher qu'elles (et en sortir), choisir ou fusionner ses nuances proches. Les listes se lisent sur
// le remplissage, le contour, ou les deux.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  couleursProches, fusionnerCouleursProches, groupesDeCouleur, idsDeNuancesProches, montrerSeulement, remplacerCouleurSur, restaurerVisibilites,
  visibilitesConformes, visibilitesDe, type DessinSvg, type GroupeCouleur, type SurCouleur, type Visibilites
} from '../engine/editionSvg.js';
import { LigneCouleur, pluriel, precisionSur, type ActionsLigne } from './LigneCouleur.js';
import { Section } from './Section.js';
import type { Edition } from './typesEditeur.js';

const SURS: ReadonlyArray<readonly [SurCouleur, string, string]> = [
  ['tout', 'Les deux', 'Couleurs du remplissage et du contour'], ['remplissage', 'Fond', 'Couleurs de remplissage seulement'], ['contour', 'Trait', 'Couleurs de contour seulement']
];

// La tolerance se regle en centiemes d'ecart OKLab (util/couleur.ts) : 2 se devine, 10 saute aux yeux.
const TOLERANCE_MIN = 1, TOLERANCE_MAX = 15, TOLERANCE_DEFAUT = 4;
// Au-dela, l'apercu des nuances (quadratique en nombre de couleurs) coute plus qu'il n'apprend : on ne le calcule qu'a l'action.
const COULEURS_APERCU_MAX = 400;

/**
 * Un isolement en cours : la visibilite d'avant, et celle qu'il a produite (pour savoir s'il tient encore).
 * `quitteSur` est le dessin que « Quitter » a rendu : tant qu'on y est, on garde l'isolement en memoire, pour
 * que Ctrl+Z (qui le rend) lui redonne son bouton.
 */
interface Isolement { avant: Visibilites; apres: Visibilites; quitteSur: DessinSvg | null }
/** Un geste de couleur en cours : le dessin d'avant, d'ou chaque valeur du selecteur repart, et la cle qui les fond. */
interface GesteCouleur { cle: string; base: DessinSvg; de: string; sur: SurCouleur }

export function ParCouleur({ ed }: { ed: Edition }) {
  const { dessin, sel } = ed;
  const [sur, poserSur] = useState<SurCouleur>('tout');
  const [tolerance, poserTolerance] = useState(TOLERANCE_DEFAUT);
  const [rangee, poserRangee] = useState<string | null>(null);
  const [isolement, poserIsolement] = useState<Isolement | null>(null);
  // La ligne qu'on recolore change de couleur donc de cle : on lui garde sa cle d'avant le temps du geste,
  // sans quoi elle serait remontee et le selecteur natif se fermerait sous le doigt.
  const [suivi, poserSuivi] = useState<{ cle: string; vers: string } | null>(null);
  const geste = useRef<GesteCouleur | null>(null);
  const groupes = useMemo(() => groupesDeCouleur(dessin, sur), [dessin, sur]);
  // L'apercu passe apres le reste : pendant un geste continu il retarde d'un cran plutot que de le ralentir.
  const dessinApercu = useDeferredValue(dessin);
  const proches = useMemo(() => (groupes.length > COULEURS_APERCU_MAX ? null : couleursProches(dessinApercu, tolerance / 100, sur)), [dessinApercu, groupes.length, tolerance, sur]);

  // L'isolement tient tant que les formes qu'il a vues gardent la visibilite qu'il leur a donnee. Annuler
  // le defait sans l'oublier (on peut retablir) ; toute autre modification de visibilite l'oublie.
  const isolementTient = isolement !== null && visibilitesConformes(dessin, isolement.apres);
  const peutRetablir = ed.h.futur.length > 0;
  useEffect(() => { if (isolement && !isolementTient && !peutRetablir && isolement.quitteSur !== dessin) poserIsolement(null); }, [isolement, isolementTient, peutRetablir, dessin]);

  if (!dessin.formes.length) return null;

  const nom = (c: string) => c.toUpperCase();
  const choisirIds = (ids: string[], message: string) => {
    if (!ids.length) { ed.dire('Aucune forme à choisir : elles sont masquées ou verrouillées.'); return; }
    ed.choisir(ids);
    ed.poserPoint(null);
    ed.dire(message);
  };

  const isoler = (g: GroupeCouleur) => {
    const r = montrerSeulement(dessin, g.ids);
    // Un second isolement garde la visibilite d'avant le premier : c'est elle qu'on veut retrouver.
    const avant = isolementTient && isolement ? isolement.avant : visibilitesDe(dessin);
    ed.faire(() => r, 'Seules les formes ' + nom(g.couleur) + ' restent affichées.');
    ed.choisir(sel.filter(id => g.ids.includes(id)));
    if (r !== dessin) poserIsolement({ avant, apres: visibilitesDe(r), quitteSur: null });
  };
  const quitterIsolement = () => {
    if (!isolement) return;
    const r = restaurerVisibilites(dessin, isolement.avant);
    const visibles = new Set(r.formes.filter(f => f.visible).map(f => f.id));
    ed.faire(() => r, 'Affichage d’avant l’isolement rétabli.');
    ed.choisir(sel.filter(id => visibles.has(id)));
    poserIsolement({ ...isolement, quitteSur: r });
  };

  const debuterRecolorer = () => { ed.finir(); geste.current = null; };
  const recolorer = (g: GroupeCouleur, vers: string) => {
    const x = geste.current ?? { cle: ed.nouvelleCle(), base: dessin, de: g.couleur, sur };
    geste.current = x;
    ed.appliquer(() => remplacerCouleurSur(x.base, x.de, vers, x.sur), x.cle);
    poserSuivi({ cle: suivi && suivi.vers === g.couleur ? suivi.cle : g.couleur, vers });
    ed.dire(nom(x.de) + ' remplacée par ' + nom(vers) + precisionSur(x.sur) + ' : ' + pluriel(g.ids.length, 'forme') + '.');
  };
  const finirRecolorer = () => { geste.current = null; poserSuivi(null); ed.finir(); };

  const nuancesProchesDe = (couleur: string) => {
    const ids = idsDeNuancesProches(dessin, couleur, tolerance / 100, sur);
    choisirIds(ids, pluriel(ids.length, 'forme') + ' de nuance proche de ' + nom(couleur) + ' (tolérance ' + tolerance + ') choisie' + (ids.length > 1 ? 's' : '') + '.');
    poserRangee(couleur);
  };
  const fusionner = () => {
    const r = fusionnerCouleursProches(dessin, tolerance / 100, sur);
    if (!r.formes) {
      ed.dire(r.conservees ? 'Ces nuances sont sur des formes verrouillées : déverrouillez-les pour les fusionner.' : 'Aucune nuance proche à cette tolérance.');
      return;
    }
    const gardees = r.conservees ? ', ' + pluriel(r.conservees, 'couleur') + ' gardée' + (r.conservees > 1 ? 's' : '') + ' par des formes verrouillées' : '';
    ed.faire(() => r.dessin, pluriel(r.fusionnees, 'couleur') + ' fusionnée' + (r.fusionnees > 1 ? 's' : '') + precisionSur(sur) + ' : ' + pluriel(r.formes, 'forme') + ' recolorée' + (r.formes > 1 ? 's' : '') + gardees + '.');
  };

  // De quelle couleur partir pour « Sélectionner les nuances proches » : la ligne choisie en dernier si elle l'est
  // encore, sinon la premiere ligne entierement choisie, sinon la couleur de la premiere forme choisie.
  const choisis = new Set(sel);
  const entiere = (g: GroupeCouleur) => g.libres.length > 0 && g.libres.every(id => choisis.has(id));
  const premiere = sel[0] ? dessin.formes.find(f => f.id === sel[0]) : undefined;
  const depuisForme = premiere ? (sur === 'contour' ? premiere.contour : sur === 'remplissage' ? premiere.remplissage : premiere.remplissage ?? premiere.contour) : null;
  const reference = (rangee ? groupes.find(g => g.couleur === rangee && entiere(g)) : undefined)?.couleur ?? groupes.find(entiere)?.couleur ?? (depuisForme && groupes.some(g => g.couleur === depuisForme) ? depuisForme : null);

  const actions: ActionsLigne = { sur, choisie: poserRangee, debuterRecolorer, recolorer, finirRecolorer, isoler, nuancesProches: g => nuancesProchesDe(g.couleur) };
  const cleDe = (g: GroupeCouleur) => (suivi && g.couleur === suivi.vers && !groupes.some(x => x.couleur === suivi.cle) ? suivi.cle : g.couleur);
  const fondues = proches ? proches.reduce((n, p) => n + p.membres.length, 0) : 0;
  return (
    <Section titre="Par couleur" ouverte note={groupes.length}>
      <div className="mini-onglets" role="group" aria-label="Couleurs lues sur">
        {SURS.map(([id, libelle, aide]) => <button key={id} type="button" aria-pressed={sur === id} title={aide} onClick={() => poserSur(id)}>{libelle}</button>)}
      </div>
      {isolement && isolementTient ? (
        <div className="isolement" role="status">
          <span className="aide">Une seule couleur est affichée.</span>
          <button type="button" className="discret" title="Rendre à chaque forme sa visibilité d’avant (Ctrl+Z annule aussi)" onClick={quitterIsolement}>Quitter l’isolement</button>
        </div>
      ) : null}
      {groupes.length ? (
        <ul className="par-couleur">{groupes.map(g => <LigneCouleur key={cleDe(g)} ed={ed} g={g} actions={actions} />)}</ul>
      ) : <p className="aide">Aucune forme n’a de {sur === 'contour' ? 'contour' : 'remplissage'}.</p>}
      <div className="nuances-proches">
        <label className="champ-ligne">
          <span>Tolérance</span>
          <input type="range" min={TOLERANCE_MIN} max={TOLERANCE_MAX} step={1} value={tolerance} aria-valuetext={'Tolérance ' + tolerance + ' sur ' + TOLERANCE_MAX}
            title="Écart de couleur toléré entre deux nuances : 2 se devine, 10 saute aux yeux" onChange={e => poserTolerance(Number(e.target.value))} />
          <output>{tolerance}</output>
        </label>
        <p className="aide" role="status">
          {proches === null ? 'Beaucoup de couleurs : le décompte se fait à l’action.' : fondues ? pluriel(fondues, 'nuance') + ' se fondrai' + (fondues > 1 ? 'ent' : 't') + ' dans ' + pluriel(proches.length, 'couleur') + '.' : 'Aucune nuance proche à cette tolérance.'}
        </p>
        <div className="boutons">
          <button type="button" disabled={!reference} title={reference ? 'Choisir les formes proches de ' + nom(reference) : 'Choisissez d’abord une couleur'}
            onClick={() => { if (reference) nuancesProchesDe(reference); }}>Sélectionner les nuances proches</button>
          <button type="button" disabled={proches !== null && !fondues} title="Ramener chaque groupe de nuances à sa couleur la plus employée (Ctrl+Z annule)" onClick={fusionner}>Fusionner les nuances proches</button>
        </div>
      </div>
    </Section>
  );
}
