// Le choix d'une police, partout ou l'on en choisit une (creer un texte, le restyler) : le selecteur des fontes livrees
// (lettres pleines, puis trait unique), celles deposees pendant la session, et l'apercu « forme / ligne » (ADR-0021).
// L'apercu ne s'ouvre qu'au clic : rien n'est obligatoire ni bloquant, il montre seulement ce que la lame et le stylo
// feront de ce texte avec cette police, rendu par le moteur.

import { useId, useMemo, useState } from 'react';
import { ecrireChemin } from '../engine/editionSvg.js';
import { apercusTexte, type Apercu } from '../engine/texte/apercu.js';
import { cheminDuTexte } from '../engine/texte/bloc.js';
import { nouveauTexte } from '../engine/texte/vivant.js';
import type { Police } from '../io/polices.js';
import { TEXTE_APERCU } from './actionsTexte.js';

/** La taille de composition de l'apercu, en unites de la fonte ramenees a 100 : la vue s'ajuste ensuite au trace. */
const TAILLE_APERCU = 100;

export interface ProprietesChoixPolice {
  readonly polices: readonly Police[] | null;
  readonly valeur: string;
  readonly poser: (id: string) => void;
  /** Le texte a montrer dans l'apercu (le champ en cours) ; vide, « Abc ». */
  readonly texte: string;
  /** Ce que dit l'option d'une police que la page n'a pas (une fonte deposee sur une autre machine). */
  readonly absente?: string;
  readonly desactive?: boolean;
}

export function ChoixPolice({ polices, valeur, poser, texte, absente, desactive = false }: ProprietesChoixPolice) {
  const [ouvert, ouvrir] = useState(false);
  const idApercu = useId();
  const police = polices?.find(p => p.id === valeur) ?? null;
  const contour = polices?.filter(p => p.nature === 'contour' && !p.id.startsWith('u-')) ?? [];
  const trait = polices?.filter(p => p.nature === 'trait') ?? [];
  const deposees = polices?.filter(p => p.id.startsWith('u-')) ?? [];
  return (
    <div className="choix-police">
      <label className="champ-ligne">
        <span>Police</span>
        {polices === null ? <span className="aide">Chargement des polices…</span> : (
          <select value={valeur} disabled={desactive} onChange={e => poser(e.target.value)} aria-label="Police">
            {!police ? <option value={valeur} disabled>{absente ?? 'Police absente'}</option> : null}
            <optgroup label="Lettres pleines">{contour.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup>
            {trait.length ? <optgroup label="Trait unique (stylo)">{trait.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
            {deposees.length ? <optgroup label="Déposées">{deposees.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup> : null}
          </select>
        )}
      </label>
      <button type="button" className="discret apercu-bascule" aria-expanded={ouvert} aria-controls={idApercu} disabled={!police} onClick={() => ouvrir(o => !o)}>
        Aperçu forme / ligne
      </button>
      {ouvert && police ? <ApercuPolice id={idApercu} police={police} texte={texte} fermer={() => ouvrir(false)} /> : null}
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
