// Les actions de l'editeur sur la selection (barre, menus, raccourcis). Chacune lit l'etat du moment
// au moment de l'appel (`lire`) : c'est ce qui permet au contexte des actions de ne jamais changer
// d'identite, alors que le dessin change a chaque geste.

import type { ChoixProduction } from '../model/contextes.js';
import type { RefObject } from 'react';
import { coller, combiner, dupliquer, idsMemeCouleur, modifier, separer, supprimer, supprimerAncre, type DessinSvg, type Forme, type Style } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { actionsDessin } from './actionsDessin.js';
import { phraseCombinaison, phraseDuplication, phraseMasquage, phraseVerrouillage } from './phrasesSelection.js';
import type { ActionsEditeur, Outil, Point, Vues } from './typesEditeur.js';

/** L'etat du moment : ce que les actions lisent, jamais ce qu'elles posent. */
export interface EtatLu {
  dessin: DessinSvg; sel: string[]; formeSeule: Forme | null; outil: Outil; point: number | null; style: Style; trace: readonly Point[];
  presse: readonly Forme[]; vues: Vues; lisserBooleens: boolean; enregistrer: (svg: string) => void; production: ChoixProduction;
}

/** Ce que les actions posent : des fonctions stables (setters de React, ou fabriquees une fois). */
export interface Leviers {
  appliquer: (f: (d: DessinSvg) => DessinSvg, cle?: string | null) => void; choisir: (ids: string[]) => void; poserPoint: (i: number | null) => void;
  poserOutil: (o: Outil) => void; poserOutilBrut: (o: Outil) => void; poserTrace: (t: readonly Point[]) => void; poserPresse: (p: readonly Forme[]) => void;
  dire: (t: string) => void; toile: RefObject<HTMLDivElement | null>;
}

export type ActionsMetier = Pick<ActionsEditeur, 'finirTrace' | 'supprimerSelection' | 'dupliquerSelection' | 'copierSelection' | 'couperSelection' | 'collerPresse' | 'combinerSelection' | 'separerSelection' | 'masquerSelection' | 'verrouillerSelection' | 'choisirMemeCouleur' | 'zoomerSelection' | 'enregistrerTout' | 'insererForme' | 'insererPlusieurs' | 'booleen' | 'transformerNumerique'>;

/** Les actions de la barre et des raccourcis, sur l'etat du moment. */
export function actionsEdition(lire: () => EtatLu, l: Leviers): ActionsMetier {
  return { ...actionsSelection(lire, l), ...actionsDessin(lire, l) };
}

/** Le decalage d'un duplicata ou d'un collage : deux pour cent du plan. */
export const decalage = (d: DessinSvg): number => Math.max(d.vb[2], d.vb[3]) * 0.02;

/** Les formes choisies, dans l'ordre du dessin. */
const choisiesDe = (e: EtatLu): Forme[] => e.dessin.formes.filter(f => e.sel.includes(f.id));

type ActionsSelection = Pick<ActionsEditeur, 'supprimerSelection' | 'dupliquerSelection' | 'copierSelection' | 'couperSelection' | 'collerPresse' | 'combinerSelection' | 'separerSelection' | 'masquerSelection' | 'verrouillerSelection' | 'choisirMemeCouleur'>;

function actionsSelection(lire: () => EtatLu, l: Leviers): ActionsSelection {
  const { appliquer, choisir, dire } = l;
  return {
    supprimerSelection: () => {
      const { dessin, sel, outil, formeSeule, point } = lire();
      if (outil === 'points' && formeSeule && point !== null) {
        const r = supprimerAncre(dessin, formeSeule.id, point);
        if ('erreur' in r) { dire(r.erreur); return; }
        appliquer(() => r);
        l.poserPoint(null);
        return;
      }
      if (!sel.length) return;
      appliquer(d => supprimer(d, sel));
      dire(pluriel(sel.length, 'forme') + ' supprimée' + (sel.length > 1 ? 's' : '') + '.');
      choisir([]);
    },
    dupliquerSelection: () => {
      const { dessin, sel } = lire();
      if (!sel.length) return;
      const r = dupliquer(dessin, sel, decalage(dessin), decalage(dessin));
      appliquer(() => r.dessin);
      choisir(r.ids);
      dire(phraseDuplication(r.ids));
    },
    copierSelection: () => {
      const c = choisiesDe(lire());
      if (!c.length) return;
      l.poserPresse(c);
      dire(pluriel(c.length, 'forme') + ' copiée' + (c.length > 1 ? 's' : '') + ' : Ctrl+V colle.');
    },
    couperSelection: () => {
      const e = lire(), c = choisiesDe(e);
      if (!c.length) return;
      l.poserPresse(c);
      appliquer(d => supprimer(d, e.sel));
      choisir([]);
      dire(pluriel(c.length, 'forme') + ' coupée' + (c.length > 1 ? 's' : '') + ' : Ctrl+V colle.');
    },
    collerPresse: () => {
      const { dessin, presse } = lire();
      if (!presse.length) return;
      const r = coller(dessin, presse, decalage(dessin), decalage(dessin));
      appliquer(() => r.dessin);
      choisir(r.ids);
      l.poserOutil('selection');
      dire(pluriel(r.ids.length, 'forme') + ' collée' + (r.ids.length > 1 ? 's' : '') + '.');
    },
    combinerSelection: () => {
      const { dessin, sel } = lire();
      const r = combiner(dessin, sel);
      if (!r.id) { dire('Choisissez au moins deux formes déverrouillées à combiner.'); return; }
      appliquer(() => r.dessin);
      choisir([r.id]);
      // Le moteur laisse de cote les formes verrouillees : la phrase compte ce qui a vraiment ete reuni.
      dire(phraseCombinaison(dessin.formes.filter(f => sel.includes(f.id) && !f.verrouille).length));
    },
    separerSelection: () => {
      const { dessin, formeSeule } = lire();
      if (!formeSeule) { dire('Choisissez une seule forme à séparer.'); return; }
      const r = separer(dessin, formeSeule.id);
      if (r.ids.length < 2) { dire('Cette forme n’a qu’un seul tracé : rien à séparer.'); return; }
      appliquer(() => r.dessin);
      choisir(r.ids);
      dire('Forme séparée en ' + pluriel(r.ids.length, 'tracé') + '.');
    },
    masquerSelection: () => { const { sel } = lire(); if (sel.length) { appliquer(d => modifier(d, sel, { visible: false })); choisir([]); dire(phraseMasquage(sel.length)); } },
    verrouillerSelection: () => { const { sel } = lire(); if (sel.length) { appliquer(d => modifier(d, sel, { verrouille: true })); choisir([]); dire(phraseVerrouillage(sel.length)); } },
    choisirMemeCouleur: () => {
      const { dessin, sel } = lire();
      const modele = sel[0] ? dessin.formes.find(f => f.id === sel[0]) : undefined;
      if (!modele) return;
      const couleur = modele.remplissage ?? modele.contour;
      if (!couleur) { dire('Cette forme n’a ni remplissage ni contour : pas de couleur à retrouver.'); return; }
      const ids = idsMemeCouleur(dessin, modele.id);
      choisir(ids);
      l.poserPoint(null);
      dire(ids.length > 1 ? pluriel(ids.length, 'forme') + ' de même couleur ' + couleur.toUpperCase() + ' choisie' + (ids.length > 1 ? 's' : '') + '.' : 'Aucune autre forme n’a la couleur ' + couleur.toUpperCase() + '.');
    }
  };
}
