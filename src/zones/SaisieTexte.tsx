// La saisie d'un texte sur la toile (ADR-0027), comme dans un traitement de texte : un clic de l'outil Texte pose un point
// d'insertion et l'on tape la ; un double-clic (ou Entree) sur un texte pose le rouvre, le curseur au bon endroit. Les lettres
// apparaissent sur la toile au fil de la frappe, composees par le moteur en contours ; le curseur et la selection sont
// dessines d'apres les positions que la composition connait (engine/texte/curseur.ts).
//
// Un vrai <textarea>, transparent et pose sur le texte, porte le focus, la selection, le presse-papiers, la saisie des
// accents (IME) et l'accessibilite ; il ne recoit pas le pointeur : la toile lui passe les clics (Gestes.ts, par la poignee
// du contexte). Entree va a la ligne ; Echap, Ctrl+Entree ou un clic hors du texte terminent la saisie, et le texte reste
// vivant. Un texte vide a la fin n'est pas cree (ou, deja pose, il est retire, Ctrl+Z le rend). Chaque suite de frappe est un
// seul geste de l'historique, fondu par sa cle ; Ctrl+Z dans le champ defait la frappe et l'on continue de taper.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from 'react';
import { supprimer, type Matrice, type TexteVivant } from '../engine/editionSvg.js';
import {
  boiteMiseEnPage, coinsDansPlan, curseurAuIndex, dansLeTexte, depuisPlan, indexAuPoint, indexVertical, miseEnPage, motAutour, rectanglesSelection, versPlan, xAuIndex,
  type MiseEnPage, type PointTexte
} from '../engine/texte/curseur.js';
import { natureDuTexte, peintureDuTexte } from '../engine/texte/vivant.js';
import { composerDispose, peutPorter } from '../engine/texte/disposition.js';
import { boitePose, indexAuPointPose, indexVerticalPose, presDuTexte, selectionPose, type Pose } from '../engine/texte/pose.js';
import { largeurTrait, policeDe } from './actionsTexte.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useSaisie, type Saisie } from './contexteSaisie.js';
import { usePolices } from './contexteTexte.js';
import { dessine, frapper, PHRASE_DEBUT_SAISIE, PHRASE_POLICES_EN_CHARGEMENT, phraseFinSaisie, policeNouveauTexte, tailleNouveauTexte, texteNeuf } from './saisie.js';
import { t } from '../util/i18n.js';

