// Les exports : ce que l'utilisateur recoit vraiment dans son dossier de telechargements.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { attend, telechargerParFichier, ouvrirExemple, ouvrirMenu, pilote, terminer } from './aide.js';

describe('exports', () => {
  const navigateur = pilote();

  async function editeur() {
    const { page } = await navigateur.ouvrir();
    await ouvrirExemple(page);
    return page;
  }

  /** Clique `action` et recueille le fichier telecharge : son nom et ses octets. */
  async function telecharger(page: Page, action: () => Promise<void>): Promise<{ nom: string; octets: Buffer }> {
    const [telechargement]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
    const chemin = await telechargement.path();
    return { nom: telechargement.suggestedFilename(), octets: readFileSync(chemin) };
  }

  it('telecharge le SVG propre d un geste, par « Télécharger le SVG » de la barre', async () => {
    const page = await editeur();
    const { nom, octets } = await telecharger(page, () => telechargerParFichier(page));
    expect(nom).toBe('exemple.svg');
    const svg = octets.toString('utf8');
    expect(svg).toMatch(/^<svg[\s>]/);
    // ADR-0001 et « le texte est une forme » : un trace par forme, jamais de <text>, de style ni de script.
    expect(svg.match(/<path\b/g)?.length).toBe(4);
    expect(svg).not.toMatch(/<text|<script|<style/);
  });

  it('ecrit le meme SVG deux fois de suite, a l\'octet pres', async () => {
    const page = await editeur();
    const un = await telecharger(page, () => telechargerParFichier(page));
    const deux = await telecharger(page, () => telechargerParFichier(page));
    expect(deux.octets.equals(un.octets)).toBe(true);
  });

  it('exporte un PNG a la largeur choisie', async () => {
    const page = await editeur();
    await ouvrirMenu(page, 'Autres formats');
    await page.locator('.menu-panneau select[aria-label="Largeur du PNG"]').selectOption('512');
    const { nom, octets } = await telecharger(page, () => page.locator('.menu-panneau .contenu-export button', { hasText: /^PNG$/ }).click());
    expect(nom).toBe('exemple-512.png');
    // La signature PNG, puis la largeur et la hauteur du bloc IHDR.
    expect([...octets.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(octets.readUInt32BE(16)).toBe(512);
    expect(octets.readUInt32BE(20)).toBeGreaterThan(0);
  });

  it('exporte un PDF vectoriel et un SVG de decoupe', async () => {
    const page = await editeur();
    await ouvrirMenu(page, 'Autres formats');
    const pdf = await telecharger(page, () => page.locator('.menu-panneau .contenu-export button', { hasText: 'PDF vectoriel' }).click());
    expect(pdf.nom).toBe('exemple.pdf');
    expect(pdf.octets.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const decoupe = await telecharger(page, () => page.locator('.menu-panneau .contenu-export button', { hasText: 'SVG de découpe' }).click());
    expect(decoupe.nom).toBe('exemple-decoupe.svg');
    const svg = decoupe.octets.toString('utf8');
    expect(svg).toMatch(/^<svg[\s>]/);
    // Contours seuls, dans la couleur de decoupe (rouge par defaut).
    expect(svg).toMatch(/stroke="#ff0000"/i);
    expect(svg).toMatch(/fill="none"/);
  });

  it('termine, puis telecharge depuis l\'accueil', async () => {
    const page = await editeur();
    await terminer(page);
    const { nom, octets } = await telecharger(page, () => page.locator('.resultat').getByRole('button', { name: 'Télécharger le SVG' }).click());
    expect(nom).toBe('exemple.svg');
    expect(octets.toString('utf8')).toMatch(/^<svg[\s>]/);
    await attend(() => page.locator('.resultat .aide').first().innerText()).toMatch(/4 formes/);
  });
});
