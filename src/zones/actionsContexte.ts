// Les verbes du contexte d'edition (ADR-0012, annexe 6 §2 ; paquet 8-D) : poser le contexte ou le niveau, entrer dans un groupe, en
// sortir, et sortir d'une decoupe ou d'un masque. Dans une lentille, `lire().dessin` est le dessin de travail du contenu et
// `lire().complet` le dessin de l'historique : entrer et sortir d'un groupe se font dans le contenu, et sortir de sa racine quitte la
// lentille. Comme les autres actions, ils lisent l'etat du moment et ne capturent rien.

import type { Dispatch, SetStateAction } from 'react';
import { contenuDuGroupe, contenuVide, contexteValide, type DessinSvg } from '../engine/editionSvg.js';
import type { ActionsEditeur, ContexteEdition } from './typesEditeur.js';
import { avecNiveau, contexteDuDessin, lentilleDe, type Lentille } from './lentille.js';
import { PHRASE_RACINE, phraseEntreeGroupe } from './phrasesGroupes.js';
import { phraseContenuVide, phraseRacineContenu, phraseSortieContenu } from './phrasesContenus.js';

/** Ce que ces verbes lisent : le dessin qu'on voit, le dessin complet (dans une lentille) et le contexte du moment. */
export interface EtatContexte { dessin: DessinSvg; complet?: DessinSvg | undefined; contexte?: ContexteEdition | null | undefined }

/** Les setters que ces verbes emploient. */
export interface SettersContexte {
  poserContexte: Dispatch<SetStateAction<ContexteEdition | null>>; choisir: Dispatch<SetStateAction<string[]>>;
  poserPoint: Dispatch<SetStateAction<number | null>>; poserDeplies: Dispatch<SetStateAction<ReadonlySet<string>>>;
}

export type ActionsContexte = Pick<ActionsEditeur, 'poserContexte' | 'poserNiveau' | 'entrerGroupe' | 'sortirGroupe' | 'deplier'>;

export function actionsContexte(lire: () => EtatContexte, s: SettersContexte, dire: (t: string) => void, annoncer: (t: string) => void): ActionsContexte {
  const complet = (): DessinSvg => { const e = lire(); return e.complet ?? e.dessin; };
  /**
   * Sortir d'une decoupe ou d'un masque : le contenu est deja repose (chaque geste l'a fait), on revient dans son groupe et on le dit.
   * Un contenu vide cacherait tout le groupe : on reste, et on dit quoi faire (Echap et Maj+Entree passent par ici ; le fil d'Ariane
   * par `remonterDansLentille`, qui juge de meme).
   */
  const sortirContenu = (l: Lentille): void => {
    const d = complet(), c = contenuDuGroupe(d, l.groupe, l.genre);
    if (c && contenuVide(c)) { dire(phraseContenuVide(l.genre)); return; }
    s.poserContexte({ groupe: l.groupe });
    s.choisir([]);
    s.poserPoint(null);
    annoncer(phraseSortieContenu(d, l.groupe, l.genre));
  };
  return {
    poserContexte: c => s.poserContexte(contexteDuDessin(complet(), c)),
    poserNiveau: groupe => { const { contexte } = lire(); s.poserContexte(contexteDuDessin(complet(), avecNiveau(contexte, groupe))); },
    entrerGroupe: id => {
      // Dans une lentille, on entre dans un groupe du contenu : `dessin` est alors le dessin de travail.
      const { dessin, contexte } = lire(), phrase = contexteValide(dessin, id) ? phraseEntreeGroupe(dessin, id) : null;
      if (!phrase) return false;
      s.poserContexte(avecNiveau(contexte, id));
      s.choisir([]);
      s.poserPoint(null);
      annoncer(phrase);
      return true;
    },
    sortirGroupe: () => {
      const { dessin, contexte } = lire(), l = lentilleDe(contexte);
      if (l) {
        // Dans un groupe du contenu : on remonte d'un niveau dans le contenu ; a sa racine, on sort de la lentille.
        const sous = contexte?.sous !== undefined ? contexteValide(dessin, contexte.sous) : null;
        if (sous === null) { sortirContenu(l); return true; }
        const parent = contexteValide(dessin, dessin.groupes?.[sous]?.parent);
        s.poserContexte(avecNiveau(contexte, parent));
        s.choisir([sous]);
        s.poserPoint(null);
        annoncer((parent ? phraseEntreeGroupe(dessin, parent) : null) ?? phraseRacineContenu(complet(), l.groupe, l.genre));
        return true;
      }
      const actuel = contexteValide(dessin, contexte?.groupe);
      if (!actuel) return false;
      const parent = contexteValide(dessin, dessin.groupes?.[actuel]?.parent);
      s.poserContexte(parent ? { groupe: parent } : null);
      // Le groupe quitte reste choisi : on voit d'ou l'on sort, et Echap suivant vide la selection, comme partout.
      s.choisir([actuel]);
      s.poserPoint(null);
      annoncer((parent ? phraseEntreeGroupe(dessin, parent) : null) ?? PHRASE_RACINE);
      return true;
    },
    deplier: (ids, deplie) => s.poserDeplies(avant => {
      const change = ids.filter(id => avant.has(id) !== deplie);
      if (!change.length) return avant;
      const apres = new Set(avant);
      for (const id of change) { if (deplie) apres.add(id); else apres.delete(id); }
      return apres;
    })
  };
}
