// Les actions du contexte de production (ADR-0013) : choisir le contexte dans la barre, corriger un constat du
// panneau « Pret pour Cricut », exporter pour la machine. Meme regle que actions.ts : l'etat se lit au moment de
// l'appel, chaque correction n'ouvre qu'une entree d'historique (Ctrl+Z la defait) et se dit a voix haute.

import { useEffect, useRef, useState } from 'react';
import { ecrireDessin, marquerProduction, marquerReperes, type DessinSvg } from '../engine/editionSvg.js';
import {
  ajouterLiens, constatsPreparation, feuillePartielle, gabaritDuTapis, planPourChoix, corrigerPreparation, etendueVisible, marqueDeChoix, normaliserChoix, operationsAEcrire, operationsApplicables, poserOperation,
  resoudreProfil, resumePreparation, texteMesure, texteTaille, unionCadres, versUnite, type CadreTapis, type ProfilProduction
} from '../engine/preparation.js';
import { archiveOperations, exportParOperation, nomsOperations, operationsPeintes } from '../export/operations.js';
import { aplatirPour, phrasePertes } from '../engine/aplatir.js';
import { CAPACITES_PRODUCTION } from '../export/capacites.js';
import { toutesLesPolices } from '../io/polices.js';
import { policeTraitProche } from '../model/polices.js';
import { natureDuTexte } from '../engine/texte/vivant.js';
import { appliquerChangement } from './actionsTexte.js';
import { avecDpiPng } from '../export/png.js';
import { archivePrintThenCut, printThenCut } from '../export/printThenCut.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { versPng } from '../io/image.js';
import { CHOIX_CRICUT_DEFAUT, CRICUT, NOMS_UNITE, type ChoixProduction, type UniteLongueur } from '../model/contextes.js';
import type { Stockage } from '../io/stockage.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';
import type { Leviers } from './actions.js';
import type { EtatDuMoment } from './creerActions.js';
import { CLE_UNITE, demandeConfirmation, etatExport, lireUnite, phraseConfirmation, phraseConfirmationCourte, phraseCouches } from './parcoursCricut.js';
import type { ActionsEditeur, EtatPreparation, SuiteCricut } from './typesEditeur.js';

/**
 * Le SVG du document tel qu'on l'enregistre : l'ecriture ordinaire, plus la marque du contexte (rien en Generique). En contexte Cricut,
 * l'operation d'une forme s'ecrit sur son <path> quand elle differe de celle que la regle proposerait (ADR-0028) ; en Generique,
 * jamais : aucun octet de plus.
 */
export function svgDocument(dessin: DessinSvg, production: ChoixProduction): string {
  const choix = normaliserChoix(production);
  const procede = choix.contexte === 'cricut' ? choix.procede : null;
  // Les reperes (ADR-0038) suivent la marque du contexte, seulement s'il y en a : un document sans repere garde ses octets.
  return marquerReperes(marquerProduction(ecrireDessin(operationsAEcrire(dessin, procede), 3, procede !== null), marqueDeChoix(choix)), dessin.reperes);
}

/** La phrase qui dit le contexte choisi. */
export function phraseProduction(c: ChoixProduction): string {
  if (c.contexte !== 'cricut') return t('Contexte générique : le dessin n’est plus jugé pour une machine.');
  const p = resoudreProfil(c);
  if (!p) return t('Contexte Cricut.');
  // Les noms de la machine, du tapis et de la matiere sont des donnees (model/contextes.ts) : traduits a l'affichage (ADR-0042).
  return t('Contexte Cricut : {machine}, {tapis}, {materiau}{procede}, en {unite}.', {
    machine: t(p.machine.nom), tapis: t(p.tapis.nom).toLowerCase(), materiau: t(p.materiau.nom).toLowerCase(),
    procede: p.procede === 'imprimer-decouper' ? ', Print Then Cut' : p.procede === 'dessin-stylo' ? t(', dessin au stylo') : '',
    unite: p.unite === 'in' ? t('pouces') : t('millimètres')
  });
}

/** Le resume du jugement : le nombre de constats, ou « pret ». */
export const phraseReste = (n: number, procede: ProfilProduction['procede']): string => (n ? t('Reste {constats}.', { constats: pluriel(n, 'constat') }) : procede === 'imprimer-decouper' ? t('Prêt pour Print Then Cut.') : procede === 'dessin-stylo' ? t('Prêt à dessiner.') : t('Prêt à découper.'));

