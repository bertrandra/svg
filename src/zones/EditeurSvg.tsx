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
  aimanter, ajouterForme, ajusterPlan, ancre, basculerSegment, boiteDe, boiteForme, coller, combiner, couleursDuDessin, deplacer, deplacerAncre,
  deplacerPoignee, depart, diviserSegment, dupliquer, ecrireChemin, ecrireDessin, ellipse, etoile, idsDeCouleur, inserer, lireDessin, modifier, ordonner,
  pasGrille, polygone, rectangle, redimensionner, regrouper, remplacerCouleur, retirerPetites, retourner, seCroisent, separer, statistiques,
  supprimer, supprimerAncre, STYLE_DEFAUT, type Boite, type Commande, type DessinSvg, type Forme, type Reglage, type Style
} from '../engine/editionSvg.js';
import { annuler, avancer, clore, historique, retablir, type Historique } from '../util/historique.js';
import { nettoyerSvg } from '../util/svg.js';
import { appliquerBooleen, type Booleen } from '../engine/booleens.js';
import { aimanter as aimanterBoite, angleVers, centre, ciblesAimants, incliner, mettreALEchelle, tournerAutour, type Aimant } from '../engine/transformations.js';
import { inserer as insererDessin } from '../engine/editionSvg.js';
import { bibliothequeChargee, type Bibliotheque } from '../io/bibliotheque.js';
import type { EntreeBibliotheque } from '../model/bibliotheque.js';
import { SCENES } from '../model/scenes.js';
import { RechercheFormes, useBibliotheque } from './Bibliotheque.js';
import { Barre, BarreSelection, Bouton, FORMES } from './BarreOutils.js';
import { ParCouleur } from './ParCouleur.js';
import { Section } from './Section.js';
import { Icone } from './icones.js';
import { PanneauPalettes } from './Palettes.js';
import { garderVersions, idVersion, lireVersions, type Version } from './session.js';
import { PanneauTexte } from './Texte.js';
import { PanneauVersions } from './Versions.js';

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
  /** Recoit le SVG du moment apres chaque modification (une seconde de repos) : de quoi reprendre apres un rechargement. */
  brouillon?: (svg: string) => void;
}

export type OutilForme = 'rectangle' | 'ellipse' | 'etoile' | 'ligne';
export type Outil = 'selection' | 'points' | 'main' | 'plume' | 'texte' | OutilForme;
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
  | { type: 'tracer'; outil: OutilForme; x0: number; y0: number; base: DessinSvg; cle: string }
  | { type: 'rotation'; centre: readonly [number, number]; angle0: number; base: DessinSvg; ids: string[]; cle: string }
  | { type: 'pincer'; d0: number; cx: number; cy: number; vue: Vue };

const SEUILS: ReadonlyArray<readonly [number, string]> = [[0.0001, 'Poussières (0,01 %)'], [0.0005, 'Petits détails (0,05 %)'], [0.002, 'Détails moyens (0,2 %)']];

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

export function EditeurSvg({ svg, titre, nom, nuancier: brut = SANS_NUANCIER, bibliotheque, fermer, enregistrer, brouillon }: ProprietesEditeur) {
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
      ) : <Atelier initial={lu.dessin} titre={titre} nom={nom} nuancier={nuancier} bibliotheque={bibliotheque ?? null} fermer={fermer} enregistrer={enregistrer} brouillon={brouillon} />}
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
export interface Edition {
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
  aimants: boolean;
  guides: readonly Aimant[];
  versions: readonly Version[];
  tiroir: 'calques' | 'inspecteur' | null;
  pas: number;
  /** La valeur aimantee a la grille quand elle est active, telle quelle sinon. */
  aimant: (v: number) => number;
  poserGrille: (g: boolean) => void;
  poserAimants: (a: boolean) => void;
  poserGuides: (g: readonly Aimant[]) => void;
  poserTiroir: (t: 'calques' | 'inspecteur' | null) => void;
  garderVersion: (nom: string, svg: string) => void;
  supprimerVersion: (id: string) => void;
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
  insererPlusieurs: (svgs: readonly { svg: string; x: number; y: number; taille: number }[]) => void;
  booleen: (op: Booleen) => void;
  transformerNumerique: (t: { rotation?: number; inclinaisonX?: number; inclinaisonY?: number; echelle?: number }) => void;
}

