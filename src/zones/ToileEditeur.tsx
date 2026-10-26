// La toile de l'editeur : le plan de travail, les formes, la grille et la surcouche (selection,
// poignees, trace). Les gestes (pointeur) vivent dans Gestes.ts ; ici, seulement ce qui se dessine.

import { memo, useId, type RefObject } from 'react';
import { useDessin, useInterface } from './contexteEditeur.js';
import { useGestes } from './Gestes.js';
import { cheminDe, Grille, surcouche } from './Toile.js';
import { AlertesToile, GabaritTapis } from './Production.js';
import { useTactile } from './Vue.js';
import { insecables } from '../util/texte.js';
import { SaisieTexte } from './SaisieTexte.js';
import { FondPrise, SurvolToile } from './PriseToile.js';
import { useSaisie } from './contexteSaisie.js';
import { ApercuMachine } from './ApercuMachine.js';
import { ChoixFormeToile, GuideDisposition } from './DispositionToile.js';
import { ZoneToile } from './ZoneToile.js';
import { Regles } from './Regles.js';
import { CoucheReperes, PanneauReperes } from './Reperes.js';
import { PanneauRepetition } from './PanneauRepetition.js';
import { FormesToile } from './ToileNoeuds.js';
import { useDepotImage } from './InsererImage.js';
import { useVeilleFlous } from './SectionEffets.js';

export const ToileEditeur = memo(function ToileEditeur({ titre, toile, svgRef, idToile }: { titre: string; toile: RefObject<HTMLDivElement | null>; svgRef: RefObject<SVGSVGElement | null>; idToile: string }) {
  const mo = useDessin(), ui = useInterface(), sx = useSaisie();
  const gestes = useGestes(svgRef);
  // Deposer une image sur la toile l'insere, en modele riche seulement (ADR-0012, etape 8) ; a plat, aucun gestionnaire.
  const depot = useDepotImage();
  // Un flou inegal qu'une rotation rend uniforme se dit (ADR-0012, etapes 7 et 8).
  useVeilleFlous();
  const aide = useId();
  const tactile = useTactile();
  const { dessin } = mo, { vues, fond, grille, pas, contours } = ui;
  const z = vues.vue.zoom;
  const [vx, vy, vl, vh] = dessin.vb;
  return (
    <div className={'editeur-toile fond-' + fond} ref={toile} {...depot}>
      {/* Ce que la toile dit en prenant le focus, dont la sortie (WCAG 2.1.2) : Tab quitte la toile apres la derniere forme, ou Echap puis Tab. */}
      <span id={aide} className="sr-only">Flèches : déplacer. Tab : forme suivante. Alt et flèches : redimensionner. Ctrl et flèches : tourner. Maj et Page suivante : ajouter la forme suivante à la sélection. Espace : ajouter ou retirer la forme au curseur. Entrée : modifier le texte choisi, ou les points d’une forme. Sur une forme à dégradé, Tab atteint ses poignées. Échap puis Tab : quitter la toile.</span>
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
          <FormesToile dessin={dessin} contours={contours} masquee={sx.vide ? sx.saisie?.id ?? null : null} contexte={ui.contexte?.groupe ?? null} brouillon={gestes.brouillon} />
          <AlertesToile chemin={cheminDe} />
          <SurvolToile svgRef={svgRef} chemin={cheminDe} />
          <g className="surcouche">{surcouche(mo, ui, 1 / z, tactile, !!sx.saisie)}</g>
          {/* Le texte pose sur ou dans une forme (ADR-0031) : le guide de sa forme, la poignee de depart, le choix de la forme. */}
          <GuideDisposition svgRef={svgRef} chemin={cheminDe} />
          <ChoixFormeToile svgRef={svgRef} chemin={cheminDe} />
          {/* Les reperes du document (ADR-0038) : par-dessus tout, pour se prendre a la souris. */}
          <CoucheReperes toile={toile} svgRef={svgRef} />
        </g>
      </svg>
      {/* Le cadre ou le lasso en cours, et l'apercu de ce qu'il prendra (ADR-0035) : des calques par-dessus la toile. */}
      <ZoneToile magasin={gestes.zone} chemin={cheminDe} />
      <SaisieTexte svgRef={svgRef} />
      {/* Les regles, et les panneaux flottants des reperes et de la repetition (ADR-0038). */}
      <Regles toile={toile} />
      <PanneauReperes svgRef={svgRef} />
      <PanneauRepetition svgRef={svgRef} />
      {/* Un plan vide (ADR-0019) : le premier geste, sur la toile meme. Les clics passent a travers ; l'inspecteur le dit aux lecteurs d'ecran. */}
      {dessin.formes.length || ui.outil !== 'selection' ? null : (
        mo.h.passe.length
          ? <p className="toile-vide" aria-hidden="true" data-vide="vide">{insecables('Le plan est vide : Ctrl+Z fait revenir les formes, ou le rectangle (R) en trace une neuve.')}</p>
          : <p className="toile-vide" aria-hidden="true" data-vide="premiere-fois">{insecables('Le plan est vide : le rectangle (R) y trace une première forme.')}</p>
      )}
    </div>
  );
});
