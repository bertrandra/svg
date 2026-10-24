// La feuille <style> lue pour de bon (troisieme lot de l'ADR-0009, version majeure) : selecteurs de type, de
// classe, d'identifiant, d'attribut, descendants et enfants, groupes, specificite, ordre, !important, `style`
// en ligne, attributs de presentation ; et tout ce qui reste hors de portee est DIT (jamais tu).

import { describe, it, expect } from 'vitest';
import { lireDessin, type DessinSvg, type LectureDessin } from '../../../src/engine/editionSvg.js';
import { lireListeSelecteurs } from '../../../src/engine/edition/selecteurs.js';
import { lireDeclarations, lireFeuille } from '../../../src/engine/edition/feuille.js';

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
const P = '<path d="M0 0h10v10z"';
/** Les remplissages des formes, dans l'ordre. */
const fonds = (corps: string, entete = ''): Array<string | null> => lire(corps, entete).formes.map(f => f.remplissage);

describe('les selecteurs de la feuille', () => {
  it('un selecteur de type', () => {
    expect(fonds('<style>path { fill: #ff0000 }</style>' + P + '/><circle r="3"/>')).toEqual(['#ff0000', '#000000']);
  });

  it('le selecteur universel vise chaque element, et passe devant l heritage d un groupe', () => {
    expect(fonds('<style>* { fill: #00ff00 }</style><g fill="#0000ff">' + P + '/></g>')).toEqual(['#00ff00']);
  });

  it('un identifiant, plusieurs classes', () => {
    expect(fonds('<style>#a { fill: #111111 } .x.y { fill: #222222 }</style>' + P + ' id="a"/>' + P + ' class="y x"/>' + P + ' class="x"/>')).toEqual(['#111111', '#222222', '#000000']);
  });

  it('les attributs : presence, egalite, mot, prefixe, suffixe, sous-chaine, tiret, casse', () => {
    const css = '[data-k] { fill: #010101 } [data-m="exact"] { fill: #020202 } [class~=mot] { fill: #030303 } '
      + '[id^=deb] { fill: #040404 } [id$=fin] { fill: #050505 } [data-s*=milieu] { fill: #060606 } [lang|=fr] { fill: #070707 } [data-c="ABC" i] { fill: #080808 }';
    const f = (attrs: string) => fonds('<style>' + css + '</style>' + P + ' ' + attrs + '/>')[0];
    expect(f('data-k=""')).toBe('#010101');
    expect(f('data-m="exact"')).toBe('#020202');
    expect(f('data-m="exact2"')).toBe('#000000');
    expect(f('class="a mot b"')).toBe('#030303');
    expect(f('class="motif"')).toBe('#000000');
    expect(f('id="debut"')).toBe('#040404');
    expect(f('id="la-fin"')).toBe('#050505');
    expect(f('data-s="un milieu ici"')).toBe('#060606');
    expect(f('lang="fr-CA"')).toBe('#070707');
    expect(f('lang="frisson"')).toBe('#000000');
    expect(f('data-c="abc"')).toBe('#080808');
  });

  it('descendant et enfant', () => {
    const css = '<style>g path { fill: #aa0000 } g > circle { fill: #00aa00 } svg > path { fill: #0000aa }</style>';
    const corps = css + '<g><g>' + P + '/><circle r="2"/></g><circle r="2"/></g>' + P + '/>';
    // path dans g (descendant lointain) ; circle dans g interne : pas enfant direct de g exterieur mais enfant de g interne.
    expect(fonds(corps)).toEqual(['#aa0000', '#00aa00', '#00aa00', '#0000aa']);
    expect(fonds('<style>g > path { fill: #aa0000 }</style><g><a>' + P + '/></a></g>')).toEqual(['#000000']);
  });

  it('un groupe a virgules : chaque membre garde sa propre specificite', () => {
    // `#z, .c` : l element de classe c a la specificite de .c (0,1,0), pas celle de #z ; `path` (0,0,1) a la meme que `.c`... non, moins.
    const css = '<style>#z, .c { fill: #101010 } .c { fill: #202020 }</style>';
    expect(fonds(css + P + ' class="c"/>')).toEqual(['#202020']);
    expect(fonds(css + P + ' id="z" class="c"/>')).toEqual(['#101010']);
  });

  it(':root, :first-child, :last-child, :only-child', () => {
    const css = '<style>:root { fill: #0a0a0a } path:first-child { stroke: #111111 } path:last-child { opacity: 0.5 } circle:only-child { fill: #333333 }</style>';
    const d = lire(css + '<g>' + P + '/>' + P + '/></g><g><circle r="2"/></g>');
    expect(d.formes.map(f => f.contour)).toEqual(['#111111', null, null]);
    expect(d.formes.map(f => f.opacite)).toEqual([1, 0.5, 1]);
    expect(d.formes[2]?.remplissage).toBe('#333333');
    expect(d.formes[0]?.remplissage).toBe('#0a0a0a');
  });
});

