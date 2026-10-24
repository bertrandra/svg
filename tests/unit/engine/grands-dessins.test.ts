import { describe, it, expect } from 'vitest';
import {
  deplacer, ecrireChemin, ecrireDessin, ecrireForme, groupesDeCouleur, lireDessin, modifier, statistiques,
  type DessinSvg, type Forme, type GroupeCouleur, type SurCouleur
} from '../../../src/engine/editionSvg.js';
import { nb } from '../../../src/engine/edition/chemins.js';
import { echapperAttribut } from '../../../src/util/xml.js';
import { au } from '../../../src/util/tableaux.js';

// Un dessin issu d'une vectorisation compte des milliers de formes. Ces tests gardent les algorithmes
// reecrits pour la vitesse identiques, resultat pour resultat, a ce qu'ils etaient.

/** Un tirage deterministe : le test ne doit jamais changer d'un jour a l'autre. */
const graine = (n: number) => { let s = n; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

function grandDessin(n: number, couleurs: number): DessinSvg {
  const alea = graine(7);
  const teinte = (i: number) => '#' + (0x100000 + ((i * 2654435) % 0xefffff)).toString(16).padStart(6, '0');
  const corps = Array.from({ length: n }, (_, i) => {
    const x = (i % 100) * 10, y = Math.floor(i / 100) * 10;
    const fill = alea() < 0.05 ? 'none' : teinte(Math.floor(alea() * couleurs));
    const trait = alea() < 0.3 ? ` stroke="${teinte(Math.floor(alea() * couleurs))}" stroke-width="1"` : '';
    return `<path d="M${x} ${y}h8v8h-8z" fill="${fill}"${trait}/>`;
  }).join('');
  const r = lireDessin(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${corps}</svg>`);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
}

/** L'ancienne facon : un tableau recopie a chaque forme (n au carre pour une couleur dominante). */
function groupesDeReference(dessin: DessinSvg, sur: SurCouleur): GroupeCouleur[] {
  const groupes = new Map<string, Forme[]>();
  for (const f of dessin.formes) {
    const lues = sur === 'remplissage' ? [f.remplissage] : sur === 'contour' ? [f.contour] : f.remplissage === f.contour ? [f.remplissage] : [f.remplissage, f.contour];
    for (const c of lues) if (c) groupes.set(c, [...(groupes.get(c) ?? []), f]);
  }
  return [...groupes]
    .map(([couleur, fs]) => ({
      couleur, ids: fs.map(f => f.id), libres: fs.filter(f => f.visible && !f.verrouille).map(f => f.id),
      visibles: fs.filter(f => f.visible).length, verrouillees: fs.filter(f => f.verrouille).length
    }))
    .sort((a, b) => b.ids.length - a.ids.length || (a.couleur < b.couleur ? -1 : 1));
}

describe('groupesDeCouleur sur un grand dessin', () => {
  for (const [n, couleurs] of [[3000, 6], [3000, 400], [10, 3]] as const) {
    it(`rend les memes groupes que l'ancienne facon (${n} formes, ${couleurs} couleurs)`, () => {
      let d = grandDessin(n, couleurs);
      d = modifier(d, d.formes.filter((_, i) => i % 7 === 0).map(f => f.id), { visible: false });
      d = modifier(d, d.formes.filter((_, i) => i % 11 === 0).map(f => f.id), { verrouille: true });
      for (const sur of ['tout', 'remplissage', 'contour'] as const) expect(groupesDeCouleur(d, sur)).toEqual(groupesDeReference(d, sur));
    });
  }

  it('range chaque forme dans le groupe de sa couleur, dans l\'ordre du dessin', () => {
    const d = grandDessin(3000, 6);
    const tout = groupesDeCouleur(d, 'remplissage');
    expect(tout.reduce((s, g) => s + g.ids.length, 0)).toBe(d.formes.filter(f => f.remplissage).length);
    for (const g of tout) expect(g.ids).toEqual([...g.ids].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))));
  });
});

// L'ecriture garde le texte de chaque forme : le SVG ecrit doit rester celui qu'on aurait ecrit sans cette memoire.

/** L'ancienne ecriture, sans memoire : le texte d'une forme, recompose a chaque fois. */
function formeDeReference(f: Forme, precision: number): string {
  let s = '<path d="' + ecrireChemin(f.d, precision) + '" fill="' + echapperAttribut(f.remplissage ?? 'none') + '"';
  if (f.regle === 'evenodd') s += ' fill-rule="evenodd"';
  if (f.contour) s += ' stroke="' + echapperAttribut(f.contour) + '" stroke-width="' + nb(f.epaisseur, 3) + '" stroke-linejoin="round"';
  if (f.opacite < 1) s += ' opacity="' + nb(f.opacite, 3) + '"';
  return s + '/>';
}

function dessinDeReference(d: DessinSvg, precision: number): string {
  const [x, y, l, h] = d.vb;
  const corps = d.formes.filter(f => f.visible).map(f => formeDeReference(f, precision)).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x, y, l, h].map(v => nb(v, 3)).join(' ') + '" width="' + nb(l, 3) + '" height="' + nb(h, 3) + '">' + corps + '</svg>';
}

describe('ecrireDessin et le texte garde par forme', () => {
  // Des coordonnees decimales : la precision change vraiment le texte.
  const base = grandDessin(2000, 50);
  const d0 = deplacer(base, base.formes.map(f => f.id), 0.123456, 0.654321);

  it('ecrit exactement ce que l\'ecriture sans memoire ecrivait, a froid comme a chaud', () => {
    for (const precision of [2, 3]) {
      const attendu = dessinDeReference(d0, precision);
      expect(ecrireDessin(d0, precision)).toBe(attendu);
      expect(ecrireDessin(d0, precision)).toBe(attendu);
    }
    expect(statistiques(d0).octets).toBe(dessinDeReference(d0, 2).length);
  });

  it('garde un texte par precision, sans les confondre', () => {
    const f = au(d0.formes, 0);
    const a = ecrireForme(f, 2), b = ecrireForme(f, 3);
    expect(a).not.toBe(b);
    expect(ecrireForme(f, 2)).toBe(a);
    expect(ecrireForme(f, 3)).toBe(b);
    expect(ecrireForme(f)).toBe(a);
    expect(ecrireForme(f, 1.5)).toBe(formeDeReference(f, 1.5));
  });

  it('une forme modifiee s\'ecrit a neuf : le texte d\'avant ne survit pas a un deplacement ou a un reglage', () => {
    ecrireDessin(d0, 3);
    const ids = d0.formes.slice(0, 10).map(f => f.id);
    const bouge = deplacer(d0, ids, 5, 7), teinte = modifier(d0, ids, { remplissage: '#010203', opacite: 0.5 });
    for (const d of [bouge, teinte]) expect(ecrireDessin(d, 3)).toBe(dessinDeReference(d, 3));
    expect(ecrireDessin(bouge, 3)).not.toBe(ecrireDessin(d0, 3));
    expect(ecrireDessin(d0, 3)).toBe(dessinDeReference(d0, 3));
  });

  it('les formes masquees ne s\'ecrivent pas, cache ou non', () => {
    const cache = modifier(d0, d0.formes.slice(0, 100).map(f => f.id), { visible: false });
    expect(ecrireDessin(cache, 3)).toBe(dessinDeReference(cache, 3));
    expect(ecrireDessin(cache, 3).length).toBeLessThan(ecrireDessin(d0, 3).length);
  });
});
