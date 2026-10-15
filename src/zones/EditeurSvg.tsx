// L'editeur SVG plein ecran : retoucher un dessin vectoriel comme dans un logiciel de dessin.
// Selection, deplacement, mise a l'echelle, points et poignees, outils de trace (rectangle, ellipse,
// etoile, ligne, plume), couleurs d'un nuancier, empilement, alignement, nettoyage du trace,
// insertion depuis la bibliotheque de formes, et un historique qui annule chaque geste. Tout le
// calcul est dans `engine/editionSvg.ts` ; ici, l'affichage et les gestes.
//
// Le composant ne connait aucun magasin : il recoit le SVG, un nuancier facultatif, la bibliotheque
// facultative, et rend le SVG retouche a `enregistrer`. C'est ce qui le rend reutilisable.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ME, type PointerEvent as PE, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  aimanter, ajouterForme, ajusterPlan, aligner, ancre, basculerSegment, boiteDe, boiteForme, coller, combiner, couleursDuDessin, deplacer, deplacerAncre,
  deplacerPoignee, depart, diviserSegment, dupliquer, ecrireChemin, ecrireDessin, ellipse, etoile, idsDeCouleur, inserer, lireDessin, modifier, ordonner,
  pasGrille, polygone, rectangle, redimensionner, regrouper, remplacerCouleur, retirerPetites, retourner, seCroisent, separer, sousChemins, statistiques,
  supprimer, supprimerAncre, tourner, STYLE_DEFAUT, type Alignement, type Boite, type Commande, type DessinSvg, type Forme, type Ordre, type Reglage, type Style
} from '../engine/editionSvg.js';
import { annuler, avancer, clore, historique, retablir, type Historique } from '../util/historique.js';
import { nettoyerSvg } from '../util/svg.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import type { EntreeBibliotheque } from '../model/bibliotheque.js';
import { RechercheFormes, useBibliotheque } from './Bibliotheque.js';
import { Icone, type NomIcone } from './icones.js';

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
  /** La bibliotheque de formes a inserer : deja chargee, ou a charger au premier besoin. */
  bibliotheque?: Bibliotheque | 'a-charger';
  fermer: () => void;
  /** Recoit le SVG retouche, deja nettoye par `nettoyerSvg`. */
  enregistrer: (svg: string) => void;
}

type OutilForme = 'rectangle' | 'ellipse' | 'etoile' | 'ligne';
type Outil = 'selection' | 'points' | 'main' | 'plume' | OutilForme;
type Coin = 'nw' | 'ne' | 'sw' | 'se';
type Point = readonly [number, number];
interface Vue { zoom: number; x: number; y: number }
type Geste =
  | { type: 'pan'; x0: number; y0: number; vue: Vue }
  | { type: 'deplacer'; x0: number; y0: number; base: DessinSvg; ids: string[]; b: Boite | null; cle: string }
  | { type: 'echelle'; coin: Coin; b: Boite; base: DessinSvg; ids: string[]; cle: string }
  | { type: 'cadre'; x0: number; y0: number; ajout: boolean }
  | { type: 'ancre'; i: number; base: DessinSvg; id: string; cle: string }
  | { type: 'poignee'; i: number; k: 0 | 1; base: DessinSvg; id: string; cle: string }
  | { type: 'tracer'; outil: OutilForme; x0: number; y0: number; base: DessinSvg; cle: string };

const OUTILS: ReadonlyArray<readonly [Outil, NomIcone, string]> = [
  ['selection', 'selection', 'Sélection (V)'], ['points', 'points', 'Points et poignées (A)'], ['main', 'main', 'Main : déplacer la vue (H, ou espace)'],
  ['rectangle', 'rectangle', 'Rectangle (R) · Maj : carré'], ['ellipse', 'ellipse', 'Ellipse (E) · Maj : cercle'], ['etoile', 'etoile', 'Étoile (T)'],
  ['ligne', 'ligne', 'Ligne (L) · Maj : droite'], ['plume', 'plume', 'Plume (P) : cliquez les points, Entrée ferme, Échap abandonne']
];
const FONDS: ReadonlyArray<readonly ['damier' | 'blanc' | 'sombre', NomIcone, string]> = [['damier', 'fond-damier', 'Fond damier'], ['blanc', 'fond-blanc', 'Fond blanc'], ['sombre', 'fond-sombre', 'Fond sombre']];
const ALIGNEMENTS_ICONES: ReadonlyArray<readonly [Alignement, NomIcone, string]> = [
  ['gauche', 'aligner-gauche', 'Aligner à gauche'], ['centreH', 'aligner-centre-h', 'Centrer horizontalement'], ['droite', 'aligner-droite', 'Aligner à droite'],
  ['haut', 'aligner-haut', 'Aligner en haut'], ['centreV', 'aligner-centre-v', 'Centrer verticalement'], ['bas', 'aligner-bas', 'Aligner en bas']
];
const ORDRES_ICONES: ReadonlyArray<readonly [Ordre, NomIcone, string]> = [['premier', 'premier-plan', 'Premier plan (Ctrl+Maj+])'], ['avant', 'avancer', 'Avancer (Ctrl+])'], ['arriere', 'reculer', 'Reculer (Ctrl+[)'], ['dernier', 'arriere-plan', 'Arrière-plan (Ctrl+Maj+[)']];

