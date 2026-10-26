// Le panneau des calques (ADR-0012, etape 2, paquet 2-B). D'abord la garde : un dessin plat rend la liste d'avant au noeud pres
// (l'empreinte du DOM rendu, prise sur le code d'avant l'arbre, pour chaque SVG de reference plat, sans selection, avec, et en
// contexte Cricut ; un dessin de 300 formes fenetre ; les deux etats vides). Puis l'arbre d'un dessin riche : la grille, ses lignes,
// un seul arret de tabulation, le fenetrage, la coexistence avec « À couper / À écrire ».

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { resoudreProfil } from '../../../src/engine/preparation.js';
import { CHOIX_CRICUT_DEFAUT } from '../../../src/model/contextes.js';
import { rendreCalques, type OptionsRendu } from './rendreCalques.js';

const FIXTURES = resolve(__dirname, '../../fixtures/svg');
const EMPREINTES = resolve(__dirname, '../../fixtures/calques/plat.sha256.json');
const empreinte = (d: DessinSvg, o?: OptionsRendu): string => createHash('sha256').update(rendreCalques(d, o)).digest('hex');
const PROFIL = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT });

function lire(texte: string, modele: 'plat' | 'riche' = 'plat'): DessinSvg {
  const r = lireDessin(texte, modele === 'riche' ? { modele } : {});
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
}

/** Le dessin de 300 formes (une sur sept masquee) : la liste se fenetre. */
const GRAND = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' + Array.from({ length: 300 }, (_, i) => '<rect x="' + (i % 30) * 30 + '" y="' + Math.floor(i / 30) * 30
  + '" width="20" height="20" fill="#' + (i * 4999 % 0xffffff).toString(16).padStart(6, '0') + '"' + (i % 7 === 0 ? ' visibility="hidden"' : '') + '/>').join('') + '</svg>';

describe('un dessin plat garde la liste des calques d avant, au noeud pres', () => {
  it('pour chaque SVG de reference, sans selection, avec, en Cricut ; un grand dessin ; les etats vides', () => {
    if (!PROFIL) throw new Error('profil');
    const attendu = JSON.parse(readFileSync(EMPREINTES, 'utf8')) as Record<string, string>;
    const obtenu: Record<string, string> = {};
    for (const cle of Object.keys(attendu)) {
      const [nom, variante] = cle.split(' ');
      if (!nom?.endsWith('.svg')) continue;
      const d = lire(readFileSync(resolve(FIXTURES, nom), 'utf8'));
      const sel = d.formes.slice(0, 2).map(f => f.id);
      obtenu[cle] = empreinte(d, variante === 'sel' ? { sel } : variante === 'cricut' ? { sel, profil: PROFIL } : {});
    }
    const grand = lire(GRAND), vide = { ...grand, formes: [] };
    obtenu['grand'] = empreinte(grand, { sel: ['f299'] });
    obtenu['grand cricut'] = empreinte(grand, { sel: ['f299'], profil: PROFIL });
    obtenu['vide'] = empreinte(vide);
    obtenu['vide passe'] = empreinte(vide, { passe: true });
    // Les octets du DOM ne changent que par decision relue (ADR-0009) : ACTUALISER_REFERENCES=1 reecrit les empreintes.
    if (process.env['ACTUALISER_REFERENCES'] === '1') writeFileSync(EMPREINTES, JSON.stringify(obtenu, null, 1));
    expect(Object.keys(obtenu).length).toBeGreaterThan(300);
    expect(obtenu).toEqual(attendu);
  });

  it('n y pose ni grille, ni ligne de groupe', () => {
    const html = rendreCalques(lire(GRAND));
    expect(html).not.toMatch(/treegrid|role="row"|aria-level|calque-chevron/);
  });
});

/** Un ciel (un nuage de deux formes dedans, et un soleil), une forme seule dessous. */
const RICHE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<g data-ed-nom="Ciel"><g data-ed-nom="Nuage"><rect x="40" y="40" width="80" height="60" fill="#c81e28"/><rect x="160" y="40" width="80" height="60" fill="#1f4e8c"/></g>'
  + '<circle cx="300" cy="60" r="30" fill="#e0b84a"/></g>'
  + '<rect x="40" y="180" width="80" height="60" fill="#2a7d4f"/>'
  + '</svg>';

