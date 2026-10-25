// Le trace des lettres d'un texte vivant (ADR-0027), au meme rang que la taille ou le gras : « Plein » (des lettres pleines,
// pour la decoupe) ou « Médian » (une seule ligne au milieu du trait, ce que suit le stylo). Deux boutons a etat, un etat
// et non une action : jamais pleins. Une police a trait unique n'a que sa ligne : « Plein » le dit et reste dans l'ordre de
// Tab (aria-disabled), comme tout bouton inactif qui doit dire pourquoi (DESIGN.md).

import { useId } from 'react';
import type { TraceTexte } from './actionsTexte.js';
import { useActions } from './contexteEditeur.js';

export const RAISON_PLEIN_TRAIT = 'Une police à trait unique n’a qu’une ligne : choisissez une police à contour pour des lettres pleines';
export const AIDES_TRACE: Readonly<Record<TraceTexte, string>> = {
  plein: 'Plein : des lettres pleines, que la lame découpe',
  median: 'Médian : une seule ligne au milieu du trait, que suit le stylo'
};

export function ChoixTrace({ trace, trait, desactive = false, poser, className = 'alignement-texte choix-trace' }: { trace: TraceTexte; trait: boolean; desactive?: boolean; poser: (t: TraceTexte) => void; className?: string }) {
  const ac = useActions(), idRaison = useId();
  return (
    <div className={className} role="group" aria-label="Tracé des lettres">
      <button type="button" aria-pressed={trace === 'plein'} disabled={desactive} aria-disabled={trait ? true : undefined} aria-describedby={trait ? idRaison : undefined}
        title={trait ? RAISON_PLEIN_TRAIT : AIDES_TRACE.plein} onClick={() => { if (trait) ac.dire(RAISON_PLEIN_TRAIT + '.'); else poser('plein'); }}>Plein</button>
      <button type="button" aria-pressed={trace === 'median'} disabled={desactive} title={AIDES_TRACE.median} onClick={() => poser('median')}>Médian</button>
      {trait ? <span id={idRaison} className="sr-only">{RAISON_PLEIN_TRAIT}</span> : null}
    </div>
  );
}