/** Le style d'une ligne : son contour est la couleur courante, sans remplissage, sinon elle serait invisible. */
const styleLigne = (s: Style): Style => ({ remplissage: null, contour: s.contour ?? s.remplissage ?? '#000000', epaisseur: s.epaisseur || 1 });

/** Deux points voisins au millieme du plan sont le meme point : un double-clic n'en pose qu'un. */
const sansDoublons = (points: readonly Point[], eps: number): Point[] =>
  points.filter((p, i) => { const q = points[i - 1]; return !q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps; });

function Atelier({ initial, titre, nom, nuancier, bibliotheque, fermer, enregistrer, brouillon }: { initial: DessinSvg; titre: string; nom: string; nuancier: readonly Teinte[]; bibliotheque: Bibliotheque | 'a-charger' | null; fermer: () => void; enregistrer: (svg: string) => void; brouillon?: ((svg: string) => void) | undefined }) {
  const [h, poserH] = useState<Historique<DessinSvg>>(() => historique(initial));
  const [selection, choisir] = useState<string[]>([]);
  const [outil, poserOutilBrut] = useState<Outil>('selection');
  const [point, poserPoint] = useState<number | null>(null);
  const [style, poserStyle] = useState<Style>(() => ({ ...STYLE_DEFAUT, remplissage: nuancier[0]?.hex ?? STYLE_DEFAUT.remplissage }));
  const [trace, poserTrace] = useState<readonly Point[]>([]);
  const [presse, poserPresse] = useState<readonly Forme[]>([]);
  const [grille, poserGrille] = useState(false);
  const [aimants, poserAimants] = useState(true);
  const [guides, poserGuides] = useState<readonly Aimant[]>([]);
  const [versions, poserVersionsEtat] = useState<readonly Version[]>(() => lireVersions());
  const [tiroir, poserTiroir] = useState<'calques' | 'inspecteur' | null>(null);
  const [contours, poserContours] = useState(false);
  const [fond, poserFond] = useState<'damier' | 'blanc' | 'sombre'>('damier');
  const [message, dire] = useState('');
  const [quitter, poserQuitter] = useState(false);
  const toile = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement>(null), compteur = useRef(0);
  const dessin = h.present;
  const modifie = h.passe.length > 0;
  const vues = useVue(toile, svgRef, dessin.vb);
  const tactile = useTactile();

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
  const poserVersions = useCallback((v: readonly Version[]) => { poserVersionsEtat(v); garderVersions(v); }, []);
  // Le brouillon : le SVG du moment, une seconde apres la derniere modification.
  useEffect(() => {
    if (!brouillon || !modifie) return;
    const t = setTimeout(() => brouillon(ecrireDessin(dessin, 3)), 1000);
    return () => clearTimeout(t);
  }, [brouillon, dessin, modifie]);

  const demanderFermeture = () => { if (modifie) poserQuitter(true); else fermer(); };

  const base = { dessin, sel, formeSeule, outil, point, style, trace, presse, poserPresse, appliquer, choisir, poserPoint, poserOutil, poserOutilBrut, poserTrace, dire, vues, enregistrer, toile };
  const ed: Edition = {
    h, dessin, sel, boite, formeSeule, outil, point, nuancier, bibliotheque, style, trace, presse, grille, aimants, guides, versions, tiroir, pas,
    poserGrille, poserAimants, poserGuides, poserTiroir, choisir, poserPoint, poserOutil, poserStyle, poserTrace,
    garderVersion: (nomVersion, svgVersion) => { const quand = Date.now(); poserVersions([{ id: idVersion(quand, versions.length), nom: nomVersion, svg: svgVersion, quand }, ...versions]); dire('Version « ' + nomVersion + ' » gardée dans ce navigateur.'); },
    supprimerVersion: id => poserVersions(versions.filter(v => v.id !== id)),
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
    <div className={'editeur-cadre outil-' + outil + (tiroir ? ' tiroir-' + tiroir : '')}>
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
      {tiroir ? <div className="voile" aria-hidden="true" onClick={() => poserTiroir(null)} /> : null}
      <div className={'editeur-toile fond-' + fond} ref={toile}>
        <svg ref={svgRef} className="editeur-svg-toile" tabIndex={0} role="application" aria-label={'Plan de travail de ' + titre + ' : ' + dessin.formes.length + ' forme' + (dessin.formes.length > 1 ? 's' : '')} onPointerDown={gestes.appuyer} onPointerMove={gestes.bouger} onPointerUp={gestes.lacher} onPointerCancel={gestes.lacher} onDoubleClick={gestes.doubleClic}>
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
            <g className="surcouche">{surcouche(ed, 1 / z, gestes.cadre, tactile)}</g>
          </g>
        </svg>
      </div>
      <aside className="editeur-inspecteur" aria-label="Inspecteur">
        {sel.length && !FORMES.has(outil) && outil !== 'plume' && outil !== 'texte' ? <Inspecteur ed={ed} /> : <PanneauDessin ed={ed} />}
      </aside>
      <footer className="editeur-etat" role="status">
        <span className="tiroirs">
          <Bouton icone="panneau-gauche" aide="Calques" pressed={tiroir === 'calques'} onClick={() => poserTiroir(tiroir === 'calques' ? null : 'calques')} />
          <Bouton icone="panneau-droit" aide="Inspecteur" pressed={tiroir === 'inspecteur'} onClick={() => poserTiroir(tiroir === 'inspecteur' ? null : 'inspecteur')} />
        </span>
        <span className="message-etat">{message || etatParDefaut(ed)}</span>
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

type Actions = Pick<Edition, 'finirTrace' | 'supprimerSelection' | 'dupliquerSelection' | 'copierSelection' | 'couperSelection' | 'collerPresse' | 'combinerSelection' | 'separerSelection' | 'masquerSelection' | 'verrouillerSelection' | 'zoomerSelection' | 'enregistrerTout' | 'insererForme' | 'insererPlusieurs' | 'booleen' | 'transformerNumerique'>;

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
    },
    // Plusieurs formes d'un coup, chacune a sa place relative (0 a 1) dans le carre inscrit au plan.
    insererPlusieurs: elements => {
      const [vx, vy, vl, vh] = dessin.vb, c = Math.min(vl, vh), ox = vx + (vl - c) / 2, oy = vy + (vh - c) / 2;
      let d = dessin;
      const ids: string[] = [];
      for (const e of elements) {
        const autre = lireDessin(e.svg);
        if ('erreur' in autre) continue;
        const r = insererDessin(d, autre.dessin, { x: ox + e.x * c, y: oy + e.y * c, l: e.taille * c, h: e.taille * c });
        d = r.dessin;
        ids.push(...r.ids);
      }
      if (!ids.length) return;
      appliquer(() => d);
      choisir(ids);
      b.poserOutil('selection');
      dire(pl(ids.length, 'forme') + ' insérée' + (ids.length > 1 ? 's' : '') + '.');
    },
    booleen: op => {
      const r = appliquerBooleen(dessin, sel, op);
      if (r.erreur) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      choisir(r.id ? [r.id] : []);
      dire(r.id ? 'Opération appliquée : le résultat est en segments droits, au style de la forme la plus basse.' : 'Il ne reste rien : les formes ont disparu. Ctrl+Z revient en arrière.');
    },
    transformerNumerique: t => {
      if (!sel.length) return;
      let d = dessin;
      if (t.rotation) d = tournerAutour(d, sel, t.rotation);
      if (t.inclinaisonX || t.inclinaisonY) d = incliner(d, sel, t.inclinaisonX ?? 0, t.inclinaisonY ?? 0);
      if (t.echelle && t.echelle !== 100) d = mettreALEchelle(d, sel, t.echelle / 100);
      if (d !== dessin) appliquer(() => d);
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

export interface Vues { vue: Vue; poserVue: (v: Vue | ((v: Vue) => Vue)) => void; ajuster: () => void; zoomer: (f: number, cx?: number, cy?: number) => void; centrer100: () => void }

/** Vrai quand le pointeur principal est un doigt : les poignees de la toile grossissent. */
function useTactile(): boolean {
  const [t, poserT] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia('(pointer: coarse)');
    const suivre = () => poserT(m.matches);
    m.addEventListener('change', suivre);
    return () => m.removeEventListener('change', suivre);
  }, []);
  return t;
}

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

