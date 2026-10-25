// Le texte pose sur ou dans une forme, sur la toile (ADR-0031) : le choix de la forme qui le portera (un clic, ou Tab puis Entree,
// Echap abandonne), le guide de la forme d'un texte pose choisi (son trace en tirets, meme masquee), la poignee de son point de
// depart (glisser le long du trace, ou les fleches : un curseur de reglage), et le suivi du lien (les glyphes donnees aux verbes
// de l'editeur pour recomposer un texte quand sa forme change ; ce qui se dit quand sa forme disparait).

import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as PE, type RefObject } from 'react';
import type { Forme } from '../engine/editionSvg.js';
import { departVers, pointDeDepart, traceFerme } from '../engine/texte/surTrace.js';
import { projeter, traceDe } from '../engine/texte/trace.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSaisie, type ChoixForme } from './contexteSaisie.js';
import { usePolices, useTexte } from './contexteTexte.js';
import { usePrise } from './PriseToile.js';
import { candidatesPour, depassementDe, useDisposition } from './actionsDisposition.js';
import { policeDe } from './actionsTexte.js';
import { PHRASE_CHOIX_ANNULE, phraseCandidate, phraseDepart, phraseDepassement, phraseFormePerdue } from './phrasesDisposition.js';
import { useTactile } from './Vue.js';

/**
 * Le suivi du lien des textes poses : donne aux verbes de l'editeur les glyphes des polices chargees (un texte se recompose quand
 * sa forme change, dans la meme entree d'historique) ; charge les fontes des qu'un texte pose est dans le dessin ; dit quand une
 * forme qui portait des textes disparait (ils redeviennent libres). Sans rendu.
 */
export function SuiviDispositions() {
  const mo = useDessin();
  const lies = mo.dessin.formes.some(f => f.texte?.disposition);
  return <>{lies ? <ChargerPolices /> : null}<Glyphes /><FormesPerdues /></>;
}

/** Demande les fontes (polices.js se charge a la demande) : un texte pose doit pouvoir se recomposer au premier geste. */
function ChargerPolices() {
  usePolices();
  return null;
}

/** Les glyphes des polices chargees, donnees aux verbes de l'editeur a chaque changement de la liste. */
function Glyphes() {
  const ac = useActions(), { polices } = useTexte();
  useEffect(() => {
    ac.poserGlyphes(polices ? p => polices.find(x => x.id === p.id)?.glyphes ?? null : null);
    return () => ac.poserGlyphes(null);
  }, [ac, polices]);
  return null;
}

/** Dit quand une forme qui portait des textes disparait : ses textes sont redevenus libres (suivreDispositions). */
function FormesPerdues() {
  const mo = useDessin(), ac = useActions();
  const avant = useRef(mo.dessin);
  useEffect(() => {
    const a = avant.current, d = mo.dessin;
    avant.current = d;
    if (a === d) return;
    const ids = new Set(d.formes.map(f => f.id));
    const perdus = a.formes.filter(f => {
      const p = f.texte?.disposition;
      if (!p || !a.formes.some(x => x.id === p.forme)) return false;
      const apres = d.formes.find(x => x.id === f.id);
      return !!apres?.texte && !apres.texte.disposition && !ids.has(p.forme);
    });
    if (perdus.length) ac.dire(phraseFormePerdue(perdus));
  }, [mo.dessin, ac]);
  return null;
}

/**
 * Le choix de la forme qui portera le texte : la forme visee (au pointeur, ou au clavier par Tab) recoit le lisere de survol ; un
 * clic ou Entree pose le texte, Echap (ou un clic dans le vide) abandonne. Tab apres la derniere forme abandonne aussi et laisse le
 * focus continuer : le choix ne piege jamais le clavier.
 */
export const ChoixFormeToile = memo(function ChoixFormeToile({ svgRef, chemin }: { svgRef: RefObject<SVGSVGElement | null>; chemin: (f: Forme) => string }) {
  const sx = useSaisie(), c = sx.choixForme;
  return c ? <ChoixOuvert key={c.id + c.mode} choix={c} svgRef={svgRef} chemin={chemin} /> : null;
});

