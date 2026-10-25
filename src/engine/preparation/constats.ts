// Le jugement d'un dessin pour une machine (ADR-0013) : ce qui empeche l'export (bloquant), ce qui donnera une
// mauvaise coupe (a corriger), ce qui merite un regard (conseil). Chaque constat nomme ses formes et la correction
// qu'il propose ; aucune ne s'applique sans qu'on la demande (corrections.ts). Pur et deterministe : le meme
// dessin et le meme profil donnent les memes constats, dans le meme ordre.

import { compterPoints, couleursProches, sousChemins, boiteAvecTrait, type Chemin, type DessinSvg, type Forme } from '../editionSvg.js';
import { toleranceBooleen } from '../booleens.js';
import { pluriel } from '../../util/texte.js';
import { finesseDe, POINTS_MAX_MESURE } from './finesse.js';
import { couchesDe, etendueVisible, formesPeintes, tientDans } from './mesures.js';
import { silhouetteDe } from './silhouette.js';
import { texteMesure, texteTaille, unitesDePouces, type ProfilProduction } from './profil.js';
import { boiteDeRegion, pairesTrous } from './geometrie.js';
import { textesQuiSeChevauchent } from './stylo.js';

export type Gravite = 'bloquant' | 'a-corriger' | 'conseil';
export const GRAVITES: readonly Gravite[] = ['bloquant', 'a-corriger', 'conseil'];

export type CodeConstat =
  | 'vide' | 'trait' | 'opacite' | 'piece-trop-grande' | 'ptc-trop-grand'
  | 'depassement' | 'trace-ouvert' | 'lettres-chevauchent' | 'nuances-proches' | 'detail-fin'
  | 'trop-de-noeuds' | 'trou-superpose' | 'pair-impair' | 'analyse-limitee';

export type CodeCorrection =
  | 'contour-en-forme' | 'rendre-opaque' | 'ajuster-zone' | 'fermer' | 'fusionner-nuances'
  | 'epaissir' | 'nettoyer' | 'percer' | 'trous-selon-sens' | 'souder';

export const LIBELLES_CORRECTION: Readonly<Record<CodeCorrection, string>> = {
  'contour-en-forme': 'Contour en forme',
  'rendre-opaque': 'Rendre opaque',
  'ajuster-zone': 'Redimensionner à la zone utile',
  fermer: 'Fermer les tracés',
  'fusionner-nuances': 'Fusionner les nuances',
  epaissir: 'Épaissir',
  nettoyer: 'Nettoyer le tracé',
  percer: 'Percer la forme du dessous',
  'trous-selon-sens': 'Réécrire les trous',
  souder: 'Souder'
};

export interface Constat {
  readonly code: CodeConstat;
  readonly gravite: Gravite;
  /** La phrase dite et montree, en francais, au vouvoiement. */
  readonly message: string;
  /** Les formes en cause, dans l'ordre du dessin. */
  readonly formes: readonly string[];
  readonly correction: CodeCorrection | null;
  /** Le comportement de Design Space sur lequel repose le constat n'est pas encore verifie sur la machine. */
  readonly aVerifier?: true;
  /** Un tapis de la meme machine sur lequel le dessin tiendrait. */
  readonly tapis?: string;
  /** Les zones a surligner sur la toile (parties trop fines), en unites du plan. */
  readonly zones?: Chemin;
}

/** Au-dela, les parties fines ne se mesurent que sur les premieres formes : le panneau juge en continu. */
export const FORMES_MAX_FINESSE = 300;

const ORDRE: readonly CodeConstat[] = ['vide', 'trait', 'opacite', 'piece-trop-grande', 'ptc-trop-grand', 'depassement', 'trace-ouvert', 'lettres-chevauchent', 'nuances-proches', 'detail-fin', 'trop-de-noeuds', 'trou-superpose', 'pair-impair', 'analyse-limitee'];

const ids = (formes: readonly Forme[]): string[] => formes.map(f => f.id);
const accord = (n: number, un: string, plusieurs: string): string => (n > 1 ? plusieurs : un);
const ouvert = (s: Chemin): boolean => s.length > 1 && !s.some(c => c.c === 'Z');