const RACCOURCIS_OUTILS: Record<string, Outil> = { v: 'selection', a: 'points', h: 'main', r: 'rectangle', e: 'ellipse', s: 'etoile', l: 'ligne', p: 'plume', t: 'texte' };

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
      else if (t === 'm') x.poserAimants(!x.aimants);
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
  // Les pointeurs poses sur la toile : deux doigts pincent la vue, quoi que fasse l'outil.
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
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
    // Un pointeur deja parti (ou synthetique) refuse la capture : le geste se fait sans elle.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans capture, la toile suit quand meme le pointeur tant qu'il la survole */ }
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointeurs.current.size === 2) {
      const [a, b] = [...pointeurs.current.values()];
      if (a && b) {
        if (geste.current && geste.current.type !== 'pan' && geste.current.type !== 'cadre' && 'cle' in geste.current) ed.annulerGeste(geste.current.cle);
        geste.current = { type: 'pincer', d0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vue };
      }
      return;
    }
    const [x, y] = versDoc(e);
    if (e.button === 1 || ed.outil === 'main' || espace.current) { geste.current = { type: 'pan', x0: e.clientX, y0: e.clientY, vue }; return; }
    const rot = t.getAttribute('data-rotation');
    if (rot !== null && ed.boite) { geste.current = { type: 'rotation', centre: centre(ed.boite), angle0: angleVers(centre(ed.boite), [x, y]), base: ed.dessin, ids: ed.sel, cle: ed.nouvelleCle() }; return; }
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
    if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.type === 'pincer') {
      const [a, b] = [...pointeurs.current.values()];
      if (!a || !b) return;
      const r = svgRef.current?.getBoundingClientRect(), ox = r?.left ?? 0, oy = r?.top ?? 0;
      const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), k = Math.max(0.02, Math.min(64, g.vue.zoom * (d / g.d0))) / g.vue.zoom;
      const mx = (a.x + b.x) / 2 - ox, my = (a.y + b.y) / 2 - oy, px = g.cx - ox, py = g.cy - oy;
      vues.poserVue({ zoom: g.vue.zoom * k, x: mx - (px - g.vue.x) * k, y: my - (py - g.vue.y) * k });
      return;
    }
    if (g.type === 'pan') { vues.poserVue({ ...g.vue, x: g.vue.x + e.clientX - g.x0, y: g.vue.y + e.clientY - g.y0 }); return; }
    const [x, y] = versDoc(e);
    if (g.type === 'rotation') {
      let a = angleVers(g.centre, [x, y]) - g.angle0;
      if (e.shiftKey) a = Math.round(a / 15) * 15;
      ed.appliquer(() => tournerAutour(g.base, g.ids, a, g.centre), g.cle);
      return;
    }
    if (g.type === 'deplacer') {
      let dx = x - g.x0, dy = y - g.y0;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (g.b) { dx = ed.aimant(g.b.x + dx) - g.b.x; dy = ed.aimant(g.b.y + dy) - g.b.y; }
      if (g.b && ed.aimants && !ed.grille) {
        const a = aimanterBoite({ ...g.b, x: g.b.x + dx, y: g.b.y + dy }, ciblesAimants(g.base, g.ids), 6 / vue.zoom);
        dx += a.dx; dy += a.dy;
        ed.poserGuides(a.lignes);
      }
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
    pointeurs.current.delete(e.pointerId);
    if (g?.type === 'pincer') { if (pointeurs.current.size === 0) geste.current = null; return; }
    geste.current = null;
    if (ed.guides.length) ed.poserGuides([]);
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
function surcouche(ed: Edition, unite: number, cadre: Boite | null, tactile: boolean): ReactNode[] {
  const r: ReactNode[] = [];
  // Au doigt, les poignees grossissent : une cible de 8 px ne se touche pas.
  const px = unite * (tactile ? 1.8 : 1);
  for (const id of ed.sel) {
    const f = ed.dessin.formes.find(x => x.id === id);
    if (f) r.push(<path key={'s' + id} className="trace-choisi" d={cheminDe(f)} pointerEvents="none" />);
  }
  const b = ed.boite;
  if (b && ed.outil === 'selection') {
    r.push(<rect key="boite" className="boite-choisie" x={b.x} y={b.y} width={b.l} height={b.h} pointerEvents="none" />);
    const coins: [Coin, number, number][] = [['nw', b.x, b.y], ['ne', b.x + b.l, b.y], ['sw', b.x, b.y + b.h], ['se', b.x + b.l, b.y + b.h]];
    for (const [c, cx, cy] of coins) r.push(<rect key={c} data-coin={c} className={'coin coin-' + c} x={cx - 4 * px} y={cy - 4 * px} width={8 * px} height={8 * px} />);
    // La poignee de rotation, au-dessus du milieu du bord haut.
    r.push(<line key="lien-rot" className="lien-poignee" x1={b.x + b.l / 2} y1={b.y} x2={b.x + b.l / 2} y2={b.y - 22 * px} pointerEvents="none" />);
    r.push(<circle key="rot" data-rotation="1" className="poignee-rotation" cx={b.x + b.l / 2} cy={b.y - 22 * px} r={5 * px} />);
  }
  for (const [i, g] of ed.guides.entries()) {
    r.push(g.axe === 'x'
      ? <line key={'g' + i} className="guide" x1={g.valeur} y1={g.de} x2={g.valeur} y2={g.a} pointerEvents="none" />
      : <line key={'g' + i} className="guide" x1={g.de} y1={g.valeur} x2={g.a} y2={g.valeur} pointerEvents="none" />);
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
  const masquees = dessin.formes.filter(f => !f.visible).length;
  const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
  return (
    <aside className="editeur-calques" aria-label="Calques">
      <h3>Calques <span className="aide">{dessin.formes.length}</span></h3>
      <div className="calques-actions">
        <button type="button" className="discret" disabled={!choisissables.length || sel.length === choisissables.length} title="Tout sélectionner (Ctrl+A)" onClick={() => { ed.choisir(choisissables); ed.poserPoint(null); }}>Tout</button>
        <button type="button" className="discret" disabled={!sel.length} title="Ne rien sélectionner (Échap)" onClick={() => { ed.choisir([]); ed.poserPoint(null); }}>Aucun</button>
        <button type="button" className="discret" disabled={!choisissables.length} title="Inverser la sélection" onClick={() => { ed.choisir(choisissables.filter(id => !sel.includes(id))); ed.poserPoint(null); }}>Inverser</button>
        <button type="button" className="discret" disabled={!masquees} title="Afficher toutes les formes masquées" onClick={() => ed.faire(d => modifier(d, d.formes.filter(f => !f.visible).map(f => f.id), { visible: true }), pluriel(masquees, 'forme') + ' affichée' + (masquees > 1 ? 's' : '') + '.')}>Tout afficher</button>
      </div>
      <ParCouleur ed={ed} />
      <h4>Formes</h4>
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

/** Les reglages de la selection : apparence, position et taille, transformations chiffrees, points. Aligner, empiler, booleens et le reste vivent dans la barre de la selection. */
function Inspecteur({ ed }: { ed: Edition }) {
  const { dessin, sel, boite } = ed;
  const premiere = dessin.formes.find(f => f.id === sel[0]);
  if (!premiere) return null;
  const choisies = dessin.formes.filter(f => sel.includes(f.id));
  const mixte = (k: keyof Forme) => new Set(choisies.map(f => f[k])).size > 1;
  const regler = (r: Reglage, cle: string | null) => ed.appliquer(d => modifier(d, sel, r), cle === null ? ed.nouvelleCle() : cle + ':' + sel.join(','));
  const points = ed.outil === 'points' && ed.formeSeule;
  return (
    <>
      <h3>{sel.length > 1 ? sel.length + ' formes' : 'Forme ' + premiere.id.slice(1)}</h3>
      <Section titre="Apparence" ouverte>
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
      </Section>
      {boite ? (
        <Section titre="Position et taille" ouverte>
          <div className="grille-2">
            <Nombre libelle="X" valeur={boite.x} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, x: v }))} />
            <Nombre libelle="Y" valeur={boite.y} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, y: v }))} />
            <Nombre libelle="L" valeur={boite.l} min={0} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, l: v }))} />
            <Nombre libelle="H" valeur={boite.h} min={0} poser={v => ed.appliquer(d => redimensionner(d, sel, { ...boite, h: v }))} />
          </div>
        </Section>
      ) : null}
      <Section titre="Transformer" note="angle, échelle, inclinaison">
        <TransformationsNumeriques ed={ed} />
      </Section>
      {points ? <PanneauPoint ed={ed} forme={points} /> : null}
      <p className="aide">{sel.length === 1 && !points ? 'Double-cliquez la forme pour éditer ses points. ' : ''}Aligner, empiler, booléens, miroirs : la barre au-dessus de la toile.</p>
    </>
  );
}