/** Un bouton d'outil : une icone, une infobulle qui dit le geste et son raccourci. */
function Bouton({ icone, aide, onClick, pressed, disabled, className }: { icone: NomIcone; aide: string; onClick: () => void; pressed?: boolean; disabled?: boolean; className?: string }) {
  return <button type="button" className={'icone-bouton' + (className ? ' ' + className : '')} title={aide} aria-label={aide} aria-pressed={pressed} disabled={disabled} onClick={onClick}><Icone nom={icone} /></button>;
}
const FORMES = new Set<Outil>(['rectangle', 'ellipse', 'etoile', 'ligne']);
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
export function BoutonEditerSvg({ svg, titre, nom, nuancier, bibliotheque, enregistrer }: Omit<ProprietesEditeur, 'fermer'>) {
  const [ouvert, ouvrir] = useState(false);
  const ok = editable(svg);
  return (
    <>
      <button type="button" className="discret" disabled={!ok} title={ok ? 'Ouvrir l’éditeur SVG plein écran' : 'Une image enveloppée ne s’édite pas : vectorisez-la d’abord.'}
        onClick={() => ouvrir(true)}>Éditer le SVG en plein écran</button>
      {ouvert ? <EditeurSvg svg={svg} titre={titre} nom={nom} nuancier={nuancier ?? SANS_NUANCIER} {...(bibliotheque === undefined ? {} : { bibliotheque })} fermer={() => ouvrir(false)} enregistrer={s => { enregistrer(s); ouvrir(false); }} /> : null}
    </>
  );
}

export function EditeurSvg({ svg, titre, nom, nuancier: brut = SANS_NUANCIER, bibliotheque, fermer, enregistrer }: ProprietesEditeur) {
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
      ) : <Atelier initial={lu.dessin} titre={titre} nom={nom} nuancier={nuancier} bibliotheque={bibliotheque ?? null} fermer={fermer} enregistrer={enregistrer} />}
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
  bibliotheque: Bibliotheque | 'a-charger' | null;
  style: Style;
  trace: readonly Point[];
  presse: readonly Forme[];
  grille: boolean;
  pas: number;
  /** La valeur aimantee a la grille quand elle est active, telle quelle sinon. */
  aimant: (v: number) => number;
  poserGrille: (g: boolean) => void;
  choisir: (ids: string[]) => void;
  poserPoint: (i: number | null) => void;
  poserOutil: (o: Outil) => void;
  poserStyle: (s: Style) => void;
  poserTrace: (t: readonly Point[]) => void;
  finirTrace: (fermer: boolean) => void;
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void;
  faire: (f: (d: DessinSvg) => DessinSvg, texte?: string) => void;
  finir: () => void;
  annulerGeste: (cle: string) => void;
  dire: (t: string) => void;
  nouvelleCle: () => string;
  supprimerSelection: () => void;
  dupliquerSelection: () => void;
  copierSelection: () => void;
  couperSelection: () => void;
  collerPresse: () => void;
  combinerSelection: () => void;
  separerSelection: () => void;
  masquerSelection: () => void;
  verrouillerSelection: () => void;
  zoomerSelection: () => void;
  enregistrerTout: () => void;
  insererForme: (svgForme: string) => void;
}

/** Le style d'une ligne : son contour est la couleur courante, sans remplissage, sinon elle serait invisible. */
const styleLigne = (s: Style): Style => ({ remplissage: null, contour: s.contour ?? s.remplissage ?? '#000000', epaisseur: s.epaisseur || 1 });

/** Deux points voisins au millieme du plan sont le meme point : un double-clic n'en pose qu'un. */
const sansDoublons = (points: readonly Point[], eps: number): Point[] =>
  points.filter((p, i) => { const q = points[i - 1]; return !q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps; });

