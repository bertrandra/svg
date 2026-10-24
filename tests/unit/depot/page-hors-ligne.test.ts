import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cssJetons } from '../../../src/styles/jetons.js';

// « Rien ne quitte votre navigateur » doit etre vrai a la lettre pour la page autonome : elle ne contacte aucun hote
// tiers en s'ouvrant (avant, ses polices venaient de fonts.googleapis.com et fonts.gstatic.com, et l'adresse IP de la
// personne partait chez Google). Ici la preuve se lit dans le texte de la page ; tests/e2e/hors-ligne.e2e.ts la refait en
// navigateur, reseau coupe. La page est composee comme le build le fait (scripts/page.mjs), moteur excepte : le moteur est du
// code, ses chaines (un xmlns, une adresse dans un message) ne sont pas des requetes, et c'est le navigateur qui le dit.

const racine = resolve(__dirname, '../../..');
interface Page { composerPage: (moteur: string) => Promise<string>; REPERES_PAGE: string[] }
interface Fontes { FONTES_INTERFACE: Array<{ famille: string; graisses: number[] }>; cssFontesInterface: () => string }
const charger = async <T>(fichier: string) => (await import(pathToFileURL(join(racine, 'scripts', fichier)).href)) as T;

/** Le HTML hors des balises <script> : ce que le navigateur charge sans rien executer. */
const sansScripts = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, '<script></script>');

describe('la page autonome ne contacte aucun hote', () => {
  let source = '';
  let page = '';
  let fontes: Fontes;

  beforeAll(async () => {
    source = readFileSync(join(racine, 'outils/editeur-svg/page.html'), 'utf8');
    const { composerPage } = await charger<Page>('page.mjs');
    fontes = await charger<Fontes>('fontes-interface.mjs');
    page = await composerPage('');
  }, 60_000);

  it('page.html ne nomme aucun hote : ni service de fontes, ni adresse, ni feuille ou lien externe', () => {
    expect(source).not.toMatch(/googleapis|gstatic|google\.com|typekit|bunny\.net|cdnjs|jsdelivr|unpkg/i);
    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toMatch(/<link\b/i);
    expect(source).not.toMatch(/@import/i);
    expect(source).not.toMatch(/\burl\(/i);
  });

  it('la page composee ne charge rien hors de sa propre source : pas de <link>, de @import, ni d adresse', () => {
    const html = sansScripts(page);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<(?:img|iframe|embed|object|source|video|audio|track|input)\b[^>]*\bsrc=/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/https?:\/\/|(?:^|[\s"'(=])\/\/[a-z0-9.-]+\.[a-z]/i);
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i);
    // Aucun repere de page.html ne doit rester dans la page composee.
    expect(page).not.toMatch(/\/\*(?:FONTES|JETONS|STYLE_BASE|STYLE_EDITEUR|MOTEUR)\*\//);
  });

  it('chaque url() des styles est une data: URI, et aucun lien de la page ne sort d elle', () => {
    const html = sansScripts(page);
    const urls = [...html.matchAll(/url\(\s*(["']?)([^"')\s]*)\1\s*\)/gi)].map(m => m[2] ?? '');
    expect(urls.length).toBeGreaterThanOrEqual(6);
    expect(urls.filter(u => !/^data:/i.test(u)).slice(0, 5)).toEqual([]);
    const liens = [...html.matchAll(/\b(?:href|src|action|poster|srcset)=("[^"]*"|'[^']*')/gi)].map(m => (m[1] ?? '').slice(1, -1));
    expect(liens.filter(l => !/^(?:#|data:|about:)/i.test(l))).toEqual([]);
  });

  it('porte un @font-face par famille et par graisse que l interface demande, en WOFF2 valide', () => {
    const faces = [...page.matchAll(/@font-face \{ font-family: "([^"]+)"; [^}]*font-weight: (\d+);[^}]*src: url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g)];
    const lues = faces.map(m => (m[1] ?? '') + ' ' + (m[2] ?? ''));
    const attendues = fontes.FONTES_INTERFACE.flatMap(f => f.graisses.map(g => f.famille + ' ' + g));
    expect(lues).toEqual(attendues);
    expect(attendues).toEqual(['Instrument Sans 400', 'Instrument Sans 500', 'Instrument Sans 600', 'Instrument Sans 700', 'IBM Plex Mono 400', 'IBM Plex Mono 500']);
    for (const m of faces) {
      const octets = Buffer.from(m[3] ?? '', 'base64');
      expect(octets.subarray(0, 4).toString('latin1'), (m[1] ?? '') + ' ' + (m[2] ?? '')).toBe('wOF2');
      expect(octets.length).toBeGreaterThan(5_000);
    }
  });

  it('les fontes de la pile --sans et --mono sont celles que la page declare, et la pile retombe sur le systeme', () => {
    const pile = (nom: string) => new RegExp('--' + nom + ': ([^;]+);').exec(cssJetons())?.[1] ?? '';
    for (const [nom, generique] of [['sans', 'sans-serif'], ['mono', 'monospace']] as const) {
      const familles = pile(nom).split(',').map(f => f.trim().replace(/^"|"$/g, ''));
      expect(familles[0], '--' + nom).toBeDefined();
      // La premiere famille est celle de la page ; elle y est declaree, donc jamais demandee a un serveur.
      expect(fontes.FONTES_INTERFACE.map(f => f.famille), '--' + nom + ' : ' + familles[0]).toContain(familles[0]);
      // Au moins une famille systeme entre la fonte et le generique : si la data: URI n'est pas lue, le texte reste lisible.
      expect(familles.length, '--' + nom).toBeGreaterThanOrEqual(3);
      expect(familles[familles.length - 1], '--' + nom).toBe(generique);
    }
  });

  it('tient dans le budget : moins de 150 Ko de plus dans la page', () => {
    const css = fontes.cssFontesInterface();
    expect(css.length).toBeLessThan(150 * 1024);
    expect(css.length).toBeGreaterThan(100 * 1024);
    expect(page).toContain(css);
  });
});