describe('la specificite, l ordre et !important', () => {
  it('l identifiant l emporte sur la classe, la classe sur le type, quel que soit l ordre', () => {
    expect(fonds('<style>#a { fill: #111111 } .b { fill: #222222 } path { fill: #333333 }</style>' + P + ' id="a" class="b"/>')).toEqual(['#111111']);
    expect(fonds('<style>path { fill: #333333 } .b { fill: #222222 } #a { fill: #111111 }</style>' + P + ' id="a" class="b"/>')).toEqual(['#111111']);
    expect(fonds('<style>path { fill: #333333 } .b { fill: #222222 }</style>' + P + ' class="b"/>')).toEqual(['#222222']);
  });

  it('a specificite egale, la derniere regle gagne, et non l ordre des classes de l attribut', () => {
    expect(fonds('<style>.a { fill: #aa0000 } .b { fill: #00bb00 }</style>' + P + ' class="b a"/>')).toEqual(['#00bb00']);
    expect(fonds('<style>.b { fill: #00bb00 }</style><style>.a { fill: #aa0000 }</style>' + P + ' class="a b"/>')).toEqual(['#aa0000']);
  });

  it('une specificite plus forte l emporte meme placee avant : g path (0,0,2) contre .c (0,1,0)', () => {
    expect(fonds('<style>.c { fill: #c0c0c0 } g path { fill: #d0d0d0 }</style><g>' + P + ' class="c"/></g>')).toEqual(['#c0c0c0']);
    expect(fonds('<style>g path.c { fill: #d0d0d0 } .c { fill: #c0c0c0 }</style><g>' + P + ' class="c"/></g>')).toEqual(['#d0d0d0']);
  });

  it('un attribut de presentation pese moins que toute regle, meme `*`', () => {
    expect(fonds('<style>* { fill: #123456 }</style>' + P + ' fill="#ff0000"/>')).toEqual(['#123456']);
  });

  it('l attribut style l emporte sur les regles, mais pas sur un !important de regle', () => {
    expect(fonds('<style>#a { fill: #111111 }</style>' + P + ' id="a" style="fill: #222222"/>')).toEqual(['#222222']);
    expect(fonds('<style>path { fill: #111111 !important }</style>' + P + ' style="fill: #222222"/>')).toEqual(['#111111']);
    expect(fonds('<style>path { fill: #111111 !important }</style>' + P + ' style="fill: #222222 !important"/>')).toEqual(['#222222']);
  });

  it('entre deux !important, la specificite puis l ordre decident', () => {
    expect(fonds('<style>.a { fill: #111111 !important } #z { fill: #222222 !important } path { fill: #333333 !important }</style>' + P + ' id="z" class="a"/>')).toEqual(['#222222']);
    expect(fonds('<style>.a { fill: #111111 !important } .a { fill: #444444 !important }</style>' + P + ' class="a"/>')).toEqual(['#444444']);
  });

  it('dans une meme declaration, un !important tient devant une valeur plus tardive', () => {
    expect(fonds('<style>path { fill: #111111 !important; fill: #999999 }</style>' + P + '/>')).toEqual(['#111111']);
    expect(lireDeclarations('fill: red ! important; stroke: blue')).toEqual([
      { prop: 'fill', valeur: 'red', important: true }, { prop: 'stroke', valeur: 'blue', important: false }
    ]);
  });
});

describe('la feuille en interaction avec l heritage', () => {
  it('une regle sur un groupe se transmet aux formes, qui peuvent la surcharger', () => {
    const f = lire('<style>.g { fill: #0a0a0a; stroke: #bb0000 } .p { fill: #cc0000 }</style><g class="g">' + P + '/>' + P + ' class="p"/></g>').formes;
    expect(f.map(x => x.remplissage)).toEqual(['#0a0a0a', '#cc0000']);
    expect(f.map(x => x.contour)).toEqual(['#bb0000', '#bb0000']);
  });

  it('une regle sur la balise svg se transmet comme un attribut de la racine', () => {
    expect(fonds('<style>svg { fill: #00aa00 }</style>' + P + '/>' + P + ' fill="#0000ff"/>')).toEqual(['#00aa00', '#0000ff']);
    expect(fonds('<style>:root { fill: #00aa00 }</style>' + P + '/>')).toEqual(['#00aa00']);
  });

  it('une regle peut cacher un element (display) ou changer son opacite', () => {
    const d = lire('<style>.cache { display: none } .demi { opacity: .5 }</style>' + P + ' class="cache"/>' + P + ' class="demi"/>');
    expect(d.formes).toHaveLength(1);
    expect(d.formes[0]?.opacite).toBe(0.5);
  });

  it('une regle de feuille dans defs ou apres le contenu vaut pareil', () => {
    expect(fonds('<defs><style>path { fill: #112233 }</style></defs>' + P + '/>')).toEqual(['#112233']);
    expect(fonds(P + '/><style>path { fill: #112233 }</style>')).toEqual(['#112233']);
  });

  it('un masque ou un filtre pose par une regle refuse le SVG', () => {
    const r = lecture('<style>path { filter: url(#f) }</style>' + P + '/>');
    expect('erreur' in r && r.erreur).toContain('un filtre');
  });

  it('currentColor suit une couleur posee par une regle', () => {
    expect(fonds('<style>g { color: #445566 }</style><g>' + P + ' fill="currentColor"/></g>')).toEqual(['#445566']);
  });
});