function ChoixOuvert({ choix, svgRef, chemin }: { choix: ChoixForme; svgRef: RefObject<SVGSVGElement | null>; chemin: (f: Forme) => string }) {
  const mo = useDessin(), ac = useActions(), sx = useSaisie(), dz = useDisposition(), prise = usePrise(svgRef);
  const [vise, poserVise] = useState<string | null>(null);
  const candidates = candidatesPour(mo.dessin, choix.id);
  const etat = useRef({ candidates, vise, dz, prise });
  etat.current = { candidates, vise, dz, prise };
  const finir = (focus: boolean) => { sx.poserChoixForme(null); if (focus) svgRef.current?.focus({ preventScroll: true }); };
  const poser = (id: string) => { if (etat.current.dz.poser(choix.id, id, choix.mode)) finir(true); };
  const annuler = () => { ac.dire(PHRASE_CHOIX_ANNULE); finir(false); };

  // Le texte disparait (Ctrl+Z, suppression) : le choix n'a plus d'objet.
  useEffect(() => { if (!mo.dessin.formes.some(f => f.id === choix.id && f.texte)) sx.poserChoixForme(null); }, [mo.dessin, choix.id, sx]);

  // La toile passe ses clics au choix : la premiere forme visee qui peut porter le texte, sinon (le vide) on abandonne.
  useEffect(() => {
    sx.viserForme.current = ids => {
      const ok = ids.find(id => etat.current.candidates.some(f => f.id === id));
      if (ok) poser(ok); else if (ids.length) etat.current.dz.poser(choix.id, ids[0] ?? '', choix.mode); else annuler();
    };
    return () => { sx.viserForme.current = null; };
  });

  // Le pointeur vise une forme : le lisere la montre. Le curseur de la toile dit le choix, pose une fois (data-choix-forme).
  useEffect(() => {
    const svg = svgRef.current, toile = svg?.closest('.editeur-toile');
    if (!svg) return;
    toile?.setAttribute('data-choix-forme', choix.mode);
    const bouger = (e: PointerEvent) => {
      const { candidates: cs, prise: pr } = etat.current;
      poserVise(pr.toutes(e).find(id => cs.some(f => f.id === id)) ?? null);
    };
    svg.addEventListener('pointermove', bouger);
    return () => { svg.removeEventListener('pointermove', bouger); toile?.removeAttribute('data-choix-forme'); };
  }, [svgRef, choix.mode]);

  // Au clavier : Tab et Maj+Tab parcourent les formes candidates, Entree pose, Echap abandonne (avant tout autre raccourci).
  useEffect(() => {
    const touche = (e: globalThis.KeyboardEvent) => {
      const { candidates: cs, vise: v } = etat.current;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); annuler(); return; }
      if (e.key === 'Enter' && v) { e.preventDefault(); e.stopPropagation(); poser(v); return; }
      if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!cs.length) { annuler(); return; }
      const i = v ? cs.findIndex(f => f.id === v) : -1, j = i + (e.shiftKey ? -1 : 1);
      const premier = i < 0 ? (e.shiftKey ? cs.length - 1 : 0) : j;
      // Au-dela de la derniere (ou avant la premiere) : le choix se termine, Tab continue son chemin.
      if (premier < 0 || premier >= cs.length) { annuler(); return; }
      e.preventDefault(); e.stopPropagation();
      const f = cs[premier];
      if (!f) return;
      poserVise(f.id);
      ac.annoncer(phraseCandidate(f, premier + 1, cs.length));
    };
    window.addEventListener('keydown', touche, true);
    return () => window.removeEventListener('keydown', touche, true);
  }, [ac]);

  const f = vise ? mo.dessin.formes.find(x => x.id === vise) : undefined;
  return f ? (
    <g pointerEvents="none" aria-hidden="true">
      <path className="lisere-survol-fond" d={chemin(f)} />
      <path className="lisere-survol lisere-choix" d={chemin(f)} />
    </g>
  ) : null;
}

/** Le pas du depart au clavier : un centieme du trace, un dixieme avec Maj (ou Page precedente / suivante). */
const PAS_DEPART = 0.01;

/**
 * Le guide d'un texte pose choisi seul : le trace de sa forme en tirets (meme masquee : on voit ce qui porte le texte), et, sur une
 * forme, la poignee de son point de depart, un curseur de reglage qu'on glisse le long du trace ou qu'on regle aux fleches.
 */
export const GuideDisposition = memo(function GuideDisposition({ svgRef, chemin }: { svgRef: RefObject<SVGSVGElement | null>; chemin: (f: Forme) => string }) {
  const mo = useDessin(), ui = useInterface(), sx = useSaisie();
  const f = mo.formeSeule, p = f?.texte?.disposition;
  const base = p ? mo.dessin.formes.find(x => x.id === p.forme) : undefined;
  if (!f || !p || !base || ui.outil !== 'selection' || sx.choixForme) return null;
  return (
    <g className="guide-disposition">
      <path className="guide-forme" d={chemin(base)} pointerEvents="none" aria-hidden="true" />
      {p.mode === 'sur' && !sx.saisie && !f.verrouille ? <PoigneeDepart texte={f} base={base} depart={p.depart} cote={p.cote} svgRef={svgRef} /> : null}
    </g>
  );
});

