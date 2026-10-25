// Les actions du contexte de production (ADR-0013) : choisir le contexte dans la barre, corriger un constat du
// panneau « Pret pour Cricut », exporter pour la machine. Meme regle que actions.ts : l'etat se lit au moment de
// l'appel, chaque correction n'ouvre qu'une entree d'historique (Ctrl+Z la defait) et se dit a voix haute.

import { useEffect, useRef, useState } from 'react';
import { ecrireDessin, marquerProduction, type DessinSvg } from '../engine/editionSvg.js';
import {
  cadreTapis, constatsPreparation, corrigerPreparation, etendueVisible, marqueDeChoix, normaliserChoix, resoudreProfil, resumePreparation, texteMesure, texteTaille,
  unionCadres, versUnite, type CadreTapis, type ProfilProduction
} from '../engine/preparation.js';
import { svgCricut } from '../export/cricut.js';
import { svgPourStylo } from '../export/stylo.js';
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
import type { Leviers } from './actions.js';
import type { EtatDuMoment } from './creerActions.js';
import { CLE_UNITE, demandeConfirmation, etatExport, lireUnite, phraseConfirmation, phraseConfirmationCourte, phraseCouches } from './parcoursCricut.js';
import type { ActionsEditeur, EtatPreparation, SuiteCricut } from './typesEditeur.js';

/** Le SVG du document tel qu'on l'enregistre : l'ecriture ordinaire, plus la marque du contexte (rien en Generique). */
export const svgDocument = (dessin: DessinSvg, production: ChoixProduction): string => marquerProduction(ecrireDessin(dessin, 3), marqueDeChoix(production));

/** La phrase qui dit le contexte choisi. */
export function phraseProduction(c: ChoixProduction): string {
  if (c.contexte !== 'cricut') return 'Contexte générique : le dessin n’est plus jugé pour une machine.';
  const p = resoudreProfil(c);
  if (!p) return 'Contexte Cricut.';
  return 'Contexte Cricut : ' + p.machine.nom + ', ' + p.tapis.nom.toLowerCase() + ', ' + p.materiau.nom.toLowerCase() + (p.procede === 'imprimer-decouper' ? ', Print Then Cut' : p.procede === 'dessin-stylo' ? ', dessin au stylo' : '') + ', en ' + (p.unite === 'in' ? 'pouces' : 'millimètres') + '.';
}

/** Le resume du jugement : le nombre de constats, ou « pret ». */
export const phraseReste = (n: number, procede: ProfilProduction['procede']): string => (n ? 'Reste ' + pluriel(n, 'constat') + '.' : procede === 'imprimer-decouper' ? 'Prêt pour Print Then Cut.' : procede === 'dessin-stylo' ? 'Prêt à dessiner.' : 'Prêt à découper.');

/**
 * Le jugement du dessin pour le profil, un instant apres la derniere modification : pendant un geste continu, le panneau
 * garde le jugement d'avant plutot que de mesurer a chaque mouvement (les parties fines coutent un decalage par forme).
 */
export function usePreparation(dessin: DessinSvg, profil: ProfilProduction | null): EtatPreparation | null {
  const [etat, poserEtat] = useState<EtatPreparation | null>(null);
  const deja = useRef(false);
  useEffect(() => {
    if (!profil) { deja.current = false; poserEtat(null); return; }
    const t = setTimeout(() => {
      const r = resumePreparation(dessin);
      poserEtat({ profil, dessin, constats: constatsPreparation(dessin, profil), couches: r.couches, taille: r.taille });
      deja.current = true;
    }, deja.current ? 200 : 0);
    return () => clearTimeout(t);
  }, [dessin, profil]);
  return profil && etat?.profil === profil ? etat : null;
}

type ActionsProduction = Pick<ActionsEditeur, 'poserProduction' | 'corrigerConstat' | 'exporterPourCricut' | 'fermerSuiteCricut'>;

/**
 * Ce que « Ajuster » cadre en contexte de decoupe : le tapis entier tel que la toile le dessine, et le dessin s'il en deborde ; null
 * hors de ce contexte (Generique, Print Then Cut : pas de gabarit), ou la vue cadre le dessin comme avant.
 */
export function cadreDeVue(dessin: DessinSvg, production: ChoixProduction): CadreTapis | null {
  const p = resoudreProfil(production);
  // Le tapis compte pour la lame et pour le stylo (ADR-0022) ; Print Then Cut n'a pas de gabarit.
  if (!p || p.procede === 'imprimer-decouper') return null;
  const etendue = etendueVisible(dessin);
  return unionCadres(cadreTapis(p, etendue ?? { x: dessin.vb[0], y: dessin.vb[1] }), etendue);
}

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

