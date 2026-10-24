// Le corpus hostile (tests/fixtures/hostile) : chaque fichier passe par les chemins d'entree reels et
// ses sorties satisfont les invariants (docs/securite.md). Un fichier sans ligne dans index.json, ou une
// ligne sans fichier, fait echouer le test : le corpus et son commentaire ne se separent pas.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { passer } from './passage.js';

const DOSSIER = resolve(__dirname, '../../fixtures/hostile');

interface Ligne { fichier: string; famille: string; vecteur: string; attendu: 'ouvre' | 'refus' }
const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Ligne[] };

/** Le texte tel que la page le lit : `File.text()` decode en UTF-8 et retire la marque d'ordre des octets. */
const lireComme = (nom: string): string => new TextDecoder('utf-8').decode(readFileSync(resolve(DOSSIER, nom)));

describe('le corpus hostile', () => {
  it('compte au moins soixante fichiers, tous decrits dans index.json et reciproquement', () => {
    const sur = readdirSync(DOSSIER).filter(f => f.endsWith('.svg')).sort();
    expect(sur.length).toBeGreaterThanOrEqual(60);
    expect(index.fichiers.map(f => f.fichier).sort()).toEqual(sur);
    for (const l of index.fichiers) {
      expect(l.vecteur.length, l.fichier).toBeGreaterThan(10);
      expect(l.fichier, 'un nom de fichier dit son vecteur').toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)+\.svg$/);
    }
  });

  for (const l of index.fichiers) {
    it(l.fichier + ' : ' + l.vecteur, () => {
      const p = passer(lireComme(l.fichier));
      expect(p.plantage, 'exception echappee').toBeNull();
      expect(p.defauts.join('\n')).toBe('');
      expect(p.ouvre, l.attendu === 'ouvre' ? 'devait s ouvrir ; refus : ' + p.refus.join(' | ') : 'devait etre refuse').toBe(l.attendu === 'ouvre');
    });
  }
});
