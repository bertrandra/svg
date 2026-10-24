// Les clones <use> lus pour de bon (troisieme lot de l'ADR-0009, version majeure) : `href` et `xlink:href`, x et y puis
// transform, heritage du <use> (et non du parent d'origine de la cible), <symbol> avec viewBox et
// preserveAspectRatio, clones emboites, profondeur bornee, cycle refuse, href externe refuse, cible
// introuvable dite. Chaque clone donne des formes independantes, aux identifiants neufs : le dessin reste a plat.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { boiteChemin, lireDessin, type DessinSvg, type Forme, type LectureDessin } from '../../../src/engine/editionSvg.js';
import { lireAspect, lireVue, matriceCadre } from '../../../src/engine/edition/clones.js';
import { au } from '../../../src/util/tableaux.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

const enveloppe = (corps: string, entete = '') => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"' + entete + '>' + corps + '</svg>';
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
const erreurDe = (corps: string, entete = ''): string => { const r = lecture(corps, entete); return 'erreur' in r ? r.erreur : ''; };
const boite = (f: Forme) => {
  const b = boiteChemin(f.d);
  if (!b) throw new Error('forme vide');
  return { x: b.x, y: b.y, l: b.l, h: b.h };
};
const proche = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const R = '<rect id="r" width="5" height="4"/>';

