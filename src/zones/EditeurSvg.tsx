// L'editeur SVG plein ecran, repris du canvas de crea (ADR-0001) : retoucher un dessin vectoriel
// comme dans un logiciel de dessin. Selection, deplacement, mise a l'echelle, points et poignees,
// couleurs d'un nuancier, empilement, alignement, nettoyage du trace, et un historique qui annule
// chaque geste. Tout le calcul est dans `engine/editionSvg.ts` ; ici, l'affichage et les gestes.
//
// Le composant ne connait aucun magasin : il recoit le SVG, un nuancier facultatif, et rend le SVG
// retouche a `enregistrer`. C'est ce qui le rend reutilisable hors de cette page.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ME, type PointerEvent as PE, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  ajusterPlan, aligner, ancre, basculerSegment, boiteDe, boiteForme, couleursDuDessin, deplacer, deplacerAncre, deplacerPoignee,
  depart, diviserSegment, dupliquer, ecrireChemin, ecrireDessin, idsDeCouleur, lireDessin, modifier, ordonner, redimensionner,
  regrouper, remplacerCouleur, retirerPetites, retourner, seCroisent, statistiques, supprimer, supprimerAncre, tourner,
  type Alignement, type Boite, type DessinSvg, type Forme, type Ordre, type Reglage
} from '../engine/editionSvg.js';
import { annuler, avancer, clore, historique, retablir, type Historique } from '../util/historique.js';
import { nettoyerSvg } from '../util/svg.js';
import { proposer, texteOctets } from '../io/fichiers.js';

/** Une couleur du nuancier propose dans l'inspecteur : un nom et un code #rrggbb en minuscules. */
export interface Teinte { nom: string; hex: string }

export interface ProprietesEditeur {
  /** Le SVG a retoucher, tel quel. */
  svg: string;
  /** Le titre de la fenetre. */
  titre: string;
  /** Le nom du fichier propose au telechargement, sans extension. */
  nom: string;
  /** Les couleurs proposees dans l'inspecteur et pour le remplacement d'une couleur partout. */
  nuancier?: readonly Teinte[];
  fermer: () => void;
  /** Recoit le SVG retouche, deja nettoye par `nettoyerSvg`. */
  enregistrer: (svg: string) => void;
}

type Outil = 'selection' | 'points' | 'main';
type Coin = 'nw' | 'ne' | 'sw' | 'se';
interface Vue { zoom: number; x: number; y: number }
type Geste =
  | { type: 'pan'; x0: number; y0: number; vue: Vue }
  | { type: 'deplacer'; x0: number; y0: number; base: DessinSvg; ids: string[]; cle: string }
  | { type: 'echelle'; coin: Coin; b: Boite; base: DessinSvg; ids: string[]; cle: string }
  | { type: 'cadre'; x0: number; y0: number; ajout: boolean }
  | { type: 'ancre'; i: number; base: DessinSvg; id: string; cle: string }
  | { type: 'poignee'; i: number; k: 0 | 1; base: DessinSvg; id: string; cle: string };

const SEUILS: ReadonlyArray<readonly [number, string]> = [[0.0001, 'Poussières (0,01 %)'], [0.0005, 'Petits détails (0,05 %)'], [0.002, 'Détails moyens (0,2 %)']];
const ALIGNEMENTS: ReadonlyArray<readonly [Alignement, string, string]> = [
  ['gauche', '⇤', 'Aligner à gauche'], ['centreH', '↔', 'Centrer horizontalement'], ['droite', '⇥', 'Aligner à droite'],
  ['haut', '⤒', 'Aligner en haut'], ['centreV', '↕', 'Centrer verticalement'], ['bas', '⤓', 'Aligner en bas']
];
const ORDRES: ReadonlyArray<readonly [Ordre, string]> = [['premier', 'Premier plan'], ['avant', 'Avancer'], ['arriere', 'Reculer'], ['dernier', 'Arrière-plan']];

const cacheChemins = new WeakMap<Forme, string>();
function cheminDe(f: Forme): string {
  let d = cacheChemins.get(f);
  if (d === undefined) { d = ecrireChemin(f.d, 3); cacheChemins.set(f, d); }
  return d;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;
const estHex = (v: string | null): v is string => !!v && /^#[0-9a-f]{6}$/.test(v);
/** Une image enveloppee dans un SVG ne s'edite pas : il faut d'abord la vectoriser. */
export const editable = (svg: string): boolean => !/<image\b/i.test(svg);

const SANS_NUANCIER: readonly Teinte[] = [];

/** Un nuancier propre : codes en minuscules, sans doublon, et un nom a chaque teinte. */
export function nuancierPropre(teintes: readonly Teinte[]): Teinte[] {
  const vus = new Set<string>(), r: Teinte[] = [];
  for (const t of teintes) {
    const hex = t.hex.trim().toLowerCase();
    if (estHex(hex) && !vus.has(hex)) { vus.add(hex); r.push({ nom: t.nom.trim() || hex, hex }); }
  }
  return r;
}

/**
 * Le bouton qui ouvre l'editeur sur un SVG, et l'editeur quand il est ouvert. `enregistrer` recoit
 * le SVG retouche, deja nettoye. Une image enveloppee ne s'edite pas : il faut la vectoriser.
 */
export function BoutonEditerSvg({ svg, titre, nom, nuancier, enregistrer }: Omit<ProprietesEditeur, 'fermer'>) {
  const [ouvert, ouvrir] = useState(false);
  const ok = editable(svg);
  return (
    <>
      <button type="button" className="discret" disabled={!ok} title={ok ? 'Ouvrir l’éditeur SVG plein écran' : 'Une image enveloppée ne s’édite pas : vectorisez-la d’abord.'}
        onClick={() => ouvrir(true)}>Éditer le SVG en plein écran</button>
      {ouvert ? <EditeurSvg svg={svg} titre={titre} nom={nom} nuancier={nuancier ?? SANS_NUANCIER} fermer={() => ouvrir(false)} enregistrer={s => { enregistrer(s); ouvrir(false); }} /> : null}
    </>
  );
}

export function EditeurSvg({ svg, titre, nom, nuancier: brut = SANS_NUANCIER, fermer, enregistrer }: ProprietesEditeur) {
  const lu = useMemo(() => lireDessin(svg), [svg]);
  const nuancier = useMemo(() => nuancierPropre(brut), [brut]);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);
  return createPortal(
    <div className="editeur-svg" role="dialog" aria-modal="true" aria-label={'Éditer : ' + titre}>
      {'erreur' in lu ? (
        <div className="editeur-erreur">
          <p>{lu.erreur}</p>
          <button type="button" onClick={fermer}>Fermer</button>
        </div>
      ) : <Atelier initial={lu.dessin} titre={titre} nom={nom} nuancier={nuancier} fermer={fermer} enregistrer={enregistrer} />}
    </div>,
    document.body
  );
}

