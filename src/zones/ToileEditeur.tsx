// La toile de l'editeur : le plan de travail, les formes, la grille et la surcouche (selection,
// poignees, trace). Les gestes (pointeur) vivent dans Gestes.ts ; ici, seulement ce qui se dessine.

import { memo, useId, type RefObject } from 'react';
import { useDessin, useInterface } from './contexteEditeur.js';
import { useGestes } from './Gestes.js';
import { Calque, cheminDe, Grille, surcouche } from './Toile.js';
import { AlertesToile, GabaritTapis } from './Production.js';
import { useTactile } from './Vue.js';
import { insecables } from '../util/texte.js';
import { SaisieTexte } from './SaisieTexte.js';
import { FondPrise, SurvolToile } from './PriseToile.js';
import { useSaisie } from './contexteSaisie.js';
import { ApercuMachine } from './ApercuMachine.js';

export const ToileEditeur = memo(function ToileEditeur({ titre, toile, svgRef, idToile }: { titre: string; toile: RefObject<HTMLDivElement | null>; svgRef: RefObject<SVGSVGElement | null>; idToile: string }) {
  const mo = useDessin(), ui = useInterface(), sx = useSaisie();
  const gestes = useGestes(svgRef);
  const aide = useId();
  const tactile = useTactile();
  const { dessin } = mo, { vues, fond, grille, pas, contours } = ui;
  const z = vues.vue.zoom;
  const [vx, vy, vl, vh] = dessin.vb;
  return (
    <div className={'editeur-toile fond-' + fond} ref={toile}>
      {/* Ce que la toile dit en prenant le focus, dont la sortie (WCAG 2.1.2) : Tab quitte la toile apres la derniere forme, ou Echap puis Tab. */}
      <span id={aide} className="sr-only">Flèches : déplacer. Tab : forme suivante. Alt et flèches : redimensionner. Ctrl et flèches : tourner. Maj et Page suivante : ajouter la forme suivante à la sélection. Espace : ajouter ou retirer la forme au curseur. Entrée : modifier le texte choisi, ou les points d’une forme. Échap puis Tab : quitter la toile.</span>
      <svg ref={svgRef} id={idToile} className="editeur-svg-toile" tabIndex={0} role="application" aria-describedby={aide} aria-label={'Plan de travail de ' + titre + ' : ' + dessin.formes.length + ' forme' + (dessin.formes.length > 1 ? 's' : '')} onPointerDown={gestes.appuyer} onPointerMove={gestes.bouger} onPointerUp={gestes.lacher} onPointerCancel={gestes.lacher} onDoubleClick={gestes.doubleClic} onMouseDown={gestes.sourisBas}>
        <FondPrise />
        <g transform={`translate(${vues.vue.x} ${vues.vue.y}) scale(${z})`}>
          <defs>
            <pattern id="damier-editeur" patternUnits="userSpaceOnUse" width={16 / z} height={16 / z}>
              <rect className="damier-a" width={16 / z} height={16 / z} />
              <rect className="damier-b" width={8 / z} height={8 / z} />
              <rect className="damier-b" x={8 / z} y={8 / z} width={8 / z} height={8 / z} />
            </pattern>
          </defs>
          <rect className="plan-travail" x={vx} y={vy} width={vl} height={vh} fill={fond === 'damier' ? 'url(#damier-editeur)' : undefined} pointerEvents="none" />
          <GabaritTapis />
          {grille ? <Grille vb={dessin.vb} pas={pas} /> : null}
          {/* L'apercu de la machine (ADR-0028) : avant les formes, qu'il rend transparentes (editeur.css) ; elles gardent les clics. */}
          <ApercuMachine />
          {dessin.formes.map(f => <Calque key={f.id} f={f} contours={contours} masquee={sx.vide && f.id === sx.saisie?.id} />)}
          <AlertesToile chemin={cheminDe} />
          <SurvolToile svgRef={svgRef} chemin={cheminDe} />
          <g className="surcouche">{surcouche(mo, ui, 1 / z, gestes.cadre, tactile, !!sx.saisie)}</g>
        </g>
      </svg>
      <SaisieTexte svgRef={svgRef} />
      {/* Un plan vide (ADR-0019) : le premier geste, sur la toile meme. Les clics passent a travers ; l'inspecteur le dit aux lecteurs d'ecran. */}
      {dessin.formes.length || ui.outil !== 'selection' ? null : (
        mo.h.passe.length
          ? <p className="toile-vide" aria-hidden="true" data-vide="vide">{insecables('Le plan est vide : Ctrl+Z fait revenir les formes, ou le rectangle (R) en trace une neuve.')}</p>
          : <p className="toile-vide" aria-hidden="true" data-vide="premiere-fois">{insecables('Le plan est vide : le rectangle (R) y trace une première forme.')}</p>
      )}
    </div>
  );
});
