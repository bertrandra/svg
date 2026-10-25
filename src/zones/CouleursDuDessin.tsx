// La section « Couleurs du dessin » de l'inspecteur (rien n'est choisi) : une ligne par couleur, pour la changer
// partout, choisir ses formes, ou la remplacer par une teinte du nuancier.
//
// Un dessin issu d'une photo compte des milliers de couleurs (ADR-0008) : au-dela de `SEUIL_COULEURS`, la liste se
// fenetre comme « Par couleur » (ListeCouleurs.tsx) et ses lignes se memoisent ; les couleurs ne se relisent que si
// une couleur, une visibilite ou un verrou change (deplacer une forme ne touche a rien de tout cela). Au-dessous du
// seuil, le DOM est celui d'avant : une liste, ses lignes, rien d'autre.

import { memo, useRef, type ReactElement } from 'react';
import { lireCouleursDuDessin, type CouleurDuDessin, type LectureCouleursDuDessin } from '../engine/editionSvg.js';
import { segmentsFenetre } from '../util/fenetre.js';
import { au } from '../util/tableaux.js';
import { EtatVide } from './commun/EtatVide.js';
import { Section } from './commun/Section.js';
import { useDessin } from './contexteEditeur.js';
import { montrerLigneAuClavier, useFenetreDefilante } from './Fenetre.js';
import { LigneCouleurDessin } from './LigneCouleurDessin.js';
import { SEUIL_COULEURS } from './ListeCouleurs.js';
import { useActionsCouleursDessin, type ActionsCouleurDessin } from './actionsCouleursDessin.js';
import type { SuiviCouleur } from './actionsCouleur.js';
import type { Teinte } from './typesEditeur.js';

/** L'espace entre deux lignes (`gap` de `.couleurs-dessin` dans editeur.css) : il fait partie du pas, et les cales le retirent. */
const ESPACE_LIGNES = 4;

export function CouleursDuDessin() {
  const mo = useDessin();
  // Les couleurs se relisent quand une couleur, une visibilite ou un verrou change, pas quand une forme bouge ; celles
  // qui n'ont pas change gardent leur objet, et leur ligne ne se redessine pas.
  const lecture = useRef<LectureCouleursDuDessin | null>(null);
  const courante = lireCouleursDuDessin(mo.dessin, lecture.current);
  lecture.current = courante;
  const { actions, suivi } = useActionsCouleursDessin();
  return (
    <Section titre="Couleurs du dessin" ouverte note={courante.couleurs.length}>
      {courante.couleurs.length ? <ListeCouleursDessin couleurs={courante.couleurs} nuancier={mo.nuancier} actions={actions} suivi={suivi} />
        : mo.dessin.formes.length
          ? <EtatVide genre="aucun-resultat" titre="Aucune couleur à changer.">Les formes n’ont ni remplissage ni contour : donnez-leur une couleur dans l’inspecteur, elle apparaîtra ici.</EtatVide>
          : <EtatVide genre="premiere-fois" icone="palette" titre="Aucune couleur pour l’instant.">Chaque couleur du dessin aura sa ligne ici, pour la changer partout d’un coup.</EtatVide>}
    </Section>
  );
}

interface Proprietes {
  couleurs: readonly CouleurDuDessin[];
  nuancier: readonly Teinte[];
  actions: ActionsCouleurDessin;
  suivi: SuiviCouleur | null;
}

const ListeCouleursDessin = memo(function ListeCouleursDessin({ couleurs, nuancier, actions, suivi }: Proprietes) {
  const total = couleurs.length;
  const { liste, fenetre, pas, actif } = useFenetreDefilante<HTMLUListElement>(total, SEUIL_COULEURS);
  // La ligne qu'on recolore garde sa cle d'avant le geste : remontee, elle fermerait le selecteur natif.
  const cleDe = (c: CouleurDuDessin) => (suivi && c.couleur === suivi.vers && !couleurs.some(x => x.couleur === suivi.cle) ? suivi.cle : c.couleur);
  // Elle change aussi de rang (le tri suit le nombre de formes, puis le code) : hors de la fenetre, on la garde dessinee tant que le geste dure.
  const epingle = actif && suivi ? couleurs.findIndex(c => c.couleur === suivi.vers) : -1;
  const lignes: ReactElement[] = segmentsFenetre(fenetre, total, pas, epingle >= 0 ? epingle : null, ESPACE_LIGNES).map(sg => {
    if (sg.type === 'cale') return <li key={'cale-' + sg.lieu} data-cale="" aria-hidden="true" style={{ height: sg.hauteur }} />;
    const c = au(couleurs, sg.index);
    return <LigneCouleurDessin key={cleDe(c)} c={c} nuancier={nuancier} actions={actions} rang={sg.index + 1} taille={actif ? total : 0} />;
  });
  return (
    <ul className={'couleurs-dessin' + (actif ? ' fenetree' : '')} ref={liste} onFocus={montrerLigneAuClavier}>
      {lignes}
    </ul>
  );
});
