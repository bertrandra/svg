// Les corps d'avant l'etape 3 (ADR-0012, annexe 7 §3, « loi du dessin plat ») des fonctions de couleurs que les degrades ont
// touchees : une feuille a peinture non unie est ignoree des listes et des remplacements (annexe 1 §6). Recopies tels quels ; ils ne
// servent qu'a la loi du dessin plat et disparaissent a la bascule (etape 14).

import { au } from '../../../../src/util/tableaux.js';
import type { DessinSvg, Forme } from '../../../../src/engine/editionSvg.js';
import type { CouleurDuDessin, GroupeCouleur, SurCouleur } from '../../../../src/engine/edition/couleurs.js';

export function couleursDuDessinAncien(dessin: DessinSvg): CouleurDuDessin[] {
  const n = new Map<string, number>();
  for (const f of dessin.formes) {
    if (!f.visible) continue;
    for (const c of [f.remplissage, f.contour]) if (c) n.set(c, (n.get(c) ?? 0) + 1);
  }
  return [...n].map(([couleur, formes]) => ({ couleur, formes })).sort((a, b) => b.formes - a.formes || (a.couleur < b.couleur ? -1 : 1));
}

export function remplacerCouleurAncien(dessin: DessinSvg, de: string, vers: string | null): DessinSvg {
  let change = false;
  const formes = dessin.formes.map(f => {
    const r = f.remplissage === de ? vers : f.remplissage, c = f.contour === de ? vers : f.contour;
    if (r === f.remplissage && c === f.contour) return f;
    change = true;
    return { ...f, remplissage: r, contour: c };
  });
  return change ? { ...dessin, formes } : dessin;
}

export function remplacerCouleurSurAncien(dessin: DessinSvg, de: string, vers: string | null, sur: SurCouleur): DessinSvg {
  if (sur === 'tout') return remplacerCouleurAncien(dessin, de, vers);
  let change = false;
  const formes = dessin.formes.map(f => {
    if (sur === 'remplissage') {
      if (f.remplissage !== de || vers === de) return f;
      change = true;
      return { ...f, remplissage: vers };
    }
    if (f.contour !== de || vers === de) return f;
    change = true;
    return { ...f, contour: vers };
  });
  return change ? { ...dessin, formes } : dessin;
}

export const idsDeCouleurAncien = (dessin: DessinSvg, couleur: string): string[] =>
  dessin.formes.filter(f => f.visible && !f.verrouille && (f.remplissage === couleur || f.contour === couleur)).map(f => f.id);

export function groupesDeCouleurAncien(dessin: DessinSvg, sur: SurCouleur = 'tout'): GroupeCouleur[] {
  const groupes = new Map<string, Forme[]>();
  for (const f of dessin.formes) {
    const lues = sur === 'remplissage' ? [f.remplissage] : sur === 'contour' ? [f.contour] : f.remplissage === f.contour ? [f.remplissage] : [f.remplissage, f.contour];
    // On ajoute au groupe en place : recopier le tableau a chaque forme couterait n au carre pour une couleur dominante.
    for (const c of lues) if (c) { const g = groupes.get(c); if (g) g.push(f); else groupes.set(c, [f]); }
  }
  return [...groupes]
    .map(([couleur, fs]) => ({
      couleur, ids: fs.map(f => f.id), libres: fs.filter(f => f.visible && !f.verrouille).map(f => f.id),
      visibles: fs.filter(f => f.visible).length, verrouillees: fs.filter(f => f.verrouille).length
    }))
    .sort((a, b) => b.ids.length - a.ids.length || (a.couleur < b.couleur ? -1 : 1));
}

export function memesCouleursAncien(avant: readonly Forme[], apres: readonly Forme[]): boolean {
  if (avant === apres) return true;
  if (avant.length !== apres.length) return false;
  for (let i = 0; i < avant.length; i++) {
    const a = au(avant, i), b = au(apres, i);
    if (a === b) continue;
    if (a.id !== b.id || a.remplissage !== b.remplissage || a.contour !== b.contour || a.visible !== b.visible || a.verrouille !== b.verrouille) return false;
  }
  return true;
}

export function idsMemeCouleurAncien(dessin: DessinSvg, idModele: string): string[] {
  const modele = dessin.formes.find(f => f.id === idModele);
  if (!modele) return [];
  const sur: SurCouleur = modele.remplissage ? 'remplissage' : 'contour';
  const couleur = modele.remplissage ?? modele.contour;
  if (!couleur) return [];
  return dessin.formes.filter(f => f.visible && !f.verrouille && (sur === 'remplissage' ? f.remplissage : f.contour) === couleur).map(f => f.id);
}