describe('ce que la feuille laisse tomber est dit', () => {
  it('@media, @supports, @layer et le reste d un bloc : dits quand ils peignent, tus sinon', () => {
    expect(ignoresDe('<style>@media (min-width: 10px) { path { fill: red } }</style>' + P + '/>')).toEqual(['les règles d’un bloc @media (leurs conditions ne sont pas évaluées)']);
    expect(ignoresDe('<style>@supports (display: grid) { .a { stroke: red } }</style>' + P + '/>')).toEqual(['les règles d’un bloc @supports (leurs conditions ne sont pas évaluées)']);
    expect(ignoresDe('<style>@layer base { .a { fill: red } }</style>' + P + '/>')).toEqual(['les règles d’un bloc @layer (leurs conditions ne sont pas évaluées)']);
    expect(ignoresDe('<style>@media print { text { font-size: 9px } }</style>' + P + '/>')).toEqual([]);
  });

  it('@font-face, @keyframes, @import', () => {
    expect(ignoresDe('<style>@font-face { font-family: X; src: url(x.woff) } .a { fill: blue }</style>' + P + ' class="a"/>')).toEqual(['les polices déclarées par @font-face']);
    expect(ignoresDe('<style>@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }</style>' + P + '/>')).toEqual(['les animations CSS (@keyframes)']);
    expect(ignoresDe('<style>@-webkit-keyframes p { 0% { fill: red } }</style>' + P + '/>')).toEqual(['les animations CSS (@keyframes)']);
    expect(ignoresDe('<style>@import url(a.css); .a { fill: blue }</style>' + P + ' class="a"/>')).toEqual(['les feuilles de style importées par @import']);
    expect(ignoresDe('<style>@charset "utf-8"; @namespace svg url(http://www.w3.org/2000/svg); .a { fill: blue }</style>' + P + ' class="a"/>')).toEqual([]);
  });

  it('un bloc @media ne bloque pas les regles qui suivent', () => {
    expect(fonds('<style>@media screen { .a { fill: red } } .a { fill: #00ff00 }</style>' + P + ' class="a"/>')).toEqual(['#00ff00']);
  });

  it('les freres + et ~, les pseudo-classes et pseudo-elements non portes, les espaces de noms', () => {
    expect(ignoresDe('<style>path + path { fill: red }</style>' + P + '/>')).toEqual(['les règles de style dont le sélecteur vise un frère (« + » ou « ~ »)']);
    expect(ignoresDe('<style>path ~ path { fill: red }</style>' + P + '/>')).toHaveLength(1);
    expect(ignoresDe('<style>path:hover { fill: red }</style>' + P + '/>')).toEqual(['les règles de style dont le sélecteur porte la pseudo-classe :hover']);
    expect(ignoresDe('<style>path:nth-child(2) { fill: red }</style>' + P + '/>')).toEqual(['les règles de style dont le sélecteur porte la pseudo-classe :nth-child']);
    expect(ignoresDe('<style>path:not(.a) { fill: red }</style>' + P + '/>')).toEqual(['les règles de style dont le sélecteur porte la pseudo-classe :not']);
    expect(ignoresDe('<style>path::before { fill: red }</style>' + P + '/>')).toEqual(['les règles de style dont le sélecteur porte le pseudo-élément ::before']);
    expect(ignoresDe('<style>path:after { fill: red }</style>' + P + '/>')).toEqual(['les règles de style dont le sélecteur porte le pseudo-élément ::after']);
    expect(ignoresDe('<style>svg|path { fill: red }</style>' + P + '/>')).toEqual(['les règles de style dont le sélecteur porte un espace de noms (« | »)']);
  });

  it('un membre non porte n empeche pas les autres membres du groupe de s appliquer', () => {
    const r = lecture('<style>.a, path:hover { fill: #00ff00 }</style>' + P + ' class="a"/>');
    expect('dessin' in r && r.dessin.formes[0]?.remplissage).toBe('#00ff00');
    expect('ignores' in r && r.ignores).toHaveLength(1);
  });

  it('un selecteur illisible fait abandonner toute la regle, comme dans un navigateur, et se dit', () => {
    expect(fonds('<style>.a, > { fill: #ff0000 }</style>' + P + ' class="a"/>')).toEqual(['#000000']);
    expect(ignoresDe('<style>.a, > { fill: #ff0000 }</style>' + P + ' class="a"/>')).toEqual(['les règles de style dont le sélecteur est illisible (un navigateur les abandonne aussi)']);
    expect(ignoresDe('<style>.a, > { font-size: 9px }</style>' + P + '/>')).toEqual([]);
  });

  it('une regle imbriquee, une feuille pour un autre media ou d un autre type', () => {
    expect(ignoresDe('<style>.a { fill: red; .b { fill: blue } }</style>' + P + '/>')).toEqual(['les règles de style imbriquées dans une autre (CSS imbriqué)']);
    expect(ignoresDe('<style media="print">path { fill: red }</style>' + P + '/>')).toEqual(['les feuilles de style réservées à un média (attribut media)']);
    expect(ignoresDe('<style media="screen">path { fill: red }</style>' + P + '/>')).toEqual([]);
    expect(fonds('<style type="text/x-autre">path { fill: red }</style>' + P + '/>')).toEqual(['#000000']);
  });

  it('une variable CSS n est pas reprise : la propriete reprend son heritage, et on le dit', () => {
    expect(fonds('<style>.a { fill: var(--c, #ff0000) }</style><g fill="#0000ff">' + P + ' class="a"/></g>')).toEqual(['#0000ff']);
    expect(ignoresDe('<style>.a { fill: var(--c) }</style>' + P + ' class="a"/>')).toEqual(['les variables CSS var(…) (la valeur n’est pas reprise : la propriété retrouve son héritage)']);
    expect(ignoresDe(P + ' fill="var(--c)"/>')).toHaveLength(1);
  });

  it('un transform de style n est pas lu, et se dit ; l attribut transform, si', () => {
    expect(ignoresDe('<style>.a { transform: rotate(45deg) }</style>' + P + ' class="a"/>')).toEqual(['les transformations posées par le style (propriété CSS transform ; seul l’attribut transform est lu)']);
    expect(ignoresDe(P + ' style="transform: scale(2)"/>')).toHaveLength(1);
    expect(ignoresDe(P + ' transform="rotate(45)"/>')).toEqual([]);
  });

  it('ce qui n est pas touche (aucun element ne la porte) ne coute rien : une regle hors sujet ne dit rien', () => {
    expect(ignoresDe('<style>text { font-size: 12px } .a { fill: blue }</style>' + P + ' class="a"/>')).toEqual([]);
    expect(ignoresDe('<style>path:hover { font-size: 12px }</style>' + P + '/>')).toEqual([]);
  });
});