function Atelier({ initial, titre, nom, nuancier, bibliotheque, fermer, enregistrer }: { initial: DessinSvg; titre: string; nom: string; nuancier: readonly Teinte[]; bibliotheque: Bibliotheque | 'a-charger' | null; fermer: () => void; enregistrer: (svg: string) => void }) {
  const [h, poserH] = useState<Historique<DessinSvg>>(() => historique(initial));
  const [selection, choisir] = useState<string[]>([]);
  const [outil, poserOutilBrut] = useState<Outil>('selection');
  const [point, poserPoint] = useState<number | null>(null);
  const [style, poserStyle] = useState<Style>(() => ({ ...STYLE_DEFAUT, remplissage: nuancier[0]?.hex ?? STYLE_DEFAUT.remplissage }));
  const [trace, poserTrace] = useState<readonly Point[]>([]);
  const [presse, poserPresse] = useState<readonly Forme[]>([]);
  const [grille, poserGrille] = useState(false);
  const [contours, poserContours] = useState(false);
  const [fond, poserFond] = useState<'damier' | 'blanc' | 'sombre'>('damier');
  const [message, dire] = useState('');
  const [quitter, poserQuitter] = useState(false);
  const toile = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement>(null), compteur = useRef(0);
  const dessin = h.present;
  const modifie = h.passe.length > 0;
  const vues = useVue(toile, svgRef, dessin.vb);

  const pas = useMemo(() => pasGrille(dessin.vb), [dessin.vb]);
  const presentes = useMemo(() => new Set(dessin.formes.map(f => f.id)), [dessin]);
  const sel = useMemo(() => selection.filter(id => presentes.has(id)), [selection, presentes]);
  const formeSeule = sel.length === 1 ? dessin.formes.find(f => f.id === sel[0]) ?? null : null;
  const boite = useMemo(() => boiteDe(dessin, sel), [dessin, sel]);

  const appliquer = useCallback((f: (d: DessinSvg) => DessinSvg, cle: string | null = null) => { poserH(x => avancer(x, f(x.present), cle)); }, []);
  const finir = useCallback(() => poserH(x => clore(x)), []);
  // Un geste qui n'a rien produit (un rectangle sans surface) retire l'entree qu'il avait ouverte.
  const annulerGeste = useCallback((cle: string) => poserH(x => (x.cle === cle ? clore(annuler(x)) : x)), []);
  const defaire = useCallback(() => { poserH(x => annuler(clore(x))); poserPoint(null); poserTrace([]); dire(''); }, []);
  const refaire = useCallback(() => { poserH(x => retablir(x)); poserPoint(null); poserTrace([]); dire(''); }, []);
  const poserOutil = useCallback((o: Outil) => { poserOutilBrut(o); poserTrace([]); poserPoint(null); }, []);

  const demanderFermeture = () => { if (modifie) poserQuitter(true); else fermer(); };

  const base = { dessin, sel, formeSeule, outil, point, style, trace, presse, poserPresse, appliquer, choisir, poserPoint, poserOutil, poserOutilBrut, poserTrace, dire, vues, enregistrer, toile };
  const ed: Edition = {
    h, dessin, sel, boite, formeSeule, outil, point, nuancier, bibliotheque, style, trace, presse, grille, pas, poserGrille, choisir, poserPoint, poserOutil, poserStyle, poserTrace,
    appliquer, finir, annulerGeste, dire, ...actionsEdition(base),
    aimant: v => (grille ? aimanter(v, pas, dessin.vb[0] % pas) : v),
    faire: (f, texte = '') => { appliquer(f); dire(texte); },
    nouvelleCle: () => 'geste-' + ++compteur.current
  };
  useClavier(ed, { defaire, refaire, poserContours, demanderFermeture, vues });
  const gestes = useGestes(ed, vues, svgRef);
  const z = vues.vue.zoom;
  const [vx, vy, vl, vh] = dessin.vb;

  return (
    <div className={'editeur-cadre outil-' + outil}>
      <Barre ed={ed} titre={titre} nom={nom} vues={vues} contours={contours} poserContours={poserContours} fond={fond} poserFond={poserFond}
        defaire={defaire} refaire={refaire} demanderFermeture={demanderFermeture} modifie={modifie} />
      {sel.length ? <BarreSelection ed={ed} /> : null}
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
            {grille ? <Grille vb={dessin.vb} pas={pas} /> : null}
            {dessin.formes.map(f => <Calque key={f.id} f={f} contours={contours} />)}
            <g className="surcouche">{surcouche(ed, 1 / z, gestes.cadre)}</g>
          </g>
        </svg>
      </div>
      <aside className="editeur-inspecteur" aria-label="Inspecteur">
        {sel.length && !FORMES.has(outil) && outil !== 'plume' ? <Inspecteur ed={ed} /> : <PanneauDessin ed={ed} />}
      </aside>
      <footer className="editeur-etat" role="status">
        {message || etatParDefaut(ed)}
        <span className="espace" />
        {h.passe.length} modification{h.passe.length > 1 ? 's' : ''}
      </footer>
    </div>
  );
}

interface BaseActions {
  dessin: DessinSvg; sel: string[]; formeSeule: Forme | null; outil: Outil; point: number | null; style: Style; trace: readonly Point[];
  presse: readonly Forme[]; poserPresse: (p: readonly Forme[]) => void;
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void; choisir: (ids: string[]) => void; poserPoint: (i: number | null) => void;
  poserOutil: (o: Outil) => void; poserOutilBrut: (o: Outil) => void; poserTrace: (t: readonly Point[]) => void; dire: (t: string) => void;
  vues: Vues; enregistrer: (svg: string) => void; toile: RefObject<HTMLDivElement | null>;
}

type Actions = Pick<Edition, 'finirTrace' | 'supprimerSelection' | 'dupliquerSelection' | 'copierSelection' | 'couperSelection' | 'collerPresse' | 'combinerSelection' | 'separerSelection' | 'masquerSelection' | 'verrouillerSelection' | 'zoomerSelection' | 'enregistrerTout' | 'insererForme'>;

