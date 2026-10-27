// Le panneau de repetition (ADR-0038) : dupliquer la selection en grille, la repeter autour d'un centre, la retourner en miroir.
// Il flotte sur la toile et montre le resultat en direct : chaque reglage rejoue l'operation pure depuis le dessin d'avant
// l'ouverture, dans une seule entree d'historique (la cle du geste). « Appliquer » la garde et choisit l'original et ses copies ;
// « Annuler » ou Echap la retire. Une modification faite ailleurs pendant l'apercu le garde tel quel et ferme le panneau.

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  axeParDefaut, boiteDe, dupliquerEnGrille, pasGrilleParDefaut, repetitionRadiale, symetrie, type DessinSvg, type ResultatRepetition
} from '../engine/editionSvg.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useActionsRegles, useRegles, type PanneauOutils } from './contexteRegles.js';
import { lireValeur, texteValeur, type UniteRegle } from './graduations.js';
import { Icone } from './icones.js';
import { arrondi } from './aidesEditeur.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';

type Mode = 'grille' | 'radiale' | 'symetrie';
// Une fonction, pas une constante : les libelles se traduisent au rendu, quand le dictionnaire de la langue est pose (ADR-0042).
const modes = (): ReadonlyArray<readonly [Mode, string]> => [['grille', t('Grille')], ['radiale', t('Radiale')], ['symetrie', t('Symétrie')]];
// Les titres sont des cles (ADR-0042) : evalues au chargement, ils restent en francais, et qui les affiche les repasse par `t`.
export const TITRES_REPETITION: Readonly<Record<Mode, string>> = { grille: t('Dupliquer en grille'), radiale: t('Répétition radiale'), symetrie: t('Symétrie') };

const estMode = (p: PanneauOutils): p is Mode => p === 'grille' || p === 'radiale' || p === 'symetrie';

/** Les reglages tels qu'on les tape : des textes, lus au moment de l'apercu. */
interface Saisie {
  lignes: string; colonnes: string; pasX: string; pasY: string;
  exemplaires: string; angle: string; centre: 'plan' | 'selection' | 'point'; cx: string; cy: string; orienter: boolean;
  sens: 'h' | 'v'; axe: string; garder: boolean;
}

const entier = (t: string): number => (/^\s*\d+\s*$/.test(t) ? Number(t) : Number.NaN);
const nombre = (t: string): number => { const v = Number(t.trim().replace(',', '.')); return t.trim() === '' ? Number.NaN : v; };
const longueur = (t: string, u: UniteRegle): number => lireValeur(t, u) ?? Number.NaN;
const ecrire = (v: number, u: UniteRegle): string => String(arrondi(u.vers(v)));

/** Ce que les reglages donnent sur le dessin d'avant l'ouverture. */
function calculer(mode: Mode, base: DessinSvg, ids: readonly string[], s: Saisie, u: UniteRegle): ResultatRepetition {
  if (mode === 'grille') return dupliquerEnGrille(base, ids, { lignes: entier(s.lignes), colonnes: entier(s.colonnes), pasX: longueur(s.pasX, u), pasY: longueur(s.pasY, u) });
  if (mode === 'radiale') {
    const b = boiteDe(base, ids), [x, y, l, h] = base.vb;
    const centre: [number, number] = s.centre === 'plan' ? [x + l / 2, y + h / 2] : s.centre === 'selection' && b ? [b.x + b.l / 2, b.y + b.h / 2] : [longueur(s.cx, u), longueur(s.cy, u)];
    return repetitionRadiale(base, ids, { exemplaires: entier(s.exemplaires), angle: nombre(s.angle), centre, orienter: s.orienter });
  }
  return symetrie(base, ids, { sens: s.sens, axe: longueur(s.axe, u), garder: s.garder });
}

/** La phrase d'une repetition faite. */
function phrase(mode: Mode, r: ResultatRepetition, s: Saisie): string {
  if (mode === 'symetrie' && !s.garder) return s.sens === 'h' ? t('Sélection retournée en miroir horizontal.') : t('Sélection retournée en miroir vertical.');
  const copies = r.copies > 1 ? t('{copies} posées', { copies: pluriel(r.copies, 'copie') }) : t('{copies} posée', { copies: pluriel(r.copies, 'copie') });
  if (mode === 'grille') return t('Grille de {lignes} × {colonnes} : {copies}.', { lignes: s.lignes.trim(), colonnes: s.colonnes.trim(), copies });
  if (mode === 'radiale') return t('Répétition radiale de {n} exemplaires : {copies}.', { n: s.exemplaires.trim(), copies });
  return s.sens === 'h' ? t('Reflet posé en miroir horizontal, l’original gardé.') : t('Reflet posé en miroir vertical, l’original gardé.');
}

