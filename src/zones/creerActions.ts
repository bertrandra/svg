// Fabrique le contexte des actions : tous les verbes de l'editeur, faits une fois par editeur. Ils ne
// capturent aucun etat : ce qu'ils doivent savoir (le dessin, la selection, l'outil…) se lit par `lire`,
// qui rend l'etat du dernier rendu. Les setters de React, eux, sont stables par construction.

import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DessinSvg, Forme, Style } from '../engine/editionSvg.js';
import { annuler, avancer, clore, limitePourTaille, retablir, type Historique } from '../util/historique.js';
import { actionsEdition, type EtatLu } from './actions.js';
import type { Stockage } from '../io/stockage.js';
import { garderVersions, idVersion, type Version } from './session.js';
import type { ActionsEditeur, Fond, Outil, Point, Tiroir } from './typesEditeur.js';
import type { Aimant } from '../engine/transformations.js';

/** L'etat du moment, avec ce que seuls les verbes d'etat lisent en plus. */
export interface EtatDuMoment extends EtatLu { modifie: boolean; versions: readonly Version[]; fermer: () => void; stockage: Stockage | null }

/** Les setters de l'editeur (React les garde d'une identite stable). */
export interface Setters {
  poserH: Dispatch<SetStateAction<Historique<DessinSvg>>>; choisir: Dispatch<SetStateAction<string[]>>;
  poserOutilBrut: Dispatch<SetStateAction<Outil>>; poserPoint: Dispatch<SetStateAction<number | null>>; poserStyle: Dispatch<SetStateAction<Style>>;
  poserTrace: Dispatch<SetStateAction<readonly Point[]>>; poserPresse: Dispatch<SetStateAction<readonly Forme[]>>;
  poserGrille: Dispatch<SetStateAction<boolean>>; poserAimants: Dispatch<SetStateAction<boolean>>; poserGuides: Dispatch<SetStateAction<readonly Aimant[]>>;
  poserVersions: Dispatch<SetStateAction<readonly Version[]>>; poserTiroir: Dispatch<SetStateAction<Tiroir>>; poserContours: Dispatch<SetStateAction<boolean>>;
  poserFond: Dispatch<SetStateAction<Fond>>; dire: Dispatch<SetStateAction<string>>; poserQuitter: Dispatch<SetStateAction<boolean>>;
  toile: RefObject<HTMLDivElement | null>;
}

export function creerActions(lire: () => EtatDuMoment, s: Setters): ActionsEditeur {
  let compteur = 0;
  const appliquer: ActionsEditeur['appliquer'] = (f, cle = null) => { s.poserH(x => { const d = f(x.present); return avancer(x, d, cle, limitePourTaille(d.formes.length)); }); };
  const finir = () => s.poserH(x => clore(x));
  const poserOutil = (o: Outil) => { s.poserOutilBrut(o); s.poserTrace([]); s.poserPoint(null); };
  const remettreAZero = () => { s.poserPoint(null); s.poserTrace([]); s.dire(''); };
  const poserVersions = (v: readonly Version[]) => { s.poserVersions(v); garderVersions(lire().stockage, v); };
  const metier = actionsEdition(lire, { appliquer, choisir: s.choisir, poserPoint: s.poserPoint, poserOutil, poserOutilBrut: s.poserOutilBrut, poserTrace: s.poserTrace, poserPresse: s.poserPresse, dire: s.dire, toile: s.toile });
  return {
    appliquer, finir, poserOutil,
    faire: (f, texte = '') => { appliquer(f); s.dire(texte); },
    // Un geste qui n'a rien produit (un rectangle sans surface) retire l'entree qu'il avait ouverte.
    annulerGeste: cle => s.poserH(x => (x.cle === cle ? clore(annuler(x)) : x)),
    defaire: () => { s.poserH(x => annuler(clore(x))); remettreAZero(); },
    refaire: () => { s.poserH(x => retablir(x)); remettreAZero(); },
    nouvelleCle: () => 'geste-' + ++compteur,
    dire: s.dire, choisir: s.choisir, poserPoint: s.poserPoint, poserStyle: s.poserStyle, poserTrace: s.poserTrace,
    poserGrille: s.poserGrille, poserAimants: s.poserAimants, poserGuides: s.poserGuides, poserTiroir: s.poserTiroir, poserContours: s.poserContours, poserFond: s.poserFond,
    demanderFermeture: () => { const e = lire(); if (e.modifie) s.poserQuitter(true); else e.fermer(); },
    fermer: () => lire().fermer(),
    continuerEdition: () => s.poserQuitter(false),
    garderVersion: (nom, svg) => {
      const quand = Date.now(), { versions } = lire();
      poserVersions([{ id: idVersion(quand, versions.length), nom, svg, quand }, ...versions]);
      s.dire('Version « ' + nom + ' » gardée dans ce navigateur.');
    },
    supprimerVersion: id => poserVersions(lire().versions.filter(v => v.id !== id)),
    ...metier
  };
}
