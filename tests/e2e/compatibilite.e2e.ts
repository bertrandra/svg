// Ce que la page fait quand le navigateur ne sait pas tout (docs/navigateurs.md) : elle le dit en francais au lieu de rester
// blanche, et ses replis valent ce qu'ils remplacent. Les API retirees le sont par un script d'initialisation, avant la
// page : c'est un navigateur d'avant telle ou telle API, vu depuis un navigateur d'aujourd'hui.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { JETONS, lire, type Theme } from '../../src/styles/jetons.js';
import { attend, imageDeTest, pilote, texteDe, URL_INTEGRATION, URL_PAGE } from './aide.js';

/** Retire une API de la fenetre avant que la page ne s'ouvre (elle reste lisible, mais undefined, comme chez un vieux navigateur). */
const retirer = (page: Page, nom: string) => page.addInitScript(n => {
  Object.defineProperty(window, n, { value: undefined, configurable: true, writable: true });
}, nom);

describe('un navigateur qui manque d\'une API de base', () => {
  const navigateur = pilote();

  it('dit en francais que la page est trop ancienne, au lieu de rester blanche', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await retirer(page, 'PointerEvent');
    await page.goto(URL_PAGE);
    await page.getByRole('heading', { name: 'Ce navigateur est trop ancien' }).waitFor();
    const alerte = await texteDe(page.getByRole('alert'));
    expect(alerte).toContain('il lui manque les évènements de pointeur');
    expect(alerte).toMatch(/Chrome, Edge, Firefox ou Safari/);
    // Ni l'accueil ni le message de chargement ne restent derriere.
    expect(await page.getByRole('tab').count()).toBe(0);
    expect(await page.locator('#editeur').innerText()).not.toContain('Chargement de l’éditeur');
  });

  it('dit la meme chose dans l\'editeur embarque, que l\'hote ferme comme un autre', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await retirer(page, 'PointerEvent');
    await page.goto(URL_INTEGRATION);
    await page.locator('#editer').click();
    const dialogue = page.getByRole('alertdialog', { name: 'Navigateur trop ancien' });
    await dialogue.waitFor();
    expect(await texteDe(dialogue)).toContain('il lui manque les évènements de pointeur');
    await dialogue.getByRole('button', { name: 'Fermer' }).click();
    await attend(() => page.getByRole('alertdialog').count()).toBe(0);
    // L'hote retrouve sa page : son bouton « Éditer » rouvre (et redit) sans erreur.
    expect(await page.locator('#editer').isEnabled()).toBe(true);
  });

  it('n\'empeche pas d\'ouvrir la page quand seul WebAssembly manque, et dit pourquoi la vectorisation ne part pas', async () => {
    const { page } = await navigateur.ouvrir({ naviguer: false });
    await retirer(page, 'WebAssembly');
    await page.goto(URL_PAGE);
    await page.getByRole('tab').nth(1).click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
    const phrase = page.locator('.vectoriser').getByText('il lui manque WebAssembly');
    await phrase.waitFor();
    expect(await texteDe(phrase)).toContain('WebAssembly, qui fait tourner le traceur');
    // L'image reste une image : la miniature est la, et rien n'a ete trace.
    expect(await page.locator('.depot .miniature').count()).toBe(1);
    expect(await page.locator('.fiche-resultat').count()).toBe(0);
  });
});

describe('une page que le moteur n\'anime pas', () => {
  const navigateur = pilote();

  it('garde un message d\'attente honnete quand JavaScript est coupe', async () => {
    const { page } = await navigateur.ouvrir({ sansJavaScript: true });
    expect(await texteDe(page.locator('#editeur'))).toMatch(/Chargement de l’éditeur… Si ce message reste affiché, JavaScript est désactivé ou ce navigateur est trop ancien/);
  });

  it('remplace ce message par l\'accueil quand tout marche', async () => {
    const { page } = await navigateur.ouvrir();
    await page.getByRole('tablist', { name: 'Point de départ' }).waitFor();
    expect(await page.locator('#editeur').innerText()).not.toContain('Chargement de l’éditeur');
  });
});

/** Un pixel de couleur CSS pose sur du blanc : la meme lecture pour color-mix() et pour son repli. */
const pixelSurBlanc = (page: Page, couleurs: string[]) => page.evaluate(liste => {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('pas de canvas 2D');
  return liste.map(couleur => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = couleur;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
}, couleurs);

describe('les replis de color-mix()', () => {
  const navigateur = pilote();

  /** La formule color-mix() qu'un jeton de repli remplace, deduite de son nom (repli-cyan-12, repli-cyan-6-panneau, repli-cyan-fonce). */
  function formule(id: string, theme: Theme): string {
    const [, base, part, dessous] = id.split('-');
    const cyan = lire(base ?? '')[theme];
    if (part === 'fonce') return `color-mix(in srgb, ${cyan} 86%, black)`;
    return `color-mix(in srgb, ${cyan} ${part}%, ${dessous ? lire(dessous)[theme] : 'transparent'})`;
  }

  it('donnent, a un pas de 8 bits pres, la couleur que color-mix() calcule', async () => {
    const { page } = await navigateur.ouvrir();
    expect(await page.evaluate(() => CSS.supports('color', 'color-mix(in srgb, red, blue)'))).toBe(true);
    const repli = JETONS.filter(j => j.role === 'repli');
    expect(repli.length).toBeGreaterThan(5);
    for (const theme of ['clair', 'sombre'] as const) {
      const attendus = await pixelSurBlanc(page, repli.map(j => formule(j.id, theme)));
      const poses = await pixelSurBlanc(page, repli.map(j => j[theme]));
      repli.forEach((j, i) => {
        const a = attendus[i] ?? [], p = poses[i] ?? [];
        expect(Math.max(...a.map((v, k) => Math.abs(v - (p[k] ?? 0)))), `${j.id} (${theme}) : color-mix ${a.join(',')} contre repli ${p.join(',')}`).toBeLessThanOrEqual(1);
      });
    }
  });

  it('sont ceux de la feuille : le repli de survol se lit quand @supports not est force', async () => {
    const { page } = await navigateur.ouvrir();
    // On rejoue le bloc @supports not avec une condition toujours vraie, comme le ferait un navigateur sans color-mix().
    const lu = await page.evaluate(() => {
      // La feuille des fontes (Google) vient d'une autre origine : ses regles ne se lisent pas, et ne nous regardent pas.
      const regles = (s: CSSStyleSheet): CSSRule[] => { try { return Array.from(s.cssRules); } catch { return []; } };
      const css = Array.from(document.styleSheets).flatMap(regles).map(r => r.cssText).join('\n');
      const forcee = css.replace(/@supports not \(color: color-mix\([^)]*\)\)/g, '@supports (display: block)');
      const style = document.createElement('style');
      style.textContent = forcee;
      document.head.appendChild(style);
      const m = document.createElement('div');
      m.className = 'depot survol';
      document.body.appendChild(m);
      const fond = getComputedStyle(m).backgroundColor;
      m.remove();
      return { regles: (css.match(/@supports not/g) ?? []).length, fond };
    });
    expect(lu.regles).toBeGreaterThanOrEqual(14);
    // Le theme clair est celui par defaut de Playwright : la zone de depot survolee prend la teinte du jeton, a l'octet pres.
    const hex = lire('repli-cyan-8-panneau').clair;
    expect(lu.fond).toBe(`rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`);
  });
});