export function SaisieTexte({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const sx = useSaisie();
  return sx.saisie ? <SaisieOuverte key={sx.saisie.rang} saisie={sx.saisie} svgRef={svgRef} /> : null;
}

type Plage = readonly [number, number, 'forward' | 'backward' | 'none'];

/** Le texte en saisie, sa police et sa mise en page : ce que la toile dessine et ce que le curseur lit. */
function useTexteSaisi(saisie: Saisie, id: string | null, valeur: string) {
  const mo = useDessin(), sx = useSaisie(), { polices } = usePolices();
  const forme = id ? mo.dessin.formes.find(f => f.id === id) : undefined;
  const police = forme ? policeDe(forme, polices) : policeNouveauTexte(sx.nouveau, polices);
  const taille = tailleNouveauTexte(sx.nouveau, mo.dessin.vb);
  const t: TexteVivant | null = forme?.texte ? { ...forme.texte, texte: valeur } : saisie.point && police ? texteNeuf(valeur, saisie.point, sx.nouveau, taille, police) : null;
  // La mise en page ne depend que de ce qui compose : on ne la refait pas a chaque rendu de l'editeur.
  const cle = t ? JSON.stringify([t.texte, t.taille, t.interlettrage, t.interligne, t.alignement, t.ligatures, t.matrice, t.trace ?? '', t.disposition ?? null]) : '';
  const mep = useMemo(() => (t && police ? miseEnPage(t, police.glyphes) : null), [cle, police]);
  // Un texte pose sur ou dans une forme (ADR-0031) : le curseur suit les lettres posees, lu sur la pose (les memes calculs que ses contours).
  const p = t?.disposition, base = p ? mo.dessin.formes.find(f => f.id === p.forme) : undefined;
  const pose = useMemo<Pose | null>(() => (t && p && police && id && peutPorter(base, id) ? composerDispose(t, base, police.glyphes).pose : null), [cle, police, base, id]);
  const absente = !!forme && polices !== null && !police;
  return { forme, police, polices, t, mep, pose, taille, absente };
}

/** Ce que la saisie garde d'un rendu a l'autre sans redessiner : la frappe en cours, la selection a la souris, la fin. */
interface Memoire {
  cle: string | null; creeDansRun: boolean; cree: string | null; applique: string; fini: boolean;
  ancre: number; glisse: boolean; colonne: number | null; clic: PointTexte | null; valeur: string; id: string | null;
}

/** La frappe : chaque changement du champ recompose le texte (ou cree la forme a la premiere lettre), en un geste par suite. */
function useFrappe(saisie: Saisie, svgRef: RefObject<SVGSVGElement | null>) {
  const mo = useDessin(), ac = useActions(), ui = useInterface(), sx = useSaisie();
  const debut = useRef(mo.dessin.formes.find(f => f.id === saisie.id)?.texte?.texte ?? '').current;
  const [id, poserIdBrut] = useState(saisie.id);
  const [valeur, poserValeur] = useState(debut);
  const r = useRef<Memoire>({ cle: null, creeDansRun: false, cree: null, applique: debut, fini: false, ancre: 0, glisse: false, colonne: null, clic: saisie.clic, valeur: debut, id: saisie.id });
  const derniers = useRef({ dessin: mo.dessin, cleH: mo.h.cle });
  derniers.current = { dessin: mo.dessin, cleH: mo.h.cle };
  const ts = useTexteSaisi(saisie, id, valeur);
  const poserId = (v: string | null) => { r.current.id = v; poserIdBrut(v); sx.lier(v); };
  const changerValeur = (v: string) => { r.current.valeur = v; poserValeur(v); };

  const taper = (v: string) => {
    changerValeur(v);
    const R = r.current, p = ts.police;
    R.colonne = null;
    if (!p) return;
    // Un autre geste s'est intercale (la barre de texte) : la frappe qui reprend est une nouvelle entree d'historique.
    if (R.cle !== null && derniers.current.cleH !== R.cle) { R.cle = null; R.creeDansRun = false; }
    const neuf = !R.id && saisie.point ? texteNeuf(v, saisie.point, sx.nouveau, ts.taille, p) : null;
    const res = frapper(derniers.current.dessin, { id: R.id, neuf }, v, p, peintureDuTexte(neuf ? natureDuTexte(neuf) : p.nature, ui.style, largeurTrait(ts.taille, ui.profil)), ui.profil);
    sx.poserVide(!res.dessine);
    if (res.dessin === derniers.current.dessin) return;
    R.cle ??= ac.nouvelleCle();
    if (!R.id && res.id) { R.creeDansRun = true; R.cree = res.id; poserId(res.id); }
    ac.appliquer(() => res.dessin, R.cle);
    derniers.current = { dessin: res.dessin, cleH: R.cle };
    R.applique = v;
  };

  const terminer = (focusToile: boolean) => {
    const R = r.current;
    if (R.fini) return;
    R.fini = true;
    const f = R.id ? derniers.current.dessin.formes.find(x => x.id === R.id) : undefined, p = ts.police;
    const vide = !f?.texte || !R.valeur.trim() || (p !== null && !dessine({ ...f.texte, texte: R.valeur }, p));
    let retire = false;
    if (vide && f) {
      // Cree pendant cette frappe : on defait la creation, rien ne reste. Deja la : on le retire, dans la meme entree.
      if (R.creeDansRun && R.cle !== null && derniers.current.cleH === R.cle) ac.annulerGeste(R.cle);
      else { ac.appliquer(d => supprimer(d, [f.id]), R.cle ?? ac.nouvelleCle()); retire = true; }
    }
    ac.finir();
    sx.fermer();
    ac.dire(!p && R.valeur.trim() ? t(PHRASE_POLICES_EN_CHARGEMENT) : phraseFinSaisie({ cree: R.cree !== null, retire, vide, avant: debut, apres: R.valeur, police: p?.nom ?? '' }));
    if (!vide && f) { ac.choisir([f.id]); if (ui.outil !== 'selection') ac.poserOutil('selection'); }
    if (focusToile) svgRef.current?.focus({ preventScroll: true });
  };

  /** Ctrl+Z ou Ctrl+Y dans le champ : la frappe en cours se clot, l'historique recule ou avance, et la saisie suit le dessin. */
  const historique = (refaire: boolean) => {
    r.current.cle = null;
    r.current.creeDansRun = false;
    ac.finir();
    if (refaire) ac.refaire(); else ac.defaire();
  };

  // Le dessin change sans la frappe (Ctrl+Z, Ctrl+Y, un autre geste) : la saisie le suit, ou se ferme si son texte n'en est plus un.
  useEffect(() => {
    const R = r.current, d = mo.dessin;
    if (R.fini) return;
    if (!R.id) {
      const g = R.cree ? d.formes.find(x => x.id === R.cree) : undefined;
      if (g?.texte) { poserId(g.id); R.applique = g.texte.texte; changerValeur(g.texte.texte); sx.poserVide(false); }
      return;
    }
    const f = d.formes.find(x => x.id === R.id);
    if (!f && saisie.point) { poserId(null); R.applique = ''; changerValeur(''); sx.poserVide(true); return; }
    if (!f?.texte) { R.fini = true; sx.fermer(); return; }
    if (f.texte.texte !== R.applique) { R.applique = f.texte.texte; changerValeur(f.texte.texte); sx.poserVide(false); }
  }, [mo.dessin]);

  // Les fontes arrivent apres les premieres lettres (le premier clic les charge) : ce qui est deja tape se compose.
  useEffect(() => { if (ts.police && !r.current.id && saisie.point && r.current.valeur) taper(r.current.valeur); }, [ts.police]);

  return { r, ts, valeur, taper, terminer, historique };
}

const points = (q: readonly PointTexte[]): string => q.map(p => p[0] + ',' + p[1]).join(' ');

/** Ce que la toile dessine d'un texte pose en saisie (ADR-0031) : la boite de ses curseurs, la selection lettre a lettre, le curseur tourne. */
function geometriePose(p: Pose, plage: Plage) {
  const b = boitePose(p, 0.12), [s, e, sens] = plage;
  const cadre: PointTexte[] = [[b.x, b.y], [b.x + b.l, b.y], [b.x + b.l, b.y + b.h], [b.x, b.y + b.h]];
  const c = s === e ? p.carets[Math.min(p.carets.length - 1, sens === 'backward' ? s : e)] ?? null : null;
  return { cadre, selection: selectionPose(p, s, e), curseur: c ? [c[0], c[1]] as const : null };
}

/** Ce que la toile dessine de la saisie, dans le plan : le cadre du texte, la selection, le curseur. */
function geometrie(m: MiseEnPage, mat: Matrice, plage: Plage) {
  const b = boiteMiseEnPage(m), marge = 0.12 * m.taille, large = Math.max(0, 0.5 * m.taille - b.l) / 2;
  const cadre = coinsDansPlan(mat, { x: b.x - marge - large, y: b.y - marge, l: b.l + 2 * (marge + large), h: b.h + 2 * marge });
  const [s, e, sens] = plage;
  const selection = rectanglesSelection(m, s, e).map(r => coinsDansPlan(mat, r));
  const c = s === e ? curseurAuIndex(m, sens === 'backward' ? s : e) : null;
  return { cadre, selection, curseur: c ? [versPlan(mat, [c.x, c.y1]), versPlan(mat, [c.x, c.y2])] as const : null };
}

function SaisieOuverte({ saisie, svgRef }: { saisie: Saisie; svgRef: RefObject<SVGSVGElement | null> }) {
  const ui = useInterface(), ac = useActions(), sx = useSaisie();
  const { r, ts, valeur, taper, terminer, historique } = useFrappe(saisie, svgRef);
  const champ = useRef<HTMLTextAreaElement>(null), aide = useId();
  const [plage, poserPlage] = useState<Plage>([valeur.length, valeur.length, 'none']);
  const lirePlage = () => { const c = champ.current; if (c) poserPlage([c.selectionStart, c.selectionEnd, c.selectionDirection === 'backward' ? 'backward' : 'forward']); };
  const choisirPlage = (a: number, b: number) => {
    const c = champ.current;
    if (!c) return;
    c.focus({ preventScroll: true });
    c.setSelectionRange(Math.min(a, b), Math.max(a, b), b < a ? 'backward' : 'forward');
    lirePlage();
  };
  const versTexte = (p: PointTexte): number | null => {
    if (ts.pose) return indexAuPointPose(ts.pose, p);
    const q = ts.mep && ts.t ? depuisPlan(ts.t.matrice, p) : null;
    return q && ts.mep ? indexAuPoint(ts.mep, q) : null;
  };
  /** Le point tombe-t-il dans le texte (sa boite, ou pres de ses lettres posees) ? */
  const dedans = (p: PointTexte): boolean => (ts.pose ? presDuTexte(ts.pose, p) : !!ts.mep && !!ts.t && dansLeTexte(ts.mep, ts.t.matrice, p));
  const ancreActuelle = () => { const c = champ.current; return c ? (c.selectionDirection === 'backward' ? c.selectionEnd : c.selectionStart) : 0; };

  // La toile passe ses gestes a la saisie tant qu'elle est ouverte.
  useLayoutEffect(() => {
    sx.poignee.current = {
      appuyer: (p, etendre) => {
        const i = dedans(p) ? versTexte(p) : null;
        if (i === null) return false;
        const R = r.current;
        R.ancre = etendre ? ancreActuelle() : i;
        R.glisse = true;
        R.colonne = null;
        choisirPlage(R.ancre, i);
        return true;
      },
      bouger: p => { const i = r.current.glisse ? versTexte(p) : null; if (i !== null) choisirPlage(r.current.ancre, i); },
      lacher: () => { r.current.glisse = false; },
      doubleClic: p => {
        const i = dedans(p) ? versTexte(p) : null;
        if (i === null) return false;
        const [a, b] = motAutour(r.current.valeur, i);
        choisirPlage(a, b);
        return true;
      },
      terminer
    };
  });
  // Retiree avant que la saisie suivante ne pose la sienne (un effet de mise en page se nettoie avant les suivants).
  useLayoutEffect(() => () => { sx.poignee.current = null; }, [sx.poignee]);

  useLayoutEffect(() => {
    const c = champ.current;
    if (!c) return;
    c.focus({ preventScroll: true });
    c.setSelectionRange(c.value.length, c.value.length);
    lirePlage();
    ac.annoncer(t(PHRASE_DEBUT_SAISIE));
  }, []);
  // Un clic dans un texte deja pose : le curseur y va des que la mise en page est connue (la fonte peut arriver apres).
  useEffect(() => {
    const clic = r.current.clic, i = clic ? versTexte(clic) : null;
    if (i !== null) { r.current.clic = null; choisirPlage(i, i); }
  }, [ts.mep, ts.pose]);
  useFinParLeFocus(champ, () => terminer(false));
  useEffect(() => {
    const suivre = () => { if (document.activeElement === champ.current) lirePlage(); };
    document.addEventListener('selectionchange', suivre);
    return () => document.removeEventListener('selectionchange', suivre);
  }, []);

  const touche = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === 'Escape' || (e.key === 'Enter' && mod)) { e.preventDefault(); e.stopPropagation(); terminer(true); return; }
    if (e.key === 'F10' && e.altKey) {
      e.preventDefault();
      champ.current?.closest('.editeur-cadre')?.querySelector<HTMLElement>('.barre-texte select:not(:disabled), .barre-texte input:not(:disabled), .barre-texte button:not(:disabled)')?.focus();
      return;
    }
    if (mod && (k === 'z' || k === 'y')) { e.preventDefault(); historique(k === 'y' || e.shiftKey); return; }
    const m = ts.mep, c = champ.current;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !mod && !e.altKey && ts.pose && c) {
      // Un texte pose : la fleche mene a la ligne voisine des lettres posees (sur un trace, au debut ou a la fin).
      e.preventDefault();
      const arriere = c.selectionDirection === 'backward', focus = arriere ? c.selectionStart : c.selectionEnd, ancre = arriere ? c.selectionEnd : c.selectionStart;
      const i = indexVerticalPose(ts.pose, focus, e.key === 'ArrowUp' ? -1 : 1);
      if (e.shiftKey) choisirPlage(ancre, i); else choisirPlage(i, i);
      return;
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !mod && !e.altKey && m && c) {
      // Une ligne de la toile n'a pas la largeur d'une ligne du champ : la fleche suit l'abscisse des lettres dessinees.
      e.preventDefault();
      const arriere = c.selectionDirection === 'backward', focus = arriere ? c.selectionStart : c.selectionEnd, ancre = arriere ? c.selectionEnd : c.selectionStart;
      r.current.colonne ??= xAuIndex(m, focus);
      const i = indexVertical(m, focus, e.key === 'ArrowUp' ? -1 : 1, r.current.colonne);
      if (e.shiftKey) choisirPlage(ancre, i); else choisirPlage(i, i);
      return;
    }
    r.current.colonne = null;
  };

  const { zoom, x: vx, y: vy } = ui.vues.vue;
  const geo = ts.pose ? geometriePose(ts.pose, plage) : ts.mep && ts.t ? geometrie(ts.mep, ts.t.matrice, plage) : null;
  const position = positionChamp(geo?.cadre ?? null, saisie.point ?? ts.forme?.texte?.matrice ?? null, ui.vues.vue, svgRef.current);
  const texteAide = ts.absente ? t('Police absente : choisissez-en une dans l’inspecteur.') : !ts.police ? t('Chargement des polices…')
    : t('Entrée : à la ligne. Échap ou Ctrl+Entrée : terminer. Alt+F10 : la barre de texte. Ctrl+Z annule la frappe.');
  return (
    <>
      <svg className="saisie-calque" aria-hidden="true" focusable="false">
        <g transform={`translate(${vx} ${vy}) scale(${zoom})`}>
          {geo ? <polygon className="cadre-saisie" points={points(geo.cadre)} /> : null}
          {geo?.selection.map((q, i) => <polygon key={i} className="selection-saisie" points={points(q)} />)}
          {geo?.curseur ? <line key={plage[0] + ':' + valeur.length} className="curseur-saisie" x1={geo.curseur[0][0]} y1={geo.curseur[0][1]} x2={geo.curseur[1][0]} y2={geo.curseur[1][1]} /> : null}
        </g>
      </svg>
      <textarea ref={champ} className="saisie-champ" style={position} value={valeur} wrap="off" spellCheck={false} autoComplete="off" readOnly={ts.absente}
        aria-label={t('Texte sur la toile')} aria-describedby={aide} onChange={e => taper(e.target.value)} onKeyDown={touche} onSelect={lirePlage} />
      <span id={aide} className="sr-only">{texteAide}</span>
    </>
  );
}

