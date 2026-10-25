// Les formats d'export des fabricants et des imprimeurs (DXF, EPS, PDF avec fond perdu, PNG avec resolution, JPEG,
// WebP, options du SVG) : ce que l'utilisateur recoit vraiment, lu octet par octet, et le menu au doigt.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { RACINE_DEPOT, attendreAnimations, boutonTelecharger, ouvrirExemple, ouvrirMenu, pilote } from './aide.js';

const AXE = readFileSync(RACINE_DEPOT + '/node_modules/axe-core/axe.min.js', 'utf8');
const BOUTONS = '.menu-panneau .contenu-export button';

describe('exports : formats de fabrication et d\'impression', () => {
  const navigateur = pilote();

  async function menuExport(options: { largeur?: number; hauteur?: number; tactile?: boolean } = {}) {
    const { page } = await navigateur.ouvrir(options.tactile ? { largeur: 420, hauteur: 860, tactile: true } : {});
    await ouvrirExemple(page, options.tactile);
    await ouvrirMenu(page, 'Autres formats');
    return page;
  }

  async function telecharger(page: Page, action: () => Promise<void>): Promise<{ nom: string; octets: Buffer }> {
    const [dl]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
    return { nom: dl.suggestedFilename(), octets: readFileSync(await dl.path()) };
  }

  const bouton = (page: Page, nom: string | RegExp) => page.locator(BOUTONS, { hasText: nom });
  const ouvrirOptions = async (page: Page) => { await page.locator('.menu-panneau .section > summary', { hasText: 'Options d’export' }).click(); };
  const champ = (page: Page, nom: string) => page.locator('.menu-panneau [aria-label="' + nom + '"]');

  it('telecharge un DXF R12 lisible : sections, calques par couleur, polylines fermees', async () => {
    const page = await menuExport();
    const { nom, octets } = await telecharger(page, () => bouton(page, /^DXF$/).click());
    expect(nom).toBe('exemple.dxf');
    const t = octets.toString('latin1'), lignes = t.split(/\r?\n/);
    expect(lignes.length % 2).toBe(1);
    const valeurs = lignes.filter((_, i) => i % 2 === 1);
    expect(valeurs.slice(0, 2)).toEqual(['SECTION', 'HEADER']);
    expect(valeurs[valeurs.length - 1]).toBe('EOF');
    expect(valeurs.filter(v => v === 'SECTION').length).toBe(valeurs.filter(v => v === 'ENDSEC').length);
    expect(valeurs.filter(v => v === 'POLYLINE').length).toBe(4);
    expect(valeurs.filter(v => v === 'SEQEND').length).toBe(4);
    expect(t).toMatch(/COULEUR_[0-9A-F]{6}/);
    expect(t).toContain('AC1009');
  });

  it('telecharge un EPS niveau 2 avec son cadre', async () => {
    const page = await menuExport();
    const { nom, octets } = await telecharger(page, () => bouton(page, /^EPS$/).click());
    expect(nom).toBe('exemple.eps');
    const t = octets.toString('latin1');
    expect(t.startsWith('%!PS-Adobe-3.0 EPSF-3.0\n')).toBe(true);
    expect(t).toMatch(/%%BoundingBox: 0 0 \d+ \d+\n%%HiResBoundingBox: 0 0 [\d.]+ [\d.]+\n%%LanguageLevel: 2/);
    expect(t).toContain('showpage');
    expect(t.match(/ m\n/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('regle le PDF : page A4, fond perdu et reperes, couleurs CMJN, titre', async () => {
    const page = await menuExport();
    const pdf0 = await telecharger(page, () => bouton(page, 'PDF vectoriel').click());
    expect(pdf0.octets.toString('latin1')).not.toMatch(/TrimBox|DeviceCMYK| k\n/);
    await ouvrirOptions(page);
    await champ(page, 'Format de page du PDF').selectOption({ label: 'A4' });
    await page.getByLabel('Fond perdu et repères de coupe').check();
    await page.getByLabel('Couleurs en CMJN (PDF et EPS)').check();
    await champ(page, 'Titre du PDF et de l’EPS').fill('Affiche');
    expect(await page.locator('.menu-panneau').count()).toBe(1);
    const { octets } = await telecharger(page, () => bouton(page, 'PDF vectoriel').click());
    const t = octets.toString('latin1');
    const boite = (n: string) => new RegExp('/' + n + ' \\[([^\\]]*)\\]').exec(t)?.[1]?.split(' ').map(Number) ?? [];
    const media = boite('MediaBox'), trim = boite('TrimBox'), bleed = boite('BleedBox');
    expect(boite('CropBox')).toEqual(media);
    // A4 : 297 x 210 mm (le dessin est plus large que haut), plus 9 mm de repères de chaque côté.
    expect(trim[2]! - trim[0]!).toBeCloseTo((297 * 72) / 25.4, 1);
    expect(bleed[0]).toBeCloseTo(trim[0]! - (3 * 72) / 25.4, 1);
    expect(media[2]! - trim[2]!).toBeCloseTo((9 * 72) / 25.4, 1);
    expect(t).toMatch(/ k\n/);
    expect(t).toContain('1 1 1 1 K');
    expect(t).not.toMatch(/ rg\n| RG\n/);
    expect(t).toContain('/Title (Affiche)');
  });

  it('exporte un PNG avec sa resolution : 100 mm a 300 ppp font 1181 px et un bloc pHYs juste', async () => {
    const page = await menuExport();
    await ouvrirOptions(page);
    await champ(page, 'Unité d’export').selectOption('mm');
    await champ(page, 'Largeur du dessin exporté').fill('100');
    await champ(page, 'Résolution du PNG').selectOption('300');
    expect(await page.locator('.menu-panneau').innerText()).toMatch(/Hauteur : [\d,\s]+mm/);
    const { nom, octets } = await telecharger(page, () => bouton(page, /^PNG$/).click());
    expect(nom).toBe('exemple-1181.png');
    expect(octets.readUInt32BE(16)).toBe(1181);
    // pHYs vient juste apres IHDR (8 + 25 octets) : longueur 9, type, 11811 points par metre en x et y, unite metre, puis CRC.
    expect(octets.readUInt32BE(33)).toBe(9);
    expect(octets.subarray(37, 41).toString('latin1')).toBe('pHYs');
    expect(octets.readUInt32BE(41)).toBe(11811);
    expect(octets.readUInt32BE(45)).toBe(11811);
    expect(octets[49]).toBe(1);
    const { crc32 } = await import('node:zlib').then(z => ({ crc32: (z as unknown as { crc32?: (b: Buffer) => number }).crc32 }));
    if (crc32) expect(octets.readUInt32BE(50)).toBe(crc32(octets.subarray(37, 50)));
  });

  it('exporte un PNG sans resolution comme avant : aucun bloc pHYs', async () => {
    const page = await menuExport();
    const { octets } = await telecharger(page, () => bouton(page, /^PNG$/).click());
    expect(octets.subarray(37, 41).toString('latin1')).not.toBe('pHYs');
  });

  it('exporte un JPEG sur le fond choisi et un WebP', async () => {
    const page = await menuExport();
    await page.locator('.menu-panneau select[aria-label="Largeur du PNG"]').selectOption('512');
    const jpeg = await telecharger(page, () => bouton(page, /^JPEG$/).click());
    expect(jpeg.nom).toBe('exemple-512.jpg');
    expect([...jpeg.octets.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const webp = await telecharger(page, () => bouton(page, /^WebP$/).click());
    expect(webp.nom).toBe('exemple-512.webp');
    expect(webp.octets.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(webp.octets.subarray(8, 12).toString('latin1')).toBe('WEBP');
  });

  it('ecrit un SVG a la taille voulue et a la precision voulue, le SVG d\'avant sinon', async () => {
    const page = await menuExport();
    // Le SVG a son bouton dans la barre (« Télécharger le SVG ») : il suit les options d'export reglees sous « Autres formats ».
    const avant = await telecharger(page, () => boutonTelecharger(page).click());
    await ouvrirMenu(page, 'Autres formats');
    await ouvrirOptions(page);
    await champ(page, 'Unité d’export').selectOption('mm');
    await champ(page, 'Largeur du dessin exporté').fill('80,5');
    await champ(page, 'Décimales des coordonnées du SVG').selectOption('1');
    const apres = await telecharger(page, () => boutonTelecharger(page).click());
    const racine = /^<svg[^>]*>/.exec(apres.octets.toString('utf8'))?.[0] ?? '';
    expect(racine).toMatch(/width="80\.5mm" height="[\d.]+mm"/);
    expect(racine).toContain(/viewBox="[^"]*"/.exec(avant.octets.toString('utf8'))?.[0] ?? '?');
    expect(apres.octets.length).toBeLessThan(avant.octets.length);
    await ouvrirMenu(page, 'Autres formats');
    const decoupe = await telecharger(page, () => bouton(page, 'SVG de découpe').click());
    expect(decoupe.octets.toString('utf8')).toMatch(/width="80\.5mm"/);
  });

  it('garde les options le temps de la session, quand le menu se referme', async () => {
    const page = await menuExport();
    await ouvrirOptions(page);
    await champ(page, 'Résolution du PNG').selectOption('150');
    await page.keyboard.press('Escape');
    await ouvrirMenu(page, 'Autres formats');
    await ouvrirOptions(page);
    expect(await champ(page, 'Résolution du PNG').inputValue()).toBe('150');
  });

  it('n\'a aucune violation axe, menu et options ouverts', async () => {
    const page = await menuExport();
    await ouvrirOptions(page);
    await champ(page, 'Format de page du PDF').selectOption({ label: 'Personnalisée' });
    await page.getByLabel('Fond perdu et repères de coupe').check();
    await page.getByLabel('Couleurs en CMJN (PDF et EPS)').check();
    await attendreAnimations(page);
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; help: string; nodes: { target: unknown[] }[] }[]; incomplete: { id: string; nodes: { target: unknown[] }[] }[] }> } };
      const res = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
      return { v: res.violations.map(x => x.id + ' ' + x.help + ' ' + JSON.stringify(x.nodes.map(n => n.target))), i: res.incomplete.map(x => x.id + ' ' + JSON.stringify(x.nodes.map(n => n.target))) };
    });
    expect(r.v).toEqual([]);
    expect(r.i.filter(x => x.includes('menu-panneau') || x.includes('options-export') || x.includes('contenu-export'))).toEqual([]);
  });
});

describe('exports : au doigt (420 px)', () => {
  const navigateur = pilote();

  it('tient dans l\'ecran et donne 40 px aux commandes, options ouvertes', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 420, hauteur: 860, tactile: true });
    await ouvrirExemple(page, true);
    await ouvrirMenu(page, 'Autres formats');
    await page.locator('.menu-panneau .section > summary', { hasText: 'Options d’export' }).click();
    await page.locator('.menu-panneau [aria-label="Format de page du PDF"]').selectOption({ label: 'Personnalisée' });
    await page.getByLabel('Fond perdu et repères de coupe').check();
    // Le panneau et les sections s'animent a l'ouverture : on mesure une fois posees.
    await page.waitForTimeout(600);
    const panneau = await page.locator('.menu-panneau').boundingBox();
    expect(panneau).not.toBeNull();
    expect(panneau!.x).toBeGreaterThanOrEqual(0);
    expect(panneau!.x + panneau!.width).toBeLessThanOrEqual(420 + 0.5);
    expect(panneau!.y + panneau!.height).toBeLessThanOrEqual(860 + 0.5);
    // Pas de defilement horizontal du menu ni de la page.
    expect(await page.locator('.menu-panneau').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    // `clientWidth` : sous `isMobile`, Chromium elargit `innerWidth` jusqu'au contenu qui deborde.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const petites = await page.locator('.menu-panneau .contenu-export').evaluate(zone => {
      const cibles = [...zone.querySelectorAll<HTMLElement>('button:not([hidden]), select, input[type="text"], input[type="color"], label.case')];
      return cibles.map(e => { const r = e.getBoundingClientRect(); return { nom: (e.getAttribute('aria-label') ?? e.innerText ?? e.className).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height) }; })
        .filter(c => c.h < 40 || (c.l < 40));
    });
    expect(petites).toEqual([]);
  });
});
