// Ce que la toile montre d'un cadre ou d'un lasso en cours (ADR-0035) : la zone elle-meme, en tirets quand elle prend les formes
// touchees, en trait plein quand elle ne prend que celles entierement dedans (la convention des logiciels de CAO : « capture » en
// tirets, « fenetre » pleine) ; et, sur chaque forme que le relachement prendra, le lisere de survol de l'ADR-0029 : ce qu'on voit
// est ce qu'on prend. Au clavier, la meme chose d'apres le reticule (premier coin pose ou points du lasso, et le reticule).
//
// L'apercu est un seul chemin (deux avec son halo), quel que soit le nombre de formes : 5 000 formes prises ne font pas 10 000
// elements. Rien ne prend de pointeur.
//
// Tout cela se dessine dans deux calques poses sur la toile (deux `svg` a part, chacun dans sa couche de composition) : l'apercu,
// qui ne change que quand les formes prises changent, et la zone, qui suit chaque mouvement. Dessines dans la toile, chaque
// mouvement repeignait les formes et l'apercu : sur 5 000 formes prises, une image coutait 2,5 fois celle du cadre d'avant ; a part,
// 1,7 fois, et un apercu de quelques centaines de formes ne se voit pas (mesures, ADR-0035).

import { memo, useMemo, type ReactNode } from 'react';
import { boiteForme, type Forme } from '../engine/editionSvg.js';
import { formesDansZone, type PointZone, type RegleZone } from '../engine/selection.js';
import { useDessin, useInterface } from './contexteEditeur.js';
import { estOutilZone } from './commandesSelection.js';
import { useZoneEnCours, zoneDe, type MagasinZone } from './GesteZone.js';
import type { OutilZone, Vue } from './typesEditeur.js';

/** Le chemin qui montre une forme prise : son trace, ou la boite d'un texte libre (il se prend par elle). */
function cheminApercu(f: Forme, chemin: (f: Forme) => string): string {
  if (f.texte && !f.texte.disposition) {
    const b = boiteForme(f);
    return b ? 'M' + b.x + ' ' + b.y + 'h' + b.l + 'v' + b.h + 'h' + -b.l + 'Z' : '';
  }
  return chemin(f);
}

/** Un calque pose sur la toile, a sa taille, dans le repere de la vue ; muet pour les lecteurs d'ecran, sans pointeur. */
function Calque({ classe, vue, children }: { classe: string; vue: Vue; children: ReactNode }) {
  return (
    <svg className={'calque-zone ' + classe} aria-hidden="true" focusable="false">
      <g transform={`translate(${vue.x} ${vue.y}) scale(${vue.zoom})`}>{children}</g>
    </svg>
  );
}

/** L'apercu : le lisere des formes que la zone prend. Memoise : il ne se redessine que si elles changent (ou la vue). */
const Apercu = memo(function Apercu({ ids, vue, chemin }: { ids: readonly string[]; vue: Vue; chemin: (f: Forme) => string }) {
  const { dessin } = useDessin();
  const d = useMemo(() => {
    if (!ids.length) return '';
    const voulues = new Set(ids);
    return dessin.formes.filter(f => voulues.has(f.id)).map(f => cheminApercu(f, chemin)).join(' ');
  }, [dessin.formes, ids, chemin]);
  if (!d) return null;
  return (
    <Calque classe="apercu-zone" vue={vue}>
      <path className="lisere-survol-fond" d={d} />
      <path className="lisere-survol" d={d} />
    </Calque>
  );
});

/** La zone et l'apercu. */
function DessinZone({ forme, points, regle, ids, curseur, vue, chemin }: {
  forme: OutilZone; points: readonly PointZone[]; regle: RegleZone; ids: readonly string[]; curseur: PointZone | null; vue: Vue; chemin: (f: Forme) => string;
}) {
  const classe = 'cadre-selection' + (regle === 'dedans' ? ' dedans' : '');
  const a = points[0], b = points[points.length - 1], unite = 1 / vue.zoom;
  return (
    <>
      <Apercu ids={ids} vue={vue} chemin={chemin} />
      <Calque classe="zone-selection-calque" vue={vue}>
        <g className="zone-selection" data-regle={regle} data-forme={forme}>
          {points.length < 2 ? null : forme === 'cadre' && a && b
            ? <rect className={classe} x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} />
            : <polygon className={classe} points={points.map(q => q[0] + ',' + q[1]).join(' ')} />}
          {curseur ? (
            <g className="reticule">
              <line x1={curseur[0] - 12 * unite} y1={curseur[1]} x2={curseur[0] + 12 * unite} y2={curseur[1]} />
              <line x1={curseur[0]} y1={curseur[1] - 12 * unite} x2={curseur[0]} y2={curseur[1] + 12 * unite} />
              <circle cx={curseur[0]} cy={curseur[1]} r={3 * unite} />
            </g>
          ) : null}
        </g>
      </Calque>
    </>
  );
}

/** Le cadre ou le lasso du clavier : le premier coin (ou les points) poses, le reticule, et l'apercu de ce qu'Entree prendra. */
function ZoneClavier({ outil, vue, chemin }: { outil: OutilZone; vue: Vue; chemin: (f: Forme) => string }) {
  const { dessin } = useDessin(), { trace, curseur, regleZone, contours } = useInterface();
  const points = useMemo<readonly PointZone[]>(() => (curseur ? [...trace, curseur] : trace), [trace, curseur]);
  const ids = useMemo(() => {
    const geo = trace.length ? zoneDe(outil, points) : null;
    return geo ? formesDansZone(dessin.formes, geo, { regle: regleZone, contours }) : [];
  }, [outil, trace.length, points, dessin.formes, regleZone, contours]);
  if (!trace.length && !curseur) return null;
  return <DessinZone forme={outil} points={trace.length ? points : []} regle={regleZone} ids={ids} curseur={curseur} vue={vue} chemin={chemin} />;
}

/** Les calques du cadre et du lasso, poses dans le conteneur de la toile, par-dessus elle. */
export const ZoneToile = memo(function ZoneToile({ magasin, chemin }: { magasin: MagasinZone; chemin: (f: Forme) => string }) {
  const { outil, vues } = useInterface(), zone = useZoneEnCours(magasin), vue = vues.vue;
  if (zone) return <DessinZone forme={zone.forme} points={zone.points} regle={zone.regle} ids={zone.ids} curseur={null} vue={vue} chemin={chemin} />;
  return estOutilZone(outil) ? <ZoneClavier outil={outil} vue={vue} chemin={chemin} /> : null;
});
