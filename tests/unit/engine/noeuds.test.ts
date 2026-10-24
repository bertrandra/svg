import { describe, expect, it } from 'vitest';
import {
  casserEnNoeud, casserForme, convertirNoeud, deplacerPoigneeLiee, ecrireChemin, inverserChemin, inverserSens, joindreExtremites, lireChemin, lireDessin,
  supprimerNoeudEnGardantLaCourbe, typeDeNoeud, type Chemin, type DessinSvg
} from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';

const dessin = (corps: string): DessinSvg => {
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const ch = (d: string): Chemin => lireChemin(d);
const ecrit = (d: Chemin) => ecrireChemin(d, 3);
const ok = <T extends object>(r: T | { erreur: string }): T => { if ('erreur' in r) throw new Error(r.erreur); return r; };

// Un noeud d'indice 1 entre deux cubiques, selon la geometrie de ses poignees.
const ANGLE = 'M0 0C10 0 20 10 30 10C40 10 40 30 50 40';           // poignees (20,10) et (40,10) : pas alignees
const LISSE = 'M0 0C10 0 20 10 30 10C45 10 40 30 50 40';           // (20,10) et (45,10) : alignees, longueurs 10 et 15
const SYMETRIQUE = 'M0 0C10 0 20 10 30 10C40 10 40 30 50 40';      // (20,10) et (40,10) : alignees, longueurs 10 et 10

describe('typeDeNoeud', () => {
  it('lit le type sur la geometrie des poignees', () => {
    expect(typeDeNoeud(ch('M0 0C10 0 20 10 30 10C40 20 40 30 50 40'), 1)).toBe('angle');
    expect(typeDeNoeud(ch(LISSE), 1)).toBe('lisse');
    expect(typeDeNoeud(ch(SYMETRIQUE), 1)).toBe('symetrique');
    expect(ANGLE).toBeTruthy();
  });

  it('une extremite n a pas de type, un nœud entre deux droites non plus (rien a regler)', () => {
    expect(typeDeNoeud(ch(LISSE), 0)).toBeNull();
    expect(typeDeNoeud(ch(LISSE), 2)).toBeNull();
  });

  it('un nœud lisse entre une droite et une courbe suit la droite', () => {
    // La droite arrive horizontalement en (30,10), la courbe repart vers la droite : lisse. Repart en biais : angle.
    expect(typeDeNoeud(ch('M0 10L30 10C45 10 60 20 70 30'), 1)).toBe('lisse');
    expect(typeDeNoeud(ch('M0 10L30 10C35 20 60 20 70 30'), 1)).toBe('angle');
  });

  it('lit le nœud de depart d une boucle fermee avec ses deux cotes', () => {
    const cercle = ch('M50 0C77.6 0 100 22.4 100 50C100 77.6 77.6 100 50 100C22.4 100 0 77.6 0 50C0 22.4 22.4 0 50 0z');
    expect(typeDeNoeud(cercle, 0)).toBe('symetrique');
    expect(typeDeNoeud(cercle, 4)).toBe('symetrique');
    expect(typeDeNoeud(cercle, 1)).toBe('symetrique');
  });
});

describe('convertirNoeud', () => {
  it('lisse : aligne les poignees en gardant leurs longueurs', () => {
    const r = ok(convertirNoeud(ch('M0 0C10 0 20 10 30 10C40 20 60 30 50 40'), 1, 'lisse')).chemin;
    expect(typeDeNoeud(r, 1)).toBe('lisse');
    const entree = au(r, 1).p, sortie = au(r, 2).p;
    expect(Math.hypot((entree[2] ?? 0) - 30, (entree[3] ?? 0) - 10)).toBeCloseTo(10, 6);
    expect(Math.hypot((sortie[0] ?? 0) - 30, (sortie[1] ?? 0) - 20 + 10)).toBeCloseTo(Math.hypot(10, 10), 6);
  });

  it('symetrique : aligne les poignees et les egalise (moyenne), sans toucher aux ancres', () => {
    const d = ch('M0 0C10 0 20 10 30 10C45 10 40 30 50 40');
    const r = ok(convertirNoeud(d, 1, 'symetrique')).chemin;
    expect(typeDeNoeud(r, 1)).toBe('symetrique');
    expect(au(r, 1).p.slice(4)).toEqual([30, 10]);
    expect(au(r, 2).p.slice(4)).toEqual([50, 40]);
    expect(Math.hypot((au(r, 1).p[2] ?? 0) - 30, (au(r, 1).p[3] ?? 0) - 10)).toBeCloseTo(12.5, 6);
  });

  it('angle : rentre les poignees, ce qui les rend independantes', () => {
    const r = ok(convertirNoeud(ch(SYMETRIQUE), 1, 'angle')).chemin;
    expect(typeDeNoeud(r, 1)).toBe('angle');
    expect(au(r, 1).p.slice(2, 4)).toEqual([30, 10]);
    expect(au(r, 2).p.slice(0, 2)).toEqual([30, 10]);
  });

  it('rend le meme chemin quand le nœud a deja ce type (et symetrique est aussi lisse)', () => {
    const d = ch(SYMETRIQUE);
    expect(ok(convertirNoeud(d, 1, 'symetrique')).chemin).toBe(d);
    expect(ok(convertirNoeud(d, 1, 'lisse')).chemin).toBe(d);
  });

  it('suit la droite voisine pour un nœud droite-courbe (lisse), et refuse la symetrie', () => {
    const d = ch('M0 10L30 10C35 20 60 20 70 30');
    const r = ok(convertirNoeud(d, 1, 'lisse')).chemin;
    expect(typeDeNoeud(r, 1)).toBe('lisse');
    expect(au(r, 2).p[1]).toBeCloseTo(10, 6);
    expect(convertirNoeud(d, 1, 'symetrique')).toEqual({ erreur: expect.stringContaining('segment droit') });
  });

  it('refuse une extremite et un nœud entre deux droites, en le disant', () => {
    expect(convertirNoeud(ch(LISSE), 0, 'lisse')).toEqual({ erreur: expect.stringContaining('extrémité') });
    expect(convertirNoeud(ch('M0 0L10 0L20 5'), 1, 'lisse')).toEqual({ erreur: expect.stringContaining('segments droits') });
  });

  it('eleve une quadratique voisine en cubique sans changer sa courbe', () => {
    const d = ch('M0 0Q15 20 30 10C40 5 60 10 70 0');
    const r = ok(convertirNoeud(d, 1, 'lisse')).chemin;
    expect(au(r, 1).c).toBe('C');
    expect(au(r, 1).p.slice(4)).toEqual([30, 10]);
  });
});

describe('deplacerPoigneeLiee', () => {
  const d = (chemin: string) => dessin(`<path d="${chemin}" fill="#c81e28"/>`);
  const poignees = (dd: DessinSvg) => { const f = au(dd.formes, 0); return { entree: au(f.d, 1).p.slice(2, 4), sortie: au(f.d, 2).p.slice(0, 2) }; };

  it('lisse : l autre poignee reste alignee et garde sa longueur', () => {
    const base = d(LISSE);
    const r = deplacerPoigneeLiee(base, 'f1', 1, 1, 30, 30);
    const { entree, sortie } = poignees(r);
    expect(entree).toEqual([30, 30]);
    // 15 de long, en face de (30, 30) vu de (30, 10) : vers le haut.
    expect(sortie[0]).toBeCloseTo(30, 6);
    expect(sortie[1]).toBeCloseTo(10 - 15, 6);
  });

  it('symetrique : l autre poignee prend la meme longueur, en face', () => {
    const base = d(SYMETRIQUE);
    const r = deplacerPoigneeLiee(base, 'f1', 2, 0, 30, 50);
    const { entree, sortie } = poignees(r);
    expect(sortie).toEqual([30, 50]);
    expect(entree[0]).toBeCloseTo(30, 6);
    expect(entree[1]).toBeCloseTo(10 - 40, 6);
  });

  it('angle ou Alt : la poignee seule bouge', () => {
    const angle = d('M0 0C10 0 20 10 30 10C40 20 40 30 50 40');
    const a = deplacerPoigneeLiee(angle, 'f1', 1, 1, 30, 30);
    expect(poignees(a).sortie).toEqual([40, 20]);
    const base = d(SYMETRIQUE);
    const b = deplacerPoigneeLiee(base, 'f1', 1, 1, 30, 30, true);
    expect(poignees(b).sortie).toEqual([40, 10]);
    // Relacher Alt rend le lien : le meme calcul sans `rompre` depuis le meme depart.
    expect(poignees(deplacerPoigneeLiee(base, 'f1', 1, 1, 30, 30, false)).sortie[1]).toBeCloseTo(-10, 6);
  });

  it('ne divise pas par zero quand la poignee revient sur le nœud', () => {
    const r = deplacerPoigneeLiee(d(SYMETRIQUE), 'f1', 1, 1, 30, 10);
    expect(au(r.formes, 0).d.every(c => c.p.every(Number.isFinite))).toBe(true);
    expect(poignees(r).sortie).toEqual([40, 10]);
  });

  it('suit aussi le nœud de depart d une boucle fermee', () => {
    const cercle = d('M50 0C77.6 0 100 22.4 100 50C100 77.6 77.6 100 50 100C22.4 100 0 77.6 0 50C0 22.4 22.4 0 50 0z');
    const r = deplacerPoigneeLiee(cercle, 'f1', 1, 0, 70, 10);
    const f = au(r.formes, 0);
    // L'autre poignee du nœud (50, 0) est la seconde de la derniere cubique : alignee, en face, meme longueur.
    const derniere = au(f.d, 4).p;
    expect((derniere[2] ?? 0) - 50).toBeCloseTo(-20, 6);
    expect(derniere[3]).toBeCloseTo(-10, 6);
  });
});

describe('casserEnNoeud / casserForme', () => {
  it('coupe un tracé ouvert en deux, chacun finissant (ou commençant) au nœud', () => {
    const r = ok(casserEnNoeud(ch('M0 0L10 0L20 10L30 0'), 2));
    expect(r.morceaux.map(ecrit)).toEqual(['M0 0L10 0L20 10', 'M20 10L30 0']);
  });

  it('un tracé ferme devient un tracé ouvert qui part du nœud et y revient', () => {
    const r = ok(casserEnNoeud(ch('M0 0L10 0L10 10L0 10z'), 2));
    expect(r.morceaux.map(ecrit)).toEqual(['M10 10L0 10L0 0L10 0L10 10']);
    expect(ok(casserEnNoeud(ch('M0 0L10 0L10 10L0 10z'), 0)).morceaux.map(ecrit)).toEqual(['M0 0L10 0L10 10L0 10L0 0']);
  });

  it('refuse un bout, en le disant', () => {
    expect(casserEnNoeud(ch('M0 0L10 0L20 10'), 0)).toEqual({ erreur: expect.stringContaining('bout') });
    expect(casserEnNoeud(ch('M0 0L10 0L20 10'), 2)).toEqual({ erreur: expect.stringContaining('bout') });
  });

  it('casse une forme en deux formes de meme style, la seconde juste au dessus', () => {
    const d = dessin('<path d="M0 0L10 0L20 10L30 0" fill="none" stroke="#123456"/><path d="M50 50h5v5z" fill="#c81e28"/>');
    const r = ok(casserForme(d, 'f1', 2));
    expect(r.ids).toEqual(['f1', 'f3']);
    expect(r.dessin.formes.map(f => f.id)).toEqual(['f1', 'f3', 'f2']);
    expect(au(r.dessin.formes, 1).contour).toBe('#123456');
    expect(ecrit(au(r.dessin.formes, 1).d)).toBe('M20 10L30 0');
  });
});

describe('joindreExtremites', () => {
  const deux = dessin('<path d="M0 0L10 0L20 10" fill="none" stroke="#000"/><path d="M40 40L30 20" fill="none" stroke="#f00"/>');

  it('joint deux tracés ouverts par leurs bouts les plus proches, en inversant au besoin', () => {
    const r = joindreExtremites(deux, ['f1', 'f2']);
    expect(r.genre).toBe('joint');
    expect(r.dessin.formes.length).toBe(1);
    // (20,10) est plus pres de (30,20) que de (40,40) : le second est retourne.
    expect(ecrit(au(r.dessin.formes, 0).d)).toBe('M0 0L10 0L20 10L30 20L40 40');
    expect(au(r.dessin.formes, 0).contour).toBe('#ff0000');
  });

  it('ne met pas de droite quand les bouts se touchent', () => {
    const d = dessin('<path d="M0 0L10 0" fill="none" stroke="#000"/><path d="M10 0L10 10" fill="none" stroke="#000"/>');
    expect(ecrit(au(joindreExtremites(d, ['f1', 'f2']).dessin.formes, 0).d)).toBe('M0 0L10 0L10 10');
  });

  it('ferme un seul tracé ouvert', () => {
    const r = joindreExtremites(deux, ['f1']);
    expect(r.genre).toBe('ferme');
    expect(ecrit(au(r.dessin.formes, 0).d)).toBe('M0 0L10 0L20 10Z');
    expect(joindreExtremites(r.dessin, ['f1']).erreur).toContain('déjà fermé');
  });

  it('refuse trois formes ou une forme verrouillee, en le disant', () => {
    const trois = dessin('<path d="M0 0L10 0" stroke="#000"/><path d="M20 0L30 0" stroke="#000"/><path d="M40 0L50 0" stroke="#000"/>');
    expect(joindreExtremites(trois, ['f1', 'f2', 'f3']).erreur).toContain('Choisissez');
    expect(joindreExtremites(deux, []).erreur).toContain('Choisissez');
    const verrou = { ...deux, formes: deux.formes.map(f => ({ ...f, verrouille: true })) };
    expect(joindreExtremites(verrou, ['f1', 'f2']).erreur).toContain('Choisissez');
  });
});

describe('inverserChemin', () => {
  it('parcourt le tracé a l envers, courbes comprises, et deux inversions rendent l original', () => {
    const d = ch('M0 0L10 0C20 0 30 10 30 20Q40 30 50 20');
    expect(ecrit(inverserChemin(d))).toBe('M50 20Q40 30 30 20C30 10 20 0 10 0L0 0');
    expect(inverserChemin(inverserChemin(d))).toEqual(d);
  });

  it('garde le Z des tracés fermes et inverse chaque sous-chemin', () => {
    const d = ch('M0 0L10 0L10 10z M20 20L30 20L30 30z');
    expect(ecrit(inverserChemin(d))).toBe('M10 10L10 0L0 0ZM30 30L30 20L20 20Z');
    expect(inverserChemin(inverserChemin(d))).toEqual(d);
  });

  it('inverse un tracé ferme sans retour explicite (la fermeture est une droite)', () => {
    const d = ch('M0 0L10 0L10 10z');
    expect(ecrit(inverserChemin(d))).toBe('M10 10L10 0L0 0Z');
    expect(inverserChemin(inverserChemin(d))).toEqual(d);
  });

  it('ne touche pas une forme verrouillee', () => {
    const d = dessin('<path d="M0 0L10 0L10 10z"/>');
    const v = { ...d, formes: d.formes.map(f => ({ ...f, verrouille: true })) };
    expect(inverserSens(v, ['f1'])).toBe(v);
  });
});

describe('supprimerNoeudEnGardantLaCourbe', () => {
  const dd = (c: string) => dessin(`<path d="${c}" fill="#c81e28"/>`);

  it('fusionne deux droites alignees en une seule', () => {
    const r = supprimerNoeudEnGardantLaCourbe(dd('M0 0L10 0L20 0L20 20L0 20z'), 'f1', 1, 0.01);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(ecrit(au(r.formes, 0).d)).toBe('M0 0L20 0L20 20L0 20Z');
  });

  it('refuse un angle, nomme', () => {
    expect(supprimerNoeudEnGardantLaCourbe(dd('M0 0L10 0L20 10L30 0L40 10'), 'f1', 2, 0.01)).toEqual({ erreur: expect.stringContaining('porte la courbe') });
  });

  it('fusionne deux cubiques d un meme arc en une seule, a la tolerance pres', () => {
    // Un quart de cercle de rayon 100 (cubique classique) coupe en son milieu par de Casteljau : deux cubiques, un seul arc.
    const moitie = 'M100 0C100 27.614 88.807 52.614 70.711 70.711C52.614 88.807 27.614 100 0 100';
    const d = dd(moitie + 'L0 120L100 120z');
    const r = supprimerNoeudEnGardantLaCourbe(d, 'f1', 1, 0.2);
    if ('erreur' in r) throw new Error(r.erreur);
    const f = au(r.formes, 0);
    expect(f.d.filter(c => c.c === 'C').length).toBe(1);
    expect(au(f.d, 1).p.slice(4)).toEqual([0, 100]);
  });

  it('refuse un depart, et un tracé qui n aurait plus que deux points', () => {
    expect(supprimerNoeudEnGardantLaCourbe(dd('M0 0L10 0L20 5L30 0z'), 'f1', 0, 0.01)).toEqual({ erreur: expect.stringContaining('départ') });
    expect(supprimerNoeudEnGardantLaCourbe(dd('M0 0L10 0L20 0'), 'f1', 1, 0.01)).toEqual({ erreur: expect.stringContaining('au moins trois') });
  });
});