describe('la lecture des selecteurs, directement', () => {
  const spec = (s: string) => lireListeSelecteurs(s).selecteurs.map(x => x.specificite);

  it('la specificite est (identifiants, classes + attributs + pseudo-classes, types)', () => {
    expect(spec('*')).toEqual([0]);
    expect(spec('path')).toEqual([1]);
    expect(spec('g path.a')).toEqual([1002]);
    expect(spec('#a .b[c] path:first-child')).toEqual([1003001]);
    expect(spec('svg g, .x')).toEqual([2, 1000]);
  });

  it('les virgules dans les crochets et les chaines ne coupent pas', () => {
    expect(lireListeSelecteurs('[data-a="x,y"], .b').selecteurs).toHaveLength(2);
    expect(lireListeSelecteurs('.a:not(.b, .c), .d').ignores).toHaveLength(1);
  });

  it('les echappements d identifiant', () => {
    const l = lireListeSelecteurs('.a\\:b');
    expect(l.selecteurs[0]?.parties[0]?.conditions).toEqual([{ t: 'classe', v: 'a:b' }]);
  });

  it('une feuille numerote ses regles dans l ordre et donne le rang suivant', () => {
    const f = lireFeuille('.a{fill:red}.b,.c{fill:blue}', 5);
    expect(f.regles.map(r => r.ordre)).toEqual([5, 6, 6]);
    expect(f.suivant).toBe(7);
  });

  it('les commentaires, les points-virgules des url(…) et des chaines', () => {
    const f = lireFeuille('/* a { fill: red } */ .a { fill: url("a;b"); stroke: #000 } /* fin */');
    expect(f.regles[0]?.declarations.map(d => d.prop)).toEqual(['fill', 'stroke']);
    expect(f.regles[0]?.declarations[0]?.valeur).toBe('url("a;b")');
  });
});