const Calque = memo(function Calque({ f, contours }: { f: Forme; contours: boolean }) {
  if (!f.visible) return null;
  const pe = f.verrouille ? 'none' : contours ? 'all' : f.remplissage ? 'visiblePainted' : 'stroke';
  return contours
    ? <path data-id={f.id} className="trace-contour" d={cheminDe(f)} fill="none" fillRule={f.regle} pointerEvents={pe} />
    : <path data-id={f.id} d={cheminDe(f)} fill={f.remplissage ?? 'none'} fillRule={f.regle} stroke={f.contour ?? undefined}
      strokeWidth={f.contour ? f.epaisseur : undefined} strokeLinejoin="round" opacity={f.opacite < 1 ? f.opacite : undefined} pointerEvents={pe} />;
});

/** Ce que les panneaux partagent : le dessin, la selection, et les gestes d'edition. */
interface Edition {
  h: Historique<DessinSvg>;
  dessin: DessinSvg;
  sel: string[];
  boite: Boite | null;
  formeSeule: Forme | null;
  outil: Outil;
  point: number | null;
  nuancier: readonly Teinte[];
  choisir: (ids: string[]) => void;
  poserPoint: (i: number | null) => void;
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void;
  faire: (f: (d: DessinSvg) => DessinSvg, texte?: string) => void;
  finir: () => void;
  dire: (t: string) => void;
  nouvelleCle: () => string;
  supprimerSelection: () => void;
  dupliquerSelection: () => void;
}

