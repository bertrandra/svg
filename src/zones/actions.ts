// Les actions de l'editeur (barre, menus, raccourcis) : chacune lit l'etat du moment et rend un nouveau dessin.

import type { RefObject } from 'react';
import {
  ajouterForme, boiteDe, coller, combiner, dupliquer, ecrireDessin, inserer, inserer as insererDessin, lireDessin, modifier, polygone, separer, supprimer, supprimerAncre,
  type DessinSvg, type Forme, type Style
} from '../engine/editionSvg.js';
import { appliquerBooleen } from '../engine/booleens.js';
import { incliner, mettreALEchelle, tournerAutour } from '../engine/transformations.js';
import { nettoyerSvg } from '../util/svg.js';
import { sansDoublons, styleLigne } from './aidesEditeur.js';
import type { Edition, Outil, Point, Vues } from './typesEditeur.js';

export interface BaseActions {
  dessin: DessinSvg; sel: string[]; formeSeule: Forme | null; outil: Outil; point: number | null; style: Style; trace: readonly Point[];
  presse: readonly Forme[]; poserPresse: (p: readonly Forme[]) => void;
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void; choisir: (ids: string[]) => void; poserPoint: (i: number | null) => void;
  poserOutil: (o: Outil) => void; poserOutilBrut: (o: Outil) => void; poserTrace: (t: readonly Point[]) => void; dire: (t: string) => void;
  vues: Vues; enregistrer: (svg: string) => void; toile: RefObject<HTMLDivElement | null>;
}

export type Actions = Pick<Edition, 'finirTrace' | 'supprimerSelection' | 'dupliquerSelection' | 'copierSelection' | 'couperSelection' | 'collerPresse' | 'combinerSelection' | 'separerSelection' | 'masquerSelection' | 'verrouillerSelection' | 'zoomerSelection' | 'enregistrerTout' | 'insererForme' | 'insererPlusieurs' | 'booleen' | 'transformerNumerique'>;

