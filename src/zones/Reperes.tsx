// Les reperes sur la toile (ADR-0038) : des lignes du document, horizontales et verticales, qu'on prend a la souris pour les
// deplacer (aimantees comme un tirage), qu'on retire en les glissant hors de la toile ou par Suppr, et qu'un double-clic ouvre
// dans le panneau des reperes, champ a la main, pour les poser a une valeur exacte. Verrouilles, ils ne se prennent plus ;
// masques, ils ne se dessinent plus (le document les garde). Ce qui se calcule est pur (engine/edition/reperes.ts).

import { useEffect, useId, useRef, useState, type MouseEvent as ME, type PointerEvent as PE, type RefObject } from 'react';
import type { AxeRepere, DessinSvg } from '../engine/editionSvg.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { nomRepere, useActionsRegles, useRegles, type RepereDesigne } from './contexteRegles.js';
import { lireValeur, texteValeur } from './graduations.js';
import { epaisseurRegle, useAimantRepere } from './Regles.js';
import { useTactile } from './Vue.js';
import { Icone } from './icones.js';
import { arrondi } from './aidesEditeur.js';
import { t } from '../util/i18n.js';

/** Les reperes en lignes, dans le repere du plan (sous la transformation de la vue). `toile` sert a savoir ou le pointeur est lache. */
export function CoucheReperes({ toile, svgRef }: { toile: RefObject<HTMLDivElement | null>; svgRef: RefObject<SVGSVGElement | null> }) {
  const mo = useDessin(), ui = useInterface(), rg = useRegles(), arg = useActionsRegles(), ac = useActions();
  const tactile = useTactile(), aimanter = useAimantRepere();
  const geste = useRef<{ r: RepereDesigne; base: DessinSvg; cle: string; id: number; bouge: boolean; x0: number; y0: number; valeur: number } | null>(null);
  // Le groupe des reperes prend le pointeur pendant un glisser : la ligne glissee change de valeur, donc d'element, a chaque pas.
  const groupe = useRef<SVGGElement>(null), dernier = useRef<RepereDesigne | null>(null);
  // Un appui ailleurs sur la toile rend le repere choisi : la selection de formes reprend la main.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const appui = (e: PointerEvent) => { if (!(e.target instanceof Element && e.target.closest('[data-repere]'))) arg.choisir(null); };
    svg.addEventListener('pointerdown', appui, true);
    return () => svg.removeEventListener('pointerdown', appui, true);
  }, [svgRef, arg]);
  if (!rg.reperesVisibles) return null;
  const reperes = mo.dessin.reperes, z = ui.vues.vue.zoom, [vx, vy, vl, vh] = mo.dessin.vb;
  // Des lignes assez longues pour traverser l'ecran au plus petit zoom : cinquante plans de chaque cote.
  const etendue = 50 * Math.max(vl, vh), cible = (tactile ? 24 : 10) / z;
  const versPlan = (e: { clientX: number; clientY: number }, axe: AxeRepere): number => {
    const r = toile.current?.getBoundingClientRect(), v = ui.vues.vue;
    if (!r) return 0;
    return axe === 'h' ? (e.clientY - r.top - v.y) / v.zoom : (e.clientX - r.left - v.x) / v.zoom;
  };
  /** Lache hors de la toile, ou sur une regle : le repere s'en va. */
  const dehors = (e: { clientX: number; clientY: number }): boolean => {
    const r = toile.current?.getBoundingClientRect();
    if (!r) return false;
    const marge = rg.regles ? epaisseurRegle(tactile) : 0;
    return e.clientX < r.left + marge || e.clientX > r.right || e.clientY < r.top + marge || e.clientY > r.bottom;
  };

  const appuyer = (r: RepereDesigne) => (e: PE<SVGLineElement>) => {
    if (rg.verrouilles || e.button !== 0) return;
    e.stopPropagation();
    try { groupe.current?.setPointerCapture(e.pointerId); } catch { /* sans capture, le geste suit tant que le pointeur reste sur un repere */ }
    arg.choisir(r);
    dernier.current = r;
    geste.current = { r, base: mo.dessin, cle: ac.nouvelleCle(), id: e.pointerId, bouge: false, x0: e.clientX, y0: e.clientY, valeur: r.valeur };
  };
  const bouger = (e: PE<SVGGElement>) => {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    e.stopPropagation();
    if (!g.bouge && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 3) return;
    g.bouge = true;
    g.valeur = aimanter(g.r.axe, versPlan(e, g.r.axe));
    arg.deplacer(g.r, g.valeur, { base: g.base, cle: g.cle });
    const t = toile.current?.getBoundingClientRect();
    arg.poserEtiquette(t ? { x: e.clientX - t.left, y: e.clientY - t.top, texte: texteValeur(g.valeur, rg.unite) } : null);
  };
  const lacher = (e: PE<SVGGElement>) => {
    const g = geste.current;
    if (!g || g.id !== e.pointerId) return;
    e.stopPropagation();
    geste.current = null;
    arg.poserEtiquette(null);
    if (!g.bouge) { ac.dire(t('{repere} choisi : Suppr le retire, les flèches le déplacent, Entrée ouvre son champ.', { repere: nomRepere(g.r, rg.unite) })); return; }
    if (e.type === 'pointercancel') { ac.annulerGeste(g.cle); return; }
    if (dehors(e)) arg.supprimer(g.r, { base: g.base, cle: g.cle });
    else ac.dire(nomRepere({ axe: g.r.axe, valeur: Number(g.valeur.toFixed(3)) }, rg.unite) + '.');
    ac.finir();
  };
  // Le double-clic arrive au groupe (qui avait le pointeur) : il vise le dernier repere pris.
  const doubleClic = (e: ME<SVGGElement>) => { e.stopPropagation(); const r = dernier.current; if (r && !rg.verrouilles) arg.ouvrir('reperes', r); };

  const ligne = (axe: AxeRepere, valeur: number, classe: string, actif: boolean, rang: number) => {
    const r: RepereDesigne = { axe, valeur }, choisi = rg.choisi?.axe === axe && rg.choisi.valeur === valeur;
    const bouts = axe === 'h' ? { x1: vx - etendue, x2: vx + vl + etendue, y1: valeur, y2: valeur } : { x1: valeur, x2: valeur, y1: vy - etendue, y2: vy + vh + etendue };
    return (
      <g key={classe + axe + rang} data-repere={axe + ':' + valeur} className={classe + (choisi ? ' choisi' : '') + (rg.verrouilles ? ' verrouille' : '')}>
        {choisi ? <line className="repere-halo" {...bouts} pointerEvents="none" /> : null}
        <line className="repere-trait" {...bouts} pointerEvents="none" />
        {actif && !rg.verrouilles ? (
          <line className={'repere-cible repere-cible-' + axe} {...bouts} strokeWidth={cible} pointerEvents="stroke"
            onPointerDown={appuyer(r)} />
        ) : null}
      </g>
    );
  };
  return (
    <g className="reperes" aria-hidden="true" ref={groupe} onPointerMove={bouger} onPointerUp={lacher} onPointerCancel={lacher} onDoubleClick={doubleClic}>
      {reperes?.h.map((v, i) => ligne('h', v, 'repere', true, i))}
      {reperes?.v.map((v, i) => ligne('v', v, 'repere', true, i))}
      {rg.tirage ? ligne(rg.tirage.axe, rg.tirage.valeur, 'repere tire', false, 0) : null}
    </g>
  );
}

