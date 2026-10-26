// Le fil d'Ariane du contexte d'edition (ADR-0012, annexe 6 §2) : « Racine › Nuage › Soleil », dans la barre d'etat, seulement quand
// on est entre dans un groupe. Un `nav` nomme, une liste ordonnee de boutons : chacun ramene a son niveau (le groupe quitte reste
// choisi, et le niveau d'arrivee se dit) ; le dernier est le niveau ou l'on est, marque `aria-current`, et ne se clique pas.
//
// Le bouton qui avait le focus disparait toujours (a la racine le fil entier s'en va, ailleurs le niveau atteint devient le dernier,
// qui n'est plus un bouton) : le focus va alors a la toile, ou le groupe quitte est choisi, au lieu de tomber sur le corps de la page
// (Tab ne doit jamais repartir du debut, ADR-0011).

import { memo } from 'react';
import { nomDeGroupe } from '../engine/description.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { focusAuClavier } from './commun/focusClavier.js';
import { remonterVers } from './commandesGroupes.js';
import { cheminGroupes } from './phrasesGroupes.js';

export const FilAriane = memo(function FilAriane() {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  const actuel = ui.contexte?.groupe ?? null;
  if (actuel === null) return null;
  const chemin = cheminGroupes(mo.dessin, actuel);
  const aller = (cible: string | null, bouton: HTMLElement) => {
    const racine = bouton.closest('.editeur-svg');
    remonterVers(mo, ui, ac, cible);
    // Le bouton s'en va : la toile reprend le focus (pose apres le rendu qui le retire).
    setTimeout(() => focusAuClavier(racine?.querySelector<HTMLElement>('.editeur-svg-toile')), 0);
  };
  return (
    <nav className="fil-ariane" aria-label="Contexte d’édition">
      <ol>
        <li><button type="button" className="discret" onClick={e => aller(null, e.currentTarget)}>Racine</button></li>
        {chemin.map((n, i) => {
          if (n.genre !== 'groupe') return null;
          const nom = nomDeGroupe(n.groupe), dernier = i === chemin.length - 1;
          return (
            <li key={n.groupe.id}>
              <span className="separateur" aria-hidden="true">›</span>
              {dernier
                ? <span aria-current="location">{nom}</span>
                : <button type="button" className="discret" onClick={e => aller(n.groupe.id, e.currentTarget)}>{nom}</button>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
