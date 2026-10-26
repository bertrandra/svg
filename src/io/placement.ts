// L'imbrication « avancée » de Dupliquer sur la feuille (ADR-0039), par tranches : le moteur avance d'un nombre d'essais, la page
// mesure le temps ici et rend la main au navigateur entre deux tranches, pour que l'interface reste vive et qu'on puisse arreter.
// Au-dela du budget de temps, le calcul s'arrete et rend le meilleur placement trouve (le moteur le dit « limite »). Le moteur ne
// voit jamais l'horloge (ADR-0005, ADR-0008) : il recoit des essais, la mesure vit dans `io`.

import { avancerPlacement, type EtatPlacement } from '../engine/preparation.js';

export interface OptionsTranches {
  /** Le temps de calcul d'une tranche avant de rendre la main, en millisecondes (une image a 60 Hz en laisse 16). */
  readonly tranche?: number;
  /** Le temps total au-dela duquel le meilleur placement trouve est rendu, en millisecondes. */
  readonly budget?: number;
  /** Les essais d'un pas du moteur : assez petit pour mesurer souvent, assez grand pour ne pas mesurer pour rien. */
  readonly pas?: number;
  /** Ce qu'on sait apres chaque tranche : les copies trouvees jusqu'ici. */
  readonly progres?: (e: EtatPlacement) => void;
}

export interface TachePlacement {
  /** Arrete le calcul : la promesse se resout alors avec `annule: true`. */
  readonly annuler: () => void;
  readonly fin: Promise<{ readonly etat: EtatPlacement; readonly annule: boolean; readonly ms: number }>;
}

const maintenant = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Lance l'imbrication par tranches ; un etat deja fini (l'optimisation simple) se rend tout de suite. */
export function placerParTranches(depart: EtatPlacement, o: OptionsTranches = {}): TachePlacement {
  const tranche = o.tranche ?? 12, budget = o.budget ?? 4000, pas = o.pas ?? 200;
  let annule = false, etat = depart;
  const debut = maintenant();
  const fin = new Promise<{ etat: EtatPlacement; annule: boolean; ms: number }>(resoudre => {
    const tour = () => {
      if (annule) { resoudre({ etat, annule: true, ms: maintenant() - debut }); return; }
      const t = maintenant();
      while (!etat.fini && maintenant() - t < tranche) etat = avancerPlacement(etat, pas);
      o.progres?.(etat);
      if (etat.fini || maintenant() - debut >= budget) { resoudre({ etat, annule: false, ms: maintenant() - debut }); return; }
      setTimeout(tour, 0);
    };
    tour();
  });
  return { annuler: () => { annule = true; }, fin };
}
