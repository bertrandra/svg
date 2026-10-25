import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { CLE_FAVORIS, CLE_RECENTES, listeDeCles } from '../../../src/zones/contexteTexte.js';
import { policeDuTexte } from '../../../src/zones/actionsTexte.js';
import { glyphesCarres } from '../engine/glyphesFactices.js';

// Les polices en ligne dans l'interface (ADR-0025) : les conforts du stockage (favoris, recentes) lus avec mefiance, ce qu'un
// texte garde de sa police, la regle qui tient le reseau dans `io`, et l'accord par serveur retire (le choix vaut demande).

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

describe('plus d accord par serveur', () => {
  it('aucun dialogue de consentement ni ecriture de l ancienne cle dans src/ : choisir une police vaut demande', () => {
    for (const f of fichiers(join(racine, 'src'))) {
      const t = readFileSync(f, 'utf8'), chemin = relative(racine, f).replace(/\\/g, '/');
      expect(/DialogueConsentement|Accepter et retenir|Retirer l’autorisation|ecrire\(ANCIENNE_CLE/.test(t), chemin).toBe(false);
      if (chemin !== 'src/io/policesEnLigne.ts') expect(t.includes('svg.polices.consentement'), chemin).toBe(false);
    }
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
  // La regle « un seul fetch dans src/ » (ADR-0025) devient « le reseau passe par io/ » avec le site PHP (ADR-0030) : le
  // telechargement d'une police, et le serveur du site (projets, donnees, polices servies par le site). Rien d'autre, nulle part.
  it('le reseau ne passe que par io/ : le telechargement d une police et le serveur du site, rien d autre', () => {
    const appels = fichiers(join(racine, 'src')).filter(f => /\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/.test(readFileSync(f, 'utf8')));
    const chemins = appels.map(f => relative(racine, f).replace(/\\/g, '/'));
    expect(chemins.every(c => c.startsWith('src/io/')), chemins.join(', ')).toBe(true);
    expect(chemins).toEqual(['src/io/policesEnLigne.ts', 'src/io/serveur.ts']);
  });

  it('crypto.subtle, Cache Storage et Local Font Access ne s emploient que dans io', () => {
    for (const f of fichiers(join(racine, 'src'))) {
      const t = readFileSync(f, 'utf8'), chemin = relative(racine, f).replace(/\\/g, '/');
      if (/crypto\.subtle|\bcaches\.|queryLocalFonts\(/.test(t)) expect(chemin, chemin).toMatch(/^src\/io\//);
    }
  });
});