/**
 * Le jugement du dessin pour le profil, un instant apres la derniere modification : pendant un geste continu, le panneau
 * garde le jugement d'avant plutot que de mesurer a chaque mouvement (les parties fines coutent un decalage par forme).
 */
export function usePreparation(dessin: DessinSvg, profil: ProfilProduction | null): EtatPreparation | null {
  const [etat, poserEtat] = useState<EtatPreparation | null>(null);
  const deja = useRef(false);
  useEffect(() => {
    if (!profil) { deja.current = false; poserEtat(null); return; }
    const minuteur = setTimeout(() => {
      const r = resumePreparation(dessin);
      poserEtat({ profil, dessin, constats: constatsPreparation(dessin, profil), couches: r.couches, taille: r.taille });
      deja.current = true;
    }, deja.current ? 200 : 0);
    return () => clearTimeout(minuteur);
  }, [dessin, profil]);
  return profil && etat?.profil === profil ? etat : null;
}

type ActionsProduction = Pick<ActionsEditeur, 'poserProduction' | 'corrigerConstat' | 'exporterPourCricut' | 'fermerSuiteCricut' | 'poserOperation' | 'ajouterLiens' | 'poserApercuMachine'>;

/**
 * Ce que « Ajuster » cadre en contexte de decoupe : le tapis entier tel que la toile le dessine, et le dessin s'il en deborde ; null
 * hors de ce contexte (Generique, Print Then Cut : pas de gabarit), ou la vue cadre le dessin comme avant.
 */
export function cadreDeVue(dessin: DessinSvg, production: ChoixProduction): CadreTapis | null {
  const p = resoudreProfil(production);
  // Le tapis compte pour la lame et pour le stylo (ADR-0022) ; Print Then Cut n'a pas de gabarit.
  if (!p || p.procede === 'imprimer-decouper') return null;
  const etendue = etendueVisible(dessin);
  return unionCadres(gabaritDuTapis(p, dessin, etendue).tapis, etendue);
}

/**
 * Ce que « Ajuster au dessin » cadre : sur le tapis fixe (ADR-0039, le defaut depuis sa revision du 26 octobre 2026), le plan est le
 * tapis, et le dessin seul est l'etendue de ses formes visibles ; null ailleurs (et pour un dessin vide), ou la vue cadre le plan
 * comme avant.
 */
export function cadreDuDessin(dessin: DessinSvg, production: ChoixProduction): CadreTapis | null {
  const p = resoudreProfil(production);
  if (!p || p.recalage || p.procede === 'imprimer-decouper') return null;
  return etendueVisible(dessin);
}

/** Ce que dit la feuille quand on la change : sa taille et sa place depuis le coin haut gauche du tapis. */
export const phraseFeuille = (p: ProfilProduction): string => (feuillePartielle(p)
  ? t('Feuille de {taille}, à {x} du bord gauche et {y} du bord haut du tapis.', { taille: texteTaille(p.feuille.l, p.feuille.h, p.unite), x: texteMesure(p.feuille.x, p.unite), y: texteMesure(p.feuille.y, p.unite) })
  : t('Feuille : le tapis entier.'));

/** Ce que dit le recalage automatique quand on le change (ADR-0039). */
export const phraseRecalage = (actif: boolean, planPose = false): string => (actif
  ? t('Recalage automatique activé : le tapis suit le dessin, que Design Space posera dans son coin haut gauche. Le plan de travail reste le tapis : « Ajuster le plan de travail » le ramène au dessin.')
  // Ctrl+Z ne rend un ancien plan que si decocher en a pose un : un plan deja de la taille du tapis reste tel quel.
  : planPose ? t('Recalage automatique désactivé : le plan de travail est le tapis, les formes restent où vous les posez, et l’export garde leur place. Ctrl+Z rend l’ancien plan.')
    : t('Recalage automatique désactivé : le plan de travail est le tapis, les formes restent où vous les posez, et l’export garde leur place.'));

// Le plan de travail que demande un nouveau choix vit dans le moteur (engine/preparation/tapis.ts) : l'ouverture s'en sert aussi.
export { planPourChoix } from '../engine/preparation.js';

// L'unite choisie se retient d'une ouverture a l'autre : dans le stockage injecte s'il y en a un, sinon le temps de la page.
let uniteDeSession: UniteLongueur | null = null;