describe('un clone est une forme de plus, au bon endroit', () => {
  it('x et y translatent la cible', () => {
    const b = boite(au(lire('<defs>' + R + '</defs><use href="#r" x="10" y="20"/>').formes, 0));
    expect(b).toEqual({ x: 10, y: 20, l: 5, h: 4 });
  });

  it('x et y sont appliques AVANT le transform du <use> (le transform englobe la translation)', () => {
    const b = boite(au(lire('<defs>' + R + '</defs><use href="#r" x="10" y="0" transform="scale(2)"/>').formes, 0));
    expect(b).toEqual({ x: 20, y: 0, l: 10, h: 8 });
    const c = boite(au(lire('<defs>' + R + '</defs><use href="#r" x="10" y="0" transform="translate(3 0) rotate(90)"/>').formes, 0));
    proche(c.x, 3 - 4); proche(c.y, 10); proche(c.l, 4); proche(c.h, 5);
  });

  it('un <use> equivaut au meme groupe ecrit a la main', () => {
    const avec = lire('<defs><path id="p" d="M0 0l8 0 0 3z" stroke="#123456"/></defs><use href="#p" x="7" y="2" transform="rotate(30)" fill="#abcdef"/>');
    const sans = lire('<g transform="rotate(30)" fill="#abcdef"><path transform="translate(7 2)" d="M0 0l8 0 0 3z" stroke="#123456"/></g>');
    expect(avec).toEqual(sans);
  });

  it('xlink:href se lit, href l emporte quand les deux sont la', () => {
    expect(lire('<defs>' + R + '</defs><use xlink:href="#r" x="1"/>').formes).toHaveLength(1);
    const b = boite(au(lire('<defs>' + R + '<rect id="s" width="9" height="9"/></defs><use href="#s" xlink:href="#r"/>').formes, 0));
    expect(b.l).toBe(9);
  });

  it('chaque clone a des formes independantes, aux identifiants neufs, dans l ordre du document', () => {
    const d = lire('<defs><g id="g"><rect width="2" height="2"/><rect x="3" width="2" height="2"/></g></defs><circle r="2"/><use href="#g"/><use href="#g" x="20"/>');
    expect(d.formes.map(f => f.id)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    const [, a, , c] = d.formes;
    expect(a && c && a.d !== c.d).toBe(true);
    expect(boite(au(d.formes, 3)).x).toBe(20);
  });

  it('la cible peut etre une forme, un groupe, un symbole, hors ou dans defs, et se trouver apres son usage', () => {
    const d = lire('<use href="#plus-loin"/><g><rect id="plus-loin" width="3" height="3"/></g>');
    expect(d.formes).toHaveLength(2);
  });

  it('un identifiant en double : le premier du document est la cible', () => {
    const b = boite(au(lire('<rect id="d" width="2" height="2"/><rect id="d" width="9" height="9"/><use href="#d" x="20"/>').formes, 2));
    expect(b.l).toBe(2);
  });

  it('un href avec un identifiant encode', () => {
    expect(lire('<defs><rect id="a b" width="3" height="3"/></defs><use href="#a%20b"/>').formes).toHaveLength(1);
  });
});

describe('le clone herite du <use>, pas du parent d origine de sa cible', () => {
  it('la cible sans peinture prend celle du <use>, quel que soit le groupe ou elle a ete ecrite', () => {
    const d = lire('<g fill="#ff0000"><rect id="r" width="3" height="3"/></g><g fill="#00ff00"><use href="#r" x="10"/></g>');
    expect(d.formes.map(f => f.remplissage)).toEqual(['#ff0000', '#00ff00']);
  });

  it('la peinture propre de la cible l emporte sur celle du <use>', () => {
    const d = lire('<defs><rect id="r" width="3" height="3" fill="#112233"/></defs><use href="#r" fill="#ff0000"/>');
    expect(au(d.formes, 0).remplissage).toBe('#112233');
  });

  it('le style du <use> (couleur, trait, opacite) se transmet ; currentColor suit la couleur du <use>', () => {
    const d = lire('<defs><rect id="r" width="3" height="3" fill="currentColor"/></defs><use href="#r" color="#445566" stroke="#010203" stroke-width="3" opacity=".5"/>');
    expect(au(d.formes, 0)).toMatchObject({ remplissage: '#445566', contour: '#010203', epaisseur: 3, opacite: 0.5 });
  });

  it('l opacite du <use> et celle de la cible se composent', () => {
    const d = lire('<defs><rect id="r" width="3" height="3" opacity=".5"/></defs><use href="#r" opacity=".5"/>');
    expect(au(d.formes, 0).opacite).toBe(0.25);
  });

  it('l echelle du <use> emporte l epaisseur du trait', () => {
    const d = lire('<defs><rect id="r" width="3" height="3" fill="none" stroke="#000" stroke-width="2"/></defs><use href="#r" transform="scale(3)"/>');
    expect(au(d.formes, 0).epaisseur).toBe(6);
  });

  it('display:none et visibility:hidden sur le <use>', () => {
    expect(() => lire('<defs>' + R + '</defs><use href="#r" display="none"/>')).toThrow('aucune forme');
    expect(() => lire('<defs>' + R + '</defs><use href="#r" visibility="hidden"/>')).toThrow('aucune forme');
    expect(lire('<defs>' + R + '</defs><use href="#r" visibility="hidden"/><rect width="1" height="1"/>').formes).toHaveLength(1);
  });

  it('un masque, une decoupe ou un filtre sur le <use> refuse le SVG comme ailleurs', () => {
    expect(erreurDe('<defs>' + R + '</defs><use href="#r" filter="url(#f)"/>')).toContain('un filtre');
    expect(erreurDe('<defs>' + R + '</defs><use href="#r" clip-path="url(#c)"/>')).toContain('un masque ou une découpe');
  });

  it('les regles de la feuille visent l element d origine (ses ancetres d origine comptent), l heritage vient du <use>', () => {
    const d = lire('<style>defs .a path { stroke: #0000ff } .b { fill: #ff0000 }</style><defs><g class="a"><path id="p" d="M0 0h5v5z"/></g></defs><g class="b"><use href="#p"/></g>');
    expect(au(d.formes, 0)).toMatchObject({ contour: '#0000ff', remplissage: '#ff0000' });
  });
});

describe('les clones emboites', () => {
  it('une cible qui contient des <use>', () => {
    const d = lire('<defs>' + R + '<g id="a"><use href="#r"/><use href="#r" x="10"/></g><g id="b"><use href="#a"/><use href="#a" y="10"/></g></defs><use href="#b" x="50"/>');
    expect(d.formes.map(f => boite(f).x)).toEqual([50, 60, 50, 60]);
    expect(d.formes.map(f => boite(f).y)).toEqual([0, 0, 10, 10]);
  });

  it('un <use> qui vise un <use>', () => {
    const d = lire('<defs>' + R + '<use id="u" href="#r" x="3"/></defs><use href="#u" x="10"/>');
    expect(boite(au(d.formes, 0)).x).toBe(13);
  });

  it('seize niveaux passent, dix-sept sont refuses', () => {
    const chaine = (n: number) => '<defs>' + R + Array.from({ length: n - 1 }, (_, i) => '<use id="u' + (i + 1) + '" href="#' + (i === 0 ? 'r' : 'u' + i) + '" x="1"/>').join('') + '</defs><use href="#' + (n === 1 ? 'r' : 'u' + (n - 1)) + '" x="1"/>';
    const seize = lire(chaine(16));
    expect(boite(au(seize.formes, 0)).x).toBe(16);
    expect(erreurDe(chaine(17))).toContain('emboîtés sur plus de 16 niveaux');
  });

  it('une bombe de clones est refusee avant d avoir gele la page', () => {
    let defs = '<rect id="n0" width="1" height="1"/>';
    for (let i = 1; i <= 8; i++) defs += '<g id="n' + i + '">' + ('<use href="#n' + (i - 1) + '"/>').repeat(10) + '</g>';
    const t0 = Date.now();
    expect(erreurDe('<defs>' + defs + '</defs><use href="#n8"/>')).toContain('des clones <use> trop nombreux (plus de 20000 clones et formes de clones)');
    expect(Date.now() - t0).toBeLessThan(5000);
    // meme quand rien ne se dessine au bout : la borne compte aussi les <use> deplies
    const cache = defs.replace('<rect id="n0" width="1" height="1"/>', '<rect id="n0" width="1" height="1" display="none"/>');
    expect(erreurDe('<defs>' + cache + '</defs><use href="#n8"/>' + R)).toContain('trop nombreux');
  });
});

describe('les cycles, les cibles qui manquent, les cibles d ailleurs', () => {
  it('un <use> qui se vise lui-meme, ou un groupe qui se contient', () => {
    expect(erreurDe(R + '<use id="u" href="#u"/>')).toContain('un cycle de clones <use>');
    expect(erreurDe('<g id="g">' + R + '<use href="#g"/></g>')).toContain('un cycle de clones <use> (« #g » se contient lui-même)');
  });

  it('un cycle a plusieurs : a, b, a', () => {
    const e = erreurDe('<defs><g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g></defs><use href="#a"/>' + R);
    expect(e).toContain('un cycle de clones <use>');
    expect(e).toContain('il ne s’édite pas ici');
  });

  it('un cycle que rien n atteint ne gene personne', () => {
    const d = lire('<defs><g id="a"><use href="#a"/></g></defs>' + R);
    expect(d.formes).toHaveLength(1);
  });

  it('le meme clone utilise deux fois n est pas un cycle', () => {
    expect(lire('<defs>' + R + '<g id="g"><use href="#r"/><use href="#r" x="9"/></g></defs><use href="#g"/><use href="#g" y="9"/>').formes).toHaveLength(4);
  });

  it('un href vers un fichier, une adresse ou une donnee en ligne refuse le SVG en le disant', () => {
    expect(erreurDe(R + '<use href="sprite.svg#etoile"/>')).toContain('un clone <use> vers un fichier ou une adresse extérieurs (« sprite.svg#etoile »)');
    expect(erreurDe(R + '<use xlink:href="https://exemple.org/s.svg#a"/>')).toContain('extérieurs');
    expect(erreurDe(R + '<use href="data:image/svg+xml;utf8,%3Csvg/%3E#a"/>')).toContain('extérieurs');
    expect(erreurDe(R + '<use href="#"/>')).toBe('');
  });

  it('un renvoi que le nettoyage a retire (data-href-externe) reste un renvoi externe, pas une cible introuvable', () => {
    expect(erreurDe(R + '<use data-href-externe="sprite.svg#etoile"/>')).toContain('(« sprite.svg#etoile »)');
    // Un href local gagne : l attribut n est qu un reste.
    expect(erreurDe('<defs>' + R + '</defs><use href="#r" data-href-externe="x.svg#a"/>')).toBe('');
    // Bout en bout, comme la page : nettoyer d abord, lire ensuite.
    const propre = nettoyerSvg(enveloppe(R + '<use xlink:href="https://exemple.org/s.svg#a"/>'));
    const r = lireDessin(propre?.svg ?? '');
    expect('erreur' in r && r.erreur).toContain('un clone <use> vers un fichier ou une adresse extérieurs (« https://exemple.org/s.svg#a »)');
  });

  it('une cible introuvable, un href vide ou absent : rien ne se dessine, comme dans un navigateur, et c est dit', () => {
    const msg = 'les clones <use> dont la cible n’existe pas (ils ne dessinent rien, comme dans un navigateur)';
    expect(ignoresDe(R + '<use href="#fantome"/>')).toEqual([msg]);
    expect(ignoresDe(R + '<use href=""/>')).toEqual([msg]);
    expect(ignoresDe(R + '<use/>')).toEqual([msg]);
    expect(ignoresDe(R + '<defs><g id="a"><use href="#fantome"/></g></defs><use href="#a"/><use href="#autre"/>')).toEqual([msg]);
    expect(lire(R + '<use href="#fantome"/>').formes).toHaveLength(1);
  });

  it('seules les cibles lues le sont : un degrade ou un texte vise refuse, une definition inerte ne dessine rien', () => {
    expect(erreurDe('<defs><text id="t">A</text></defs><use href="#t"/>' + R)).toContain('du texte');
    expect(erreurDe('<defs><svg id="s"><rect width="1" height="1"/></svg></defs><use href="#s"/>' + R)).toContain('un SVG imbriqué');
    expect(lire('<defs><linearGradient id="g"/></defs><use href="#g"/>' + R).formes).toHaveLength(1);
  });

  it('une longueur de <use> dans une autre unite est refusee, en pourcentage elle se calcule', () => {
    expect(erreurDe(R + '<use href="#r" x="2mm"/>')).toContain('n’est ni un nombre, ni des pixels, ni un pourcentage');
    const b = boite(au(lire('<defs>' + R + '</defs><use href="#r" x="10%" y="5px"/>').formes, 0));
    expect(b).toMatchObject({ x: 10, y: 5 });
  });

  it('les fixtures refusees', () => {
    const lis = (nom: string) => lireDessin(readFileSync(resolve(__dirname, '../../fixtures/refuses', nom), 'utf8'));
    const cycle = lis('use-cycle.svg'), externe = lis('use-externe.svg');
    expect('erreur' in cycle && cycle.erreur).toContain('un cycle de clones <use>');
    expect('erreur' in externe && externe.erreur).toContain('(« sprite.svg#etoile »)');
  });
});

describe('un <symbol> s ouvre dans le cadre de son <use>', () => {
  const vue = (corps: string, use: string, symbole = '') => boite(au(lire('<defs><symbol id="s" viewBox="0 0 10 20"' + symbole + '>' + corps + '</symbol></defs>' + use).formes, 0));
  const plein = '<rect width="10" height="20"/>';

  it('meet par defaut : tout le viewBox se voit, centre', () => {
    const b = vue(plein, '<use href="#s" x="5" y="5" width="40" height="40"/>');
    expect(b).toEqual({ x: 15, y: 5, l: 20, h: 40 });
  });

  it('les neuf alignements de meet', () => {
    const at = (a: string) => vue(plein, '<use href="#s" x="0" y="0" width="40" height="40"/>', ' preserveAspectRatio="' + a + '"');
    expect(at('xMinYMin').x).toBe(0);
    expect(at('xMidYMid').x).toBe(10);
    expect(at('xMaxYMax').x).toBe(20);
    expect(at('xMinYMid meet').x).toBe(0);
    expect(at('xMaxYMin').x).toBe(20);
    const large = (a: string) => boite(au(lire('<defs><symbol id="s" viewBox="0 0 20 10" preserveAspectRatio="' + a + '"><rect width="20" height="10"/></symbol></defs><use href="#s" width="40" height="40"/>').formes, 0));
    expect(large('xMidYMin').y).toBe(0);
    expect(large('xMidYMid').y).toBe(10);
    expect(large('xMidYMax').y).toBe(20);
  });

  it('slice remplit le cadre et deborde de l autre cote, place par l alignement', () => {
    const b = vue(plein, '<use href="#s" x="0" y="0" width="40" height="40"/>', ' preserveAspectRatio="xMaxYMin slice"');
    // echelle 4 : le contenu fait 40 x 80, aligne en haut a droite
    expect(b).toEqual({ x: 0, y: 0, l: 40, h: 80 });
    const c = vue(plein, '<use href="#s" x="0" y="0" width="40" height="40"/>', ' preserveAspectRatio="xMidYMid slice"');
    expect(c).toEqual({ x: 0, y: -20, l: 40, h: 80 });
  });

  it('none etire sans garder les proportions', () => {
    const b = vue(plein, '<use href="#s" x="2" y="3" width="30" height="10"/>', ' preserveAspectRatio="none"');
    expect(b).toEqual({ x: 2, y: 3, l: 30, h: 10 });
  });

  it('un viewBox qui ne commence pas a zero', () => {
    const b = boite(au(lire('<defs><symbol id="s" viewBox="-5 -5 10 10"><rect x="-5" y="-5" width="10" height="10"/></symbol></defs><use href="#s" x="10" y="10" width="20" height="20"/>').formes, 0));
    expect(b).toEqual({ x: 10, y: 10, l: 20, h: 20 });
  });

  it('sans largeur ni hauteur, le cadre est tout le plan (100 %)', () => {
    const b = vue(plein, '<use href="#s"/>');
    expect(b).toEqual({ x: 25, y: 0, l: 50, h: 100 });
  });

  it('sans viewBox : une translation au coin du cadre, sans echelle', () => {
    const b = boite(au(lire('<defs><symbol id="s"><rect width="6" height="6"/></symbol></defs><use href="#s" x="7" y="9" width="50" height="50"/>').formes, 0));
    expect(b).toEqual({ x: 7, y: 9, l: 6, h: 6 });
  });

  it('largeur ou hauteur nulle, viewBox vide : le symbole ne dessine rien (et un viewBox illisible est ignore)', () => {
    expect(() => lire('<defs><symbol id="s" viewBox="0 0 10 10">' + plein + '</symbol></defs><use href="#s" width="0" height="10"/>')).toThrow('aucune forme');
    expect(() => lire('<defs><symbol id="s" viewBox="0 0 0 10">' + plein + '</symbol></defs><use href="#s"/>')).toThrow('aucune forme');
    expect(lire('<defs><symbol id="s" viewBox="oups">' + plein + '</symbol></defs><use href="#s" x="4"/>').formes).toHaveLength(1);
  });

  it('un symbole porte aussi sa peinture et son opacite, que le <use> peut ne pas avoir', () => {
    const d = lire('<defs><symbol id="s" viewBox="0 0 10 10" fill="#336699" opacity=".5"><rect width="10" height="10"/></symbol></defs><use href="#s" width="10" height="10"/>');
    expect(au(d.formes, 0)).toMatchObject({ remplissage: '#336699', opacite: 0.5 });
  });

  it('le cadre qui rogne : dit quand le contenu deborde, tu sinon, tu aussi avec overflow visible', () => {
    const msg = 'le rognage au cadre d’un <symbol> (ce qui dépasse du cadre reste dessiné)';
    const debord = '<rect width="10" height="30"/>';
    expect(ignoresDe('<defs><symbol id="s" viewBox="0 0 10 20">' + debord + '</symbol></defs><use href="#s" width="10" height="20"/>')).toEqual([msg]);
    expect(ignoresDe('<defs><symbol id="s" viewBox="0 0 10 20">' + plein + '</symbol></defs><use href="#s" width="10" height="20"/>')).toEqual([]);
    expect(ignoresDe('<defs><symbol id="s" viewBox="0 0 10 20" overflow="visible">' + debord + '</symbol></defs><use href="#s" width="10" height="20"/>')).toEqual([]);
    expect(ignoresDe('<defs><symbol id="s" viewBox="0 0 10 20" style="overflow:visible">' + debord + '</symbol></defs><use href="#s" width="10" height="20"/>')).toEqual([]);
    // slice rogne par construction : un contenu plus grand que le cadre est dit
    expect(ignoresDe('<defs><symbol id="s" viewBox="0 0 10 20" preserveAspectRatio="xMidYMid slice">' + plein + '</symbol></defs><use href="#s" width="40" height="40"/>')).toEqual([msg]);
    // le trait compte : un contour qui sort du cadre, meme si le chemin y tient
    expect(ignoresDe('<defs><symbol id="s" viewBox="0 0 10 20"><rect width="10" height="20" fill="none" stroke="#000" stroke-width="2"/></symbol></defs><use href="#s" width="10" height="20"/>')).toEqual([msg]);
  });
});

describe('la lecture du cadre, directement', () => {
  it('lireAspect : defaut, defer, valeurs illisibles', () => {
    expect(lireAspect(undefined)).toEqual({ alignement: [0.5, 0.5], tranche: false });
    expect(lireAspect('defer xMinYMax slice')).toEqual({ alignement: [0, 1], tranche: true });
    expect(lireAspect('none slice')).toEqual({ alignement: null, tranche: true });
    expect(lireAspect('xMaxYMid meet')).toEqual({ alignement: [1, 0.5], tranche: false });
    expect(lireAspect('xMidYMid zoom')).toEqual({ alignement: [0.5, 0.5], tranche: false });
    expect(lireAspect('centre')).toEqual({ alignement: [0.5, 0.5], tranche: false });
  });

  it('lireVue : quatre nombres, virgules permises ; negatif illisible, nul vide', () => {
    expect(lireVue('0,0,24,24')).toEqual([0, 0, 24, 24]);
    expect(lireVue('0 0 -1 5')).toBeNull();
    expect(lireVue('0 0 0 5')).toBe('vide');
    expect(lireVue('0 0 5')).toBeNull();
    expect(lireVue(undefined)).toBeNull();
  });

  it('matriceCadre : echelle uniforme, translation de l alignement', () => {
    expect(matriceCadre([0, 0, 10, 20], { x: 5, y: 5, l: 40, h: 40 }, lireAspect(undefined))).toEqual([2, 0, 0, 2, 15, 5]);
    expect(matriceCadre(null, { x: 5, y: 6, l: 40, h: 40 }, lireAspect(undefined))).toEqual([1, 0, 0, 1, 5, 6]);
  });
});

describe('une planche d icones lue comme un navigateur la dessine', () => {
  it('la fixture « planche » : sept formes, une par <use> (le duo en donne deux)', () => {
    const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg/lecture-use-sprite.svg'), 'utf8'));
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes).toHaveLength(7);
    expect(r.ignores).toEqual([]);
    expect(new Set(r.dessin.formes.map(f => f.id)).size).toBe(7);
  });

  it('la fixture « symboles » dit le rognage de son symbole en tranche', () => {
    const r = lireDessin(readFileSync(resolve(__dirname, '../../fixtures/svg/lecture-use-symbole.svg'), 'utf8'));
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.ignores).toEqual(['le rognage au cadre d’un <symbol> (ce qui dépasse du cadre reste dessiné)']);
  });
});

describe('la bibliotheque ne depend d aucune de ces lectures', () => {
  it('chacune de ses 4 134 formes est un <path fill d> : ni <use>, ni feuille de style, ni classe, ni style en ligne', () => {
    const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { icons: Record<string, { body: string }> };
    const corps = Object.values(jeu.icons).map(i => i.body);
    expect(corps).toHaveLength(4134);
    const balises = new Set(corps.flatMap(b => [...b.matchAll(/<([a-zA-Z]+)/g)].map(m => m[1])));
    expect([...balises]).toEqual(['path']);
    const attributs = new Set(corps.flatMap(b => [...b.matchAll(/\s([a-zA-Z:-]+)=/g)].map(m => m[1])));
    expect([...attributs].sort()).toEqual(['d', 'fill']);
  });
});
