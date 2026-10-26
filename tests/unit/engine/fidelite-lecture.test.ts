// La fidelite de la lecture du SVG (version majeure) : une epaisseur nulle reste nulle, l'alpha des
// couleurs est garde, les 148 noms CSS se ramenent a #rrggbb, et ce que la lecture laisse tomber est dit.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appliquerBooleen } from '../../../src/engine/booleens.js';
import {
  combiner, coller, deplacer, dupliquer, ecrireDessin, fusionnerCouleursProches, lireDessin, lirePeinture, lirePeintureAlpha, modifier, opaciteDuContour, opaciteDuRemplissage,
  regrouper, remplacerCouleur, remplacerCouleurSur, separer, transformer, translation, type DessinSvg, type LectureDessin
} from '../../../src/engine/editionSvg.js';
import { construireBibliotheque, type IconeSource } from '../../../src/model/bibliotheque.js';
import { au } from '../../../src/util/tableaux.js';
import { ecrirePdf, svgDecoupe } from '../export/plats.js';

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
const forme = (d: DessinSvg, i: number) => au(d.formes, i);
const texte = (octets: Uint8Array) => Array.from(octets, c => String.fromCharCode(c)).join('');

describe('stroke-width="0"', () => {
  it('se lit zero : un trait invisible ne devient pas visible', () => {
    const f = forme(lire('<path d="M0 0h10v10z" fill="#f4efe6" stroke="#15181d" stroke-width="0"/>'), 0);
    expect(f.contour).toBe('#15181d');
    expect(f.epaisseur).toBe(0);
  });

  it('s ecrit zero, et ne bouge plus a la relecture', () => {
    const d = lire('<path d="M0 0h10v10z" fill="#f4efe6" stroke="#15181d" stroke-width="0"/>');
    const svg = ecrireDessin(d);
    expect(svg).toContain('stroke-width="0"');
    expect(svg).not.toContain('stroke-width="1"');
    expect(ecrireDessin(lire(svg.slice(svg.indexOf('<path'), svg.lastIndexOf('</svg>'))))).toBe(svg);
  });

  it('se transmet par un groupe, et la mise a l echelle la laisse a zero', () => {
    const d = lire('<g stroke="#000" stroke-width="0" transform="scale(3)"><path d="M0 0h10v10z"/></g>');
    expect(forme(d, 0).epaisseur).toBe(0);
  });

  it('une valeur absente, illisible ou negative reste 1, comme dans un navigateur', () => {
    const d = lire(
      '<path d="M0 0h1v1z" stroke="#000"/><path d="M0 0h1v1z" stroke="#000" stroke-width="abc"/><path d="M0 0h1v1z" stroke="#000" stroke-width="-2"/><path d="M0 0h1v1z" stroke="#000" stroke-width="0.5"/>'
    );
    expect(d.formes.map(f => f.epaisseur)).toEqual([1, 1, 1, 0.5]);
  });

  it('un contour de largeur nulle ne se trace pas dans le PDF (« 0 w » y est un filet)', () => {
    const pdf = texte(ecrirePdf(lire('<path d="M10 10h20v20z" fill="#336699" stroke="#000" stroke-width="0"/>')));
    expect(pdf).not.toMatch(/ w\n/);
    expect(pdf).not.toContain(' RG');
    expect(pdf).toMatch(/\nf\nQ/);
  });

  it('l editeur ne le casse pas : recolorer le trait, ou regler autre chose, garde zero', () => {
    const d = lire('<path d="M0 0h10v10z" fill="#f4efe6" stroke="#15181d" stroke-width="0"/>');
    expect(forme(remplacerCouleur(d, '#15181d', '#ff0000'), 0)).toMatchObject({ contour: '#ff0000', epaisseur: 0 });
    expect(forme(remplacerCouleurSur(d, '#15181d', '#ff0000', 'contour'), 0)).toMatchObject({ contour: '#ff0000', epaisseur: 0 });
    expect(forme(modifier(d, ['f1'], { contour: '#00ff00' }), 0).epaisseur).toBe(0);
    expect(forme(modifier(d, ['f1'], { opacite: 0.5 }), 0).epaisseur).toBe(0);
  });

  it('l utilisateur peut regler zero sur un trait existant, et lui rendre une epaisseur', () => {
    const d = lire('<path d="M0 0h10v10z" fill="#f4efe6" stroke="#15181d" stroke-width="2"/>');
    const zero = modifier(d, ['f1'], { epaisseur: 0 });
    expect(forme(zero, 0).epaisseur).toBe(0);
    expect(forme(modifier(zero, ['f1'], { epaisseur: 3 }), 0).epaisseur).toBe(3);
  });

  it('un trait qui apparait, lui, prend une epaisseur visible', () => {
    const d = lire('<path d="M0 0h10v10z" fill="#f4efe6"/>');
    expect(forme(modifier(d, ['f1'], { contour: '#000000' }), 0).epaisseur).toBe(1);
    expect(forme(modifier(d, ['f1'], { contour: '#000000', epaisseur: 0 }), 0).epaisseur).toBe(1);
  });
});

