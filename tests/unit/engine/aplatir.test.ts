// La descente vers un dessin plat (ADR-0012 §6, annexe 5 §4) : l'identite pour un dessin plat, les regles dans leur ordre et au
// niveau que l'exporteur declare, puis le filet qui retire ce qu'aucune regle n'a descendu, en le disant.

import { describe, expect, it } from 'vitest';
import { estPlat, verifierDessin, type Chemin, type DessinSvg, type Forme, type Groupe } from '../../../src/engine/editionSvg.js';
import { aplatirPour, CAPACITES_PLAT, REGLES_DESCENTE, type Capacites, type RegleDescente } from '../../../src/engine/aplatir.js';
import { CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PDF, CAPACITES_PRODUCTION, CAPACITES_SVG_DECOUPE } from '../../../src/export/capacites.js';

const carre: Chemin = [{ c: 'M', p: [0, 0] }, { c: 'L', p: [10, 0] }, { c: 'L', p: [10, 10] }, { c: 'Z', p: [] }];
const f = (id: string, p: Partial<Forme> = {}): Forme => ({ id, d: carre, remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p });
const g = (id: string, p: Partial<Groupe> = {}): Groupe => ({ id, visible: true, verrouille: false, ...p });

const riche: DessinSvg = {
  vb: [0, 0, 100, 100],
  formes: [
    f('f1', { parent: 'g1', effets: { ombre: { dx: 1, dy: 1, ecart: 2, couleur: '#000000', opacite: 0.5 } } }),
    f('f2', { parent: 'g2', peintureRemplissage: { genre: 'radial', cx: 5, cy: 5, r: 5, arrets: [] }, remplissage: '#808080' }),
    f('f3', { image: { donnees: 'data:image/png;base64,AAAA', x: 0, y: 0, l: 10, h: 10 }, remplissage: null }),
    f('f4')
  ],
  groupes: { g1: g('g1'), g2: g('g2', { visible: false }) }
};

describe('aplatirPour', () => {
  it('rend le meme objet et aucune perte pour un dessin plat', () => {
    const d: DessinSvg = { vb: [0, 0, 1, 1], formes: [f('f1')] };
    const r = aplatirPour(d, CAPACITES_PLAT);
    expect(r.dessin).toBe(d);
    expect(r.pertes).toEqual([]);
  });

  it('le filet rend un dessin plat et bien forme, et dit ce qu il a retire', () => {
    const r = aplatirPour(riche, CAPACITES_PLAT, []);
    expect(estPlat(r.dessin)).toBe(true);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(r.dessin.formes.map(x => [x.id, x.visible, x.remplissage])).toEqual([['f1', true, '#c81e28'], ['f2', false, '#808080'], ['f4', true, '#c81e28']]);
    expect(r.pertes).toEqual([
      'la structure et l’opacité des groupes (les formes sont gardées à plat)', 'le flou et l’ombre portée', 'les dégradés et les motifs (remplacés par une couleur unie)', 'les images'
    ]);
  });

  it('applique les regles dans l ordre, au niveau declare, et ne garde du filet que ce qui reste', () => {
    const vus: string[] = [];
    const sansEffets: RegleDescente = {
      fonction: 'effets',
      descendre: (d, niveau) => {
        vus.push('effets:' + niveau);
        return { dessin: { ...d, formes: d.formes.map(x => { if (!x.effets) return x; const { effets: _e, ...reste } = x; void _e; return reste; }) }, pertes: ['ombre abandonnée'] };
      }
    };
    const sansImages: RegleDescente = { fonction: 'images', descendre: (d, niveau) => { vus.push('images:' + niveau); return { dessin: { ...d, formes: d.formes.filter(x => !x.image) }, pertes: [] }; } };
    const capacites: Capacites = { ...CAPACITES_PLAT, effets: 'raster' };
    const r = aplatirPour(riche, capacites, [sansEffets, sansImages]);
    expect(vus).toEqual(['effets:raster', 'images:approche']);
    expect(r.pertes).toEqual(['ombre abandonnée', 'la structure et l’opacité des groupes (les formes sont gardées à plat)', 'les dégradés et les motifs (remplacés par une couleur unie)']);
    expect(estPlat(r.dessin)).toBe(true);
  });

  it('les capacites declarees : le texte est toujours natif (ses contours sont dans d), aucune regle inscrite a l etape 0', () => {
    for (const c of [CAPACITES_PLAT, CAPACITES_SVG_DECOUPE, CAPACITES_PDF, CAPACITES_DXF, CAPACITES_EPS, CAPACITES_PRODUCTION]) expect(c.texte).toBe('natif');
    expect(new Set(REGLES_DESCENTE.map(r => r.fonction)).size).toBe(REGLES_DESCENTE.length);
  });
});
