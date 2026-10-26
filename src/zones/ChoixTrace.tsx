// Le trace des lettres d'un texte vivant (ADR-0027), au meme rang que la taille ou le gras : « Plein » (des lettres pleines,
// pour la decoupe) ou « Médian » (une seule ligne au milieu du trait, ce que suit le stylo). Deux boutons a etat, un etat
// et non une action : jamais pleins. Une police a trait unique n'a que sa ligne : « Plein » le dit et reste dans l'ordre de
// Tab (aria-disabled), comme tout bouton inactif qui doit dire pourquoi (DESIGN.md).

import { useId } from 'react';
import type { TraceTexte } from './actionsTexte.js';
import { useActions } from './contexteEditeur.js';
import { t } from '../util/i18n.js';

// Des fonctions : les textes se traduisent au rendu, une fois la langue posee (ADR-0042), jamais au chargement du module.
export const raisonPleinTrait = (): string => t('Une police à trait unique n’a qu’une ligne : choisissez une police à contour pour des lettres pleines');
export const aidesTrace = (): Readonly<Record<TraceTexte, string>> => ({
  plein: t('Plein : des lettres pleines, que la lame découpe'),
  median: t('Médian : une seule ligne au milieu du trait, que suit le stylo')
});

export function ChoixTrace({ trace, trait, desactive = false, poser, className = 'alignement-texte choix-trace' }: { trace: TraceTexte; trait: boolean; desactive?: boolean; poser: (t: TraceTexte) => void; className?: string }) {
  const ac = useActions(), idRaison = useId();
  const raison = raisonPleinTrait(), aides = aidesTrace();
  return (
    <div className={className} role="group" aria-label={t('Tracé des lettres')}>
      <button type="button" aria-pressed={trace === 'plein'} disabled={desactive} aria-disabled={trait ? true : undefined} aria-describedby={trait ? idRaison : undefined}
        title={trait ? raison : aides.plein} onClick={() => { if (trait) ac.dire(raison + '.'); else poser('plein'); }}>{t('Plein')}</button>
      <button type="button" aria-pressed={trace === 'median'} disabled={desactive} title={aides.median} onClick={() => poser('median')}>{t('Médian')}</button>
      {trait ? <span id={idRaison} className="sr-only">{raison}</span> : null}
    </div>
  );
}
