import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMPOSANTS, PREFIXE_BIBLIOTHEQUE, SOURCES_ORIGINE, composantsDe, mentionExigee, mentionOrigines, normaliserOrigines, origineDeBibliotheque, origineDeForme, origineValide, texteMetadonnees
} from '../../../src/model/credits.js';

describe('les origines', () => {
  it('n admet que les sources connues, bien formees, sans deux tirets de suite', () => {
    expect(origineValide('game-icons:3d-glasses')).toBe(true);
    expect(origineValide('game-icons:abacus')).toBe(true);
    for (const mauvaise of ['', 'abacus', 'inconnu:abacus', 'game-icons:', 'game-icons:A', 'game-icons:a b', 'game-icons:a--b', 'game-icons:a"b', 'game-icons:<x>', ':abacus', 'game-icons:-a']) {
      expect(origineValide(mauvaise), mauvaise).toBe(false);
    }
  });

  it('normalise : valides seulement, sans doublon, en ordre alphabetique', () => {
    expect(normaliserOrigines(['game-icons:b', 'x:y', 'game-icons:a', 'game-icons:b'])).toEqual(['game-icons:a', 'game-icons:b']);
    expect(normaliserOrigines([])).toEqual([]);
  });

  it('chaque identifiant des 4 134 formes de la bibliotheque est une origine valide (sinon sa mention se perdrait en silence)', () => {
    const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { icons: Record<string, unknown> };
    const ids = Object.keys(jeu.icons);
    expect(ids.length).toBeGreaterThan(4000);
    expect(ids.filter(id => !origineValide(origineDeBibliotheque(id)))).toEqual([]);
    expect(origineDeBibliotheque('abacus')).toBe(PREFIXE_BIBLIOTHEQUE + ':abacus');
  });
});

describe('la mention', () => {
  it('nomme la source, sa licence et les deux adresses, en ASCII (elle part dans des commentaires et des PDF)', () => {
    const m = mentionOrigines(['game-icons:abacus']);
    expect(m).toContain('game-icons.net et ses contributeurs');
    expect(m).toContain('https://game-icons.net');
    expect(m).toContain('CC BY 3.0');
    expect(m).toContain('https://creativecommons.org/licenses/by/3.0/');
    expect(m).toMatch(/^[\x20-\x7e]+$/);
    expect(m).not.toContain('--');
  });

  it('est vide sans origine, et les metadonnees aussi', () => {
    expect(mentionOrigines([])).toBe('');
    expect(texteMetadonnees([])).toBe('');
  });

  it('les metadonnees ajoutent la liste des origines pour les machines', () => {
    const t = texteMetadonnees(['game-icons:3d-glasses', 'game-icons:abacus']);
    expect(t.startsWith(mentionOrigines(['game-icons:abacus']))).toBe(true);
    expect(t.endsWith('Origines : game-icons:3d-glasses, game-icons:abacus.')).toBe(true);
  });
});

describe('la liste des composants', () => {
  it('a un paquet par ligne, et pour chacun une licence, un titulaire et une adresse', () => {
    const paquets = COMPOSANTS.map(c => c.paquet);
    expect(new Set(paquets).size).toBe(paquets.length);
    for (const c of COMPOSANTS) {
      expect(c.spdx, c.paquet).not.toBe('');
      expect(c.titulaire, c.paquet).not.toBe('');
      expect(c.url, c.paquet).toMatch(/^https?:\/\//);
    }
  });

  it('porte la source des formes, les fontes et les logiciels', () => {
    expect(composantsDe('forme').map(c => c.paquet)).toEqual(['@iconify-json/game-icons', '@iconify-json/mdi', '@iconify-json/ph', '@iconify-json/tabler', '@iconify-json/healthicons', '@iconify-json/lucide']);
    expect(composantsDe('fonte').length).toBe(10);
    expect(composantsDe('logiciel').map(c => c.paquet)).toEqual(expect.arrayContaining(['react', 'react-dom', 'opentype.js', 'polygon-clipping', '@visioncortex/vtracer']));
  });

  it('la source des formes de la liste est celle des origines (une seule licence a citer)', () => {
    const source = SOURCES_ORIGINE.find(s => s.prefixe === PREFIXE_BIBLIOTHEQUE);
    expect(source?.licence).toBe('CC BY 3.0');
    expect(composantsDe('forme')[0]?.spdx).toBe('CC-BY-3.0');
  });
});

describe('les origines des sources libres', () => {
  it('sont valides pour chaque source du registre, et l origine sans source est celle de game-icons', () => {
    for (const o of ['mdi:heart', 'ph:heart-fill', 'tabler:heart-filled', 'healthicons:blood-bag', 'lucide:heart', 'healthicons:0']) expect(origineValide(o), o).toBe(true);
    expect(origineValide('simple-icons:github')).toBe(false);
    expect(origineDeForme('mdi', 'heart')).toBe('mdi:heart');
    expect(origineDeForme(undefined, 'abacus')).toBe(origineDeBibliotheque('abacus'));
  });

  it('n exigent aucune mention dans le fichier : ni phrase, ni <metadata>, ni sujet de PDF', () => {
    expect(mentionExigee(['mdi:heart', 'lucide:heart'])).toBe(false);
    expect(mentionOrigines(['mdi:heart', 'lucide:heart'])).toBe('');
    expect(texteMetadonnees(['lucide:heart', 'mdi:heart'])).toBe('');
  });

  it('melangees a game-icons, la mention ne nomme que game-icons, la liste des origines les nomme toutes', () => {
    const t = texteMetadonnees(['game-icons:abacus', 'mdi:heart']);
    expect(t.startsWith(mentionOrigines(['game-icons:abacus']))).toBe(true);
    expect(t).not.toContain('Pictogrammers');
    expect(t.endsWith('Origines : game-icons:abacus, mdi:heart.')).toBe(true);
  });
});
