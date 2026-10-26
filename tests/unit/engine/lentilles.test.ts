// La lentille des contenus (ADR-0012, paquet 8-D) : le contenu d'une decoupe ou d'un masque presente comme un dessin de travail, et
// repose dans son groupe. Aller-retour exact (entrer puis sortir sans rien faire rend le MEME objet), un geste dans le contenu rend un
// dessin valide (`verifierDessin`) aux identifiants uniques (I1, renumerotes au besoin), la peinture d'une decoupe refixee, la region
// d'un masque qui la suivait recalculee, celle qu'on a lue gardee, le plan jamais change par la lentille.

import { describe, expect, it } from 'vitest';
import {
  contenuEnDessin, contenuVide, creerDecoupe, creerMasque, dupliquer, ecrireDessin, estPlat, feuilleDeDecoupe, grouper, inverserMasque, modifier, poserEffets,
  renommagesDe, reposerContenu, supprimer, transformer, translation, verifierDessin, type DessinSvg, type Forme
} from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';

const carre = (x: number, y: number, c: number) => [{ c: 'M' as const, p: [x, y] }, { c: 'L' as const, p: [x + c, y] }, { c: 'L' as const, p: [x + c, y + c] }, { c: 'L' as const, p: [x, y + c] }, { c: 'Z' as const, p: [] }];
const forme = (id: string, x: number, champs: Partial<Forme> = {}): Forme => ({ id, d: carre(x, 10, 30), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...champs });
const plat = (...formes: Forme[]): DessinSvg => ({ vb: [0, 0, 200, 100], formes });

/** Un dessin dont le groupe g1 est decoupe par la forme du dessus (f1), avec f2 et f3 dehors : la decoupe numerote plus bas que le reste. */
function decoupe(): { d: DessinSvg; g: string } {
  const r = creerDecoupe(plat(forme('f2', 10), forme('f3', 50), forme('f1', 20, { remplissage: '#1f5fb0' })), ['f2', 'f3', 'f1']);
  if (r.id === null) throw new Error(r.erreur);
  return { d: r.dessin, g: r.id };
}

/** Un dessin dont le groupe g1 est masque par la forme du dessus (f2, blanche), qui masque f1. */
function masque(): { d: DessinSvg; g: string } {
  const r = creerMasque(plat(forme('f1', 10), forme('f2', 20, { remplissage: '#ffffff' })), ['f1', 'f2']);
  if (r.id === null) throw new Error(r.erreur);
  return { d: r.dessin, g: r.id };
}

describe('contenuEnDessin', () => {
  it('presente le contenu avec le plan, le meme objet a chaque appel ; rien pour un groupe sans ce contenu ou un dessin plat', () => {
    const { d, g } = decoupe();
    const vue = contenuEnDessin(d, g, 'decoupe');
    expect(vue?.vb).toBe(d.vb);
    expect(vue?.formes).toBe(d.groupes?.[g]?.decoupe?.contenu.formes);
    expect(contenuEnDessin(d, g, 'decoupe')).toBe(vue);
    expect(contenuEnDessin(d, g, 'masque')).toBeNull();
    expect(contenuEnDessin(plat(forme('f1', 0)), 'g1', 'decoupe')).toBeNull();
  });
});

