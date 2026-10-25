import { describe, expect, it } from 'vitest';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { couleursPixels } from '../../../src/engine/extraction.js';
import {
  aireDeChemin, apportsDe, avecNuancier, longueurDeChemin, nuancierDeSelection, nuancierDuDessin, nuancierEffectif, poserNuancier, SEUIL_FUSION, teintesDesFormes, teintesDImage
} from '../../../src/engine/nuancier.js';
import { lireCheminProjet } from '../../../src/engine/projet.js';
import { ecartPercu, lireHex } from '../../../src/util/couleur.js';

const svg = (corps: string, vb = '0 0 400 300') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
function dessin(corps: string, vb?: string): DessinSvg {
  const lu = lireDessin(svg(corps, vb));
  if ('erreur' in lu) throw new Error(lu.erreur);
  return lu.dessin;
}
const codes = (d: DessinSvg) => nuancierDuDessin(d).teintes.map(t => t.hex);

describe('les surfaces', () => {
  it('mesure l’aire d’un rectangle, d’un cercle et d’une courbe exactement', () => {
    expect(aireDeChemin(lireCheminProjet('M0 0L10 0L10 20L0 20Z'))).toBeCloseTo(200, 9);
    // Un remplissage ferme ce qui ne l'est pas : le triangle ouvert peint la meme aire que ferme.
    expect(aireDeChemin(lireCheminProjet('M0 0L10 0L0 10'))).toBeCloseTo(50, 9);
    // La quadratique de (0,0) a (10,0) par (5,10) enferme les deux tiers de son triangle de controle : 2/3 x 50.
    expect(aireDeChemin(lireCheminProjet('M0 0Q5 10 10 0Z'))).toBeCloseTo(100 / 3, 9);
    const cercle = dessin('<circle cx="50" cy="50" r="10" fill="#c81e28"/>').formes[0];
    expect(Math.abs(aireDeChemin(cercle?.d ?? []) - Math.PI * 100) / (Math.PI * 100)).toBeLessThan(0.001);
  });

  it('creuse un trou selon la regle de remplissage', () => {
    const dehors = 'M0 0L100 0L100 100L0 100Z', dedansContraire = 'M25 25L25 75L75 75L75 25Z', dedansMeme = 'M25 25L75 25L75 75L25 75Z';
    expect(aireDeChemin(lireCheminProjet(dehors + dedansContraire), 'nonzero')).toBeCloseTo(7500, 9);
    expect(aireDeChemin(lireCheminProjet(dehors + dedansMeme), 'nonzero')).toBeCloseTo(10000, 9);
    expect(aireDeChemin(lireCheminProjet(dehors + dedansMeme), 'evenodd')).toBeCloseTo(7500, 9);
    // Un ilot dans le trou est peint de nouveau.
    expect(aireDeChemin(lireCheminProjet(dehors + dedansMeme + 'M40 40L60 40L60 60L40 60Z'), 'evenodd')).toBeCloseTo(7900, 9);
  });

  it('mesure la longueur d’un trace, fermeture comprise', () => {
    expect(longueurDeChemin(lireCheminProjet('M0 0L100 0'))).toBeCloseTo(100, 9);
    expect(longueurDeChemin(lireCheminProjet('M0 0L10 0L10 10L0 10Z'))).toBeCloseTo(40, 9);
    expect(longueurDeChemin(lireCheminProjet('M0 0C0 0 10 0 10 0'))).toBeCloseTo(10, 6);
  });
});

