// Un repere de premiere rencontre (ADR-0019) : une note posee dans le panneau, la ou un debutant bloque, qui se referme par
// « Compris » et ne revient jamais (memoire du guide, contexteGuide.tsx). Une note dans le flux, pas une bulle flottante :
// elle ne recouvre rien, ne vole pas le focus et ne parle pas dans la region vocale (elle n'est pas une action).

import { useRef, type ReactNode } from 'react';
import { insecables } from '../util/texte.js';
import { useRepere } from './contexteGuide.js';
import type { IdRepere } from './visite.js';

const FOCALISABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';

/** Un element qu'on voit et qu'on peut atteindre : ni masque (display, visibility), ni dans un arbre inerte. */
const atteignable = (x: HTMLElement): boolean => x.getClientRects().length > 0 && getComputedStyle(x).visibility !== 'hidden' && !x.closest('[inert]');

/** L'element focalisable qui suit `el` dans la page, hors de `hors` : la ou va le focus quand la note se referme. */
function suivantApres(el: Element, hors: Element): HTMLElement | null {
  const tous = Array.from(document.querySelectorAll<HTMLElement>(FOCALISABLES));
  const apres = (x: HTMLElement) => !hors.contains(x) && atteignable(x);
  // Le suivant, ou a defaut le precedent : une note en fin de panneau rend le focus a ce qui la precede.
  return tous.find(x => apres(x) && (el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
    ?? tous.reverse().find(x => apres(x) && (el.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING) !== 0) ?? null;
}

export function Repere({ id, titre, children }: { id: IdRepere; titre: string; children: ReactNode }) {
  const { visible, compris } = useRepere(id);
  const racine = useRef<HTMLDivElement>(null);
  if (!visible) return null;
  const refermer = () => {
    const note = racine.current;
    // Le bouton va disparaitre avec la note : le focus clavier passe a ce qui la suit, au lieu de tomber sur le corps de la page.
    const suite = note && note.contains(document.activeElement) ? suivantApres(note, note) : null;
    compris();
    if (suite) requestAnimationFrame(() => suite.focus({ preventScroll: true }));
  };
  return (
    <div className="repere" role="note" aria-label={titre} ref={racine} data-repere={id}>
      <p className="repere-titre">{insecables(titre)}</p>
      <p className="repere-texte">{typeof children === 'string' ? insecables(children) : children}</p>
      <button type="button" className="discret" onClick={refermer}>Compris</button>
    </div>
  );
}
