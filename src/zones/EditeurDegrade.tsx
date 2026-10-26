// L'editeur de degrade de l'inspecteur (ADR-0012, etape 4, paquet 4-A ; annexe 6 §4) : pour le remplissage et pour le contour, un
// groupe de boutons radio Uni / Dégradé linéaire / Dégradé radial, puis, sous un degrade, la liste de ses arrets (une listbox d'options
// « Arrêt 2 sur 3, rouge #c81e28, à 40 % ») et les reglages de l'arret choisi (couleur, position, opacite, ordre, retirer), « Ajouter
// un arrêt », « Inverser », l'etalement, l'angle d'un lineaire, le centre et le rayon d'un radial. Cette liste suffit a tout faire :
// les poignees de la toile (PoigneesDegrade.tsx) ne sont qu'un raccourci.
//
// Poser un degrade rend un dessin plat riche (`data-ed-modele="2"` a l'ecriture) : le groupe de boutons ne se montre que si le reglage
// du modele vaut `riche` (menu Edition, ou l'hote) ou si le dessin est deja riche ; sinon l'inspecteur garde le selecteur de couleur
// d'avant, au DOM pres. Les operations sont pures (engine/edition/degradesOperations.ts) ; une frappe continue (curseur, selecteur de
// couleur) est un geste d'historique fondu par sa cle, clos en quittant le champ.

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  ARRETS_MAX, ARRETS_MIN, ajouterArret, angleDegrade, centreRayon, degradeDe, echangerArrets, estPlat, inverserArrets, modifierArret, poserDegrade, rangAjoute,
  reglerAngle, reglerCentre, reglerEtalement, reglerRayon, retirerArret, retirerDegrade,
  type CoteDegrade, type Degrade, type DessinSvg, type EtalementDegrade, type Forme, type GenreDegrade, type ReglageArret
} from '../engine/editionSvg.js';
import { Nombre } from './commun/Nombre.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { estHex } from './aidesEditeur.js';
import {
  nomArret, nomGenre, phraseArret, phraseArretAjoute, phraseArretRetire, phraseGenre, pourCent, RAISON_ARRETS_MAX, RAISON_DEUX_ARRETS
} from './phrasesDegrades.js';

/** Les degrades se proposent : le modele riche est regle, ou le dessin ouvert l'est deja (poser un degrade ne le change pas alors). */
export function useDegradesPermis(): boolean {
  const ui = useInterface(), mo = useDessin();
  return ui.modele === 'riche' || !estPlat(mo.dessin);
}

const GENRES: ReadonlyArray<GenreDegrade | 'uni'> = ['uni', 'lineaire', 'radial'];
const ETALEMENTS: ReadonlyArray<readonly [EtalementDegrade, string]> = [['pad', 'Prolonger'], ['reflect', 'Refléter'], ['repeat', 'Répéter']];

/**
 * Une peinture de la selection : le choix du genre (si les degrades sont permis), puis la couleur unie (`uni`, le selecteur d'avant) ou
 * l'editeur du degrade de la premiere forme.
 */
export function PeintureDegradable({ cote, libelle, forme, children }: { cote: CoteDegrade; libelle: string; forme: Forme; children: ReactNode }) {
  const permis = useDegradesPermis();
  const g = degradeDe(forme, cote);
  if (!permis && !g) return <>{children}</>;
  return (
    <div className="peinture-degradable">
      <ChoixGenre cote={cote} libelle={libelle} genre={g ? g.genre : 'uni'} />
      {g ? <EditeurDegrade cote={cote} libelle={libelle} degrade={g} /> : children}
    </div>
  );
}

