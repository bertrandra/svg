// Le contenu d'une page : chaque operateur de trace, de peinture, d'etat et de couleur, les formulaires, le texte et les images
// comptes, les calques eteints, la decoupe dite seulement quand elle cache quelque chose, et les bornes. La page fait 200 x 100
// points : un point (x, y) du PDF devient (x, 100 - y) dans le dessin.

import { describe, it, expect } from 'vitest';
import type { Forme } from '../../../../src/engine/editionSvg.js';
import { enTexte, flux, lu, pdfClassique, pdfUnePage, refus as refusBrut } from './fabrique.js';

/** Le refus, espaces fines des milliers (toLocaleString) ramenees a des espaces simples pour se lire dans le test. */
const refus = (o: Uint8Array): string => refusBrut(o).replace(/[\u202f\u00a0]/g, ' ');

const lire = (contenu: string, ressources = '', autres: ReadonlyArray<string | Buffer> = []) => lu(pdfUnePage(contenu, { ressources, autres }));
const formes = (contenu: string, ressources = '', autres: ReadonlyArray<string | Buffer> = []): readonly Forme[] => lire(contenu, ressources, autres).dessin.formes;
const traces = (contenu: string) => formes(contenu).map(f => enTexte(f.d));
const une = (contenu: string, ressources = '', autres: ReadonlyArray<string | Buffer> = []): Forme => {
  const f = formes(contenu, ressources, autres);
  expect(f.length).toBe(1);
  return f[0] as Forme;
};

describe('les operateurs de trace', () => {
  it('m l h, et re en quatre segments fermes', () => {
    expect(traces('10 10 m 50 10 l 50 50 l h f')).toEqual(['M10,90 L50,90 L50,50 Z']);
    expect(traces('10 20 30 40 re f')).toEqual(['M10,80 L40,80 L40,40 L10,40 Z']);
  });

  it('c, v (premier point de controle au point courant) et y (second au point d arrivee)', () => {
    expect(traces('0 0 m 10 20 30 20 40 0 c S')).toEqual(['M0,100 C10,80,30,80,40,100']);
    expect(traces('0 0 m 30 20 40 0 v S')).toEqual(['M0,100 C0,100,30,80,40,100']);
    expect(traces('0 0 m 10 20 40 0 y S')).toEqual(['M0,100 C10,80,40,100,40,100']);
  });

  it('plusieurs sous-traces, et un segment apres h repart du debut du sous-trace', () => {
    expect(traces('0 0 m 10 0 l 10 10 l h 20 20 l f')).toEqual(['M0,100 L10,100 L10,90 Z M0,100 L20,80']);
    expect(traces('0 0 10 10 re 20 20 10 10 re f')).toEqual(['M0,100 L10,100 L10,90 L0,90 Z M20,80 L30,80 L30,70 L20,70 Z']);
  });

  it('un segment sans point courant commence le trace ; un trace sans segment ne dessine rien', () => {
    expect(traces('10 10 l 20 10 l S')).toEqual(['M10,90 L20,90']);
    expect(lire('10 10 m f 0 0 1 1 re f').dessin.formes.length).toBe(1);
  });

  it('ignore un operateur aux operandes manquants ou de mauvais type, garde le reste', () => {
    expect(traces('10 m /x 5 l 0 0 m 5 5 l S')).toEqual(['M0,100 L5,95']);
  });
});