describe('lirePeintureAlpha', () => {
  it.each([
    ['rgba(0, 128, 255, 0.5)', '#0080ff', 0.5],
    ['rgba(0,128,255,50%)', '#0080ff', 0.5],
    ['rgb(0 128 255 / 40%)', '#0080ff', 0.4],
    ['rgb(0 128 255 / 0.25)', '#0080ff', 0.25],
    ['rgb(10%, 20%, 30%)', '#1a334d', 1],
    ['RGBA(255, 0, 0, 2)', '#ff0000', 1],
    ['rgba(255, 0, 0, 0)', '#ff0000', 0],
    ['hsla(120, 100%, 25%, 0.25)', '#008000', 0.25],
    ['hsl(210 50% 40%)', '#336699', 1],
    ['hsl(0.5turn 100% 50% / 50%)', '#00ffff', 0.5],
    ['hsl(-120 100% 50%)', '#0000ff', 1],
    ['#ff000080', '#ff0000', 0.502],
    ['#F00A', '#ff0000', 0.667],
    ['#abc', '#aabbcc', 1],
    ['#aabbcc', '#aabbcc', 1],
    ['#11223344', '#112233', 0.267],
    ['steelblue', '#4682b4', 1],
    ['CornflowerBlue', '#6495ed', 1]
  ])('%s se lit %s, alpha %f', (entree, couleur, alpha) => {
    expect(lirePeintureAlpha(entree)).toEqual({ couleur, alpha });
  });

  it('garde les cas documentes : none, transparent, currentColor, et ce qu on ne sait pas lire', () => {
    expect(lirePeinture('none')).toBeNull();
    expect(lirePeinture('transparent')).toBeNull();
    expect(lirePeinture('currentColor')).toBe('#000000');
    expect(lirePeinture('url(#G)')).toBe('url(#g)');
    expect(lirePeinture('inconnue')).toBe('inconnue');
    expect(lirePeinture('rgb(a, b, c)')).toBe('rgb(a, b, c)');
  });
});

