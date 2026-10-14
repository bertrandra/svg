import { describe, it, expect } from 'vitest';
import { lireXml, trouver, decoderEntites } from '../../../src/util/xml.js';

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