/** L'unite retenue (stockage, puis session), ou celle par defaut : le millimetre. */
export const uniteRetenue = (stockage: Stockage | null): UniteLongueur => lireUnite(stockage?.lire<unknown>(CLE_UNITE)) ?? uniteDeSession ?? CHOIX_CRICUT_DEFAUT.unite;

/** Le choix Cricut par defaut, dans l'unite retenue, pour une machine donnee (ou celle par defaut). */
export const choixCricut = (stockage: Stockage | null, machine = CHOIX_CRICUT_DEFAUT.machine): ChoixProduction =>
  ({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, machine, unite: uniteRetenue(stockage) });

function retenirUnite(stockage: Stockage | null, u: UniteLongueur): void {
  uniteDeSession = u;
  if (lireUnite(stockage?.lire<unknown>(CLE_UNITE)) !== u) stockage?.ecrire(CLE_UNITE, u);
}

const remettre = (nom: string, donnees: Uint8Array | Blob, dire: (t: string) => void, suite: string) => { void proposer(nom, donnees).then(m => dire(m + (suite ? ' ' + suite : ''))); };

/**
 * Le SVG de decoupe, le SVG du stylo, l'archive d'un dessin qui mele les deux (ADR-0028), ou l'archive Print Then Cut (avec son PNG
 * a la resolution du profil), remis au telechargement. Faux s'il est refuse.
 */
function exporter(dessin: DessinSvg, p: ProfilProduction, nom: string, direSeul: (t: string) => void): boolean {
  // Le dessin tel que la machine le recoit (ADR-0012 §6) : le meme objet pour un dessin plat ; sinon descendu, et ce qui a ete
  // approche s'ajoute au message.
  const { dessin: plat, pertes, perdus } = aplatirPour(dessin, CAPACITES_PRODUCTION), approche = phrasePertes(pertes, perdus);
  const dire = (t: string) => direSeul(approche ? t + ' ' + approche : t);
  if (operationsApplicables(p.procede)) {
    const r = exportParOperation(plat, p);
    if ('erreur' in r) { dire(r.erreur); return false; }
    const mesure = resumePreparation(dessin).taille, taille = mesure ? ', ' + texteTaille(mesure.l, mesure.h, p.unite) : '';
    if (r.genre === 'ecriture') remettre(nom + '-stylo.svg', texteOctets(r.svg), dire, t('{couleurs} : {stylos}{taille}.', { couleurs: pluriel(r.couches, 'couleur'), stylos: pluriel(r.couches, 'stylo'), taille }));
    else if (r.genre === 'decoupe') remettre(nom + '-cricut.svg', texteOctets(r.svg), dire, phraseCouches(r.couches) + taille + '.');
    else {
      const f = nomsOperations(nom);
      remettre(f.archive, new Blob([archiveOperations(nom, plat, p, r) as BlobPart], { type: 'application/zip' }), dire,
        t('Un fichier à couper ({couches}), un fichier à écrire ({stylos}) et les deux ensemble{taille}.', { couches: phraseCouches(r.couches), stylos: pluriel(r.stylos, 'stylo'), taille }));
    }
    return true;
  }
  const r = printThenCut(plat, p);
  if ('erreur' in r) { dire(r.erreur); return false; }
  const resolution = p.printThenCut?.resolution ?? 300;
  const largeur = Math.max(1, Math.round(versUnite(r.vb[2], 'in') * resolution));
  const archiver = (png: Uint8Array | null) => remettre(nom + '-print-then-cut.zip', new Blob([archivePrintThenCut(nom, r, p, png) as BlobPart], { type: 'application/zip' }), dire,
    t('Image à imprimer et ligne de coupe, {taille} avec un fond perdu de {fond}.', { taille: texteTaille(r.vb[2], r.vb[3], p.unite), fond: texteMesure(p.printThenCut?.fondPerdu ?? 0, p.unite) }) + (png ? '' : ' ' + t('Le PNG n’a pas pu être rendu : seuls les SVG sont dans l’archive.')));
  versPng(r.impression, largeur)
    .then(async b => avecDpiPng(new Uint8Array(await b.arrayBuffer()), resolution))
    .then(archiver, () => archiver(null));
  return true;
}

/** Apres le prochain rendu (le gabarit pose, le panneau ouvert) ; tout de suite hors d'un navigateur (les tests sous Node). */
const apresRendu = (f: () => void): void => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f); else f(); };