/** Les actions de la barre et des raccourcis, sur l'etat du moment. */
function actionsEdition(b: BaseActions): Actions {
  const { dessin, sel, appliquer, choisir, dire } = b;
  const pl = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
  const choisies = () => dessin.formes.filter(f => sel.includes(f.id));
  const pas = () => Math.max(dessin.vb[2], dessin.vb[3]) * 0.02;
  const supprimerSelection = () => {
    if (b.outil === 'points' && b.formeSeule && b.point !== null) {
      const r = supprimerAncre(dessin, b.formeSeule.id, b.point);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r);
      b.poserPoint(null);
      return;
    }
    if (!sel.length) return;
    appliquer(d => supprimer(d, sel));
    dire(pl(sel.length, 'forme') + ' supprimée' + (sel.length > 1 ? 's' : '') + '.');
    choisir([]);
  };
  return {
    supprimerSelection,
    dupliquerSelection: () => {
      if (!sel.length) return;
      const r = dupliquer(dessin, sel, pas(), pas());
      appliquer(() => r.dessin);
      choisir(r.ids);
    },
    copierSelection: () => {
      const c = choisies();
      if (!c.length) return;
      b.poserPresse(c);
      dire(pl(c.length, 'forme') + ' copiée' + (c.length > 1 ? 's' : '') + ' : Ctrl+V colle.');
    },
    couperSelection: () => {
      const c = choisies();
      if (!c.length) return;
      b.poserPresse(c);
      appliquer(d => supprimer(d, sel));
      choisir([]);
      dire(pl(c.length, 'forme') + ' coupée' + (c.length > 1 ? 's' : '') + ' : Ctrl+V colle.');
    },
    collerPresse: () => {
      if (!b.presse.length) return;
      const r = coller(dessin, b.presse, pas(), pas());
      appliquer(() => r.dessin);
      choisir(r.ids);
      b.poserOutil('selection');
      dire(pl(r.ids.length, 'forme') + ' collée' + (r.ids.length > 1 ? 's' : '') + '.');
    },
    combinerSelection: () => {
      const r = combiner(dessin, sel);
      if (!r.id) { dire('Choisissez au moins deux formes déverrouillées à combiner.'); return; }
      appliquer(() => r.dessin);
      choisir([r.id]);
      dire('Formes combinées en une seule ; « Trous : pair-impair » creuse les recouvrements.');
    },
    separerSelection: () => {
      const f = b.formeSeule;
      if (!f) { dire('Choisissez une seule forme à séparer.'); return; }
      const r = separer(dessin, f.id);
      if (r.ids.length < 2) { dire('Cette forme n’a qu’un seul tracé : rien à séparer.'); return; }
      appliquer(() => r.dessin);
      choisir(r.ids);
      dire('Forme séparée en ' + pl(r.ids.length, 'tracé') + '.');
    },
    masquerSelection: () => { if (sel.length) { appliquer(d => modifier(d, sel, { visible: false })); choisir([]); } },
    verrouillerSelection: () => { if (sel.length) { appliquer(d => modifier(d, sel, { verrouille: true })); choisir([]); dire('Formes verrouillées : déverrouillez-les dans les calques.'); } },
    zoomerSelection: () => {
      const bo = boiteDe(dessin, sel), el = b.toile.current;
      if (!bo || !el || !(bo.l > 0) || !(bo.h > 0)) { b.vues.ajuster(); return; }
      const zoom = Math.max(0.02, Math.min(64, Math.min(el.clientWidth / bo.l, el.clientHeight / bo.h) * 0.8));
      b.vues.poserVue({ zoom, x: (el.clientWidth - bo.l * zoom) / 2 - bo.x * zoom, y: (el.clientHeight - bo.h * zoom) / 2 - bo.y * zoom });
    },
    enregistrerTout: () => {
      const propre = nettoyerSvg(ecrireDessin(dessin, 3));
      if (!propre) { dire('Le dessin n’a plus de forme visible : rien à enregistrer.'); return; }
      b.enregistrer(propre.svg);
    },
    finirTrace: (fermerTrace: boolean) => {
      const points = sansDoublons(b.trace, Math.max(dessin.vb[2], dessin.vb[3]) / 1000);
      b.poserTrace([]);
      if (points.length < 2) return;
      const ferme = fermerTrace && points.length > 2;
      const r = ajouterForme(dessin, polygone(points, ferme), ferme ? b.style : styleLigne(b.style));
      if (!r.id) return;
      appliquer(() => r.dessin);
      choisir([r.id]);
      b.poserOutilBrut('selection');
      dire('Tracé ajouté : ' + points.length + ' points.');
    },
    insererForme: (svgForme: string) => {
      const autre = lireDessin(svgForme);
      if ('erreur' in autre) { dire(autre.erreur); return; }
      const [vx, vy, vl, vh] = dessin.vb, c = Math.min(vl, vh) / 3;
      const r = inserer(dessin, autre.dessin, { x: vx + (vl - c) / 2, y: vy + (vh - c) / 2, l: c, h: c });
      if (!r.ids.length) return;
      appliquer(() => r.dessin);
      choisir(r.ids);
      b.poserOutil('selection');
      dire('Forme insérée au centre : déplacez-la, redimensionnez-la, recolorez-la.');
    }
  };
}

/** La grille, en lignes fines a l'ecran quel que soit le zoom. */
function Grille({ vb, pas }: { vb: DessinSvg['vb']; pas: number }) {
  const [x, y, l, h] = vb, ox = x % pas, oy = y % pas;
  return (
    <>
      <defs>
        <pattern id="grille-editeur" patternUnits="userSpaceOnUse" x={ox} y={oy} width={pas} height={pas}>
          <path className="grille" d={`M${pas} 0L0 0L0 ${pas}`} fill="none" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={l} height={h} fill="url(#grille-editeur)" pointerEvents="none" />
    </>
  );
}

function etatParDefaut(ed: Edition): string {
  if (ed.outil === 'plume') return ed.trace.length ? ed.trace.length + ' point' + (ed.trace.length > 1 ? 's' : '') + ' · Entrée ou double-clic ferme le tracé, Retour arrière retire le dernier point, Échap abandonne.' : 'Plume : cliquez les points du tracé.';
  if (FORMES.has(ed.outil)) return 'Glissez sur la toile pour tracer (Maj : proportions).';
  if (ed.sel.length) return ed.sel.length + ' sélectionnée' + (ed.sel.length > 1 ? 's' : '') + (ed.outil === 'selection' ? ' · glissez pour déplacer, les coins pour redimensionner (Maj : proportions)' : '');
  return 'Cliquez une forme, ou tracez un cadre pour en choisir plusieurs.';
}

interface ProprietesBarre {
  ed: Edition; titre: string; nom: string; vues: Vues; contours: boolean; poserContours: (f: (c: boolean) => boolean) => void;
  fond: 'damier' | 'blanc' | 'sombre'; poserFond: (f: 'damier' | 'blanc' | 'sombre') => void;
  defaire: () => void; refaire: () => void; demanderFermeture: () => void; modifie: boolean;
}

