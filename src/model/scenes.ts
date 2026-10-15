// Les assemblages prets a l'emploi de la bibliotheque (ADR-0004) : pour un evenement, quelques
// formes et leur place relative dans un plan carre (0 a 1), que l'editeur insere d'un geste. Les
// identifiants sont ceux de game-icons.net ; un test verifie qu'ils existent dans le jeu.

export interface ElementScene { id: string; x: number; y: number; taille: number }
export interface Scene { id: string; nom: string; evenement: string; elements: readonly ElementScene[] }

const el = (id: string, x: number, y: number, taille: number): ElementScene => ({ id, x, y, taille });

export const SCENES: readonly Scene[] = [
  { id: 'noel', nom: 'Noël : sapin, cadeaux, neige', evenement: 'noel', elements: [
    el('pine-tree', 0.3, 0.1, 0.5), el('present', 0.08, 0.62, 0.24), el('present', 0.3, 0.68, 0.2), el('snowman', 0.7, 0.42, 0.3),
    el('snowflake-1', 0.06, 0.08, 0.14), el('snowflake-1', 0.82, 0.08, 0.1), el('star-formation', 0.47, 0.02, 0.16), el('candy-canes', 0.78, 0.74, 0.2)
  ] },
  { id: 'halloween', nom: 'Halloween : citrouille, fantôme, chauve-souris', evenement: 'halloween', elements: [
    el('pumpkin-lantern', 0.08, 0.55, 0.38), el('ghost', 0.5, 0.15, 0.34), el('bat', 0.1, 0.08, 0.2), el('bat', 0.78, 0.06, 0.16),
    el('spider-web', 0.0, 0.0, 0.22), el('tombstone', 0.7, 0.55, 0.3), el('witch-flight', 0.35, 0.02, 0.26), el('cauldron', 0.5, 0.7, 0.22)
  ] },
  { id: 'paques', nom: 'Pâques : œufs, lapin, poussins', evenement: 'paques', elements: [
    el('rabbit', 0.1, 0.3, 0.4), el('easter-egg', 0.6, 0.5, 0.26), el('big-egg', 0.78, 0.6, 0.2), el('egg-clutch', 0.45, 0.72, 0.26),
    el('chicken', 0.72, 0.18, 0.24), el('carrot', 0.05, 0.75, 0.2), el('daisy', 0.55, 0.08, 0.14), el('butterfly', 0.3, 0.06, 0.16)
  ] },
  { id: 'anniversaire', nom: 'Anniversaire : gâteau, ballons, cotillons', evenement: 'anniversaire', elements: [
    el('stairs-cake', 0.3, 0.42, 0.42), el('balloons', 0.05, 0.05, 0.34), el('balloons', 0.7, 0.08, 0.26), el('party-popper', 0.05, 0.6, 0.22),
    el('party-hat', 0.78, 0.5, 0.18), el('present', 0.75, 0.72, 0.22), el('cupcake', 0.1, 0.82, 0.16), el('party-flags', 0.3, 0.0, 0.4)
  ] },
  { id: 'concert', nom: 'Concert : guitare, micro, notes', evenement: 'concert', elements: [
    el('guitar', 0.05, 0.1, 0.5), el('microphone', 0.6, 0.15, 0.3), el('drum', 0.55, 0.6, 0.3), el('musical-notes', 0.35, 0.02, 0.2),
    el('trumpet', 0.05, 0.7, 0.3), el('saxophone', 0.8, 0.5, 0.18), el('ticket', 0.78, 0.82, 0.18), el('headphones', 0.35, 0.75, 0.18)
  ] },
  { id: 'mariage', nom: 'Mariage : alliances, colombes, roses', evenement: 'mariage', elements: [
    el('big-diamond-ring', 0.3, 0.3, 0.4), el('dove', 0.05, 0.08, 0.26), el('dove', 0.7, 0.08, 0.26), el('rose', 0.05, 0.62, 0.26),
    el('rose', 0.7, 0.62, 0.26), el('heart-wings', 0.36, 0.02, 0.28), el('love-letter', 0.4, 0.76, 0.2), el('church', 0.78, 0.4, 0.2)
  ] },
  { id: 'naissance', nom: 'Naissance : biberon, cigogne, canard', evenement: 'naissance', elements: [
    el('stork-delivery', 0.05, 0.05, 0.44), el('baby-face', 0.55, 0.12, 0.3), el('baby-bottle', 0.72, 0.55, 0.24), el('plastic-duck', 0.08, 0.62, 0.26),
    el('balloons', 0.4, 0.5, 0.24), el('new-born', 0.4, 0.78, 0.2), el('heart-plus', 0.85, 0.05, 0.12), el('kid-slide', 0.72, 0.8, 0.18)
  ] }
];

export const scene = (id: string): Scene | undefined => SCENES.find(s => s.id === id);
