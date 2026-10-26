// Le choix d'une police, partout ou l'on en choisit une (creer un texte, le restyler) : la liste deroulante de toutes les
// polices (ChoixPoliceListe.tsx, ADR-0034 : livrees, deposees, telechargees et tout le catalogue, celles a telecharger
// marquees), son style, et l'apercu « forme / ligne » (ADR-0022). L'apercu ne s'ouvre qu'au clic : rien n'est obligatoire ni
// bloquant, il montre seulement ce que la lame et le stylo feront de ce texte avec cette police, rendu par le moteur.
//
// Quand les polices en ligne sont permises (ADR-0025), « Toutes les polices » ouvre, dans le flux, les filtres de l'explorateur
// (genre, trace, source), les favoris et vos polices, comme le lien du pied de la liste ; une police du catalogue choisie montre
// ses autres styles. Seul le choix d'une police (ou d'un style) non livree la telecharge : le geste vaut demande, et rien ne part
// sans lui.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ecrireChemin } from '../engine/editionSvg.js';
import { apercusTexte, type Apercu } from '../engine/texte/apercu.js';
import { cheminDuTexte } from '../engine/texte/bloc.js';
import { nouveauTexte } from '../engine/texte/vivant.js';
import { estIdCatalogue, familleDe, variantesDe, type VariantePolice } from '../model/cataloguePolices.js';
import { baseDeGrasse, stylesLivres } from '../model/polices.js';
import type { Police } from '../io/polices.js';
import { TEXTE_APERCU } from './actionsTexte.js';
import { useActions } from './contexteEditeur.js';
import { useTexte } from './contexteTexte.js';
import { ExplorateurPolices } from './ExplorateurPolices.js';
import { ChoixPoliceListe } from './ChoixPoliceListe.js';
import { t } from '../util/i18n.js';

/** La taille de composition de l'apercu, en unites de la fonte ramenees a 100 : la vue s'ajuste ensuite au trace. */
const TAILLE_APERCU = 100;

export interface ProprietesChoixPolice {
  readonly polices: readonly Police[] | null;
  readonly valeur: string;
  /** Pose la police choisie ; `police` est donnee quand elle vient d'etre telechargee ou lue (la liste n'est peut-etre pas encore a jour). */
  readonly poser: (id: string, police?: Police) => void;
  /** Le texte a montrer dans l'apercu (le champ en cours) ; vide, « Abc ». */
  readonly texte: string;
  /** Ce que dit l'option d'une police que la page n'a pas (une fonte deposee sur une autre machine). */
  readonly absente?: string;
  readonly desactive?: boolean;
  /** Le rang de la derniere demande de deplier l'explorateur des polices (« Toutes les polices » de la barre de texte) ; 0 : aucune. */
  readonly explorerDemande?: number;
}

/** La famille d'une police, la valeur du selecteur : la variante grasse d'une fonte livree se montre sous sa famille. */
export const familleDePolice = (id: string): string => baseDeGrasse(id) ?? id;

/**
 * Les styles d'une police (Normal, Gras… pour une famille livree ; les autres variantes d'une police du catalogue) et le geste
 * qui en choisit un : une variante du catalogue absente se telecharge quand on la choisit (ADR-0025).
 */
export function useStylesPolice(valeur: string, polices: readonly Police[] | null, poser: (id: string, police?: Police) => void) {
  const tx = useTexte(), ac = useActions();
  const [erreur, poserErreur] = useState('');
  const [enCours, poserEnCours] = useState('');
  const styles = useMemo<VariantePolice[]>(() => {
    if (!estIdCatalogue(valeur) || !tx.catalogue) return [];
    const f = familleDe(tx.catalogue, valeur);
    return f && f.variantes.length > 1 ? variantesDe(f) : [];
  }, [valeur, tx.catalogue]);
  const livres = stylesLivres(valeur);
  const options: ReadonlyArray<{ readonly id: string; readonly nom: string }> = livres.length ? livres : styles;
  const choisir = async (id: string) => {
    const livre = livres.find(s => s.id === id);
    if (livre) { const p = polices?.find(x => x.id === livre.id); if (p) poser(p.id, p); return; }
    const v = styles.find(s => s.id === id);
    if (!v) return;
    const deja = polices?.find(p => p.id === v.id);
    if (deja) { poser(deja.id, deja); return; }
    poserEnCours(v.nom);
    const r = await tx.telecharger(v);
    poserEnCours('');
    if ('erreur' in r) { poserErreur(r.erreur); ac.dire(r.erreur); return; }
    poserErreur('');
    poser(r.id, r.police);
  };
  return { options, choisir, erreur, enCours };
}

