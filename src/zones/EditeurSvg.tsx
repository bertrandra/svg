// L'editeur SVG plein ecran : retoucher un dessin vectoriel comme dans un logiciel de dessin.
// Selection, deplacement, mise a l'echelle, points et poignees, outils de trace (rectangle, ellipse,
// etoile, ligne, plume), couleurs d'un nuancier, empilement, alignement, nettoyage du trace,
// insertion depuis la bibliotheque de formes, et un historique qui annule chaque geste. Tout le
// calcul est dans `engine/editionSvg.ts` ; ici, l'affichage et les gestes.
//
// Le composant ne connait aucun magasin : il recoit le SVG, un nuancier facultatif, la bibliotheque
// facultative, et rend le SVG retouche a `enregistrer`. C'est ce qui le rend reutilisable.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { aimanter, boiteDe, ecrireDessin, pasGrille, STYLE_DEFAUT, type DessinSvg, type Forme, type Style } from '../engine/editionSvg.js';
import type { Aimant } from '../engine/transformations.js';
import { annuler, avancer, clore, historique, limitePourTaille, retablir, type Historique } from '../util/historique.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import { Barre, BarreSelection, Bouton, FORMES } from './BarreOutils.js';
import { Calques } from './Calques.js';
import { useClavier } from './Clavier.js';
import { lireDessinMemo } from './lecture.js';
import { useGestes } from './Gestes.js';
import { Inspecteur } from './Inspecteur.js';
import { PanneauDessin } from './PanneauDessin.js';
import { Calque, Grille, surcouche } from './Toile.js';
import { useTactile, useVue } from './Vue.js';
import { actionsEdition } from './actions.js';
import { estHex } from './aidesEditeur.js';
import { garderVersions, idVersion, lireVersions, type Version } from './session.js';
import type { Edition, Outil, Point, Teinte } from './typesEditeur.js';

// Les types que les autres zones lisent ici : ils vivent dans typesEditeur.ts (types seuls, sans cycle).
export type { Edition, Outil, OutilForme, Teinte, Vues } from './typesEditeur.js';

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
  const lu = useMemo(() => lireDessinMemo(svg), [svg]);
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
      ) : <Atelier initial={lu.dessin} ignores={lu.ignores} titre={titre} nom={nom} nuancier={nuancier} bibliotheque={bibliotheque ?? null} fermer={fermer} enregistrer={enregistrer} brouillon={brouillon} />}
    </div>,
    document.body
  );
}

function Atelier({ initial, ignores, titre, nom, nuancier, bibliotheque, fermer, enregistrer, brouillon }: { initial: DessinSvg; ignores: readonly string[]; titre: string; nom: string; nuancier: readonly Teinte[]; bibliotheque: Bibliotheque | 'a-charger' | null; fermer: () => void; enregistrer: (svg: string) => void; brouillon?: ((svg: string) => void) | undefined }) {
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
  // Tant que toutes les formes choisies existent, la selection reste le meme tableau : rien en aval ne se recalcule pendant un geste.
  const sel = useMemo(() => (selection.every(id => presentes.has(id)) ? selection : selection.filter(id => presentes.has(id))), [selection, presentes]);
  const choisies = useMemo(() => new Set(sel), [sel]);
  const formeSeule = sel.length === 1 ? dessin.formes.find(f => f.id === sel[0]) ?? null : null;
  const boite = useMemo(() => boiteDe(dessin, sel), [dessin, sel]);

  const appliquer = useCallback((f: (d: DessinSvg) => DessinSvg, cle: string | null = null) => { poserH(x => { const d = f(x.present); return avancer(x, d, cle, limitePourTaille(d.formes.length)); }); }, []);
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
    h, dessin, sel, choisies, boite, formeSeule, outil, point, nuancier, ignores, bibliotheque, style, trace, presse, grille, aimants, guides, versions, tiroir, pas,
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

function etatParDefaut(ed: Edition): string {
  if (ed.outil === 'plume') return ed.trace.length ? ed.trace.length + ' point' + (ed.trace.length > 1 ? 's' : '') + ' · Entrée ou double-clic ferme le tracé, Retour arrière retire le dernier point, Échap abandonne.' : 'Plume : cliquez les points du tracé.';
  if (FORMES.has(ed.outil)) return 'Glissez sur la toile pour tracer (Maj : proportions).';
  if (ed.sel.length) return ed.sel.length + ' sélectionnée' + (ed.sel.length > 1 ? 's' : '') + (ed.outil === 'selection' ? ' · glissez pour déplacer, les coins pour redimensionner (Maj : proportions)' : '');
  return 'Cliquez une forme, ou tracez un cadre pour en choisir plusieurs.';
}
