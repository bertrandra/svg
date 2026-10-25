// L'apercu de la machine sur la toile (ADR-0028) : en contexte Cricut, ce que la lame detache et ce que le stylo trace, a la place
// des couleurs du dessin. Une forme a couper montre sa zone decoupee hachuree (la regle de remplissage de la forme respecte ses
// trous) et son contour de coupe net ; une forme a ecrire, la ligne que suit le stylo, sans remplissage, a la largeur du stylo du
// profil. Rien de tout cela n'est ecrit dans le fichier : c'est une vue, que « Aperçu de la machine » (Maj+O) retire.
//
// Les formes ordinaires restent dessinees dessous, transparentes (classe `apercu-machine` du cadre) : ce sont elles qui recoivent
// les clics et les gestes, comme hors de l'apercu. Cette couche-ci ne prend aucun pointeur.

import { memo, useId } from 'react';
import { operationsApplicables, partagerOperations } from '../engine/preparation.js';
import { useDessin, useInterface } from './contexteEditeur.js';
import { cheminDe } from './Toile.js';

/** Vrai quand la toile montre l'apercu : un contexte Cricut qui coupe ou ecrit, le reglage actif, et pas la vue contours (O). */
export function useApercuVisible(): boolean {
  const { profil, apercuMachine, contours } = useInterface();
  return !!profil && operationsApplicables(profil.procede) && apercuMachine && !contours;
}

/** L'ecart des hachures et l'epaisseur de leurs lignes, en pixels d'ecran : lisibles a tout zoom. */
const ECART_HACHURES = 7, LIGNE_HACHURES = 1.25;
/** Le trait du stylo ne descend pas sous cette largeur a l'ecran : a 25 %, 0,4 mm ne ferait plus un pixel. */
const STYLO_MIN = 1.25;

export const ApercuMachine = memo(function ApercuMachine() {
  const { dessin } = useDessin(), { profil, vues } = useInterface();
  const visible = useApercuVisible();
  const id = useId();
  if (!visible || !profil) return null;
  const z = vues.vue.zoom, motif = 'hachures-machine-' + id.replace(/[^a-zA-Z0-9_-]/g, '');
  const { decoupe, ecriture } = partagerOperations(dessin, profil.procede);
  const largeurStylo = Math.max(profil.largeurStylo, STYLO_MIN / z);
  return (
    <g className="apercu-machine" pointerEvents="none" aria-hidden="true">
      <defs>
        <pattern id={motif} patternUnits="userSpaceOnUse" width={ECART_HACHURES / z} height={ECART_HACHURES / z} patternTransform="rotate(45)">
          <line className="apercu-hachure" x1={0} y1={0} x2={0} y2={ECART_HACHURES / z} strokeWidth={LIGNE_HACHURES / z} />
        </pattern>
      </defs>
      {decoupe.formes.map(f => (f.visible ? (
        <g key={f.id} data-operation="decoupe" data-cible={f.id}>
          {/* La zone que la lame detache : la region peinte par le fond, trous compris (la regle de la forme). Sans fond, rien a detacher. */}
          {f.remplissage !== null ? <path className="apercu-zone" d={cheminDe(f)} fill={'url(#' + motif + ')'} fillRule={f.regle} /> : null}
          <path className="apercu-coupe" d={cheminDe(f)} fill="none" />
        </g>
      ) : null))}
      {ecriture.formes.map(f => (f.visible ? <path key={f.id} className="apercu-stylo" data-operation="ecriture" data-cible={f.id} d={cheminDe(f)} fill="none" strokeWidth={largeurStylo} /> : null))}
    </g>
  );
});