function Barre({ ed, titre, nom, vues, contours, poserContours, fond, poserFond, defaire, refaire, demanderFermeture, modifie }: ProprietesBarre) {
  const z = vues.vue.zoom;
  return (
    <header className="editeur-barre">
      <strong className="editeur-titre">{titre}</strong>
      <div className="groupe outils" role="group" aria-label="Outil">
        {OUTILS.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} pressed={ed.outil === o} onClick={() => ed.poserOutil(o)} />)}
      </div>
      <StyleCourant ed={ed} />
      <div className="groupe" role="group" aria-label="Historique">
        <Bouton icone="annuler" aide="Annuler (Ctrl+Z)" disabled={!ed.h.passe.length} onClick={defaire} />
        <Bouton icone="retablir" aide="Rétablir (Ctrl+Maj+Z)" disabled={!ed.h.futur.length} onClick={refaire} />
      </div>
      <div className="groupe" role="group" aria-label="Presse-papiers">
        <Bouton icone="copier" aide="Copier (Ctrl+C)" disabled={!ed.sel.length} onClick={ed.copierSelection} />
        <Bouton icone="couper" aide="Couper (Ctrl+X)" disabled={!ed.sel.length} onClick={ed.couperSelection} />
        <Bouton icone="coller" aide="Coller (Ctrl+V)" disabled={!ed.presse.length} onClick={ed.collerPresse} />
      </div>
      <div className="groupe" role="group" aria-label="Zoom">
        <Bouton icone="zoom-moins" aide="Dézoomer (−)" onClick={() => vues.zoomer(0.8)} />
        <button type="button" className="zoom" title="Ajuster à l’écran (0)" onClick={vues.ajuster} aria-live="polite">{Math.round(z * 100)} %</button>
        <Bouton icone="zoom-plus" aide="Zoomer (+)" onClick={() => vues.zoomer(1.25)} />
        <Bouton icone="ajuster" aide="Ajuster à l’écran (0)" onClick={vues.ajuster} />
        <Bouton icone="zoom-selection" aide="Zoomer sur la sélection (Z)" disabled={!ed.sel.length} onClick={ed.zoomerSelection} />
        <Bouton icone="taille-reelle" aide="Taille réelle, 100 % (1)" onClick={vues.centrer100} />
      </div>
      <div className="groupe" role="group" aria-label="Affichage">
        <Bouton icone="grille" aide={'Grille magnétique (G) · pas ' + ed.pas} pressed={ed.grille} onClick={() => ed.poserGrille(!ed.grille)} />
        <Bouton icone="contours" aide="Vue contours (O)" pressed={contours} onClick={() => poserContours(c => !c)} />
        {FONDS.map(([f, icone, aide]) => <Bouton key={f} icone={icone} aide={aide} pressed={fond === f} onClick={() => poserFond(f)} />)}
      </div>
      <span className="espace" />
      <div className="groupe fin" role="group" aria-label="Fichier">
        <Bouton icone="telecharger" aide="Télécharger le SVG" onClick={() => { void proposer(nom + '.svg', texteOctets(ecrireDessin(ed.dessin, 3))).then(ed.dire); }} />
        <Bouton icone="fermer" aide="Fermer (Échap)" onClick={demanderFermeture} />
        <button type="button" className="primaire texte" title="Enregistrer (Ctrl+S)" onClick={ed.enregistrerTout} disabled={!modifie}><Icone nom="enregistrer" /> Enregistrer</button>
      </div>
    </header>
  );
}

/**
 * Les deux couleurs a portee de main : celles de la selection quand il y en a une (un clic les change
 * pour toutes les formes choisies), celles des formes a venir sinon.
 */
function StyleCourant({ ed }: { ed: Edition }) {
  const premiere = ed.sel.length ? ed.dessin.formes.find(f => f.id === ed.sel[0]) ?? null : null;
  const remplissage = premiere ? premiere.remplissage : ed.style.remplissage, contour = premiere ? premiere.contour : ed.style.contour;
  const poser = (r: Partial<Pick<Style, 'remplissage' | 'contour'>>, cle: string) => {
    if (premiere) ed.appliquer(d => modifier(d, ed.sel, r), cle + ':' + ed.sel.join(','));
    else ed.poserStyle({ ...ed.style, ...r });
  };
  const pastille = (libelle: string, valeur: string | null, cle: 'remplissage' | 'contour') => (
    <span className="pastille-style" title={libelle + (premiere ? ' de la sélection' : ' des formes à venir') + ' : ' + (valeur ?? 'aucun')}>
      <input type="color" aria-label={libelle} value={estHex(valeur) ? valeur : '#000000'} onChange={e => poser({ [cle]: e.target.value }, cle)} onBlur={ed.finir} />
      <button type="button" className={'aucun' + (valeur === null ? ' actif' : '')} aria-pressed={valeur === null} title={libelle + (valeur === null ? ' : aucun (cliquez pour en mettre un)' : ' : retirer')} aria-label={libelle + ' : aucun'} onClick={() => { poser({ [cle]: valeur === null ? '#000000' : null }, cle); ed.finir(); }}><Icone nom="fermer" taille={12} /></button>
    </span>
  );
  return (
    <div className="groupe style-courant" role="group" aria-label="Couleurs">
      {pastille('Remplissage', remplissage, 'remplissage')}
      {pastille('Contour', contour, 'contour')}
    </div>
  );
}

