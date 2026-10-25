// « À propos et crédits » et la provenance des formes (CC BY 3.0 de game-icons.net) : la boîte s'ouvre du menu Fichier de l'éditeur
// et du pied de la page d'accueil, elle prend et rend le focus, Échap la ferme ; le SVG enregistré porte la mention quand le dessin
// contient une forme de la bibliothèque, et seulement alors ; l'embarquement la rend dans `onEnregistrer`.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, ouvrirExemple, ouvrirMenu, pilote, URL_INTEGRATION } from './aide.js';

const CHARGEMENT = 60_000;

describe('à propos et crédits', () => {
  const navigateur = pilote();

  const boite = (page: Page) => page.getByRole('dialog', { name: 'À propos et crédits' });
  /** Le focus est dans la boîte (elle-même ou un de ses contrôles). */
  const focusDansLaBoite = (page: Page) => page.evaluate(() => !!document.activeElement?.closest('.credits-dialogue'));
  /** Le SVG que la page d'accueil montre en aperçu : celui qui vient d'être enregistré. */
  const apercu = (page: Page) => page.locator('img.apercu').evaluate(i => decodeURIComponent((i as HTMLImageElement).src.replace(/^data:image\/svg\+xml;charset=utf-8,/, '')));

  describe('depuis le pied de la page d’accueil', () => {
    it('s’ouvre en prenant le focus, nomme la source et sa licence, et rend tout le reste inerte', async () => {
      const { page } = await navigateur.ouvrir();
      const declencheur = page.getByRole('button', { name: 'À propos et crédits' });
      await declencheur.click();
      await boite(page).waitFor();
      expect(await focusDansLaBoite(page)).toBe(true);
      const texte = await boite(page).innerText();
      expect(texte).toContain('game-icons.net et ses contributeurs');
      expect(texte).toContain('CC BY 3.0');
      expect(texte).toMatch(/version \S+/);
      for (const nom of ['Inter', 'Fredoka', 'React', 'opentype.js', 'polygon-clipping', 'vtracer']) expect(texte, nom).toContain(nom);
      expect(await page.locator('main.accueil').evaluate(e => e.closest('[inert]') !== null)).toBe(true);
      expect(await boite(page).getAttribute('aria-modal')).toBe('true');
    });

    it('se ferme par Échap et rend le focus au bouton qui l’avait ouverte', async () => {
      const { page } = await navigateur.ouvrir();
      const declencheur = page.getByRole('button', { name: 'À propos et crédits' });
      await declencheur.focus();
      await page.keyboard.press('Enter');
      await boite(page).waitFor();
      await page.keyboard.press('Escape');
      await attend(() => boite(page).count()).toBe(0);
      expect(await declencheur.evaluate(e => e === document.activeElement)).toBe(true);
      expect(await page.locator('main.accueil').evaluate(e => e.closest('[inert]') !== null)).toBe(false);
    });

    it('se ferme par son bouton « Fermer », qui se manœuvre au clavier', async () => {
      const { page } = await navigateur.ouvrir();
      await page.getByRole('button', { name: 'À propos et crédits' }).click();
      await boite(page).waitFor();
      // Tab parcourt les liens puis arrive à « Fermer » : jamais ailleurs que dans la boîte tant qu'elle est ouverte.
      const fermer = boite(page).getByRole('button', { name: 'Fermer' });
      for (let i = 0; i < 40 && !(await fermer.evaluate(e => e === document.activeElement)); i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('.credits-dialogue') || document.activeElement === document.body)).toBe(true);
      }
      await page.keyboard.press('Enter');
      await attend(() => boite(page).count()).toBe(0);
    });
  });

  describe('depuis le menu Fichier de l’éditeur', () => {
    it('s’ouvre au clavier, garde l’éditeur derrière elle intact, et se ferme sans fermer l’éditeur', async () => {
      const { page } = await navigateur.ouvrir();
      await ouvrirExemple(page);
      const bouton = await ouvrirMenu(page, 'Fichier');
      await page.getByRole('menuitem', { name: 'À propos et crédits' }).click();
      await boite(page).waitFor();
      expect(await focusDansLaBoite(page)).toBe(true);
      expect(await page.locator('.editeur-cadre').evaluate(e => (e as HTMLElement).inert)).toBe(true);

      // Tab ne piège rien mais ne va pas non plus dans l'éditeur inerte derrière.
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('.editeur-cadre'))).toBe(false);
      }
      // Échap ferme la boîte, pas l'éditeur : aucune confirmation d'abandon, l'éditeur est là, le focus revient à « Fichier ».
      await page.keyboard.press('Escape');
      await attend(() => boite(page).count()).toBe(0);
      expect(await page.locator('.editeur-cadre').count()).toBe(1);
      expect(await page.getByRole('alertdialog').count()).toBe(0);
      expect(await bouton.evaluate(e => e === document.activeElement)).toBe(true);
      expect(await page.locator('.editeur-cadre').evaluate(e => (e as HTMLElement).inert)).toBe(false);
    });

    it('s’atteint au clavier seul depuis le bouton Fichier', async () => {
      const { page } = await navigateur.ouvrir();
      await ouvrirExemple(page);
      const bouton = page.locator('.menu-bouton', { hasText: 'Fichier' });
      await bouton.focus();
      await page.keyboard.press('ArrowDown');
      const element = page.getByRole('menuitem', { name: 'À propos et crédits' });
      for (let i = 0; i < 8 && !(await element.evaluate(e => e === document.activeElement)); i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await boite(page).waitFor();
      expect(await focusDansLaBoite(page)).toBe(true);
    });
  });

  describe('la mention dans le SVG enregistré', () => {
    /** L'éditeur sur l'exemple, la bibliothèque de son panneau chargée. */
    async function editeurAvecBibliotheque() {
      const { page } = await navigateur.ouvrir();
      await ouvrirExemple(page);
      await page.locator('.editeur-inspecteur .section > summary', { hasText: 'Bibliothèque de formes' }).click();
      await page.locator('.editeur-inspecteur .vignette').first().waitFor({ timeout: CHARGEMENT });
      return page;
    }

    it('est présente après l’insertion d’une forme de la bibliothèque, avec la source, la licence et les origines', async () => {
      const page = await editeurAvecBibliotheque();
      await page.locator('.editeur-inspecteur input[type=search]').fill('lapin');
      await page.locator('.editeur-inspecteur .vignette').first().click();
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      await page.locator('.editeur-barre .groupe.fin button.primaire').click();
      await page.locator('img.apercu').waitFor();
      const svg = await apercu(page);
      expect(svg).toContain('<metadata>');
      expect(svg).toContain('game-icons.net et ses contributeurs');
      expect(svg).toContain('https://creativecommons.org/licenses/by/3.0/');
      expect(svg).toMatch(/data-origine="game-icons:[a-z0-9-]+"/);
      expect(svg).toMatch(/Origines : game-icons:[a-z0-9-]+\./);
    });

    it('est absente d’un dessin sans forme de la bibliothèque, même modifié puis enregistré', async () => {
      const { page } = await navigateur.ouvrir();
      await ouvrirExemple(page);
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      await page.keyboard.press('ArrowRight');
      await page.locator('.editeur-barre .groupe.fin button.primaire').click();
      await page.locator('img.apercu').waitFor();
      const svg = await apercu(page);
      expect(svg).toContain('<svg');
      expect(svg).not.toContain('<metadata');
      expect(svg).not.toContain('data-origine');
    });

    it('est présente quand on ouvre une forme de la bibliothèque depuis la page, et se retire avec la forme', async () => {
      const { page } = await navigateur.ouvrir();
      await page.getByRole('tab', { name: /Bibliothèque/ }).click();
      await page.locator('.bibliotheque .vignette').first().waitFor({ timeout: CHARGEMENT });
      await page.locator('.bibliotheque .vignette').first().click();
      await page.locator('.editeur-cadre').waitFor();
      await page.locator('.editeur-barre .groupe.fin button.primaire').click();
      await page.locator('img.apercu').waitFor();
      expect(await apercu(page)).toContain('<metadata>');
      // La forme supprimée, plus rien à créditer : le SVG réécrit n'en porte plus la mention.
      await page.getByRole('button', { name: 'Reprendre l’édition' }).click();
      await page.locator('.editeur-cadre').waitFor();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('r');
      await page.locator('.editeur-svg-toile').click({ position: { x: 40, y: 40 } });
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Escape');
      await page.locator('.editeur-barre .groupe.fin button.primaire').click();
      expect(await apercu(page)).toContain('data-origine');
    });
  });

  describe('dans l’embarquement', () => {
    /** L'hôte, l'éditeur ouvert dessus. */
    async function hoteOuvert() {
      const { page } = await navigateur.ouvrir({ naviguer: false });
      await page.goto(URL_INTEGRATION);
      await page.locator('#editer').click();
      await page.locator('.editeur-svg .editeur-cadre').waitFor();
      return page;
    }
    /** Le SVG que l'hôte a reçu par `onEnregistrer` (il le montre dans son `#code`), une fois le rappel passé. */
    const recu = async (page: Page) => {
      await attend(() => page.locator('#journal').evaluate(e => (e.textContent ?? '').includes('onEnregistrer'))).toBe(true);
      return page.locator('#code').evaluate(e => e.textContent ?? '');
    };

    it('onEnregistrer rend un SVG qui porte la mention après l’insertion d’une forme de la bibliothèque', async () => {
      const page = await hoteOuvert();
      const section = page.locator('.editeur-inspecteur details.section', { has: page.locator('summary', { hasText: 'Bibliothèque de formes' }) });
      if (!(await section.evaluate(e => (e as HTMLDetailsElement).open))) await section.locator('summary').click();
      await page.locator('.editeur-inspecteur .vignette').first().waitFor({ timeout: CHARGEMENT });
      await page.locator('.editeur-inspecteur .vignette').first().click();
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      await page.locator('.editeur-barre .groupe.fin button.primaire').click();
      const svg = await recu(page);
      expect(svg).toContain('<metadata>');
      expect(svg).toContain('game-icons.net et ses contributeurs');
      expect(svg).toContain('https://creativecommons.org/licenses/by/3.0/');
      expect(svg).toMatch(/data-origine="game-icons:[a-z0-9-]+"/);
    });

    it('onEnregistrer rend un SVG sans mention quand le dessin n’a aucune forme de la bibliothèque', async () => {
      const page = await hoteOuvert();
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      await page.keyboard.press('ArrowRight');
      await page.locator('.editeur-barre .groupe.fin button.primaire').click();
      const svg = await recu(page);
      expect(svg).toContain('<svg');
      expect(svg).not.toContain('<metadata');
      expect(svg).not.toContain('data-origine');
    });

    it('la boîte s’ouvre du menu Fichier de l’éditeur embarqué, dans la racine cantonnée, et rend le focus à l’éditeur', async () => {
      const session = await navigateur.ouvrir({ naviguer: false });
      const page = session.page;
      await page.goto(URL_INTEGRATION);
      await page.locator('#editer').click();
      await page.locator('.editeur-svg .editeur-cadre').waitFor();
      const bouton = await ouvrirMenu(page, 'Fichier');
      await page.getByRole('menuitem', { name: 'À propos et crédits' }).click();
      await boite(page).waitFor();
      // Posée dans la racine de l'éditeur : les styles cantonnés l'atteignent (une boîte nue sur la page de l'hôte serait sans style).
      expect(await page.locator('.editeur-svg .credits-dialogue').count()).toBe(1);
      expect(await page.locator('.editeur-svg .credits-voile').evaluate(e => getComputedStyle(e).position)).toBe('fixed');
      expect(await boite(page).innerText()).toMatch(/version \d+\.\d+\.\d+/);
      await page.keyboard.press('Escape');
      await attend(() => boite(page).count()).toBe(0);
      expect(await bouton.evaluate(e => e === document.activeElement)).toBe(true);
      expect(await page.locator('.editeur-svg').count()).toBe(1);
    });
  });
});