function Atelier({ initial, titre, nom, nuancier, fermer, enregistrer }: { initial: DessinSvg; titre: string; nom: string; nuancier: readonly Teinte[]; fermer: () => void; enregistrer: (svg: string) => void }) {
  const [h, poserH] = useState<Historique<DessinSvg>>(() => historique(initial));
  const [selection, choisir] = useState<string[]>([]);
  const [outil, poserOutil] = useState<Outil>('selection');
  const [point, poserPoint] = useState<number | null>(null);
  const [contours, poserContours] = useState(false);
  const [fond, poserFond] = useState<'damier' | 'blanc' | 'sombre'>('damier');
  const [message, dire] = useState('');
  const [quitter, poserQuitter] = useState(false);
  const toile = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement>(null), compteur = useRef(0);
  const dessin = h.present;
  const modifie = h.passe.length > 0;
  const vues = useVue(toile, svgRef, dessin.vb);

  const presentes = useMemo(() => new Set(dessin.formes.map(f => f.id)), [dessin]);
  const sel = useMemo(() => selection.filter(id => presentes.has(id)), [selection, presentes]);
  const formeSeule = sel.length === 1 ? dessin.formes.find(f => f.id === sel[0]) ?? null : null;
  const boite = useMemo(() => boiteDe(dessin, sel), [dessin, sel]);

  const appliquer = useCallback((f: (d: DessinSvg) => DessinSvg, cle: string | null = null) => { poserH(x => avancer(x, f(x.present), cle)); }, []);
  const finir = useCallback(() => poserH(x => clore(x)), []);
  const defaire = useCallback(() => { poserH(x => annuler(clore(x))); poserPoint(null); dire(''); }, []);
  const refaire = useCallback(() => { poserH(x => retablir(x)); poserPoint(null); dire(''); }, []);

  const supprimerSelection = () => {
    if (outil === 'points' && formeSeule && point !== null) {
      const r = supprimerAncre(dessin, formeSeule.id, point);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r);
      poserPoint(null);
      return;
    }
    if (!sel.length) return;
    appliquer(d => supprimer(d, sel));
    dire(sel.length + ' forme' + (sel.length > 1 ? 's' : '') + ' supprimée' + (sel.length > 1 ? 's' : '') + '.');
    choisir([]);
  };
  const dupliquerSelection = () => {
    if (!sel.length) return;
    const pas = dessin.vb[2] * 0.02, r = dupliquer(dessin, sel, pas, pas);
    appliquer(() => r.dessin);
    choisir(r.ids);
  };
  const demanderFermeture = () => { if (modifie) poserQuitter(true); else fermer(); };

  const ed: Edition = {
    h, dessin, sel, boite, formeSeule, outil, point, nuancier, choisir, poserPoint, appliquer, finir, dire, supprimerSelection, dupliquerSelection,
    faire: (f, texte = '') => { appliquer(f); dire(texte); },
    nouvelleCle: () => 'geste-' + ++compteur.current
  };
  useClavier(ed, { defaire, refaire, poserH, poserOutil, poserContours, demanderFermeture, vues });
  const gestes = useGestes(ed, vues, svgRef, poserOutil);

  const enregistrerTout = () => {
    const propre = nettoyerSvg(ecrireDessin(dessin, 3));
    if (!propre) { dire('Le dessin n’a plus de forme visible : rien à enregistrer.'); return; }
    enregistrer(propre.svg);
  };
  const z = vues.vue.zoom;
  const [vx, vy, vl, vh] = dessin.vb;

  return (
    <div className={'editeur-cadre outil-' + outil}>
      <header className="editeur-barre">
        <strong className="editeur-titre">{titre}</strong>
        <div className="mini-onglets" role="group" aria-label="Outil">
          <button type="button" aria-pressed={outil === 'selection'} title="Sélection (V)" onClick={() => poserOutil('selection')}>Sélection</button>
          <button type="button" aria-pressed={outil === 'points'} title="Points et poignées (A)" onClick={() => { poserOutil('points'); poserPoint(null); }}>Points</button>
          <button type="button" aria-pressed={outil === 'main'} title="Main : déplacer la vue (H, ou espace)" onClick={() => poserOutil('main')}>Main</button>
        </div>
        <div className="groupe">
          <button type="button" onClick={defaire} disabled={!h.passe.length} title="Annuler (Ctrl+Z)">↶ Annuler</button>
          <button type="button" onClick={refaire} disabled={!h.futur.length} title="Rétablir (Ctrl+Maj+Z)">↷ Rétablir</button>
        </div>
        <div className="groupe">
          <button type="button" onClick={() => vues.zoomer(0.8)} title="Dézoomer (−)" aria-label="Dézoomer">−</button>
          <span className="zoom" aria-live="polite">{Math.round(z * 100)} %</span>
          <button type="button" onClick={() => vues.zoomer(1.25)} title="Zoomer (+)" aria-label="Zoomer">+</button>
          <button type="button" onClick={vues.ajuster} title="Ajuster à l’écran (0)">Ajuster</button>
          <button type="button" onClick={vues.centrer100} title="Taille réelle (1)">100 %</button>
        </div>
        <div className="groupe">
          <button type="button" aria-pressed={contours} onClick={() => poserContours(c => !c)} title="Contours (O)">Contours</button>
          <select aria-label="Fond" value={fond} onChange={e => poserFond(e.target.value as typeof fond)}>
            <option value="damier">Fond damier</option>
            <option value="blanc">Fond blanc</option>
            <option value="sombre">Fond sombre</option>
          </select>
        </div>
        <span className="espace" />
        <div className="groupe">
          <button type="button" className="discret" onClick={() => { void proposer(nom + '.svg', texteOctets(ecrireDessin(dessin, 3))).then(dire); }}>Télécharger</button>
          <button type="button" className="discret" onClick={demanderFermeture}>Fermer</button>
          <button type="button" className="primaire" onClick={enregistrerTout} disabled={!modifie}>Enregistrer</button>
        </div>
      </header>

      {quitter ? (
        <div className="editeur-confirmer" role="alertdialog" aria-label="Abandonner les modifications">
          <span>Abandonner les {h.passe.length} modification{h.passe.length > 1 ? 's' : ''} non enregistrée{h.passe.length > 1 ? 's' : ''} ?</span>
          <button type="button" onClick={fermer}>Abandonner</button>
          <button type="button" className="primaire" onClick={() => poserQuitter(false)}>Continuer l’édition</button>
        </div>
      ) : null}

      <Calques ed={ed} />

      <div className={'editeur-toile fond-' + fond} ref={toile}>
        <svg ref={svgRef} className="editeur-svg-toile" onPointerDown={gestes.appuyer} onPointerMove={gestes.bouger} onPointerUp={gestes.lacher} onPointerCancel={gestes.lacher} onDoubleClick={gestes.doubleClic}>
          <g transform={`translate(${vues.vue.x} ${vues.vue.y}) scale(${z})`}>
            <defs>
              <pattern id="damier-editeur" patternUnits="userSpaceOnUse" width={16 / z} height={16 / z}>
                <rect className="damier-a" width={16 / z} height={16 / z} />
                <rect className="damier-b" width={8 / z} height={8 / z} />
                <rect className="damier-b" x={8 / z} y={8 / z} width={8 / z} height={8 / z} />
              </pattern>
            </defs>
            <rect className="plan-travail" x={vx} y={vy} width={vl} height={vh} fill={fond === 'damier' ? 'url(#damier-editeur)' : undefined} pointerEvents="none" />
            {dessin.formes.map(f => <Calque key={f.id} f={f} contours={contours} />)}
            <g className="surcouche">{surcouche(ed, 1 / z, gestes.cadre)}</g>
          </g>
        </svg>
      </div>

      <aside className="editeur-inspecteur" aria-label="Inspecteur">
        {sel.length ? <Inspecteur ed={ed} /> : <PanneauDessin ed={ed} />}
      </aside>

      <footer className="editeur-etat" role="status">
        {message || (sel.length ? sel.length + ' sélectionnée' + (sel.length > 1 ? 's' : '') + (outil === 'selection' ? ' · glissez pour déplacer, les coins pour redimensionner (Maj : proportions)' : '') : 'Cliquez une forme, ou tracez un cadre pour en choisir plusieurs.')}
        <span className="espace" />
        {h.passe.length} modification{h.passe.length > 1 ? 's' : ''}
      </footer>
    </div>
  );
}

interface Vues { vue: Vue; poserVue: (v: Vue | ((v: Vue) => Vue)) => void; ajuster: () => void; zoomer: (f: number, cx?: number, cy?: number) => void; centrer100: () => void }