/**
 * Ou poser le champ invisible : sur le texte, a l'ecran (la fenetre de saisie des accents s'ouvre la), borne a la toile pour
 * que le navigateur n'ait jamais a la faire defiler pour montrer le curseur.
 */
function positionChamp(cadre: readonly PointTexte[] | null, repere: PointTexte | Matrice | null, vue: { zoom: number; x: number; y: number }, svg: SVGSVGElement | null): CSSProperties {
  const coins: readonly PointTexte[] = cadre ?? (repere ? [repere.length === 2 ? repere : [repere[4], repere[5]]] : [[0, 0]]);
  const xs = coins.map(p => p[0] * vue.zoom + vue.x), ys = coins.map(p => p[1] * vue.zoom + vue.y);
  const W = svg?.clientWidth ?? 0, H = svg?.clientHeight ?? 0;
  const l = Math.min(Math.max(1, Math.max(...xs) - Math.min(...xs)), Math.max(1, W)), h = Math.min(Math.max(1, Math.max(...ys) - Math.min(...ys)), Math.max(1, H));
  return { left: Math.max(0, Math.min(Math.min(...xs), W - l)), top: Math.max(0, Math.min(Math.min(...ys), H - h)), width: l, height: h };
}

/**
 * La saisie se termine quand le focus la quitte pour autre chose que la barre de texte : Tab, un clic dans un panneau, un menu
 * de la barre principale. Une fenetre qui perd le focus (une autre application) ne la termine pas : le champ le garde.
 */
function useFinParLeFocus(champ: RefObject<HTMLTextAreaElement | null>, finir: () => void) {
  const fin = useRef(finir);
  fin.current = finir;
  useEffect(() => {
    const permis = (e: EventTarget | null) => e instanceof Element && (e === champ.current || !!e.closest('.barre-texte'));
    const entre = (e: FocusEvent) => { if (!permis(e.target)) fin.current(); };
    // Un clic sur un fond qui ne prend pas le focus le rend au corps de la page : rien n'entre, on regarde ou il est tombe.
    const sort = () => window.setTimeout(() => {
      const actif = document.activeElement;
      if (document.hasFocus() && (actif === null || actif === document.body)) fin.current();
    }, 0);
    const c = champ.current;
    document.addEventListener('focusin', entre);
    c?.addEventListener('blur', sort);
    return () => { document.removeEventListener('focusin', entre); c?.removeEventListener('blur', sort); };
  }, [champ]);
}
