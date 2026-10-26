// Les corrections que propose le panneau de production (ADR-0013). Chacune est un outil qui existait deja
// (contour en forme, decalage, fusion des nuances, joindre et fermer, simplification, booleens, transformation),
// appele avec les valeurs du materiau : un contexte de production n'invente pas d'outil, il les regle. Pures :
// `DessinSvg -> DessinSvg`, deterministes, et le dessin rendu tel quel quand rien ne change. La phrase dit ce qui
// a ete fait, pour la barre d'etat et la voix.

import clipping from 'polygon-clipping';
import {
  boiteAvecTrait, deplacer, echelle, fusionnerCouleursProches, inverserChemin, joindreExtremites, modifier, simplifier, sousChemins, transformer,
  type Chemin, type DessinSvg, type Forme
} from '../editionSvg.js';
import { aireSignee, aplatir, appliquerBooleen, cheminLisseDeRegion, regionDeChemin, regionDeForme, toleranceBooleen } from '../booleens.js';
import { decalerFormes, etendreTraits } from '../contours.js';
import { aireDeRegion } from '../contour/region.js';
import { pluriel } from '../../util/texte.js';
import { nombreFr } from '../description.js';
import type { Constat, CodeCorrection } from './constats.js';
import { etendueVisible, formesPeintes } from './mesures.js';
import { boiteDeRegion, pairesTrous } from './geometrie.js';
import { silhouetteDe } from './silhouette.js';
import { gabaritDuTapis, regionDeCoupe, texteMesure, texteTaille, type ProfilProduction } from './profil.js';
import { corrigerTexte } from './stylo.js';
import { poserOperation } from './operations.js';
import { ajouterLiens, LIENS_DEFAUT, type OptionsLiens } from './liens.js';

export type ResultatCorrection = { readonly dessin: DessinSvg; readonly phrase: string } | { readonly erreur: string };

const RIEN = 'Rien à corriger : le dessin a changé depuis le constat.';