/** Un trait d'epaisseur visible, que Design Space ne decoupera pas comme il se voit. */
export const aUnTrait = (f: Forme): boolean => f.contour !== null && f.epaisseur > 0 && (f.opaciteContour ?? 1) > 0;
/** Une forme qui laisse voir le papier du dessous. */
export const estTransparente = (f: Forme): boolean => f.opacite < 1 || (f.remplissage !== null && (f.opaciteRemplissage ?? 1) < 1);

function constatTrait(peintes: readonly Forme[]): Constat | null {
  const t = peintes.filter(aUnTrait);
  if (!t.length) return null;
  return {
    code: 'trait', gravite: 'bloquant', formes: ids(t), correction: 'contour-en-forme',
    message: (t.length > 1 ? t.length + ' formes ont un contour' : 'Une forme a un contour') + ' : Design Space découpe le tracé, pas l’épaisseur du trait. Transformez le contour en forme pour couper ce que vous voyez.'
  };
}

function constatOpacite(peintes: readonly Forme[]): Constat | null {
  const t = peintes.filter(estTransparente);
  if (!t.length) return null;
  return {
    code: 'opacite', gravite: 'bloquant', formes: ids(t), correction: 'rendre-opaque',
    message: (t.length > 1 ? t.length + ' formes sont transparentes' : 'Une forme est transparente') + ' : le papier est opaque, et Design Space ignore l’opacité. Rendez-' + accord(t.length, 'la', 'les') + ' opaque' + accord(t.length, '', 's') + '.'
  };
}

/** Le premier tapis de la machine sur lequel une boite tiendrait, autre que celui choisi. */
function tapisSuggere(p: ProfilProduction, l: number, h: number, tourner: boolean): string | undefined {
  return p.machine.tapis
    .map(id => p.famille.tapis.find(t => t.id === id))
    .find(t => t && t.id !== p.tapis.id && tientDans(l, h, unitesDePouces(t.zoneUtile.largeur.valeur), unitesDePouces(t.zoneUtile.hauteur.valeur), tourner))?.id;
}

function constatsTaille(peintes: readonly Forme[], dessin: DessinSvg, p: ProfilProduction): Constat[] {
  const z = p.zoneUtile, zone = texteTaille(z.l, z.h, p.unite), tapis = p.tapis.nom;
  const grandes = peintes.filter(f => { const b = boiteAvecTrait(f); return b !== null && !tientDans(b.l, b.h, z.l, z.h, true); });
  if (grandes.length) {
    const b = grandes.map(boiteAvecTrait).reduce((m, x) => (x && (!m || x.l * x.h > m.l * m.h) ? x : m), null as ReturnType<typeof boiteAvecTrait>);
    const suggere = b ? tapisSuggere(p, b.l, b.h, true) : undefined;
    return [{
      code: 'piece-trop-grande', gravite: 'bloquant', formes: ids(grandes), correction: 'ajuster-zone', ...(suggere ? { tapis: suggere } : {}),
      message: (grandes.length > 1 ? grandes.length + ' formes sont plus grandes' : 'Une forme est plus grande') + ' que la zone utile du ' + tapis.toLowerCase() + ' (' + zone + ')' + (b ? ' : ' + texteTaille(b.l, b.h, p.unite) + '.' : '.')
    }];
  }
  const e = etendueVisible(dessin);
  if (!e || tientDans(e.l, e.h, z.l, z.h, false)) return [];
  const suggere = tapisSuggere(p, e.l, e.h, false);
  return [{
    code: 'depassement', gravite: 'a-corriger', formes: ids(peintes), correction: 'ajuster-zone', aVerifier: true, ...(suggere ? { tapis: suggere } : {}),
    message: 'Le dessin mesure ' + texteTaille(e.l, e.h, p.unite) + ' : il dépasse la zone utile du ' + tapis.toLowerCase() + ' (' + zone + '). Chaque pièce y tient, mais Design Space devra les répartir sur le tapis (à vérifier).'
  }];
}

function constatOuverts(peintes: readonly Forme[]): Constat | null {
  const o = peintes.filter(f => f.remplissage !== null && sousChemins(f.d).some(ouvert));
  if (!o.length) return null;
  return {
    code: 'trace-ouvert', gravite: 'a-corriger', formes: ids(o), correction: 'fermer', aVerifier: true,
    message: (o.length > 1 ? o.length + ' formes ont un tracé ouvert' : 'Une forme a un tracé ouvert') + ' : fermez-' + accord(o.length, 'le', 'les') + ' pour que la lame revienne à son point de départ.'
  };
}