describe('les operateurs de peinture', () => {
  const peindre = (op: string) => une('0 0 1 rg 1 0 0 RG 0 0 m 10 0 l 10 10 l ' + op);
  it('f, F, f* remplissent (regle non nulle ou pair-impair) sans trait', () => {
    expect([peindre('f'), peindre('F'), peindre('f*')].map(f => [f.remplissage, f.contour, f.regle])).toEqual([['#0000ff', null, 'nonzero'], ['#0000ff', null, 'nonzero'], ['#0000ff', null, 'evenodd']]);
  });
  it('S trace, s ferme puis trace', () => {
    expect([peindre('S'), peindre('s')].map(f => [f.remplissage, f.contour, enTexte(f.d)])).toEqual([[null, '#ff0000', 'M0,100 L10,100 L10,90'], [null, '#ff0000', 'M0,100 L10,100 L10,90 Z']]);
  });
  it('B, B*, b, b* remplissent et tracent, b et b* ferment', () => {
    expect([peindre('B'), peindre('B*'), peindre('b'), peindre('b*')].map(f => [f.remplissage, f.contour, f.regle, f.d[f.d.length - 1]?.c]))
      .toEqual([['#0000ff', '#ff0000', 'nonzero', 'L'], ['#0000ff', '#ff0000', 'evenodd', 'L'], ['#0000ff', '#ff0000', 'nonzero', 'Z'], ['#0000ff', '#ff0000', 'evenodd', 'Z']]);
  });
  it('n ne peint rien', () => {
    expect(formes('0 0 10 10 re n 0 0 1 1 re f').length).toBe(1);
  });
});

describe('l etat graphique', () => {
  it('cm compose les matrices ; q et Q les empilent et les restaurent', () => {
    expect(traces('q 1 0 0 1 100 0 cm 2 0 0 2 0 0 cm 0 0 10 10 re f Q 0 0 10 10 re f')).toEqual(['M100,100 L120,100 L120,80 L100,80 Z', 'M0,100 L10,100 L10,90 L0,90 Z']);
  });
  it('une rotation par cm', () => {
    expect(traces('0 1 -1 0 50 0 cm 0 0 m 10 0 l S')).toEqual(['M50,100 L50,90']);
  });
  it('w s echelonne avec la matrice (racine du determinant), J j M d donnent bout, jonction, limite et tirets', () => {
    const f = une('2 0 0 2 0 0 cm 3 w 1 J 0 j 7 M [2 1] 0.5 d 0 0 m 10 0 l S');
    expect([f.epaisseur, f.bout, f.jonction, f.limiteMitre, f.pointilles, f.decalagePointilles]).toEqual([6, 'round', 'miter', 7, [4, 2], 1]);
  });
  it('les valeurs du PDF par defaut : jonction en pointe, limite 10 ; la jonction ronde et la limite 4 sont celles du modele', () => {
    const defaut = une('0 0 m 10 0 l S');
    expect([defaut.epaisseur, defaut.bout, defaut.jonction, defaut.limiteMitre, defaut.pointilles]).toEqual([1, undefined, 'miter', 10, undefined]);
    const rond = une('1 j 2 J 0 0 m 10 0 l S');
    expect([rond.jonction, rond.bout, rond.limiteMitre]).toEqual([undefined, 'square', undefined]);
    expect(une('2 j 0 0 m 10 0 l S').jonction).toBe('bevel');
    expect(une('4 M 0 0 m 10 0 l S').limiteMitre).toBeUndefined();
  });
  it('un trait d epaisseur nulle (le filet du PDF) se trace a 0,25 pt, et la lecture le dit', () => {
    const r = lire('0 w 0 0 m 10 0 l S');
    expect(r.dessin.formes[0]?.epaisseur).toBe(0.25);
    expect(r.ignores).toEqual(['l’épaisseur nulle de 1 trait (filets du PDF), tracés à 0,25 pt']);
  });
  it('gs pose l opacite du remplissage (ca) et du trait (CA), et les reglages du trait', () => {
    const r = '/ExtGState << /A << /ca 0.5 /CA 0.25 /LW 4 /LC 1 /LJ 2 /ML 3 /D [[3 1] 0] >> /B << /ca 0.4 /CA 0.4 >> >>';
    const f = une('/A gs 0 0 10 10 re B', r);
    expect([f.opacite, f.opaciteRemplissage, f.opaciteContour, f.epaisseur, f.bout, f.jonction, f.pointilles]).toEqual([1, 0.5, 0.25, 4, 'round', 'bevel', [3, 1]]);
    const g = une('/B gs 0 0 10 10 re B', r);
    expect([g.opacite, g.opaciteRemplissage, g.opaciteContour]).toEqual([0.4, undefined, undefined]);
    expect(une('/A gs 0 0 10 10 re f', r).opacite).toBe(0.5);
    expect(une('/A gs 0 0 10 10 re S', r).opacite).toBe(0.25);
  });
  it('dit un masque de transparence et un mode de fusion, seulement pour les formes peintes avec', () => {
    const r = '/ExtGState << /M << /SMask << /S /Luminosity >> >> /F << /BM /Multiply >> /N << /BM /Normal /SMask /None >> >>';
    expect(lire('/N gs 0 0 1 1 re f', r).ignores).toEqual([]);
    expect(lire('q /M gs Q 0 0 1 1 re f', r).ignores).toEqual([]);
    expect(lire('/M gs /F gs 0 0 1 1 re f 0 0 2 2 re f', r).ignores).toEqual(['les masques de transparence de 2 formes', 'les modes de fusion (produit, superposition…) de 2 formes']);
  });
  it('refuse une pile d etats trop profonde', () => {
    expect(refus(pdfUnePage('q '.repeat(1100) + '0 0 1 1 re f'))).toBe('Ce PDF empile plus de 1024 états graphiques : simplifiez-le dans votre logiciel avant de l’exporter.');
    expect(formes('q '.repeat(1000) + '0 0 1 1 re f' + ' Q'.repeat(1000)).length).toBe(1);
  });
  it('un Q de trop est sans effet', () => {
    expect(traces('Q Q 0 0 1 1 re f')).toEqual(['M0,100 L1,100 L1,99 L0,99 Z']);
  });
});