describe('reposerContenu', () => {
  it('aller-retour exact : entrer puis sortir sans rien faire rend le meme objet', () => {
    for (const { d, g } of [decoupe(), masque()]) {
      const genre = d.groupes?.[g]?.decoupe ? 'decoupe' as const : 'masque' as const;
      const vue = contenuEnDessin(d, g, genre);
      if (!vue) throw new Error('un contenu');
      expect(reposerContenu(d, g, genre, vue).dessin).toBe(d);
      // Une operation qui ne change rien rend le meme dessin de travail, donc le meme dessin.
      expect(reposerContenu(d, g, genre, modifier(vue, [], { opacite: 0.5 })).dessin).toBe(d);
    }
  });

  it('un geste dans une decoupe la deplace seule, et le dessin reste valide ; le reste ne bouge pas d un objet', () => {
    const { d, g } = decoupe();
    const vue = contenuEnDessin(d, g, 'decoupe');
    if (!vue) throw new Error('une decoupe');
    const r = reposerContenu(d, g, 'decoupe', transformer(vue, ['f1'], translation(15, 5)));
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(r.dessin.formes).toBe(d.formes);
    expect(au(r.dessin.groupes?.[g]?.decoupe?.contenu.formes ?? [], 0).d).toEqual(carre(35, 15, 30));
    expect(ecrireDessin(r.dessin, 3)).toContain('<clipPath');
    expect(ecrireDessin(r.dessin, 3)).toContain('M35 15');
  });

  it('une decoupe ne garde que la geometrie : fond, opacite, effets et peinture d un groupe partent, la regle des trous reste', () => {
    const { d, g } = decoupe();
    const vue = contenuEnDessin(d, g, 'decoupe');
    if (!vue) throw new Error('une decoupe');
    const peinte = poserEffets(modifier(vue, ['f1'], { remplissage: '#ff0000', opacite: 0.5, regle: 'evenodd', contour: '#00ff00', epaisseur: 3 }), ['f1'], { flou: {} });
    const r = reposerContenu(d, g, 'decoupe', peinte);
    const f = au(r.dessin.groupes?.[g]?.decoupe?.contenu.formes ?? [], 0);
    expect(f).toEqual(feuilleDeDecoupe('f1', f.d, 'evenodd'));
    expect(verifierDessin(r.dessin)).toEqual([]);
    // Un groupe du contenu ne garde que son nom, sa visibilite, son verrou (et sa propre decoupe).
    const deux = dupliquer(vue, ['f1'], 40, 0);
    const groupee = grouper(deux.dessin, ['f1', ...deux.ids]);
    const opaque = { ...groupee.dessin, groupes: { ...groupee.dessin.groupes, [groupee.id ?? '']: { ...au(Object.values(groupee.dessin.groupes ?? {}), 0), opacite: 0.5, effets: { flou: { ecart: 2 } } } } };
    const r2 = reposerContenu(d, g, 'decoupe', opaque);
    const gs = Object.values(r2.dessin.groupes?.[g]?.decoupe?.contenu.groupes ?? {});
    expect(gs).toHaveLength(1);
    expect(au(gs, 0).opacite).toBeUndefined();
    expect(au(gs, 0).effets).toBeUndefined();
    expect(verifierDessin(r2.dessin)).toEqual([]);
  });

  it('garde l espace unique des identifiants (I1) : un numero neuf qui reprendrait celui du reste est renumerote, et le renommage se lit', () => {
    const { d, g } = decoupe();
    const vue = contenuEnDessin(d, g, 'decoupe');
    if (!vue) throw new Error('une decoupe');
    // Le dessin de travail ne voit que f1 : sa copie prendrait f2, deja une forme du dessin.
    const copie = dupliquer(vue, ['f1'], 5, 5);
    expect(copie.ids).toEqual(['f2']);
    const r = reposerContenu(d, g, 'decoupe', copie.dessin);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(r.renommes.get('f2')).toBe('f4');
    expect(renommagesDe(r.dessin).get('f2')).toBe('f4');
    expect(r.dessin.groupes?.[g]?.decoupe?.contenu.formes.map(f => f.id)).toEqual(['f1', 'f4']);
    expect(renommagesDe(d).size).toBe(0);
  });

  it('la region d un masque qui suivait son contenu le suit ; celle qu on a choisie ou celle d un masque inverse ne bouge pas', () => {
    const { d, g } = masque();
    const region = d.groupes?.[g]?.masque?.region;
    expect(region).toEqual({ x: 10, y: 10, l: 40, h: 30 });
    const vue = contenuEnDessin(d, g, 'masque');
    if (!vue) throw new Error('un masque');
    const r = reposerContenu(d, g, 'masque', transformer(vue, ['f2'], translation(60, 0)));
    expect(r.dessin.groupes?.[g]?.masque?.region).toEqual({ x: 10, y: 10, l: 100, h: 30 });
    expect(verifierDessin(r.dessin)).toEqual([]);
    // Une region choisie (lue d'un fichier, plus large que ce qu'elle couvre) reste.
    const g0 = d.groupes?.[g];
    if (!g0?.masque) throw new Error('un masque');
    const large: DessinSvg = { ...d, groupes: { ...d.groupes, [g]: { ...g0, masque: { ...g0.masque, region: { x: 0, y: 0, l: 200, h: 100 } } } } };
    const vueLarge = contenuEnDessin(large, g, 'masque');
    if (!vueLarge) throw new Error('un masque');
    expect(reposerContenu(large, g, 'masque', transformer(vueLarge, ['f2'], translation(60, 0))).dessin.groupes?.[g]?.masque?.region).toEqual({ x: 0, y: 0, l: 200, h: 100 });
    // Un masque inverse : son fond blanc couvre la region, qui ne suit pas.
    const inverse = inverserMasque(d, g).dessin, vueInverse = contenuEnDessin(inverse, g, 'masque');
    if (!vueInverse) throw new Error('un masque');
    const f2 = vueInverse.formes.find(f => f.id === 'f2');
    expect(f2).toBeDefined();
    expect(reposerContenu(inverse, g, 'masque', transformer(vueInverse, ['f2'], translation(60, 0))).dessin.groupes?.[g]?.masque?.region).toEqual(region);
  });

  it('le plan ne change pas par la lentille ; le nuancier et les reperes y passent', () => {
    const { d, g } = masque();
    const vue = contenuEnDessin(d, g, 'masque');
    if (!vue) throw new Error('un masque');
    const autre: DessinSvg = { ...vue, vb: [0, 0, 10, 10], reperes: { h: [5], v: [] } };
    const r = reposerContenu(d, g, 'masque', autre);
    expect(r.dessin.vb).toBe(d.vb);
    expect(r.dessin.reperes).toEqual({ h: [5], v: [] });
    expect(r.dessin.groupes).toBe(d.groupes);
  });

  it('un contenu vide se repose (il se dit vide), et rien ne se repose dans un groupe qui ne porte plus ce contenu', () => {
    const { d, g } = decoupe();
    const vue = contenuEnDessin(d, g, 'decoupe');
    if (!vue) throw new Error('une decoupe');
    const vide = reposerContenu(d, g, 'decoupe', supprimer(vue, ['f1'])).dessin;
    const c = vide.groupes?.[g]?.decoupe?.contenu;
    expect(c?.formes).toEqual([]);
    expect(c && contenuVide(c)).toBe(true);
    expect(verifierDessin(vide)).toEqual([]);
    expect(reposerContenu(d, g, 'masque', vue).dessin).toBe(d);
    expect(reposerContenu(d, 'g99', 'decoupe', vue).dessin).toBe(d);
    expect(estPlat(vue)).toBe(true);
  });
});
