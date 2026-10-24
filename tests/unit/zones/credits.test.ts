import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMPOSANTS, SOURCES_ORIGINE } from '../../../src/model/credits.js';
import { ContenuCredits } from '../../../src/zones/Credits.js';
import { versionProduit } from '../../../src/zones/produit.js';

// Le contenu de la boite « A propos et credits » vient de la meme liste que THIRD-PARTY-NOTICES.md : aucun composant n'y manque.
// Son comportement (role dialog, focus, Echap, axe) est celui des tests de navigateur (tests/e2e/credits.e2e.ts).

describe('le contenu de « A propos et credits »', () => {
  const html = renderToStaticMarkup(createElement(ContenuCredits));

  it('nomme chaque composant redistribue, avec sa licence et son titulaire', () => {
    for (const c of COMPOSANTS.filter(x => x.genre !== 'forme')) {
      expect(html, c.paquet).toContain(c.nom);
      expect(html, c.paquet).toContain(c.licence);
    }
  });

  it('donne la mention des formes : la source et la licence, avec leurs liens', () => {
    const s = SOURCES_ORIGINE[0];
    expect(s).toBeDefined();
    expect(html).toContain('href="' + s?.url + '"');
    expect(html).toContain('href="' + s?.urlLicence + '"');
    expect(html).toContain('CC BY 3.0');
    expect(html).toContain('MENTIONS.txt');
  });

  it('dit la version du produit, ou qu il est en developpement hors build', () => {
    expect(versionProduit()).toBe('développement');
    expect(html).toContain('version développement');
  });

  it('ouvre chaque lien dans un autre onglet sans fuite de la page d origine', () => {
    for (const m of html.matchAll(/<a [^>]*>/g)) {
      expect(m[0]).toContain('target="_blank"');
      expect(m[0]).toContain('rel="noreferrer noopener"');
    }
  });
});
