// Les poignees de degrade sur la toile (ADR-0012, etape 4, paquet 4-B ; annexe 6 §4) : la forme choisie seule montre l'axe de son
// degrade, ses deux extremites (debut et fin d'un lineaire, centre et bord d'un radial) et un rond par arret, pose sur un rail
// parallele a l'axe (un arret a 0 % ne recouvre pas l'extremite qu'il touche). Chaque poignee est un `role="slider"` atteignable a la
// souris, au doigt (une cible de 40 px) et au clavier : Tab depuis la toile entre dans les poignees, puis passe a la forme suivante ;
// fleches ±1 %, Maj ±10 % (une extremite : le pas du plan, comme le reticule) ; Suppr retire l'arret ; Echap rend la toile.
//
// Ce ne sont qu'un raccourci : la liste des arrets de l'inspecteur (EditeurDegrade.tsx) fait tout. Le degrade lui-meme se voit deja
// par le rendu de la toile (renduDe), rien n'est ajoute pour lui. Le glisser vit dans Gestes.ts (attribut `data-poignee-degrade`,
// comme un coin), le calcul dans le coeur pur (axeDegrade, positionSurAxe, deplacerExtremite).
//
// Un remplissage en degrade a ses poignees ; sinon un contour en degrade. Les deux a la fois : celles du remplissage (le contour se
// regle a l'inspecteur).

import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import {
  axeDegrade, degradeDe, deplacerExtremite, modifierArret, pointSurAxe, retirerArret, ARRETS_MIN,
  type CoteDegrade, type Degrade, type ExtremiteDegrade, type Forme, type PointDegrade
} from '../engine/editionSvg.js';
import { directionDe, formeVoisine, pasReticule } from '../engine/navigation.js';
import { focusAuClavier } from './commun/focusClavier.js';
import {
  AIDE_POIGNEE_ARRET, AIDE_POIGNEE_EXTREMITE, nomArret, nomExtremite, phraseArret, phraseArretRetire, phraseExtremite, phrasePositionArret, RAISON_DEUX_ARRETS
} from './phrasesDegrades.js';
import type { ContexteToile } from './ClavierToile.js';
import type { ModeleDessin, EtatInterface } from './typesEditeur.js';
import { t } from '../util/i18n.js';

/** Le cote dont la forme montre les poignees : le remplissage s'il est en degrade, sinon le contour, sinon aucun. */
export function coteAPoignees(f: Forme | null): CoteDegrade | null {
  if (!f || !f.visible) return null;
  return degradeDe(f, 'remplissage') ? 'remplissage' : degradeDe(f, 'contour') ? 'contour' : null;
}

/** La forme et le cote des poignees affichees, ou null : outil de selection, une forme seule, deverrouillee, a degrade. */
export function poigneesActives(mo: ModeleDessin, ui: EtatInterface): { forme: Forme; cote: CoteDegrade } | null {
  const f = mo.formeSeule;
  if (ui.outil !== 'selection' || !f || f.verrouille) return null;
  const cote = coteAPoignees(f);
  return cote ? { forme: f, cote } : null;
}

/** La cible d'une poignee : le rang d'un arret, ou une extremite. */
export type CiblePoignee = number | ExtremiteDegrade;

/** La poignee touchee ou focalisee (l'element ou l'un de ses ancetres), ou null. */
export function poigneeDe(el: EventTarget | null): { cote: CoteDegrade; cible: CiblePoignee; element: Element } | null {
  const e = el instanceof Element ? el.closest('[data-poignee-degrade]') : null;
  if (!e) return null;
  const cote: CoteDegrade = e.getAttribute('data-cote') === 'contour' ? 'contour' : 'remplissage';
  const arret = e.getAttribute('data-arret'), extremite = e.getAttribute('data-extremite');
  const cible: CiblePoignee | null = arret !== null ? Number(arret) : extremite === 'debut' || extremite === 'fin' ? extremite : null;
  return cible === null || (typeof cible === 'number' && !Number.isInteger(cible)) ? null : { cote, cible, element: e };
}

/** Le decalage du rail des arrets, en pixels d'ecran, et le rayon des cibles (40 px au doigt, ADR-0006). */
const DECALAGE_RAIL = 18, CIBLE_SOURIS = 8, CIBLE_DOIGT = 20;