/** Une ligne du panneau : le repere, son champ (Entree pose la valeur, Echap la rend), le bouton qui le retire. */
function LigneRepere({ r, focus }: { r: RepereDesigne; focus: boolean }) {
  const rg = useRegles(), arg = useActionsRegles(), ac = useActions();
  const lu = (v: number) => String(arrondi(rg.unite.vers(v)));
  const [texte, poserTexte] = useState(lu(r.valeur));
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { poserTexte(lu(r.valeur)); }, [r.valeur, rg.unite]);
  useEffect(() => { if (focus) { champ.current?.focus(); champ.current?.select(); } }, [focus]);
  const valider = () => {
    const v = lireValeur(texte, rg.unite);
    if (v === null) { poserTexte(lu(r.valeur)); ac.dire(t('Donnez une valeur lisible, en {unite}.', { unite: t(rg.unite.long) })); return; }
    if (Number(v.toFixed(3)) === r.valeur) return;
    arg.deplacer(r, v);
    ac.dire(nomRepere({ axe: r.axe, valeur: Number(v.toFixed(3)) }, rg.unite) + '.');
  };
  const horizontal = r.axe === 'h', unite = t(rg.unite.long);
  return (
    <li className="ligne-repere">
      <label className="champ-ligne nombre">
        <span>{horizontal ? t('Horizontal') : t('Vertical')}</span>
        <input ref={champ} type="text" inputMode="decimal" value={texte} aria-label={horizontal ? t('Repère horizontal, en {unite}', { unite }) : t('Repère vertical, en {unite}', { unite })}
          onChange={e => poserTexte(e.target.value)} onBlur={valider}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); valider(); } else if (e.key === 'Escape' && texte !== lu(r.valeur)) { e.stopPropagation(); poserTexte(lu(r.valeur)); } }} />
        {rg.unite.nom ? <span className="unite">{t(rg.unite.nom)}</span> : null}
      </label>
      <button type="button" className="icone-bouton" aria-label={t('Retirer le {repere}', { repere: nomRepere(r, rg.unite).toLowerCase() })} title={t('Retirer ce repère')} onClick={() => arg.supprimer(r)}><Icone nom="supprimer" /></button>
    </li>
  );
}