/** La vue sur le plan de travail : zoom, defilement, ajustement a l'ecran, molette. */
function useVue(toile: RefObject<HTMLDivElement | null>, svgRef: RefObject<SVGSVGElement | null>, vb: DessinSvg['vb']): Vues {
  const [vue, poserVue] = useState<Vue>({ zoom: 1, x: 0, y: 0 });
  const ajuster = useCallback(() => {
    const el = toile.current;
    if (!el) return;
    const [x, y, l, h] = vb, W = el.clientWidth, H = el.clientHeight;
    const zoom = Math.max(0.01, Math.min(W / l, H / h) * 0.88);
    poserVue({ zoom, x: (W - l * zoom) / 2 - x * zoom, y: (H - h * zoom) / 2 - y * zoom });
  }, [toile, vb]);
  const premier = useRef(true);
  useLayoutEffect(() => { if (premier.current) { premier.current = false; ajuster(); } }, [ajuster]);
  const zoomer = useCallback((f: number, cx?: number, cy?: number) => {
    poserVue(v => {
      const el = toile.current, px = cx ?? (el ? el.clientWidth / 2 : 0), py = cy ?? (el ? el.clientHeight / 2 : 0);
      const zoom = Math.max(0.02, Math.min(64, v.zoom * f)), k = zoom / v.zoom;
      return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, [toile]);
  const centrer100 = useCallback(() => {
    const el = toile.current;
    if (!el) return;
    const [x, y, l, h] = vb;
    poserVue({ zoom: 1, x: (el.clientWidth - l) / 2 - x, y: (el.clientHeight - h) / 2 - y });
  }, [toile, vb]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const roue = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) poserVue(v => ({ ...v, x: v.x - e.deltaY }));
      else zoomer(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', roue, { passive: false });
    return () => el.removeEventListener('wheel', roue);
  }, [svgRef, zoomer]);
  return { vue, poserVue, ajuster, zoomer, centrer100 };
}

interface Commandes {
  defaire: () => void; refaire: () => void; poserH: (f: (h: Historique<DessinSvg>) => Historique<DessinSvg>) => void;
  poserOutil: (o: Outil) => void; poserContours: (f: (c: boolean) => boolean) => void; demanderFermeture: () => void; vues: Vues;
}

/** Les raccourcis, ecoutes sur la fenetre tant que l'editeur est ouvert ; jamais dans un champ. */
function useClavier(ed: Edition, c: Commandes) {
  const courant = useRef({ ed, c });
  courant.current = { ed, c };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const { ed: x, c: k } = courant.current;
      const cible = e.target as HTMLElement | null;
      const mod = e.ctrlKey || e.metaKey, t = e.key.toLowerCase();
      if (mod && t === 'z') { e.preventDefault(); if (e.shiftKey) k.refaire(); else k.defaire(); return; }
      if (mod && t === 'y') { e.preventDefault(); k.refaire(); return; }
      if (cible && /^(INPUT|SELECT|TEXTAREA)$/.test(cible.tagName)) { if (e.key === 'Escape') cible.blur(); return; }
      if (mod && t === 'a') { e.preventDefault(); x.choisir(x.dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id)); return; }
      if (mod && t === 'd') { e.preventDefault(); x.dupliquerSelection(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); x.supprimerSelection(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (x.point !== null) x.poserPoint(null); else if (x.sel.length) x.choisir([]); else k.demanderFermeture();
        return;
      }
      if (e.key.startsWith('Arrow')) { e.preventDefault(); pousser(x, e.key, e.shiftKey); return; }
      if (mod) return;
      if (t === 'v') k.poserOutil('selection');
      else if (t === 'a') k.poserOutil('points');
      else if (t === 'h') k.poserOutil('main');
      else if (t === 'o') k.poserContours(v => !v);
      else if (t === '+' || t === '=') k.vues.zoomer(1.25);
      else if (t === '-') k.vues.zoomer(0.8);
      else if (t === '0') k.vues.ajuster();
      else if (t === '1') k.vues.centrer100();
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);
}

/** Les fleches : la selection, ou le point choisi, d'un millieme du plan (dix avec Maj). */
function pousser(ed: Edition, touche: string, fort: boolean) {
  const d = ed.dessin, pas = ((fort ? 10 : 1) * Math.max(d.vb[2], d.vb[3])) / 1000;
  const dx = touche === 'ArrowLeft' ? -pas : touche === 'ArrowRight' ? pas : 0, dy = touche === 'ArrowUp' ? -pas : touche === 'ArrowDown' ? pas : 0;
  const fs = ed.formeSeule, p = ed.point;
  if (ed.outil === 'points' && fs && p !== null) {
    const c = fs.d[p], a = c ? ancre(c) : null;
    if (a) ed.appliquer(x => deplacerAncre(x, fs.id, p, a[0] + dx, a[1] + dy));
  } else if (ed.sel.length) {
    const ids = ed.sel;
    ed.appliquer(x => deplacer(x, ids, dx, dy));
  }
}

/** Les gestes a la souris, au stylet ou au doigt sur la toile. */
function useGestes(ed: Edition, vues: Vues, svgRef: RefObject<SVGSVGElement | null>, poserOutil: (o: Outil) => void) {
  const geste = useRef<Geste | null>(null), espace = useRef(false);
  const [cadre, poserCadre] = useState<Boite | null>(null);
  useEffect(() => {
    const bas = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === ' ' && !(t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName))) { espace.current = true; e.preventDefault(); }
    };
    const haut = (e: KeyboardEvent) => { if (e.key === ' ') espace.current = false; };
    window.addEventListener('keydown', bas);
    window.addEventListener('keyup', haut);
    return () => { window.removeEventListener('keydown', bas); window.removeEventListener('keyup', haut); };
  }, []);
  const { vue } = vues;
  const versDoc = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? [(e.clientX - r.left - vue.x) / vue.zoom, (e.clientY - r.top - vue.y) / vue.zoom] : [0, 0];
  };

  const appuyer = (e: PE<SVGSVGElement>) => {
    const t = e.target as Element;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = versDoc(e);
    if (e.button === 1 || ed.outil === 'main' || espace.current) { geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, vue }; return; }
    const coin = t.getAttribute('data-coin') as Coin | null, iAncre = t.getAttribute('data-ancre'), poignee = t.getAttribute('data-poignee');
    if (coin && ed.boite) { geste.current = { type: 'echelle', coin, b: ed.boite, base: ed.dessin, ids: ed.sel, cle: ed.nouvelleCle() }; return; }
    if (ed.formeSeule && iAncre !== null) {
      ed.poserPoint(Number(iAncre));
      geste.current = { type: 'ancre', i: Number(iAncre), base: ed.dessin, id: ed.formeSeule.id, cle: ed.nouvelleCle() };
      return;
    }
    if (ed.formeSeule && poignee) {
      const [i, k] = poignee.split(':').map(Number);
      geste.current = { type: 'poignee', i: i ?? 0, k: k === 1 ? 1 : 0, base: ed.dessin, id: ed.formeSeule.id, cle: ed.nouvelleCle() };
      return;
    }
    const id = t.getAttribute('data-id');
    if (id) {
      const sel = ed.sel;
      const ids = e.shiftKey ? (sel.includes(id) ? sel.filter(s => s !== id) : [...sel, id]) : sel.includes(id) ? sel : [id];
      ed.choisir(ids);
      if (ed.outil === 'points') { ed.poserPoint(null); return; }
      if (ids.includes(id)) geste.current = { type: 'deplacer', x0: x, y0: y, base: ed.dessin, ids, cle: ed.nouvelleCle() };
      return;
    }
    if (ed.outil === 'points' && ed.point !== null) { ed.poserPoint(null); return; }
    geste.current = { type: 'cadre', x0: x, y0: y, ajout: e.shiftKey };
    poserCadre({ x, y, l: 0, h: 0 });
  };

  const bouger = (e: PE<SVGSVGElement>) => {
    const g = geste.current;
    if (!g) return;
    if (g.type === 'pan') { vues.poserVue({ ...g.vue, x: g.vue.x + e.clientX - g.x0, y: g.vue.y + e.clientY - g.y0 }); return; }
    const [x, y] = versDoc(e);
    if (g.type === 'deplacer') {
      let dx = x - g.x0, dy = y - g.y0;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      ed.appliquer(() => deplacer(g.base, g.ids, dx, dy), g.cle);
    } else if (g.type === 'echelle') ed.appliquer(() => etirer(g, x, y, e.shiftKey, ed.dessin.vb), g.cle);
    else if (g.type === 'cadre') poserCadre({ x: Math.min(g.x0, x), y: Math.min(g.y0, y), l: Math.abs(x - g.x0), h: Math.abs(y - g.y0) });
    else if (g.type === 'ancre') ed.appliquer(() => deplacerAncre(g.base, g.id, g.i, x, y), g.cle);
    else ed.appliquer(() => deplacerPoignee(g.base, g.id, g.i, g.k, x, y), g.cle);
  };

  const lacher = (e: PE<SVGSVGElement>) => {
    const g = geste.current;
    geste.current = null;
    if (!g) return;
    if (g.type !== 'cadre') { if (g.type !== 'pan') ed.finir(); return; }
    const [x, y] = versDoc(e);
    const c = { x: Math.min(g.x0, x), y: Math.min(g.y0, y), l: Math.abs(x - g.x0), h: Math.abs(y - g.y0) };
    poserCadre(null);
    if (c.l * vue.zoom < 3 && c.h * vue.zoom < 3) { if (!g.ajout) ed.choisir([]); return; }
    const pris = ed.dessin.formes.filter(f => { const b = boiteForme(f); return f.visible && !f.verrouille && !!b && seCroisent(b, c); }).map(f => f.id);
    ed.choisir(g.ajout ? [...new Set([...ed.sel, ...pris])] : pris);
  };

  const doubleClic = (e: ME<SVGSVGElement>) => {
    // La capture du pointeur fait de la toile la cible du double-clic : on lit la forme sous le curseur.
    const id = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute('data-id');
    if (id && ed.outil === 'selection') { ed.choisir([id]); poserOutil('points'); ed.poserPoint(null); }
  };
  return { appuyer, bouger, lacher, doubleClic, cadre };
}

