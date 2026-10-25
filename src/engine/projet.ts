// Le projet et le dessin du modele, dans les deux sens (ADR-0030). Pur : un projet valide (model/projet.ts) devient le dessin que
// l'editeur ouvre, et l'etat de l'editeur devient un projet a enregistrer. L'aller-retour est exact : projet -> dessin -> projet rend
// le meme projet, et le SVG ecrit depuis un projet rouvert est celui ecrit avant l'enregistrement, octet pour octet (chaque nombre
// du trace garde sa pleine precision, chaque champ facultatif reste absent quand il l'etait).

import type { ChoixProduction } from '../model/contextes.js';
import {
  FORMAT_PROJET, VERSION_PROJET, nomDeProjet,
  type FormeProjet, type ImageProjet, type PoliceProjet, type Projet, type TeinteProjet, type TexteProjet
} from '../model/projet.js';
import { peintureSure, type Chemin, type Commande, type DessinSvg, type DispositionTexte, type Forme, type Lettre, type TexteVivant } from './editionSvg.js';
import type { DispositionProjet } from '../model/projet.js';
import type { NuancierDessin } from '../model/nuancier.js';


/** Ce que l'editeur et son hote savent d'un travail : de quoi ecrire un projet, et ce qu'un projet rouvert redonne. */
export interface EtatProjet {
  readonly nom: string;
  readonly dessin: DessinSvg;
  readonly production: ChoixProduction;
  readonly nuancier: readonly TeinteProjet[];
  /** Les fontes deposees qu'emploient les textes du dessin, incluses (une fonte qu'aucun texte n'emploie ne se garde pas). */
  readonly polices: readonly PoliceProjet[];
  readonly images: readonly ImageProjet[];
  readonly creeLe?: string | undefined;
  readonly modifieLe?: string | undefined;
}

/**
 * Un nombre a sa pleine precision : le plus court texte que `Number` relit a l'identique (celui de JavaScript), et « -0 » pour le
 * zero negatif, que `String` ecrirait « 0 ».
 */
const nombreExact = (v: number): string => (Object.is(v, -0) ? '-0' : String(v));

/** Le chemin en texte de projet : « M10 20L30 40Z ». */
export function ecrireCheminProjet(d: Chemin): string {
  let s = '';
  for (const c of d) s += c.c + c.p.map(nombreExact).join(' ');
  return s;
}

/** Le chemin d'un texte de projet deja valide (`cheminProjetValide`) : les memes commandes, les memes nombres. */
export function lireCheminProjet(d: string): Chemin {
  if (d === '') return [];
  return d.split(/(?=[MLCQZ])/).map((m): Commande => {
    const reste = m.slice(1);
    return { c: m.charAt(0) as Lettre, p: reste === '' ? [] : reste.split(' ').map(Number) };
  });
}

/** Une disposition (ADR-0031), champ pour champ, dans l'ordre du modele : la meme copie sert dans les deux sens. */
function disposition<D extends DispositionTexte | DispositionProjet>(d: D): D {
  return (d.mode === 'sur'
    ? { mode: 'sur', forme: d.forme, depart: d.depart, cote: d.cote, repartir: d.repartir }
    : { mode: 'dans', forme: d.forme, marge: d.marge, ajuster: d.ajuster, justifier: d.justifier }) as D;
}

function texteProjet(t: TexteVivant): TexteProjet {
  return {
    texte: t.texte,
    police: { id: t.police.id, ...(t.police.version !== undefined ? { version: t.police.version } : {}), ...(t.police.famille !== undefined ? { famille: t.police.famille } : {}) },
    taille: t.taille, interlettrage: t.interlettrage, interligne: t.interligne, alignement: t.alignement, ligatures: t.ligatures,
    ...(t.trace !== undefined ? { trace: t.trace } : {}),
    matrice: [t.matrice[0], t.matrice[1], t.matrice[2], t.matrice[3], t.matrice[4], t.matrice[5]],
    ...(t.disposition !== undefined ? { disposition: disposition(t.disposition) } : {})
  };
}

const texteVivant = (t: TexteProjet): TexteVivant => ({
  texte: t.texte,
  police: { id: t.police.id, ...(t.police.version !== undefined ? { version: t.police.version } : {}), ...(t.police.famille !== undefined ? { famille: t.police.famille } : {}) },
  taille: t.taille, interlettrage: t.interlettrage, interligne: t.interligne, alignement: t.alignement, ligatures: t.ligatures,
  ...(t.trace !== undefined ? { trace: t.trace } : {}),
  matrice: [t.matrice[0], t.matrice[1], t.matrice[2], t.matrice[3], t.matrice[4], t.matrice[5]],
  ...(t.disposition !== undefined ? { disposition: disposition(t.disposition) } : {})
});

/**
 * Les champs facultatifs d'une forme, dans l'ordre du format, chacun seulement quand il est present : le meme etalement sert dans
 * les deux sens, ce qui garde l'ordre et l'absence a l'identique.
 */
function facultatifs(f: Forme | FormeProjet): Partial<Forme & FormeProjet> {
  return {
    ...(f.opaciteRemplissage !== undefined ? { opaciteRemplissage: f.opaciteRemplissage } : {}),
    ...(f.opaciteContour !== undefined ? { opaciteContour: f.opaciteContour } : {}),
    ...(f.pointilles !== undefined ? { pointilles: [...f.pointilles] } : {}),
    ...(f.decalagePointilles !== undefined ? { decalagePointilles: f.decalagePointilles } : {}),
    ...(f.bout !== undefined ? { bout: f.bout } : {}),
    ...(f.jonction !== undefined ? { jonction: f.jonction } : {}),
    ...(f.limiteMitre !== undefined ? { limiteMitre: f.limiteMitre } : {}),
    ...(f.origine !== undefined ? { origine: [...f.origine] } : {})
  };
}