describe('les couleurs', () => {
  const fond = (contenu: string, ressources = '') => une(contenu + ' 0 0 10 10 re f', ressources).remplissage;
  const trait = (contenu: string, ressources = '') => une(contenu + ' 0 0 m 10 0 l S', ressources).contour;
  it('g G, rg RG, k K (CMJN naif : R = (1 - C)(1 - N))', () => {
    expect([fond('0.5 g'), trait('0.2 G'), fond('1 0.5 0 rg'), trait('0 0 1 RG')]).toEqual(['#808080', '#333333', '#ff8000', '#0000ff']);
    expect([fond('0 1 1 0 k'), trait('0 0 0 1 K'), fond('0 0.85 0.8 0.216 k')]).toEqual(['#ff0000', '#000000', '#c81e28']);
  });
  it('dit la conversion CMJN une fois', () => {
    expect(lire('0 1 1 0 k 0 0 1 1 re f 0 1 1 0 K 0 0 m 5 5 l S').ignores).toEqual(['les couleurs CMJN, converties en RVB sans profil (valeurs approchées)']);
  });
  it('cs et sc dans les espaces d appareil, la couleur initiale de cs', () => {
    expect([fond('/DeviceRGB cs 0 1 0 sc'), fond('/DeviceGray cs'), fond('/DeviceCMYK cs'), trait('/DeviceRGB CS 0 0 1 SC')]).toEqual(['#00ff00', '#000000', '#000000', '#0000ff']);
  });
  it('un espace nomme dans les ressources : ICCBased (par N ou Alternate), CalRGB, CalGray', () => {
    const icc = (n: number, alt = '') => '<< /N ' + n + ' ' + alt + ' >>';
    const r = '/ColorSpace << /I3 [/ICCBased 5 0 R] /I1 [/ICCBased 6 0 R] /Alt [/ICCBased 7 0 R] /Cal [/CalRGB << /WhitePoint [0.95 1 1.09] >>] /Gr [/CalGray << /WhitePoint [0.95 1 1.09] >>] >>';
    const autres = [flux(icc(3), 'x'), flux(icc(1), 'x'), flux(icc(4, '/Alternate /DeviceRGB'), 'x')];
    expect(une('/I3 cs 1 0 0 scn 0 0 1 1 re f', r, autres).remplissage).toBe('#ff0000');
    expect(une('/I1 cs 0.5 scn 0 0 1 1 re f', r, autres).remplissage).toBe('#808080');
    expect(une('/Alt cs 0 0 1 scn 0 0 1 1 re f', r, autres).remplissage).toBe('#0000ff');
    expect(une('/Cal cs 0 1 0 sc 0 0 1 1 re f', r, autres).remplissage).toBe('#00ff00');
    expect(une('/Gr cs 1 sc 0 0 1 1 re f', r, autres).remplissage).toBe('#ffffff');
  });
  it('Indexed par sa table (chaine ou flux)', () => {
    const r = '/ColorSpace << /P [/Indexed /DeviceRGB 1 <ff000000ff00>] /Q [/Indexed /DeviceGray 1 5 0 R] >>';
    expect(une('/P cs 1 sc 0 0 1 1 re f', r).remplissage).toBe('#00ff00');
    expect(une('/Q cs 1 sc 0 0 1 1 re f', r, [flux('<< >>', '\x00\x80')]).remplissage).toBe('#808080');
  });
  it('Separation par sa fonction de teinte (types 2, 3 et 4) vers CMJN, et la dit approchee ; « None » ne peint rien', () => {
    const r = '/ColorSpace << /S2 [/Separation /Rouge /DeviceRGB << /FunctionType 2 /Domain [0 1] /C0 [1 1 1] /C1 [1 0 0] /N 1 >>] '
      + '/S4 [/Separation /Pantone /DeviceCMYK 5 0 R] /S3 [/Separation /Bleu /DeviceRGB << /FunctionType 3 /Domain [0 1] /Bounds [0.5] /Encode [0 1 0 1] /Functions [<< /FunctionType 2 /C0 [0 0 0] /C1 [0 0 1] /N 1 >> << /FunctionType 2 /C0 [0 0 1] /C1 [1 1 1] /N 1 >>] >>] '
      + '/Rien [/Separation /None /DeviceGray << /FunctionType 2 /C0 [1] /C1 [0] /N 1 >>] >>';
    const calc = flux('<< /FunctionType 4 /Domain [0 1] /Range [0 1 0 1 0 1 0 1] >>', '{ dup 0 mul exch dup 0.85 mul exch dup 0.8 mul exch 0.216 mul }');
    const r2 = lire('/S2 cs 1 sc 0 0 1 1 re f /S2 cs 0.5 sc 2 2 1 1 re f /S4 cs 1 sc 4 4 1 1 re f /S3 cs 0.25 sc 6 6 1 1 re f', r, [calc]);
    expect(r2.dessin.formes.map(f => f.remplissage)).toEqual(['#ff0000', '#ff8080', '#c81e28', '#000080']);
    expect(r2.ignores).toEqual(['les couleurs CMJN, converties en RVB sans profil (valeurs approchées)', 'les tons directs et couleurs Lab, approchés en RVB']);
    expect(refus(pdfUnePage('/Rien cs 1 sc 0 0 1 1 re f', { ressources: r }))).toMatch(/aucun tracé/);
  });
  it('DeviceN sans fonction lisible : la teinte moyenne en gris', () => {
    const r = '/ColorSpace << /N [/DeviceN [/A /B] /DeviceCMYK << /FunctionType 0 >>] >>';
    expect(une('/N cs 1 0 sc 0 0 1 1 re f', r).remplissage).toBe('#808080');
  });
  it('Lab vers sRGB', () => {
    const r = '/ColorSpace << /L [/Lab << /WhitePoint [0.9505 1 1.089] /Range [-128 127 -128 127] >>] >>';
    expect(une('/L cs 100 0 0 sc 0 0 1 1 re f', r).remplissage).toBe('#ffffff');
    expect(une('/L cs 0 0 0 sc 0 0 1 1 re f', r).remplissage).toBe('#000000');
    const rouge = une('/L cs 53.24 80.09 67.2 sc 0 0 1 1 re f', r).remplissage ?? '';
    expect(parseInt(rouge.slice(1, 3), 16)).toBeGreaterThan(240);
  });
  it('un motif de degrade : la couleur au milieu de son degrade, dite remplacee ; un pavage : un gris moyen', () => {
    const r = '/Pattern << /D << /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 10 0] /Function << /FunctionType 2 /Domain [0 1] /C0 [1 0 0] /C1 [0 0 1] /N 1 >> >> >> /T 5 0 R /U 6 0 R >> /ColorSpace << /PU [/Pattern /DeviceRGB] >>';
    const pavage = flux('<< /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 1 1] /XStep 1 /YStep 1 /Resources << >> >>', '0 0 1 1 re f');
    const sansCouleur = flux('<< /PatternType 1 /PaintType 2 /TilingType 1 /BBox [0 0 1 1] /XStep 1 /YStep 1 /Resources << >> >>', '0 0 1 1 re f');
    const x = lire('/Pattern cs /D scn 0 0 1 1 re f /Pattern cs /T scn 2 2 1 1 re f /PU cs 0 1 0 /U scn 4 4 1 1 re f', r, [pavage, sansCouleur]);
    expect(x.dessin.formes.map(f => f.remplissage)).toEqual(['#800080', '#808080', '#00ff00']);
    expect(x.ignores).toEqual(['les dégradés et motifs de 3 formes, remplacés par une couleur unie']);
  });
  it('sh dans une decoupe devient la forme de cette decoupe ; sans decoupe, il est dit', () => {
    const r = '/Shading << /S << /ShadingType 2 /ColorSpace /DeviceGray /Coords [0 0 1 0] /Function << /FunctionType 2 /C0 [0] /C1 [1] /N 1 >> >> >>';
    const x = lire('q 10 10 50 20 re W n /S sh Q', r);
    expect(x.dessin.formes.map(f => [f.remplissage, enTexte(f.d)])).toEqual([['#808080', 'M10,90 L60,90 L60,70 L10,70 Z']]);
    expect(x.ignores).toEqual(['les dégradés et motifs de 1 forme, remplacés par une couleur unie']);
    expect(lire('/S sh 0 0 1 1 re f', r).ignores).toEqual(['1 dégradé peint hors de toute forme']);
  });
});

