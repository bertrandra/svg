// La ligne « Dégradés » des listes de couleurs (ADR-0012, etape 4, paquet 4-A ; etape 13d) : les couleurs des arrets d'un degrade
// sont des couleurs du dessin (engine/edition/couleurs.ts) et ont chacune leur ligne dans la liste, ou elles se remplacent partout.
// Cette ligne-ci regarde les degrades eux-memes : elle compte leurs formes, les degrades distincts et les couleurs de leurs arrets, et
// choisit ces formes d'un clic : l'inspecteur regle alors leurs arrets. Absente d'un dessin sans degrade (tout dessin plat) : le DOM
// des listes reste celui d'avant.

import { memo, useMemo } from 'react';
import { couleursDArrets, degradesDistincts, formesADegrade, type DessinSvg } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';
import { useActions } from './contexteEditeur.js';

/** La ligne, pour le fond, le trait ou les deux (`sur`), ou rien s'il n'y a aucun degrade de ce cote. */
export const LigneDegrades = memo(function LigneDegrades({ dessin, sur = 'tout' }: { dessin: DessinSvg; sur?: 'tout' | 'remplissage' | 'contour' }) {
  const ac = useActions();
  const ids = useMemo(() => formesADegrade(dessin, sur), [dessin, sur]);
  const distincts = useMemo(() => degradesDistincts(dessin, ids, sur), [dessin, ids, sur]);
  const couleurs = useMemo(() => couleursDArrets(dessin, ids, sur), [dessin, ids, sur]);
  if (!ids.length) return null;
  const choisir = () => {
    const verrous = new Set(dessin.formes.filter(f => f.verrouille).map(f => f.id));
    const libres = ids.filter(id => !verrous.has(id));
    ac.choisir(libres);
    const formes = pluriel(libres.length, 'forme');
    ac.annoncer(libres.length ? (libres.length > 1 ? t('{formes} à dégradé sélectionnées.', { formes }) : t('{formes} à dégradé sélectionnée.', { formes })) : t('Les formes à dégradé sont verrouillées.'));
  };
  return (
    <p className="ligne-degrades">
      <button type="button" className="discret" title={t('Sélectionner les formes peintes d’un dégradé : leurs arrêts se règlent dans l’inspecteur ; chaque couleur d’arrêt a aussi sa ligne dans la liste, pour la changer partout')} onClick={choisir}>
        {t('Dégradés')} <span className="couleur-compte">
· {pluriel(distincts, 'dégradé')}, {pluriel(ids.length, 'forme')}, {pluriel(couleurs, 'couleur')}</span>
      </button>
    </p>
  );
});
