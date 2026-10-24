import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageIncompatible } from '../../../src/zones/Incompatible.js';
import { manquantes } from '../../../src/util/capacites.js';

describe('PageIncompatible', () => {
  it('dit en francais ce qui manque, dans une alerte', () => {
    const html = renderToStaticMarkup(createElement(PageIncompatible, { manquantes: manquantes({ objectHasOwn: true, pointeurs: false, blob: true, canvas: true, webassembly: true }, 'demarrage') }));
    expect(html).toContain('Ce navigateur est trop ancien');
    expect(html).toContain('role="alert"');
    expect(html).toContain('les évènements de pointeur');
  });
});
