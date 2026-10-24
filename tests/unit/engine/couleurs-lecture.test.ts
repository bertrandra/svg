import { describe, expect, it } from 'vitest';
import {
  deplacer, groupesDeCouleur, lireCouleurs, lireDessin, memesCouleurs, modifier, partagerGroupes, remplacerCouleur,
  type DessinSvg, type GroupeCouleur, type SurCouleur
} from '../../../src/engine/editionSvg.js';
import { au } from '../../../src/util/tableaux.js';

// La liste « Par couleur » ne relit les groupes que quand une couleur, une visibilite ou un verrou change,
// et reprend l'objet des groupes inchanges pour que leur ligne ne se redessine pas. Rien de tout cela ne doit
// changer ce que `groupesDeCouleur` dit : on le compare, valeur pour valeur, a `groupesDeCouleur`.

const graine = (n: number) => { let s = n; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

function dessin(n: number, couleurs: number, seed = 3): DessinSvg {
  const alea = graine(seed);
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

const SURS: SurCouleur[] = ['tout', 'remplissage', 'contour'];

describe('memesCouleurs', () => {
  const d = dessin(300, 40);
  it('vaut vrai pour la meme liste et pour deux listes dont seules les coordonnees different', () => {
    expect(memesCouleurs(d.formes, d.formes)).toBe(true);
    const deplace = deplacer(d, d.formes.slice(0, 50).map(f => f.id), 12, -7);
    expect(deplace.formes).not.toBe(d.formes);
    expect(memesCouleurs(d.formes, deplace.formes)).toBe(true);
  });

  it('vaut faux des qu’une couleur, une visibilite, un verrou, un identifiant ou le nombre de formes change', () => {
    const id = au(d.formes, 7).id;
    expect(memesCouleurs(d.formes, modifier(d, [id], { visible: false }).formes)).toBe(false);
    expect(memesCouleurs(d.formes, modifier(d, [id], { verrouille: true }).formes)).toBe(false);
    const rempli = d.formes.find(f => f.remplissage !== null)?.remplissage ?? '';
    expect(rempli).not.toBe('');
    expect(memesCouleurs(d.formes, remplacerCouleur(d, rempli, '#010203').formes)).toBe(false);
    expect(memesCouleurs(d.formes, d.formes.slice(1))).toBe(false);
    expect(memesCouleurs(d.formes, [...d.formes.slice(0, 5), { ...au(d.formes, 5), id: 'zz' }, ...d.formes.slice(6)])).toBe(false);
  });
});

describe('partagerGroupes', () => {
  it('rend les valeurs de `apres`, en reprenant l’objet d’`avant` pour chaque groupe inchange', () => {
    const d = dessin(2000, 300);
    const avant = groupesDeCouleur(d);
    const cache = au(avant, 40);
    const apres = groupesDeCouleur(modifier(d, cache.ids, { visible: false }));
    const partage = partagerGroupes(avant, apres);
    expect(partage).toEqual(apres);
    const modifies = partage.filter((g, i) => g !== apres[i]);
    // Seuls les groupes qui ne sont plus les memes sont nouveaux ; les autres sont ceux d'avant.
    const parCouleur = new Map(avant.map(g => [g.couleur, g]));
    for (const g of partage) {
      const ancien = parCouleur.get(g.couleur);
      const egal = ancien !== undefined && JSON.stringify(ancien) === JSON.stringify(g);
      expect(g === ancien).toBe(egal);
    }
    expect(modifies.length).toBeGreaterThan(300 / 2);
    expect(partage.some(g => g.couleur === cache.couleur && g !== parCouleur.get(g.couleur))).toBe(true);
  });

  it('rend le tableau d’avant lui-meme quand rien n’a change', () => {
    const d = dessin(500, 60);
    const avant = groupesDeCouleur(d);
    expect(partagerGroupes(avant, groupesDeCouleur(d))).toBe(avant);
  });

  it('ne reprend pas le tableau d’avant quand l’ordre ou le nombre de groupes change', () => {
    const d = dessin(500, 60);
    const avant = groupesDeCouleur(d);
    const sans = groupesDeCouleur(modifier(d, au(avant, 3).ids, { visible: false })).slice();
    const inverse = [...avant].reverse();
    expect(partagerGroupes(avant, inverse)).toEqual(inverse);
    expect(partagerGroupes(avant, inverse)).not.toBe(avant);
    expect(partagerGroupes(avant, avant.slice(1))).toEqual(avant.slice(1));
    expect(partagerGroupes(avant, sans)).toEqual(sans);
  });
});

describe('lireCouleurs', () => {
  const pareil = (a: GroupeCouleur[], b: GroupeCouleur[]) => expect(a).toEqual(b);

  it('rend toujours ce que groupesDeCouleur rend, au fil de modifications de toute nature', () => {
    for (const sur of SURS) {
      let d = dessin(1500, 200, 5);
      let lecture = lireCouleurs(d, sur, null);
      pareil(lecture.groupes, groupesDeCouleur(d, sur));
      const etapes: Array<(x: DessinSvg) => DessinSvg> = [
        x => deplacer(x, x.formes.slice(0, 30).map(f => f.id), 5, 5),
        x => modifier(x, x.formes.slice(100, 140).map(f => f.id), { visible: false }),
        x => deplacer(x, x.formes.slice(200, 240).map(f => f.id), -3, 9),
        x => modifier(x, x.formes.slice(300, 320).map(f => f.id), { verrouille: true }),
        x => remplacerCouleur(x, au(x.formes, 11).remplissage ?? '', '#abcdef'),
        x => modifier(x, x.formes.slice(100, 140).map(f => f.id), { visible: true }),
        x => ({ ...x, formes: x.formes.slice(0, -10) })
      ];
      for (const etape of etapes) {
        d = etape(d);
        lecture = lireCouleurs(d, sur, lecture);
        pareil(lecture.groupes, groupesDeCouleur(d, sur));
      }
    }
  });

  it('garde la lecture d’avant, dessin compris, tant que seules les coordonnees changent', () => {
    const d = dessin(800, 90);
    const premiere = lireCouleurs(d, 'tout', null);
    const deplace = deplacer(d, d.formes.slice(0, 200).map(f => f.id), 20, 20);
    const suivante = lireCouleurs(deplace, 'tout', premiere);
    expect(suivante).toBe(premiere);
    expect(suivante.groupes).toBe(premiere.groupes);
    // Et le dessin garde est bien celui d'avant : c'est lui qui sert de cle aux nuances proches.
    expect(suivante.dessin).toBe(d);
  });

  it('relit quand on lit autre chose (Fond, Trait) ou quand une couleur change, et partage les groupes inchanges', () => {
    const d = dessin(800, 90);
    const premiere = lireCouleurs(d, 'tout', null);
    expect(lireCouleurs(d, 'remplissage', premiere)).not.toBe(premiere);
    pareil(lireCouleurs(d, 'remplissage', premiere).groupes, groupesDeCouleur(d, 'remplissage'));
    const cache = modifier(d, au(premiere.groupes, 5).ids, { visible: false });
    const suivante = lireCouleurs(cache, 'tout', premiere);
    expect(suivante).not.toBe(premiere);
    expect(suivante.groupes.filter(g => premiere.groupes.includes(g)).length).toBeGreaterThan(premiere.groupes.length / 2);
  });
});
