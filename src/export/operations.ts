// L'export pour Cricut quand le dessin mele couper et ecrire (ADR-0028). Le SVG ne dit pas a Design Space qu'une ligne se dessine :
// le type de ligne se regle apres l'import, calque par calque (ADR-0013). Le plus sur est donc de separer les operations avant
// l'import : un fichier par operation, chacun d'une seule nature (des fonds pleins pour la lame, des traits sans fond pour le stylo),
// au meme cadre et a la meme taille physique, et un fichier combine ou les deux operations sont deux groupes nommes. Le tout dans
// une archive ZIP avec son mode d'emploi. Un dessin d'une seule operation s'exporte comme avant : un seul SVG. Pur et
// reproductible : memes entrees, memes octets.

import { dessinSansTextes, marquerProduction, type DessinSvg } from '../engine/editionSvg.js';
import type { DessinPlat } from '../engine/aplatir.js';
import {
  cadreFixe, compterOperations, constatsBloquants, formesPeintes, marqueDeProfil, partagerOperations, texteTaille, versUnite, type ProfilProduction
} from '../engine/preparation.js';
import { DESIGN_SPACE_OPERATIONS, DESIGN_SPACE_POSITION } from '../model/contextes.js';
import { pleine, phraseRefus, svgCricut } from './cricut.js';
import { enTrait, svgPourStylo } from './stylo.js';
import { svgExporte } from './svgs.js';
import { ecrireZip, nomSur } from './zip.js';
import { avecReperage, cadresReperage, couleursDistinctes } from './reperage.js';

/** Les identifiants des deux groupes du fichier combine : des noms sans accent ni espace, que Design Space montrera peut-etre. */
export const GROUPE_A_COUPER = 'a-couper';
export const GROUPE_A_ECRIRE = 'a-ecrire';

export type ExportParOperation =
  | { readonly genre: 'decoupe'; readonly svg: string; readonly couches: number }
  | { readonly genre: 'ecriture'; readonly svg: string; readonly couches: number }
  | {
    readonly genre: 'mixte'; readonly aCouper: string; readonly aEcrire: string; readonly combine: string;
    /** Les couleurs de la lame (une couche, un tapis) et celles du stylo (une couleur, un stylo). */
    readonly couches: number; readonly stylos: number;
    readonly formes: { readonly decoupe: number; readonly ecriture: number };
  }
  | { readonly erreur: string };

/** Combien de formes peintes se coupent et s'ecrivent : une forme visible sans rien de peint ne compte pour aucune. */
export function operationsPeintes(dessin: DessinSvg, p: ProfilProduction): { readonly decoupe: number; readonly ecriture: number } {
  if (p.procede === 'imprimer-decouper') return { decoupe: formesPeintes(dessin).length, ecriture: 0 };
  const { decoupe, ecriture } = partagerOperations(dessin, p.procede);
  return { decoupe: formesPeintes(decoupe).length, ecriture: formesPeintes(ecriture).length };
}

/**
 * Le fichier combine : les formes a couper (fonds pleins) puis les formes a ecrire (traits sans fond, a la largeur du stylo), dans
 * deux groupes nommes, au cadre et a la taille physique du dessin. La marque dit « decoupe » : rouvert dans l'editeur, une forme pleine
 * s'y propose a couper et une ligne a ecrire, si bien que le partage revient sans rien ecrire de plus sur les formes.
 */
export function svgCombine(dessin: DessinSvg, p: ProfilProduction): string {
  const procede = p.procede === 'imprimer-decouper' ? 'decoupe' : p.procede;
  const { decoupe, ecriture } = partagerOperations(dessin, procede);
  const coupees = decoupe.formes.filter(f => f.visible && f.remplissage !== null).map(pleine);
  const ecrites = dessinSansTextes(ecriture).formes.filter(f => f.visible && (f.contour !== null || f.remplissage !== null)).map(f => enTrait(f, p.largeurStylo));
  // Sans recalage automatique (ADR-0039), les cadres de reperage des couleurs de la lame ouvrent le groupe a couper.
  const pose = avecReperage({ vb: dessin.vb, formes: coupees }, p, zone => cadresReperage(zone, couleursDistinctes(coupees.map(f => f.remplissage)), { plein: true }));
  const svg = svgExporte({ vb: pose.vb, formes: [...pose.formes, ...ecrites] }, { precision: 3, taille: { largeur: versUnite(pose.vb[2], p.unite), unite: p.unite } });
  return marquerProduction(grouper(svg, pose.formes.length, ecrites.length), marqueDeProfil({ ...p, procede: 'decoupe' }));
}

/**
 * Pose les deux groupes autour des chemins ecrits : chaque forme s'ecrit en un seul `<path …/>`, dans l'ordre, apres un eventuel
 * `<metadata>` d'attribution qui n'en contient aucun. Les `n` premiers sont a couper, les `m` suivants a ecrire.
 */
function grouper(svg: string, n: number, m: number): string {
  const debut = svg.indexOf('<path ');
  const fin = svg.lastIndexOf('</svg>');
  if (debut < 0 || fin < 0) return svg;
  // Un decoupage sur « <path » (aucun attribut ecrit n'en contient) : pas de regard en arriere, que d'anciens moteurs n'ont pas (ADR-0016).
  const chemins = svg.slice(debut, fin).split('<path ').filter(c => c !== '').map(c => '<path ' + c);
  if (chemins.length !== n + m) return svg;
  return svg.slice(0, debut) + '<g id="' + GROUPE_A_COUPER + '">' + chemins.slice(0, n).join('') + '</g><g id="' + GROUPE_A_ECRIRE + '">' + chemins.slice(n).join('') + '</g>' + svg.slice(fin);
}