export function ChoixPolice({ polices, valeur, poser: poserBrut, texte, absente, desactive = false, explorerDemande = 0 }: ProprietesChoixPolice) {
  const tx = useTexte();
  const [ouvert, ouvrir] = useState(false);
  const [explorer, poserExplorer] = useState(false);
  const idApercu = useId(), idExplorateur = useId();
  const police = polices?.find(p => p.id === valeur) ?? null;
  const poser = (id: string, p?: Police) => { tx.noterRecente(id); poserBrut(id, p); };
  const styles = useStylesPolice(valeur, polices, poser);
  // « Toutes les polices » de la barre de texte ouvre ce choix-ci, l'explorateur deja deplie (ADR-0027).
  const { chargerCatalogue } = tx, traitee = useRef(0);
  useEffect(() => {
    if (!explorerDemande || explorerDemande === traitee.current) return;
    traitee.current = explorerDemande;
    chargerCatalogue();
    poserExplorer(true);
  }, [explorerDemande, chargerCatalogue]);
  // Le lien du pied de la liste : l'explorateur se deplie, sa recherche prend le focus.
  const montrerExplorateur = () => {
    chargerCatalogue();
    poserExplorer(true);
    requestAnimationFrame(() => document.getElementById(idExplorateur)?.querySelector<HTMLElement>('input[type="search"]')?.focus());
  };
  return (
    <div className="choix-police">
      <div className="champ-ligne">
        <span>{t('Police')}</span>
        {polices === null ? <span className="aide">{t('Chargement des polices…')}</span> : (
          <ChoixPoliceListe polices={polices} valeur={valeur} poser={poser} absente={absente} desactive={desactive} explorer={tx.enLigne ? montrerExplorateur : undefined} />
        )}
      </div>
      {styles.options.length ? (
        <label className="champ-ligne">
          <span>{t('Style')}</span>
          <select value={valeur} disabled={desactive} onChange={e => void styles.choisir(e.target.value)} aria-label={t('Style de la police')}>
            {styles.options.map(s => <option key={s.id} value={s.id}>{t(s.nom)}</option>)}
          </select>
        </label>
      ) : null}
      {styles.enCours ? <p className="aide">{t('Téléchargement de {nom}…', { nom: styles.enCours })}</p> : styles.erreur ? <p className="aide" role="alert">{styles.erreur}</p> : null}
      <div className="boutons">
        <button type="button" className="discret apercu-bascule" aria-expanded={ouvert} aria-controls={idApercu} disabled={!police} onClick={() => ouvrir(o => !o)}>
          {t('Aperçu forme / ligne')}
        </button>
        {tx.enLigne && polices ? (
          <button type="button" className="discret" aria-expanded={explorer} aria-controls={idExplorateur} disabled={desactive}
            onClick={() => { if (!explorer) tx.chargerCatalogue(); poserExplorer(o => !o); }}>
            {t('Toutes les polices')}
          </button>
        ) : null}
      </div>
      {ouvert && police ? <ApercuPolice id={idApercu} police={police} texte={texte} fermer={() => ouvrir(false)} /> : null}
      {explorer && polices ? <ExplorateurPolices id={idExplorateur} polices={polices} valeur={valeur} poser={poser} /> : null}
    </div>
  );
}

/** Les deux rendus cote a cote, avec leur verdict ; refermable, dans le flux du panneau. */
function ApercuPolice({ id, police, texte, fermer }: { id: string; police: Police; texte: string; fermer: () => void }) {
  const montre = texte.trim() ? texte : TEXTE_APERCU;
  const apercus = useMemo(() => {
    const tv = nouveauTexte(montre, { id: police.id }, TAILLE_APERCU, [1, 0, 0, 1, 0, 0]);
    // Le trait d'une police a trait unique, pour la forme de decoupe : celui d'un stylo fin a cette taille.
    // La ligne du stylo d'une police a contour est celle du trace « Médian » : le meme calcul que la toile (ADR-0027).
    return apercusTexte(cheminDuTexte(tv, police.glyphes), police.nature, TAILLE_APERCU / 20, police.nature === 'contour' ? cheminDuTexte({ ...tv, trace: 'median' }, police.glyphes) : undefined);
  }, [montre, police]);
  const b = apercus.boite, marge = TAILLE_APERCU / 10;
  const vue = b ? [b.x - marge, b.y - marge, b.l + 2 * marge, b.h + 2 * marge].map(v => Math.round(v * 100) / 100).join(' ') : '0 0 1 1';
  return (
    <div className="apercu-police" id={id} role="group" aria-label={t('Aperçu de « {texte} » en {police}', { texte: montre, police: police.nom })}>
      <Rendu titre={t('Forme (découpe)')} apercu={apercus.forme} vue={vue} />
      <Rendu titre={t('Ligne (stylo)')} apercu={apercus.ligne} vue={vue} />
      <button type="button" className="discret apercu-fermer" onClick={fermer}>{t('Fermer l’aperçu')}</button>
    </div>
  );
}

function Rendu({ titre, apercu, vue }: { titre: string; apercu: Apercu; vue: string }) {
  return (
    <figure className="apercu-rendu">
      <svg viewBox={vue} role="img" aria-label={t('{titre} : {verdict}', { titre, verdict: apercu.verdict })} preserveAspectRatio="xMidYMid meet">
        <path d={ecrireChemin(apercu.d, 2)} className={apercu.plein ? 'apercu-plein' : 'apercu-ligne'} />
      </svg>
      <figcaption><span className="apercu-titre">{titre}</span><span className="aide">{apercu.verdict}</span></figcaption>
    </figure>
  );
}
