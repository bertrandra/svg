// Le corpus hostile de l'ouverture depuis une adresse (tests/fixtures/hostile-adresse, ADR-0036) : ce qu'un serveur peut renvoyer
// sous un nom qui ment. Chaque fichier est reconnu sur ses octets (jamais sur son extension), puis suit la voie de sa nature : un SVG
// passe par le nettoyage et la lecture d'un fichier d'inconnu (passage.ts, invariants compris), un PDF par la lecture de la page
// (io/pdf.ts) puis comme un SVG, une image va au decodeur, le reste est refuse en le nommant. Aucune exception, jamais.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { natureDesOctets } from '../../../src/engine/natureOctets.js';
import { ouvrirPdf } from '../../../src/io/pdf.js';
import { reconnaitre, texteDuSvg } from '../../../src/zones/OuvrirAdresse.js';
import { remplacantesTest } from '../engine/pdf/fabrique.js';
import { passer } from './passage.js';

const DOSSIER = resolve(__dirname, '../../fixtures/hostile-adresse');

interface Ligne { fichier: string; vecteur: string; nature: string; attendu: 'ouvre' | 'refus' | 'image' }
const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Ligne[] };

/** Le verdict de la voie de la page pour des octets recus : ouvre, refus (avec la raison) ou image (remise au convertisseur). */
async function voie(nom: string, o: Uint8Array): Promise<{ verdict: 'ouvre' | 'refus' | 'image'; raison: string; defauts: string }> {
  const r = reconnaitre(nom, o);
  if ('erreur' in r) return { verdict: 'refus', raison: r.erreur, defauts: '' };
  if (r.nature === 'svg' || r.nature === 'pdf') {
    let texte: string;
    if (r.nature === 'pdf') {
      const p = await ouvrirPdf(r.octets, 1, { remplacantes: async () => remplacantesTest() });
      if ('erreur' in p) return { verdict: 'refus', raison: p.erreur, defauts: '' };
      texte = p.svg;
    } else {
      texte = texteDuSvg(r.octets);
    }
    const p = passer(texte);
    expect(p.plantage, 'exception echappee').toBeNull();
    return { verdict: p.ouvre ? 'ouvre' : 'refus', raison: p.refus.join(' | '), defauts: p.defauts.join('\n') };
  }
  return { verdict: 'image', raison: '', defauts: '' };
}

describe('le corpus hostile de l ouverture par adresse', () => {
  it('chaque fichier est decrit dans index.json, et reciproquement ; un nom dit son vecteur', () => {
    const sur = readdirSync(DOSSIER).filter(f => f !== 'index.json').sort();
    expect(index.fichiers.map(f => f.fichier).sort()).toEqual(sur);
    expect(sur.length).toBeGreaterThanOrEqual(10);
    for (const l of index.fichiers) {
      expect(l.vecteur.length, l.fichier).toBeGreaterThan(20);
      expect(l.fichier).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)+\.[a-z]+$/);
    }
  });

  for (const l of index.fichiers) {
    it(l.fichier + ' : ' + l.vecteur, async () => {
      const o = new Uint8Array(readFileSync(resolve(DOSSIER, l.fichier)));
      expect(natureDesOctets(o), 'nature decidee sur les octets').toBe(l.nature);
      const v = await voie(l.fichier.replace(/\.[a-z]+$/, ''), o);
      expect(v.defauts).toBe('');
      expect(v.verdict, 'raison : ' + v.raison).toBe(l.attendu);
      if (v.verdict === 'refus') expect(v.raison.length, 'un refus se nomme').toBeGreaterThan(10);
    });
  }
});