/** La rangee de la selection : aligner, retourner, tourner, empiler, combiner, separer, et le reste d'un geste. */
function BarreSelection({ ed }: { ed: Edition }) {
  const { sel } = ed;
  const separable = !!ed.formeSeule && sousChemins(ed.formeSeule.d).length > 1;
  const surPlan = sel.length > 1 ? '' : ' (sur le plan)';
  return (
    <div className="editeur-barre-selection" role="toolbar" aria-label="Sélection">
      <span className="aide">{sel.length} sélectionnée{sel.length > 1 ? 's' : ''}</span>
      <div className="groupe" role="group" aria-label="Aligner">
        {ALIGNEMENTS_ICONES.map(([a, icone, aide]) => <Bouton key={a} icone={icone} aide={aide + surPlan} onClick={() => ed.faire(d => aligner(d, sel, a))} />)}
      </div>
      <div className="groupe" role="group" aria-label="Transformer">
        <Bouton icone="miroir-h" aide="Miroir horizontal" onClick={() => ed.faire(d => retourner(d, sel, 'h'))} />
        <Bouton icone="miroir-v" aide="Miroir vertical" onClick={() => ed.faire(d => retourner(d, sel, 'v'))} />
        <Bouton icone="rotation-gauche" aide="Tourner de 90° vers la gauche" onClick={() => ed.faire(d => tourner(d, sel, -90))} />
        <Bouton icone="rotation-droite" aide="Tourner de 90° vers la droite" onClick={() => ed.faire(d => tourner(d, sel, 90))} />
      </div>
      <div className="groupe" role="group" aria-label="Empiler">
        {ORDRES_ICONES.map(([o, icone, aide]) => <Bouton key={o} icone={icone} aide={aide} onClick={() => ed.faire(d => ordonner(d, sel, o))} />)}
      </div>
      <div className="groupe" role="group" aria-label="Formes">
        <Bouton icone="combiner" aide="Combiner en une forme (Ctrl+G)" disabled={sel.length < 2} onClick={ed.combinerSelection} />
        <Bouton icone="separer" aide="Séparer les tracés (Ctrl+Maj+G)" disabled={!separable} onClick={ed.separerSelection} />
        <Bouton icone="dupliquer" aide="Dupliquer (Ctrl+D)" onClick={ed.dupliquerSelection} />
        <Bouton icone="masquer" aide="Masquer" onClick={ed.masquerSelection} />
        <Bouton icone="verrouiller" aide="Verrouiller" onClick={ed.verrouillerSelection} />
        <Bouton icone="supprimer" aide="Supprimer (Suppr)" className="danger" onClick={ed.supprimerSelection} />
      </div>
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
  defaire: () => void; refaire: () => void;
  poserContours: (f: (c: boolean) => boolean) => void; demanderFermeture: () => void; vues: Vues;
}

const RACCOURCIS_OUTILS: Record<string, Outil> = { v: 'selection', a: 'points', h: 'main', r: 'rectangle', e: 'ellipse', t: 'etoile', l: 'ligne', p: 'plume' };

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
      if (mod && t === 's') { e.preventDefault(); x.enregistrerTout(); return; }
      if (cible && /^(INPUT|SELECT|TEXTAREA)$/.test(cible.tagName)) { if (e.key === 'Escape') cible.blur(); return; }
      if (mod && t === 'a') { e.preventDefault(); x.choisir(x.dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id)); return; }
      if (mod && t === 'd') { e.preventDefault(); x.dupliquerSelection(); return; }
      if (mod && t === 'c') { e.preventDefault(); x.copierSelection(); return; }
      if (mod && t === 'x') { e.preventDefault(); x.couperSelection(); return; }
      if (mod && t === 'v') { e.preventDefault(); x.collerPresse(); return; }
      if (mod && t === 'g') { e.preventDefault(); if (e.shiftKey) x.separerSelection(); else x.combinerSelection(); return; }
      if (mod && (e.key === ']' || e.key === '[') && x.sel.length) { e.preventDefault(); x.faire(d => ordonner(d, x.sel, e.key === ']' ? (e.shiftKey ? 'premier' : 'avant') : e.shiftKey ? 'dernier' : 'arriere')); return; }
      if (x.outil === 'plume' && x.trace.length) {
        if (e.key === 'Enter') { e.preventDefault(); x.finirTrace(true); return; }
        if (e.key === 'Backspace') { e.preventDefault(); x.poserTrace(x.trace.slice(0, -1)); return; }
        if (e.key === 'Escape') { e.preventDefault(); x.poserTrace([]); return; }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); x.supprimerSelection(); return; }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (x.point !== null) x.poserPoint(null); else if (x.sel.length) x.choisir([]); else if (x.outil !== 'selection') x.poserOutil('selection'); else k.demanderFermeture();
        return;
      }
      if (e.key.startsWith('Arrow')) { e.preventDefault(); pousser(x, e.key, e.shiftKey); return; }
      if (mod) return;
      const outil = RACCOURCIS_OUTILS[t];
      if (outil) x.poserOutil(outil);
      else if (t === 'o') k.poserContours(v => !v);
      else if (t === 'g') x.poserGrille(!x.grille);
      else if (t === 'z') x.zoomerSelection();
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

/** La forme d'un outil de trace entre son point de depart et le curseur ; Maj impose les proportions. */
function formeTracee(outil: OutilForme, x0: number, y0: number, x: number, y: number, proportions: boolean): Commande[] {
  if (outil === 'ligne') {
    if (proportions) {
      const dx = x - x0, dy = y - y0, a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), r = Math.hypot(dx, dy);
      x = x0 + r * Math.cos(a); y = y0 + r * Math.sin(a);
    }
    return polygone([[x0, y0], [x, y]], false);
  }
  let l = Math.abs(x - x0), h = Math.abs(y - y0);
  if (proportions) { l = h = Math.max(l, h); }
  const bx = x < x0 ? x0 - l : x0, by = y < y0 ? y0 - h : y0;
  return outil === 'rectangle' ? rectangle(bx, by, l, h) : outil === 'ellipse' ? ellipse(bx, by, l, h) : etoile(bx, by, l, h);
}

