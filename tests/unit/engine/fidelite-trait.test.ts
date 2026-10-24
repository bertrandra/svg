// Deuxieme lot de fidelite de lecture (version majeure, suite de l'ADR-0009) : la peinture posee sur la
// balise <svg> racine se transmet (icones de type Feather), currentColor suit la propriete `color`, et le
// trait garde ses pointilles, ses bouts, ses jonctions et sa limite de pointe.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appliquerBooleen } from '../../../src/engine/booleens.js';
import {
  aligner, attributsTrait, combiner, coller, deplacer, dupliquer, ecrireDessin, genrePointilles, inserer, lireDessin, modifierTrait, motifDeGenre, normaliserPointilles,
  redimensionner, regrouper, retourner, separer, tourner, type DessinSvg, type Forme, type LectureDessin
} from '../../../src/engine/editionSvg.js';
import { incliner, mettreALEchelle } from '../../../src/engine/transformations.js';
import { ecrirePdf } from '../../../src/export/pdf.js';
import { svgDecoupe } from '../../../src/export/svgs.js';
import { construireBibliotheque, type IconeSource } from '../../../src/model/bibliotheque.js';
import { au } from '../../../src/util/tableaux.js';

const enveloppe = (corps: string, entete = '') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"' + entete + '>' + corps + '</svg>';
const lecture = (corps: string, entete = ''): LectureDessin => lireDessin(enveloppe(corps, entete));
const lire = (corps: string, entete = ''): DessinSvg => {
  const r = lecture(corps, entete);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const ignoresDe = (corps: string, entete = ''): readonly string[] => {
  const r = lecture(corps, entete);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.ignores;
};
const forme = (d: DessinSvg, i = 0): Forme => au(d.formes, i);
const relire = (svg: string): DessinSvg => {
  const r = lireDessin(svg);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const texte = (octets: Uint8Array) => Array.from(octets, c => String.fromCharCode(c)).join('');
const TRAIT = '<path d="M0 0h10" fill="none" stroke="#000" stroke-width="2" ';

describe('la peinture de la balise racine se transmet', () => {
  const FEATHER = ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  it('une icone de type Feather s ouvre en traits, pas en formes noires pleines', () => {
    const d = lire('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/><circle cx="12" cy="12" r="10"/>', FEATHER);
    for (const f of d.formes) {
      expect(f).toMatchObject({ remplissage: null, contour: '#000000', epaisseur: 2, bout: 'round' });
      expect(f.jonction).toBeUndefined();
    }
    expect(ignoresDe('<polyline points="22 12 18 12 15 21"/>', FEATHER)).toEqual([]);
  });

  it('fill, stroke, stroke-width, fill-rule, fill-opacity et stroke-opacity s heritent de la racine', () => {
    const f = forme(lire('<path d="M0 0h10v10z"/>', ' fill="#336699" stroke="#112233" stroke-width="3" fill-rule="evenodd" fill-opacity="0.5" stroke-opacity="0.25"'));
    expect(f).toMatchObject({ remplissage: '#336699', contour: '#112233', epaisseur: 3, regle: 'evenodd', opacite: 1, opaciteRemplissage: 0.5, opaciteContour: 0.25 });
  });

  it('une forme garde le dernier mot : elle recouvre la racine, un groupe aussi', () => {
    const d = lire('<path d="M0 0h10v10z" stroke="#f00" stroke-width="5"/><g stroke-width="7" fill="#00f"><path d="M0 0h10v10z"/></g>', ' fill="none" stroke="#000" stroke-width="2"');
    expect(d.formes.map(f => [f.remplissage, f.contour, f.epaisseur])).toEqual([[null, '#ff0000', 5], ['#0000ff', '#000000', 7]]);
  });

  it('se pose aussi par style et par classe sur la racine', () => {
    const d = lire('<style>.icone { stroke: #123456; stroke-width: 4 }</style><path d="M0 0h10v10z"/>', ' class="icone" style="fill: none"');
    expect(forme(d)).toMatchObject({ remplissage: null, contour: '#123456', epaisseur: 4 });
  });

  it('inherit sur une forme reprend la racine, visibility aussi s herite (la forme cachee par la racine disparait)', () => {
    const d = lire('<path d="M0 0h10v10z" fill="inherit"/><path d="M0 0h10v10z" visibility="visible"/>', ' fill="#00f" visibility="hidden"');
    expect(d.formes.map(f => f.remplissage)).toEqual(['#0000ff']);
  });

  it('l opacite de la racine vaut pour le dessin entier : elle se multiplie a celle de chaque forme', () => {
    const d = lire('<path d="M0 0h1v1z" opacity="0.5"/><g opacity="0.5"><path d="M0 0h1v1z"/></g><path d="M0 0h1v1z" stroke="#000" fill="#f00"/>', ' opacity="0.5"');
    expect(d.formes.map(f => f.opacite)).toEqual([0.25, 0.25, 0.5]);
  });

  it('masque, decoupe et filtre poses sur la racine refusent le SVG, comme sur un groupe', () => {
    const erreur = (entete: string) => { const r = lecture('<path d="M0 0h1v1z"/>', entete); return 'erreur' in r ? r.erreur : ''; };
    expect(erreur(' filter="url(#f)"')).toContain('un filtre');
    expect(erreur(' clip-path="url(#c)"')).toContain('un masque ou une découpe');
    expect(erreur(' mask="url(#m)"')).toContain('un masque ou une découpe');
    expect(erreur(' filter="none"')).toBe('');
  });

  it('une icone sans peinture de racine se lit comme avant', () => {
    const f = forme(lire('<path d="M0 0h10v10z"/>', ' width="100" height="100"'));
    expect(f).toMatchObject({ remplissage: '#000000', contour: null, epaisseur: 0, opacite: 1 });
  });
});

describe('currentColor suit la propriete color', () => {
  it('vaut noir quand color n est posee nulle part', () => {
    const d = lire('<path d="M0 0h10v10z" fill="currentColor" stroke="currentColor"/>');
    expect(forme(d)).toMatchObject({ remplissage: '#000000', contour: '#000000' });
  });

  it('prend color de la racine, d un groupe, ou de la forme elle-meme', () => {
    const d = lire(
      '<path d="M0 0h10v10z" fill="currentColor"/>'
      + '<g color="#00ff00"><path d="M0 0h10v10z" fill="currentColor"/><path d="M0 0h10v10z" fill="currentColor" color="#0000ff"/></g>'
      + '<path d="M0 0h10v10z" style="fill: currentColor; color: tomato"/>',
      ' color="#ff0000"'
    );
    expect(d.formes.map(f => f.remplissage)).toEqual(['#ff0000', '#00ff00', '#0000ff', '#ff6347']);
  });

  it('se resout a la couleur de la forme qui s en sert, meme si un parent l a posee (CSS Color 4)', () => {
    const d = lire('<g fill="currentColor" color="#ff0000"><path d="M0 0h10v10z"/><path d="M0 0h10v10z" color="#0000ff"/></g>');
    expect(d.formes.map(f => f.remplissage)).toEqual(['#ff0000', '#0000ff']);
  });

  it('une icone type : stroke=currentColor et color sur la racine', () => {
    const d = lire('<path d="M0 0h10"/>', ' fill="none" stroke="currentColor" color="#c81e28"');
    expect(forme(d)).toMatchObject({ remplissage: null, contour: '#c81e28' });
  });

  it('color: currentColor reprend celle du parent, inherit aussi, none n est pas une couleur', () => {
    const d = lire('<g color="#00f"><path d="M0 0h1v1z" color="currentColor" fill="currentColor"/><path d="M0 0h1v1z" color="inherit" fill="currentColor"/><path d="M0 0h1v1z" color="none" fill="currentColor"/></g>');
    expect(d.formes.map(f => f.remplissage)).toEqual(['#0000ff', '#0000ff', '#0000ff']);
  });

  it('l alpha de color passe a la peinture, un nom CSS se lit, transparent efface', () => {
    const f = forme(lire('<path d="M0 0h10v10z" fill="currentColor"/>', ' color="rgba(200, 30, 40, 0.5)"'));
    expect(f.remplissage).toBe('#c81e28');
    expect(f.opacite).toBe(0.5);
    expect(forme(lire('<path d="M0 0h10v10z" fill="currentColor" stroke="currentColor"/>', ' color="transparent"'))).toMatchObject({ remplissage: null, contour: null });
  });

  it('un fill absent reste noir, il ne prend pas color', () => {
    expect(forme(lire('<path d="M0 0h10v10z"/>', ' color="#ff0000"')).remplissage).toBe('#000000');
  });

  it('une regle de style hors classe qui pose color est dite', () => {
    expect(ignoresDe('<style>svg { color: red }</style><path d="M0 0h1v1z"/>')).toEqual(['les règles de style qui ne visent pas une classe (balise, identifiant…)']);
  });
});

describe('le style du trait, a la lecture', () => {
  it('un trait ordinaire n a aucun des champs nouveaux', () => {
    const f = forme(lire('<path d="M0 0h10" stroke="#000" stroke-linecap="butt" stroke-linejoin="round" stroke-dasharray="none" stroke-miterlimit="9"/>'));
    expect(Object.keys(f).sort()).toEqual(['contour', 'd', 'epaisseur', 'id', 'opacite', 'regle', 'remplissage', 'verrouille', 'visible']);
  });

  it('lit les bouts et les jonctions', () => {
    expect(forme(lire(TRAIT + 'stroke-linecap="round"/>'))).toMatchObject({ bout: 'round' });
    expect(forme(lire(TRAIT + 'stroke-linecap="SQUARE"/>'))).toMatchObject({ bout: 'square' });
    expect(forme(lire(TRAIT + 'stroke-linejoin="miter"/>'))).toMatchObject({ jonction: 'miter' });
    expect(forme(lire(TRAIT + 'stroke-linejoin="bevel"/>'))).toMatchObject({ jonction: 'bevel' });
    expect(forme(lire(TRAIT + 'stroke-linejoin="round"/>')).jonction).toBeUndefined();
  });

  it('la limite de pointe ne se garde que pour une pointe, valide et differente de 4', () => {
    expect(forme(lire(TRAIT + 'stroke-linejoin="miter" stroke-miterlimit="2.5"/>')).limiteMitre).toBe(2.5);
    expect(forme(lire(TRAIT + 'stroke-linejoin="miter" stroke-miterlimit="4"/>')).limiteMitre).toBeUndefined();
    expect(forme(lire(TRAIT + 'stroke-linejoin="miter" stroke-miterlimit="0.5"/>')).limiteMitre).toBeUndefined();
    expect(forme(lire(TRAIT + 'stroke-linejoin="miter" stroke-miterlimit="abc"/>')).limiteMitre).toBeUndefined();
    expect(forme(lire(TRAIT + 'stroke-linejoin="bevel" stroke-miterlimit="2"/>')).limiteMitre).toBeUndefined();
    expect(forme(lire(TRAIT + 'stroke-miterlimit="2"/>')).limiteMitre).toBeUndefined();
  });

  it('lit un motif pair tel quel, avec virgules ou espaces, et son decalage', () => {
    const f = forme(lire(TRAIT + 'stroke-dasharray="4,2 1" stroke-dashoffset="1.5"/>'));
    expect(f.pointilles).toEqual([4, 2, 1, 4, 2, 1]);
    expect(f.decalagePointilles).toBe(1.5);
    expect(forme(lire(TRAIT + 'stroke-dasharray="6 3"/>')).pointilles).toEqual([6, 3]);
  });

  it('un motif impair se repete (specification) : on range la liste paire', () => {
    expect(forme(lire(TRAIT + 'stroke-dasharray="5"/>')).pointilles).toEqual([5, 5]);
    expect(forme(lire(TRAIT + 'stroke-dasharray="5 3 2"/>')).pointilles).toEqual([5, 3, 2, 5, 3, 2]);
  });

  it('un zero dans le motif est permis (des points, avec un bout rond), tout a zero ne l est pas', () => {
    expect(forme(lire(TRAIT + 'stroke-dasharray="0 6" stroke-linecap="round"/>')).pointilles).toEqual([0, 6]);
    for (const v of ['0', '0 0', '0,0,0', 'none', '', '  ']) expect(forme(lire(TRAIT + `stroke-dasharray="${v}"/>`)).pointilles).toBeUndefined();
  });

  it('une valeur negative ou illisible est une erreur de syntaxe : trait plein, sans rien a dire', () => {
    for (const v of ['-2 3', '4 -1', 'abc', '4 x', '1 2 oups']) {
      const corps = TRAIT + `stroke-dasharray="${v}"/>`;
      expect(forme(lire(corps)).pointilles, v).toBeUndefined();
      expect(ignoresDe(corps), v).toEqual([]);
    }
  });

  it('px est l unite du plan : acceptee. Le reste (%, mm, em…) est dit et le trait s ecrit plein', () => {
    expect(forme(lire(TRAIT + 'stroke-dasharray="4px 2PX" stroke-dashoffset="-1px"/>'))).toMatchObject({ pointilles: [4, 2], decalagePointilles: -1 });
    for (const v of ['5%', '4mm 2mm', '1em', '3 2pt', '4px 2cm']) {
      const corps = TRAIT + `stroke-dasharray="${v}"/>`;
      expect(forme(lire(corps)).pointilles, v).toBeUndefined();
      expect(ignoresDe(corps), v).toEqual(['les pointillés dont une longueur est en pourcentage ou en unité autre que le pixel (le trait s’écrit plein)']);
    }
  });

  it('un decalage en unite est dit, et vaut zero ; sans motif il n y a rien a dire', () => {
    const corps = TRAIT + 'stroke-dasharray="4 2" stroke-dashoffset="10%"/>';
    expect(forme(lire(corps))).toMatchObject({ pointilles: [4, 2] });
    expect(forme(lire(corps)).decalagePointilles).toBeUndefined();
    expect(ignoresDe(corps)).toEqual(['le décalage des pointillés en pourcentage ou en unité autre que le pixel (il s’écrit nul)']);
    expect(ignoresDe(TRAIT + 'stroke-dashoffset="10%"/>')).toEqual([]);
    expect(forme(lire(TRAIT + 'stroke-dasharray="4 2" stroke-dashoffset="0"/>')).decalagePointilles).toBeUndefined();
    expect(forme(lire(TRAIT + 'stroke-dasharray="4 2" stroke-dashoffset="abc"/>')).decalagePointilles).toBeUndefined();
  });

  it('les jonctions « arcs » et « miter-clip » de SVG 2 sont dites, et s ecrivent arrondies', () => {
    for (const j of ['arcs', 'miter-clip']) {
      const corps = TRAIT + `stroke-linejoin="${j}"/>`;
      expect(forme(lire(corps)).jonction).toBeUndefined();
      expect(ignoresDe(corps)).toEqual(['les jonctions de trait « arcs » et « miter-clip » (elles s’écrivent arrondies)']);
    }
  });

  it('un trait invisible (epaisseur nulle) garde son style mais n a rien a perdre : rien n est dit', () => {
    const corps = '<path d="M0 0h10" stroke="#000" stroke-width="0" stroke-dasharray="4mm" stroke-linejoin="arcs"/>';
    expect(ignoresDe(corps)).toEqual([]);
    expect(forme(lire('<path d="M0 0h10" stroke="#000" stroke-width="0" stroke-dasharray="4 2"/>')).pointilles).toEqual([4, 2]);
  });

  it('sans trait, aucun champ de style de trait', () => {
    const f = forme(lire('<path d="M0 0h10v10z" fill="#f00" stroke="none" stroke-dasharray="4 2" stroke-linecap="round"/>'));
    expect(f.pointilles).toBeUndefined();
    expect(f.bout).toBeUndefined();
    expect(ignoresDe('<path d="M0 0h10v10z" fill="#f00" stroke-dasharray="4mm"/>')).toEqual([]);
  });

  it('s herite par les groupes et par la racine, et les longueurs suivent l echelle des groupes', () => {
    const d = lire('<g stroke="#000" stroke-width="2" stroke-dasharray="6 2" stroke-dashoffset="1" stroke-linecap="square" transform="scale(3)"><path d="M0 0h10"/><path d="M0 5h10" stroke-dasharray="none" stroke-linecap="butt"/></g>');
    expect(forme(d, 0)).toMatchObject({ epaisseur: 6, pointilles: [18, 6], decalagePointilles: 3, bout: 'square' });
    expect(forme(d, 1).pointilles).toBeUndefined();
    expect(forme(d, 1).bout).toBeUndefined();
    const r = lire('<path d="M0 0h10"/>', ' fill="none" stroke="#000" stroke-dasharray="3 1" stroke-linejoin="bevel"');
    expect(forme(r)).toMatchObject({ pointilles: [3, 1], jonction: 'bevel' });
  });

  it('une regle de classe ou un style pose aussi le trait', () => {
    const d = lire('<style>.t { stroke-dasharray: 4 2; stroke-linecap: round }</style><path class="t" d="M0 0h10" stroke="#000"/><path d="M0 0h10" stroke="#000" style="stroke-linejoin: bevel"/>');
    expect(forme(d, 0)).toMatchObject({ pointilles: [4, 2], bout: 'round' });
    expect(forme(d, 1)).toMatchObject({ jonction: 'bevel' });
  });

  it('une regle hors classe qui pose un pointille est dite', () => {
    expect(ignoresDe('<style>path { stroke-dasharray: 4 2 }</style><path d="M0 0h1v1z"/>')).toHaveLength(1);
  });

  it('les marqueurs, les animations et les regles hors classe restent dits', () => {
    expect(ignoresDe('<path d="M0 0h10" stroke="#000" marker-end="url(#m)"/>')).toEqual(['les marqueurs des traits (pointes de flèche…)']);
    expect(ignoresDe('<path d="M0 0h1v1z"><animate attributeName="fill" values="a;b" dur="1s"/></path>')).toEqual(['les animations']);
  });
});

describe('le style du trait, a l ecriture', () => {
  it('une forme sans style de trait s ecrit exactement comme avant', () => {
    const d = lire('<path d="M0 0h10v10z" fill="#f00" stroke="#000" stroke-width="2"/>');
    expect(ecrireDessin(d)).toContain('fill="#ff0000" stroke="#000000" stroke-width="2" stroke-linejoin="round"/>');
    expect(attributsTrait(forme(d))).toEqual([['stroke-linejoin', 'round']]);
  });

  it('ecrit chaque attribut dans l ordre, seulement s il differe du defaut', () => {
    const f = forme(lire(TRAIT + 'stroke-linejoin="miter" stroke-miterlimit="2" stroke-linecap="square" stroke-dasharray="4 2" stroke-dashoffset="1"/>'));
    expect(attributsTrait(f)).toEqual([
      ['stroke-linejoin', 'miter'], ['stroke-linecap', 'square'], ['stroke-miterlimit', '2'], ['stroke-dasharray', '4 2'], ['stroke-dashoffset', '1']
    ]);
    expect(ecrireDessin(lire(TRAIT + 'stroke-linejoin="miter"/>'))).toContain('stroke-linejoin="miter"/>');
  });

  it('relu puis reecrit, chaque combinaison est stable d un octet', () => {
    const combinaisons = [
      'stroke-dasharray="4 2"', 'stroke-dasharray="5 3 2" stroke-dashoffset="3"', 'stroke-dasharray="0 6" stroke-linecap="round"', 'stroke-linecap="square"',
      'stroke-linejoin="miter"', 'stroke-linejoin="miter" stroke-miterlimit="1.5"', 'stroke-linejoin="bevel" stroke-dasharray="1.2345678 2"', 'stroke-dasharray="3 1" stroke-dashoffset="-2.25"'
    ];
    for (const c of combinaisons) {
      const premier = ecrireDessin(lire(TRAIT + c + '/>'));
      expect(ecrireDessin(relire(premier)), c).toBe(premier);
    }
  });

  it('un motif qui s arrondit a zero ne s ecrit pas : la relecture ne le perdrait qu apres coup', () => {
    const d = lire(TRAIT + 'stroke-dasharray="0.0001 0.0002"/>');
    expect(forme(d).pointilles).toHaveLength(2);
    const svg = ecrireDessin(d);
    expect(svg).not.toContain('dasharray');
    expect(ecrireDessin(relire(svg))).toBe(svg);
    expect(ecrireDessin(modifierTrait(lire(TRAIT + 'stroke-linejoin="miter"/>'), ['f1'], { limiteMitre: 4.0001 }))).not.toContain('miterlimit');
  });

  it('une forme sans contour n ecrit rien du trait', () => {
    const d = modifierTrait(lire('<path d="M0 0h10v10z" fill="#f00" stroke="#000"/>'), ['f1'], { pointilles: [4, 2], bout: 'round' });
    const sans = { ...d, formes: d.formes.map(f => ({ ...f, contour: null, epaisseur: 0 })) };
    expect(ecrireDessin(sans)).not.toMatch(/dasharray|linecap|linejoin/);
  });
});

describe('le style du trait suit l echelle', () => {
  const base = () => lire(
    '<path d="M0 0h20" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="6 2" stroke-dashoffset="1" stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="3"/>'
    + '<path d="M0 10h20" fill="none" stroke="#000" stroke-width="2"/>'
  );

  it('regle : l epaisseur, les tirets et le decalage multiplient par le facteur lineaire ; la limite de pointe, un rapport, ne bouge pas', () => {
    const f = forme(mettreALEchelle(base(), ['f1'], 2, 2));
    expect(f).toMatchObject({ epaisseur: 4, pointilles: [12, 4], decalagePointilles: 2, bout: 'round', jonction: 'miter', limiteMitre: 3 });
  });

  it('une echelle inegale suit la racine de l aire, comme l epaisseur', () => {
    const f = forme(mettreALEchelle(base(), ['f1'], 4, 1));
    expect(f.epaisseur).toBe(4);
    expect(f.pointilles).toEqual([12, 4]);
  });

  it('redimensionner, mettre a l echelle, incliner, tourner, retourner', () => {
    // Une ligne n'a pas de hauteur : seul x double, le facteur lineaire est la racine de l'aire (ici 2 x 1), pour le trait comme pour ses tirets.
    const large = forme(redimensionner(base(), ['f1'], { x: 0, y: 0, l: 40, h: 40 }));
    expect(large.epaisseur).toBeCloseTo(2 * Math.SQRT2, 10);
    expect(large.pointilles?.[0]).toBeCloseTo(6 * Math.SQRT2, 10);
    expect(large.pointilles?.[1]).toBeCloseTo(2 * Math.SQRT2, 10);
    expect(large.decalagePointilles).toBeCloseTo(Math.SQRT2, 10);
    const tourne = forme(tourner(base(), ['f1'], 45));
    expect(tourne.pointilles).toEqual([6, 2]);
    expect(forme(retourner(base(), ['f1'], 'h')).pointilles).toEqual([6, 2]);
    const incline = forme(incliner(base(), ['f1'], 20, 5));
    expect(incline.epaisseur).toBeCloseTo(2 * (incline.pointilles?.[0] ?? 0) / 6, 10);
  });

  it('deplacer et aligner ne changent rien au style', () => {
    expect(forme(deplacer(base(), ['f1'], 5, 5))).toMatchObject({ epaisseur: 2, pointilles: [6, 2], decalagePointilles: 1 });
    expect(forme(aligner(base(), ['f1', 'f2'], 'droite')).pointilles).toEqual([6, 2]);
  });

  it('une forme sans pointilles ne gagne aucun champ en changeant d echelle', () => {
    const f = forme(mettreALEchelle(base(), ['f2'], 2, 2), 1);
    expect(f.epaisseur).toBe(4);
    expect(Object.keys(f)).not.toContain('pointilles');
  });

  it('inserer un dessin dans un autre suit l echelle de l insertion', () => {
    const r = inserer(lire('<path d="M0 0h1v1z"/>'), base(), { x: 0, y: 0, l: 40, h: 40 });
    const f = au(r.dessin.formes, 1);
    expect(f.pointilles).toEqual([12, 4]);
    expect(f.epaisseur).toBe(4);
    expect(f.limiteMitre).toBe(3);
  });

  it('dupliquer et coller gardent le style tel quel', () => {
    const d = base();
    expect(forme(dupliquer(d, ['f1'], 3, 3).dessin, 1)).toMatchObject({ pointilles: [6, 2], bout: 'round' });
    expect(forme(coller(d, [forme(d)], 1, 1).dessin, 2)).toMatchObject({ pointilles: [6, 2], jonction: 'miter' });
  });

  it('combiner prend le style de la plus haute, separer le donne a chaque morceau', () => {
    const d = lire(
      '<path d="M0 0h10v10h-10z" fill="#111" stroke="#000" stroke-dasharray="1 1"/><path d="M20 0h10v10h-10z M40 0h10v10h-10z" fill="#222" stroke="#000" stroke-dasharray="5 2" stroke-linecap="round"/>'
    );
    const c = combiner(d, ['f1', 'f2']);
    expect(forme(c.dessin)).toMatchObject({ pointilles: [5, 2], bout: 'round' });
    const s = separer(c.dessin, c.id ?? '');
    expect(s.dessin.formes.map(f => f.pointilles)).toEqual([[5, 2], [5, 2], [5, 2]]);
  });

  it('regrouper ne reunit pas deux formes dont le trait differe', () => {
    const memes = lire('<path d="M0 0h10v10h-10z" fill="#f00" stroke="#000" stroke-dasharray="4 2"/><path d="M20 0h10v10h-10z" fill="#f00" stroke="#000" stroke-dasharray="4 2"/>');
    expect(regrouper(memes).reunies).toBe(1);
    for (const autre of ['stroke-dasharray="4 3"', 'stroke-dasharray="4 2" stroke-linecap="round"', 'stroke-dasharray="4 2" stroke-linejoin="miter"', 'stroke-dasharray="4 2" stroke-dashoffset="1"', '']) {
      const d = lire('<path d="M0 0h10v10h-10z" fill="#f00" stroke="#000" stroke-dasharray="4 2"/><path d="M20 0h10v10h-10z" fill="#f00" stroke="#000" ' + autre + '/>');
      expect(regrouper(d).reunies, autre).toBe(0);
    }
  });

  it('les booleens donnent au resultat le style de trait de la plus basse, pointilles compris', () => {
    const d = lire(
      '<path d="M0 0h20v20h-20z" fill="#f00" stroke="#000" stroke-dasharray="6 3" stroke-linecap="round" stroke-linejoin="bevel"/>'
      + '<path d="M10 10h20v20h-20z" fill="#00f" stroke="#111" stroke-dasharray="1 1"/>'
    );
    for (const op of ['union', 'soustraction', 'intersection', 'exclusion'] as const) {
      const r = appliquerBooleen(d, ['f1', 'f2'], op);
      expect(r.erreur, op).toBeUndefined();
      expect(forme(r.dessin), op).toMatchObject({ pointilles: [6, 3], bout: 'round', jonction: 'bevel' });
      expect(() => ecrireDessin(r.dessin)).not.toThrow();
    }
  });

  it('la decoupe n ecrit que des contours pleins : ni pointilles, ni bouts, ni jonctions', () => {
    const svg = svgDecoupe(base(), '#ff0000', 0.1);
    expect(svg).not.toMatch(/dasharray|dashoffset|linecap|miterlimit/);
    expect(svg).toContain('stroke-linejoin="round"');
    expect(svg).not.toContain('miter');
  });
});

describe('regler le style du trait', () => {
  const base = () => lire(TRAIT + 'stroke-dasharray="4 2" stroke-dashoffset="1" stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="2"/>');

  it('pose et retire chaque champ ; les valeurs par defaut le retirent', () => {
    const d = base();
    const plein = forme(modifierTrait(d, ['f1'], { pointilles: null }));
    expect(plein.pointilles).toBeUndefined();
    expect(plein.decalagePointilles).toBeUndefined();
    expect(forme(modifierTrait(d, ['f1'], { pointilles: [] })).pointilles).toBeUndefined();
    expect(forme(modifierTrait(d, ['f1'], { pointilles: [0, 0] })).pointilles).toBeUndefined();
    expect(forme(modifierTrait(d, ['f1'], { bout: 'butt' })).bout).toBeUndefined();
    const ronde = forme(modifierTrait(d, ['f1'], { jonction: 'round' }));
    expect(ronde.jonction).toBeUndefined();
    expect(ronde.limiteMitre).toBeUndefined();
    expect(forme(modifierTrait(d, ['f1'], { limiteMitre: 4 })).limiteMitre).toBeUndefined();
    expect(forme(modifierTrait(d, ['f1'], { limiteMitre: 7 })).limiteMitre).toBe(7);
    expect(forme(modifierTrait(d, ['f1'], { decalagePointilles: 0 })).decalagePointilles).toBeUndefined();
  });

  it('normalise le motif, ecarte un motif invalide, et ne touche que les formes choisies', () => {
    const d = lire(TRAIT + '/><path d="M0 5h10" fill="none" stroke="#000"/>');
    const r = modifierTrait(d, ['f1'], { pointilles: [5, 3, 2] });
    expect(forme(r, 0).pointilles).toEqual([5, 3, 2, 5, 3, 2]);
    expect(forme(r, 1).pointilles).toBeUndefined();
    expect(modifierTrait(r, ['f1'], { pointilles: [-1, 2] })).toBe(r);
    expect(modifierTrait(r, ['f1'], { pointilles: [Number.NaN] })).toBe(r);
  });

  it('rend le meme dessin quand rien ne change (l historique s en sert)', () => {
    const d = base();
    expect(modifierTrait(d, ['f1'], { bout: 'round', jonction: 'miter', pointilles: [4, 2] })).toBe(d);
    expect(modifierTrait(d, ['absent'], { bout: 'square' })).toBe(d);
  });

  it('un decalage sans motif n est pas garde', () => {
    const d = lire(TRAIT + '/>');
    expect(forme(modifierTrait(d, ['f1'], { decalagePointilles: 3 })).decalagePointilles).toBeUndefined();
    expect(forme(modifierTrait(d, ['f1'], { pointilles: [4, 2], decalagePointilles: 3 }))).toMatchObject({ pointilles: [4, 2], decalagePointilles: 3 });
  });

  it('normaliserPointilles, genrePointilles, motifDeGenre', () => {
    expect(normaliserPointilles([4])).toEqual([4, 4]);
    expect(normaliserPointilles([4, 2])).toEqual([4, 2]);
    expect(normaliserPointilles([0])).toEqual([]);
    expect(normaliserPointilles([])).toEqual([]);
    expect(normaliserPointilles([1, -1])).toBeNull();
    expect(genrePointilles(undefined)).toBe('plein');
    expect(genrePointilles([3, 3])).toBe('tirets');
    expect(genrePointilles([0, 4])).toBe('pointilles');
    expect(genrePointilles([4, 2])).toBe('mixte');
    expect(genrePointilles([1, 2, 3, 4])).toBe('mixte');
    for (const g of ['tirets', 'pointilles', 'mixte'] as const) expect(genrePointilles(motifDeGenre(g, 2))).toBe(g);
    expect(motifDeGenre('plein', 2)).toEqual([]);
    expect(motifDeGenre('tirets', 0.1)).toEqual([3, 3]);
  });
});

describe('le PDF porte le style du trait', () => {
  const pdf = (corps: string) => texte(ecrirePdf(lire(corps)));

  it('une forme sans style de trait s ecrit comme avant : « w », « 1 j », aucun J, M ni d', () => {
    const p = pdf('<path d="M10 10h20v20z" fill="#336699" stroke="#000" stroke-width="2"/>');
    expect(p).toContain('0 0 0 RG\n2 w\n1 j\n10 90 m');
    expect(p).not.toMatch(/ J\n| M\n| d\n/);
  });

  it('le bout (J), la jonction (j), la limite de pointe (M), les pointilles (d)', () => {
    const p = pdf(TRAIT + 'stroke-linecap="round" stroke-linejoin="miter" stroke-miterlimit="2.5" stroke-dasharray="4 2" stroke-dashoffset="1"/>');
    expect(p).toContain('2 w\n1 J\n0 j\n2.5 M\n[4 2] 1 d\n');
    expect(pdf(TRAIT + 'stroke-linecap="square"/>')).toContain('2 w\n2 J\n1 j\n');
    expect(pdf(TRAIT + 'stroke-linejoin="bevel"/>')).toContain('2 w\n2 j\n');
    expect(pdf(TRAIT + 'stroke-linejoin="miter"/>')).toContain('2 w\n0 j\n4 M\n');
  });

  it('un trait nul ne s ecrit pas, motif compris', () => {
    const p = pdf('<path d="M10 10h20v20z" fill="#336699" stroke="#000" stroke-width="0" stroke-dasharray="4 2"/>');
    expect(p).not.toMatch(/ d\n| j\n| w\n/);
  });

  it('est deterministe', () => {
    const d = lire(TRAIT + 'stroke-dasharray="4 2"/>');
    expect(ecrirePdf(d)).toEqual(ecrirePdf(d));
  });
});

describe('la bibliotheque entiere', () => {
  it('n utilise aucune de ces proprietes : ses octets ecrits ne bougent pas', () => {
    const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };
    const entrees = construireBibliotheque(jeu.icons, jeu.width);
    let avecTrait = 0, racinePeinte = 0, ignores = 0;
    for (const e of entrees) {
      const r = lireDessin(e.svg);
      if ('erreur' in r) throw new Error(e.id + ' : ' + r.erreur);
      if (r.dessin.formes.some(f => f.pointilles || f.bout || f.jonction || f.limiteMitre !== undefined || f.decalagePointilles !== undefined)) avecTrait++;
      if (/<svg[^>]*\s(fill|stroke|color|opacity|style)=/.test(e.svg)) racinePeinte++;
      if (r.ignores.length) ignores++;
    }
    expect({ avecTrait, racinePeinte, ignores }).toEqual({ avecTrait: 0, racinePeinte: 0, ignores: 0 });
  });
});