describe('la decoupe (W, W*) : dite seulement quand elle cache une partie d une forme', () => {
  it('un rectangle qui contient la forme ne se dit pas ; un qui la coupe se dit', () => {
    expect(lire('0 0 200 100 re W n 10 10 20 20 re f').ignores).toEqual([]);
    expect(lire('0 0 15 100 re W n 10 10 20 20 re f').ignores).toEqual(['les découpes (masques d’écrêtage) de 1 forme : ce qu’elles cachaient se voit']);
  });
  it('le trait compte : un trait qui deborde du rectangle est coupe', () => {
    expect(lire('10 10 20 20 re W n 4 w 10 10 20 20 re S').ignores).toEqual(['les découpes (masques d’écrêtage) de 1 forme : ce qu’elles cachaient se voit']);
  });
  it('deux rectangles s intersectent ; une decoupe quelconque (W*, triangle) se dit toujours ; Q la retire', () => {
    expect(lire('0 0 100 100 re W n 50 0 100 100 re W n 60 10 5 5 re f').ignores).toEqual([]);
    expect(lire('0 0 100 100 re W n 50 0 100 100 re W n 10 10 5 5 re f').ignores.length).toBe(1);
    expect(lire('0 0 m 100 0 l 50 80 l h W* n 40 10 5 5 re f').ignores.length).toBe(1);
    expect(lire('q 0 0 1 1 re W n Q 40 10 5 5 re f').ignores).toEqual([]);
  });
  it('la decoupe s applique apres la peinture du meme trace', () => {
    expect(lire('0 0 5 5 re W f 10 10 5 5 re f').dessin.formes.length).toBe(2);
    expect(lire('0 0 5 5 re W f 0 0 5 5 re f').ignores).toEqual([]);
  });
});