describe('l alpha des couleurs', () => {
  it('sans trait, il se range dans l opacite de la forme et se multiplie a opacity et fill-opacity', () => {
    const d = lire('<g opacity="0.5"><path d="M0 0h1v1z" fill="rgba(0,0,0,0.5)" fill-opacity="0.8" opacity="0.5"/></g>');
    expect(forme(d, 0).opacite).toBe(0.1);
    expect(forme(d, 0).opaciteRemplissage).toBeUndefined();
  });

  it('avec un trait, le fond et le trait gardent chacun le leur, sans estomper l autre', () => {
    const d = lire('<path d="M0 0h1v1z" fill="rgba(200,30,40,0.5)" fill-opacity="0.5" stroke="rgba(0,0,0,0.5)" stroke-opacity="0.4" stroke-width="2" opacity="0.9"/>');
    const f = forme(d, 0);
    expect(f.opacite).toBe(0.9);
    expect(f.opaciteRemplissage).toBe(0.25);
    expect(f.opaciteContour).toBe(0.2);
    expect(ecrireDessin(d)).toContain('fill-opacity="0.25"');
    expect(ecrireDessin(d)).toContain('stroke-opacity="0.2"');
    expect(ecrireDessin(d)).toContain('opacity="0.9"');
  });

  it('fill-opacity n estompe plus le trait (avant, il l estompait aussi)', () => {
    const f = forme(lire('<path d="M0 0h1v1z" fill="#000" fill-opacity="0.3" stroke="#f00"/>'), 0);
    expect(f.opacite).toBe(1);
    expect(f.opaciteRemplissage).toBe(0.3);
    expect(opaciteDuContour(f)).toBe(1);
  });

  it('s herite par les groupes comme fill-opacity et stroke-opacity', () => {
    const f = forme(lire('<g fill-opacity="0.5" stroke-opacity="0.25" stroke="#000"><path d="M0 0h1v1z" fill="#f00"/></g>'), 0);
    expect(f.opaciteRemplissage).toBe(0.5);
    expect(f.opaciteContour).toBe(0.25);
  });

  it('une forme sans alpha n a aucun champ en plus et s ecrit comme avant', () => {
    const f = forme(lire('<path d="M0 0h1v1z" fill="#f00" stroke="#000"/>'), 0);
    expect(Object.keys(f).sort()).toEqual(['contour', 'd', 'epaisseur', 'id', 'opacite', 'regle', 'remplissage', 'verrouille', 'visible']);
    expect(ecrireDessin(lire('<path d="M0 0h1v1z" fill="#f00" stroke="#000"/>'))).not.toMatch(/opacity/);
  });

  it('une valeur d opacite en pourcentage se lit, une valeur illisible laisse l opacite pleine', () => {
    expect(forme(lire('<path d="M0 0h1v1z" opacity="50%"/>'), 0).opacite).toBe(0.5);
    expect(forme(lire('<path d="M0 0h1v1z" opacity="abc"/>'), 0).opacite).toBe(1);
    expect(forme(lire('<path d="M0 0h1v1z" opacity="0"/>'), 0).opacite).toBe(0);
  });

  it('un fond sans trait s ecrit en opacity, que l alpha vienne de la lecture ou de l editeur', () => {
    const lu = lire('<path d="M0 0h10v10z" fill="#ff000080"/>');
    expect(ecrireDessin(lu)).toContain('opacity="0.502"');
    expect(ecrireDessin(lu)).not.toContain('fill-opacity');
    const avecTrait = lire('<path d="M0 0h10v10z" fill="#ff0000" stroke="#000"/>');
    const regle = modifier(avecTrait, ['f1'], { opaciteRemplissage: 0.5 });
    expect(ecrireDessin(regle)).toContain('fill-opacity="0.5"');
    // Retirer le trait : le fond a demi transparent passe dans opacity, le rendu est le meme.
    const sansTrait = modifier(regle, ['f1'], { contour: null });
    expect(ecrireDessin(sansTrait)).toContain('opacity="0.5"');
    expect(ecrireDessin(sansTrait)).not.toContain('fill-opacity');
  });

  describe('les operations le gardent', () => {
    const base = () => lire(
      '<path d="M0 0h10v10h-10z" fill="rgba(200,30,40,0.5)" stroke="rgba(0,0,0,0.25)" stroke-width="2"/>'
      + '<path d="M20 0h10v10h-10z" fill="#1428a0" stroke="#000" stroke-width="2"/>'
    );
    const alphas = (d: DessinSvg) => d.formes.map(f => [opaciteDuRemplissage(f), opaciteDuContour(f)]);

    it('deplacer, transformer, dupliquer, coller', () => {
      const d = base();
      expect(alphas(deplacer(d, ['f1'], 3, 4))[0]).toEqual([0.5, 0.25]);
      expect(alphas(transformer(d, ['f1'], translation(1, 1)))[0]).toEqual([0.5, 0.25]);
      expect(alphas(dupliquer(d, ['f1'], 5, 5).dessin)).toEqual([[0.5, 0.25], [0.5, 0.25], [1, 1]]);
      expect(alphas(coller(d, [forme(d, 0)], 2, 2).dessin)[2]).toEqual([0.5, 0.25]);
    });

    it('combiner garde le style de la plus haute, separer le donne a chaque morceau', () => {
      const d = lire('<path d="M0 0h10v10h-10z" fill="#111" fill-opacity="0.9" stroke="#000"/><path d="M20 0h10v10h-10z M40 0h10v10h-10z" fill="rgba(0,0,0,0.5)" stroke="#000" stroke-opacity="0.5"/>');
      const c = combiner(d, ['f1', 'f2']);
      expect(c.dessin.formes).toHaveLength(1);
      expect(alphas(c.dessin)[0]).toEqual([0.5, 0.5]);
      const s = separer(c.dessin, c.id ?? '');
      expect(alphas(s.dessin)).toEqual([[0.5, 0.5], [0.5, 0.5], [0.5, 0.5]]);
    });

    it('remplacer une couleur garde l alpha, du fond comme du trait', () => {
      const d = base();
      expect(alphas(remplacerCouleur(d, '#c81e28', '#00ff00'))[0]).toEqual([0.5, 0.25]);
      expect(alphas(remplacerCouleurSur(d, '#000000', '#ff00ff', 'contour'))[0]).toEqual([0.5, 0.25]);
      expect(forme(remplacerCouleur(d, '#c81e28', '#00ff00'), 0).remplissage).toBe('#00ff00');
    });

    it('fusionner les nuances proches garde l alpha de chaque forme', () => {
      const d = lire('<path d="M0 0h10v10h-10z" fill="rgba(200,30,40,0.5)"/><path d="M20 0h10v10h-10z" fill="#c91f29"/>');
      const r = fusionnerCouleursProches(d, 0.05).dessin;
      expect(r.formes.map(f => f.opacite)).toEqual([0.5, 1]);
    });

    it('les booleens gardent le style (alpha compris) de la plus basse', () => {
      const d = lire(
        '<path d="M0 0h20v20h-20z" fill="rgba(200,30,40,0.5)" stroke="rgba(0,0,0,0.25)"/>'
        + '<path d="M10 10h20v20h-20z" fill="#1428a0" stroke="#000"/>'
      );
      const r = appliquerBooleen(d, ['f1', 'f2'], 'union');
      expect(r.erreur).toBeUndefined();
      expect(alphas(r.dessin)).toEqual([[0.5, 0.25]]);
    });

    it('regrouper ne reunit pas deux formes d alpha different, mais reunit deux formes de meme alpha', () => {
      const memes = lire('<path d="M0 0h10v10h-10z" fill="#f00" fill-opacity="0.5" stroke="#000"/><path d="M20 0h10v10h-10z" fill="#f00" fill-opacity="0.5" stroke="#000"/>');
      expect(regrouper(memes).reunies).toBe(1);
      const fonds = lire('<path d="M0 0h10v10h-10z" fill="#f00" fill-opacity="0.5" stroke="#000"/><path d="M20 0h10v10h-10z" fill="#f00" fill-opacity="0.8" stroke="#000"/>');
      expect(regrouper(fonds).reunies).toBe(0);
      const traits = lire('<path d="M0 0h10v10h-10z" fill="#f00" stroke="#000" stroke-opacity="0.5"/><path d="M20 0h10v10h-10z" fill="#f00" stroke="#000"/>');
      expect(regrouper(traits).reunies).toBe(0);
      const couleurs = lire('<path d="M0 0h10v10h-10z" fill="#f00ff080"/><path d="M20 0h10v10h-10z" fill="#f00ff0"/>');
      expect(regrouper(couleurs).reunies).toBe(0);
    });

    it('l export PDF le met dans des etats graphiques distincts pour le fond (ca) et le trait (CA)', () => {
      const pdf = texte(ecrirePdf(lire('<path d="M10 10h20v20z" fill="#336699" fill-opacity="0.5" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>')));
      expect(pdf).toContain('/ca 0.5 /CA 0.25');
    });

    it('l export PDF d une forme sans alpha ne change pas : une seule opacite, ca et CA egaux', () => {
      const pdf = texte(ecrirePdf(lire('<path d="M10 10h20v20z" fill="#336699" stroke="#000" opacity="0.5"/>')));
      expect(pdf).toContain('/ca 0.5 /CA 0.5');
    });

    it('l export de decoupe ne lit aucune peinture : il ecrit son propre trait', () => {
      const svg = svgDecoupe(base(), '#ff0000', 0.1);
      expect(svg).not.toMatch(/opacity/);
      expect(svg).toContain('stroke="#ff0000"');
    });
  });
});

