// Le choix d'un evenement de la bibliotheque : des pastilles a etat plutot qu'une liste deroulante de 45 lignes.
// Repliees, elles montrent « Tous » et les evenements du calendrier qui arrivent (le mois se lit ici, dans la
// zone, et se passe au coeur pur) ; « Plus d'evenements » deplie les trois familles. Un groupe de boutons a etat
// (aria-pressed) : Tab les parcourt comme tout bouton, les fleches vont de l'une a l'autre.

import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Evenement, FamilleEvenement } from '../model/bibliotheque.js';
import { evenementsProches, ordreCalendrier } from '../model/recherche.js';

const MOIS = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FAMILLES: ReadonlyArray<readonly [FamilleEvenement, string]> = [['calendrier', 'Calendrier'], ['vie', 'Événements de la vie'], ['categorie', 'Catégories']];
/** Combien d'evenements proches montrer replie : assez pour la saison, pas assez pour faire un mur. */
const PROCHES = 6;

interface Proprietes {
  evenements: readonly Evenement[];
  valeur: string | null;
  poser: (id: string | null) => void;
  /** Le mois du calendrier (1 a 12) a partir duquel ranger les evenements. */
  mois: number;
  compact?: boolean;
}

/** Les fleches deplacent le focus d'une pastille a l'autre ; Debut et Fin vont aux bouts. */
function deplacer(e: KeyboardEvent<HTMLDivElement>) {
  const touches: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (touches[e.key] === undefined && e.key !== 'Home' && e.key !== 'End') return;
  const liste = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.pastille-evenement'));
  const i = liste.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const cible = e.key === 'Home' ? 0 : e.key === 'End' ? liste.length - 1 : (i + (touches[e.key] ?? 0) + liste.length) % liste.length;
  liste[cible]?.focus();
}

export function PastillesEvenements({ evenements, valeur, poser, mois, compact = false }: Proprietes) {
  const [tout, poserTout] = useState(false);
  const proches = useMemo(() => evenementsProches(evenements, mois, PROCHES), [evenements, mois]);
  const choisi = valeur === null ? undefined : evenements.find(ev => ev.id === valeur);
  // L'evenement choisi reste visible replie, meme loin dans l'annee.
  const replies = choisi && !proches.includes(choisi) ? [...proches, choisi] : proches;
  const groupes = useMemo(() => FAMILLES.map(([f, titre]) => [titre, f === 'calendrier' ? ordreCalendrier(evenements, mois) : evenements.filter(ev => ev.famille === f)] as const)
    .filter(([, liste]) => liste.length), [evenements, mois]);
  const pastille = (ev: Evenement | null) => (
    <button key={ev?.id ?? '*'} type="button" className="pastille-evenement" aria-pressed={(ev?.id ?? null) === valeur}
      title={ev?.mois ? ev.nom + ' · ' + MOIS[ev.mois] : undefined} onClick={() => poser(ev?.id ?? null)}>{ev ? ev.nom : 'Tous'}</button>
  );
  return (
    <div className={'pastilles-evenements' + (tout ? ' depliees' : '') + (compact ? ' compact' : '')} role="group" aria-label="Événement" onKeyDown={deplacer}>
      <div className="pastilles">
        {pastille(null)}
        {tout ? null : replies.map(pastille)}
      </div>
      {tout ? groupes.map(([titre, liste]) => (
        <div key={titre} className="pastilles-famille" role="group" aria-label={titre}>
          <span className="pastilles-titre" aria-hidden="true">{titre}</span>
          <div className="pastilles">{liste.map(pastille)}</div>
        </div>
      )) : null}
      {evenements.length > replies.length ? (
        <button type="button" className="discret pastilles-plus" aria-expanded={tout} onClick={() => poserTout(t => !t)}>
          {tout ? 'Moins d’événements' : 'Plus d’événements (' + evenements.length + ')'}
        </button>
      ) : null}
    </div>
  );
}