describe('un dessin riche montre ses calques en arbre', () => {
  const d = lire(RICHE, 'riche');
  const ciel = Object.values(d.groupes ?? {}).find(g => g.nom === 'Ciel')?.id ?? '';
  const nuage = Object.values(d.groupes ?? {}).find(g => g.nom === 'Nuage')?.id ?? '';

  it('une grille nommee, multiselection, ses lignes de niveau 1 seulement tant que rien n est deplie', () => {
    const html = rendreCalques(d);
    expect(html).toMatch(/<div role="treegrid" class="arbre-calques" aria-labelledby="[^"]+" aria-multiselectable="true" aria-rowcount="2"/);
    expect(html.match(/role="row"/g)?.length).toBe(2);
    expect(html).toContain('aria-label="Groupe « Ciel », 2 éléments"');
    // La forme seule, au premier plan (peinte la derniere) : son nom de toujours, sans chevron ; le ciel dessous.
    expect(html).toMatch(/aria-level="1" aria-posinset="1" aria-setsize="2" aria-rowindex="1" aria-selected="false" aria-label="Rectangle 4, /);
    expect(html).toMatch(/aria-level="1" aria-posinset="2" aria-setsize="2" aria-rowindex="2" aria-expanded="false" aria-selected="false"/);
    expect(html).toContain('aria-label="Déplier le groupe « Ciel »"');
    // Un seul arret de tabulation : la premiere ligne.
    expect(html.match(/tabindex="0"/g)?.length).toBe(1);
    expect(html).not.toContain('<ol');
  });

  it('deplie, les enfants viennent sous leur groupe, du premier plan au fond, au niveau suivant', () => {
    const html = rendreCalques(d, { deplies: new Set([ciel, nuage]), sel: ['f2'], contexte: nuage });
    const ordre = [...html.matchAll(/data-ligne="([^"]+)" aria-level="(\d)"/g)].map(m => m[1] + ':' + m[2]);
    expect(ordre).toEqual(['f4:1', ciel + ':1', 'f3:2', nuage + ':2', 'f2:3', 'f1:3']);
    expect(html).toContain('aria-label="Replier le groupe « Ciel »"');
    // La ligne choisie porte l'arret de tabulation ; le groupe du contexte se dit courant.
    expect(html).toMatch(/class="calque-ligne choisi" data-ligne="f2"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(html).toMatch(/class="calque-ligne contexte" data-ligne="g\d+"[^>]*aria-current="true"/);
    expect(html).toContain('style="padding-inline-start:calc(var(--esp-l) * 2)"');
  });

  it('se fenetre au-dela de 150 lignes visibles, deux cales a la place des autres', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">' + Array.from({ length: 200 }, (_, i) => '<g><rect x="' + i + '" y="0" width="5" height="5"/><rect x="' + i + '" y="9" width="5" height="5"/></g>').join('') + '</svg>';
    const grand = lire(svg, 'riche');
    const html = rendreCalques(grand);
    expect(html).toContain('aria-rowcount="200"');
    expect(html.match(/role="row"/g)?.length).toBeLessThan(40);
    expect(html).toMatch(/<div data-cale="" aria-hidden="true" style="height:\d+px"><\/div><\/div><\/aside>$/);
  });

  it('a la souris, seules la ligne active et une ligne masquee ou verrouillee dessinent leurs boutons ; les cellules restent', () => {
    // Le budget du DOM de la grille (annexe 7 §4, paquet 2-D) : un pointeur qui survole finement (une souris) voit les boutons de la
    // ligne active et de la ligne survolee ; une ligne masquee ou verrouillee garde les siens, son etat se lit sur eux. Au doigt (et
    // hors navigateur, comme dans les autres cas de ce fichier), chaque ligne garde ses boutons.
    const masque: DessinSvg = { ...d, formes: d.formes.map(f => (f.id === 'f3' ? { ...f, visible: false } : f)) };
    const avant = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = { matchMedia: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }) };
    try {
      const html = rendreCalques(d, { deplies: new Set([ciel, nuage]), sel: ['f2'] });
      expect(html.match(/role="row"/g)?.length).toBe(6);
      expect(html.match(/class="calque-cellule-bascule"/g)?.length).toBe(12);
      // La ligne active (la choisie) seule a ses deux boutons, l'arret de tabulation sur la ligne.
      const avecBoutons = html.split('data-ligne="').slice(1).filter(l => l.includes('data-action="visible"')).map(l => l.slice(0, l.indexOf('"')));
      expect(avecBoutons).toEqual(['f2']);
      expect(html.match(/data-action="(visible|verrou)"/g)?.length).toBe(2);
      // Une forme masquee garde son bouton « Afficher » (et le verrou voisin), sans etre active (l'active est la premiere ligne).
      const h2 = rendreCalques(masque, { deplies: new Set([ciel]) });
      expect(h2).toContain('aria-label="Afficher la forme 3"');
      expect(h2.match(/data-action="(visible|verrou)"/g)?.length).toBe(4);
    } finally {
      (globalThis as { window?: unknown }).window = avant;
    }
    // Hors navigateur : toutes les lignes ont leurs boutons, comme au doigt.
    expect(rendreCalques(d, { deplies: new Set([ciel, nuage]) }).match(/data-action="visible"/g)?.length).toBe(6);
  });

  it('en Cricut, les deux groupes d operations d abord, l arbre dessous', () => {
    if (!PROFIL) throw new Error('profil');
    const html = rendreCalques(d, { profil: PROFIL });
    const operations = html.indexOf('groupe-operation'), arbre = html.indexOf('role="treegrid"');
    expect(operations).toBeGreaterThan(0);
    expect(arbre).toBeGreaterThan(operations);
  });
});
