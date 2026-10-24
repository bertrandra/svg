// Un bouton qui peut etre inactif en disant pourquoi (WCAG 3.3.2, 4.1.2). Un bouton `disabled` sort de l'ordre de Tab, se tait
// au clavier et ne s'explique qu'a la souris (et encore) ; celui-ci reste `aria-disabled` : on peut le focaliser, la raison est
// sa description (un texte masque a l'ecran, lu au focus), la meme est son infobulle, et l'activer la dit dans la region
// vocale au lieu de ne rien faire. `raison` absente, c'est un bouton ordinaire.

import { useId, type ReactNode } from 'react';
import { useActions } from '../contexteEditeur.js';

interface Proprietes {
  /** Pourquoi le bouton est inactif, en une phrase sans point final ; `null` ou absente : il est actif. */
  raison?: string | null;
  /** L'infobulle quand le bouton est actif (le geste et son raccourci). */
  aide?: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}

export function BoutonRaison({ raison, aide, className, onClick, children }: Proprietes) {
  const ac = useActions(), idRaison = useId();
  return (
    <>
      <button type="button" className={className} title={raison ?? aide} aria-disabled={raison ? true : undefined} aria-describedby={raison ? idRaison : undefined}
        onClick={() => { if (raison) ac.dire(raison + '.'); else onClick(); }}>{children}</button>
      {raison ? <span id={idRaison} className="sr-only">{raison}</span> : null}
    </>
  );
}
