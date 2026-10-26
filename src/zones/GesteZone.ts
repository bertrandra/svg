// Le geste du cadre et du lasso a la souris, au stylet ou au doigt (ADR-0035). Gestes.ts l'appelle en quelques lignes : avec
// l'outil de selection, un glisser commence sur le vide ; avec l'outil Cadre ou Lasso, partout, meme sur une forme (une forme sous
// un grand fond se prend ainsi, et c'est le seul moyen au doigt). Pendant le geste, les formes que le relachement prendra sont
// calculees (engine/selection.ts, pur) et montrees par la toile (ZoneToile.tsx) ; au relachement, la selection change et la region
// vocale le dit. Alt retire, Maj ajoute, sinon la selection est remplacee.

import { useState, useSyncExternalStore } from 'react';
import { appliquerZone, noeudsDansZone, pointLasso, rectangleDe, type EffetZone, type PointZone, type RegleZone, type Zone } from '../engine/selection.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { effetDe, phraseZone } from './commandesSelection.js';
import type { OutilZone } from './typesEditeur.js';
import { niveauEdition } from './lentille.js';

/** Ce que la toile montre d'un geste de zone en cours : sa forme, ses points (deux coins, ou le lasso), sa regle, et l'apercu. */
export interface ZoneEnCours {
  readonly forme: OutilZone;
  readonly points: readonly PointZone[];
  readonly regle: RegleZone;
  readonly effet: EffetZone;
  /** Les formes que le relachement prendra (ou retirera, avec Alt). */
  readonly ids: readonly string[];
}

/** La zone d'un geste : le rectangle de ses deux coins, ou le polygone du lasso. */
export const zoneDe = (forme: OutilZone, points: readonly PointZone[]): Zone | null => {
  if (forme === 'lasso') return points.length >= 3 ? { lasso: points } : null;
  const [a, b] = [points[0], points[points.length - 1]];
  return a && b ? { rect: rectangleDe(a, b) } : null;
};

/** Deux tableaux d'identifiants egaux : l'apercu garde alors le meme, et la toile ne redessine rien. */
const memes = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** Le pas du lasso, en pixels d'ecran : un point tous les trois pixels suffit a suivre la main. */
const PAS_LASSO = 3;

/**
 * Au-dela de ce nombre de formes dans l'apercu, il ne se redessine qu'une fois par intervalle (et a l'arret du pointeur) : la zone
 * suit chaque mouvement. Sur 5 000 formes prises, espacer l'apercu gagne de 15 a 20 % par image (mesure, ADR-0035).
 */
const APERCU_IMMEDIAT = 300;
const INTERVALLE_APERCU = 120;

/**
 * Le geste en cours, hors de l'etat de React : la toile qui porte les gestes (ToileEditeur, et sur un gros dessin ses milliers de
 * calques memoises a comparer) ne se redessine pas a chaque mouvement ; seul le dessin de la zone s'y abonne (`useZoneEnCours`).
 */
export interface MagasinZone {
  readonly lire: () => ZoneEnCours | null;
  readonly abonner: (rappel: () => void) => () => void;
}

function creerMagasin(): MagasinZone & { poser: (z: ZoneEnCours | null) => void } {
  let zone: ZoneEnCours | null = null;
  const abonnes = new Set<() => void>();
  return {
    lire: () => zone,
    abonner: rappel => { abonnes.add(rappel); return () => { abonnes.delete(rappel); }; },
    poser: z => { zone = z; for (const a of abonnes) a(); }
  };
}

/** La zone en cours d'un magasin, pour la dessiner. */
export const useZoneEnCours = (m: MagasinZone): ZoneEnCours | null => useSyncExternalStore(m.abonner, m.lire, m.lire);

