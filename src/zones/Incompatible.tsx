// L'ecran d'un navigateur qui ne sait pas faire ce que l'editeur exige (util/capacites.ts) : une phrase
// en francais a la place d'une page blanche. Deux formes : la page entiere (demarrage), et la fenetre
// de l'editeur embarque, que l'hote peut fermer comme n'importe quel editeur.

import { createPortal } from 'react-dom';
import { phraseManquantes, type Capacite } from '../util/capacites.js';

export function PageIncompatible({ manquantes }: { manquantes: readonly Capacite[] }) {
  return (
    <main className="accueil">
      <h1>Ce navigateur est trop ancien</h1>
      <p className="message" role="alert">{phraseManquantes(manquantes)}</p>
    </main>
  );
}

/** La fenetre de l'editeur embarque, a la place de l'editeur : un dialogue d'alerte et le bouton qui le ferme. */
export function FenetreIncompatible({ manquantes, fermer }: { manquantes: readonly Capacite[]; fermer: () => void }) {
  return createPortal(
    <div className="editeur-svg" role="alertdialog" aria-modal="true" aria-label="Navigateur trop ancien">
      <div className="editeur-erreur">
        <p>{phraseManquantes(manquantes)}</p>
        <button type="button" autoFocus onClick={fermer}>Fermer</button>
      </div>
    </div>,
    document.body
  );
}