/** Une forme en pair-impair reecrite selon le sens du trace : chaque boucle tourne selon sa profondeur, la courbe ne change pas. */
function trousSelonSens(f: Forme, tolerance: number): Forme {
  const sous = sousChemins(f.d);
  const anneaux = sous.map(s => aplatir(s, tolerance)[0] ?? []);
  const dedans = (p: readonly [number, number], r: readonly (readonly [number, number])[]): boolean => {
    let c = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i], b = r[j];
      if (a && b && (a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  };
  const d: Chemin = sous.flatMap((s, i) => {
    const r = anneaux[i] ?? [], premier = r[0];
    if (!premier) return s;
    const profondeur = anneaux.filter((autre, k) => k !== i && autre.length > 2 && dedans(premier, autre)).length;
    // Profondeur paire : sens horaire a l'ecran (aire signee positive) ; impaire : l'autre sens, ce qui creuse.
    const voulu = profondeur % 2 === 0 ? 1 : -1;
    return Math.sign(aireSignee(r)) === -voulu ? inverserChemin(s) : s;
  });
  const avant = regionDeForme(f, tolerance), apres = regionDeChemin(d, 'nonzero', tolerance);
  const ecart = aireDeRegion(clipping.xor(avant, apres)), base = Math.max(aireDeRegion(avant), 1e-9);
  // Des boucles qui se croisent n'ont pas de profondeur simple : on repart alors de la region peinte, courbes rebaties.
  if (ecart / base < 1e-6) return { ...f, d, regle: 'nonzero' };
  return { ...f, d: cheminLisseDeRegion(avant, tolerance), regle: 'nonzero' };
}

/** Le facteur qui fait tenir une boite dans une zone, un rien en deca pour que l'arrondi d'ecriture ne la fasse pas deborder. */
const facteurPour = (l: number, h: number, zl: number, zh: number): number => Math.min(zl / l, zh / h) * 0.999;

function ajusterZone(dessin: DessinSvg, p: ProfilProduction): ResultatCorrection {
  const peintes = formesPeintes(dessin).filter(f => !f.verrouille);
  const ptc = p.procede === 'imprimer-decouper' ? p.printThenCut : null;
  let k: number, b: ReturnType<typeof etendueVisible>;
  if (ptc) {
    b = boiteDeRegion(silhouetteDe(dessin, toleranceBooleen(dessin)));
    if (!b) return { erreur: RIEN };
    // Le fond perdu ne grandit pas avec le dessin : on le retire de la place disponible.
    const zl = ptc.l - 2 * ptc.fondPerdu, zh = ptc.h - 2 * ptc.fondPerdu;
    k = Math.max(facteurPour(b.l, b.h, zl, zh), facteurPour(b.l, b.h, zh, zl));
  } else {
    b = etendueVisible(dessin);
    if (!b) return { erreur: RIEN };
    k = facteurPour(b.l, b.h, p.zoneUtile.l, p.zoneUtile.h);
  }
  if (!(k > 0) || k >= 1 || !peintes.length) return { erreur: 'Le dessin tient déjà dans la zone utile.' };
  const d = transformer(dessin, peintes.map(f => f.id), echelle(k, k, b.x, b.y));
  const e = etendueVisible(d);
  return { dessin: d, phrase: 'Dessin réduit à ' + nombreFr(Math.round(k * 1000) / 10) + ' %' + (e ? ' : ' + texteTaille(e.l, e.h, p.unite) + '.' : '.') };
}

/** Le plus petit glissement qui ramene [a, a + l] dans [z, z + zl] ; 0 s'il y est, ou s'il est plus grand qu'elle. */
const glissement = (a: number, l: number, z: number, zl: number): number => (l > zl ? 0 : a < z ? z - a : a + l > z + zl ? z + zl - (a + l) : 0);

/**
 * Ramener sur le tapis fixe (ADR-0039) chaque forme qui sort de la zone utile : le plus petit deplacement qui l'y fait tenir, forme
 * par forme, sans rien redimensionner. Une forme plus grande que la zone ne bouge pas (son constat propose de la reduire).
 */
function ramenerZone(dessin: DessinSvg, ids: readonly string[], p: ProfilProduction): ResultatCorrection {
  const z = regionDeCoupe(p, gabaritDuTapis(p, dessin, null)), voulus = new Set(ids);
  if (!z) return { erreur: 'La feuille sort de la zone utile du tapis : replacez-la dans le panneau.' };
  let d = dessin, n = 0;
  for (const f of dessin.formes) {
    if (!voulus.has(f.id) || f.verrouille) continue;
    const b = boiteAvecTrait(f);
    if (!b) continue;
    const dx = glissement(b.x, b.l, z.x, z.l), dy = glissement(b.y, b.h, z.y, z.h);
    if (!dx && !dy) continue;
    d = deplacer(d, [f.id], dx, dy);
    n++;
  }
  return n ? { dessin: d, phrase: pluriel(n, 'forme') + ' ramenée' + (n > 1 ? 's' : '') + ' sur la feuille, dans la zone utile du tapis.' } : { erreur: RIEN };
}

function fermer(dessin: DessinSvg, ids: readonly string[]): ResultatCorrection {
  let d = dessin, n = 0;
  for (const id of ids) {
    const r = joindreExtremites(d, [id]);
    if (r.genre === 'ferme') { d = r.dessin; n++; }
  }
  return n ? { dessin: d, phrase: pluriel(n, 'tracé') + ' fermé' + (n > 1 ? 's' : '') + '.' } : { erreur: RIEN };
}

function percer(dessin: DessinSvg): ResultatCorrection {
  let d = dessin, n = 0;
  for (const [base, blanche] of pairesTrous(dessin)) {
    const r = appliquerBooleen(d, [base, blanche], 'soustraction', toleranceBooleen(d), { lisser: true });
    if (!r.erreur) { d = r.dessin; n++; }
  }
  return n ? { dessin: d, phrase: pluriel(n, 'trou') + ' percé' + (n > 1 ? 's' : '') + ' : la forme blanche est devenue un vide.' } : { erreur: RIEN };
}

function trous(dessin: DessinSvg, ids: readonly string[]): ResultatCorrection {
  const voulus = new Set(ids), tolerance = toleranceBooleen(dessin);
  let n = 0;
  const formes = dessin.formes.map(f => {
    if (!voulus.has(f.id) || f.verrouille || f.regle !== 'evenodd') return f;
    n++;
    return trousSelonSens(f, tolerance);
  });
  return n ? { dessin: { ...dessin, formes }, phrase: pluriel(n, 'forme') + ' réécrite' + (n > 1 ? 's' : '') + ' selon le sens du tracé : les trous sont les mêmes.' } : { erreur: RIEN };
}

/**
 * Applique une correction. `constat` donne les formes en cause ; le profil, les valeurs du materiau ; `liens`, les reglages des
 * liens des ilots (ADR-0040 : ceux de la session, sinon 2 mm et 3 par ilot).
 */
export function corrigerPreparation(dessin: DessinSvg, code: CodeCorrection, constat: Pick<Constat, 'formes'>, p: ProfilProduction, liens: OptionsLiens = LIENS_DEFAUT): ResultatCorrection {
  const formes = constat.formes;
  switch (code) {
    case 'contour-en-forme': {
      const r = etendreTraits(dessin, formes, { lisser: true });
      return r.etendus ? { dessin: r.dessin, phrase: pluriel(r.etendus, 'contour') + ' transformé' + (r.etendus > 1 ? 's' : '') + ' en forme.' } : { erreur: r.erreur ?? RIEN };
    }
    case 'rendre-opaque': {
      const d = modifier(dessin, formes, { opacite: 1, opaciteRemplissage: 1, opaciteContour: 1 });
      return d === dessin ? { erreur: RIEN } : { dessin: d, phrase: pluriel(formes.length, 'forme') + ' rendue' + (formes.length > 1 ? 's' : '') + ' opaque' + (formes.length > 1 ? 's' : '') + '.' };
    }
    case 'ajuster-zone': return ajusterZone(dessin, p);
    case 'ramener-zone': return ramenerZone(dessin, formes, p);
    case 'fermer': return fermer(dessin, formes);
    case 'fusionner-nuances': {
      const r = fusionnerCouleursProches(dessin, p.fusionNuances, 'remplissage');
      return r.fusionnees ? { dessin: r.dessin, phrase: pluriel(r.fusionnees, 'nuance') + ' fusionnée' + (r.fusionnees > 1 ? 's' : '') + ' : une couleur, un tapis.' } : { erreur: RIEN };
    }
    case 'epaissir': {
      const r = decalerFormes(dessin, formes, p.detailMin / 2, 'round', { lisser: true });
      return r.decalees ? { dessin: r.dessin, phrase: pluriel(r.decalees, 'forme') + ' épaissie' + (r.decalees > 1 ? 's' : '') + ' de ' + texteMesure(p.detailMin / 2, p.unite) + ' de chaque côté.' } : { erreur: r.erreur ?? RIEN };
    }
    case 'nettoyer': {
      const r = simplifier(dessin, formes, p.toleranceNettoyage);
      return r.retires ? { dessin: r.dessin, phrase: pluriel(r.retires, 'point') + ' retiré' + (r.retires > 1 ? 's' : '') + ' à ' + texteMesure(p.toleranceNettoyage, p.unite) + ' près.' } : { erreur: 'Aucun point à retirer à cette tolérance : les courbes restent telles quelles.' };
    }
    case 'percer': return percer(dessin);
    case 'trous-selon-sens': return trous(dessin, formes);
    // Souder un texte (ADR-0022) : le vectoriser en unissant les lettres qui se touchent, d'un seul tenant pour la lame.
    case 'souder': return corrigerTexte(dessin, 'souder', formes, 0);
    // Le stylo (ADR-0022) : le pourtour en trait, ou des hachures a la largeur du stylo.
    case 'garder-contour': return corrigerTexte(dessin, 'garder-contour', formes, p.largeurStylo);
    case 'hachurer': return corrigerTexte(dessin, 'hachurer', formes, p.largeurStylo);
    // Ecrire au stylo (ADR-0028) : ces formes passent parmi celles a ecrire, le reste du dessin garde la lame.
    case 'ecrire': {
      const r = poserOperation(dessin, formes, 'ecriture', p.procede);
      return r.changees ? { dessin: r.dessin, phrase: r.phrase } : { erreur: RIEN };
    }
    // Les liens des ilots (ADR-0040) : chaque ilot des formes en cause, en une fois ; les courbes rebaties comme les booleens.
    case 'ajouter-liens': {
      const r = ajouterLiens(dessin, formes, { ...liens, lisser: true }, p.procede);
      return r.liens ? { dessin: r.dessin, phrase: r.phrase } : { erreur: r.ilots ? r.phrase : RIEN };
    }
    // Changer de police demande une fonte : l'interface la compose, pas le moteur.
    case 'police-trait': return { erreur: 'Cette correction se fait dans l’éditeur.' };
  }
}