export function useGesteZone() {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  const [magasin] = useState(creerMagasin);
  // L'apercu differe d'un gros geste : quand il a ete pose pour la derniere fois, et le minuteur qui posera le suivant.
  const [differe] = useState(() => ({ quand: 0, minuteur: 0 as ReturnType<typeof setTimeout> | 0 }));
  const zoom = ui.vues.vue.zoom;

  const apercu = (z: Omit<ZoneEnCours, 'ids'>, avant: readonly string[]): readonly string[] => {
    const geo = zoneDe(z.forme, z.points);
    // Au niveau du contexte d'edition (ADR-0012, annexe 6 §2) ; un dessin plat : ses formes, comme avant.
    const ids = geo ? noeudsDansZone(mo.dessin, niveauEdition(ui.contexte), geo, { regle: z.regle, contours: ui.contours }) : [];
    return memes(ids, avant) ? avant : ids;
  };
  const poser = magasin.poser;

  return {
    /** Le geste en cours, auquel le dessin de la zone s'abonne (ZoneToile.tsx). */
    zone: magasin as MagasinZone,
    /** Commence un cadre ou un lasso au point du plan ; les touches du moment disent l'effet. */
    commencer(forme: OutilZone, p: PointZone, e: { readonly shiftKey: boolean; readonly altKey: boolean }): void {
      poser({ forme, points: [p], regle: ui.regleZone, effet: effetDe(e), ids: [] });
    },
    /** Le pointeur bouge : vrai quand un geste de zone est en cours (Gestes.ts n'a alors rien d'autre a faire). */
    bouger(p: PointZone): boolean {
      const z = magasin.lire();
      if (!z) return false;
      let points: readonly PointZone[];
      if (z.forme === 'cadre') points = [z.points[0] ?? p, p];
      else {
        const q = pointLasso(z.points, p, PAS_LASSO / zoom);
        if (!q) return true;
        points = [...z.points, q];
      }
      const suite = { ...z, points }, ids = apercu(suite, z.ids), maintenant = performance.now();
      if (ids.length <= APERCU_IMMEDIAT || maintenant - differe.quand >= INTERVALLE_APERCU) {
        differe.quand = maintenant;
        poser({ ...suite, ids });
        return true;
      }
      // Un gros apercu attend son tour : la zone suit le pointeur, l'apercu suivra a la fin de l'intervalle.
      poser({ ...suite, ids: z.ids });
      if (!differe.minuteur) {
        differe.minuteur = setTimeout(() => {
          differe.minuteur = 0;
          differe.quand = performance.now();
          const encore = magasin.lire();
          if (encore) poser({ ...encore, ids: apercu(encore, encore.ids) });
        }, INTERVALLE_APERCU - (maintenant - differe.quand));
      }
      return true;
    },
    /** Le pointeur se leve : la selection change et c'est dit. Vrai quand un geste de zone etait en cours. */
    lacher(p: PointZone): boolean {
      const z = magasin.lire();
      if (!z) return false;
      poser(null);
      if (differe.minuteur) { clearTimeout(differe.minuteur); differe.minuteur = 0; }
      const points = z.forme === 'cadre' ? [z.points[0] ?? p, p] : [...z.points, p];
      const xs = points.map(q => q[0]), ys = points.map(q => q[1]);
      // Un geste sans etendue a l'ecran est un clic sur le vide : il vide la selection (sauf a ajouter ou retirer), comme avant.
      if ((Math.max(...xs) - Math.min(...xs)) * zoom < 3 && (Math.max(...ys) - Math.min(...ys)) * zoom < 3) {
        if (z.effet === 'remplacer') ac.choisir([]);
        return true;
      }
      const geo = zoneDe(z.forme, points);
      const pris = geo ? noeudsDansZone(mo.dessin, niveauEdition(ui.contexte), geo, { regle: z.regle, contours: ui.contours }) : [];
      const apres = appliquerZone(mo.sel, pris, z.effet);
      ac.choisir(apres);
      ac.poserPoint(null);
      ac.annoncer(phraseZone(z.forme, z.effet, mo.sel, apres));
      return true;
    },
    /** Un second doigt pince la vue : le geste de zone s'arrete sans rien changer. */
    annuler(): void { if (differe.minuteur) { clearTimeout(differe.minuteur); differe.minuteur = 0; } if (magasin.lire()) poser(null); }
  };
}