describe('le nuancier tire d’un SVG', () => {
  it('range les couleurs par surface couverte : aire des remplissages, longueur par epaisseur des traits', () => {
    const d = dessin(
      '<rect x="0" y="0" width="10" height="10" fill="#2e8b57"/>' // 100
      + '<rect x="20" y="0" width="100" height="100" fill="#1428a0"/>' // 10 000
      + '<circle cx="200" cy="100" r="30" fill="#c81e28"/>' // 2 827
      + '<path d="M0 200L400 200" stroke="#ff8c00" stroke-width="10" fill="none"/>' // 4 000
    );
    expect(codes(d)).toEqual(['#1428a0', '#ff8c00', '#c81e28', '#2e8b57']);
    expect(nuancierDuDessin(d).provenance).toBe('dessin');
  });

  it('fond les couleurs presque identiques sous le seuil, en gardant la plus large, et separe les autres', () => {
    expect(SEUIL_FUSION).toBe(0.02);
    const proches = ecartPercu(lireHex('#c81e28') ?? { r: 0, g: 0, b: 0 }, lireHex('#c91f27') ?? { r: 0, g: 0, b: 0 });
    const voisines = ecartPercu(lireHex('#c81e28') ?? { r: 0, g: 0, b: 0 }, lireHex('#b41b24') ?? { r: 0, g: 0, b: 0 });
    expect(proches).toBeLessThan(SEUIL_FUSION);
    expect(voisines).toBeGreaterThan(SEUIL_FUSION);
    const d = dessin(
      '<rect x="0" y="0" width="10" height="10" fill="#c91f27"/>'
      + '<rect x="20" y="0" width="20" height="20" fill="#c81e28"/>'
      + '<rect x="50" y="0" width="5" height="5" fill="#b41b24"/>'
    );
    expect(codes(d)).toEqual(['#c81e28', '#b41b24']);
  });

  it('garde l’opacite a part : la couleur une fois, avec l’opacite qui couvre le plus', () => {
    const d = dessin(
      '<rect x="0" y="0" width="100" height="10" fill="#1428a0" fill-opacity="0.5"/>' // 1 000 a 50 %
      + '<rect x="0" y="20" width="10" height="10" fill="#1428a0"/>' // 100 plein
      + '<rect x="0" y="40" width="10" height="5" fill="#c81e28" opacity="0.25"/>'
    );
    expect(nuancierDuDessin(d).teintes).toEqual([{ hex: '#1428a0', opacite: 0.5 }, { hex: '#c81e28', opacite: 0.25 }]);
  });

  it('plafonne a 24 par defaut, reglable, et garde le noir et le blanc qui servent', () => {
    // Trente teintes bien distinctes, de surfaces decroissantes, puis un filet noir et une reserve blanche minuscules.
    const teintes = Array.from({ length: 30 }, (_, i) => 'hsl(' + i * 12 + ' 80% 50%)');
    const carres = teintes.map((c, i) => '<rect x="' + i * 12 + '" y="0" width="10" height="' + (100 - i) + '" fill="' + c + '"/>').join('');
    const d = dessin(carres + '<path d="M0 250L10 250" stroke="#000000" stroke-width="0.5"/><rect x="0" y="280" width="1" height="1" fill="#ffffff"/>');
    const n = nuancierDuDessin(d).teintes;
    expect(n).toHaveLength(24);
    expect(n.slice(-2).map(t => t.hex)).toEqual(['#000000', '#ffffff']);
    expect(nuancierDuDessin(d, { plafond: 5 }).teintes.map(t => t.hex).slice(-2)).toEqual(['#000000', '#ffffff']);
    expect(nuancierDuDessin(d, { plafond: 5 }).teintes).toHaveLength(5);
    // Sans plafond atteint, rien n'est retire : le noir et le blanc restent a leur rang de surface.
    const toutes = nuancierDuDessin(d, { plafond: 100 }).teintes.map(t => t.hex);
    expect(toutes.length).toBeGreaterThan(24);
    expect(toutes.slice(-2)).toEqual(['#000000', '#ffffff']);
  });

  it('ignore ce qui ne peint pas : forme masquee, sans peinture, trait nul, opacite nulle', () => {
    const d = dessin(
      '<rect x="0" y="0" width="10" height="10" fill="#c81e28"/>'
      + '<rect x="20" y="0" width="10" height="10" fill="none" stroke="#1428a0" stroke-width="0"/>'
      + '<rect x="40" y="0" width="10" height="10" fill="#2e8b57" opacity="0"/>'
      + '<rect x="60" y="0" width="10" height="10" fill="#ff8c00"/>'
    );
    const masque: DessinSvg = { ...d, formes: d.formes.map(f => (f.remplissage === '#ff8c00' ? { ...f, visible: false } : f)) };
    expect(codes(masque)).toEqual(['#c81e28']);
  });

  it('est deterministe et ne depend pas de l’ordre des formes', () => {
    const d = dessin('<rect x="0" y="0" width="10" height="10" fill="#c81e28"/><rect x="20" y="0" width="10" height="10" fill="#1428a0"/><rect x="40" y="0" width="5" height="5" fill="#2e8b57"/>');
    const renverse: DessinSvg = { ...d, formes: [...d.formes].reverse() };
    expect(nuancierDuDessin(renverse)).toEqual(nuancierDuDessin(d));
    // A surface egale, le code croissant decide.
    expect(codes(d)).toEqual(['#1428a0', '#c81e28', '#2e8b57']);
  });

  it('memorise ce qu’apporte chaque forme', () => {
    const f = dessin('<rect x="0" y="0" width="10" height="10" fill="#c81e28" stroke="#000" stroke-width="2"/>').formes[0];
    if (!f) throw new Error('forme absente');
    const a = apportsDe(f);
    expect(apportsDe(f)).toBe(a);
    expect(a.map(x => [x.hex, Math.round(x.surface)])).toEqual([['#c81e28', 100], ['#000000', 80]]);
  });
});