/** Les poignees du degrade de la forme choisie, dans la surcouche de la toile ; `unite` vaut un pixel d'ecran dans le plan. */
export function PoigneesDegrade({ unite, tactile }: { unite: number; tactile: boolean }) {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  const actives = poigneesActives(mo, ui);
  const g = actives ? degradeDe(actives.forme, actives.cote) : null;
  if (!actives || !g) return null;
  const { cote } = actives;
  const { de, a } = axeDegrade(g), vx = a[0] - de[0], vy = a[1] - de[1], longueur = Math.hypot(vx, vy);
  if (!(longueur > 0)) return null;
  // La normale a l'axe, vers le bas d'un axe de gauche a droite : le rail des arrets s'y decale.
  const nx = -vy / longueur, ny = vx / longueur, d = DECALAGE_RAIL * unite, cible = (tactile ? CIBLE_DOIGT : CIBLE_SOURIS) * unite;
  const surRail = (p: PointDegrade): PointDegrade => [p[0] + nx * d, p[1] + ny * d];
  const [r1, r2] = [surRail(de), surRail(a)];
  const n = g.arrets.length;
  return (
    <g className="poignees-degrade" data-cote={cote}>
      <line className="axe-degrade-fond" x1={de[0]} y1={de[1]} x2={a[0]} y2={a[1]} pointerEvents="none" />
      <line className="axe-degrade" x1={de[0]} y1={de[1]} x2={a[0]} y2={a[1]} pointerEvents="none" />
      <line className="rail-degrade" x1={r1[0]} y1={r1[1]} x2={r2[0]} y2={r2[1]} pointerEvents="none" />
      <Extremite g={g} cote={cote} e="debut" p={de} unite={unite} cible={cible} finir={ac.finir} />
      {g.arrets.map((x, i) => {
        const [cx, cy] = surRail(pointSurAxe(g, x.position));
        return (
          <g key={'arret-' + i} role="slider" tabIndex={0} className="poignee-degrade poignee-arret" data-poignee-degrade="" data-cote={cote} data-arret={i}
            aria-label={nomArret(i, n)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x.position * 1000) / 10} aria-valuetext={phraseArret(g, i)} onBlur={ac.finir}>
            <title>{AIDE_POIGNEE_ARRET}</title>
            <circle className="cible-poignee" cx={cx} cy={cy} r={cible} />
            <circle className="anneau-focus-fond" cx={cx} cy={cy} r={11 * unite} />
            <circle className="anneau-focus" cx={cx} cy={cy} r={11 * unite} />
            <circle className="halo-poignee" cx={cx} cy={cy} r={6 * unite} />
            {/* Le rond prend la couleur de l'arret : une couleur du dessin, pas de l'interface. */}
            <circle className="rond-arret" cx={cx} cy={cy} r={6 * unite} fill={x.couleur} />
          </g>
        );
      })}
      <Extremite g={g} cote={cote} e="fin" p={a} unite={unite} cible={cible} finir={ac.finir} />
    </g>
  );
}

