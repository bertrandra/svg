// La ligne « Dégradés » des listes de couleurs (ADR-0012, etape 4, paquet 4-A) : un cote peint d'un degrade n'est pas une couleur du
// dessin (les listes l'ignorent, engine/edition/couleurs.ts), mais ses formes ne doivent pas disparaitre de ce qui se regle par couleur.
// Une ligne les compte, dit combien de degrades distincts elles portent, et les choisit d'un clic : l'inspecteur regle alors leurs
// arrets. Absente d'un dessin sans degrade (tout dessin plat) : le DOM des listes reste celui d'avant.

import { memo, useMemo } from 'react';
import { degradesDistincts, formesADegrade, type DessinSvg } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { useActions } from './contexteEditeur.js';

/** La ligne, pour le fond, le trait ou les deux (`sur`), ou rien s'il n'y a aucun degrade de ce cote. */
export const LigneDegrades = memo(function LigneDegrades({ dessin, sur = 'tout' }: { dessin: DessinSvg; sur?: 'tout' | 'remplissage' | 'contour' }) {
  const ac = useActions();
  const ids = useMemo(() => formesADegrade(dessin, sur), [dessin, sur]);
  const distincts = useMemo(() => degradesDistincts(dessin, ids, sur), [dessin, ids, sur]);
  if (!ids.length) return null;
  const choisir = () => {
    const verrous = new Set(dessin.formes.filter(f => f.verrouille).map(f => f.id));
    const libres = ids.filter(id => !verrous.has(id));
    ac.choisir(libres);
    ac.annoncer(libres.length ? pluriel(libres.length, 'forme') + ' à dégradé sélectionnée' + (libres.length > 1 ? 's' : '') + '.' : 'Les formes à dégradé sont verrouillées.');
  };
  return (
    <p className="ligne-degrades">
      <button type="button" className="discret" title="Sélectionner les formes peintes d’un dégradé : leurs arrêts se règlent dans l’inspecteur" onClick={choisir}>
        Dégradés <span className="couleur-compte">· {pluriel(distincts, 'dégradé')}, {pluriel(ids.length, 'forme')}</span>
      </button>
    </p>
  );
});