/** Tourner d'un angle, incliner, mettre a l'echelle : des champs qui s'appliquent a la validation, en relatif. */
function TransformationsNumeriques({ ed }: { ed: Edition }) {
  const [rotation, poserRotation] = useState('0');
  const [ix, poserIx] = useState('0');
  const [iy, poserIy] = useState('0');
  const [echelle, poserEchelle] = useState('100');
  const n = (t: string) => Number(t.replace(',', '.'));
  const appliquer = () => {
    ed.transformerNumerique({ rotation: n(rotation) || 0, inclinaisonX: n(ix) || 0, inclinaisonY: n(iy) || 0, echelle: n(echelle) || 100 });
    poserRotation('0'); poserIx('0'); poserIy('0'); poserEchelle('100');
  };
  const champ = (libelle: string, v: string, poser: (t: string) => void, titre: string) => (
    <label className="champ-ligne nombre" title={titre}><span>{libelle}</span><input type="text" inputMode="decimal" value={v} onChange={e => poser(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') appliquer(); }} /></label>
  );
  return (
    <div className="transformations-numeriques">
      <div className="grille-2">
        {champ('Rotation °', rotation, poserRotation, 'Angle, dans le sens horaire ; Maj en tirant la poignée ronde arrondit à 15°')}
        {champ('Échelle %', echelle, poserEchelle, 'Pourcentage, autour du centre')}
        {champ('Incl. X °', ix, poserIx, 'Inclinaison horizontale')}
        {champ('Incl. Y °', iy, poserIy, 'Inclinaison verticale')}
      </div>
      <button type="button" className="discret" onClick={appliquer}>Appliquer</button>
    </div>
  );
}

function PanneauPoint({ ed, forme }: { ed: Edition; forme: Forme }) {
  const p = ed.point, c = p !== null ? forme.d[p] : undefined, suivante = p !== null ? forme.d[p + 1] : undefined;
  return (
    <Section titre={'Point' + (c && p !== null ? ' ' + (p + 1) + ' sur ' + forme.d.filter(x => x.c !== 'Z').length : '')} ouverte>
      {c && p !== null ? (
        <div className="boutons">
          <button type="button" disabled={!suivante || suivante.c === 'M' || suivante.c === 'Z'} onClick={() => ed.faire(d => diviserSegment(d, forme.id, p + 1))}>Ajouter un point après</button>
          <button type="button" disabled={c.c === 'M' || c.c === 'Z'} onClick={() => ed.faire(d => basculerSegment(d, forme.id, p))}>{c.c === 'L' ? 'Courber le segment' : 'Redresser le segment'}</button>
          <button type="button" className="danger" onClick={ed.supprimerSelection}>Supprimer le point</button>
        </div>
      ) : <p className="aide">Cliquez un point pour le régler ; glissez-le, ou ses poignées. Flèches : au millième du plan.</p>}
    </Section>
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
  const trace = FORMES.has(ed.outil) || ed.outil === 'plume' || ed.outil === 'texte';
  return (
    <>
      <h3>{ed.outil === 'texte' ? 'Texte' : trace ? 'Nouvelle forme' : 'Dessin'}</h3>
      {ed.outil === 'texte' ? <PanneauTexte ed={ed} /> : null}
      {trace ? <StyleNouvelleForme ed={ed} /> : null}
      <p className="aide">{pl(stats.formes, 'forme')} · {stats.points} points · {Math.max(1, Math.round(stats.octets / 1024))} Ko{masquees ? ' · ' + pl(masquees, 'masquée') + ', retirée' + (masquees > 1 ? 's' : '') + ' à l’enregistrement' : ''}</p>
      <Section titre="Couleurs du dessin" ouverte note={couleurs.length}>
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
      </Section>
      <PanneauPalettes ed={ed} />
      {ed.bibliotheque ? <PanneauBibliotheque ed={ed} /> : null}
      <Section titre="Nettoyer le tracé">
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
      </Section>
      <PanneauVersions ed={ed} />
      <Section titre="Raccourcis">
        <ul className="raccourcis">
          <li>V sélection · A points · H ou espace : main · O contours</li>
          <li>R rectangle · E ellipse · S étoile · L ligne · P plume (Entrée ferme, Retour arrière retire un point) · T texte</li>
          <li>M aimants · poignée ronde : rotation (Maj : par 15°) · deux doigts : zoom</li>
          <li>Ctrl+Z annuler · Ctrl+Maj+Z ou Ctrl+Y rétablir</li>
          <li>Ctrl+C copier · Ctrl+X couper · Ctrl+V coller · Ctrl+D dupliquer · Ctrl+A tout sélectionner · Suppr supprimer</li>
          <li>Ctrl+G combiner · Ctrl+Maj+G séparer · Ctrl+] avancer, Ctrl+[ reculer (Maj : premier ou arrière-plan)</li>
          <li>G grille magnétique · Z zoom sur la sélection · Ctrl+S enregistrer</li>
          <li>Flèches : déplacer (Maj : ×10) · Maj en glissant : contraindre</li>
          <li>Molette : zoom · Maj+molette : défiler · + / − · 0 ajuster · 1 taille réelle · Échap désélectionner</li>
        </ul>
      </Section>
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
  const [voulue, vouloir] = useState(ed.bibliotheque !== 'a-charger' || bibliothequeChargee());
  return (
    <Section titre="Bibliothèque de formes">
      {voulue ? <BibliothequeChargee ed={ed} /> : <button type="button" className="primaire" onClick={() => vouloir(true)}>Charger la bibliothèque (environ 7 Mo)</button>}
    </Section>
  );
}

function BibliothequeChargee({ ed }: { ed: Edition }) {
  const chargee = useBibliotheque();
  const [panier, poserPanier] = useState<EntreeBibliotheque[]>([]);
  const [sceneId, poserSceneId] = useState(SCENES[0]?.id ?? '');
  const b = ed.bibliotheque !== 'a-charger' && ed.bibliotheque ? ed.bibliotheque : chargee.bibliotheque;
  if (chargee.erreur && !b) return <p className="aide" role="alert">{chargee.erreur}</p>;
  if (!b) return <p className="aide" role="status">Chargement…</p>;
  const choisir = (x: EntreeBibliotheque) => ed.insererForme(x.svg);
  // Le panier en grille : autant de colonnes que la racine du nombre, chaque case a 80 % de sa cellule.
  const insererPanier = () => {
    const n = panier.length, cols = Math.ceil(Math.sqrt(n)), lignes = Math.ceil(n / cols), cellule = 1 / Math.max(cols, lignes);
    ed.insererPlusieurs(panier.map((x, i) => ({ svg: x.svg, x: (i % cols) * cellule + cellule * 0.1, y: Math.floor(i / cols) * cellule + cellule * 0.1 + ((Math.max(cols, lignes) - lignes) * cellule) / 2, taille: cellule * 0.8 })));
    poserPanier([]);
  };
  const insererScene = () => {
    const sc = SCENES.find(x => x.id === sceneId);
    if (!sc) return;
    const parId = new Map(b.entrees.map(x => [x.id, x.svg]));
    ed.insererPlusieurs(sc.elements.flatMap(e => { const svg = parId.get(e.id); return svg ? [{ svg, x: e.x, y: e.y, taille: e.taille }] : []; }));
  };
  return (
    <>
      <div className="champ-ligne scene">
        <span>Scène</span>
        <select aria-label="Scène prête" value={sceneId} onChange={e => poserSceneId(e.target.value)}>{SCENES.map(sc => <option key={sc.id} value={sc.id}>{sc.nom}</option>)}</select>
        <button type="button" title="Insérer la scène : ses formes, à leur place" aria-label="Insérer la scène" onClick={insererScene}><Icone nom="scene" taille={14} /></button>
      </div>
      <RechercheFormes bibliotheque={b} choisir={choisir} ajouter={x => poserPanier(p => (p.includes(x) ? p : [...p, x]))} parPage={24} compact />
      {panier.length ? (
        <div className="panier">
          <span className="aide">{panier.length} dans le panier : {panier.map(x => x.nom).join(', ')}</span>
          <div className="boutons">
            <button type="button" className="primaire" onClick={insererPanier}>Insérer en grille</button>
            <button type="button" className="discret" onClick={() => poserPanier([])}>Vider</button>
          </div>
        </div>
      ) : <p className="aide">Un clic insère au centre ; « + » met dans le panier pour insérer plusieurs formes en grille.</p>}
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
    <div className="peinture" role="group" aria-label={libelle}>
      <span className="peinture-titre">{libelle}{mixte ? <span className="aide"> · mixte</span> : null}</span>
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
    </div>
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