describe('les noms de couleur CSS', () => {
  it('se ramenent a #rrggbb a la lecture, partout ou une peinture se pose', () => {
    const d = lire(
      '<style>.a { fill: Tomato; stroke: darkslategray }</style>'
      + '<path class="a" d="M0 0h1v1z"/>'
      + '<path d="M0 0h1v1z" style="fill:rebeccapurple"/>'
      + '<g fill="lightgoldenrodyellow"><path d="M0 0h1v1z"/></g>'
      + '<path d="M0 0h1v1z" fill="STEELBLUE" stroke="mediumspringgreen"/>'
    );
    expect(d.formes.map(f => [f.remplissage, f.contour])).toEqual([
      ['#ff6347', '#2f4f4f'], ['#663399', null], ['#fafad2', null], ['#4682b4', '#00fa9a']
    ]);
  });

  it('laisse currentColor, transparent, none et inherit comme avant', () => {
    const d = lire('<g fill="#336699" stroke="#000"><path d="M0 0h1v1z" fill="currentColor" stroke="transparent"/><path d="M0 0h1v1z" fill="inherit" stroke="none"/></g>');
    expect(d.formes.map(f => [f.remplissage, f.contour])).toEqual([['#000000', null], ['#336699', null]]);
  });

  it('un nom du prototype n est pas une couleur', () => {
    expect(lirePeinture('constructor')).toBe('constructor');
    expect(lirePeinture('toString')).toBe('tostring');
  });
});

