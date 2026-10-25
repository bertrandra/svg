// Le texte vivant (ADR-0022), par la vraie page : creer un texte, le retaper en place, changer de police, l'enregistrer et
// le rouvrir comme texte ; le vectoriser dans les trois modes ; l'apercu « forme / ligne » ; le clavier seul ; au doigt.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { aLeFocus, attend, boutonTelecharger, modifications, nombreDeCalques, ouvrirCode, ouvrirExemple, ouvrirMenu, pilote, texteDe } from './aide.js';

const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="40" height="40" fill="#1f4e8c"/></svg>';

describe('le texte vivant', () => {
  const navigateur = pilote();
  const message = (page: Page) => texteDe(page.locator('.message-etat'));
  const inspecteur = (page: Page) => page.locator('.editeur-inspecteur');
  const textePanneau = (page: Page) => inspecteur(page).locator('textarea[aria-label="Texte"]');

  /** Ouvre un plan presque vide, et ajoute un texte vivant par l'outil Texte ; rend son identifiant. */
  async function ajouter(page: Page, texte: string, police = 'inter', tactile = false): Promise<string> {
    await ouvrirCode(page, PLAN, tactile);
    const bouton = page.locator('.editeur-barre button[title^="Texte (T)"]');
    if (await bouton.isVisible()) { if (tactile) await bouton.tap(); else await bouton.click(); } else await page.keyboard.press('t');
    await inspecteur(page).locator('select[aria-label="Police"]').waitFor({ timeout: 30_000 });
    await textePanneau(page).fill(texte);
    await inspecteur(page).locator('select[aria-label="Police"]').selectOption(police);
    const ajout = page.getByRole('button', { name: 'Ajouter le texte' });
    if (tactile) await ajout.tap(); else await ajout.click();
    await attend(() => nombreDeCalques(page)).toBe(2);
    return 'f2';
  }

  /** Le SVG telecharge par « Télécharger le SVG » de la barre : ce que l'on rouvre. */
  async function enregistrerEtTelecharger(page: Page): Promise<string> {
    const [telechargement]: [Download, void] = await Promise.all([page.waitForEvent('download'), boutonTelecharger(page).click()]);
    return readFileSync(await telechargement.path(), 'utf8');
  }

  /** Double-clique un point peint du texte (pas un blanc entre deux lettres). */
  async function doubleCliquerTexte(page: Page, id: string): Promise<void> {
    const point = await page.evaluate(i => {
      const p = document.querySelector<SVGPathElement>('.editeur-svg-toile path[data-id="' + i + '"]');
      const r = p?.getBoundingClientRect();
      if (!p || !r) return null;
      // Un point peint au coeur du texte : le milieu de ceux que l'on trouve, pas un bord d'accent.
      const peints: Array<{ x: number; y: number }> = [];
      for (let y = r.top + 2; y < r.bottom; y += 3) for (let x = r.left + 2; x < r.right; x += 3) if (document.elementFromPoint(x, y) === p) peints.push({ x, y });
      return peints[Math.floor(peints.length / 2)] ?? null;
    }, id);
    if (!point) throw new Error('aucun point peint du texte');
    await page.mouse.dblclick(point.x, point.y);
  }

  it('cree un texte vivant, le retape en place, change de police, l enregistre et le rouvre comme texte', async () => {
    const { page } = await navigateur.ouvrir();
    const id = await ajouter(page, 'Bonne fête');
    expect(await message(page)).toBe('Texte ajouté en Inter : il reste modifiable, un double-clic ou Entrée le retape.');
    expect(await page.locator('.editeur-svg-toile text').count()).toBe(0);
    await attend(() => texteDe(inspecteur(page).locator('h3'))).toBe('Texte « Bonne fête » 2');

    // Double-clic : la saisie sur la toile (ADR-0027), focalisee, nommee ; Echap la termine, le texte garde.
    await doubleCliquerTexte(page, id);
    const saisie = page.locator('textarea.saisie-champ[aria-label="Texte sur la toile"]');
    await attend(() => aLeFocus(saisie)).toBe(true);
    await page.keyboard.press('End');
    await page.keyboard.type(' Léa');
    await page.keyboard.press('Escape');
    await attend(() => saisie.count()).toBe(0);
    await attend(() => message(page)).toBe('Texte modifié : « Bonne fête Léa ».');
    // Toute la frappe est une seule modification.
    expect(await modifications(page)).toBe(2);
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);

    // Une autre police recompose le texte (une modification de plus).
    await inspecteur(page).locator('select[aria-label="Police"]').selectOption('lobster');
    await attend(() => modifications(page)).toBe(3);

    const svg = await enregistrerEtTelecharger(page);
    expect(svg).not.toContain('<text');
    expect(svg).toContain('data-ed-texte="Bonne%20f%C3%AAte%20L%C3%A9a" data-ed-police="lobster" data-ed-police-version="');

    // Rouvert : un texte vivant, que l'on retape encore.
    const { page: autre } = await navigateur.ouvrir();
    await ouvrirCode(autre, svg);
    await autre.locator('.editeur-svg-toile path[data-id="f2"]').click({ force: true });
    await attend(() => textePanneau(autre).inputValue()).toBe('Bonne fête Léa');
    await expect(autre.locator('.editeur-inspecteur select[aria-label="Police"]').inputValue()).resolves.toBe('lobster');
  });

  // Depuis l'ADR-0027, Echap termine la saisie en gardant le texte (comme un clic hors du texte) ; Ctrl+Z defait toute la frappe.
  it('Echap dans la saisie garde le texte en une modification ; Ctrl+Z rend le texte d avant', async () => {
    const { page } = await navigateur.ouvrir();
    const id = await ajouter(page, 'Merci');
    await doubleCliquerTexte(page, id);
    await attend(() => aLeFocus(page.locator('textarea.saisie-champ'))).toBe(true);
    // Ctrl+A choisit tout le texte du champ, que la frappe remplace.
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Au revoir');
    await attend(() => textePanneau(page).inputValue()).toBe('Au revoir');
    await page.keyboard.press('Escape');
    await attend(() => message(page)).toBe('Texte modifié : « Au revoir ».');
    expect(await modifications(page)).toBe(2);
    await page.keyboard.press('Control+z');
    await attend(() => textePanneau(page).inputValue()).toBe('Merci');
    expect(await modifications(page)).toBe(1);
  });

  for (const [mode, libelle, formes] of [['lettres', 'lettres séparées', 5], ['souder', 'souder les lettres qui se touchent', 1], ['tout', 'tout souder', 1]] as const) {
    it('vectorise en mode « ' + libelle + ' » par le menu Edition, et Ctrl+Z rend le texte vivant', async () => {
      const { page } = await navigateur.ouvrir();
      // Des lettres serrees : en Pacifico, « mamie » s'ecrit d'un seul tenant.
      await ajouter(page, 'mamie', 'pacifico');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: new RegExp('^Vectoriser le texte : ' + libelle) }).click();
      await attend(() => message(page)).toMatch(/^1 texte vectorisé/);
      const n = await nombreDeCalques(page) - 1;
      if (mode === 'lettres') expect(n).toBe(formes);
      else expect(n).toBeLessThanOrEqual(2);
      expect(await inspecteur(page).locator('textarea[aria-label="Texte"]').count()).toBe(0);
      await page.keyboard.press('Control+z');
      await attend(() => nombreDeCalques(page)).toBe(2);
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click({ force: true });
      await attend(() => textePanneau(page).inputValue()).toBe('mamie');
    });
  }

  it('un booleen vectorise le texte d abord, et le dit', async () => {
    const { page } = await navigateur.ouvrir();
    await ajouter(page, 'OK');
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+a');
    await page.locator('.editeur-barre-selection button[aria-label^="Union"], .editeur-barre-selection button[title^="Union"]').first().click();
    await attend(() => message(page)).toMatch(/Le texte est vectorisé : il n’est plus modifiable comme texte/);
  });

  it('au clavier seul : T, Entree, saisie sur la toile ; Entree sur le texte le retape ; Ctrl+Maj+O le vectorise', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrirCode(page, PLAN);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
    await page.keyboard.press('Enter');
    const saisie = page.locator('textarea.saisie-champ');
    await attend(() => aLeFocus(saisie)).toBe(true);
    await inspecteur(page).locator('select[aria-label="Police"]').waitFor({ timeout: 30_000 });
    await page.keyboard.type('Atelier');
    await attend(() => nombreDeCalques(page)).toBe(2);
    await page.keyboard.press('Escape');
    // Le texte ajoute est choisi, le focus sur la toile : Entree rouvre sa saisie, le curseur a la fin.
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(saisie)).toBe(true);
    await page.keyboard.type(' 2026');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Paris');
    await page.keyboard.press('Escape');
    await attend(() => textePanneau(page).inputValue()).toBe('Atelier 2026\nParis');
    await page.keyboard.press('Control+Shift+O');
    await attend(() => message(page)).toMatch(/^1 texte vectorisé \(lettres séparées\)/);
    await attend(() => nombreDeCalques(page)).toBeGreaterThan(10);
    await page.keyboard.press('Control+z');
    await attend(() => nombreDeCalques(page)).toBe(2);
  });

  it('l outil points sur un texte le vectorise d abord, et le dit', async () => {
    const { page } = await navigateur.ouvrir();
    await ajouter(page, 'Oui');
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('a');
    await attend(() => message(page)).toBe('Texte vectorisé pour modifier ses points : il n’est plus modifiable comme texte. Ctrl+Z le rend.');
  });

  describe('l apercu forme / ligne', () => {
    const bouton = (page: Page) => inspecteur(page).getByRole('button', { name: 'Aperçu forme / ligne' });

    it('s ouvre et se ferme a la souris, dans le flux, avec ses deux verdicts', async () => {
      const { page } = await navigateur.ouvrir();
      await ajouter(page, 'Lune');
      await expect(bouton(page).first().getAttribute('aria-expanded')).resolves.toBe('false');
      await bouton(page).first().click();
      await expect(bouton(page).first().getAttribute('aria-expanded')).resolves.toBe('true');
      const apercu = inspecteur(page).locator('.apercu-police');
      await expect(apercu.getByRole('img', { name: 'Forme (découpe) : Lettres pleines : la lame suit leur pourtour.' }).count()).resolves.toBe(1);
      // La ligne du stylo d'une police a contour est celle du trace Median (ADR-0027).
      await expect(apercu.getByRole('img', { name: 'Ligne (stylo) : Au stylo : une ligne au milieu du trait (tracé Médian).' }).count()).resolves.toBe(1);
      await apercu.getByRole('button', { name: 'Fermer l’aperçu' }).click();
      await attend(() => apercu.count()).toBe(0);
    });

    it('dit la ligne unique d une police a trait, et s ouvre au clavier', async () => {
      const { page } = await navigateur.ouvrir();
      await ajouter(page, 'Lune', 'ems-readability');
      const b = bouton(page).first();
      await b.focus();
      await page.keyboard.press('Enter');
      await attend(() => b.getAttribute('aria-expanded')).toBe('true');
      const apercu = inspecteur(page).locator('.apercu-police');
      await expect(apercu.getByRole('img', { name: 'Ligne (stylo) : Une seule ligne : idéale au stylo.' }).count()).resolves.toBe(1);
      await expect(apercu.getByRole('img', { name: 'Forme (découpe) : Police à trait : épaissie pour la découpe.' }).count()).resolves.toBe(1);
      await page.keyboard.press('Space');
      await attend(() => b.getAttribute('aria-expanded')).toBe('false');
      // La police a trait se dessine sans fond.
      await expect(page.locator('.editeur-svg-toile path[data-id="f2"]').getAttribute('fill')).resolves.toBe('none');
    });
  });

  it('a 390 px, au doigt : creer, ouvrir l apercu, retaper', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await ouvrirExemple(page, true);
    await page.locator('.editeur-barre button[title^="Texte (T)"]').tap();
    await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
    await inspecteur(page).locator('select[aria-label="Police"]').waitFor({ timeout: 30_000 });
    await textePanneau(page).fill('Salut');
    const avant = await nombreDeCalques(page);
    await page.getByRole('button', { name: 'Ajouter le texte' }).tap();
    await attend(() => nombreDeCalques(page)).toBe(avant + 1);
    const b = inspecteur(page).getByRole('button', { name: 'Aperçu forme / ligne' }).first();
    await b.tap();
    await attend(() => b.getAttribute('aria-expanded')).toBe('true');
    const r = await b.boundingBox();
    expect(r?.height ?? 0).toBeGreaterThanOrEqual(40);
    await textePanneau(page).fill('Salut toi');
    await attend(() => texteDe(inspecteur(page).locator('h3'))).toMatch(/^Texte « Salut toi »/);
  });
});
