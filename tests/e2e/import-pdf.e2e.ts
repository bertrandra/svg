// L'import PDF depuis l'accueil (ADR-0020) : choisir ou deposer un PDF, ses traces deviennent les formes de l'editeur ; un PDF de
// plusieurs pages propose « Page 1 sur N » ; ce qui n'est pas repris est dit ; un PDF chiffre ou casse est refuse en le nommant ;
// le texte se dessine en lettres (police embarquee exacte, ou remplacee et dite), celui d'un SVG aussi. Au clavier, au doigt
// a 390 px, et sans aucune violation ni doute d'axe-core.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, deposerFichier, formesVisibles, ouvrirCode, pilote, RACINE_DEPOT, texteDe, URL_INTEGRATION } from './aide.js';

const PDF = (nom: string) => resolve(RACINE_DEPOT, 'tests/fixtures/pdf', nom);
const ENTREE = 'section[aria-label="Ouvrir un SVG ou un PDF"] input[type=file]';
const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Choisit un fichier par le champ de l'accueil (ce que fait le bouton « Choisir un fichier… »). */
const choisir = (page: Page, nom: string) => page.locator(ENTREE).setInputFiles(PDF(nom));
const message = (page: Page) => texteDe(page.locator('main > .message'));
/** Ce que l'editeur dit, une fois ouvert, de ce que la lecture n'a pas repris (panneau du dessin). */
const note = async (page: Page) => ((await page.locator('.editeur-svg [role=note]').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();

/** Depose un fichier sur la zone de depot, comme un glisser depuis le bureau. */
async function deposer(page: Page, nom: string): Promise<void> {
  await deposerFichier(page, readFileSync(PDF(nom)), nom, 'application/pdf');
}

/** axe-core sur la page : aucune violation, aucun doute (« incomplete »), quel que soit leur impact. */
async function auditer(page: Page): Promise<void> {
  await attendreAnimations(page);
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }>; incomplete: Array<{ id: string; nodes: unknown[] }> }> } };
    const x = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
    return { violations: x.violations.map(v => v.id + ' ×' + v.nodes.length), incomplete: x.incomplete.map(v => v.id + ' ×' + v.nodes.length) };
  });
  expect(r).toEqual({ violations: [], incomplete: [] });
}

