// La toile de l'editeur : le plan de travail, les formes, la grille et la surcouche (selection,
// poignees, trace). Les gestes (pointeur) vivent dans Gestes.ts ; ici, seulement ce qui se dessine.

import { memo, useId, type RefObject } from 'react';
import { useDessin, useInterface } from './contexteEditeur.js';
import { useGestes } from './Gestes.js';
import { Calque, Grille, surcouche } from './Toile.js';
import { useTactile } from './Vue.js';

export const ToileEditeur = memo(function ToileEditeur({ titre, toile, svgRef }: { titre: string; toile: RefObject<HTMLDivElement | null>; svgRef: RefObject<SVGSVGElement | null> }) {
  const mo = useDessin(), ui = useInterface();
  const gestes = useGestes(svgRef);
  const aide = useId();
  const tactile = useTactile();
  const { dessin } = mo, { vues, fond, grille, pas, contours } = ui;
  const z = vues.vue.zoom;
  const [vx, vy, vl, vh] = dessin.vb;
  return (
    <div className={'editeur-toile fond-' + fond} ref={toile}>
      {/* Ce que la toile dit en prenant le focus, dont la sortie (WCAG 2.1.2) : Tab quitte la toile apres la derniere forme, ou Echap puis Tab. */}
      <span id={aide} className="sr-only">Flèches : déplacer. Tab : forme suivante. Alt et flèches : redimensionner. Ctrl et flèches : tourner. Échap puis Tab : quitter la toile.</span>
      <svg ref={svgRef} className="editeur-svg-toile" tabIndex={0} role="application" aria-describedby={aide} aria-label={'Plan de travail de ' + titre + ' : ' + dessin.formes.length + ' forme' + (dessin.formes.length > 1 ? 's' : '')} onPointerDown={gestes.appuyer} onPointerMove={gestes.bouger} onPointerUp={gestes.lacher} onPointerCancel={gestes.lacher} onDoubleClick={gestes.doubleClic}>
        <g transform={`translate(${vues.vue.x} ${vues.vue.y}) scale(${z})`}>
          <defs>
            <pattern id="damier-editeur" patternUnits="userSpaceOnUse" width={16 / z} height={16 / z}>
              <rect className="damier-a" width={16 / z} height={16 / z} />
              <rect className="damier-b" width={8 / z} height={8 / z} />
              <rect className="damier-b" x={8 / z} y={8 / z} width={8 / z} height={8 / z} />
            </pattern>
          </defs>
          <rect className="plan-travail" x={vx} y={vy} width={vl} height={vh} fill={fond === 'damier' ? 'url(#damier-editeur)' : undefined} pointerEvents="none" />
          {grille ? <Grille vb={dessin.vb} pas={pas} /> : null}
          {dessin.formes.map(f => <Calque key={f.id} f={f} contours={contours} />)}
          <g className="surcouche">{surcouche(mo, ui, 1 / z, gestes.cadre, tactile)}</g>
        </g>
      </svg>
    </div>
  );
});
