import { describe, it, expect } from 'vitest';
import { nettoyerSvg } from '../../../src/util/svg.js';

describe('nettoyerSvg', () => {
  it('garde le dessin et retire ce qui s execute ou va chercher ailleurs', () => {
    const r = nettoyerSvg('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="x()">'
      + '<script>alert(1)</script><style>@import url(a.css); .a{fill:url(http://x/y)}</style>'
      + '<a href="http://exemple.org"><path d="M0 0h1v1z"/></a><use href="#a"/><image href="data:image/png;base64,AA"/></svg>');
    expect(r).not.toBeNull();
    expect(r?.ratio).toBe(2);
    expect(r?.svg).not.toMatch(/<script|onload|@import|x\/y|exemple\.org/);
    expect(r?.svg).toContain('href="#a"');
    expect(r?.svg).toContain('data:image/png');
  });

  it('ajoute xmlns et viewBox quand ils manquent, et refuse un SVG sans dimensions', () => {
    const r = nettoyerSvg('<svg width="30" height="15"><rect width="1" height="1"/></svg>');
    expect(r?.svg.startsWith('<svg viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(nettoyerSvg('<svg><rect width="1" height="1"/></svg>')).toBeNull();
    expect(nettoyerSvg('pas un svg')).toBeNull();
  });
});