describe('le nuancier dans le dessin', () => {
  const d = dessin('<rect x="0" y="0" width="100" height="100" fill="#1428a0"/><rect x="200" y="0" width="10" height="10" fill="#c81e28"/><rect x="220" y="0" width="5" height="5" fill="#c91f27"/><rect x="240" y="0" width="20" height="20" fill="#2e8b57"/>');
  const [bleu, rouge, rouge2, vert] = d.formes.map(f => f.id);

  it('se pose a l’ouverture, une fois : un dessin qui en porte un garde son identite', () => {
    const ouvert = avecNuancier(d);
    expect(ouvert.nuancier?.teintes.map(t => t.hex)).toEqual(['#1428a0', '#2e8b57', '#c81e28']);
    expect(avecNuancier(ouvert)).toBe(ouvert);
    expect(nuancierEffectif(ouvert)).toBe(ouvert.nuancier);
    expect(poserNuancier(ouvert, nuancierDuDessin(d))).toBe(ouvert);
  });

  it('se remplace par les couleurs de la selection', () => {
    const r = nuancierDeSelection(avecNuancier(d), [rouge ?? '', rouge2 ?? ''], 'remplacer');
    expect(r?.nuancier).toEqual({ provenance: 'selection', teintes: [{ hex: '#c81e28' }] });
    expect(r?.lues).toBe(1);
  });

  it('se complete par les couleurs nouvelles de la selection, sans doublon presque identique', () => {
    const depart = poserNuancier(d, { provenance: 'dessin', teintes: [{ hex: '#c81e28' }] });
    const r = nuancierDeSelection(depart, [bleu ?? '', rouge2 ?? '', vert ?? ''], 'ajouter');
    expect(r?.nuancier).toEqual({ provenance: 'mixte', teintes: [{ hex: '#c81e28' }, { hex: '#1428a0' }, { hex: '#2e8b57' }] });
    expect(r?.ajoutees).toBe(2);
    const rien = nuancierDeSelection(depart, [rouge2 ?? ''], 'ajouter');
    expect(rien?.nuancier).toEqual(depart.nuancier);
    expect(rien?.ajoutees).toBe(0);
  });

  it('ne rend rien pour une selection sans couleur', () => {
    const sans = dessin('<rect x="0" y="0" width="10" height="10" fill="none" stroke="none"/><rect x="20" y="0" width="10" height="10" fill="#c81e28"/>');
    expect(nuancierDeSelection(sans, [sans.formes[0]?.id ?? ''], 'remplacer')).toBeNull();
    expect(teintesDesFormes([])).toEqual([]);
  });
});

describe('le nuancier d’une image', () => {
  /** Une image RGBA : deux tiers rouge, un sixieme bleu, un sixieme vert, un coin transparent. */
  function image(): Uint8ClampedArray {
    const l = 60, h = 60, px = new Uint8ClampedArray(l * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
      const i = (y * l + x) * 4, c = x < 40 ? [200, 30, 40] : y < 30 ? [20, 40, 160] : [46, 139, 87];
      px[i] = c[0] ?? 0; px[i + 1] = c[1] ?? 0; px[i + 2] = c[2] ?? 0; px[i + 3] = x < 5 && y < 5 ? 0 : 255;
    }
    return px;
  }

  it('tire les couleurs dominantes par une quantification deterministe, rangees par part', () => {
    const une = teintesDImage(couleursPixels(image(), { max: 24 }));
    const deux = teintesDImage(couleursPixels(image(), { max: 24 }));
    expect(une).toEqual(deux);
    expect(une.map(t => t.hex)).toEqual(['#c81e28', '#1428a0', '#2e8b57']);
  });
});