function Champ({ libelle, valeur, poser, unite, aide }: { libelle: string; valeur: string; poser: (t: string) => void; unite?: string; aide?: string }) {
  return (
    <label className="champ-ligne nombre" title={aide}>
      <span>{libelle}</span>
      <input type="text" inputMode="decimal" value={valeur} onChange={e => poser(e.target.value)} />
      {unite ? <span className="unite">{unite}</span> : null}
    </label>
  );
}

/** Le panneau, quand l'un des trois modes est demande. */
export function PanneauRepetition({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const rg = useRegles();
  return estMode(rg.panneau) ? <Repetition mode={rg.panneau} svgRef={svgRef} /> : null;
}

function Repetition({ mode, svgRef }: { mode: Mode; svgRef: RefObject<SVGSVGElement | null> }) {
  const mo = useDessin(), ac = useActions(), rg = useRegles(), arg = useActionsRegles();
  const u = rg.unite, titre = useId(), racine = useRef<HTMLDivElement>(null);
  // Ce que l'apercu rejoue : le dessin et la selection de l'ouverture, une cle d'historique pour tout le geste.
  const [depart] = useState(() => ({ base: mo.dessin, ids: mo.sel, cle: ac.nouvelleCle() }));
  const { base, ids, cle } = depart;
  const [s, poserS] = useState<Saisie>(() => {
    const pas = pasGrilleParDefaut(base, ids), [x, y, l, h] = base.vb;
    return {
      lignes: '2', colonnes: '2', pasX: ecrire(pas.pasX, u), pasY: ecrire(pas.pasY, u),
      exemplaires: '8', angle: '360', centre: 'plan', cx: ecrire(x + l / 2, u), cy: ecrire(y + h / 2, u), orienter: true,
      sens: 'h', axe: ecrire(axeParDefaut(base, ids, 'h'), u), garder: true
    };
  });
  const regler = (p: Partial<Saisie>) => poserS(x => ({ ...x, ...p }));
  const resultat = useMemo(() => (ids.length ? calculer(mode, base, ids, s, u) : null), [mode, base, ids, s, u]);
  const fermer = (garder: boolean) => {
    if (garder && resultat && !resultat.erreur) { ac.finir(); ac.choisir([...resultat.ids]); ac.dire(phrase(mode, resultat, s)); }
    else { ac.annulerGeste(cle); if (ids.length) ac.dire(t('Répétition abandonnée.')); }
    arg.ouvrir(null);
    svgRef.current?.focus();
  };
  // L'apercu : le resultat remplace le dessin dans l'entree du geste ; une erreur le retire et se dit dans le panneau.
  useEffect(() => {
    if (!resultat) return;
    if (resultat.erreur || resultat.dessin === base) ac.annulerGeste(cle);
    else ac.appliquer(() => resultat.dessin, cle);
  }, [resultat, base, cle, ac]);
  // Une modification faite ailleurs (un geste sur la toile, une autre commande) garde l'apercu tel quel et ferme le panneau.
  const exterieur = mo.h.cle !== cle && mo.dessin !== base && mo.dessin !== resultat?.dessin;
  useEffect(() => { if (exterieur) arg.ouvrir(null); }, [exterieur, arg]);
  useEffect(() => { racine.current?.querySelector<HTMLElement>('.panneau-flottant-corps input, .panneau-flottant-corps button')?.focus(); }, [mode]);

  const reperesAxe = (mo.dessin.reperes ? (s.sens === 'h' ? mo.dessin.reperes.v : mo.dessin.reperes.h) : []);
  let corps: ReactNode;
  if (!ids.length) corps = <p className="aide">{t('Choisissez d’abord une ou plusieurs formes : elles seront répétées.')}</p>;
  else if (mode === 'grille') {
    corps = (
      <div className="grille-2">
        <Champ libelle={t('Lignes')} valeur={s.lignes} poser={v => regler({ lignes: v })} />
        <Champ libelle={t('Colonnes')} valeur={s.colonnes} poser={v => regler({ colonnes: v })} />
        <Champ libelle={t('Pas →')} valeur={s.pasX} poser={v => regler({ pasX: v })} unite={t(u.nom)} aide={t('D’une copie à la suivante, vers la droite (négatif : vers la gauche)')} />
        <Champ libelle={t('Pas ↓')} valeur={s.pasY} poser={v => regler({ pasY: v })} unite={t(u.nom)} aide={t('D’une copie à la suivante, vers le bas (négatif : vers le haut)')} />
      </div>
    );
  } else if (mode === 'radiale') {
    corps = (
      <>
        <div className="grille-2">
          <Champ libelle={t('Exemplaires')} valeur={s.exemplaires} poser={v => regler({ exemplaires: v })} aide={t('L’original compris')} />
          <Champ libelle={t('Angle')} valeur={s.angle} poser={v => regler({ angle: v })} unite="°" aide={t('L’angle couvert : 360 pour un tour complet')} />
        </div>
        <label className="champ-ligne">
          <span>{t('Centre')}</span>
          <select value={s.centre} onChange={e => regler({ centre: e.target.value === 'selection' ? 'selection' : e.target.value === 'point' ? 'point' : 'plan' })}>
            <option value="plan">{t('Centre du plan')}</option>
            <option value="selection">{t('Centre de la sélection')}</option>
            <option value="point">{t('Point choisi')}</option>
          </select>
        </label>
        {s.centre === 'point' ? (
          <div className="grille-2">
            <Champ libelle="X" valeur={s.cx} poser={v => regler({ cx: v })} unite={t(u.nom)} />
            <Champ libelle="Y" valeur={s.cy} poser={v => regler({ cy: v })} unite={t(u.nom)} />
          </div>
        ) : null}
        <label className="case"><input type="checkbox" checked={s.orienter} onChange={e => regler({ orienter: e.target.checked })} /> {t('Tourner chaque copie avec sa place')}</label>
      </>
    );
  } else {
    corps = (
      <>
        <div className="mini-onglets" role="group" aria-label={t('Sens du miroir')}>
          {(['h', 'v'] as const).map(sens => (
            <button key={sens} type="button" aria-pressed={s.sens === sens} onClick={() => regler({ sens, axe: ecrire(axeParDefaut(base, ids, sens), u) })}>
              <Icone nom={sens === 'h' ? 'miroir-h' : 'miroir-v'} /> {sens === 'h' ? t('Horizontal') : t('Vertical')}
            </button>
          ))}
        </div>
        <Champ libelle={s.sens === 'h' ? t('Axe à x =') : t('Axe à y =')} valeur={s.axe} poser={v => regler({ axe: v })} unite={t(u.nom)} aide={t('Par défaut, l’axe passe par le centre de la sélection')} />
        {reperesAxe.length ? (
          <label className="champ-ligne">
            <span>{t('Sur un repère')}</span>
            <select value="" onChange={e => { if (e.target.value !== '') regler({ axe: ecrire(Number(e.target.value), u) }); }}>
              <option value="">{t('Choisir…')}</option>
              {reperesAxe.map(v => <option key={v} value={v}>{s.sens === 'h' ? t('Vertical à {v}', { v: texteValeur(v, u) }) : t('Horizontal à {v}', { v: texteValeur(v, u) })}</option>)}
            </select>
          </label>
        ) : null}
        <label className="case"><input type="checkbox" checked={s.garder} onChange={e => regler({ garder: e.target.checked })} /> {t('Garder l’original')}</label>
      </>
    );
  }
  const etat = !ids.length ? null : resultat?.erreur ? resultat.erreur : resultat ? (mode === 'symetrie' && !s.garder ? t('Aperçu : la sélection retournée.') : t('Aperçu : {copies}.', { copies: pluriel(resultat.copies, 'copie') })) : null;
  return (
    <div className="panneau-flottant panneau-repetition" role="dialog" aria-labelledby={titre} ref={racine}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(false); } }}>
      <div className="panneau-flottant-tete">
        <h2 id={titre}>{t(TITRES_REPETITION[mode])}</h2>
        <button type="button" className="icone-bouton" aria-label={t('Fermer sans appliquer')} title={t('Fermer sans appliquer (Échap)')} onClick={() => fermer(false)}><Icone nom="fermer" /></button>
      </div>
      <div className="mini-onglets onglets-repetition" role="group" aria-label={t('Répéter')}>
        {modes().map(([m, nom]) => <button key={m} type="button" aria-pressed={m === mode} onClick={() => arg.ouvrir(m)}>{nom}</button>)}
      </div>
      <div className="panneau-flottant-corps">{corps}</div>
      {etat ? <p className={'aide' + (resultat?.erreur ? ' erreur' : '')} role={resultat?.erreur ? 'alert' : undefined}>{etat}</p> : null}
      <div className="panneau-flottant-pied">
        <button type="button" className="discret" onClick={() => fermer(false)}>{t('Annuler')}</button>
        <button type="button" disabled={!resultat || !!resultat.erreur} onClick={() => fermer(true)}>{t('Appliquer')}</button>

      </div>
    </div>
  );
}