describe('les formulaires (XObject Form)', () => {
  const form = (contenu: string, dict = '') => flux('<< /Type /XObject /Subtype /Form /BBox [0 0 200 100] ' + dict + ' >>', contenu);
  it('se deplient avec leur matrice, leurs ressources, et celles de la page a defaut', () => {
    const r = '/XObject << /F 5 0 R >> /ExtGState << /A << /ca 0.5 >> >>';
    const x = formes('1 0 0 1 10 0 cm /F Do', r, [form('/A gs 0 0 10 10 re f /G gs', '/Matrix [2 0 0 2 0 0] /Resources << /ExtGState << /G << /ca 1 >> >> >>')]);
    expect(x.map(f => [enTexte(f.d), f.opacite])).toEqual([['M10,100 L30,100 L30,80 L10,80 Z', 1]]);
    const y = formes('/F Do', r, [form('/A gs 0 0 10 10 re f')]);
    expect(y[0]?.opacite).toBe(0.5);
  });
  it('se dessinent autant de fois qu on les appelle, et s imbriquent', () => {
    const r = '/XObject << /F 5 0 R >>';
    const x = formes('/F Do 1 0 0 1 50 0 cm /F Do', r, [form('/G Do', '/Resources << /XObject << /G 6 0 R >> >>'), form('0 0 5 5 re f')]);
    expect(x.map(f => enTexte(f.d))).toEqual(['M0,100 L5,100 L5,95 L0,95 Z', 'M50,100 L55,100 L55,95 L50,95 Z']);
  });
  it('un groupe de transparence se compose avec l opacite courante ; ses formes repartent opaques', () => {
    const r = '/XObject << /F 5 0 R >> /ExtGState << /A << /ca 0.5 >> /B << /ca 0.5 >> >>';
    const x = formes('/A gs /F Do', r, [form('0 0 5 5 re f /B gs 6 6 5 5 re f', '/Group << /S /Transparency >>')]);
    expect(x.map(f => f.opacite)).toEqual([0.5, 0.25]);
  });
  it('leur cadre (BBox) les decoupe : dit seulement s il cache une forme', () => {
    const r = '/XObject << /F 5 0 R >>';
    expect(lire('/F Do', r, [flux('<< /Subtype /Form /BBox [0 0 10 10] >>', '0 0 5 5 re f')]).ignores).toEqual([]);
    expect(lire('/F Do', r, [flux('<< /Subtype /Form /BBox [0 0 10 10] >>', '0 0 50 5 re f')]).ignores.length).toBe(1);
  });
  it('refusent un formulaire qui se dessine lui-meme, une imbrication trop profonde, des appels sans nombre', () => {
    expect(refus(pdfUnePage('/F Do', { ressources: '/XObject << /F 5 0 R >>', autres: [form('0 0 1 1 re f /F Do', '/Resources << /XObject << /F 5 0 R >> >>')] })))
      .toBe('Ce PDF contient un formulaire qui se dessine lui-même : il ne se lit pas ici.');
    const chaine: Buffer[] = [];
    for (let k = 0; k < 18; k++) chaine.push(form('0 0 1 1 re f /F Do', '/Resources << /XObject << /F ' + (7 + k) + ' 0 R >> >>'));
    expect(refus(pdfUnePage('/F Do', { ressources: '/XObject << /F 5 0 R >>', autres: [form('/F Do', '/Resources << /XObject << /F 6 0 R >> >>'), ...chaine] })))
      .toBe('Ce PDF imbrique des formulaires sur plus de 16 niveaux : simplifiez-le dans votre logiciel avant de l’exporter.');
    expect(refus(pdfUnePage('/F Do '.repeat(20_001), { ressources: '/XObject << /F 5 0 R >>', autres: [form('0 0 1 1 re n')] })))
      .toBe('Ce PDF dessine plus de 20 000 formulaires : simplifiez-le dans votre logiciel avant de l’exporter.');
  });
});

