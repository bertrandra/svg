// Le choix d'une police, partout ou l'on en choisit une (creer un texte, le restyler) : le selecteur des fontes livrees
// (lettres pleines, puis trait unique), celles deposees ou telechargees pendant la session, et l'apercu « forme / ligne »
// (ADR-0022). L'apercu ne s'ouvre qu'au clic : rien n'est obligatoire ni bloquant, il montre seulement ce que la lame et le
// stylo feront de ce texte avec cette police, rendu par le moteur.
//
// Quand les polices en ligne sont permises (ADR-0025), « Toutes les polices » ouvre, dans le flux, la recherche parmi les
// polices libres de l'index ; une police du catalogue choisie montre ses autres styles. Rien ne se telecharge sans accord.

import { useId, useMemo, useState } from 'react';
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
}

export function ChoixPolice({ polices, valeur, poser: poserBrut, texte, absente, desactive = false }: ProprietesChoixPolice) {
  const tx = useTexte(), ac = useActions();
  const [ouvert, ouvrir] = useState(false);
  const [explorer, poserExplorer] = useState(false);
  const [erreurStyle, poserErreurStyle] = useState('');
  const idApercu = useId(), idExplorateur = useId();
  const police = polices?.find(p => p.id === valeur) ?? null;
  // Une famille livree, une ligne : la variante grasse se choisit dans « Style ».
  const contour = polices?.filter(p => p.nature === 'contour' && !p.id.startsWith('u-') && !estIdCatalogue(p.id) && baseDeGrasse(p.id) === null) ?? [];
  const famille = baseDeGrasse(valeur) ?? valeur;
  const trait = polices?.filter(p => p.nature === 'trait') ?? [];
  const deposees = polices?.filter(p => p.id.startsWith('u-')) ?? [];
  const telechargees = polices?.filter(p => estIdCatalogue(p.id)) ?? [];
  const poser = (id: string, p?: Police) => { tx.noterRecente(id); poserBrut(id, p); };
  // Les autres styles d'une police du catalogue : chacun se telecharge a son tour, l'accord une fois donne.
  const styles = useMemo<VariantePolice[]>(() => {
    if (!estIdCatalogue(valeur) || !tx.catalogue) return [];
    const f = familleDe(tx.catalogue, valeur);
    return f && f.variantes.length > 1 ? variantesDe(f) : [];
  }, [valeur, tx.catalogue]);
  const livres = stylesLivres(valeur);
  const optionsStyle: ReadonlyArray<{ readonly id: string; readonly nom: string }> = livres.length ? livres : styles;
  const choisirStyle = async (id: string) => {
    const livre = livres.find(s => s.id === id);
    if (livre) { const p = polices?.find(x => x.id === livre.id); if (p) poser(p.id, p); return; }
    const v = styles.find(s => s.id === id);
    if (!v) return;
    const deja = polices?.find(p => p.id === v.id);
    if (deja) { poser(deja.id, deja); return; }
    const r = await tx.telecharger(v);
    if (r === null) return;
    if ('erreur' in r) { poserErreurStyle(r.erreur); ac.dire(r.erreur); return; }
    poserErreurStyle('');
    poser(r.id, r.police);
  };
  return (
    <div className="choix-police">
      <label className="champ-ligne">
        <span>Police</span>
        {polices === null ? <span className="aide">Chargement des polices…</span> : (
          <select value={famille} disabled={desactive} onChange={e => poser(e.target.value)} aria-label="Police">
            {!police ? <option value={valeur} disabled>{absente ?? 'Police absente'}</option> : null}
            <optgroup label="Lettres pleines">{contour.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup>
            {trait.length ? <optgroup label="Trait unique (stylo)">{trait.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
            {telechargees.length ? <optgroup label="Téléchargées">{telechargees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
            {deposees.length ? <optgroup label="Déposées">{deposees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
          </select>
        )}
      </label>
      {optionsStyle.length ? (
        <label className="champ-ligne">
          <span>Style</span>
          <select value={valeur} disabled={desactive} onChange={e => void choisirStyle(e.target.value)} aria-label="Style de la police">
            {optionsStyle.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
      ) : null}
      {erreurStyle ? <p className="aide" role="alert">{erreurStyle}</p> : null}
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
    return apercusTexte(cheminDuTexte(t, police.glyphes), police.nature, TAILLE_APERCU / 20);
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
