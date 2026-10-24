import { describe, it, expect } from 'vitest';
import { analyserXml, lireXml, trouver, decoderEntites, LIMITES_XML, phraseErreurXml } from '../../../src/util/xml.js';

describe('lireXml', () => {
  it('lit balises, attributs, texte et CDATA, en ignorant declarations et commentaires', () => {
    const doc = lireXml('<?xml version="1.0"?><!-- c --><!DOCTYPE svg><svg a="1" b=\'x &amp; y\'><style><![CDATA[.a{fill:red}]]></style><g><path d="M0 0"/></g></svg>');
    const svg = doc && trouver(doc, 'svg');
    expect(svg?.attributs).toEqual({ a: '1', b: 'x & y' });
    expect(svg && trouver(svg, 'style')?.texte).toBe('.a{fill:red}');
    expect(svg && trouver(svg, 'path')?.attributs.d).toBe('M0 0');
  });

  it('rend null sur une balise non fermee ou une fermeture orpheline', () => {
    expect(lireXml('<svg><g></svg>')).toBeNull();
    expect(lireXml('<svg></g></svg>')).toBeNull();
  });

  it('decode les entites numeriques', () => {
    expect(decoderEntites('&#233;&#xE9;&lt;')).toBe('éé<');
  });
});

describe('analyserXml : limites et refus nommes', () => {
  const erreur = (t: string, lim = LIMITES_XML): string => {
    const r = analyserXml(t, lim);
    if (!('erreur' in r)) throw new Error('lu');
    return phraseErreurXml(r.erreur);
  };

  it('refuse un texte trop profond, trop gros, a trop d elements ou a trop d attributs, en le disant', () => {
    expect(erreur('<a>'.repeat(5), { ...LIMITES_XML, profondeur: 4 })).toBe('Ce SVG est trop profond (plus de 4 niveaux d’éléments imbriqués) : simplifiez-le dans votre logiciel.');
    expect(erreur('<a/>'.repeat(5), { ...LIMITES_XML, noeuds: 4 })).toBe('Ce SVG a plus de 4 éléments : simplifiez-le dans votre logiciel.');
    expect(erreur('<a>' + 'x'.repeat(20) + '</a>', { ...LIMITES_XML, caracteres: 10 })).toMatch(/^Ce SVG dépasse .* de caractères : simplifiez-le/);
    expect(erreur('<a b="1" c="2" d="3"/>', { ...LIMITES_XML, attributs: 2 })).toBe('Ce SVG ne se lit pas : l’élément « a » porte plus de 2 attributs.');
  });

  it('accepte la profondeur limite et la dit trop profonde un niveau plus bas', () => {
    expect(analyserXml('<a>'.repeat(4) + '</a>'.repeat(4), { ...LIMITES_XML, profondeur: 4 })).toHaveProperty('racine');
  });

  it('nomme chaque defaut de forme', () => {
    expect(erreur('<a><b></a>')).toMatch(/ne ferme rien/);
    expect(erreur('<a b="1')).toMatch(/jamais fermée/);
    expect(erreur('<a><!-- x </a>')).toMatch(/commentaire n’est jamais fermé/);
    expect(erreur('<a><![CDATA[ x </a>')).toMatch(/CDATA n’est jamais fermée/);
    expect(erreur('<a><? x </a>')).toMatch(/instruction de traitement/);
    expect(erreur('<a b="1"c="2"/>')).toMatch(/attributs collés/);
    expect(erreur('<a>1 < 2</a>')).toMatch(/« < » isolé/);
    expect(erreur('<a<b/>')).toMatch(/n’est pas valide/);
  });

  it('ne developpe aucune entite, declaree ou non : la bombe de rires reste du texte', () => {
    const t = '<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY x SYSTEM "file:///etc/passwd">]><svg><title>&b;&x;</title></svg>';
    const r = analyserXml(t);
    const svg = 'racine' in r ? trouver(r.racine, 'svg') : null;
    expect(svg && trouver(svg, 'title')?.texte).toBe('&b;&x;');
  });

  it('saute un DOCTYPE dont le sous-ensemble contient des chevrons, des guillemets et des commentaires', () => {
    const r = analyserXml('<!DOCTYPE svg [<!ENTITY e "<svg onload=\'a()\'>"> <!-- ]> --> ]><svg a="1"/>');
    expect('racine' in r && r.racine.enfants.map(e => e.nom)).toEqual(['svg']);
  });

  it('lit en temps lineaire une balise jamais fermee de 3 Mo', () => {
    const t0 = Date.now();
    expect(analyserXml('<g ' + 'a="1" '.repeat(500_000))).toHaveProperty('erreur');
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('garde le texte et le CDATA dans l ordre, et un attribut sans valeur', () => {
    const r = analyserXml('<s>a<![CDATA[<b>]]>c &amp; d</s><p x/>');
    expect('racine' in r && r.racine.enfants[0]?.texte).toBe('a<b>c & d');
    expect('racine' in r && r.racine.enfants[1]?.attributs).toEqual({ x: '' });
  });
});