interface SettersProduction {
  poserProduction: (c: ChoixProduction) => void; poserSuiteCricut: (s: SuiteCricut) => void;
  poserApercuMachine: (a: boolean | ((a: boolean) => boolean)) => void;
}

/** Ce que dit l'apercu de la machine quand on le montre ou le retire. */
export const phraseApercu = (actif: boolean): string => (actif
  ? t('Aperçu de la machine : les zones que la lame découpe sont hachurées, les lignes du stylo tracées.')
  : t('Aperçu de la machine retiré : le dessin dans ses couleurs.'));

export function actionsProduction(lire: () => EtatDuMoment, l: Leviers, s: SettersProduction): ActionsProduction {
  const { appliquer, dire } = l;
  /** « Police à trait unique » : chaque texte vivant a contour du constat, recompose dans la police a trait la plus proche. */
  const policeTrait = async (formes: readonly string[], p: ProfilProduction): Promise<void> => {
    const polices = await toutesLesPolices().catch(() => []);
    const textes = lire().dessin.formes.filter(f => formes.includes(f.id) && f.texte && natureDuTexte(f.texte) === 'contour');
    appliquer(d => textes.reduce((x, f) => {
      const police = polices.find(q => q.id === policeTraitProche(f.texte?.police.id ?? ''));
      return police ? appliquerChangement(x, f.id, { police }, police, p) : x;
    }, d));
    dire(textes.length ? t('{textes} en police à trait unique : chaque lettre s’écrit d’une seule ligne, sans fond. Ctrl+Z annule.', { textes: pluriel(textes.length, 'texte') }) : t('Aucun texte vivant à recomposer : le dessin a changé.'));
  };
  const actions: ActionsProduction = {
    poserProduction: c => {
      const n = normaliserChoix(c), avant = lire().production;
      // Le plan suit le tapis fixe (ADR-0039) : une entree d'historique, puisque le dessin change ; le choix, lui, reste hors de l'historique.
      const plan = planPourChoix(lire().dessin, avant, n);
      s.poserProduction(n);
      s.poserSuiteCricut(null);
      if (plan) appliquer(d => planPourChoix(d, avant, n) ?? d);
      if (n.contexte === 'cricut') retenirUnite(lire().stockage, n.unite);
      const recalageAvant = avant.contexte === 'cricut' && avant.recalage === true, recalageApres = n.contexte === 'cricut' && n.recalage === true;
      if (avant.contexte === 'cricut' && n.contexte === 'cricut' && recalageAvant !== recalageApres && avant.tapis === n.tapis && avant.procede === n.procede) { dire(phraseRecalage(recalageApres, plan !== null)); return; }
      if (avant.contexte === 'cricut' && n.contexte === 'cricut' && avant.tapis === n.tapis && JSON.stringify(avant.feuille) !== JSON.stringify(n.feuille)) {
        const p = resoudreProfil(n);
        if (p) { dire(phraseFeuille(p)); return; }
      }
      // Le tapis qui apparait, ou qui change, se voit en entier : la vue le cadre (apres le rendu qui le pose), le dessin dedans. La
      // phrase du contexte est dite avec ce cadrage, dans le meme rendu : un zoom au clavier qui suit (Entree dans le menu) ne la
      // remplace pas par « Zoom 53 % » dans la region vocale.
      const nouveau = n.contexte === 'cricut' && (avant.contexte !== 'cricut' || avant.tapis !== n.tapis || avant.procede !== n.procede);
      if (!nouveau) { dire(phraseProduction(n)); return; }
      apresRendu(() => { const e = lire(), cadre = cadreDeVue(e.dessin, n); if (cadre) e.vues.cadrer(cadre); dire(phraseProduction(n)); });
    },
    corrigerConstat: (code, voulue) => {
      const { dessin, production } = lire();
      const p = resoudreProfil(production);
      if (!p) return;
      const c = constatsPreparation(dessin, p).find(x => x.code === code);
      const correction = voulue && (c?.correction === voulue || c?.autres?.includes(voulue)) ? voulue : c?.correction;
      if (!c || !correction) { dire(t('Ce constat ne se pose plus : le dessin a changé.')); return; }
      // Une correction n'est pas du moteur (ADR-0022) : recomposer un texte dans une police a trait demande une fonte.
      if (correction === 'police-trait') { void policeTrait(c.formes, p); return; }
      const r = corrigerPreparation(dessin, correction, c, p);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      dire(r.phrase + ' ' + phraseReste(constatsPreparation(r.dessin, p).length, p.procede) + ' ' + t('Ctrl+Z annule.'));
    },
    exporterPourCricut: (nom, quandMeme = false) => {
      const { dessin, production } = lire();
      const p = resoudreProfil(production);
      if (!p) { dire(t('Choisissez d’abord une machine Cricut dans la barre.')); return; }
      // Le jugement du moment, pas celui du panneau (qui suit le dessin d'un instant) : un point a corriger demande une confirmation ;
      // un bloquant laisse l'export le refuser, qui nomme la cause.
      const n = operationsPeintes(dessin, p);
      const e = etatExport(constatsPreparation(dessin, p), p.procede, n.decoupe > 0 && n.ecriture > 0);
      // La barre d'etat dit l'essentiel en une ligne (sur un telephone, la liste y prendrait cinq lignes) ; la region vocale dit chaque
      // point, puisque le focus va a « Revoir » et qu'un lecteur d'ecran n'y lirait pas la liste.
      if (demandeConfirmation(e, quandMeme)) {
        s.poserSuiteCricut('confirmer');
        dire(phraseConfirmationCourte(e.aCorriger.length));
        (l.annoncer ?? dire)(phraseConfirmation(e.aCorriger));
        return;
      }
      s.poserSuiteCricut(exporter(dessin, p, nom, dire) ? 'design-space' : null);
    },
    fermerSuiteCricut: () => s.poserSuiteCricut(null),
    poserOperation: (operation, ids) => {
      const { dessin, production, sel } = lire();
      const p = resoudreProfil(production);
      if (!p || !operationsApplicables(p.procede)) { dire(t('Couper ou écrire se choisit en contexte Cricut, pour la découpe ou le stylo.')); return; }
      const cibles = ids ?? sel;
      if (!cibles.length) { dire(operation === 'decoupe' ? t('Choisissez d’abord une forme à couper.') : t('Choisissez d’abord une forme à écrire.')); return; }
      const voulues = new Set(cibles);
      if (dessin.formes.filter(f => voulues.has(f.id)).every(f => f.verrouille)) { dire(t('Ces formes sont verrouillées : déverrouillez-les pour changer ce que la machine en fait.')); return; }
      const r = poserOperation(dessin, cibles, operation, p.procede);
      // Rien ne change pour la machine : pas d'entree d'historique pour rien.
      if (!r.changees) { dire(r.phrase); return; }
      appliquer(d => poserOperation(d, cibles, operation, p.procede).dessin);
      dire(r.phrase + ' ' + t('Ctrl+Z annule.'));
    },
    ajouterLiens: (reglages, ids) => {
      const { dessin, production, sel, lisserBooleens } = lire();
      const p = resoudreProfil(production);
      if (!p || !operationsApplicables(p.procede)) { dire(t('Les liens se posent en contexte Cricut, sur les formes à couper.')); return false; }
      const cibles = ids ?? sel;
      if (!cibles.length) { dire(t('Choisissez d’abord une forme à couper.')); return false; }
      const r = ajouterLiens(dessin, cibles, { ...reglages, lisser: lisserBooleens }, p.procede);
      // Une forme sans ilot ne change pas : pas d'entree d'historique pour rien, mais la raison dite.
      if (!r.liens) { dire(r.phrase); return false; }
      appliquer(() => r.dessin);
      dire(r.phrase + ' ' + t('Ctrl+Z les retire.'));
      return true;
    },
    poserApercuMachine: a => {
      const avant = lire().apercuMachine;
      const apres = typeof a === 'function' ? a(avant) : a;
      s.poserApercuMachine(apres);
      dire(phraseApercu(apres));
    }
  };
  return actions;
}

/** Le nom court d'un tapis, pour un bouton (« tapis 12 × 24 po ») : un nom qui commence par « Tapis » perd sa majuscule, traduit aussi. */
export function nomTapis(id: string): string {
  const nom = CRICUT.tapis.find(x => x.id === id)?.nom ?? id, traduit = t(nom);
  return /^Tapis /.test(nom) ? traduit.charAt(0).toLowerCase() + traduit.slice(1) : traduit;
}
/** L'unite affichee. */
export const unite = (p: ProfilProduction): string => t(NOMS_UNITE[p.unite]);