/** Un texte vivant dont des lettres se chevauchent (ADR-0021) : la lame couperait chacune a travers sa voisine. */
function constatLettres(dessin: DessinSvg): Constat | null {
  const t = textesQuiSeChevauchent(dessin);
  if (!t.length) return null;
  return { code: 'lettres-chevauchent', gravite: 'a-corriger', formes: ids(t), correction: 'souder', message: 'Les lettres se chevauchent : soudez-les pour une découpe d’un seul tenant.' };
}

function constatNuances(dessin: DessinSvg, p: ProfilProduction): Constat | null {
  const visibles: DessinSvg = { ...dessin, formes: dessin.formes.filter(f => f.visible) };
  const grappes = couleursProches(visibles, p.fusionNuances, 'remplissage');
  if (!grappes.length) return null;
  const membres = new Set(grappes.flatMap(g => [g.cible, ...g.membres]).map(c => c.toLowerCase()));
  const formes = visibles.formes.filter(f => f.remplissage !== null && membres.has(f.remplissage.toLowerCase()));
  const tapisDeTrop = grappes.reduce((n, g) => n + g.membres.length, 0);
  const exemple = grappes[0];
  return {
    code: 'nuances-proches', gravite: 'a-corriger', formes: ids(formes), correction: 'fusionner-nuances',
    message: 'Des couleurs presque égales font ' + pluriel(tapisDeTrop, 'tapis') + ' de trop' + (exemple ? ' (' + [exemple.cible, ...exemple.membres].join(' et ') + ')' : '') + ' : une couleur, un tapis. Fusionnez les nuances proches.'
  };
}

function constatsFinesse(peintes: readonly Forme[], dessin: DessinSvg, p: ProfilProduction): Constat[] {
  const pleines = peintes.filter(f => f.remplissage !== null);
  const mesurables = pleines.filter(f => f.d.length <= POINTS_MAX_MESURE).slice(0, FORMES_MAX_FINESSE);
  const tolerance = toleranceBooleen(dessin);
  const fines: Forme[] = [], zones: Chemin[] = [];
  for (const f of mesurables) {
    const m = finesseDe(f, p.detailMin, tolerance);
    if (m && (m.entieres || m.etroites)) { fines.push(f); zones.push(m.zones); }
  }
  const r: Constat[] = [];
  if (fines.length) {
    r.push({
      code: 'detail-fin', gravite: 'a-corriger', formes: ids(fines), correction: 'epaissir', zones: zones.flat(),
      message: (fines.length > 1 ? fines.length + ' formes ont des parties' : 'Une forme a des parties') + ' plus étroites que ' + texteMesure(p.detailMin, p.unite) + ' : la lame les déchirerait. Épaississez-' + accord(fines.length, 'la', 'les') + ', ou agrandissez le dessin.'
    });
  }
  if (mesurables.length < pleines.length) {
    r.push({
      code: 'analyse-limitee', gravite: 'conseil', formes: [], correction: null,
      message: 'Les parties fines n’ont été mesurées que sur ' + mesurables.length + ' formes sur ' + pleines.length + ' : les plus chargées et les suivantes sont sautées.'
    });
  }
  return r;
}

function constatNoeuds(peintes: readonly Forme[], p: ProfilProduction): Constat | null {
  const lourdes = peintes.filter(f => compterPoints(f.d) > p.noeudsParForme);
  if (!lourdes.length) return null;
  return {
    code: 'trop-de-noeuds', gravite: 'conseil', formes: ids(lourdes), correction: 'nettoyer', aVerifier: true,
    message: (lourdes.length > 1 ? lourdes.length + ' formes ont' : 'Une forme a') + ' plus de ' + p.noeudsParForme + ' points : Design Space peine sur les tracés chargés. Nettoyez le tracé.'
  };
}

