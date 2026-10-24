// Les calques par couleur : choisir, afficher, verrouiller, isoler, inverser, combiner, supprimer.
// L'exemple a quatre formes de quatre couleurs : #1428A0, #15181D, #C81E28 et #E9ECEF.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, formesVisibles, nombreDeCalques, ouvrirExemple, pilote, texteDe } from './aide.js';

describe('calques par couleur', () => {
  const navigateur = pilote();

  async function editeur() {
    const session = await navigateur.ouvrir();
    await ouvrirExemple(session.page);
    return session.page;
  }

  const ROUGE = '#C81E28', BLEU = '#1428A0';
  const ligneDe = (page: Page, couleur: string) => page.locator('.par-couleur li', { hasText: couleur });
  const choisirCouleur = (page: Page, couleur: string, maj = false) =>
    page.locator('.couleur-choix', { hasText: couleur }).click(maj ? { modifiers: ['Shift'] } : {});
  const autresActions = (page: Page, couleur: string) => page.locator(`[aria-label="Autres actions sur ${couleur}"]`);
  /** Les formes choisies, lues dans la liste des formes. */
  const formesChoisies = (page: Page) => page.locator('.editeur-calques ol > li.choisi').count();
  const lignes = (page: Page) => page.locator('.par-couleur li').evaluateAll(l => l.map(e => (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
  const message = (page: Page) => texteDe(page.locator('.editeur-barre-selection .aide').first());

  it('liste les couleurs du dessin avec leur nombre de formes', async () => {
    const page = await editeur();
    expect(await lignes(page)).toEqual(['#1428A0 1', '#15181D 1', '#C81E28 1', '#E9ECEF 1']);
    expect(await formesVisibles(page)).toBe(4);
  });

  it('choisit les formes d\'une couleur, et ajoute celles d\'une autre avec Maj', async () => {
    const page = await editeur();
    await choisirCouleur(page, ROUGE);
    await attend(() => formesChoisies(page)).toBe(1);
    await attend(() => message(page)).toBe('1 sélectionnée');
    await choisirCouleur(page, BLEU, true);
    await attend(() => formesChoisies(page)).toBe(2);
    await attend(() => message(page)).toBe('2 sélectionnées');
    // Sans Maj, le choix remplace la selection.
    await choisirCouleur(page, BLEU);
    await attend(() => formesChoisies(page)).toBe(1);
  });

  it('masque une couleur : la forme quitte la toile et la selection, la couleur reste listee', async () => {
    const page = await editeur();
    await choisirCouleur(page, ROUGE);
    await choisirCouleur(page, BLEU, true);
    await page.getByRole('button', { name: `Masquer les formes ${ROUGE}` }).click();
    await attend(() => formesVisibles(page)).toBe(3);
    await attend(() => message(page)).toBe('1 sélectionnée');
    // La ligne reste, attenuee, et son bouton propose maintenant de la reafficher.
    expect(await ligneDe(page, ROUGE).getAttribute('class')).toContain('attenue');
    expect(await page.getByRole('button', { name: `Masquer les formes ${ROUGE}` }).count()).toBe(0);

    await page.getByRole('button', { name: `Afficher les formes ${ROUGE}` }).click();
    await attend(() => formesVisibles(page)).toBe(4);
    expect(await ligneDe(page, ROUGE).getAttribute('class')).not.toContain('attenue');
  });

  it('n\'affiche qu\'une couleur, puis tout, et grise « Tout afficher » quand il n\'y a rien a rendre', async () => {
    const page = await editeur();
    const toutAfficher = page.getByRole('button', { name: 'Tout afficher' });
    expect(await toutAfficher.isDisabled()).toBe(true);

    await autresActions(page, BLEU).click();
    await page.getByRole('menuitem', { name: /N’afficher que cette couleur/ }).click();
    await attend(() => formesVisibles(page)).toBe(1);
    await attend(() => toutAfficher.isDisabled()).toBe(false);

    await toutAfficher.click();
    await attend(() => formesVisibles(page)).toBe(4);
    await attend(() => toutAfficher.isDisabled()).toBe(true);
  });

  it('verrouille une couleur : on ne la choisit plus, jusqu\'a son deverrouillage', async () => {
    const page = await editeur();
    await page.getByRole('button', { name: `Verrouiller les formes ${BLEU}` }).click();
    await choisirCouleur(page, BLEU);
    await attend(() => texteDe(page.locator('.message-etat'))).toBe(`Les formes ${BLEU} sont masquées ou verrouillées.`);
    expect(await formesChoisies(page)).toBe(0);

    await page.getByRole('button', { name: `Déverrouiller les formes ${BLEU}` }).click();
    await choisirCouleur(page, BLEU);
    await attend(() => formesChoisies(page)).toBe(1);
  });

  it('lit les couleurs sur le trait seul, sur le fond seul, puis sur les deux', async () => {
    const page = await editeur();
    await page.getByRole('button', { name: 'Trait', exact: true }).click();
    await attend(() => lignes(page)).toEqual(['#15181D 1']);
    // Le contour de #15181D n'a pas de remplissage : il disparait de la lecture « fond ».
    await page.getByRole('button', { name: 'Fond', exact: true }).click();
    await attend(() => lignes(page)).toEqual(['#1428A0 1', '#C81E28 1', '#E9ECEF 1']);
    await page.getByRole('button', { name: 'Les deux', exact: true }).click();
    await attend(() => lignes(page)).toHaveLength(4);
  });

  it('inverse la selection', async () => {
    const page = await editeur();
    await choisirCouleur(page, ROUGE);
    await attend(() => formesChoisies(page)).toBe(1);
    await page.getByRole('button', { name: 'Inverser' }).click();
    await attend(() => formesChoisies(page)).toBe(3);
  });

  it('combine deux formes de meme couleur en une, et refuse quand il n\'y en a qu\'une', async () => {
    const page = await editeur();
    await autresActions(page, ROUGE).click();
    expect(await page.getByRole('menuitem', { name: /Combiner/ }).isDisabled()).toBe(true);
    await page.keyboard.press('Escape');

    // Une copie du rond rouge : deux formes rouges.
    await choisirCouleur(page, ROUGE);
    await page.keyboard.press('Control+d');
    await attend(() => nombreDeCalques(page)).toBe(5);
    await attend(() => ligneDe(page, ROUGE).innerText().then(t => t.replace(/\s+/g, ' ').trim())).toContain('2');

    await autresActions(page, ROUGE).click();
    await page.getByRole('menuitem', { name: /Combiner/ }).click();
    await attend(() => nombreDeCalques(page)).toBe(4);
    await attend(() => lignes(page)).toContain('#C81E28 1');
  });

  it('supprime les formes d\'une couleur, et l\'historique les rend', async () => {
    const page = await editeur();
    await autresActions(page, ROUGE).click();
    await page.getByRole('menuitem', { name: /Supprimer ces formes/ }).click();
    await attend(() => formesVisibles(page)).toBe(3);
    await attend(() => lignes(page)).toEqual(['#1428A0 1', '#15181D 1', '#E9ECEF 1']);

    await page.keyboard.press('Control+z');
    await attend(() => formesVisibles(page)).toBe(4);
    await attend(() => lignes(page)).toHaveLength(4);
  });
});