describe('le texte, les images, les calques et les annotations : comptes et dits', () => {
  const police = '/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>';
  it('compte les blocs de texte qui montrent quelque chose', () => {
    const x = lire('BT /F1 12 Tf 10 10 Td (Un) Tj ET BT (Deux) \' [(Tr) 10 (ois)] TJ ET BT ET 0 0 5 5 re f', police);
    expect(x.ignores).toEqual(['2 textes (convertissez le texte en contours dans votre logiciel avant d’exporter le PDF)']);
    expect(x.dessin.formes.length).toBe(1);
  });
  it('compte les images : XObject Image et image en ligne (dont les octets peuvent contenir « EI »)', () => {
    const image = flux('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 >>', '\x80');
    const x = lire('/Im Do q 10 0 0 10 0 0 cm BI /W 2 /H 1 /CS /G /BPC 8 ID EIx\nEI Q BI /W 1 /H 1 /CS /G /BPC 8 /L 3 ID \x00 EI\nEI 0 0 5 5 re f', '/XObject << /Im 5 0 R >>', [image]);
    expect(x.ignores).toEqual(['3 images (une image se vectorise par « Convertir une image »)']);
    expect(x.dessin.formes.length).toBe(1);
  });
  it('ne reprend pas les formes d un calque eteint a l ouverture (OCG, OCMD), et le dit', () => {
    const pdf = pdfClassique([
      '<< /Type /Catalog /Pages 2 0 R /OCProperties << /OCGs [5 0 R 6 0 R] /D << /OFF [6 0 R] >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Contents 4 0 R /Resources << /Properties << /Vu 5 0 R /Cache 6 0 R /Md 7 0 R >> >> >>',
      flux('<< >>', '/OC /Vu BDC 0 0 1 1 re f EMC /OC /Cache BDC 2 2 1 1 re f /Span << >> BDC 4 4 1 1 re f EMC EMC /OC /Md BDC 6 6 1 1 re f EMC 8 8 1 1 re f'),
      '<< /Type /OCG /Name (Vu) >>', '<< /Type /OCG /Name (Cache) >>', '<< /Type /OCMD /OCGs [6 0 R] /P /AnyOn >>'
    ]);
    const x = lu(pdf);
    expect(x.dessin.formes.map(f => enTexte(f.d).slice(0, 7))).toEqual(['M0,100 ', 'M8,92 L']);
    expect(x.ignores).toEqual(['3 formes de calques masqués']);
  });
  it('compte les annotations qui se dessinent, hors liens', () => {
    const x = lu(pdfUnePage('0 0 1 1 re f', { pageEnPlus: '/Annots [<< /Subtype /Link >> << /Subtype /Stamp >> << /Subtype /Widget >>]' }));
    expect(x.ignores).toEqual(['2 annotations (commentaires, tampons, champs de formulaire)']);
  });
});

