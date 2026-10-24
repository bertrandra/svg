// La lecture elargie (troisieme lot de l'ADR-0009), par la vraie page : une planche d'icones en <use> s'ouvre et se
// deplie en formes independantes, un SVG style par une feuille a selecteurs prend ses couleurs, et ce que la lecture
// laisse tomber ou refuse est dit a la personne.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, formesVisibles, nombreDeCalques, ouvrirCode, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const fixture = (nom: string): string => readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/svg', nom + '.svg'), 'utf8');

describe('lecture des <use> et des feuilles de style', () => {
  const navigateur = pilote();

  async function ouvrir(svg: string): Promise<Page> {
    const { page } = await navigateur.ouvrir();
    await ouvrirCode(page, svg);
    return page;
  }
  const remplissages = (page: Page) => page.locator('.editeur-svg-toile path[data-id]').evaluateAll(l => l.map(e => e.getAttribute('fill')));
  const note = (page: Page) => texteDe(page.locator('[role="note"]').first());

  it('ouvre une planche d\'icones : chaque <use> devient ses propres formes, aux couleurs du <use>', async () => {
    const page = await ouvrir(fixture('lecture-use-sprite'));
    await attend(() => formesVisibles(page)).toBe(7);
    expect(await nombreDeCalques(page)).toBe(7);
    const ids = await page.locator('.editeur-svg-toile path[data-id]').evaluateAll(l => l.map(e => e.getAttribute('data-id')));
    expect(new Set(ids).size).toBe(7);
    // Les deux premieres etoiles sont le meme symbole, peint par chaque <use>.
    expect((await remplissages(page)).slice(0, 3)).toEqual(['#d4a537', '#1f5f3f', '#c81e28']);
    // Rien a dire : tout se lit.
    await expect(page.locator('[role="note"]').count()).resolves.toBe(0);
  });

  it('une forme issue d\'un clone se selectionne et se deplace seule', async () => {
    const page = await ouvrir(fixture('lecture-use-sprite'));
    await attend(() => formesVisibles(page)).toBe(7);
    const premiere = page.locator('.editeur-svg-toile path[data-id="f1"]');
    const avant = await premiere.getAttribute('d');
    const seconde = await page.locator('.editeur-svg-toile path[data-id="f2"]').getAttribute('d');
    await premiere.click();
    await page.keyboard.press('ArrowRight');
    await attend(() => premiere.getAttribute('d')).not.toBe(avant);
    // Le clone voisin du meme symbole n'a pas bouge.
    expect(await page.locator('.editeur-svg-toile path[data-id="f2"]').getAttribute('d')).toBe(seconde);
  });

  it('dit le rognage d\'un symbole que la lecture ne fait pas', async () => {
    const page = await ouvrir(fixture('lecture-use-symbole'));
    await attend(() => formesVisibles(page)).toBe(5);
    await attend(() => note(page)).toContain('Non repris à l’ouverture : le rognage au cadre d’un <symbol>');
  });

  it('lit une feuille a selecteurs : couleurs, specificite, !important, et dit ce qu\'elle ne porte pas', async () => {
    const page = await ouvrir(fixture('lecture-css-selecteurs'));
    await attend(() => formesVisibles(page)).toBe(8);
    expect(await remplissages(page)).toEqual(['#1f5f3f', '#c81e28', '#000000', '#7b2d8e', '#f4efe6', '#d4a537', '#d4a537', '#2a5db0']);
    const dit = await note(page);
    expect(dit).toContain('les règles d’un bloc @media');
    expect(dit).toContain('la pseudo-classe :hover');
  });

  it('refuse un <use> vers un fichier externe, en le nommant, sans ouvrir l\'editeur', async () => {
    const { page } = await navigateur.ouvrir();
    await page.locator('section[aria-label="Ouvrir un SVG"] textarea').fill(readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/refuses/use-externe.svg'), 'utf8'));
    await page.getByRole('button', { name: 'Ouvrir ce code' }).click();
    const alerte = page.locator('main.accueil > p.message[role="alert"]');
    await alerte.waitFor();
    expect(await texteDe(alerte)).toContain('un clone <use> vers un fichier ou une adresse extérieurs (« sprite.svg#etoile »)');
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
  });

  it('refuse un cycle de <use>, en le nommant', async () => {
    const { page } = await navigateur.ouvrir();
    await page.locator('section[aria-label="Ouvrir un SVG"] textarea').fill(readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/refuses/use-cycle.svg'), 'utf8'));
    await page.getByRole('button', { name: 'Ouvrir ce code' }).click();
    const alerte = page.locator('main.accueil > p.message[role="alert"]');
    await alerte.waitFor();
    expect(await texteDe(alerte)).toContain('un cycle de clones <use>');
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
  });
});