/** Les gestes a la souris, au stylet ou au doigt sur la toile. */
function useGestes(ed: Edition, vues: Vues, svgRef: RefObject<SVGSVGElement | null>) {
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
  // Le point aimante a la grille : les traces, les points et les poignees s'y posent ; la selection s'y deplace par sa boite.
  const versGrille = (e: { clientX: number; clientY: number }): [number, number] => { const [x, y] = versDoc(e); return [ed.aimant(x), ed.aimant(y)]; };

  const appuyer = (e: PE<SVGSVGElement>) => {
    const t = e.target as Element;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = versDoc(e);
    if (e.button === 1 || ed.outil === 'main' || espace.current) { geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, vue }; return; }
    if (ed.outil === 'plume') { ed.poserTrace([...ed.trace, versGrille(e)]); return; }
    if (FORMES.has(ed.outil)) { const [gx, gy] = versGrille(e); geste.current = { type: 'tracer', outil: ed.outil as OutilForme, x0: gx, y0: gy, base: ed.dessin, cle: ed.nouvelleCle() }; return; }
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
      if (ids.includes(id)) geste.current = { type: 'deplacer', x0: x, y0: y, base: ed.dessin, ids, b: boiteDe(ed.dessin, ids), cle: ed.nouvelleCle() };
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
      if (g.b) { dx = ed.aimant(g.b.x + dx) - g.b.x; dy = ed.aimant(g.b.y + dy) - g.b.y; }
      ed.appliquer(() => deplacer(g.base, g.ids, dx, dy), g.cle);
      return;
    }
    const [gx, gy] = [ed.aimant(x), ed.aimant(y)];
    if (g.type === 'echelle') ed.appliquer(() => etirer(g, gx, gy, e.shiftKey, ed.dessin.vb), g.cle);
    else if (g.type === 'cadre') poserCadre({ x: Math.min(g.x0, x), y: Math.min(g.y0, y), l: Math.abs(x - g.x0), h: Math.abs(y - g.y0) });
    else if (g.type === 'ancre') ed.appliquer(() => deplacerAncre(g.base, g.id, g.i, gx, gy), g.cle);
    else if (g.type === 'poignee') ed.appliquer(() => deplacerPoignee(g.base, g.id, g.i, g.k, gx, gy), g.cle);
    else ed.appliquer(() => ajouterForme(g.base, formeTracee(g.outil, g.x0, g.y0, gx, gy, e.shiftKey), g.outil === 'ligne' ? styleLigne(ed.style) : ed.style).dessin, g.cle);
  };

  const lacher = (e: PE<SVGSVGElement>) => {
    const g = geste.current;
    geste.current = null;
    if (!g) return;
    if (g.type === 'tracer') {
      const [x, y] = versGrille(e);
      const r = ajouterForme(g.base, formeTracee(g.outil, g.x0, g.y0, x, y, e.shiftKey), g.outil === 'ligne' ? styleLigne(ed.style) : ed.style);
      const b = r.id ? boiteDe(r.dessin, [r.id]) : null;
      // Un trace sans surface a l'ecran n'est pas une forme : rien ne reste dans l'historique.
      if (!r.id || !b || (b.l * vue.zoom < 3 && b.h * vue.zoom < 3)) { ed.annulerGeste(g.cle); return; }
      ed.appliquer(() => r.dessin, g.cle);
      ed.finir();
      ed.choisir([r.id]);
      ed.poserOutil('selection');
      return;
    }
    if (g.type !== 'cadre') { if (g.type !== 'pan') ed.finir(); return; }
    const [x, y] = versDoc(e);
    const c = { x: Math.min(g.x0, x), y: Math.min(g.y0, y), l: Math.abs(x - g.x0), h: Math.abs(y - g.y0) };
    poserCadre(null);
    if (c.l * vue.zoom < 3 && c.h * vue.zoom < 3) { if (!g.ajout) ed.choisir([]); return; }
    const pris = ed.dessin.formes.filter(f => { const b = boiteForme(f); return f.visible && !f.verrouille && !!b && seCroisent(b, c); }).map(f => f.id);
    ed.choisir(g.ajout ? [...new Set([...ed.sel, ...pris])] : pris);
  };

  const doubleClic = (e: ME<SVGSVGElement>) => {
    if (ed.outil === 'plume') { ed.finirTrace(true); return; }
    // La capture du pointeur fait de la toile la cible du double-clic : on lit la forme sous le curseur.
    const id = document.elementFromPoint(e.clientX, e.clientY)?.getAttribute('data-id');
    if (id && ed.outil === 'selection') { ed.choisir([id]); ed.poserOutil('points'); }
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

/** Ce qui se dessine par-dessus : selection, boite et coins, points et poignees, cadre, trace en cours. */
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
  if (ed.trace.length) {
    r.push(<polyline key="trace" className="trace-en-cours" points={ed.trace.map(q => q[0] + ',' + q[1]).join(' ')} pointerEvents="none" />);
    ed.trace.forEach((q, i) => r.push(<rect key={'t' + i} className={'ancre' + (i === 0 ? ' ancre-choisie' : '')} x={q[0] - 3.5 * px} y={q[1] - 3.5 * px} width={7 * px} height={7 * px} pointerEvents="none" />));
  }
  if (cadre) r.push(<rect key="cadre" className="cadre-selection" x={cadre.x} y={cadre.y} width={cadre.l} height={cadre.h} pointerEvents="none" />);
  return r;
}