/** Une forme du modele en forme de projet. */
export function formeProjet(f: Forme): FormeProjet {
  return {
    id: f.id, d: ecrireCheminProjet(f.d), remplissage: f.remplissage, contour: f.contour, epaisseur: f.epaisseur, opacite: f.opacite,
    ...facultatifs(f),
    ...(f.texte !== undefined ? { texte: texteProjet(f.texte) } : {}),
    ...(f.operation !== undefined ? { operation: f.operation } : {}),
    regle: f.regle, visible: f.visible, verrouille: f.verrouille
  } as FormeProjet;
}

/** Une forme de projet (deja validee) en forme du modele. */
export function formeDuProjet(f: FormeProjet): Forme {
  return {
    id: f.id, d: lireCheminProjet(f.d), remplissage: f.remplissage, contour: f.contour, epaisseur: f.epaisseur, opacite: f.opacite,
    ...facultatifs(f),
    ...(f.texte !== undefined ? { texte: texteVivant(f.texte) } : {}),
    ...(f.operation !== undefined ? { operation: f.operation } : {}),
    regle: f.regle, visible: f.visible, verrouille: f.verrouille
  } as Forme;
}

const choixCopie = (c: ChoixProduction): ChoixProduction => (c.contexte === 'cricut'
  ? { contexte: 'cricut', machine: c.machine, tapis: c.tapis, materiau: c.materiau, procede: c.procede, unite: c.unite }
  : { contexte: 'generique' });

/**
 * Le nuancier du dessin (ADR-0037), champ pour champ et dans l'ordre du format, a etaler : absent quand le dessin n'en porte pas
 * (un projet d'avant lui reste tel quel, octet pour octet).
 */
const nuancierCopie = (n: NuancierDessin | undefined): { nuancier?: NuancierDessin } => (n === undefined ? {} : {
  nuancier: { provenance: n.provenance, teintes: n.teintes.map(t => (t.opacite === undefined ? { hex: t.hex } : { hex: t.hex, opacite: t.opacite })) }
});

/** Le projet d'un etat de l'editeur : le nom assaini, les champs dans l'ordre du format, les dates seulement quand le serveur les a posees. */
export function projetDe(e: EtatProjet): Projet {
  return {
    format: FORMAT_PROJET, version: VERSION_PROJET, nom: nomDeProjet(e.nom),
    ...(e.creeLe !== undefined ? { creeLe: e.creeLe } : {}),
    ...(e.modifieLe !== undefined ? { modifieLe: e.modifieLe } : {}),
    dessin: { vb: [e.dessin.vb[0], e.dessin.vb[1], e.dessin.vb[2], e.dessin.vb[3]], formes: e.dessin.formes.map(formeProjet), ...nuancierCopie(e.dessin.nuancier) },
    production: choixCopie(e.production),
    nuancier: e.nuancier.map(t => ({ nom: t.nom, hex: t.hex })),
    ressources: {
      polices: e.polices.map(p => ({ id: p.id, famille: p.famille, donnees: p.donnees })),
      images: e.images.map(i => ({ role: i.role, nom: i.nom, type: i.type, donnees: i.donnees }))
    }
  };
}

/**
 * L'etat d'un projet valide : le dessin du modele et ce qui l'accompagne. Une derniere garde verifie chaque peinture par la regle de
 * l'ecriture (`peintureSure`) : la validation du format porte la meme, ce n'est qu'un filet.
 */
export function etatDuProjet(p: Projet): EtatProjet | { erreur: string } {
  for (const f of p.dessin.formes) {
    if ((f.remplissage !== null && !peintureSure(f.remplissage)) || (f.contour !== null && !peintureSure(f.contour))) return { erreur: 'Ce projet porte une couleur que l’éditeur n’écrit pas.' };
  }
  return {
    nom: p.nom,
    dessin: { vb: [p.dessin.vb[0], p.dessin.vb[1], p.dessin.vb[2], p.dessin.vb[3]], formes: p.dessin.formes.map(formeDuProjet), ...nuancierCopie(p.dessin.nuancier) },
    production: choixCopie(p.production),
    nuancier: p.nuancier.map(t => ({ nom: t.nom, hex: t.hex })),
    polices: p.ressources.polices, images: p.ressources.images,
    ...(p.creeLe !== undefined ? { creeLe: p.creeLe } : {}),
    ...(p.modifieLe !== undefined ? { modifieLe: p.modifieLe } : {})
  };
}

/** Les fontes deposees (`u-…`) qu'emploient les textes vivants du dessin, sans doublon, dans l'ordre des formes. */
export function policesDeposeesDu(dessin: DessinSvg): string[] {
  const ids: string[] = [];
  for (const f of dessin.formes) {
    const id = f.texte?.police.id;
    if (id !== undefined && /^u-[0-9a-f]{14}$/.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Le texte du projet tel qu'il part au serveur : du JSON, dans l'ordre des champs du format. */
export const texteDuProjet = (p: Projet): string => JSON.stringify(p);
