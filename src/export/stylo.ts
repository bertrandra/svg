// Le SVG pour le stylo d'une machine de decoupe (ADR-0022, procede « Dessin au stylo ») : des traits, AUCUN remplissage
// (le stylo ne remplit pas : ce qu'on ecrit est ce qu'il trace), une couleur par stylo et par couche, une taille physique
// (`width` et `height` en pouces ou en millimetres, comme l'export Cricut). Un trait ouvert reste ouvert ; une forme pleine
// sans trait s'ecrit par son pourtour, a la couleur de son fond et a la largeur du stylo : c'est ce que le stylo en ferait,
// et le panneau l'a dit avant (constat « Le stylo trace le pourtour des formes pleines »). Bati sur `svgExporte` : memes
// nombres, meme ordre, memes octets demain. Pur.

import { dessinSansTextes, marquerProduction, type DessinSvg, type Forme } from '../engine/editionSvg.js';
import type { UniteLongueur } from '../model/contextes.js';
import { constatsBloquants, marqueDeProfil, partagerOperations, versUnite, type ProfilProduction } from '../engine/preparation.js';
import { svgExporte } from './svgs.js';
import { phraseRefus } from './cricut.js';

export interface ExportStylo { readonly svg: string; readonly couches: number; readonly pourtours: number }

/** Les champs qu'un trait de stylo n'a pas : l'opacite (un stylo ecrit plein) et le texte vivant (le fichier porte les traits). */
const CHAMPS_RETIRES: ReadonlySet<string> = new Set(['opaciteRemplissage', 'opaciteContour', 'operation']);

/** La forme telle que le stylo la trace : son trait (ou, sans trait, son pourtour a la couleur du fond), sans fond, opaque. */
export function enTrait(f: Forme, largeur: number): Forme {
  const reste = Object.fromEntries(Object.entries(f).filter(([c]) => !CHAMPS_RETIRES.has(c))) as unknown as Forme;
  const couleur = f.contour ?? f.remplissage ?? '#000000';
  const epaisseur = f.contour && f.epaisseur > 0 ? f.epaisseur : largeur;
  return { ...reste, remplissage: null, contour: couleur, epaisseur, opacite: 1 };
}

/**
 * Le SVG du stylo : chaque forme visible en trait, sans fond, a sa taille physique. `largeur` est celle du stylo en unites du
 * plan (le trait d'une forme pleine qui n'en avait pas). Les couches sont les couleurs distinctes : un stylo par couleur.
 */
export function svgStylo(dessin: DessinSvg, unite: UniteLongueur, largeur: number): ExportStylo {
  const visibles = dessinSansTextes(dessin).formes.filter(f => f.visible && (f.contour !== null || f.remplissage !== null));
  const traits = visibles.map(f => enTrait(f, largeur));
  const couches = new Set(traits.map(f => (f.contour ?? '').toLowerCase())).size;
  const svg = svgExporte({ vb: dessin.vb, formes: traits }, { precision: 3, taille: { largeur: versUnite(dessin.vb[2], unite), unite } });
  return { svg, couches, pourtours: visibles.filter(f => !f.contour || !(f.epaisseur > 0)).length };
}

export type ExportStyloProfil = (ExportStylo & { readonly erreur?: undefined }) | { readonly erreur: string };

/**
 * L'export du procede « Dessin au stylo » pour un profil : le refus d'un dessin a constat bloquant (une piece plus grande que le
 * tapis), sinon les traits des formes a ecrire a la taille physique du profil et a la largeur de son stylo, avec la marque du
 * contexte (rouvert dans l'editeur, le fichier retrouve son panneau).
 */
export function svgPourStylo(dessin: DessinSvg, p: ProfilProduction): ExportStyloProfil {
  const profil: ProfilProduction = p.procede === 'dessin-stylo' ? p : { ...p, procede: 'dessin-stylo' };
  // Seules les formes a ecrire (ADR-0028), selon le procede du profil d'origine : en decoupe, une forme pleine reste a la lame.
  const { ecriture } = p.procede === 'imprimer-decouper' ? { ecriture: dessin } : partagerOperations(dessin, p.procede);
  const bloquants = constatsBloquants(ecriture, profil);
  if (bloquants.length) return { erreur: phraseRefus(bloquants) };
  const r = svgStylo(ecriture, profil.unite, profil.largeurStylo);
  return { ...r, svg: marquerProduction(r.svg, marqueDeProfil(profil)) };
}
