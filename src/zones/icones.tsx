// Les icones de la barre d'outils : des traces vectoriels dessines ici, sur une grille de 24, au
// trait de la couleur courante. Aucune police d'icones, aucun reseau : la page reste autonome et
// chaque icone se lit dans les deux themes.

import type { CSSProperties } from 'react';

export type NomIcone =
  | 'selection' | 'points' | 'main' | 'rectangle' | 'ellipse' | 'etoile' | 'ligne' | 'plume'
  | 'carre' | 'cercle' | 'rectangle-arrondi' | 'triangle' | 'losange' | 'parallelogramme' | 'trapeze' | 'polygone'
  | 'coeur' | 'fleche' | 'croix' | 'anneau' | 'demi-cercle' | 'goutte' | 'lune' | 'nuage' | 'etiquette' | 'badge' | 'bulle'
  | 'arc' | 'spirale' | 'vague'
  | 'annuler' | 'retablir' | 'copier' | 'couper' | 'coller'
  | 'zoom-moins' | 'zoom-plus' | 'ajuster' | 'zoom-selection' | 'taille-reelle'
  | 'grille' | 'contours' | 'fond-damier' | 'fond-blanc' | 'fond-sombre'
  | 'telecharger' | 'fermer' | 'enregistrer'
  | 'aligner-gauche' | 'aligner-centre-h' | 'aligner-droite' | 'aligner-haut' | 'aligner-centre-v' | 'aligner-bas'
  | 'texte-gauche' | 'texte-centre' | 'texte-droite' | 'texte-justifie' | 'texte-libre' | 'texte-sur' | 'texte-dans'
  | 'miroir-h' | 'miroir-v' | 'rotation-gauche' | 'rotation-droite'
  | 'premier-plan' | 'avancer' | 'reculer' | 'arriere-plan'
  | 'combiner' | 'separer' | 'dupliquer' | 'masquer' | 'oeil' | 'options' | 'verrouiller' | 'deverrouiller' | 'supprimer'
  | 'union' | 'soustraction' | 'intersection' | 'exclusion' | 'texte' | 'aimant' | 'exporter' | 'palette' | 'versions'
  | 'panneau-gauche' | 'panneau-droit' | 'scene' | 'ajouter' | 'rotation' | 'reprendre'
  | 'chevron-bas' | 'coche' | 'ouvrir' | 'image' | 'tout-selectionner' | 'aucune-selection' | 'aucun' | 'machine' | 'code' | 'stylo'
  // Les outils de selection (ADR-0035).
  | 'cadre-selection' | 'lasso' | 'inverser-selection'
  // La marque d'une police a telecharger (ADR-0034).
  | 'nuage-telecharger'
  // Les regles, les reperes et les repetitions (ADR-0038).
  | 'regle' | 'repeter' | 'radiale' | 'symetrie';

interface Trace { d: string; plein?: boolean; pointille?: boolean }

const t = (d: string, plein = false): Trace => (plein ? { d, plein } : { d });