describe('import PDF depuis l accueil', () => {
  const navigateur = pilote();

  it('dit « SVG ou PDF » sur la voie, son aide et le depot, et accepte les PDF au choix de fichier', async () => {
    const { page } = await navigateur.ouvrir();
    expect(await texteDe(page.locator('#voie-svg'))).toBe('Ouvrir un SVG ou un PDF Un fichier SVG ou PDF, du code collé, ou l’exemple');
    expect(await texteDe(page.locator('.depot p').first())).toBe('Déposez un fichier SVG ou PDF ici, ou');
    expect(await page.locator(ENTREE).getAttribute('accept')).toContain('.pdf');
    // Ce qui reste propre au SVG garde son nom.
    expect(await page.getByText('Ou collez le code d’un SVG').count()).toBe(1);
  });

  it('un PDF d une page s ouvre aussitot dans l editeur, ses traces en formes', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'minimal.pdf');
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(4);
    expect(await page.locator('.editeur-svg').getAttribute('aria-label')).toBe('Éditer : minimal.svg');
  });

  it('un PDF compresse (table et flux d objets en flux, formulaire) se lit par la decompression du navigateur', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'compresse.pdf');
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(5);
  });

  it('un PDF de plusieurs pages propose « Page 1 sur 3 » et ouvre la page choisie', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'pages.pdf');
    const liste = page.getByRole('combobox', { name: 'Page' });
    await liste.waitFor();
    expect(await message(page)).toBe('« pages.pdf » compte 3 pages : choisissez celle à ouvrir.');
    expect(await liste.locator('option:checked').innerText()).toBe('Page 1 sur 3');
    expect(await liste.locator('option').allInnerTexts()).toEqual(['Page 1 sur 3', 'Page 2 sur 3', 'Page 3 sur 3']);
    // Une seule action pleine : celle du choix de page.
    expect(await page.locator('main button.primaire:visible').allInnerTexts()).toEqual(['Ouvrir la page']);
    await liste.selectOption('2');
    await page.getByRole('button', { name: 'Ouvrir la page' }).click();
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(2);
    expect(await page.locator('.editeur-svg').getAttribute('aria-label')).toBe('Éditer : pages-page-2.svg');
  });

  it('dit ce qui n est pas repris : images comptees, Helvetica remplacee par Inter', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'texte-image.pdf');
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => note(page)).toBe('Non repris à l’ouverture : 2 images (une image se vectorise par « Convertir une image ») ; 2 textes en Helvetica, police remplacée par Inter. Le rendu peut différer de l’original.');
    // Les lettres du texte sont des formes : deux formes de traces, et les lettres de « Bonjour » et « Aurevoir ».
    expect(await formesVisibles(page)).toBe(2 + 7 + 8);
  });

  it('le texte d une police TrueType embarquee se dessine exactement, en formes', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'texte-truetype.pdf');
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(30);
    await attend(() => note(page)).toBe('Non repris à l’ouverture : 1 texte en Helvetica, police remplacée par Inter. Le rendu peut différer de l’original.');
  });

  it('le texte d un SVG se dessine en lettres, et le remplacement de sa police est dit', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80"><text x="10" y="50" font-family="Arial" font-size="32" fill="#1428a0">Fête</text></svg>');
    expect(await formesVisibles(page)).toBe(4);
    await attend(() => note(page)).toBe('Non repris à l’ouverture : 1 texte en Arial, police remplacée par Inter. Le rendu peut différer de l’original.');
  });

  it('l editeur embarque dessine en lettres le texte de son option svg quand l hote sert polices.js (baseAnnexes)', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await page.goto(URL_INTEGRATION);
    await page.evaluate(() => {
      const w = window as unknown as { EditeurSvg: { ouvrir(o: Record<string, unknown>): unknown } };
      w.EditeurSvg.ouvrir({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><text x="5" y="30" font-family="Lobster" font-size="24">Noël</text></svg>', onEnregistrer: () => undefined, baseAnnexes: '../dist' });
    });
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(4);
  });

  it('refuse en le nommant un PDF chiffre ou casse, sans ouvrir l editeur', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'chiffre.pdf');
    await attend(() => message(page)).toBe('Ce PDF est chiffré (protégé par un mot de passe ou par des restrictions) : il ne s’ouvre pas ici. Enregistrez-en une copie sans protection depuis votre logiciel, puis rouvrez-la.');
    await choisir(page, 'malforme.pdf');
    await attend(() => message(page)).toBe('Ce PDF ne se lit pas : aucun objet n’y a été trouvé (fichier tronqué ou endommagé).');
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
  });

  it('s ouvre par un glisser-deposer sur la zone de depot', async () => {
    const { page } = await navigateur.ouvrir();
    await deposer(page, 'minimal.pdf');
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(4);
  });

  it('se choisit au clavier : le focus va a la liste des pages, fleche, Tab, Entree', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'pages.pdf');
    const liste = page.getByRole('combobox', { name: 'Page' });
    await liste.waitFor();
    await attend(() => aLeFocus(liste)).toBe(true);
    await liste.selectOption('3');
    await page.keyboard.press('Tab');
    await attend(() => aLeFocus(page.getByRole('button', { name: 'Ouvrir la page' }))).toBe(true);
    await page.keyboard.press('Enter');
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(1);
  });

  it('au doigt a 390 px : des cibles de 40 px, et la page choisie s ouvre', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await choisir(page, 'pages.pdf');
    const liste = page.getByRole('combobox', { name: 'Page' });
    await liste.waitFor();
    for (const l of [liste, page.getByRole('button', { name: 'Ouvrir la page' }), page.getByRole('button', { name: 'Annuler' })]) {
      const b = await l.boundingBox();
      expect(b?.height ?? 0).toBeGreaterThanOrEqual(40);
      expect((b?.x ?? -1) >= 0 && (b?.x ?? 0) + (b?.width ?? 0) <= 390).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await liste.selectOption('2');
    await page.getByRole('button', { name: 'Ouvrir la page' }).tap();
    await page.locator('.editeur-cadre').waitFor();
    expect(await formesVisibles(page)).toBe(2);
  });

  it('axe-core : aucune violation ni doute, accueil avec le choix de page, puis editeur apres import', async () => {
    const { page } = await navigateur.ouvrir();
    await choisir(page, 'pages.pdf');
    await page.getByRole('combobox', { name: 'Page' }).waitFor();
    await auditer(page);
    await page.getByRole('button', { name: 'Ouvrir la page' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await auditer(page);
  });
});