function PoigneeDepart({ texte, base, depart, cote, svgRef }: { texte: Forme; base: Forme; depart: number; cote: 'dessus' | 'dessous'; svgRef: RefObject<SVGSVGElement | null> }) {
  const ui = useInterface(), ac = useActions(), dz = useDisposition(), tactile = useTactile();
  const glisse = useRef<{ cle: string; depart: number; fait: ReturnType<typeof dz.regler> } | null>(null);
  const pt = pointDeDepart(base, { depart, cote });
  if (!pt) return null;
  const z = ui.vues.vue.zoom, ferme = traceFerme(base);
  /** Ce qui se dit apres un reglage : le depart, et ce qui depasse le trace s'il y a lieu. */
  const dire = (d: number, fait: ReturnType<typeof dz.regler>) => {
    const reste = fait ? phraseDepassement('sur', depassementDe(fait.dessin, texte.id, fait.police).depasse, 0) : '';
    ac.annoncer(phraseDepart(d) + (reste ? ' ' + reste : ''));
  };
  const versPlan = (e: { clientX: number; clientY: number }): readonly [number, number] => {
    const r = svgRef.current?.getBoundingClientRect(), v = ui.vues.vue;
    return r ? [(e.clientX - r.left - v.x) / v.zoom, (e.clientY - r.top - v.y) / v.zoom] : [0, 0];
  };
  const regler = (d: number, cle: string | null) => dz.regler(texte.id, { depart: d }, cle, true);
  const appuyer = (e: PE<SVGGElement>) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sans capture, le geste suit tant que le pointeur survole la poignee */ }
    glisse.current = { cle: ac.nouvelleCle(), depart, fait: null };
  };
  const bouger = (e: PE<SVGGElement>) => {
    const g = glisse.current, tr = traceDe(base.d);
    if (!g || !tr) return;
    const d = departVers(base, { cote }, projeter(tr, versPlan(e)));
    if (d === g.depart) return;
    g.depart = d;
    g.fait = regler(d, g.cle) ?? g.fait;
  };
  const lacher = () => {
    const g = glisse.current;
    glisse.current = null;
    if (!g) return;
    ac.finir();
    if (g.fait) dire(g.depart, g.fait);
  };
  const touche = (e: KeyboardEvent<SVGGElement>) => {
    const grand = e.shiftKey || e.key === 'PageUp' || e.key === 'PageDown';
    const sens = e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown' ? -1 : 0;
    let d: number | null = null;
    if (sens) d = depart + sens * PAS_DEPART * (grand ? 10 : 1);
    else if (e.key === 'Home') d = 0;
    else if (e.key === 'End') d = ferme ? 1 - PAS_DEPART : 1;
    if (d === null) return;
    e.preventDefault(); e.stopPropagation();
    d = ferme ? d - Math.floor(d) : Math.min(1, Math.max(0, d));
    d = Math.round(d * 10000) / 10000;
    if (ferme && d >= 1) d = 0;
    dire(d, regler(d, null));
  };
  const r = (tactile ? 20 : 12) / z, rv = 5 / z, pourcent = Math.round(depart * 1000) / 10;
  return (
    <g data-depart="" className="poignee-depart-groupe" role="slider" tabIndex={0} aria-label="Départ du texte sur la forme"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={pourcent} aria-valuetext={phraseDepart(depart).replace(/\.$/, '')}
      onPointerDown={appuyer} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher} onKeyDown={touche}>
      <circle className="poignee-depart-cible" cx={pt[0]} cy={pt[1]} r={r} />
      <circle className="poignee-depart-halo" cx={pt[0]} cy={pt[1]} r={rv * 1.9} />
      <circle className="poignee-depart" cx={pt[0]} cy={pt[1]} r={rv} />
    </g>
  );
}

/** Le depassement d'un texte pose, en une phrase (lettres hors du trace, mots hors de la forme) ; vide si tout tient. */
export function useDepassement(texte: Forme | null | undefined): string {
  const mo = useDessin(), { polices } = useTexte();
  const p = texte?.texte?.disposition;
  if (!texte || !p) return '';
  const { depasse, nonPlaces } = depassementDe(mo.dessin, texte.id, policeDe(texte, polices));
  return phraseDepassement(p.mode, depasse, nonPlaces);
}
