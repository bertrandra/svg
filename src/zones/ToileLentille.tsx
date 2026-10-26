// La toile dans une decoupe ou un masque (ADR-0012, annexe 8, paquet 8-D ; annexe 6 §3 et §8) : le dessin complet, estompe et inerte,
// tel qu'il s'ecrit (le groupe deja decoupe ou masque par son contenu du moment) ; par-dessus, le contenu qu'on modifie, seul a prendre
// le pointeur. Une decoupe n'a que de la geometrie : son contenu se trace en contour (`--contour-decoupe`). Un masque est peint : son
// contenu se dessine tel quel, cerne d'un filet (`--contour-masque`) qui le rend visible meme blanc sur blanc, et sa region se montre en
// tirets du meme jeton (hors d'elle, le masque cache tout).

import { memo } from 'react';
import { groupeDe, visibleEffectif, type DessinSvg } from '../engine/editionSvg.js';
import { cheminDe } from './Toile.js';
import { FormesToile } from './ToileNoeuds.js';
import type { Lentille } from './lentille.js';

interface Proprietes {
  /** Le dessin complet (celui de l'historique). */
  complet: DessinSvg;
  /** Le dessin de travail du contenu. */
  vue: DessinSvg;
  lentille: Lentille;
  contours: boolean;
  masquee: string | null;
  /** Le niveau ou l'on edite dans le contenu (un de ses groupes), ou sa racine. */
  niveau: string | null;
  brouillon: boolean;
}

/** Le filet de chaque feuille visible d'un masque, et sa region : ce qu'on modifie se voit, meme blanc sur le plan blanc. */
const CernesMasque = memo(function CernesMasque({ complet, vue, groupe }: { complet: DessinSvg; vue: DessinSvg; groupe: string }) {
  const region = groupeDe(complet, groupe)?.masque?.region;
  return (
    <g className="cernes-masque" pointerEvents="none" aria-hidden="true">
      {region ? <rect className="region-masque" x={region.x} y={region.y} width={region.l} height={region.h} /> : null}
      {vue.formes.filter(f => f.d.length && visibleEffectif(vue, f.id)).map(f => <path key={f.id} className="contour-masque" d={cheminDe(f)} />)}
    </g>
  );
});

export const ToileLentille = memo(function ToileLentille({ complet, vue, lentille, contours, masquee, niveau, brouillon }: Proprietes) {
  const decoupe = lentille.genre === 'decoupe';
  return (
    <>
      {/* Le reste du dessin, estompe et inerte : on voit le groupe tel que son contenu le decoupe ou le masque, a chaque geste. */}
      <g className="hors-contexte lentille-fond" pointerEvents="none">
        <FormesToile dessin={complet} contours={contours} masquee={null} contexte={null} brouillon={brouillon} />
      </g>
      <g className={decoupe ? 'lentille-decoupe' : 'lentille-masque'} data-lentille={lentille.genre}>
        {/* Une decoupe se trace toujours en contour (seule sa geometrie compte) ; un masque garde sa peinture, sauf en vue contours. */}
        <FormesToile dessin={vue} contours={decoupe || contours} masquee={masquee} contexte={niveau} brouillon={brouillon} />
        {decoupe ? null : <CernesMasque complet={complet} vue={vue} groupe={lentille.groupe} />}
      </g>
    </>
  );
});