/** Chaque icone : un ou plusieurs traces ; `plein` remplit au lieu de tracer. */
const ICONES: Record<NomIcone, readonly Trace[]> = {
  selection: [t('M5 3l14 8-6.5 1.8L10 19.5z')],
  points: [t('M5 19C5 9 15 15 19 5'), t('M3 17h4v4H3z', true), t('M17 3h4v4h-4z', true)],
  main: [t('M8 13V5.5a1.5 1.5 0 0 1 3 0V11'), t('M11 11V4.5a1.5 1.5 0 0 1 3 0V11'), t('M14 11V6a1.5 1.5 0 0 1 3 0v7'), t('M17 13v-1.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-5-2.7L3.4 14.4a1.6 1.6 0 0 1 2.6-1.8L8 15')],
  rectangle: [t('M4 6h16v12H4z')],
  ellipse: [t('M3 12a9 6 0 1 0 18 0a9 6 0 1 0-18 0')],
  etoile: [t('M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z')],
  ligne: [t('M6 18L18 6'), t('M4 20a2 2 0 1 0 4 0a2 2 0 1 0-4 0', true), t('M16 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0', true)],
  // Les formes de base de la palette (ADR-0033) : chacune trace par le moteur lui-meme dans sa case de 24, au trait comme les
  // autres icones, pour que l'icone soit la forme qu'on obtient. L'anneau garde son trou, la spirale et la vague restent ouvertes.
  carre: [t('M4 4h16v16H4z')],
  cercle: [t('M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0')],
  'rectangle-arrondi': [t('M7 6h10a4 4 0 0 1 4 4v4a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-4a4 4 0 0 1 4-4z')],
  triangle: [t('M12 4l9 16H3z')],
  losange: [t('M12 3l9 9-9 9-9-9z')],
  parallelogramme: [t('M7 6h15l-5 12H2z')],
  trapeze: [t('M6 6h12l4 12H2z')],
  polygone: [t('M12 3l9 4.5v9L12 21l-9-4.5v-9z')],
  coeur: [t('M12 7.5C12.9 5.3 14.7 4 16.7 4C19.2 4 21 5.6 21 8.3C21 12.8 16 16 12 20C8 16 3 12.8 3 8.3C3 5.6 4.8 4 7.3 4C9.3 4 11.1 5.3 12 7.5z')],
  fleche: [t('M2 9.4h12V6l8 6-8 6v-3.4H2z')],
  croix: [t('M9 3h6v6h6v6h-6v6H9v-6H3V9h6z')],
  anneau: [t('M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0'), t('M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0')],
  'demi-cercle': [t('M2 17a10 10 0 0 1 20 0z')],
  goutte: [t('M12 2C15.2 6.1 19 10.8 19 15.8C19 19.2 15.9 22 12 22C8.1 22 5 19.2 5 15.8C5 10.8 8.9 6.1 12 2z')],
  lune: [t('M19 4.4C15.2 2 10.2 2.8 7.2 6.1C4.3 9.5 4.3 14.5 7.2 17.9C10.2 21.3 15.2 22 19 19.6C16.1 19.9 13.2 18.5 11.7 16C10.1 13.6 10.1 10.4 11.7 8C13.2 5.5 16.1 4.1 19 4.4z')],
  nuage: [t('M6.3 19C4.1 19 2.2 17.3 2 15.2C1.8 13 3.4 11.1 5.7 10.8C5.6 7.8 8.1 5.2 11.2 5C14.4 4.8 17.2 7 17.6 10C20.2 10.2 22.1 12.2 22 14.7C21.9 17.1 19.8 19 17.3 19z')],
  etiquette: [t('M6.4 6H22v12H6.4L2 12z')],
  badge: [t('M9.7 5.2C9.7 4 10.7 3 12 3S14.3 4 14.3 5.2C15 4.2 16.5 4 17.5 4.7S18.7 6.8 18 7.8C19.2 7.4 20.5 8.1 20.9 9.2S20.6 11.6 19.4 12C20.6 12.4 21.3 13.6 20.9 14.8S19.2 16.6 18 16.2C18.7 17.2 18.5 18.6 17.5 19.3S15 19.8 14.3 18.8C14.3 20 13.3 21 12 21S9.7 20 9.7 18.8C9 19.8 7.5 20 6.5 19.3S5.3 17.2 6 16.2C4.8 16.6 3.5 15.9 3.1 14.8S3.4 12.4 4.6 12C3.4 11.6 2.7 10.4 3.1 9.2S4.8 7.4 6 7.8C5.3 6.8 5.5 5.4 6.5 4.7S9 4.2 9.7 5.2z')],
  bulle: [t('M5.2 4h13.6C20 4 21 5.2 21 6.6v6.8c0 1.4-1 2.6-2.2 2.6h-8.2l-4 4 1.1-4H5.2C4 16 3 14.8 3 13.4V6.6C3 5.2 4 4 5.2 4z')],
  arc: [t('M3 17a9 10 0 0 1 18 0')],
  spirale: [t('M12 10.7C12 9.3 11 8.1 9.8 8.1S7.5 9.3 7.5 10.7c0 2.8 2 5.2 4.5 5.2s4.5-2.3 4.5-5.2C16.5 6.5 13.5 3 9.8 3S3 6.5 3 10.7C3 16.4 7 21 12 21s9-4.6 9-10.3')],
  vague: [t('M2 12C3.8 5.3 5.2 5.3 7 12S10.2 18.7 12 12S15.2 5.3 17 12S20.2 18.7 22 12')],
  plume: [t('M12 19l7-7 3 3-7 7-3-3z'), t('M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z'), t('M2 2l7.6 7.6'), t('M9 11a2 2 0 1 0 4 0a2 2 0 1 0-4 0')],
  annuler: [t('M3 7v6h6'), t('M3.5 13a9 9 0 1 0 2.5-6.3L3 9')],
  retablir: [t('M21 7v6h-6'), t('M20.5 13a9 9 0 1 1-2.5-6.3L21 9')],
  copier: [t('M9 9h11v11H9z'), t('M15 9V5H4v11h5')],
  couper: [t('M4 6a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'), t('M4 18a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'), t('M20 4L8.3 15.7'), t('M14.5 14.5L20 20'), t('M8.3 8.3L12 12')],
  coller: [t('M9 3h6v3H9z'), t('M7 4.5H6a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-1'), t('M9 12h6'), t('M9 16h6')],
  'zoom-moins': [t('M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0'), t('M21 21l-5-5'), t('M8 11h6')],
  'zoom-plus': [t('M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0'), t('M21 21l-5-5'), t('M8 11h6'), t('M11 8v6')],
  ajuster: [t('M8 3H5a2 2 0 0 0-2 2v3'), t('M21 8V5a2 2 0 0 0-2-2h-3'), t('M3 16v3a2 2 0 0 0 2 2h3'), t('M16 21h3a2 2 0 0 0 2-2v-3')],
  'zoom-selection': [t('M8 3H5a2 2 0 0 0-2 2v3'), t('M21 8V5a2 2 0 0 0-2-2h-3'), t('M3 16v3a2 2 0 0 0 2 2h3'), t('M16 21h3a2 2 0 0 0 2-2v-3'), t('M9 9h6v6H9z', true)],
  'taille-reelle': [t('M3 5h18v14H3z'), t('M8 15V9l-1.5 1'), t('M12 10.5v.1'), t('M12 13.5v.1'), t('M16.5 15V9L15 10')],
  grille: [t('M3 3h18v18H3z'), t('M3 9h18'), t('M3 15h18'), t('M9 3v18'), t('M15 3v18')],
  contours: [{ d: 'M4 4h16v16H4z', pointille: true }, t('M9 9h6v6H9z')],
  'fond-damier': [t('M3 3h18v18H3z'), t('M3 3h6v6H3z', true), t('M15 3h6v6h-6z', true), t('M9 9h6v6H9z', true), t('M3 15h6v6H3z', true), t('M15 15h6v6h-6z', true)],
  'fond-blanc': [t('M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0'), t('M12 2v2'), t('M12 20v2'), t('M2 12h2'), t('M20 12h2'), t('M4.9 4.9l1.4 1.4'), t('M17.7 17.7l1.4 1.4'), t('M4.9 19.1l1.4-1.4'), t('M17.7 6.3l1.4-1.4')],
  'fond-sombre': [t('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z')],
  telecharger: [t('M12 3v12'), t('M7 10l5 5 5-5'), t('M4 20h16')],
  fermer: [t('M6 6l12 12'), t('M18 6L6 18')],
  enregistrer: [t('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'), t('M17 21v-8H7v8'), t('M7 3v5h8')],
  'aligner-gauche': [t('M4 3v18'), t('M8 7h11v4H8z'), t('M8 13h7v4H8z')],
  'aligner-centre-h': [t('M12 3v18'), t('M6 7h12v4H6z'), t('M8 13h8v4H8z')],
  'aligner-droite': [t('M20 3v18'), t('M5 7h11v4H5z'), t('M9 13h7v4H9z')],
  'aligner-haut': [t('M3 4h18'), t('M7 8h4v11H7z'), t('M13 8h4v7h-4z')],
  'aligner-centre-v': [t('M3 12h18'), t('M7 6h4v12H7z'), t('M13 8h4v8h-4z')],
  'aligner-bas': [t('M3 20h18'), t('M7 5h4v11H7z'), t('M13 9h4v7h-4z')],
  // L'alignement des lignes d'un texte : des lignes de longueurs inegales, calees a gauche, au centre ou a droite.
  'texte-gauche': [t('M4 6h16'), t('M4 10h10'), t('M4 14h16'), t('M4 18h10')],
  'texte-centre': [t('M4 6h16'), t('M7 10h10'), t('M4 14h16'), t('M7 18h10')],
  'texte-droite': [t('M4 6h16'), t('M10 10h10'), t('M4 14h16'), t('M10 18h10')],
  'texte-justifie': [t('M4 6h16'), t('M4 10h16'), t('M4 14h16'), t('M4 18h10')],
  // La disposition d'un texte (ADR-0031) : libre sur sa ligne de base, pose sur un arc (les lettres dressees le long du trace), ou
  // dans une forme (des lignes coupees sur ses bords).
  'texte-libre': [t('M3 19h18'), t('M5 16l3.5-9 3.5 9'), t('M6.4 13h4.2'), t('M16 7v9'), t('M14 9.5h4')],
  'texte-sur': [t('M3 18a10 10 0 0 1 18 0'), t('M12 12.4V8.5'), t('M7 13.7l-1.9-3.3'), t('M17 13.7l1.9-3.3')],
  'texte-dans': [t('M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0'), t('M8.5 8.5h7'), t('M6.5 12h11'), t('M8.5 15.5h7')],
  'miroir-h': [t('M12 3v18'), t('M9 7L4 12l5 5z'), t('M15 7l5 5-5 5z', true)],
  'miroir-v': [t('M3 12h18'), t('M7 9l5-5 5 5z'), t('M7 15l5 5 5-5z', true)],
  'rotation-gauche': [t('M3 12a9 9 0 1 0 3.2-6.9'), t('M3 4v5h5')],
  'rotation-droite': [t('M21 12a9 9 0 1 1-3.2-6.9'), t('M21 4v5h-5')],
  'premier-plan': [t('M4 3h16'), t('M12 21V8'), t('M7 13l5-5 5 5')],
  avancer: [t('M12 20V5'), t('M6 11l6-6 6 6')],
  reculer: [t('M12 4v15'), t('M6 13l6 6 6-6')],
  'arriere-plan': [t('M4 21h16'), t('M12 3v13'), t('M7 11l5 5 5-5')],
  combiner: [t('M4 4h11v11H4z'), t('M9 9h11v11H9z'), t('M9 9h6v6H9z', true)],
  separer: [t('M3 5h7v14H3z'), t('M14 5h7v14h-7z'), t('M12 3v18')],
  dupliquer: [t('M9 9h11v11H9z'), t('M15 9V5H4v11h5'), t('M14.5 12.5v5'), t('M12 15h5')],
  masquer: [t('M3 3l18 18'), t('M10.6 10.6a2 2 0 0 0 2.8 2.8'), t('M9.9 5.2A10 10 0 0 1 12 5c5 0 9 4 10 7a13 13 0 0 1-2.8 3.8'), t('M6.6 6.6A13 13 0 0 0 2 12c1 3 5 7 10 7a10 10 0 0 0 3.5-.6')],
  oeil: [t('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'), t('M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0')],
  options: [t('M4.5 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', true), t('M10.4 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', true), t('M16.3 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0', true)],
  verrouiller: [t('M5 11h14v10H5z'), t('M8 11V7a4 4 0 0 1 8 0v4')],
  deverrouiller: [t('M5 11h14v10H5z'), t('M8 11V7a4 4 0 0 1 7.5-2')],
  supprimer: [t('M4 7h16'), t('M10 11v6'), t('M14 11v6'), t('M6 7l1 13h10l1-13'), t('M9 7V4h6v3')],
  union: [t('M4 4h11v11H4z M9 9h11v11H9z', true)],
  soustraction: [t('M4 4h11v11H4z', true), t('M9 9h11v11H9z')],
  intersection: [t('M4 4h11v11H4z'), t('M9 9h11v11H9z'), t('M9 9h6v6H9z', true)],
  exclusion: [t('M4 4h11v5H9v6H4z', true), t('M15 9h5v11H9v-5h6z', true)],
  texte: [t('M5 5h14'), t('M5 5v3'), t('M19 5v3'), t('M12 5v15'), t('M9 20h6')],
  aimant: [t('M6 3v8a6 6 0 0 0 12 0V3'), t('M6 3h4v8H6z', true), t('M14 3h4v8h-4z', true), t('M6 11a6 6 0 0 0 12 0')],
  exporter: [t('M12 15V3'), t('M7 8l5-5 5 5'), t('M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5')],
  palette: [t('M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a4 4 0 0 0 4-4 10 10 0 0 0-9-10z'), t('M7 12a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0', true), t('M9 7.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0', true), t('M14 7.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0', true)],
  versions: [t('M3 12a9 9 0 1 0 3-6.7'), t('M3 4v5h5'), t('M12 7v5l3 2')],
  'panneau-gauche': [t('M3 4h18v16H3z'), t('M9 4v16'), t('M5 8h2'), t('M5 11h2')],
  'panneau-droit': [t('M3 4h18v16H3z'), t('M15 4v16'), t('M17 8h2'), t('M17 11h2')],
  scene: [t('M3 3h8v8H3z'), t('M13 3h8v8h-8z'), t('M3 13h8v8H3z'), t('M13 13h8v8h-8z')],
  ajouter: [t('M12 5v14'), t('M5 12h14')],
  rotation: [t('M21 12a9 9 0 1 1-3-6.7'), t('M21 4v5h-5'), t('M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0', true)],
  reprendre: [t('M5 4l14 8-14 8z', true)],
  'chevron-bas': [t('M6 9l6 6 6-6')],
  coche: [t('M5 12.5l4.5 4.5L19 7.5')],
  ouvrir: [t('M4 20V5a1 1 0 0 1 1-1h5l2 3h7a1 1 0 0 1 1 1v3'), t('M3.5 20l2.2-8.2a1 1 0 0 1 1-.8H21l-2.3 8.2a1 1 0 0 1-1 .8z')],
  image: [t('M3 4h18v16H3z'), t('M8.5 10a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', true), t('M21 16l-5-5-8 8')],
  'tout-selectionner': [t('M4 4h16v16H4z'), t('M8 8h8v8H8z', true)],
  'aucune-selection': [{ d: 'M4 4h16v16H4z', pointille: true }],
  // « Aucune couleur » : la barre oblique des nuanciers, pas la croix qui ferme (ni le rouge qui detruit).
  aucun: [t('M5.5 18.5L18.5 5.5')],
  // Une machine de decoupe vue de face : le corps, la fente du tapis, le chariot et sa lame.
  machine: [t('M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'), t('M3 13h18'), t('M10 7V4h4v3'), t('M12 13v4')],
  // Un stylo de machine, pointe en bas a gauche, et la ligne qu'il ecrit (ADR-0028) : l'outil qui suit le trait sans rien remplir.
  stylo: [t('M15.5 3.5l5 5L10 19l-5 1 1-5z'), t('M13.5 5.5l5 5'), t('M3 21c2-1 4-1 6 0')],
  // Du code : deux chevrons et la barre d'une balise fermante, ce qu'un integrateur ecrit pour embarquer l'editeur.
  code: [t('M8 7l-5 5 5 5'), t('M16 7l5 5-5 5'), t('M14 4l-4 16')],
  // Les outils de selection (ADR-0035) : le cadre en tirets et la fleche qui le tire ; le lasso, sa boucle, son noeud et sa corde ;
  // inverser, un carre a moitie plein (ce qui etait choisi ne l'est plus, et l'inverse).
  'cadre-selection': [{ d: 'M3 3h15v13H3z', pointille: true }, t('M13 12l8 4.5-3.6 1-1.4 3.6z', true)],
  lasso: [t('M8 15.6C5.6 14.4 4 12.6 4 10.5 4 6.9 7.6 4 12 4s8 2.9 8 6.5S16.4 17 12 17c-1 0-1.9-.1-2.8-.4'), t('M7.2 16.8a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0'), t('M8 18.3c-.5 1.4-1.6 2.2-3 2.7')],
  'inverser-selection': [t('M4 4h16v16H4z'), t('M4 4h8v16H4z', true)],
  // Un nuage ouvert par le bas, et la fleche qui en descend : une police qui n'est pas encore sur cet appareil, et que la
  // choisir fera venir de sa source (ADR-0034). La forme dit l'etat, pas la couleur.
  'nuage-telecharger': [t('M8 17H6.5a4 4 0 0 1 0-8h.3A5.5 5.5 0 0 1 17.4 8.6 4.25 4.25 0 0 1 17.5 17H16'), t('M12 11v10'), t('M8.5 17.5L12 21l3.5-3.5')],
  // Les outils de l'ADR-0038. Une regle graduee, en biais.
  regle: [t('M3 16.5L16.5 3 21 7.5 7.5 21z'), t('M7 12.5l2 2'), t('M10 9.5l2 2'), t('M13 6.5l2 2')],
  // Une forme et ses copies en grille, l'original plein.
  repeter: [t('M3 3h7v7H3z', true), t('M14 3h7v7h-7z'), t('M3 14h7v7H3z'), t('M14 14h7v7h-7z')],
  // Des copies en couronne autour d'un centre.
  radiale: [t('M10 2.5h4v4h-4z', true), t('M17.5 10h4v4h-4z'), t('M10 17.5h4v4h-4z'), t('M2.5 10h4v4h-4z'), t('M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0', true)],
  // Une forme et son reflet de part et d'autre d'un axe en pointilles.
  symetrie: [{ d: 'M12 3v18', pointille: true }, t('M9 6L3 18h6z', true), t('M15 6l6 12h-6z')]
};

export const NOMS_ICONES: readonly NomIcone[] = Object.keys(ICONES) as NomIcone[];

export function Icone({ nom, taille = 18, style }: { nom: NomIcone; taille?: number; style?: CSSProperties }) {
  return (
    <svg className="icone" width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={style}
      fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {ICONES[nom].map((x, i) => <path key={i} d={x.d} fill={x.plein ? 'currentColor' : 'none'} stroke={x.plein ? 'none' : undefined} strokeDasharray={x.pointille ? '3 2' : undefined} />)}
    </svg>
  );
}
