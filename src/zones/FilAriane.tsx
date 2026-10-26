// Le fil d'Ariane du contexte d'edition (ADR-0012, annexe 6 §2) : « Racine › Nuage › Soleil », dans la barre d'etat, seulement quand
// on est entre dans un groupe. Un `nav` nomme, une liste ordonnee de boutons : chacun ramene a son niveau (le groupe quitte reste
// choisi, et le niveau d'arrivee se dit) ; le dernier est le niveau ou l'on est, marque `aria-current`, et ne se clique pas.
//
// Dans une decoupe ou un masque (paquet 8-D) : « Racine › Nuage › Découpe », puis les groupes du contenu ou l'on est entre. Les niveaux
// du dessin font sortir de la lentille (un contenu vide refuse, et dit quoi faire) ; ceux du contenu y laissent.
//
// Le bouton qui avait le focus disparait toujours (a la racine le fil entier s'en va, ailleurs le niveau atteint devient le dernier,
// qui n'est plus un bouton) : le focus va alors a la toile, ou le groupe quitte est choisi, au lieu de tomber sur le corps de la page
// (Tab ne doit jamais repartir du debut, ADR-0011). Un refus garde le bouton : le focus reste ou il est.

import { memo } from 'react';
import { nomDeGroupe } from '../engine/description.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { focusAuClavier } from './commun/focusClavier.js';
import { remonterDansLentille, remonterVers } from './commandesGroupes.js';
import { cheminGroupes } from './phrasesGroupes.js';
import { nomContenu } from './phrasesContenus.js';
import { dessinComplet, lentilleDe } from './lentille.js';
import { t } from '../util/i18n.js';

export const FilAriane = memo(function FilAriane() {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  const actuel = ui.contexte?.groupe ?? null;
  if (actuel === null) return null;
  const lentille = lentilleDe(ui.contexte), complet = dessinComplet(mo);
  const chemin = cheminGroupes(complet, actuel);
  const sous = lentille ? cheminGroupes(mo.dessin, ui.contexte?.sous ?? null) : [];
  const aller = (cible: string | null, bouton: HTMLElement, dansContenu = false) => {
    const racine = bouton.closest('.editeur-svg');
    if (lentille) remonterDansLentille(mo, ui, ac, cible, dansContenu); else remonterVers(mo, ui, ac, cible);
    // Le bouton s'en va : la toile reprend le focus (pose apres le rendu qui le retire), sauf si rien n'a change (un contenu vide refuse).
    setTimeout(() => { if (!bouton.isConnected) focusAuClavier(racine?.querySelector<HTMLElement>('.editeur-svg-toile')); }, 0);
  };
  return (
    <nav className="fil-ariane" aria-label={t('Contexte d’édition')}>
      <ol>
        <li><button type="button" className="discret" onClick={e => aller(null, e.currentTarget)}>{t('Racine')}</button></li>
        {chemin.map((n, i) => {
          if (n.genre !== 'groupe') return null;
          // Dans une lentille, le groupe qui porte le contenu se clique aussi : on sort alors dans ce groupe.
          const nom = nomDeGroupe(n.groupe), dernier = i === chemin.length - 1 && !lentille;
          return (
            <li key={n.groupe.id}>
              <span className="separateur" aria-hidden="true">›</span>
              {dernier
                ? <span aria-current="location">{nom}</span>
                : <button type="button" className="discret" onClick={e => aller(n.groupe.id, e.currentTarget)}>{nom}</button>}
            </li>
          );
        })}
        {lentille ? (
          <li key="contenu">
            <span className="separateur" aria-hidden="true">›</span>
            {sous.length
              ? <button type="button" className="discret" onClick={e => aller(null, e.currentTarget, true)}>{nomContenu(lentille.genre)}</button>
              : <span aria-current="location">{nomContenu(lentille.genre)}</span>}
          </li>
        ) : null}
        {sous.map((n, i) => {
          if (n.genre !== 'groupe') return null;
          const nom = nomDeGroupe(n.groupe), dernier = i === sous.length - 1;
          return (
            <li key={'sous-' + n.groupe.id}>
              <span className="separateur" aria-hidden="true">›</span>
              {dernier
                ? <span aria-current="location">{nom}</span>
                : <button type="button" className="discret" onClick={e => aller(n.groupe.id, e.currentTarget, true)}>{nom}</button>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});
