// Les cas d'ecriture de la lentille des contenus (ADR-0012, paquet 8-D) : un geste fait dans la decoupe ou le masque d'un groupe, par
// `contenuEnDessin` puis `reposerContenu`, comme l'editeur le fait. Deplacer le contenu d'une decoupe ; le peindre (seule la regle des
// trous en reste) ; le dupliquer (un numero renumerote, I1) ; repeindre et deplacer le contenu d'un masque lu (sa region reste celle
// du fichier) ; deplacer celui d'un masque cree ici (sa region le suit). Chaque cas s'ecrit comme « Enregistrer », se compare a sa
// reference `tests/fixtures/svg/v2/<nom>.attendu.svg` et se relit en point fixe (ecriture-stable-v2.test.ts).

import {
  contenuEnDessin, creerMasque, dupliquer, modifier, reposerContenu, transformer, translation, type DessinSvg, type GenreContenu
} from '../../../../src/engine/editionSvg.js';
import type { CasV2 } from './cas.js';

/** Le geste `f` fait dans le contenu du premier groupe qui en porte un de ce genre, repose dans le dessin complet. */
function parLentille(d: DessinSvg, genre: GenreContenu, f: (vue: DessinSvg) => DessinSvg): DessinSvg {
  const g = Object.values(d.groupes ?? {}).find(x => (genre === 'decoupe' ? x.decoupe : x.masque));
  const vue = g ? contenuEnDessin(d, g.id, genre) : null;
  if (!g || !vue) throw new Error('aucun groupe ne porte ce contenu');
  return reposerContenu(d, g.id, genre, f(vue)).dessin;
}
const tous = (d: DessinSvg): string[] => d.formes.map(f => f.id);

/** Deux carres, le blanc du dessus en fait le masque de l'autre : la region vaut leur boite, et suit le contenu. */
function masqueCree(): DessinSvg {
  const carre = (x: number) => [{ c: 'M' as const, p: [x, 20] }, { c: 'L' as const, p: [x + 40, 20] }, { c: 'L' as const, p: [x + 40, 60] }, { c: 'L' as const, p: [x, 60] }, { c: 'Z' as const, p: [] }];
  const base = { contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero' as const, visible: true, verrouille: false };
  const r = creerMasque({ vb: [0, 0, 200, 100], formes: [{ id: 'f1', d: carre(20), remplissage: '#1f5fb0', ...base }, { id: 'f2', d: carre(40), remplissage: '#ffffff', ...base }] }, ['f1', 'f2']);
  if (r.id === null) throw new Error(r.erreur);
  return r.dessin;
}

export const CAS: readonly CasV2[] = [
  { nom: 'lentilles-op-decoupe-deplacer', entree: 'decoupes-groupe', operation: d => parLentille(d, 'decoupe', v => transformer(v, tous(v), translation(10, 5))) },
  { nom: 'lentilles-op-decoupe-peinture', entree: 'decoupes-groupe', operation: d => parLentille(d, 'decoupe', v => modifier(v, tous(v), { remplissage: '#ff0000', contour: '#00ff00', epaisseur: 3, opacite: 0.5, regle: 'evenodd' })) },
  { nom: 'lentilles-op-decoupe-dupliquer', entree: 'decoupes-groupe', operation: d => parLentille(d, 'decoupe', v => dupliquer(v, tous(v), 40, 0).dessin) },
  { nom: 'lentilles-op-masque-repeindre', entree: 'masques-groupe', operation: d => parLentille(d, 'masque', v => transformer(modifier(v, [v.formes[1]?.id ?? ''], { remplissage: '#ffffff' }), [v.formes[1]?.id ?? ''], translation(-20, 0))) },
  { nom: 'lentilles-op-masque-region-suit', dessin: masqueCree, operation: d => parLentille(d, 'masque', v => transformer(v, tous(v), translation(60, 10))) }
];
