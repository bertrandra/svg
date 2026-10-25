// Le texte se tape sur la toile (ADR-0027), par la vraie page : un clic de l'outil Texte pose un point d'insertion et l'on
// tape la ; Entree va a la ligne, Echap termine ; un double-clic rouvre la saisie au bon endroit ; on choisit des caracteres
// a la souris et au clavier, on colle du texte brut ; Ctrl+Z defait la frappe d'un geste ; la barre de texte (police,
// taille, gras, alignement, « Plus d'options ») ; au clavier seul ; a 390 px au doigt.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { readFileSync } from 'node:fs';
import type { Download } from 'playwright';
import { aLeFocus, attend, boutonTelecharger, modifications, nombreDeCalques, NAVIGATEUR, ouvrirCode, permettrePressePapiers, pilote, texteDe } from './aide.js';

const PLAN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="0" y="0" width="40" height="40" fill="#1f4e8c"/></svg>';

describe('le texte se tape sur la toile', () => {
  const navigateur = pilote();
  const champ = (page: Page) => page.locator('textarea.saisie-champ');
  const barre = (page: Page) => page.getByRole('toolbar', { name: 'Texte' });
  const message = (page: Page) => texteDe(page.locator('.message-etat'));
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const textePanneau = (page: Page) => page.locator('.editeur-inspecteur textarea[aria-label="Texte"]');
  const plage = (page: Page) => champ(page).evaluate((e): [number, number] => { const t = e as HTMLTextAreaElement; return [t.selectionStart, t.selectionEnd]; });

  /** Un point du plan de travail a l'ecran, en fractions de sa largeur et de sa hauteur. */
  async function surPlan(page: Page, fx: number, fy: number): Promise<{ x: number; y: number }> {
    const r = await page.locator('.editeur-svg-toile .plan-travail').boundingBox();
    if (!r) throw new Error('plan de travail introuvable');
    return { x: r.x + r.width * fx, y: r.y + r.height * fy };
  }

  /** La boite a l'ecran d'une forme de la toile. */
  async function boite(page: Page, id: string) {
    const r = await page.locator('.editeur-svg-toile path[data-id="' + id + '"]').boundingBox();
    if (!r) throw new Error('forme ' + id + ' introuvable');
    return r;
  }

  /** L'editeur sur un plan presque vide, l'outil Texte pris, les fontes chargees. */
  async function outilTexte(page: Page, tactile = false): Promise<void> {
    await ouvrirCode(page, PLAN, tactile);
    const bouton = page.locator('.editeur-barre button[title^="Texte (T)"]');
    if (await bouton.isVisible()) { if (tactile) await bouton.tap(); else await bouton.click(); } else await page.keyboard.press('t');
    if (!tactile) await page.locator('.editeur-inspecteur select[aria-label="Police"]').waitFor();
  }

  /** Clique la toile avec l'outil Texte, tape, et termine par Echap : rend le texte cree (f2). */
  async function taperSurToile(page: Page, texte: string): Promise<void> {
    const p = await surPlan(page, 0.2, 0.5);
    await page.mouse.click(p.x, p.y);
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await page.keyboard.type(texte);
    await attend(() => nombreDeCalques(page)).toBe(2);
    await page.keyboard.press('Escape');
    await attend(() => champ(page).count()).toBe(0);
  }

  it('un clic pose le point d insertion ; les lettres apparaissent ; Entree va a la ligne ; Echap termine, en une modification', async () => {
    const { page } = await navigateur.ouvrir();
    await outilTexte(page);
    const p = await surPlan(page, 0.25, 0.5);
    await page.mouse.click(p.x, p.y);
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await attend(() => dit(page)).toMatch(/^Saisie du texte sur la toile/);
    // Le curseur est dessine sur la toile, dans le cadre du texte, avant toute lettre.
    await attend(() => page.locator('.saisie-calque .curseur-saisie').count()).toBe(1);
    expect(await page.locator('.saisie-calque .cadre-saisie').count()).toBe(1);
    await page.keyboard.type('Bonjour');
    await attend(() => nombreDeCalques(page)).toBe(2);
    // Le texte commence la ou l'on a clique : le bord gauche des lettres est au point d'insertion, a la largeur d'une lettre pres.
    const b = await boite(page, 'f2');
    expect(Math.abs(b.x - p.x)).toBeLessThan(12);
    expect(b.y).toBeLessThan(p.y);
    expect(b.y + b.height).toBeGreaterThan(p.y - 4);
    const largeur = b.width;
    await page.keyboard.press('Enter');
    await page.keyboard.type('Léa');
    await attend(async () => (await boite(page, 'f2')).height).toBeGreaterThan(b.height * 1.5);
    expect((await boite(page, 'f2')).width).toBeCloseTo(largeur, 0);
    expect(await page.locator('.editeur-svg-toile text').count()).toBe(0);
    await page.keyboard.press('Escape');
    await attend(() => champ(page).count()).toBe(0);
    await attend(() => message(page)).toBe('Texte ajouté en Inter : « Bonjour / Léa ». Il reste modifiable : double-clic ou Entrée.');
    expect(await modifications(page)).toBe(1);
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    // Le texte reste vivant, choisi : le panneau le montre, la barre de texte aussi.
    await attend(() => textePanneau(page).inputValue()).toBe('Bonjour\nLéa');
    await attend(() => barre(page).isVisible()).toBe(true);
  });

  it('un clic sans frappe ne cree rien, et un clic hors du texte termine la saisie', async () => {
    const { page } = await navigateur.ouvrir();
    await outilTexte(page);
    const p = await surPlan(page, 0.5, 0.5);
    await page.mouse.click(p.x, p.y);
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await page.keyboard.type('   ');
    await page.keyboard.press('Escape');
    await attend(() => message(page)).toBe('Texte vide : rien n’est ajouté.');
    expect(await nombreDeCalques(page)).toBe(1);
    expect(await modifications(page)).toBe(0);
    // Un texte, puis un clic loin de lui : la saisie se termine, le clic ne fait rien d'autre.
    const q = await surPlan(page, 0.2, 0.3);
    await page.mouse.click(q.x, q.y);
    await page.keyboard.type('Ici');
    await attend(() => nombreDeCalques(page)).toBe(2);
    const loin = await surPlan(page, 0.8, 0.85);
    await page.mouse.click(loin.x, loin.y);
    await attend(() => champ(page).count()).toBe(0);
    await attend(() => message(page)).toMatch(/^Texte ajouté en Inter : « Ici »/);
    expect(await nombreDeCalques(page)).toBe(2);
  });

  it('un double-clic rouvre la saisie au bon endroit ; Maj+fleches choisissent ; la frappe remplace ; Ctrl+Z defait la frappe', async () => {
    const { page } = await navigateur.ouvrir();
    await outilTexte(page);
    await taperSurToile(page, 'Bonne fête');
    expect(await modifications(page)).toBe(1);
    // Un double-clic au debut du texte : le curseur s'y pose (pas a la fin).
    const b = await boite(page, 'f2');
    await page.mouse.dblclick(b.x + 3, b.y + b.height / 2);
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await attend(async () => (await plage(page))[0]).toBeLessThanOrEqual(1);
    await page.keyboard.press('End');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
    await attend(() => plage(page)).toEqual([6, 10]);
    await attend(() => page.locator('.saisie-calque .selection-saisie').count()).toBe(1);
    await page.keyboard.type('année');
    await attend(() => textePanneau(page).inputValue()).toBe('Bonne année');
    // Ctrl+Z dans le champ defait toute la frappe d'un coup, et la saisie continue.
    await page.keyboard.press('Control+z');
    await attend(() => textePanneau(page).inputValue()).toBe('Bonne fête');
    expect(await aLeFocus(champ(page))).toBe(true);
    await page.keyboard.press('End');
    await page.keyboard.type(' !');
    await page.keyboard.press('Escape');
    await attend(() => message(page)).toBe('Texte modifié : « Bonne fête ! ».');
    expect(await modifications(page)).toBe(2);
    await page.keyboard.press('Control+z');
    await attend(() => textePanneau(page).inputValue()).toBe('Bonne fête');
  });

  it('un clic dans le texte en saisie pose le curseur ; glisser choisit ; un double-clic choisit le mot ; coller du texte brut', async () => {
    const { page, contexte } = await navigateur.ouvrir();
    await outilTexte(page);
    await permettrePressePapiers(page, contexte);
    const p = await surPlan(page, 0.1, 0.5);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('chat noir');
    await attend(() => nombreDeCalques(page)).toBe(2);
    const b = await boite(page, 'f2');
    // Un clic au tout debut : le curseur a l'index 0.
    await page.mouse.click(b.x + 1, b.y + b.height / 2);
    await attend(() => plage(page)).toEqual([0, 0]);
    expect(await aLeFocus(champ(page))).toBe(true);
    // Glisser du debut au milieu : des caracteres choisis.
    await page.mouse.move(b.x + 1, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.35, b.y + b.height / 2, { steps: 4 });
    await page.mouse.up();
    await attend(async () => { const [a, z] = await plage(page); return a === 0 && z >= 3 && z <= 5; }).toBe(true);
    // Un double-clic sur le second mot le choisit entier.
    await page.mouse.dblclick(b.x + b.width * 0.85, b.y + b.height / 2);
    await attend(() => plage(page)).toEqual([5, 9]);
    if (NAVIGATEUR === 'chromium') {
      await page.keyboard.press('Control+c');
      await page.keyboard.press('Home');
      await page.keyboard.press('Control+v');
      await attend(() => champ(page).inputValue()).toBe('noirchat noir');
    }
    await page.keyboard.press('Escape');
    await attend(() => champ(page).count()).toBe(0);
  });

  it('la barre de texte : police, taille, gras, alignement, et « Plus d options » ouvre le panneau', async () => {
    const { page } = await navigateur.ouvrir();
    await outilTexte(page);
    await taperSurToile(page, 'Atelier');
    const b = barre(page);
    await attend(() => b.isVisible()).toBe(true);
    // La police : une modification, le panneau suit.
    await b.locator('select[aria-label="Police"]').selectOption('lobster');
    await attend(() => modifications(page)).toBe(2);
    await expect(page.locator('.editeur-inspecteur select[aria-label="Police"]').inputValue()).resolves.toBe('lobster');
    // Le style « Gras » n'existe que pour une famille qui en a un (Inter).
    await b.locator('select[aria-label="Police"]').selectOption('inter');
    await b.locator('select[aria-label="Style de la police"]').selectOption({ label: 'Gras' });
    await attend(() => page.locator('.editeur-inspecteur select[aria-label="Style de la police"]').inputValue()).toBe('inter-gras');
    // La taille, a la validation.
    const taille = b.getByRole('textbox', { name: 'Taille' });
    await taille.fill('50');
    await taille.press('Enter');
    await attend(() => page.locator('.section-texte').getByRole('textbox', { name: 'Taille' }).inputValue()).toBe('50');
    // L'alignement : un bouton a etat.
    const centre = b.getByRole('button', { name: 'Centrer les lignes' });
    await centre.click();
    await attend(() => centre.getAttribute('aria-pressed')).toBe('true');
    await attend(() => page.locator('.section-texte').getByRole('button', { name: 'Au centre' }).getAttribute('aria-pressed')).toBe('true');
    // « Plus d'options » mene au panneau Texte, son titre focalise.
    await b.getByRole('button', { name: 'Plus d’options' }).click();
    await attend(() => aLeFocus(page.locator('.section-texte > summary'))).toBe(true);
    // Rien de tout cela n'est une action pleine.
    expect(await b.locator('button.primaire').count()).toBe(0);
  });

  it('pendant la saisie, un reglage a la souris rend le focus au texte ; Alt+F10 mene a la barre, Echap ramene au texte', async () => {
    const { page } = await navigateur.ouvrir();
    await outilTexte(page);
    const p = await surPlan(page, 0.2, 0.5);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Merci');
    await attend(() => nombreDeCalques(page)).toBe(2);
    await expect(texteDe(barre(page).locator('> .aide'))).resolves.toBe('Saisie · Échap pour finir');
    await barre(page).getByRole('button', { name: 'Aligner les lignes à droite' }).click();
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await page.keyboard.type(' bien');
    await page.keyboard.press('Alt+F10');
    await attend(() => aLeFocus(barre(page).locator('select[aria-label="Police"]'))).toBe(true);
    expect(await champ(page).count()).toBe(1);
    await page.keyboard.press('Escape');
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await page.keyboard.press('Escape');
    await attend(() => textePanneau(page).inputValue()).toBe('Merci bien');
    // La frappe, l'alignement, puis la suite de la frappe : trois entrees d'historique.
    expect(await modifications(page)).toBe(3);
  });

  it('au clavier seul : T, Entree, frappe, Entree pour une ligne, Echap ; Entree rouvre ; Tab ne piege pas le focus', async () => {
    const { page } = await navigateur.ouvrir();
    await ouvrirCode(page, PLAN);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('t');
    await attend(() => dit(page)).toBe('Outil texte : flèches déplacent le point d’insertion, Entrée ouvre la saisie sur la toile ; à la souris, cliquez où écrire.');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await page.keyboard.type('Atelier');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Paris');
    await attend(() => nombreDeCalques(page)).toBe(2);
    await page.keyboard.press('Escape');
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    await attend(() => dit(page)).toMatch(/^Texte ajouté en Inter : « Atelier \/ Paris »/);
    // Le texte est choisi : Entree le rouvre, le curseur a la fin.
    await page.keyboard.press('Enter');
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await page.keyboard.type(' 2026');
    // Tab quitte la saisie (le texte reste) et le focus va plus loin : il n'est jamais retenu.
    await page.keyboard.press('Tab');
    await attend(() => champ(page).count()).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.tagName.toLowerCase() ?? '')).not.toBe('textarea');
    await attend(() => textePanneau(page).inputValue()).toBe('Atelier\nParis 2026');
    expect(await modifications(page)).toBe(2);
  });

  it('le trace Plein | Median de la barre : la toile change, l export n ecrit aucun remplissage ; une police a trait est toujours en ligne', async () => {
    const { page } = await navigateur.ouvrir();
    await outilTexte(page);
    // Le trace du prochain texte se regle avant la premiere lettre, comme la police ou la taille.
    const median = barre(page).getByRole('button', { name: 'Médian' }), plein = barre(page).getByRole('button', { name: 'Plein' });
    await expect(plein.getAttribute('aria-pressed')).resolves.toBe('true');
    await taperSurToile(page, 'Lune');
    const chemin = page.locator('.editeur-svg-toile path[data-id="f2"]');
    await expect(chemin.getAttribute('fill')).resolves.not.toBe('none');
    const avant = await chemin.getAttribute('d');
    await median.click();
    await attend(() => median.getAttribute('aria-pressed')).toBe('true');
    await attend(() => chemin.getAttribute('fill')).toBe('none');
    expect(await chemin.getAttribute('stroke')).toBeTruthy();
    expect(await chemin.getAttribute('d')).not.toBe(avant);
    expect(await modifications(page)).toBe(2);
    // Le panneau le dit aussi ; l'export ecrit des lignes, sans aucun fond, et de quoi rouvrir le trace.
    await expect(page.locator('.section-texte').getByRole('button', { name: 'Médian' }).getAttribute('aria-pressed')).resolves.toBe('true');
    const [telechargement]: [Download, void] = await Promise.all([page.waitForEvent('download'), boutonTelecharger(page).click()]);
    const svg = readFileSync(await telechargement.path(), 'utf8');
    const texte = /<path [^>]*data-ed-texte="Lune"[^>]*\/>/.exec(svg)?.[0] ?? '';
    expect(texte).toContain('data-ed-trace="median"');
    expect(texte).toContain('fill="none"');
    expect(svg).not.toContain('<text');
    // Plein rend les lettres pleines ; une police a trait unique n'a que sa ligne : « Plein » dit pourquoi, il ne fait rien.
    await plein.click();
    await attend(() => chemin.getAttribute('fill')).not.toBe('none');
    await barre(page).locator('select[aria-label="Police"]').selectOption('ems-readability');
    await attend(() => median.getAttribute('aria-pressed')).toBe('true');
    expect(await plein.getAttribute('aria-disabled')).toBe('true');
    // Playwright tient un bouton aria-disabled pour inactif : on le presse quand meme, comme le fait la souris.
    await plein.click({ force: true });
    await attend(() => message(page)).toBe('Une police à trait unique n’a qu’une ligne : choisissez une police à contour pour des lettres pleines.');
    await attend(() => chemin.getAttribute('fill')).toBe('none');
  });

  it('a 390 px, au doigt : toucher la toile, taper, la barre resserree tient sans deborder, ses cibles font 40 px', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true });
    await outilTexte(page, true);
    const p = await surPlan(page, 0.2, 0.5);
    await page.touchscreen.tap(p.x, p.y);
    await attend(() => aLeFocus(champ(page))).toBe(true);
    await page.keyboard.type('Salut');
    await attend(() => nombreDeCalques(page)).toBe(2);
    const b = barre(page);
    await attend(() => b.isVisible()).toBe(true);
    expect(await b.getAttribute('class')).toContain('compacte');
    const mesure = await b.evaluate(e => ({ defile: e.scrollWidth - e.clientWidth, droite: e.getBoundingClientRect().right }));
    expect(mesure.defile).toBeLessThanOrEqual(1);
    expect(mesure.droite).toBeLessThanOrEqual(390);
    const hauteurs = await b.locator('select, input, button').evaluateAll(l => l.map(e => e.getBoundingClientRect().height));
    expect(Math.min(...hauteurs)).toBeGreaterThanOrEqual(40);
    // Le menu de la barre porte l'alignement, « Plus d'options » et les gestes ; un toucher hors du texte termine la saisie.
    const loin = await surPlan(page, 0.8, 0.85);
    await page.touchscreen.tap(loin.x, loin.y);
    await attend(() => champ(page).count()).toBe(0);
    await attend(() => message(page)).toMatch(/^Texte ajouté en Inter : « Salut »/);
    await b.getByRole('button', { name: /^Plus de réglages du texte/ }).tap();
    await page.getByRole('menuitem', { name: 'Plus d’options' }).tap();
    await attend(() => page.locator('.voile').count()).toBe(1);
    await attend(() => aLeFocus(page.locator('.section-texte > summary'))).toBe(true);
  });
});