describe('la bibliotheque entiere', () => {
  it('se lit sans rien laisser tomber, sans alpha ni trait nul : ses octets ecrits ne bougent pas', () => {
    const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };
    const entrees = construireBibliotheque(jeu.icons, jeu.width);
    expect(entrees.length).toBeGreaterThan(4000);
    let avecIgnores = 0, avecAlpha = 0, traitNul = 0;
    for (const e of entrees) {
      const r = lireDessin(e.svg);
      if ('erreur' in r) throw new Error(e.id + ' : ' + r.erreur);
      if (r.ignores.length) avecIgnores++;
      if (r.dessin.formes.some(f => f.opaciteRemplissage !== undefined || f.opaciteContour !== undefined)) avecAlpha++;
      if (r.dessin.formes.some(f => f.contour && f.epaisseur === 0)) traitNul++;
    }
    expect({ avecIgnores, avecAlpha, traitNul }).toEqual({ avecIgnores: 0, avecAlpha: 0, traitNul: 0 });
  });
});

describe('ce que la lecture laisse tomber, et dit', () => {
  it('rien pour un SVG simple, ni pour des definitions que nulle forme n utilise', () => {
    expect(ignoresDe('<path d="M0 0h1v1z" fill="#f00" stroke="#000"/>')).toEqual([]);
    expect(ignoresDe('<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient><clipPath id="c"><rect width="5" height="5"/></clipPath><filter id="f"/></defs><path d="M0 0h1v1z"/>')).toEqual([]);
  });

  it('un degrade, un motif, un filtre, une decoupe ou un masque que la forme utilise refuse le SVG en le nommant (rien n est tu)', () => {
    const erreur = (corps: string) => { const r = lecture(corps); return 'erreur' in r ? r.erreur : ''; };
    expect(erreur('<defs><linearGradient id="g"/></defs><path d="M0 0h1v1z" fill="url(#g)"/>')).toContain('un dégradé ou un motif');
    expect(erreur('<path d="M0 0h1v1z" stroke="url(#p)"/>')).toContain('un dégradé ou un motif');
    expect(erreur('<path d="M0 0h1v1z" filter="url(#f)"/>')).toContain('un filtre');
    expect(erreur('<path d="M0 0h1v1z" clip-path="url(#c)"/>')).toContain('un masque ou une découpe');
    expect(erreur('<path d="M0 0h1v1z" mask="url(#m)"/>')).toContain('un masque ou une découpe');
  });

  it('les marqueurs', () => {
    expect(ignoresDe('<path d="M0 0h10v10" fill="none" stroke="#000" marker-end="url(#fleche)"/>')).toEqual(['les marqueurs des traits (pointes de flèche…)']);
    expect(ignoresDe('<path d="M0 0h10v10" marker-end="none"/>')).toEqual([]);
  });

  it('les pointilles, les bouts et les jonctions sont portes par le modele : plus rien a dire (voir fidelite-trait.test.ts)', () => {
    expect(ignoresDe('<path d="M0 0h10" fill="none" stroke="#000" stroke-dasharray="4 2"/>')).toEqual([]);
    expect(ignoresDe('<g stroke="#000" stroke-linecap="round" stroke-linejoin="miter"><path d="M0 0h10" fill="none"/></g>')).toEqual([]);
  });

  it('les regles de style a balise ou identifiant se lisent (troisieme lot) ; ce qui reste hors de portee est dit (voir lecture-css.test.ts)', () => {
    expect(ignoresDe('<style>path { fill: red } .a { fill: blue }</style><path class="a" d="M0 0h1v1z"/>')).toEqual([]);
    expect(ignoresDe('<style>#x { stroke: red }</style><path id="x" d="M0 0h1v1z"/>')).toEqual([]);
    expect(ignoresDe('<style>path:hover { fill: red }</style><path d="M0 0h1v1z"/>')).toEqual(['les règles de style dont le sélecteur porte la pseudo-classe :hover']);
    expect(ignoresDe('<style>text { font-size: 12px } .a { fill: blue }</style><path class="a" d="M0 0h1v1z"/>')).toEqual([]);
  });

  it('la peinture posee sur la balise svg elle-meme se transmet : plus rien a dire. Les animations, si', () => {
    expect(ignoresDe('<path d="M0 0h1v1z"/>', ' fill="none" stroke="currentColor"')).toEqual([]);
    expect(ignoresDe('<path d="M0 0h1v1z"/>', ' width="100" height="100"')).toEqual([]);
    expect(ignoresDe('<path d="M0 0h1v1z"><animate attributeName="fill" values="red;blue" dur="1s"/></path>')).toEqual(['les animations']);
    expect(ignoresDe('<g><animateTransform attributeName="transform" type="rotate" dur="1s"/><path d="M0 0h1v1z"/></g>')).toEqual(['les animations']);
  });

  it('chaque chose n est dite qu une fois, dans l ordre ou elle a ete rencontree', () => {
    const r = ignoresDe('<path d="M0 0h10" stroke="#000" stroke-dasharray="1mm" marker-end="url(#m)"/><path d="M0 5h10" stroke="#000" stroke-dasharray="2%" marker-start="url(#m)"/>');
    expect(r).toEqual(['les pointillés dont une longueur est en pourcentage ou en unité autre que le pixel (le trait s’écrit plein)', 'les marqueurs des traits (pointes de flèche…)']);
  });

  it('un SVG refuse n a pas de liste', () => {
    expect('ignores' in lecture('<text>A</text>')).toBe(false);
  });

  it('lire ne change aucun octet : le SVG ecrit est le meme avec ou sans ce qui est ignore', () => {
    const avec = lire('<path d="M0 0h10" fill="none" stroke="#000" stroke-dasharray="4mm" marker-end="url(#m)"/>');
    const sans = lire('<path d="M0 0h10" fill="none" stroke="#000"/>');
    expect(ecrireDessin(avec)).toBe(ecrireDessin(sans));
  });
});