/** Les actions de la barre et des raccourcis, sur l'etat du moment. */
export function actionsEdition(b: BaseActions): Actions {
  const { dessin, sel, appliquer, choisir, dire } = b;
  const pl = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
  const choisies = () => dessin.formes.filter(f => sel.includes(f.id));
  const pas = () => Math.max(dessin.vb[2], dessin.vb[3]) * 0.02;
  const supprimerSelection = () => {
    if (b.outil === 'points' && b.formeSeule && b.point !== null) {
      const r = supprimerAncre(dessin, b.formeSeule.id, b.point);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r);
      b.poserPoint(null);
      return;
    }
    if (!sel.length) return;
    appliquer(d => supprimer(d, sel));
    dire(pl(sel.length, 'forme') + ' supprimée' + (sel.length > 1 ? 's' : '') + '.');
    choisir([]);
  };
  return {
    supprimerSelection,
    dupliquerSelection: () => {
      if (!sel.length) return;
      const r = dupliquer(dessin, sel, pas(), pas());
      appliquer(() => r.dessin);
      choisir(r.ids);
    },
    copierSelection: () => {
      const c = choisies();
      if (!c.length) return;
      b.poserPresse(c);
      dire(pl(c.length, 'forme') + ' copiée' + (c.length > 1 ? 's' : '') + ' : Ctrl+V colle.');
    },
    couperSelection: () => {
      const c = choisies();
      if (!c.length) return;
      b.poserPresse(c);
      appliquer(d => supprimer(d, sel));
      choisir([]);
      dire(pl(c.length, 'forme') + ' coupée' + (c.length > 1 ? 's' : '') + ' : Ctrl+V colle.');
    },
    collerPresse: () => {
      if (!b.presse.length) return;
      const r = coller(dessin, b.presse, pas(), pas());
      appliquer(() => r.dessin);
      choisir(r.ids);
      b.poserOutil('selection');
      dire(pl(r.ids.length, 'forme') + ' collée' + (r.ids.length > 1 ? 's' : '') + '.');
    },
    combinerSelection: () => {
      const r = combiner(dessin, sel);
      if (!r.id) { dire('Choisissez au moins deux formes déverrouillées à combiner.'); return; }
      appliquer(() => r.dessin);
      choisir([r.id]);
      dire('Formes combinées en une seule ; « Trous : pair-impair » creuse les recouvrements.');
    },
    separerSelection: () => {
      const f = b.formeSeule;
      if (!f) { dire('Choisissez une seule forme à séparer.'); return; }
      const r = separer(dessin, f.id);
      if (r.ids.length < 2) { dire('Cette forme n’a qu’un seul tracé : rien à séparer.'); return; }
      appliquer(() => r.dessin);
      choisir(r.ids);
      dire('Forme séparée en ' + pl(r.ids.length, 'tracé') + '.');
    },
    masquerSelection: () => { if (sel.length) { appliquer(d => modifier(d, sel, { visible: false })); choisir([]); } },
    verrouillerSelection: () => { if (sel.length) { appliquer(d => modifier(d, sel, { verrouille: true })); choisir([]); dire('Formes verrouillées : déverrouillez-les dans les calques.'); } },
    zoomerSelection: () => {
      const bo = boiteDe(dessin, sel), el = b.toile.current;
      if (!bo || !el || !(bo.l > 0) || !(bo.h > 0)) { b.vues.ajuster(); return; }
      const zoom = Math.max(0.02, Math.min(64, Math.min(el.clientWidth / bo.l, el.clientHeight / bo.h) * 0.8));
      b.vues.poserVue({ zoom, x: (el.clientWidth - bo.l * zoom) / 2 - bo.x * zoom, y: (el.clientHeight - bo.h * zoom) / 2 - bo.y * zoom });
    },
    enregistrerTout: () => {
      const propre = nettoyerSvg(ecrireDessin(dessin, 3));
      if (!propre) { dire('Le dessin n’a plus de forme visible : rien à enregistrer.'); return; }
      b.enregistrer(propre.svg);
    },
    finirTrace: (fermerTrace: boolean) => {
      const points = sansDoublons(b.trace, Math.max(dessin.vb[2], dessin.vb[3]) / 1000);
      b.poserTrace([]);
      if (points.length < 2) return;
      const ferme = fermerTrace && points.length > 2;
      const r = ajouterForme(dessin, polygone(points, ferme), ferme ? b.style : styleLigne(b.style));
      if (!r.id) return;
      appliquer(() => r.dessin);
      choisir([r.id]);
      b.poserOutilBrut('selection');
      dire('Tracé ajouté : ' + points.length + ' points.');
    },
    insererForme: (svgForme: string) => {
      const autre = lireDessin(svgForme);
      if ('erreur' in autre) { dire(autre.erreur); return; }
      const [vx, vy, vl, vh] = dessin.vb, c = Math.min(vl, vh) / 3;
      const r = inserer(dessin, autre.dessin, { x: vx + (vl - c) / 2, y: vy + (vh - c) / 2, l: c, h: c });
      if (!r.ids.length) return;
      appliquer(() => r.dessin);
      choisir(r.ids);
      b.poserOutil('selection');
      dire('Forme insérée au centre : déplacez-la, redimensionnez-la, recolorez-la.');
    },
    // Plusieurs formes d'un coup, chacune a sa place relative (0 a 1) dans le carre inscrit au plan.
    insererPlusieurs: elements => {
      const [vx, vy, vl, vh] = dessin.vb, c = Math.min(vl, vh), ox = vx + (vl - c) / 2, oy = vy + (vh - c) / 2;
      let d = dessin;
      const ids: string[] = [];
      for (const e of elements) {
        const autre = lireDessin(e.svg);
        if ('erreur' in autre) continue;
        const r = insererDessin(d, autre.dessin, { x: ox + e.x * c, y: oy + e.y * c, l: e.taille * c, h: e.taille * c });
        d = r.dessin;
        ids.push(...r.ids);
      }
      if (!ids.length) return;
      appliquer(() => d);
      choisir(ids);
      b.poserOutil('selection');
      dire(pl(ids.length, 'forme') + ' insérée' + (ids.length > 1 ? 's' : '') + '.');
    },
    booleen: op => {
      const r = appliquerBooleen(dessin, sel, op);
      if (r.erreur) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      choisir(r.id ? [r.id] : []);
      dire(r.id ? 'Opération appliquée : le résultat est en segments droits, au style de la forme la plus basse.' : 'Il ne reste rien : les formes ont disparu. Ctrl+Z revient en arrière.');
    },
    transformerNumerique: t => {
      if (!sel.length) return;
      let d = dessin;
      if (t.rotation) d = tournerAutour(d, sel, t.rotation);
      if (t.inclinaisonX || t.inclinaisonY) d = incliner(d, sel, t.inclinaisonX ?? 0, t.inclinaisonY ?? 0);
      if (t.echelle && t.echelle !== 100) d = mettreALEchelle(d, sel, t.echelle / 100);
      if (d !== dessin) appliquer(() => d);
    }
  };
}
