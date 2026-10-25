// La barre de l'editeur sur un telephone (390 px) : rien d'utile n'est hors ecran ni derriere un defilement horizontal. Les outils,
// les couleurs, l'historique et le niveau de zoom sont dans la barre ; Vue, Edition, Fichier (« Télécharger le SVG » en tete, les
// autres formats replies) et le zoom sont dans « Plus » ; le geste de fin est dans la barre d'etat (« Terminer » dans la page ;
// « Enregistrer » chez un hote, qui dit pourquoi il est grise).

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, modifications, ouvrirExemple, pilote, URL_INTEGRATION } from './aide.js';

describe('barre de l editeur sur un telephone', () => {
  const navigateur = pilote();

  async function telephone(largeur = 390) {
    const { page } = await navigateur.ouvrir({ largeur, hauteur: 800, tactile: true });
    await ouvrirExemple(page, true);
    return page;
  }
  const plus = (page: Page) => page.getByRole('button', { name: /^Plus d’actions/ });
  const enregistrer = (page: Page, nom = 'Terminer') => page.locator('.editeur-etat').getByRole('button', { name: nom });

  for (const largeur of [320, 360, 390, 414, 600]) {
    it(`ne defile pas a ${largeur} px : tout ce que la barre porte est dans l'ecran`, async () => {
      const page = await telephone(largeur);
      const mesure = await page.evaluate(() => {
        const barre = document.querySelector('.editeur-barre');
        const boutons = Array.from(barre?.querySelectorAll('button, input') ?? []).map(e => e.getBoundingClientRect());
        // La largeur visible est `clientWidth` : sous `isMobile`, Chromium elargit `innerWidth` jusqu'au contenu qui deborde.
        const visible = document.documentElement.clientWidth;
        return { defile: (barre?.scrollWidth ?? 0) - (barre?.clientWidth ?? 0), page: document.documentElement.scrollWidth - visible, hors: boutons.filter(r => r.right > visible + 0.5 || r.left < -0.5).length, nombre: boutons.length };
      });
      expect(mesure).toMatchObject({ defile: 0, page: 0, hors: 0 });
      expect(mesure.nombre).toBeGreaterThan(8);
      // Le geste de fin aussi est dans l'ecran, dans la barre d'etat.
      const r = await enregistrer(page).boundingBox();
      expect(r && r.x >= 0 && r.x + r.width <= largeur).toBe(true);
    });
  }

  it('range Vue, Fichier (le SVG en tete, les autres formats replies) et Edition dans « Plus », au zoom pres', async () => {
    const page = await telephone();
    expect(await page.locator('.editeur-barre .menu-bouton[aria-haspopup=menu]').evaluateAll(l => l.map(e => e.getAttribute('aria-label')))).toEqual(
      ['Choisir un outil de sélection', 'Choisir une forme', 'Plus d’actions : vue, édition, fichier']
    );
    await plus(page).tap();
    for (const nom of ['Vue', 'Fichier', 'Édition']) await page.getByRole('menu', { name: nom }).waitFor();
    await page.getByRole('menuitem', { name: /^Dézoomer/ }).waitFor();
    // Recuperer le fichier ouvre la rubrique Fichier : un geste, le premier.
    expect(await page.getByRole('menu', { name: 'Fichier' }).getByRole('menuitem').first().innerText()).toContain('Télécharger le SVG');
    await page.getByRole('menuitem', { name: /^Annuler/ }).waitFor();
    // Les autres formats sont la, sous les elements de Fichier, replies : ils ne s'ouvrent que si on les demande.
    expect(await page.locator('.menu-panneau .contenu-export').isVisible()).toBe(false);
    await page.locator('.menu-panneau details.autres-formats-repli > summary').tap();
    await page.locator('.menu-panneau .contenu-export').waitFor();
    const avant = await page.locator('.editeur-barre .zoom').innerText();
    await page.getByRole('menuitem', { name: /^Dézoomer/ }).tap();
    await attend(() => page.locator('.editeur-barre .zoom').innerText()).not.toBe(avant);
  });

  it('se parcourt au clavier comme un menu : fleches d\'un bout a l\'autre, Echap rend le focus a « Plus »', async () => {
    const page = await telephone();
    await plus(page).focus();
    await page.keyboard.press('ArrowDown');
    const elements = page.locator('.menu-panneau [role^=menuitem]');
    // Le menu commence par Édition, dont « Annuler » est grisé sans historique : la flèche va au premier élément ACTIF.
    await attend(() => aLeFocus(elements.locator('xpath=self::*[not(@disabled)]').first())).toBe(true);
    // « Fin » va au dernier element ACTIF (« Supprimer », grise tant que rien n'est choisi, est saute).
    await page.keyboard.press('End');
    const dernierActif = elements.locator('xpath=self::*[not(@disabled)]').last();
    await attend(() => aLeFocus(dernierActif)).toBe(true);
    await page.keyboard.press('Escape');
    await attend(() => aLeFocus(plus(page))).toBe(true);
    expect(await page.locator('.editeur-cadre').count()).toBe(1);
  });

  it('ferme d un appui par « Terminer » dans la page, meme sans modification, sans rien reecrire', async () => {
    const page = await telephone();
    const bouton = enregistrer(page);
    expect(await bouton.getAttribute('aria-disabled')).toBeNull();
    await bouton.tap();
    await page.locator('.resultat').waitFor();
    expect(await page.locator('.editeur-cadre').count()).toBe(0);
    // Rien n'a change : pas de message « Dessin prêt », la fiche montre le fichier tel qu'il est venu.
    expect(await page.locator('.accueil .message.neutre').count()).toBe(0);
  });

  it('chez un hote, dit pourquoi « Enregistrer » est grise, reste dans l\'ordre de Tab, puis s\'active a la premiere modification', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 390, hauteur: 800, tactile: true, naviguer: false });
    await page.goto(URL_INTEGRATION);
    await page.evaluate(() => {
      const w = window as unknown as { EditeurSvg: { ouvrir(o: Record<string, unknown>): unknown } };
      w.EditeurSvg.ouvrir({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H45V45H10Z" fill="#c81e28"/><path d="M55 55H90V90H55Z" fill="#1428a0"/></svg>', onEnregistrer: () => undefined });
    });
    await page.locator('.editeur-svg .editeur-cadre').waitFor();
    const bouton = enregistrer(page, 'Enregistrer');
    expect(await bouton.getAttribute('aria-disabled')).toBe('true');
    expect(await bouton.isDisabled()).toBe(true);
    expect(await bouton.getAttribute('title')).toBe('Aucune modification à enregistrer');
    const raison = await bouton.getAttribute('aria-describedby');
    expect(await page.locator('#' + (raison ?? 'absent')).innerText()).toBe('Aucune modification à enregistrer');
    // Au clavier : on peut le focaliser, et l'activer dit la raison dans la region vocale sans rien enregistrer.
    await bouton.focus();
    expect(await aLeFocus(bouton)).toBe(true);
    await page.keyboard.press('Enter');
    await attend(() => page.locator('[role=status][aria-live=polite]').first().innerText()).toContain('Aucune modification à enregistrer');
    expect(await page.locator('.editeur-cadre').count()).toBe(1);

    await page.locator('.editeur-svg-toile path[data-id="f2"]').tap();
    await page.keyboard.press('Delete');
    await attend(() => modifications(page)).toBe(1);
    expect(await bouton.getAttribute('aria-disabled')).toBeNull();
    expect(await bouton.getAttribute('aria-describedby')).toBeNull();
  });

  it('tient la rangee de la selection dans 390 px au doigt : les gestes rares sont dans son menu « Plus », aucun n est retire', async () => {
    const page = await telephone();
    await page.locator('.editeur-svg-toile path[data-id="f2"]').tap();
    const rangee = page.locator('.editeur-barre-selection');
    await rangee.waitFor();
    expect(await rangee.evaluate(e => e.scrollWidth - e.clientWidth)).toBe(0);
    for (const nom of ['Dupliquer (Ctrl+D)', 'Miroir horizontal', 'Tourner de 90° vers la droite', 'Supprimer (Suppr)']) {
      const r = await rangee.getByRole('button', { name: nom, exact: true }).boundingBox();
      expect(r && r.x >= 0 && r.x + r.width <= 390, nom).toBe(true);
    }
    await rangee.getByRole('button', { name: /^Plus de gestes/ }).tap();
    for (const nom of ['Transformer', 'Aligner (sur le plan)', 'Empiler', 'Booléens', 'Formes']) await page.getByRole('menu', { name: nom }).waitFor();
    for (const nom of ['Miroir vertical', 'Aligner à gauche', 'Premier plan', 'Union : réunir les formes en une seule', 'Combiner en une forme', 'Masquer', 'Verrouiller']) {
      await page.getByRole('menuitem', { name: nom }).waitFor();
    }
    // Un geste du menu fait ce que faisait son bouton : il agit sur la selection et compte une modification.
    await page.getByRole('menuitem', { name: 'Miroir vertical' }).tap();
    await attend(() => modifications(page)).toBe(1);
  });

  it('montre un degrade au bord de la rangee de la selection qui defile (fenetre etroite a la souris), et y garde le bouton focalise en vue', async () => {
    // A la souris, sous 900 px, la rangee garde tous ses gestes de 40 px sur une ligne qui defile : c'est la qu'elle a besoin du degrade.
    const { page } = await navigateur.ouvrir({ largeur: 760, hauteur: 800 });
    await ouvrirExemple(page);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    const rangee = page.locator('.editeur-barre-selection');
    await rangee.waitFor();
    expect(await rangee.evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true);
    expect(await rangee.evaluate(e => getComputedStyle(e).backgroundImage.split('linear-gradient').length - 1)).toBe(4);
    const dernier = rangee.locator('button').last();
    await dernier.focus();
    await attend(async () => { const r = await dernier.boundingBox(); return !!r && r.x >= 0 && r.x + r.width <= 760; }).toBe(true);
  });
});
