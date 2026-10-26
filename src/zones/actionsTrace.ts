// Les actions des outils de trace (OutilsTrace.tsx, menu Edition) : contour en forme, decalage, angles
// arrondis, types de nœuds, casser, joindre, inverser. Meme regle que actions.ts : l'etat se lit au moment
// de l'appel, et chaque action n'ouvre qu'une entree d'historique, puis le dit (barre d'etat et voix).

import { arrondirFormes, casserForme, convertirNoeud, inverserSens, joindreExtremites, supprimerNoeudEnGardantLaCourbe } from '../engine/editionSvg.js';
import { decalerFormes, etendreTraits } from '../engine/contours.js';
import { hachurerFormes } from '../engine/contour/hachures.js';
import { resoudreProfil } from '../engine/preparation.js';
import { pluriel } from '../util/texte.js';
import type { EtatLu, Leviers } from './actions.js';
import { phraseArrondi, phraseCasse, phraseContourEnForme, phraseConversion, phraseDecalage, phraseInversion, phraseJonction, phraseSuppressionFidele } from './phrasesTrace.js';
import type { ActionsEditeur } from './typesEditeur.js';
import { avecVectorisation } from './phrasesTexte.js';
import { t } from '../util/i18n.js';

export type ActionsTrace = Pick<ActionsEditeur, 'contourEnForme' | 'decalerContour' | 'hachurer' | 'arrondirAngles' | 'convertirNoeud' | 'casserNoeud' | 'joindreSelection' | 'supprimerNoeudFidele' | 'inverserSens'>;

const aucune = (): string => t('Choisissez d’abord une forme.');

export function actionsTrace(lire: () => EtatLu, l: Leviers): ActionsTrace {
  const { appliquer, choisir, dire } = l;
  return {
    contourEnForme: () => {
      const { dessin, sel } = lire();
      if (!sel.length) { dire(aucune()); return; }
      const r = etendreTraits(dessin, sel, { lisser: true });
      if (!r.etendus) { dire(r.erreur ?? t('Aucun contour à transformer.')); return; }
      appliquer(() => r.dessin);
      choisir(r.ids);
      l.poserPoint(null);
      dire(avecVectorisation(phraseContourEnForme(r.etendus, r.ignorees), dessin, sel));
    },
    decalerContour: (distance, jonction) => {
      const { dessin, sel } = lire();
      if (!sel.length) { dire(aucune()); return; }
      if (!Number.isFinite(distance) || distance === 0) { dire(t('Donnez une distance de décalage, positive vers l’extérieur, négative vers l’intérieur.')); return; }
      const r = decalerFormes(dessin, sel, distance, jonction, { lisser: true });
      if (r.dessin === dessin) { dire(r.erreur ?? t('Rien à décaler.')); return; }
      appliquer(() => r.dessin);
      choisir(sel.filter(id => !r.retirees.includes(id)));
      l.poserPoint(null);
      dire(avecVectorisation(phraseDecalage(r.decalees, distance, r.retirees.length, r.refusees), dessin, sel));
    },
    hachurer: angle => {
      const { dessin, sel, production } = lire();
      if (!sel.length) { dire(aucune()); return; }
      // L'ecart des lignes : la largeur du stylo du contexte, sinon un deux-centieme du plan (des lignes visibles a l'ecran).
      const largeur = resoudreProfil(production)?.largeurStylo ?? Math.max(dessin.vb[2], dessin.vb[3]) / 200;
      const r = hachurerFormes(dessin, sel, largeur, Number.isFinite(angle) ? angle : 45);
      if (!r.hachurees) { dire(r.erreur ?? t('Aucune forme pleine à hachurer : les hachures remplacent un fond.')); return; }
      appliquer(() => r.dessin);
      l.poserPoint(null);
      const v = { formes: pluriel(r.hachurees, 'forme'), angle: Number.isFinite(angle) ? angle : 45 };
      dire(avecVectorisation(r.hachurees > 1 ? t('{formes} hachurées à {angle} degrés : des lignes et le pourtour, sans fond.', v) : t('{formes} hachurée à {angle} degrés : des lignes et le pourtour, sans fond.', v), dessin, sel));
    },
    arrondirAngles: rayon => {
      const { dessin, sel } = lire();
      if (!sel.length) { dire(aucune()); return; }
      if (!(rayon > 0)) { dire(t('Donnez un rayon positif.')); return; }
      const r = arrondirFormes(dessin, sel, rayon);
      if (r.dessin === dessin) { dire(phraseArrondi(0, 0, rayon, 0)); return; }
      appliquer(() => r.dessin);
      l.poserPoint(null);
      dire(avecVectorisation(phraseArrondi(r.angles, r.reduits, rayon, r.rayonMin), dessin, sel));
    },
    convertirNoeud: type => {
      const { formeSeule, point } = lire();
      if (!formeSeule || point === null) { dire(t('Choisissez un point à convertir.')); return; }
      const r = convertirNoeud(formeSeule.d, point, type);
      if ('erreur' in r) { dire(r.erreur); return; }
      const change = r.chemin !== formeSeule.d;
      if (change) appliquer(d => ({ ...d, formes: d.formes.map(f => (f.id === formeSeule.id ? { ...f, d: r.chemin } : f)) }));
      dire(phraseConversion(type, change));
    },
    casserNoeud: () => {
      const { dessin, formeSeule, point } = lire();
      if (!formeSeule || point === null) { dire(t('Choisissez un point où casser le tracé.')); return; }
      const r = casserForme(dessin, formeSeule.id, point);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      choisir(r.ids);
      l.poserPoint(null);
      l.poserOutil('selection');
      dire(phraseCasse(r.ids.length));
    },
    joindreSelection: () => {
      const { dessin, sel } = lire();
      const r = joindreExtremites(dessin, sel);
      if (!r.id || !r.genre) { dire(r.erreur ?? t('Rien à joindre.')); return; }
      appliquer(() => r.dessin);
      choisir([r.id]);
      l.poserPoint(null);
      dire(avecVectorisation(phraseJonction(r.genre), dessin, sel));
    },
    supprimerNoeudFidele: () => {
      const { dessin, formeSeule, point } = lire();
      if (!formeSeule || point === null) { dire(t('Choisissez un point à retirer.')); return; }
      const tolerance = Math.max(dessin.vb[2], dessin.vb[3]) / 1000;
      const r = supprimerNoeudEnGardantLaCourbe(dessin, formeSeule.id, point, tolerance);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r);
      l.poserPoint(null);
      dire(t(phraseSuppressionFidele));
    },
    inverserSens: () => {
      const { dessin, sel } = lire();
      if (!sel.length) { dire(aucune()); return; }
      const r = inverserSens(dessin, sel);
      if (r === dessin) { dire(t('Rien à inverser : les formes sont verrouillées.')); return; }
      appliquer(() => r);
      dire(avecVectorisation(phraseInversion(sel.length), dessin, sel));
    }
  };
}