/** Une extremite : un losange sur l'axe ; sa valeur dit ou elle est (un curseur ne sait pas dire deux dimensions autrement). */
function Extremite({ g, cote, e, p, unite, cible, finir }: { g: Degrade; cote: CoteDegrade; e: ExtremiteDegrade; p: PointDegrade; unite: number; cible: number; finir: () => void }) {
  const [x, y] = p, c = 6 * unite;
  const losange = `M${x} ${y - c}L${x + c} ${y}L${x} ${y + c}L${x - c} ${y}Z`;
  return (
    <g role="slider" tabIndex={0} className="poignee-degrade poignee-extremite" data-poignee-degrade="" data-cote={cote} data-extremite={e}
      aria-label={nomExtremite(g.genre, e)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={e === 'debut' ? 0 : 100} aria-valuetext={phraseExtremite(g.genre, e, p).slice(0, -1)} onBlur={finir}>
      <title>{AIDE_POIGNEE_EXTREMITE}</title>
      <circle className="cible-poignee" cx={x} cy={y} r={cible} />
      <circle className="anneau-focus-fond" cx={x} cy={y} r={11 * unite} />
      <circle className="anneau-focus" cx={x} cy={y} r={11 * unite} />
      <path className="losange-extremite" d={losange} />
    </g>
  );
}

// ---------------------------------------------------------------- le clavier des poignees (appele par ClavierToile.ts)

/** Les poignees affichees, dans l'ordre de tabulation. */
const poigneesDe = (svg: Element | null | undefined): Element[] => (svg ? Array.from(svg.querySelectorAll('[data-poignee-degrade]')) : []);
const toileDe = (c: ContexteToile): SVGSVGElement | null => c.toile.current?.querySelector<SVGSVGElement>('.editeur-svg-toile') ?? null;
const focaliser = (el: Element | null | undefined) => focusAuClavier(el as HTMLElement | null | undefined);

/** Une poignee retrouvee apres le rendu (son arret a pu changer de rang) : au prochain cadre, React a deja peint. */
function focaliserApres(c: ContexteToile, selecteur: string): void {
  requestAnimationFrame(() => focaliser(toileDe(c)?.querySelector(selecteur) ?? toileDe(c)));
}

/**
 * Tab depuis la toile sur une forme a poignees : le focus entre dans la premiere poignee (vrai). Faux sinon (Tab garde son sens : la
 * forme suivante, ou quitter la toile).
 */
export function entrerDansPoignees(c: ContexteToile): boolean {
  if (!poigneesActives(c.m, c.u)) return false;
  const premiere = poigneesDe(toileDe(c))[0];
  if (!premiere) return false;
  focaliser(premiere);
  return true;
}

/** Une touche sur une poignee. Vrai quand elle est traitee ; faux pour la laisser au reste du clavier (et au navigateur). */
export function touchePoignee(e: KeyboardEvent, c: ContexteToile, p: NonNullable<ReturnType<typeof poigneeDe>>): boolean {
  const { m, u, ac } = c, actives = poigneesActives(m, u), g = actives ? degradeDe(actives.forme, p.cote) : null;
  if (e.ctrlKey || e.metaKey || e.altKey || !actives || !g) return false;
  const id = actives.forme.id;
  if (e.key === 'Tab') return tabulerPoignees(c, p.element, e.shiftKey);
  if (e.key === 'Escape') { focaliser(toileDe(c)); return true; }
  const direction = directionDe(e.key);
  if (typeof p.cible === 'number') {
    const i = p.cible, arret = g.arrets[i];
    if (!arret) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (g.arrets.length <= ARRETS_MIN) { ac.annoncer(RAISON_DEUX_ARRETS); return true; }
      ac.appliquer(d => retirerArret(d, [id], p.cote, i));
      ac.annoncer(phraseArretRetire(g.arrets.length - 1));
      focaliserApres(c, '[data-poignee-degrade][data-arret="' + Math.max(0, i - 1) + '"]');
      return true;
    }
    const avant = g.arrets[i - 1]?.position ?? 0, apres = g.arrets[i + 1]?.position ?? 1, pas = e.shiftKey ? 0.1 : 0.01;
    const position = e.key === 'Home' ? avant : e.key === 'End' ? apres
      : direction === 'droite' || direction === 'haut' ? arret.position + pas : direction === 'gauche' || direction === 'bas' ? arret.position - pas : null;
    if (position === null) return false;
    const voulue = Math.min(apres, Math.max(avant, Math.round(position * 1000) / 1000));
    ac.appliquer(d => modifierArret(d, [id], p.cote, i, { position: voulue }), 'poignee-degrade:' + p.cote + ':' + i + ':' + id);
    ac.annoncer(phrasePositionArret(i, voulue) + (voulue === arret.position ? t(' Butée : l’arrêt ne dépasse pas ses voisins.') : ''));

    return true;
  }
  if (!direction) return false;
  const { de, a } = axeDegrade(g), depart = p.cible === 'debut' ? de : a;
  const pas = pasReticule(m.dessin.vb, u.grille ? u.pas : null, e.shiftKey);
  const q: PointDegrade = [depart[0] + (direction === 'droite' ? pas : direction === 'gauche' ? -pas : 0), depart[1] + (direction === 'bas' ? pas : direction === 'haut' ? -pas : 0)];
  const cible = p.cible;
  ac.appliquer(d => deplacerExtremite(d, [id], p.cote, cible, q[0], q[1]), 'poignee-degrade:' + p.cote + ':' + cible + ':' + id);
  ac.annoncer(phraseExtremite(g.genre, cible, q));
  return true;
}

/** Tab dans les poignees : la suivante ; apres la derniere, la forme suivante (ou le navigateur, qui quitte la toile) ; Maj+Tab : la precedente, puis la toile. */
function tabulerPoignees(c: ContexteToile, courante: Element, arriere: boolean): boolean {
  const toutes = poigneesDe(toileDe(c)), k = toutes.indexOf(courante);
  if (k < 0) return false;
  if (arriere) { focaliser(k === 0 ? toileDe(c) : toutes[k - 1]); return true; }
  const suivante = toutes[k + 1];
  if (suivante) { focaliser(suivante); return true; }
  const id = formeVoisine(c.m.dessin, c.m.sel, 1, false);
  if (id === null) return false;
  focaliser(toileDe(c));
  c.ac.choisir([id]);
  c.ac.poserPoint(null);
  return true;
}