/** Tirer un coin : le coin oppose reste fixe ; passer de l'autre cote d'un bord retourne la selection. */
function etirer(g: Extract<Geste, { type: 'echelle' }>, x: number, y: number, proportions: boolean, vb: DessinSvg['vb']): DessinSvg {
  const b = g.b, fixeX = g.coin.endsWith('w') ? b.x + b.l : b.x, fixeY = g.coin.startsWith('n') ? b.y + b.h : b.y;
  let l = Math.abs(x - fixeX), h = Math.abs(y - fixeY);
  if (proportions && b.l > 0 && b.h > 0) { const k = Math.max(l / b.l, h / b.h); l = b.l * k; h = b.h * k; }
  const min = Math.max(vb[2], vb[3]) / 1000;
  l = Math.max(min, l); h = Math.max(min, h);
  let d = redimensionner(g.base, g.ids, { x: x < fixeX ? fixeX - l : fixeX, y: y < fixeY ? fixeY - h : fixeY, l, h });
  if ((x < fixeX) !== g.coin.endsWith('w')) d = retourner(d, g.ids, 'h');
  if ((y < fixeY) !== g.coin.startsWith('n')) d = retourner(d, g.ids, 'v');
  return d;
}

/** Ce qui se dessine par-dessus : selection, boite et coins, points et poignees, cadre. */
function surcouche(ed: Edition, px: number, cadre: Boite | null): ReactNode[] {
  const r: ReactNode[] = [];
  for (const id of ed.sel) {
    const f = ed.dessin.formes.find(x => x.id === id);
    if (f) r.push(<path key={'s' + id} className="trace-choisi" d={cheminDe(f)} pointerEvents="none" />);
  }
  const b = ed.boite;
  if (b && ed.outil === 'selection') {
    r.push(<rect key="boite" className="boite-choisie" x={b.x} y={b.y} width={b.l} height={b.h} pointerEvents="none" />);
    const coins: [Coin, number, number][] = [['nw', b.x, b.y], ['ne', b.x + b.l, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.l, b.y + b.h]];
    for (const [c, cx, cy] of coins) r.push(<rect key={c} data-coin={c} className={'coin coin-' + c} x={cx - 4 * px} y={cy - 4 * px} width={8 * px} height={8 * px} />);
  }
  const fs = ed.formeSeule, p = ed.point;
  if (ed.outil === 'points' && fs) {
    const d = fs.d;
    const c = p !== null ? d[p] : undefined, a = c ? ancre(c) : null;
    if (c && a && p !== null) {
      const lien = (cle: string, x1: number, y1: number, x2: number, y2: number, i: number, k: 0 | 1) => {
        r.push(<line key={'l' + cle} className="lien-poignee" x1={x1} y1={y1} x2={x2} y2={y2} pointerEvents="none" />);
        r.push(<circle key={'p' + cle} data-poignee={i + ':' + k} className="poignee" cx={x2} cy={y2} r={4 * px} />);
      };
      if (c.c === 'C') lien('a', a[0], a[1], c.p[2] ?? 0, c.p[3] ?? 0, p, 1);
      if (c.c === 'Q') { const [x0, y0] = depart(d, p); lien('q', x0, y0, c.p[0] ?? 0, c.p[1] ?? 0, p, 0); }
      const s = d[p + 1];
      if (s?.c === 'C') lien('b', a[0], a[1], s.p[0] ?? 0, s.p[1] ?? 0, p + 1, 0);
    }
    d.forEach((x, i) => {
      const q = ancre(x);
      if (q) r.push(<rect key={'a' + i} data-ancre={i} className={'ancre' + (i === p ? ' ancre-choisie' : '')} x={q[0] - 3.5 * px} y={q[1] - 3.5 * px} width={7 * px} height={7 * px} />);
    });
  }
  if (cadre) r.push(<rect key="cadre" className="cadre-selection" x={cadre.x} y={cadre.y} width={cadre.l} height={cadre.h} pointerEvents="none" />);
  return r;
}

