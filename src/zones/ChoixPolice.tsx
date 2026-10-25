// Le choix d'une police, partout ou l'on en choisit une (creer un texte, le restyler) : le selecteur des fontes livrees
// (lettres pleines, puis trait unique), celles deposees ou telechargees pendant la session, et l'apercu « forme / ligne »
// (ADR-0022). L'apercu ne s'ouvre qu'au clic : rien n'est obligatoire ni bloquant, il montre seulement ce que la lame et le
// stylo feront de ce texte avec cette police, rendu par le moteur.
//
// Quand les polices en ligne sont permises (ADR-0025), « Toutes les polices » ouvre, dans le flux, la recherche parmi les
// polices libres de l'index ; une police du catalogue choisie montre ses autres styles. Seul le choix d'une police (ou d'un
// style) non livree la telecharge : le geste vaut demande, et rien ne part sans lui.

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

/** Les fontes chargees, rangees comme le selecteur les montre : une famille livree par ligne (le gras se choisit dans « Style »). */
export function groupesPolices(polices: readonly Police[] | null) {
  return {
    contour: polices?.filter(p => p.nature === 'contour' && !p.id.startsWith('u-') && !estIdCatalogue(p.id) && baseDeGrasse(p.id) === null) ?? [],
    trait: polices?.filter(p => p.nature === 'trait') ?? [],
    telechargees: polices?.filter(p => estIdCatalogue(p.id)) ?? [],
    deposees: polices?.filter(p => p.id.startsWith('u-')) ?? []
  };
}

/** Les options du selecteur de police, partagees par le panneau et la barre de texte (ADR-0027). */
export function OptionsPolices({ polices, valeur, absente }: { polices: readonly Police[]; valeur: string; absente?: string | undefined }) {
  const g = groupesPolices(polices), police = polices.find(p => p.id === valeur);
  return (
    <>
      {!police ? <option value={valeur} disabled>{absente ?? 'Police absente'}</option> : null}
      <optgroup label="Lettres pleines">{g.contour.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup>
      {g.trait.length ? <optgroup label="Trait unique (stylo)">{g.trait.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
      {g.telechargees.length ? <optgroup label="Téléchargées">{g.telechargees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
      {g.deposees.length ? <optgroup label="Déposées">{g.deposees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
    </>
  );
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
  return (
    <div className="choix-police">
      <label className="champ-ligne">
        <span>Police</span>
        {polices === null ? <span className="aide">Chargement des polices…</span> : (
          <select value={familleDePolice(valeur)} disabled={desactive} onChange={e => poser(e.target.value)} aria-label="Police">
            <OptionsPolices polices={polices} valeur={valeur} absente={absente} />
          </select>
        )}
      </label>
      {styles.options.length ? (
        <label className="champ-ligne">
          <span>Style</span>
          <select value={valeur} disabled={desactive} onChange={e => void styles.choisir(e.target.value)} aria-label="Style de la police">
            {styles.options.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
      ) : null}
      {styles.enCours ? <p className="aide">Téléchargement de {styles.enCours}…</p> : styles.erreur ? <p className="aide" role="alert">{styles.erreur}</p> : null}
      <div className="boutons">
        <button type="button" className="discret apercu-bascule" aria-expanded={ouvert} aria-controls={idApercu} disabled={!police} onClick={() => ouvrir(o => !o)}>
          Aperçu forme / ligne
        </button>
        {tx.enLigne && polices ? (
          <button type="button" className="discret" aria-expanded={explorer} aria-controls={idExplorateur} disabled={desactive}
            onClick={() => { if (!explorer) tx.chargerCatalogue(); poserExplorer(o => !o); }}>
            Toutes les polices
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
    const t = nouveauTexte(montre, { id: police.id }, TAILLE_APERCU, [1, 0, 0, 1, 0, 0]);
    // Le trait d'une police a trait unique, pour la forme de decoupe : celui d'un stylo fin a cette taille.
    // La ligne du stylo d'une police a contour est celle du trace « Médian » : le meme calcul que la toile (ADR-0027).
    return apercusTexte(cheminDuTexte(t, police.glyphes), police.nature, TAILLE_APERCU / 20, police.nature === 'contour' ? cheminDuTexte({ ...t, trace: 'median' }, police.glyphes) : undefined);
  }, [montre, police]);
  const b = apercus.boite, marge = TAILLE_APERCU / 10;
  const vue = b ? [b.x - marge, b.y - marge, b.l + 2 * marge, b.h + 2 * marge].map(v => Math.round(v * 100) / 100).join(' ') : '0 0 1 1';
  return (
    <div className="apercu-police" id={id} role="group" aria-label={'Aperçu de « ' + montre + ' » en ' + police.nom}>
      <Rendu titre="Forme (découpe)" apercu={apercus.forme} vue={vue} />
      <Rendu titre="Ligne (stylo)" apercu={apercus.ligne} vue={vue} />
      <button type="button" className="discret apercu-fermer" onClick={fermer}>Fermer l’aperçu</button>
    </div>
  );
}

function Rendu({ titre, apercu, vue }: { titre: string; apercu: Apercu; vue: string }) {
  return (
    <figure className="apercu-rendu">
      <svg viewBox={vue} role="img" aria-label={titre + ' : ' + apercu.verdict} preserveAspectRatio="xMidYMid meet">
        <path d={ecrireChemin(apercu.d, 2)} className={apercu.plein ? 'apercu-plein' : 'apercu-ligne'} />
      </svg>
      <figcaption><span className="apercu-titre">{titre}</span><span className="aide">{apercu.verdict}</span></figcaption>
    </figure>
  );
}
