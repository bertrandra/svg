// Les actions de l'editeur qui touchent le dessin entier ou la vue : zoom sur la selection,
// enregistrement, fin du trace a la plume, insertions de la bibliotheque, booleens, transformations
// chiffrees. Meme regle que actions.ts : l'etat se lit au moment de l'appel.

import { ajouterForme, boiteDe, inserer, lireDessin, marquerOrigine, polygone, type DessinSvg } from '../engine/editionSvg.js';
import { appliquerBooleen } from '../engine/booleens.js';
import { incliner, mettreALEchelle, tournerAutour } from '../engine/transformations.js';
import { nettoyerSvg } from '../util/svg.js';
import { pluriel } from '../util/texte.js';
import { phraseBooleen, sansDoublons, styleLigne } from './aidesEditeur.js';
import type { EtatLu, Leviers } from './actions.js';
import type { ActionsEditeur } from './typesEditeur.js';
import { svgDocument } from './actionsProduction.js';

type ActionsDessin = Pick<ActionsEditeur, 'finirTrace' | 'zoomerSelection' | 'enregistrerTout' | 'insererForme' | 'insererPlusieurs' | 'booleen' | 'transformerNumerique'>;

/** Le dessin lu d'une forme a inserer, credite de son origine quand on la connait. */
const creditee = (dessin: DessinSvg, origine: string | undefined): DessinSvg => (origine === undefined ? dessin : marquerOrigine(dessin, origine));

export function actionsDessin(lire: () => EtatLu, l: Leviers): ActionsDessin {
  const { appliquer, choisir, dire } = l;
  return {
    zoomerSelection: () => {
      const { dessin, sel, vues } = lire();
      const bo = boiteDe(dessin, sel), el = l.toile.current;
      if (!bo || !el || !(bo.l > 0) || !(bo.h > 0)) { vues.ajuster(); return; }
      const zoom = Math.max(0.02, Math.min(64, Math.min(el.clientWidth / bo.l, el.clientHeight / bo.h) * 0.8));
      vues.poserVue({ zoom, x: (el.clientWidth - bo.l * zoom) / 2 - bo.x * zoom, y: (el.clientHeight - bo.h * zoom) / 2 - bo.y * zoom });
    },
    enregistrerTout: () => {
      const { dessin, enregistrer, production } = lire();
      // nettoyerSvg ne rend jamais null pour un dessin sans forme visible (il reste un <svg> vide) : on le dit avant.
      // La marque du contexte de production (data-ed-*) suit l'ecriture ; en Generique, il n'y en a pas : memes octets qu'avant.
      const propre = dessin.formes.some(f => f.visible) ? nettoyerSvg(svgDocument(dessin, production)) : null;
      if (!propre) { dire('Le dessin n’a plus de forme visible : rien à enregistrer.'); return; }
      enregistrer(propre.svg);
    },
    finirTrace: (fermerTrace: boolean) => {
      const { dessin, trace, style } = lire();
      const points = sansDoublons(trace, Math.max(dessin.vb[2], dessin.vb[3]) / 1000);
      l.poserTrace([]);
      if (points.length < 2) return;
      const ferme = fermerTrace && points.length > 2;
      const r = ajouterForme(dessin, polygone(points, ferme), ferme ? style : styleLigne(style));
      if (!r.id) return;
      appliquer(() => r.dessin);
      choisir([r.id]);
      l.poserOutilBrut('selection');
      dire('Tracé ajouté : ' + points.length + ' points.');
    },
    insererForme: (svgForme: string, origine?: string) => {
      const { dessin } = lire();
      const autre = lireDessin(svgForme);
      if ('erreur' in autre) { dire(autre.erreur); return; }
      const [vx, vy, vl, vh] = dessin.vb, c = Math.min(vl, vh) / 3;
      const r = inserer(dessin, creditee(autre.dessin, origine), { x: vx + (vl - c) / 2, y: vy + (vh - c) / 2, l: c, h: c });
      if (!r.ids.length) return;
      appliquer(() => r.dessin);
      choisir(r.ids);
      l.poserOutil('selection');
      dire('Forme insérée au centre : déplacez-la, redimensionnez-la, recolorez-la.');
    },
    // Plusieurs formes d'un coup, chacune a sa place relative (0 a 1) dans le carre inscrit au plan.
    insererPlusieurs: elements => {
      const { dessin } = lire();
      const [vx, vy, vl, vh] = dessin.vb, c = Math.min(vl, vh), ox = vx + (vl - c) / 2, oy = vy + (vh - c) / 2;
      let d = dessin;
      const ids: string[] = [];
      for (const e of elements) {
        const autre = lireDessin(e.svg);
        if ('erreur' in autre) continue;
        const r = inserer(d, creditee(autre.dessin, e.origine), { x: ox + e.x * c, y: oy + e.y * c, l: e.taille * c, h: e.taille * c });
        d = r.dessin;
        ids.push(...r.ids);
      }
      if (!ids.length) return;
      appliquer(() => d);
      choisir(ids);
      l.poserOutil('selection');
      dire(pluriel(ids.length, 'forme') + ' insérée' + (ids.length > 1 ? 's' : '') + '.');
    },
    booleen: op => {
      const { dessin, sel, lisserBooleens } = lire();
      // Le moteur garde `lisser` faux par defaut (ses appelants et ses references ne bougent pas) ; l'editeur le propose actif.
      const r = appliquerBooleen(dessin, sel, op, undefined, { lisser: lisserBooleens });
      if (r.erreur) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      choisir(r.id ? [r.id] : []);
      const resultat = r.id ? r.dessin.formes.find(f => f.id === r.id) : undefined;
      if (!resultat) { dire('Il ne reste rien : les formes ont disparu. Ctrl+Z revient en arrière.'); return; }
      const reunies = dessin.formes.filter(f => sel.includes(f.id) && f.visible && !f.verrouille).length;
      dire(phraseBooleen(op, reunies, resultat.d.filter(c => c.c !== 'Z').length, resultat.d.some(c => c.c === 'C')));
    },
    transformerNumerique: t => {
      const { dessin, sel } = lire();
      if (!sel.length) return;
      let d = dessin;
      if (t.rotation) d = tournerAutour(d, sel, t.rotation);
      if (t.inclinaisonX || t.inclinaisonY) d = incliner(d, sel, t.inclinaisonX ?? 0, t.inclinaisonY ?? 0);
      if (t.echelle && t.echelle !== 100) d = mettreALEchelle(d, sel, t.echelle / 100);
      if (d !== dessin) appliquer(() => d);
    }
  };
}
