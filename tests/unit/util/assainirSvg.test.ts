import { describe, it, expect } from 'vitest';
import { assainirSvg, nettoyerCss } from '../../../src/util/assainirSvg.js';
import { nettoyerSvg, nettoyerSvgNomme } from '../../../src/util/svg.js';
import { violationsNettoyage } from '../securite/invariants.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const W = (corps: string, attrs = ''): string => `<svg ${NS} viewBox="0 0 10 10"${attrs}>${corps}</svg>`;
const propre = (texte: string): string => {
  const r = nettoyerSvg(texte);
  if (!r) throw new Error('refuse');
  return r.svg;
};

describe('assainirSvg : ce que le nettoyage par remplacements laissait passer', () => {
  it('ne recompose pas une balise en retirant un morceau (<scr<script>ipt>)', () => {
    expect(nettoyerSvgNomme(W('<scr<script></script>ipt>alert(1)</scr<script></script>ipt>'))).toHaveProperty('erreur');
  });

  it('retire un element hors de la liste blanche avec son contenu : prefixe, espace de noms, casse', () => {
    const s = propre(W('<svg:script>a()</svg:script><html:script xmlns:html="http://www.w3.org/1999/xhtml">a()</html:script><ScRiPt>a()</ScRiPt><g xmlns="http://www.w3.org/1999/xhtml"><iframe src="x"/></g><rect/>'));
    expect(s).toBe(W('<g></g><rect/>'));
    expect(violationsNettoyage(s)).toEqual([]);
  });

  it('retire les gestionnaires, quels que soient la casse, le separateur et le guillemet', () => {
    const s = propre(`<svg ${NS} viewBox="0 0 10 10"\n\tONLOAD\n=\n"a()"><g onclick='b()' OnMouseOver=c()><rect/></g></svg>`.replace('OnMouseOver=c()', 'OnMouseOver="c()"'));
    expect(s).not.toMatch(/on[a-z]+\s*=/i);
    expect(s).toContain('<rect/>');
  });

  it('refuse un attribut colle au precedent, qu un analyseur HTML laisserait passer (onclick colle)', () => {
    expect(nettoyerSvgNomme(W('<path d="M0 0"onclick="a()"/>'))).toHaveProperty('erreur');
  });

  it('retire un href qui ne va pas vers un ancrage, sous tout prefixe et toute casse', () => {
    const s = propre(`<svg ${NS} xmlns:x="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><a x:href="javascript:a()"><rect/></a><a href="https://x.invalid/"><rect/></a><a XLINK:HREF="javascript:a()"><rect/></a><a href="#ok"><rect/></a></svg>`);
    expect(s).not.toMatch(/x\.invalid|javascript|x:href|XLINK/i);
    expect(s).toContain('href="#ok"');
    expect(s).not.toContain('xmlns:x');
  });

  it('neutralise un schema ecrit avec des entites dans un attribut qui n est pas un href (to= d une animation)', () => {
    const s = propre(W('<a><set attributeName="x" to="jav&#x61;script:a()"/><rect/></a>'));
    expect(s).not.toMatch(/script:/i);
    expect(violationsNettoyage(s)).toEqual([]);
  });

  it('retire une animation qui vise href, xlink:href ou un gestionnaire, meme ecrit avec des entites', () => {
    const s = propre(W('<a><set attributeName="href" to="#a"/><animate attributeName="xlink:href" values="#a;#b"/><set attributeName="h&#114;ef" to="#a"/><animate attributeName="onclick" to="x"/><animate attributeName="opacity" to="0"/></a>'));
    expect(s).not.toMatch(/attributeName="(?:xlink:)?h|onclick|h&#114;ef/);
    expect(s).toContain('attributeName="opacity"');
  });

  it('voit un url( ou un @import cache par un echappement CSS ou un commentaire', () => {
    expect(nettoyerCss('.a{fill:u\\72l(https://x.invalid/)}')).not.toMatch(/https/);
    expect(nettoyerCss('@\\69mport "https://x.invalid/a.css";.b{fill:red}')).toBe('.b{fill:red}');
    expect(nettoyerCss('.a{fill:url(/**/https://x.invalid/)}')).not.toMatch(/https/);
    expect(nettoyerCss('.a{fill:url(https://x.invalid/a')).not.toMatch(/url\(/);
    expect(nettoyerCss('.a{cursor:image-set("https://x.invalid/a.png" 1x)}')).not.toMatch(/image-set/);
  });

  it('garde les references locales url(#id), guillemets compris, et un CSS sans danger tel quel', () => {
    expect(nettoyerCss('.a{fill:url(#g)}.b{fill:url("#g")}.c{fill:url( \'#g\' )}')).toBe('.a{fill:url(#g)}.b{fill:url("#g")}.c{fill:url( \'#g\' )}');
    const css = '.a { fill: #c81e28; stroke: none }';
    expect(nettoyerCss(css)).toBe(css);
  });

  it('repasse jusqu a la stabilite : un retrait ne peut pas recomposer le mot retire', () => {
    expect(nettoyerCss('behbehavior:x;avior:url(javajavascript:script:a())')).not.toMatch(/behavior|javascript|url\(/i);
  });

  it('ne laisse pas un CDATA de feuille se refermer plus tot qu il ne l a ecrit', () => {
    const s = propre(W('<style><![CDATA[.a{fill:red}@import "x";]]]]><![CDATA[>]]></style>'));
    expect(violationsNettoyage(s)).toEqual([]);
  });

  it('met la feuille <style> d un titre ou d une description en texte seul : un element dedans part', () => {
    const s = propre(W('<title><style>.a{}</style>t</title><desc><b>x</b>d</desc><rect/>'));
    expect(s).toBe(W('<title>t</title><desc>d</desc><rect/>'));
  });

  it('refuse un attribut repete (le premier gagne en HTML, le dernier a la lecture)', () => {
    expect(nettoyerSvgNomme(W('<path fill="red" fill="url(#a)"/>'))).toEqual({ erreur: 'Ce SVG ne se lit pas : l’attribut « fill » est répété sur la balise « path ».' });
  });
});

describe('assainirSvg : ce qu elle garde, octet pour octet', () => {
  it('rend un SVG ordinaire inchange, espaces, apostrophes et fins de balise comprises', () => {
    const svg = `<svg ${NS} viewBox='0 0 40 20' width="40">\n  <g  fill = "#c81e28" >\n    <path d="M0 0h10v10z" />\n  </g>\n  <circle cx="5" cy="5" r="2"/></svg>`;
    expect(propre(svg)).toBe(svg);
  });

  it('retire commentaires, instructions, DOCTYPE et ce qui entoure la racine', () => {
    const s = propre(`<?xml version="1.0"?><!-- a --><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg ${NS} viewBox="0 0 10 10"><!-- b --><?x y?><rect/></svg><script>a()</script>`);
    expect(s).toBe(W('<rect/>'));
  });

  it('garde la metadonnee de licence (rdf, cc, dc) et retire ce qui s y cache', () => {
    const s = propre(`<svg ${NS} xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:cc="http://creativecommons.org/ns#" viewBox="0 0 10 10"><metadata><rdf:RDF><cc:Work rdf:about=""><cc:license rdf:resource="http://creativecommons.org/licenses/by/3.0/"/><script>a()</script></cc:Work></rdf:RDF></metadata><rect/></svg>`);
    expect(s).toContain('<cc:license rdf:resource="http://creativecommons.org/licenses/by/3.0/"/>');
    expect(s).not.toContain('script');
    expect(violationsNettoyage(s)).toEqual([]);
  });

  it('ajoute xmlns et viewBox dans l ordre historique, et remplace un viewBox ou un xmlns qui ne conviennent pas', () => {
    expect(propre('<svg width="30" height="15"><rect/></svg>')).toBe('<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg" width="30" height="15"><rect/></svg>');
    const faux = propre('<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 0 0" width="8" height="4"><rect/></svg>');
    expect(faux).toBe('<svg viewBox="0 0 8 4" xmlns="http://www.w3.org/2000/svg" width="8" height="4"><rect/></svg>');
    expect(nettoyerSvg(W('<rect/>', ' width="1e3"'))?.ratio).toBe(1);
  });

  it('lit un viewBox en notation scientifique sans en ajouter un second', () => {
    const s = propre(`<svg ${NS} viewBox="0 0 1e3 5e2"><rect/></svg>`);
    expect(s.match(/viewBox/g)).toHaveLength(1);
    expect(nettoyerSvg(s)?.ratio).toBe(2);
  });

  it('prend l element <svg> meme au milieu d une page HTML, et ignore un faux <svg> dans un commentaire', () => {
    expect(propre(`<html><body onload="a()"><!-- <svg viewBox="0 0 1 1" onload="a()"> --><svg ${NS} viewBox="0 0 10 10"><rect/></svg></body></html>`)).toBe(W('<rect/>'));
  });

  it('ne developpe aucune entite : une reference inconnue est echappee, jamais remplacee', () => {
    const s = propre('<!DOCTYPE svg [<!ENTITY a "AAAA"><!ENTITY x SYSTEM "file:///etc/passwd">]>' + W('<title>&a;&x;</title><rect/>'));
    expect(s).toBe(W('<title>&amp;a;&amp;x;</title><rect/>'));
  });

  it('garde le renvoi externe d un <use> dans l attribut inerte, sans schema actif', () => {
    const s = propre(W('<use href="javascript:a()"/><use xlink:href="data:image/svg+xml,x#a"/>'));
    expect(s).toBe(W('<use data-href-externe="a()"/><use data-href-externe="image/svg+xml,x#a"/>'));
  });

  it('rend null sans <svg> ou sans plan de travail, et un refus nomme pour un texte casse ou demesure', () => {
    expect(assainirSvg('rien')).toBeNull();
    expect(assainirSvg(`<svg ${NS}><rect/></svg>`)).toBeNull();
    expect(nettoyerSvgNomme(`<svg ${NS} viewBox="0 0 1 1"><g></svg>`)).toEqual({ erreur: 'Ce SVG ne se lit pas : la balise fermante « svg » ne ferme rien.' });
    expect(nettoyerSvgNomme(`<svg ${NS} viewBox="0 0 1 1">${'<g>'.repeat(1100)}`)).toEqual({ erreur: 'Ce SVG est trop profond (plus de 1024 niveaux d’éléments imbriqués) : simplifiez-le dans votre logiciel.' });
  });
});
