// Les actions du contexte de production (ADR-0013) : choisir le contexte dans la barre, corriger un constat du
// panneau « Pret pour Cricut », exporter pour la machine. Meme regle que actions.ts : l'etat se lit au moment de
// l'appel, chaque correction n'ouvre qu'une entree d'historique (Ctrl+Z la defait) et se dit a voix haute.

import { useEffect, useRef, useState } from 'react';
import { ecrireDessin, marquerProduction, type DessinSvg } from '../engine/editionSvg.js';
import {
  constatsPreparation, corrigerPreparation, marqueDeChoix, normaliserChoix, resoudreProfil, resumePreparation, texteMesure, texteTaille, versUnite,
  type ProfilProduction
} from '../engine/preparation.js';
import { svgCricut } from '../export/cricut.js';
import { avecDpiPng } from '../export/png.js';
import { archivePrintThenCut, printThenCut } from '../export/printThenCut.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { versPng } from '../io/image.js';
import { CRICUT, NOMS_UNITE, type ChoixProduction } from '../model/contextes.js';
import { pluriel } from '../util/texte.js';
import type { EtatLu, Leviers } from './actions.js';
import type { ActionsEditeur, EtatPreparation } from './typesEditeur.js';

/** Le SVG du document tel qu'on l'enregistre : l'ecriture ordinaire, plus la marque du contexte (rien en Generique). */
export const svgDocument = (dessin: DessinSvg, production: ChoixProduction): string => marquerProduction(ecrireDessin(dessin, 3), marqueDeChoix(production));

/** La phrase qui dit le contexte choisi. */
export function phraseProduction(c: ChoixProduction): string {
  if (c.contexte !== 'cricut') return 'Contexte générique : le dessin n’est plus jugé pour une machine.';
  const p = resoudreProfil(c);
  if (!p) return 'Contexte Cricut.';
  return 'Contexte Cricut : ' + p.machine.nom + ', ' + p.tapis.nom.toLowerCase() + ', ' + p.materiau.nom.toLowerCase() + (p.procede === 'imprimer-decouper' ? ', Print Then Cut' : '') + ', en ' + (p.unite === 'in' ? 'pouces' : 'millimètres') + '.';
}

/** Le resume du jugement : le nombre de constats, ou « pret ». */
export const phraseReste = (n: number, procede: ProfilProduction['procede']): string => (n ? 'Reste ' + pluriel(n, 'constat') + '.' : procede === 'imprimer-decouper' ? 'Prêt pour Print Then Cut.' : 'Prêt à découper.');

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

type ActionsProduction = Pick<ActionsEditeur, 'poserProduction' | 'corrigerConstat' | 'exporterPourCricut'>;

const remettre = (nom: string, donnees: Uint8Array | Blob, dire: (t: string) => void, suite: string) => { void proposer(nom, donnees).then(m => dire(m + (suite ? ' ' + suite : ''))); };

/** Le SVG de decoupe, ou l'archive Print Then Cut (avec son PNG a la resolution du profil), remis au telechargement. */
function exporter(dessin: DessinSvg, p: ProfilProduction, nom: string, dire: (t: string) => void): void {
  if (p.procede === 'decoupe') {
    const r = svgCricut(dessin, p);
    if ('erreur' in r) { dire(r.erreur); return; }
    const taille = resumePreparation(dessin).taille;
    remettre(nom + '-cricut.svg', texteOctets(r.svg), dire, pluriel(r.couches, 'couche') + ' : ' + pluriel(r.couches, 'tapis') + (taille ? ', ' + texteTaille(taille.l, taille.h, p.unite) : '') + '.');
    return;
  }
  const r = printThenCut(dessin, p);
  if ('erreur' in r) { dire(r.erreur); return; }
  const resolution = p.printThenCut?.resolution ?? 300;
  const largeur = Math.max(1, Math.round(versUnite(r.vb[2], 'in') * resolution));
  const archiver = (png: Uint8Array | null) => remettre(nom + '-print-then-cut.zip', new Blob([archivePrintThenCut(nom, r, p, png) as BlobPart], { type: 'application/zip' }), dire,
    'Image à imprimer et ligne de coupe, ' + texteTaille(r.vb[2], r.vb[3], p.unite) + ' avec un fond perdu de ' + texteMesure(p.printThenCut?.fondPerdu ?? 0, p.unite) + '.' + (png ? '' : ' Le PNG n’a pas pu être rendu : seuls les SVG sont dans l’archive.'));
  versPng(r.impression, largeur)
    .then(async b => avecDpiPng(new Uint8Array(await b.arrayBuffer()), resolution))
    .then(archiver, () => archiver(null));
}

export function actionsProduction(lire: () => EtatLu, l: Leviers, poserProductionBrut: (c: ChoixProduction) => void): ActionsProduction {
  const { appliquer, dire } = l;
  return {
    poserProduction: c => {
      const n = normaliserChoix(c);
      poserProductionBrut(n);
      dire(phraseProduction(n));
    },
    corrigerConstat: code => {
      const { dessin, production } = lire();
      const p = resoudreProfil(production);
      if (!p) return;
      const c = constatsPreparation(dessin, p).find(x => x.code === code);
      if (!c?.correction) { dire('Ce constat ne se pose plus : le dessin a changé.'); return; }
      const r = corrigerPreparation(dessin, c.correction, c, p);
      if ('erreur' in r) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      dire(r.phrase + ' ' + phraseReste(constatsPreparation(r.dessin, p).length, p.procede) + ' Ctrl+Z annule.');
    },
    exporterPourCricut: nom => {
      const { dessin, production } = lire();
      const p = resoudreProfil(production);
      if (!p) { dire('Choisissez d’abord le contexte Cricut dans la barre.'); return; }
      exporter(dessin, p, nom, dire);
    }
  };
}

/** Le nom court d'un tapis, pour un bouton (« tapis 12 × 24 po »). */
export const nomTapis = (id: string): string => (CRICUT.tapis.find(t => t.id === id)?.nom ?? id).replace(/^Tapis /, 'tapis ');
/** L'unite affichee. */
export const unite = (p: ProfilProduction): string => NOMS_UNITE[p.unite];