function constatTrous(dessin: DessinSvg): Constat | null {
  const paires = pairesTrous(dessin);
  if (!paires.length) return null;
  const formes = new Set(paires.flat());
  return {
    code: 'trou-superpose', gravite: 'conseil', formes: dessin.formes.filter(f => formes.has(f.id)).map(f => f.id), correction: 'percer',
    message: (paires.length > 1 ? paires.length + ' formes blanches sont posées' : 'Une forme blanche est posée') + ' sur une autre : Design Space ' + accord(paires.length, 'la', 'les') + ' découpera dans du papier blanc, pas comme un trou. Percez la forme du dessous.'
  };
}

function constatPairImpair(peintes: readonly Forme[]): Constat | null {
  const e = peintes.filter(f => f.remplissage !== null && f.regle === 'evenodd' && sousChemins(f.d).length > 1);
  if (!e.length) return null;
  return {
    code: 'pair-impair', gravite: 'conseil', formes: ids(e), correction: 'trous-selon-sens', aVerifier: true,
    message: (e.length > 1 ? e.length + ' formes creusent leurs trous' : 'Une forme creuse ses trous') + ' en pair-impair : Design Space les lit-il comme le navigateur ? C’est à tester (témoin 2). Réécrire les trous selon le sens du tracé lève le doute.'
  };
}

function constatPrintThenCut(dessin: DessinSvg, p: ProfilProduction): Constat[] {
  const ptc = p.printThenCut;
  if (!ptc) return [];
  const b = boiteDeRegion(silhouetteDe(dessin, toleranceBooleen(dessin)));
  if (!b) return [];
  const l = b.l + 2 * ptc.fondPerdu, h = b.h + 2 * ptc.fondPerdu;
  if (tientDans(l, h, ptc.l, ptc.h, true)) return [];
  return [{
    code: 'ptc-trop-grand', gravite: 'bloquant', formes: ids(formesPeintes(dessin)), correction: 'ajuster-zone', aVerifier: true,
    message: 'Avec son fond perdu, le dessin mesure ' + texteTaille(l, h, p.unite) + ' : Print Then Cut accepte au plus ' + texteTaille(ptc.l, ptc.h, p.unite) + ' (à vérifier).'
  }];
}

/** Les constats du dessin pour ce profil, du plus grave au plus leger, dans un ordre fixe. */
export function constatsPreparation(dessin: DessinSvg, p: ProfilProduction): Constat[] {
  const peintes = formesPeintes(dessin);
  if (!peintes.length) return [{ code: 'vide', gravite: 'bloquant', formes: [], correction: null, message: 'Le dessin n’a aucune forme visible : rien à découper.' }];
  const r: Array<Constat | null> = p.procede === 'imprimer-decouper'
    ? [...constatPrintThenCut(dessin, p), constatNoeuds(peintes, p)]
    : [
      constatTrait(peintes), constatOpacite(peintes), ...constatsTaille(peintes, dessin, p), constatOuverts(peintes), constatLettres(dessin), constatNuances(dessin, p),
      ...constatsFinesse(peintes, dessin, p), constatNoeuds(peintes, p), constatTrous(dessin), constatPairImpair(peintes)
    ];
  return r.filter((c): c is Constat => c !== null).sort((a, b) => GRAVITES.indexOf(a.gravite) - GRAVITES.indexOf(b.gravite) || ORDRE.indexOf(a.code) - ORDRE.indexOf(b.code));
}

/** Les seuls constats qui empechent l'export, sans les mesures lourdes : ce que l'export verifie avant d'ecrire. */
export function constatsBloquants(dessin: DessinSvg, p: ProfilProduction): Constat[] {
  const peintes = formesPeintes(dessin);
  if (!peintes.length) return [{ code: 'vide', gravite: 'bloquant', formes: [], correction: null, message: 'Le dessin n’a aucune forme visible : rien à découper.' }];
  if (p.procede === 'imprimer-decouper') return constatPrintThenCut(dessin, p);
  return [constatTrait(peintes), constatOpacite(peintes), ...constatsTaille(peintes, dessin, p)].filter((c): c is Constat => c !== null && c.gravite === 'bloquant');
}

/** Ce que le panneau affiche en permanence : les couches et la taille finale. */
export function resumePreparation(dessin: DessinSvg): { couches: ReturnType<typeof couchesDe>; taille: { l: number; h: number } | null } {
  const e = etendueVisible(dessin);
  return { couches: couchesDe(dessin), taille: e ? { l: e.l, h: e.h } : null };
}