describe('la robustesse et les bornes du contenu', () => {
  it('ignore les operateurs inconnus et ceux de compatibilite', () => {
    expect(traces('BX /x inconnu EX 1 2 3 truc 0 0 1 1 re f ri')).toEqual(['M0,100 L1,100 L1,99 L0,99 Z']);
  });
  it('garde ce qui precede un defaut de syntaxe, et dit la partie perdue', () => {
    const x = lire('0 0 1 1 re f ) 5 5 1 1 re f');
    expect(x.dessin.formes.length).toBe(1);
    expect(x.ignores).toEqual(['une partie illisible du contenu de la page']);
  });
  it('refuse des coordonnees demesurees', () => {
    expect(refus(pdfUnePage('1000000 0 0 1000000 0 0 cm 0 0 m 100000 0 l S'))).toBe('Ce PDF a des coordonnées démesurées (au-delà de ± 1 000 000 000) : simplifiez-le dans votre logiciel avant de l’exporter.');
  });
  it('refuse plus de cent mille formes', () => {
    expect(refus(pdfUnePage('0 0 1 1 re f\n'.repeat(100_001)))).toBe('Ce PDF dessine plus de 100 000 formes sur cette page : simplifiez-le dans votre logiciel avant de l’exporter.');
  }, 30_000);
  it('refuse plus de deux millions de segments', () => {
    expect(refus(pdfUnePage('0 0 m ' + '1 1 l '.repeat(2_000_001) + 'S'))).toBe('Ce PDF compte plus de 2 000 000 segments de tracé sur cette page : simplifiez-le dans votre logiciel avant de l’exporter.');
  }, 30_000);
  it('refuse plus de cinq millions d operations', () => {
    expect(refus(pdfUnePage('n '.repeat(5_000_001)))).toBe('Ce PDF compte plus de 5 000 000 opérations de dessin : simplifiez-le dans votre logiciel avant de l’exporter.');
  }, 30_000);
  it('refuse une avalanche d operandes sans operateur, en perte de contenu', () => {
    expect(lire('0 0 1 1 re f ' + '1 '.repeat(20_000) + ' 0 0 1 1 re f').ignores).toEqual(['une partie illisible du contenu de la page']);
  });
});