/** La liste des formes, du premier plan au fond : choisir, masquer, verrouiller. */
function Calques({ ed }: { ed: Edition }) {
  const { dessin, sel } = ed;
  return (
    <aside className="editeur-calques" aria-label="Calques">
      <h3>Calques <span className="aide">{dessin.formes.length}</span></h3>
      <ol>
        {[...dessin.formes].reverse().map(f => (
          <li key={f.id} className={sel.includes(f.id) ? 'choisi' : undefined}>
            <button type="button" className="calque-nom" disabled={f.verrouille} onClick={e => {
              ed.choisir(e.shiftKey ? (sel.includes(f.id) ? sel.filter(s => s !== f.id) : [...sel, f.id]) : [f.id]);
              ed.poserPoint(null);
            }}>
              <span className="echantillon" style={{ background: f.remplissage ?? 'transparent', borderColor: f.contour ?? undefined }} />
              {'Forme ' + f.id.slice(1)}
            </button>
            <button type="button" className="calque-bascule" aria-pressed={!f.visible} title={f.visible ? 'Masquer' : 'Afficher'} aria-label={(f.visible ? 'Masquer la forme ' : 'Afficher la forme ') + f.id.slice(1)}
              onClick={() => ed.appliquer(d => modifier(d, [f.id], { visible: !f.visible }))}>{f.visible ? '◉' : '○'}</button>
            <button type="button" className="calque-bascule" aria-pressed={f.verrouille} title={f.verrouille ? 'Déverrouiller' : 'Verrouiller'} aria-label={(f.verrouille ? 'Déverrouiller la forme ' : 'Verrouiller la forme ') + f.id.slice(1)}
              onClick={() => { ed.appliquer(d => modifier(d, [f.id], { verrouille: !f.verrouille })); if (!f.verrouille) ed.choisir(sel.filter(s => s !== f.id)); }}>{f.verrouille ? '🔒' : '🔓'}</button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Les reglages de la selection : couleurs, opacite, position et taille, alignement, empilement, points. */
function Inspecteur({ ed }: { ed: Edition }) {
  const { dessin, sel, boite } = ed;
  const premiere = dessin.formes.find(f => f.id === sel[0]);
  if (!premiere) return null;
  const choisies = dessin.formes.filter(f => sel.includes(f.id));
  const mixte = (k: keyof Forme) => new Set(choisies.map(f => f[k])).size > 1;
  const regler = (r: Reglage, cle: string | null) => ed.appliquer(d => modifier(d, sel, r), cle === null ? ed.nouvelleCle() : cle + ':' + sel.join(','));
  return (
    <>
      <h3>{sel.length > 1 ? sel.length + ' formes' : 'Forme ' + premiere.id.slice(1)}</h3>
      <Peinture libelle="Remplissage" valeur={premiere.remplissage} mixte={mixte('remplissage')} nuancier={ed.nuancier} finir={ed.finir} poser={(v, continu) => regler({ remplissage: v }, continu ? 'remplissage' : null)} />
      <Peinture libelle="Contour" valeur={premiere.contour} mixte={mixte('contour')} nuancier={ed.nuancier} finir={ed.finir} poser={(v, continu) => regler({ contour: v }, continu ? 'contour' : null)} />
      {premiere.contour ? <Nombre libelle="Épaisseur" valeur={premiere.epaisseur} min={0} poser={v => regler({ epaisseur: v }, null)} /> : null}
      <label className="champ-ligne">
        <span>Opacité</span>
        <input type="range" min={0} max={100} value={Math.round(premiere.opacite * 100)} onChange={e => regler({ opacite: Number(e.target.value) / 100 }, 'opacite')} onPointerUp={ed.finir} onBlur={ed.finir} />
        <span className="aide">{Math.round(premiere.opacite * 100)} %</span>
      </label>
      <label className="champ-ligne">
        <span>Trous</span>
        <select value={premiere.regle} onChange={e => regler({ regle: e.target.value === 'evenodd' ? 'evenodd' : 'nonzero' }, null)}>
          <option value="nonzero">Selon le sens du tracé</option>
          <option value="evenodd">Pair-impair (chaque boucle creuse)</option>
        </select>
      </label>
      {boite ? (
        <fieldset className="editeur-groupe">
          <legend>Position et taille</legend>
          <div className="grille-2">
            <Nombre libelle="X" valeur={boite.x} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, x: v }))} />
            <Nombre libelle="Y" valeur={boite.y} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, y: v }))} />
            <Nombre libelle="L" valeur={boite.l} min={0} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, l: v }))} />
            <Nombre libelle="H" valeur={boite.h} min={0} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, h: v }))} />
          </div>
        </fieldset>
      ) : null}
      <fieldset className="editeur-groupe">
        <legend>Aligner {sel.length > 1 ? 'la sélection' : 'sur le plan'}</legend>
        <div className="boutons">
          {ALIGNEMENTS.map(([a, s, t]) => <button key={a} type="button" title={t} aria-label={t} onClick={() => ed.faire(d => aligner(d, sel, a))}>{s}</button>)}
        </div>
      </fieldset>
      <fieldset className="editeur-groupe">
        <legend>Transformer</legend>
        <div className="boutons">
          <button type="button" onClick={() => ed.faire(d => retourner(d, sel, 'h'))}>Miroir ↔</button>
          <button type="button" onClick={() => ed.faire(d => retourner(d, sel, 'v'))}>Miroir ↕</button>
          <button type="button" onClick={() => ed.faire(d => tourner(d, sel, -90))}>↺ 90°</button>
          <button type="button" onClick={() => ed.faire(d => tourner(d, sel, 90))}>↻ 90°</button>
        </div>
      </fieldset>
      <fieldset className="editeur-groupe">
        <legend>Empilement</legend>
        <div className="boutons">
          {ORDRES.map(([o, t]) => <button key={o} type="button" onClick={() => ed.faire(d => ordonner(d, sel, o))}>{t}</button>)}
        </div>
      </fieldset>
      <div className="boutons">
        <button type="button" onClick={ed.dupliquerSelection} title="Ctrl+D">Dupliquer</button>
        <button type="button" onClick={() => { ed.faire(d => modifier(d, sel, { visible: false })); ed.choisir([]); }}>Masquer</button>
        <button type="button" className="danger" onClick={ed.supprimerSelection} title="Suppr">Supprimer</button>
      </div>
      {ed.outil === 'points' && ed.formeSeule ? <PanneauPoint ed={ed} forme={ed.formeSeule} /> : sel.length === 1 ? <p className="aide">Double-cliquez la forme pour éditer ses points.</p> : null}
    </>
  );
}