/**
 * Le panneau des reperes : chaque repere et son champ, l'ajout d'un repere a une valeur exacte, au clavier comme a la souris. Il
 * flotte sur la toile sans la bloquer (on continue d'y tirer et d'y glisser des reperes) ; Echap le ferme et rend la toile.
 */
export function PanneauReperes({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const mo = useDessin(), rg = useRegles(), arg = useActionsRegles(), ac = useActions();
  const titre = useId(), racine = useRef<HTMLDivElement>(null);
  const [axe, poserAxe] = useState<AxeRepere>('h');
  const [valeur, poserValeur] = useState('');
  const ouvert = rg.panneau === 'reperes';
  // A l'ouverture sans repere a viser, le focus va au champ d'ajout.
  useEffect(() => { if (ouvert && !rg.focusRepere) racine.current?.querySelector<HTMLInputElement>('.ajout-repere input')?.focus(); }, [ouvert, rg.focusRepere]);
  if (!ouvert) return null;
  const fermer = () => { arg.ouvrir(null); svgRef.current?.focus(); };
  const ajouter = () => {
    const v = lireValeur(valeur, rg.unite);
    if (v === null) { ac.dire(t('Donnez une valeur lisible, en {unite}.', { unite: t(rg.unite.long) })); return; }
    arg.ajouter(axe, v);
    poserValeur('');
  };
  const r = mo.dessin.reperes, tous: RepereDesigne[] = [...(r?.h ?? []).map(v => ({ axe: 'h' as const, valeur: v })), ...(r?.v ?? []).map(v => ({ axe: 'v' as const, valeur: v }))];
  const vise = rg.focusRepere;
  return (
    <div className="panneau-flottant panneau-reperes" role="dialog" aria-labelledby={titre} ref={racine}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); } }}>
      <div className="panneau-flottant-tete">
        <h2 id={titre}>{t('Repères')}</h2>
        <button type="button" className="icone-bouton" aria-label={t('Fermer le panneau des repères')} title={t('Fermer (Échap)')} onClick={fermer}><Icone nom="fermer" /></button>
      </div>
      {tous.length ? (
        <ul className="liste-reperes">
          {/* Une ligne par rang dans son axe, pas par valeur : poser une valeur ne remonte pas le champ, qui garde ainsi son focus. */}
          {tous.map((x, i) => <LigneRepere key={x.axe + (x.axe === 'h' ? i : i - (r?.h.length ?? 0))} r={x} focus={!!vise && vise.axe === x.axe && Math.abs(vise.valeur - x.valeur) < 1e-9} />)}
        </ul>
      ) : <p className="aide">{t('Aucun repère : tirez-en un depuis une règle, ou posez-le ici à une valeur exacte.')}</p>}
      <div className="ajout-repere">
        <label className="champ-ligne">
          <span>{t('Ajouter')}</span>
          <select value={axe} onChange={e => poserAxe(e.target.value === 'v' ? 'v' : 'h')} aria-label={t('Sens du repère à ajouter')}>
            <option value="h">{t('Horizontal')}</option>
            <option value="v">{t('Vertical')}</option>
          </select>
        </label>
        <label className="champ-ligne nombre">
          <span>{axe === 'h' ? t('À la hauteur') : t('À l’abscisse')}</span>
          <input type="text" inputMode="decimal" value={valeur} placeholder={rg.unite.nom ? t(rg.unite.nom) : t('unités')} onChange={e => poserValeur(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } }} />
        </label>
        <button type="button" onClick={ajouter}>{t('Poser le repère')}</button>
      </div>
      <p className="aide">{t('Glisser un repère hors de la toile le retire ; Suppr retire le repère choisi.')}</p>
    </div>
  );
}