/** Uni / Dégradé linéaire / Dégradé radial : des boutons radio natifs (les fleches les parcourent, le lecteur d'ecran les annonce). */
function ChoixGenre({ cote, libelle, genre }: { cote: CoteDegrade; libelle: string; genre: GenreDegrade | 'uni' }) {
  const mo = useDessin(), ac = useActions(), nom = useId();
  const choisir = (v: GenreDegrade | 'uni') => {
    if (v === genre) return;
    ac.appliquer(d => (v === 'uni' ? retirerDegrade(d, mo.sel, cote) : poserDegrade(d, mo.sel, cote, v)));
    ac.annoncer(phraseGenre(cote, v));
  };
  return (
    <fieldset className="choix-genre-peinture">
      <legend className="peinture-titre">{libelle}</legend>
      {GENRES.map(v => (
        <label key={v} className="choix-genre">
          <input type="radio" name={nom} value={v} checked={genre === v} onChange={() => choisir(v)} />
          <span>{nomGenre(v)}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Un reglage du degrade : l'operation, et la cle d'un geste continu (null : une entree d'historique a elle). */
type Regler = (f: (d: DessinSvg, ids: readonly string[]) => DessinSvg, cle?: string | null) => void;

/** L'editeur d'un degrade : la liste de ses arrets, l'arret choisi, puis le degrade entier. */
function EditeurDegrade({ cote, libelle, degrade }: { cote: CoteDegrade; libelle: string; degrade: Degrade }) {
  const mo = useDessin(), ac = useActions();
  const [choisi, poserChoisi] = useState(0);
  const n = degrade.arrets.length, i = Math.min(choisi, n - 1);
  const ids = mo.sel, cleIds = ids.join(',');
  const regler: Regler = (f, cle = null) => ac.appliquer(d => f(d, ids), cle === null ? null : 'degrade:' + cote + ':' + cle + ':' + cleIds);
  const ajouter = () => {
    if (n >= ARRETS_MAX) return;
    const k = rangAjoute(n, i);
    regler((d, s) => ajouterArret(d, s, cote, i));
    poserChoisi(k);
    ac.annoncer(phraseArretAjoute(k, n + 1));
  };
  const retirer = () => {
    if (n <= ARRETS_MIN) { ac.annoncer(RAISON_DEUX_ARRETS); return; }
    regler((d, s) => retirerArret(d, s, cote, i));
    poserChoisi(Math.max(0, i - 1));
    ac.annoncer(phraseArretRetire(n - 1));
  };
  return (
    <div className="editeur-degrade">
      <ListeArrets libelle={libelle} degrade={degrade} choisi={i} choisir={poserChoisi} retirer={retirer} />
      <ArretChoisi cote={cote} degrade={degrade} i={i} regler={regler} finir={ac.finir} deplacer={j => { regler((d, s) => echangerArrets(d, s, cote, i, j)); poserChoisi(j); ac.annoncer(nomArret(j, n) + '.'); }} retirer={retirer} />
      <div className="boutons">
        <button type="button" disabled={n >= ARRETS_MAX} title={n >= ARRETS_MAX ? RAISON_ARRETS_MAX : 'Un arrêt de plus, à mi-chemin du suivant, à la couleur du dégradé à cet endroit'} onClick={ajouter}>Ajouter un arrêt</button>
        <button type="button" onClick={() => { regler((d, s) => inverserArrets(d, s, cote)); poserChoisi(n - 1 - i); ac.annoncer('Dégradé inversé.'); }}>Inverser</button>
      </div>
      <label className="champ-ligne">
        <span>Étalement</span>
        <select value={degrade.etalement ?? 'pad'} onChange={e => { const v = ETALEMENTS.find(([k]) => k === e.target.value)?.[0] ?? 'pad'; regler((d, s) => reglerEtalement(d, s, cote, v)); }}>
          {ETALEMENTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      {degrade.genre === 'lineaire'
        ? <Angle valeur={angleDegrade(degrade)} poser={(v, continu) => regler((d, s) => reglerAngle(d, s, cote, v), continu ? 'angle' : null)} finir={ac.finir} />
        : <CentreRayon degrade={degrade} cote={cote} regler={regler} />}
    </div>
  );
}

/**
 * La liste des arrets : une listbox a un seul arret de tabulation (`aria-activedescendant`), les fleches choisissent, Suppr retire.
 * Une option ne porte aucune commande (une commande dans une option n'est pas atteignable) : les reglages de l'arret choisi suivent.
 */
function ListeArrets({ libelle, degrade, choisi, choisir, retirer }: { libelle: string; degrade: Degrade; choisi: number; choisir: (i: number) => void; retirer: () => void }) {
  const base = useId(), n = degrade.arrets.length;
  const idOption = (k: number) => base + '-arret-' + k;
  const touche = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key;
    // Les fleches et Suppr sont a la liste : elles ne doivent pas deplacer ni retirer la forme derriere elle (Clavier.ts les lirait).
    if (k === 'ArrowDown' || k === 'ArrowRight') choisir(Math.min(n - 1, choisi + 1));
    else if (k === 'ArrowUp' || k === 'ArrowLeft') choisir(Math.max(0, choisi - 1));
    else if (k === 'Home') choisir(0);
    else if (k === 'End') choisir(n - 1);
    else if (k === 'Delete' || k === 'Backspace') retirer();
    else return;
    e.preventDefault();
  };
  return (
    <div role="listbox" tabIndex={0} className="liste-arrets" aria-label={'Arrêts du ' + libelle.toLowerCase()} aria-activedescendant={idOption(choisi)} onKeyDown={touche}>
      {degrade.arrets.map((a, k) => (
        <div key={k} id={idOption(k)} role="option" aria-selected={k === choisi} className="arret-option" onClick={() => choisir(k)}>
          {/* La pastille montre la couleur du dessin (pas un jeton) ; le damier dessous dit sa transparence. */}
          <span className="pastille-arret" aria-hidden="true"><span style={{ background: a.couleur, opacity: a.opacite ?? 1 }} /></span>
          {/* Le texte visible est le nom de l'option (WCAG 2.5.3) : la couleur nommee avant son code, la position, l'opacite. */}
          <span className="arret-texte">{phraseArret(degrade, k)}</span>
        </div>
      ))}
    </div>
  );
}

/** Les reglages de l'arret choisi : couleur, position, opacite, son rang (monter, descendre), le retirer. */
function ArretChoisi({ cote, degrade, i, regler, finir, deplacer, retirer }: { cote: CoteDegrade; degrade: Degrade; i: number; regler: Regler; finir: () => void; deplacer: (j: number) => void; retirer: () => void }) {
  const a = degrade.arrets[i], n = degrade.arrets.length;
  const [code, poserCode] = useState<string | null>(null);
  if (!a) return null;
  const nom = 'l’arrêt ' + (i + 1);
  const modifier = (r: ReglageArret, cle: string | null) => regler((d, s) => modifierArret(d, s, cote, i, r), cle === null ? null : cle + ':' + i);
  const validerCode = () => {
    const t = (code ?? '').trim().toLowerCase(), hex = /^#?([0-9a-f]{6})$/.exec(t)?.[1];
    if (hex) modifier({ couleur: '#' + hex }, null);
    poserCode(null);
  };
  const avant = degrade.arrets[i - 1]?.position ?? 0, apres = degrade.arrets[i + 1]?.position ?? 1;
  return (
    <div className="arret-choisi" role="group" aria-label={'Réglages de ' + nom}>
      <div className="champ-ligne">
        <span>Couleur</span>
        <input type="color" aria-label={'Couleur de ' + nom} value={estHex(a.couleur) ? a.couleur : '#000000'} onChange={e => modifier({ couleur: e.target.value }, 'couleur')} onBlur={finir} />
        <input type="text" aria-label={'Couleur de ' + nom + ' (code)'} size={8} value={code ?? a.couleur} onChange={e => poserCode(e.target.value)} onBlur={validerCode} onKeyDown={e => { if (e.key === 'Enter') validerCode(); }} />
      </div>
      <label className="champ-ligne">
        <span>Position</span>
        <input type="range" min={0} max={100} step={1} value={Math.round(a.position * 100)} aria-valuetext={pourCent(a.position) + ' %'}
          title={'Entre ' + pourCent(avant) + ' et ' + pourCent(apres) + ' % : un arrêt ne dépasse pas ses voisins'}
          onChange={e => modifier({ position: Number(e.target.value) / 100 }, 'position')} onPointerUp={finir} onBlur={finir} />
        <span className="aide">{pourCent(a.position)} %</span>
      </label>
      <Nombre libelle="Position %" valeur={a.position * 100} min={0} max={100} poser={v => modifier({ position: v / 100 }, null)} />
      <label className="champ-ligne">
        <span>Opacité</span>
        <input type="range" min={0} max={100} step={1} value={Math.round((a.opacite ?? 1) * 100)} aria-valuetext={pourCent(a.opacite ?? 1) + ' %'}
          onChange={e => modifier({ opacite: Number(e.target.value) / 100 }, 'opacite')} onPointerUp={finir} onBlur={finir} />
        <span className="aide">{pourCent(a.opacite ?? 1)} %</span>
      </label>
      <div className="boutons">
        <button type="button" disabled={i === 0} title={i === 0 ? 'C’est le premier arrêt.' : 'Échanger sa couleur avec l’arrêt précédent'} onClick={() => deplacer(i - 1)}>Monter</button>
        <button type="button" disabled={i === n - 1} title={i === n - 1 ? 'C’est le dernier arrêt.' : 'Échanger sa couleur avec l’arrêt suivant'} onClick={() => deplacer(i + 1)}>Descendre</button>
        <button type="button" className="danger" disabled={n <= ARRETS_MIN} title={n <= ARRETS_MIN ? RAISON_DEUX_ARRETS : undefined} onClick={retirer}>Retirer l’arrêt</button>
      </div>
    </div>
  );
}

/** L'angle d'un lineaire : un curseur par 15° (fondu en un geste), un champ au degre. */
function Angle({ valeur, poser, finir }: { valeur: number; poser: (v: number, continu: boolean) => void; finir: () => void }) {
  const arrondi = Math.round(valeur);
  return (
    <>
      <label className="champ-ligne">
        <span>Angle</span>
        <input type="range" min={0} max={345} step={15} value={Math.round(arrondi / 15) * 15 % 360} aria-valuetext={arrondi + ' degrés'} onChange={e => poser(Number(e.target.value), true)} onPointerUp={finir} onBlur={finir} />
        <span className="aide">{arrondi}°</span>
      </label>
      <Nombre libelle="Angle °" valeur={valeur} min={-360} max={360} poser={v => poser(v, false)} />
    </>
  );
}

/** Le centre et le rayon d'un radial, dans le plan. */
function CentreRayon({ degrade, cote, regler }: { degrade: Extract<Degrade, { genre: 'radial' }>; cote: CoteDegrade; regler: Regler }) {
  const c = centreRayon(degrade);
  return (
    <div className="grille-2">
      <Nombre libelle="Centre X" valeur={c.cx} poser={v => regler((d, s) => reglerCentre(d, s, cote, v, c.cy))} />
      <Nombre libelle="Centre Y" valeur={c.cy} poser={v => regler((d, s) => reglerCentre(d, s, cote, c.cx, v))} />
      <Nombre libelle="Rayon" valeur={c.r} min={0.001} poser={v => regler((d, s) => reglerRayon(d, s, cote, v))} />
    </div>
  );
}