function PanneauPoint({ ed, forme }: { ed: Edition; forme: Forme }) {
  const p = ed.point, c = p !== null ? forme.d[p] : undefined, suivante = p !== null ? forme.d[p + 1] : undefined;
  return (
    <fieldset className="editeur-groupe">
      <legend>Point {c && p !== null ? p + 1 + ' sur ' + forme.d.filter(x => x.c !== 'Z').length : ''}</legend>
      {c && p !== null ? (
        <div className="boutons">
          <button type="button" disabled={!suivante || suivante.c === 'M' || suivante.c === 'Z'} onClick={() => ed.faire(d => diviserSegment(d, forme.id, p + 1))}>Ajouter un point après</button>
          <button type="button" disabled={c.c === 'M' || c.c === 'Z'} onClick={() => ed.faire(d => basculerSegment(d, forme.id, p))}>{c.c === 'L' ? 'Courber le segment' : 'Redresser le segment'}</button>
          <button type="button" className="danger" onClick={ed.supprimerSelection}>Supprimer le point</button>
        </div>
      ) : <p className="aide">Cliquez un point pour le régler ; glissez-le, ou ses poignées. Flèches : au millième du plan.</p>}
    </fieldset>
  );
}

/** Sans selection : le dessin entier, ses couleurs (a remplacer, ou a prendre dans le nuancier) et son nettoyage. */
function PanneauDessin({ ed }: { ed: Edition }) {
  const { dessin } = ed;
  const [seuil, poserSeuil] = useState(0.0005);
  const stats = useMemo(() => statistiques(dessin), [dessin]);
  const couleurs = useMemo(() => couleursDuDessin(dessin), [dessin]);
  const masquees = dessin.formes.filter(f => !f.visible).length;
  const pl = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
  return (
    <>
      <h3>Dessin</h3>
      <p className="aide">{pl(stats.formes, 'forme')} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko{masquees ? ' · ' + pl(masquees, 'masquée') + ', retirée' + (masquees > 1 ? 's' : '') + ' à l’enregistrement' : ''}</p>
      <fieldset className="editeur-groupe">
        <legend>Couleurs du dessin</legend>
        <ul className="couleurs-dessin">
          {couleurs.map((c, i) => (
            <li key={i}>
              <input type="color" aria-label={'Remplacer ' + c.couleur} value={estHex(c.couleur) ? c.couleur : '#000000'}
                onChange={e => ed.appliquer(d => remplacerCouleur(d, c.couleur, e.target.value), 'recolorer-' + i)} onBlur={ed.finir} />
              <button type="button" className="discret" title="Sélectionner les formes de cette couleur" onClick={() => ed.choisir(idsDeCouleur(dessin, c.couleur))}>
                {c.couleur.toUpperCase()} · {c.formes}
              </button>
              {ed.nuancier.length ? (
                <select aria-label={'Remplacer ' + c.couleur + ' par une couleur du nuancier'} value="" onChange={e => { const v = e.target.value; if (v) ed.faire(d => remplacerCouleur(d, c.couleur, v)); }}>
                  <option value="">→ nuancier…</option>
                  {ed.nuancier.map(t => <option key={t.hex} value={t.hex}>{t.nom} ({t.hex.toUpperCase()})</option>)}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      </fieldset>
      <fieldset className="editeur-groupe">
        <legend>Nettoyer le tracé</legend>
        <label className="champ-ligne">
          <span>Seuil</span>
          <select value={String(seuil)} onChange={e => poserSeuil(Number(e.target.value))}>
            {SEUILS.map(([v, t]) => <option key={v} value={String(v)}>{t}</option>)}
          </select>
        </label>
        <div className="boutons">
          <button type="button" onClick={() => { const r = retirerPetites(dessin, seuil); ed.appliquer(() => r.dessin); ed.dire(r.retirees ? pl(r.retirees, 'petite forme') + ' retirée' + (r.retirees > 1 ? 's' : '') + '.' : 'Aucune forme sous ce seuil.'); }}>Retirer les petites formes</button>
          <button type="button" onClick={() => { const r = regrouper(dessin); ed.appliquer(() => r.dessin); ed.dire(r.reunies ? pl(r.reunies, 'forme') + ' regroupée' + (r.reunies > 1 ? 's' : '') + ' avec leur voisine de même couleur.' : 'Rien à regrouper sans changer le rendu.'); }}>Regrouper les voisines de même couleur</button>
          <button type="button" onClick={() => ed.faire(d => ajusterPlan(d), 'Plan de travail ajusté au dessin.')}>Ajuster le plan de travail</button>
        </div>
      </fieldset>
      <details className="editeur-aide">
        <summary>Raccourcis</summary>
        <ul>
          <li>V sélection · A points · H ou espace : main · O contours</li>
          <li>Ctrl+Z annuler · Ctrl+Maj+Z ou Ctrl+Y rétablir</li>
          <li>Suppr supprimer · Ctrl+D dupliquer · Ctrl+A tout sélectionner</li>
          <li>Flèches : déplacer (Maj : ×10) · Maj en glissant : contraindre</li>
          <li>Molette : zoom · Maj+molette : défiler · + / − · 0 ajuster · 1 taille réelle · Échap désélectionner</li>
        </ul>
      </details>
    </>
  );
}

/** Une couleur : selecteur, code, « aucune », et le nuancier. */
function Peinture({ libelle, valeur, mixte, nuancier, poser, finir }: { libelle: string; valeur: string | null; mixte: boolean; nuancier: readonly Teinte[]; poser: (v: string | null, continu: boolean) => void; finir: () => void }) {
  const [texte, poserTexte] = useState(valeur ?? '');
  useEffect(() => { poserTexte(valeur ?? ''); }, [valeur]);
  const valider = () => {
    const t = texte.trim().toLowerCase();
    if (!t || t === 'none' || t === 'aucun') { if (valeur !== null) poser(null, false); return; }
    const hex = /^#?([0-9a-f]{6})$/.exec(t)?.[1];
    if (hex) poser('#' + hex, false); else poserTexte(valeur ?? '');
  };
  return (
    <fieldset className="editeur-groupe peinture">
      <legend>{libelle}{mixte ? <span className="aide"> · mixte</span> : null}</legend>
      <div className="champ-ligne">
        <input type="color" aria-label={libelle} value={estHex(valeur) ? valeur : '#000000'} onChange={e => poser(e.target.value, true)} onBlur={finir} />
        <input type="text" aria-label={libelle + ' (code)'} value={texte} placeholder="aucun" size={8} onChange={e => poserTexte(e.target.value)} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') valider(); }} />
        <button type="button" className="discret" aria-pressed={valeur === null} onClick={() => poser(null, false)}>Aucun</button>
      </div>
      {nuancier.length ? (
        <div className="nuancier" role="group" aria-label={libelle + ' : nuancier'}>
          {nuancier.map(t => <button key={t.hex} type="button" className="echantillon" title={t.nom + ' ' + t.hex.toUpperCase()} aria-label={t.nom} aria-pressed={valeur === t.hex} style={{ background: t.hex }} onClick={() => poser(t.hex, false)} />)}
        </div>
      ) : null}
    </fieldset>
  );
}

function Nombre({ libelle, valeur, poser, min }: { libelle: string; valeur: number; poser: (v: number) => void; min?: number }) {
  const [t, poserT] = useState(String(arrondi(valeur)));
  useEffect(() => { poserT(String(arrondi(valeur))); }, [valeur]);
  const valider = () => {
    const v = Number(t.replace(',', '.'));
    if (Number.isFinite(v) && v !== arrondi(valeur) && (min === undefined || v >= min)) poser(v);
    else poserT(String(arrondi(valeur)));
  };
  return (
    <label className="champ-ligne nombre">
      <span>{libelle}</span>
      <input type="text" inputMode="decimal" value={t} onChange={e => poserT(e.target.value)} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') valider(); }} />
    </label>
  );
}