/** La liste des formes, du premier plan au fond : tout choisir ou rien, masquer, verrouiller. */
function Calques({ ed }: { ed: Edition }) {
  const { dessin, sel } = ed;
  const choisissables = dessin.formes.filter(f => f.visible && !f.verrouille).map(f => f.id);
  return (
    <aside className="editeur-calques" aria-label="Calques">
      <h3>Calques <span className="aide">{dessin.formes.length}</span></h3>
      <div className="calques-actions">
        <button type="button" className="discret" disabled={!choisissables.length || sel.length === choisissables.length} title="Tout sélectionner (Ctrl+A)" onClick={() => { ed.choisir(choisissables); ed.poserPoint(null); }}>Tout</button>
        <button type="button" className="discret" disabled={!sel.length} title="Ne rien sélectionner (Échap)" onClick={() => { ed.choisir([]); ed.poserPoint(null); }}>Aucun</button>
      </div>
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
        <button type="button" disabled={sel.length < 2} onClick={ed.combinerSelection} title="Ctrl+G">Combiner</button>
        <button type="button" disabled={!ed.formeSeule || sousChemins(ed.formeSeule.d).length < 2} onClick={ed.separerSelection} title="Ctrl+Maj+G">Séparer</button>
        <button type="button" onClick={ed.masquerSelection}>Masquer</button>
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

/** Sans selection, ou avec un outil de trace : le style des formes nouvelles, le dessin entier, ses couleurs, son nettoyage, la bibliotheque. */
function PanneauDessin({ ed }: { ed: Edition }) {
  const { dessin } = ed;
  const [seuil, poserSeuil] = useState(0.0005);
  const stats = useMemo(() => statistiques(dessin), [dessin]);
  const couleurs = useMemo(() => couleursDuDessin(dessin), [dessin]);
  const masquees = dessin.formes.filter(f => !f.visible).length;
  const pl = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
  const trace = FORMES.has(ed.outil) || ed.outil === 'plume';
  return (
    <>
      <h3>{trace ? 'Nouvelle forme' : 'Dessin'}</h3>
      {trace ? <StyleNouvelleForme ed={ed} /> : null}
      <p className="aide">{pl(stats.formes, 'forme')} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko{masquees ? ' · ' + pl(masquees, 'masquée') + ', retirée' + (masquees > 1 ? 's' : '') + ' à l’enregistrement' : ''}</p>
      {ed.bibliotheque ? <PanneauBibliotheque ed={ed} /> : null}
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
          <li>R rectangle · E ellipse · T étoile · L ligne · P plume (Entrée ferme, Retour arrière retire un point)</li>
          <li>Ctrl+Z annuler · Ctrl+Maj+Z ou Ctrl+Y rétablir</li>
          <li>Ctrl+C copier · Ctrl+X couper · Ctrl+V coller · Ctrl+D dupliquer · Ctrl+A tout sélectionner · Suppr supprimer</li>
          <li>Ctrl+G combiner · Ctrl+Maj+G séparer · Ctrl+] avancer, Ctrl+[ reculer (Maj : premier ou arrière-plan)</li>
          <li>G grille magnétique · Z zoom sur la sélection · Ctrl+S enregistrer</li>
          <li>Flèches : déplacer (Maj : ×10) · Maj en glissant : contraindre</li>
          <li>Molette : zoom · Maj+molette : défiler · + / − · 0 ajuster · 1 taille réelle · Échap désélectionner</li>
        </ul>
      </details>
    </>
  );
}

/** Le style des formes a venir : remplissage, contour, epaisseur. */
function StyleNouvelleForme({ ed }: { ed: Edition }) {
  const s = ed.style;
  return (
    <>
      <Peinture libelle="Remplissage" valeur={s.remplissage} mixte={false} nuancier={ed.nuancier} finir={() => undefined} poser={v => ed.poserStyle({ ...s, remplissage: v })} />
      <Peinture libelle="Contour" valeur={s.contour} mixte={false} nuancier={ed.nuancier} finir={() => undefined} poser={v => ed.poserStyle({ ...s, contour: v })} />
      {s.contour || ed.outil === 'ligne' ? <Nombre libelle="Épaisseur" valeur={s.epaisseur} min={0} poser={v => ed.poserStyle({ ...s, epaisseur: v })} /> : null}
      <p className="aide">{ed.outil === 'ligne' ? 'Une ligne prend la couleur de contour, ou celle du remplissage à défaut.' : 'Les formes tracées prennent ce style ; elles se règlent ensuite comme les autres.'}</p>
    </>
  );
}

/** La bibliotheque dans l'editeur : chercher, cliquer, la forme arrive au centre du plan. */
function PanneauBibliotheque({ ed }: { ed: Edition }) {
  const [voulue, vouloir] = useState(ed.bibliotheque !== 'a-charger');
  return (
    <details className="editeur-groupe bibliotheque-editeur">
      <summary>Insérer une forme de la bibliothèque</summary>
      {voulue ? <BibliothequeChargee ed={ed} /> : <button type="button" className="discret" onClick={() => vouloir(true)}>Charger la bibliothèque (environ 7 Mo)</button>}
    </details>
  );
}

function BibliothequeChargee({ ed }: { ed: Edition }) {
  const chargee = useBibliotheque();
  const b = ed.bibliotheque !== 'a-charger' && ed.bibliotheque ? ed.bibliotheque : chargee.bibliotheque;
  if (chargee.erreur && !b) return <p className="aide" role="alert">{chargee.erreur}</p>;
  if (!b) return <p className="aide" role="status">Chargement…</p>;
  const choisir = (x: EntreeBibliotheque) => ed.insererForme(x.svg);
  return <RechercheFormes bibliotheque={b} choisir={choisir} parPage={24} compact />;
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