/**
 * L'export Cricut selon les operations du dessin (hors Print Then Cut, qui a le sien) : un seul SVG quand tout se coupe ou tout
 * s'ecrit, les trois fichiers d'un dessin mele sinon. Le refus d'un constat bloquant (sur tout le dessin : la taille compte pour la
 * lame comme pour le stylo) est nomme, comme l'export d'une seule operation le nomme.
 */
export function exportParOperation(dessin: DessinPlat, p: ProfilProduction): ExportParOperation {
  const n = operationsPeintes(dessin, p);
  if (!n.ecriture) {
    const r = svgCricut(dessin, p);
    return 'erreur' in r ? { erreur: r.erreur } : { genre: 'decoupe', svg: r.svg, couches: r.couches };
  }
  if (!n.decoupe) {
    const r = svgPourStylo(dessin, p);
    return r.erreur !== undefined ? { erreur: r.erreur } : { genre: 'ecriture', svg: r.svg, couches: r.couches };
  }
  const bloquants = constatsBloquants(dessin, p);
  if (bloquants.length) return { erreur: phraseRefus(bloquants) };
  const c = svgCricut(dessin, p), e = svgPourStylo(dessin, p);
  if ('erreur' in c) return { erreur: c.erreur };
  if (e.erreur !== undefined) return { erreur: e.erreur };
  return { genre: 'mixte', aCouper: c.svg, aEcrire: e.svg, combine: svgCombine(dessin, p), couches: c.couches, stylos: e.couches, formes: compterOperations(dessin, p.procede) };
}

/** Les noms des fichiers de l'archive : la forme du nom de la page, sans accent ni espace. */
export const nomsOperations = (nom: string): { readonly archive: string; readonly aCouper: string; readonly aEcrire: string; readonly combine: string } => {
  const base = nomSur(nom);
  return { archive: base + '-cricut.zip', aCouper: base + '-a-couper.svg', aEcrire: base + '-a-ecrire.svg', combine: base + '-cricut.svg' };
};

/** Le mode d'emploi de l'archive : ce qu'on y trouve, la taille, et la marche dans Design Space, ce qui n'est pas verifie marque. */
export function modeDEmploiOperations(nom: string, dessin: DessinSvg, p: ProfilProduction, r: Extract<ExportParOperation, { genre: 'mixte' }>): string {
  // Sans recalage automatique (ADR-0039), les fichiers ont la taille du tapis et portent des cadres de reperage.
  const tapis = p.recalage ? null : cadreFixe(p, dessin.vb);
  const f = nomsOperations(nom), taille = tapis ? texteTaille(tapis.l, tapis.h, p.unite) : texteTaille(dessin.vb[2], dessin.vb[3], p.unite);
  const formes = (k: number) => k + ' forme' + (k > 1 ? 's' : '');
  return [
    'Cricut — ' + nomSur(nom) + ' : couper et écrire',
    '',
    'Fichiers :',
    '- ' + f.aCouper + ' : les ' + formes(r.formes.decoupe) + ' à couper, fonds pleins, une couleur par tapis (' + r.couches + ').',
    '- ' + f.aEcrire + ' : les ' + formes(r.formes.ecriture) + ' à écrire au stylo, des traits sans remplissage, une couleur par stylo (' + r.stylos + ').',
    '- ' + f.combine + ' : les deux ensemble, en deux groupes, « ' + GROUPE_A_COUPER + ' » puis « ' + GROUPE_A_ECRIRE + ' ».',
    '',
    'Tailles : les trois fichiers font ' + taille + ' (même cadre : posés au même endroit, ils se superposent).',
    '',
    'Dans Design Space (À VÉRIFIER, voir docs/cricut/protocole.md, témoin 9) :',
    '1. Importez ' + f.aCouper + ', puis ' + f.aEcrire + ', sans changer leur taille.',
    '2. Sélectionnez les calques de ' + f.aEcrire + ' et choisissez « Dessiner » (une couleur, un stylo) ; les autres restent sur « Couper ».',
    ...(tapis ? [
      '3. Recalage automatique désactivé : chaque fichier porte un cadre de repérage par couleur, de la taille de la zone utile (' + texteTaille(p.zoneUtile.l, p.zoneUtile.h, p.unite) + '). Pour chaque couleur, sélectionnez le cadre et les formes de sa couleur, « Attachez »-les, puis passez le cadre en « Guide » : les formes se coupent à leur place sur le tapis (À VÉRIFIER, témoin 10).'
    ] : ['3. Sélectionnez les deux et « Attachez »-les : le stylo écrit alors à sa place sur la pièce découpée.']),
    'Ou importez ' + f.combine + ' seul : si Design Space garde ses groupes, le groupe « ' + GROUPE_A_ECRIRE + ' » passe en « Dessiner » d’un coup.',
    '',
    'Ce qui n’a pas été essayé sur une machine :',
    ...[...DESIGN_SPACE_OPERATIONS, ...(tapis ? DESIGN_SPACE_POSITION : [])].map(c => '- ' + c.texte)
  ].join('\n') + '\n';
}

/** L'archive d'un dessin mele : le mode d'emploi, le fichier a couper, le fichier a ecrire, le fichier combine. Deterministe. */
export function archiveOperations(nom: string, dessin: DessinPlat, p: ProfilProduction, r: Extract<ExportParOperation, { genre: 'mixte' }>): Uint8Array {
  const f = nomsOperations(nom), texte = new TextEncoder();
  return ecrireZip([
    { nom: 'LISEZMOI.txt', donnees: texte.encode(modeDEmploiOperations(nom, dessin, p, r)) },
    { nom: f.aCouper, donnees: texte.encode(r.aCouper) },
    { nom: f.aEcrire, donnees: texte.encode(r.aEcrire) },
    { nom: f.combine, donnees: texte.encode(r.combine) }
  ]);
}
