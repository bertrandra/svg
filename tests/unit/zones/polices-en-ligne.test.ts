import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { CLE_FAVORIS, CLE_RECENTES, listeDeCles } from '../../../src/zones/contexteTexte.js';
import { phraseServeurs } from '../../../src/zones/ConsentementPolices.js';
import { policeDuTexte } from '../../../src/zones/actionsTexte.js';
import { glyphesCarres } from '../engine/glyphesFactices.js';

// Les polices en ligne dans l'interface (ADR-0025) : les conforts du stockage (favoris, recentes) lus avec mefiance, la phrase
// du dialogue qui nomme les serveurs, ce qu'un texte garde de sa police, et la regle qui tient le reseau dans `io`.

const racine = resolve(__dirname, '../../..');
function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap(n => { const c = join(dir, n); return statSync(c).isDirectory() ? fichiers(c) : /\.tsx?$/.test(n) ? [c] : []; });
}

describe('les favoris et les recentes du stockage', () => {
  it('ont leurs cles, et ne gardent que des cles bien formees, sans doublon, bornees', () => {
    expect([CLE_FAVORIS, CLE_RECENTES]).toEqual(['svg.polices.favoris', 'svg.polices.recentes']);
    expect(listeDeCles(['inter', 'fontsource:roboto', 'inter', 'c-1b0c5ca30f8f68'], 10)).toEqual(['inter', 'fontsource:roboto', 'c-1b0c5ca30f8f68']);
    expect(listeDeCles(['<script>', 42, null, 'Majuscule', 'a'.repeat(200), '__proto__', 'ok'], 10)).toEqual(['ok']);
    expect(listeDeCles({ 0: 'inter' }, 10)).toEqual([]);
    expect(listeDeCles(Array.from({ length: 20 }, (_, i) => 'p' + i), 8)).toHaveLength(8);
  });
});

describe('le dialogue de consentement', () => {
  it('nomme chaque serveur et son hote, le repli apres le principal', () => {
    expect(phraseServeurs(['jsdelivr', 'bunny'])).toBe('jsDelivr (cdn.jsdelivr.net), puis, s’il ne répond pas, Bunny Fonts (fonts.bunny.net)');
    expect(phraseServeurs(['fontshare'])).toBe('Fontshare (cdn.fontshare.com)');
    expect(phraseServeurs(['bunny'])).toBe('Bunny Fonts (fonts.bunny.net)');
  });
});

describe('ce qu un texte garde de sa police', () => {
  const police = (id: string, nom: string) => ({ id, nom, glyphes: glyphesCarres, nature: 'contour' as const, version: '0123456789abcd' });
  it('le nom d une police du catalogue ou deposee, borne a 60 caracteres ; rien de plus pour une fonte livree', () => {
    expect(policeDuTexte(police('inter', 'Inter'))).toEqual({ id: 'inter', version: '0123456789abcd' });
    expect(policeDuTexte(police('c-1b0c5ca30f8f68', 'Roboto'))).toEqual({ id: 'c-1b0c5ca30f8f68', version: '0123456789abcd', famille: 'Roboto' });
    expect(policeDuTexte(police('u-0123456789abcd', 'x'.repeat(90))).famille).toHaveLength(60);
  });
});

describe('le reseau ne vit que dans io', () => {
  it('un seul appel a fetch dans tout src/ : le telechargement d une police, dans io/policesEnLigne.ts', () => {
    const appels = fichiers(join(racine, 'src')).filter(f => /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/.test(readFileSync(f, 'utf8')));
    expect(appels.map(f => relative(racine, f).replace(/\\/g, '/'))).toEqual(['src/io/policesEnLigne.ts']);
  });

  it('crypto.subtle, Cache Storage et Local Font Access ne s emploient que dans io', () => {
    for (const f of fichiers(join(racine, 'src'))) {
      const t = readFileSync(f, 'utf8'), chemin = relative(racine, f).replace(/\\/g, '/');
      if (/crypto\.subtle|\bcaches\.|queryLocalFonts\(/.test(t)) expect(chemin, chemin).toMatch(/^src\/io\//);
    }
  });
});
