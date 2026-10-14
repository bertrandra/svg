import { describe, it, expect } from 'vitest';
import {
  lireChemin, ecrireChemin, lireDessin, ecrireDessin, boiteChemin, lireTransformation, lirePeinture,
  deplacer, retourner, aligner, modifier, supprimer, dupliquer, ordonner, couleursDuDessin, remplacerCouleur,
  retirerPetites, regrouper, ajusterPlan, deplacerAncre, deplacerPoignee, supprimerAncre, diviserSegment,
  basculerSegment, redimensionner, boiteDe, tourner, statistiques, rectangle, ellipse, etoile, polygone, ajouterForme, inserer, STYLE_DEFAUT, combiner, separer, sousChemins, coller, pasGrille, aimanter, type DessinSvg
} from '../../../src/engine/editionSvg.js';

const dessin = (svg: string): DessinSvg => {
  const r = lireDessin(svg);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const carre = (x: number, y: number, c: number, fill = '#c81e28') => `<path d="M${x} ${y}h${c}v${c}h-${c}z" fill="${fill}"/>`;
const svg = (corps: string, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${corps}</svg>`;

describe('lireChemin', () => {
  it('ramene relatifs, H, V, S, T en absolus M L C Q Z', () => {
    expect(ecrireChemin(lireChemin('m10 10 h5 v5 l-5 0 z'))).toBe('M10 10L15 10L15 15L10 15Z');
    expect(ecrireChemin(lireChemin('M0 0 C0 10 10 10 10 0 S20 -10 20 0'))).toBe('M0 0C0 10 10 10 10 0C10 -10 20 -10 20 0');
    expect(ecrireChemin(lireChemin('M0 0 Q5 10 10 0 T20 0'))).toBe('M0 0Q5 10 10 0Q15 -10 20 0');
    expect(ecrireChemin(lireChemin('M0 0 10 0 10 10'))).toBe('M0 0L10 0L10 10');
  });

  it('lit des drapeaux d arc colles et ramene l arc a des cubiques qui arrivent au bon point', () => {
    const d = lireChemin('M0 10a10 10 0 1110 10');
    expect(d.every(c => c.c === 'M' || c.c === 'C')).toBe(true);
    expect(d[d.length - 1]?.p.slice(-2)).toEqual([10, 20]);
    const b = boiteChemin(lireChemin('M0 0A10 10 0 1 0 20 0A10 10 0 1 0 0 0Z'));
    expect(b && [b.x, b.y, b.l, b.h].map(v => Math.round(v * 100) / 100)).toEqual([0, -10, 20, 20]);
  });

  it('garde ce qui precede une erreur', () => {
    expect(ecrireChemin(lireChemin('M0 0L10 10L5'))).toBe('M0 0L10 10');
  });
});

describe('lireDessin', () => {
  it('applique transformations des groupes, classes, styles et heritage', () => {
    const d = dessin(svg('<style>.a{fill:#00f}</style><g transform="translate(10 0)" fill="#0f0"><rect width="5" height="5"/><circle class="a" cx="0" cy="0" r="2" style="opacity:.5"/></g><line x1="0" y1="0" x2="10" y2="0" stroke="black" stroke-width="2"/>'));
    expect(d.formes.map(f => [f.remplissage, f.contour, f.opacite])).toEqual([['#00ff00', null, 1], ['#0000ff', null, 0.5], [null, '#000000', 1]]);
    const b0 = boiteChemin(d.formes[0]?.d ?? []);
    expect(b0).toEqual({ x: 10, y: 0, l: 5, h: 5 });
    expect(d.formes[2]?.epaisseur).toBe(2);
  });

  it('met a l echelle l epaisseur du contour', () => {
    const d = dessin(svg('<g transform="scale(2)"><path d="M0 0L5 5" fill="none" stroke="#123456" stroke-width="3"/></g>'));
    expect(d.formes[0]?.epaisseur).toBe(6);
  });

  it('refuse texte, image, degrade et masque en les nommant', () => {
    const r = lireDessin(svg('<text>A</text><path d="M0 0h1v1z" fill="url(#g)"/>'));
    expect('erreur' in r && r.erreur).toMatch(/texte.*dégradé/);
    expect('erreur' in lireDessin(svg('<g clip-path="url(#c)"><path d="M0 0h1v1z"/></g>'))).toBe(true);
  });

  it('lit la sortie de vtracer (translate par chemin) et la reecrit a l identique visuelle', () => {
    const d = dessin('<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="20" height="10"><path d="M0 0 L5 0 L5 5 Z " fill="#1428a0" transform="translate(10,2)"/></svg>');
    expect(d.vb).toEqual([0, 0, 20, 10]);
    expect(ecrireDessin(d)).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" width="20" height="10"><path d="M10 2L15 2L15 7Z" fill="#1428a0"/></svg>');
  });

  it('normalise les peintures', () => {
    expect([lirePeinture('#ABC'), lirePeinture('rgb(255, 0, 0)'), lirePeinture('none'), lirePeinture('White')]).toEqual(['#aabbcc', '#ff0000', null, '#ffffff']);
  });

  it('lit les transformations composees et refuse l illisible', () => {
    expect(lireTransformation('translate(10) scale(2)')).toEqual([2, 0, 0, 2, 10, 0]);
    expect(lireTransformation('n importe quoi')).toBeNull();
  });
});

describe('operations', () => {
  const base = () => dessin(svg(carre(0, 0, 10) + carre(50, 50, 10, '#1428a0') + carre(80, 0, 1)));

  it('deplace, retourne, tourne et redimensionne sans toucher l original', () => {
    const d = base();
    const m = deplacer(d, ['f1'], 5, 5);
    expect(boiteDe(m, ['f1'])).toEqual({ x: 5, y: 5, l: 10, h: 10 });
    expect(boiteDe(d, ['f1'])).toEqual({ x: 0, y: 0, l: 10, h: 10 });
    expect(boiteDe(retourner(d, ['f1', 'f2'], 'h'), ['f1'])).toEqual({ x: 50, y: 0, l: 10, h: 10 });
    const t = boiteDe(tourner(d, ['f1'], 90), ['f1']);
    expect(t && [t.x, t.y, t.l, t.h].map(Math.round)).toEqual([0, 0, 10, 10]);
    expect(boiteDe(redimensionner(d, ['f1'], { x: 1, y: 2, l: 20, h: 5 }), ['f1'])).toEqual({ x: 1, y: 2, l: 20, h: 5 });
  });

  it('aligne sur le plan pour une forme, sur la selection pour plusieurs', () => {
    const d = base();
    expect(boiteDe(aligner(d, ['f2'], 'droite'), ['f2'])?.x).toBe(90);
    expect(boiteDe(aligner(d, ['f1', 'f2'], 'bas'), ['f1'])?.y).toBe(50);
  });

  it('modifie, supprime, duplique et ordonne', () => {
    const d = base();
    expect(modifier(d, ['f1'], { remplissage: '#c81e28' })).toBe(d);
    const c = modifier(d, ['f1'], { contour: '#000000', epaisseur: 0 });
    expect(c.formes[0]?.epaisseur).toBe(1);
    expect(supprimer(d, ['f2']).formes.map(f => f.id)).toEqual(['f1', 'f3']);
    const u = dupliquer(d, ['f1'], 2, 2);
    expect(u.ids).toEqual(['f4']);
    expect(u.dessin.formes.map(f => f.id)).toEqual(['f1', 'f4', 'f2', 'f3']);
    expect(ordonner(d, ['f1'], 'premier').formes.map(f => f.id)).toEqual(['f2', 'f3', 'f1']);
    expect(ordonner(d, ['f1'], 'avant').formes.map(f => f.id)).toEqual(['f2', 'f1', 'f3']);
    expect(ordonner(d, ['f3'], 'arriere').formes.map(f => f.id)).toEqual(['f1', 'f3', 'f2']);
    expect(ordonner(d, ['f3'], 'dernier').formes.map(f => f.id)).toEqual(['f3', 'f1', 'f2']);
    expect(ordonner(d, ['f3'], 'premier')).toBe(d);
  });

  it('compte, remplace les couleurs, retire les poussieres et regroupe sans chevauchement', () => {
    const d = base();
    expect(couleursDuDessin(d)).toEqual([{ couleur: '#c81e28', formes: 2 }, { couleur: '#1428a0', formes: 1 }]);
    expect(couleursDuDessin(remplacerCouleur(d, '#c81e28', '#000000'))[0]?.couleur).toBe('#000000');
    const p = retirerPetites(d, 0.001);
    expect(p.retirees).toBe(1);
    const voisins = dessin(svg(carre(0, 0, 10) + carre(20, 0, 10) + carre(5, 5, 10) + carre(40, 0, 5, '#000')));
    const g = regrouper(voisins);
    expect(g.reunies).toBe(1);
    expect(g.dessin.formes.length).toBe(3);
  });

  it('ajuste le plan de travail au dessin', () => {
    expect(ajusterPlan(dessin(svg(carre(10, 20, 30))), 0).vb).toEqual([10, 20, 30, 30]);
  });

  it('compte formes, points et octets', () => {
    expect(statistiques(base())).toMatchObject({ formes: 3, points: 12 });
  });
});

describe('points', () => {
  it('deplace une ancre avec ses poignees, et le depart d un trace ferme avec son jumeau', () => {
    const d = dessin(svg('<path d="M0 0C0 5 5 10 10 10C15 10 20 5 20 0C10 -5 5 -5 0 0Z"/>'));
    const m = deplacerAncre(d, 'f1', 1, 12, 12);
    expect(ecrireChemin(m.formes[0]?.d ?? [])).toBe('M0 0C0 5 7 12 12 12C17 12 20 5 20 0C10 -5 5 -5 0 0Z');
    const z = deplacerAncre(d, 'f1', 0, 1, 1);
    expect(ecrireChemin(z.formes[0]?.d ?? [])).toBe('M1 1C1 6 5 10 10 10C15 10 20 5 20 0C10 -5 6 -4 1 1Z');
    expect(ecrireChemin(deplacerPoignee(d, 'f1', 2, 1, 0, 0).formes[0]?.d ?? [])).toContain('C15 10 0 0 20 0');
  });

  it('divise un segment sans changer la courbe, bascule droit et courbe, et retire un point', () => {
    const d = dessin(svg('<path d="M0 0L10 0L10 10L0 10Z"/>'));
    const v = diviserSegment(d, 'f1', 1);
    expect(ecrireChemin(v.formes[0]?.d ?? [])).toBe('M0 0L5 0L10 0L10 10L0 10Z');
    const c = diviserSegment(dessin(svg('<path d="M0 0C0 10 10 10 10 0"/>')), 'f1', 1);
    expect(ecrireChemin(c.formes[0]?.d ?? [])).toBe('M0 0C0 5 2.5 7.5 5 7.5C7.5 7.5 10 5 10 0');
    const b = basculerSegment(d, 'f1', 1);
    expect(ecrireChemin(b.formes[0]?.d ?? [])).toBe('M0 0C3.33 0 6.67 0 10 0L10 10L0 10Z');
    expect(ecrireChemin(basculerSegment(b, 'f1', 1).formes[0]?.d ?? [])).toBe('M0 0L10 0L10 10L0 10Z');
    const s = supprimerAncre(v, 'f1', 1);
    expect('erreur' in s ? s.erreur : ecrireChemin(s.formes[0]?.d ?? [])).toBe('M0 0L10 0L10 10L0 10Z');
    expect('erreur' in supprimerAncre(d, 'f1', 0)).toBe(true);
    const tri = dessin(svg('<path d="M0 0L10 0L10 10Z"/>'));
    expect('erreur' in supprimerAncre(tri, 'f1', 1)).toBe(true);
  });
});

describe('dessiner et inserer', () => {
  it('construit rectangle, ellipse, etoile et polygone dans leur boite', () => {
    expect(ecrireChemin(rectangle(1, 2, 3, 4))).toBe('M1 2L4 2L4 6L1 6Z');
    expect(rectangle(0, 0, 0, 4)).toEqual([]);
    const e = boiteChemin(ellipse(10, 20, 30, 40));
    expect(e && [e.x, e.y, e.l, e.h].map(v => Math.round(v * 100) / 100)).toEqual([10, 20, 30, 40]);
    const s = etoile(0, 0, 100, 100);
    expect(s.filter(c => c.c !== 'Z').length).toBe(10);
    expect(boiteChemin(s)?.y).toBeCloseTo(0, 6);
    expect(ecrireChemin(polygone([[0, 0], [10, 0], [10, 10]], true))).toBe('M0 0L10 0L10 10Z');
    expect(ecrireChemin(polygone([[0, 0], [10, 0]], true))).toBe('M0 0L10 0');
    expect(polygone([[0, 0]], false)).toEqual([]);
  });

  it('ajoute une forme au premier plan avec le style courant, et insere un dessin centre dans une boite', () => {
    const d = dessin(svg(carre(0, 0, 10)));
    const a = ajouterForme(d, rectangle(20, 20, 5, 5), { remplissage: null, contour: '#123456', epaisseur: 0 });
    expect(a.id).toBe('f2');
    expect(a.dessin.formes[1]).toMatchObject({ id: 'f2', remplissage: null, contour: '#123456', epaisseur: 1 });
    expect(ajouterForme(d, [], STYLE_DEFAUT).id).toBeNull();
    const autre = dessin(svg(carre(100, 100, 50) + carre(100, 150, 50, '#000'), '0 0 400 400'));
    const i = inserer(d, autre, { x: 10, y: 10, l: 40, h: 40 });
    expect(i.ids).toEqual(['f2', 'f3']);
    expect(boiteDe(i.dessin, i.ids)).toEqual({ x: 20, y: 10, l: 20, h: 40 });
    expect(d.formes.length).toBe(1);
  });
});

describe('combiner, separer, coller, grille', () => {
  it('combine la selection en une forme au style de la plus haute, et la separe en sous-chemins', () => {
    const d = dessin(svg(carre(0, 0, 10) + carre(20, 0, 10, '#1428a0') + carre(40, 0, 10)));
    const c = combiner(d, ['f1', 'f2']);
    expect(c.id).toBe('f2');
    expect(c.dessin.formes.map(f => f.id)).toEqual(['f2', 'f3']);
    expect(c.dessin.formes[0]?.remplissage).toBe('#1428a0');
    expect(sousChemins(c.dessin.formes[0]?.d ?? []).length).toBe(2);
    expect(combiner(d, ['f1']).id).toBeNull();
    const s = separer(c.dessin, 'f2');
    expect(s.ids).toEqual(['f2', 'f4']);
    expect(s.dessin.formes.map(f => f.id)).toEqual(['f2', 'f4', 'f3']);
    expect(boiteDe(s.dessin, ['f4'])).toEqual({ x: 20, y: 0, l: 10, h: 10 });
    expect(separer(d, 'f1').ids).toEqual(['f1']);
  });

  it('colle des formes copiees au premier plan, decalees, visibles et deverrouillees', () => {
    const d = dessin(svg(carre(0, 0, 10)));
    const copie = { ...(d.formes[0] as NonNullable<typeof d.formes[0]>), verrouille: true, visible: false };
    const p = coller(d, [copie], 5, 5);
    expect(p.ids).toEqual(['f2']);
    expect(p.dessin.formes[1]).toMatchObject({ id: 'f2', verrouille: false, visible: true });
    expect(boiteDe(p.dessin, ['f2'])).toEqual({ x: 5, y: 5, l: 10, h: 10 });
    expect(coller(d, []).dessin).toBe(d);
  });

  it('propose un pas de grille lisible et aimante une valeur', () => {
    expect(pasGrille([0, 0, 512, 512])).toBe(20);
    expect(pasGrille([0, 0, 240, 160])).toBe(10);
    expect(pasGrille([0, 0, 100, 100])).toBe(5);
    expect(pasGrille([0, 0, 2000, 1000])).toBe(100);
    expect(aimanter(23, 10)).toBe(20);
    expect(aimanter(27, 10, 3)).toBe(23);
    expect(aimanter(7, 0)).toBe(7);
  });
});
