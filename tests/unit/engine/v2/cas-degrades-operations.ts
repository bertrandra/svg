// Les cas d'ecriture des operations sur les degrades (ADR-0012, etape 4, paquet 4-A) : poser un degrade sur un dessin plat (il
// devient riche), en changer le genre, le retirer, regler ses arrets, son angle, son centre et son rayon, deplacer ses extremites.
// Chaque cas s'ecrit comme « Enregistrer », se compare a sa reference `tests/fixtures/svg/v2/degrades-op-*.attendu.svg` et se relit
// en point fixe (ecriture-stable-v2.test.ts) : ce que l'interface fait d'un degrade, le fichier le garde a l'octet.

import {
  ajouterArret, deplacerExtremite, echangerArrets, inverserArrets, lireDessin, modifierArret, poserDegrade, reglerAngle, reglerCentre, reglerEtalement,
  reglerRayon, retirerArret, retirerDegrade, type DessinSvg
} from '../../../../src/engine/editionSvg.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CasV2 } from './cas.js';

const lire = (chemin: string, modele: 'plat' | 'riche'): DessinSvg => {
  const r = lireDessin(readFileSync(resolve(__dirname, '../../../fixtures/svg', chemin + '.svg'), 'utf8'), { modele });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const tous = (d: DessinSvg): string[] => d.formes.map(f => f.id);
const lineaire = () => lire('v2/degrades-lineaire', 'riche');
const radial = () => lire('v2/degrades-radial', 'riche');

export const CAS: readonly CasV2[] = [
  // Poser un degrade sur un dessin plat : il devient riche, la definition par empreinte, la couleur de repli dans la forme
  { nom: 'degrades-op-poser-lineaire', dessin: () => lire('peintures', 'plat'), operation: d => poserDegrade(d, tous(d).slice(0, 2), 'remplissage', 'lineaire') },
  { nom: 'degrades-op-poser-radial-contour', dessin: () => lire('peintures', 'plat'), operation: d => poserDegrade(d, tous(d).slice(0, 1), 'contour', 'radial') },
  // Changer de genre garde les arrets ; retirer laisse la couleur de repli, unie
  { nom: 'degrades-op-genre', dessin: lineaire, operation: d => poserDegrade(d, tous(d), 'remplissage', 'radial') },
  { nom: 'degrades-op-retirer', dessin: lineaire, operation: d => retirerDegrade(d, tous(d), 'remplissage') },
  // Les arrets : ajouter (OKLab), retirer, regler, l'ordre, inverser
  { nom: 'degrades-op-ajouter-arret', dessin: lineaire, operation: d => ajouterArret(d, tous(d), 'remplissage', 0) },
  { nom: 'degrades-op-retirer-arret', dessin: lineaire, operation: d => retirerArret(d, tous(d), 'remplissage', 1) },
  { nom: 'degrades-op-modifier-arret', dessin: lineaire, operation: d => modifierArret(d, tous(d), 'remplissage', 1, { couleur: '#2E8B57', position: 0.3333, opacite: 0.42 }) },
  { nom: 'degrades-op-ordre', dessin: lineaire, operation: d => echangerArrets(d, tous(d), 'remplissage', 0, 2) },
  { nom: 'degrades-op-inverser', dessin: radial, operation: d => inverserArrets(d, tous(d), 'remplissage') },
  { nom: 'degrades-op-etalement', dessin: lineaire, operation: d => reglerEtalement(d, tous(d), 'remplissage', 'reflect') },
  // La geometrie : angle, centre, rayon, extremites
  { nom: 'degrades-op-angle', dessin: lineaire, operation: d => reglerAngle(d, tous(d), 'remplissage', 45) },
  { nom: 'degrades-op-centre-rayon', dessin: radial, operation: d => reglerRayon(reglerCentre(d, tous(d), 'remplissage', 50, 40), tous(d), 'remplissage', 30) },
  { nom: 'degrades-op-extremites', dessin: lineaire, operation: d => deplacerExtremite(deplacerExtremite(d, tous(d), 'remplissage', 'debut', 30, 100), tous(d), 'remplissage', 'fin', 170, 20) },
  { nom: 'degrades-op-rayon-transforme', dessin: () => lire('v2/degrades-transformes', 'riche'), operation: d => deplacerExtremite(d, tous(d).slice(-1), 'remplissage', 'fin', 90, 50) }
];