/** Le SVG de decoupe, ou l'archive Print Then Cut (avec son PNG a la resolution du profil), remis au telechargement. Faux s'il est refuse. */
function exporter(dessin: DessinSvg, p: ProfilProduction, nom: string, dire: (t: string) => void): boolean {
  if (p.procede === 'dessin-stylo') {
    const r = svgPourStylo(dessin, p);
    if (r.erreur !== undefined) { dire(r.erreur); return false; }
    const taille = resumePreparation(dessin).taille;
    remettre(nom + '-stylo.svg', texteOctets(r.svg), dire, pluriel(r.couches, 'couleur') + ' : ' + pluriel(r.couches, 'stylo') + (taille ? ', ' + texteTaille(taille.l, taille.h, p.unite) : '') + '.');
    return true;
  }
  if (p.procede === 'decoupe') {
    const r = svgCricut(dessin, p);
    if ('erreur' in r) { dire(r.erreur); return false; }
    const taille = resumePreparation(dessin).taille;
    remettre(nom + '-cricut.svg', texteOctets(r.svg), dire, phraseCouches(r.couches) + (taille ? ', ' + texteTaille(taille.l, taille.h, p.unite) : '') + '.');
    return true;
  }
  const r = printThenCut(dessin, p);
  if ('erreur' in r) { dire(r.erreur); return false; }
  const resolution = p.printThenCut?.resolution ?? 300;
  const largeur = Math.max(1, Math.round(versUnite(r.vb[2], 'in') * resolution));
  const archiver = (png: Uint8Array | null) => remettre(nom + '-print-then-cut.zip', new Blob([archivePrintThenCut(nom, r, p, png) as BlobPart], { type: 'application/zip' }), dire,
    'Image à imprimer et ligne de coupe, ' + texteTaille(r.vb[2], r.vb[3], p.unite) + ' avec un fond perdu de ' + texteMesure(p.printThenCut?.fondPerdu ?? 0, p.unite) + '.' + (png ? '' : ' Le PNG n’a pas pu être rendu : seuls les SVG sont dans l’archive.'));
  versPng(r.impression, largeur)
    .then(async b => avecDpiPng(new Uint8Array(await b.arrayBuffer()), resolution))
    .then(archiver, () => archiver(null));
  return true;
}

/** Apres le prochain rendu (le gabarit pose, le panneau ouvert) ; tout de suite hors d'un navigateur (les tests sous Node). */
const apresRendu = (f: () => void): void => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(f); else f(); };

interface SettersProduction { poserProduction: (c: ChoixProduction) => void; poserSuiteCricut: (s: SuiteCricut) => void }

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
    dire(textes.length ? pluriel(textes.length, 'texte') + ' en police à trait unique : chaque lettre s’écrit d’une seule ligne, sans fond. Ctrl+Z annule.' : 'Aucun texte vivant à recomposer : le dessin a changé.');
  };
  const actions: ActionsProduction = {
    poserProduction: c => {
      const n = normaliserChoix(c), avant = lire().production;
      s.poserProduction(n);
      s.poserSuiteCricut(null);
      if (n.contexte === 'cricut') retenirUnite(lire().stockage, n.unite);
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
      if (!c || !correction) { dire('Ce constat ne se pose plus : le dessin a changé.'); return; }
      // Deux corrections ne sont pas du moteur (ADR-0022) : passer au procede du stylo, et recomposer un texte dans une police a trait.
      if (correction === 'procede-stylo' && production.contexte === 'cricut') { actions.poserProduction({ ...production, procede: 'dessin-stylo' }); return; }
      if (correction === 'police-trait') { void policeTrait(c.formes, p); return; }
      const r = corrigerPreparation(dessin, correction, c, p);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      dire(r.phrase + ' ' + phraseReste(constatsPreparation(r.dessin, p).length, p.procede) + ' Ctrl+Z annule.');
    },
    exporterPourCricut: (nom, quandMeme = false) => {
      const { dessin, production } = lire();
      const p = resoudreProfil(production);
      if (!p) { dire('Choisissez d’abord une machine Cricut dans la barre.'); return; }
      // Le jugement du moment, pas celui du panneau (qui suit le dessin d'un instant) : un point a corriger demande une confirmation ;
      // un bloquant laisse l'export le refuser, qui nomme la cause.
      const e = etatExport(constatsPreparation(dessin, p), p.procede);
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
    fermerSuiteCricut: () => s.poserSuiteCricut(null)
  };
  return actions;
}

/** Le nom court d'un tapis, pour un bouton (« tapis 12 × 24 po »). */
export const nomTapis = (id: string): string => (CRICUT.tapis.find(t => t.id === id)?.nom ?? id).replace(/^Tapis /, 'tapis ');
/** L'unite affichee. */
export const unite = (p: ProfilProduction): string => NOMS_UNITE[p.unite];
