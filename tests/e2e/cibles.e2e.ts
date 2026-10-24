// La taille des cibles (WCAG 2.5.8, niveau AA) : tout bouton, lien, champ, resume ou element de menu visible fait 24 × 24
// pixels CSS au moins. Le test passe sur l'accueil (ses trois voies, une image deposee, le nuancier), puis sur l'editeur
// (l'exemple, une forme choisie, la bibliotheque chargee, les menus et le panneau d'export), a 1280 px a la souris et a
// 390 px au doigt. Il echoue en nommant chaque cible trop petite : une cible neuve doit etre de la bonne taille des sa creation.
//
// Ce que le critere permet, et que le test admet : les liens au fil d'une phrase (un `a` en ligne dans un paragraphe ou une
// liste), et ce qui n'est visible que pour un lecteur d'ecran (`.sr-only`, 1 pixel). Un champ a case ou a bouton radio se
// mesure par son etiquette, qui est la vraie surface cliquable. L'exception « espacement » du critere n'est pas employee :
// elle accepterait des cibles plus petites sans rien dire ; ici, la regle est la taille.

import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, imageDeTest, ouvrirExemple, ouvrirMenu, pilote } from './aide.js';

const MIN = 24;

interface Petite { cible: string; largeur: number; hauteur: number }

/** Les cibles visibles de la page qui font moins de 24 × 24, nommees pour qu'on les retrouve. */
async function petitesCibles(page: Page, minimum = MIN): Promise<Petite[]> {
  return page.evaluate(min => {
    const SELECTEUR = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"]';
    const nom = (e: Element): string => {
      const h = e as HTMLElement;
      const texte = (h.getAttribute('aria-label') ?? h.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const type = e instanceof HTMLInputElement ? '[' + e.type + ']' : '';
      return e.tagName.toLowerCase() + type + (h.className && typeof h.className === 'string' ? '.' + h.className.trim().split(/\s+/).join('.') : '') + (texte ? ' « ' + texte + ' »' : '');
    };
    const sortie: Array<{ cible: string; largeur: number; hauteur: number }> = [];
    for (const e of Array.from(document.querySelectorAll(SELECTEUR))) {
      if (e instanceof HTMLInputElement && e.type === 'hidden') continue;
      // Invisible (display none, visibility hidden, tiroir ferme, hote inerte) : pas une cible.
      if (!e.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions)) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Reserve aux lecteurs d'ecran : un pixel, rogne.
      if (r.width <= 1 && r.height <= 1) continue;
      // Un lien au fil d'une phrase.
      if (e instanceof HTMLAnchorElement && getComputedStyle(e).display === 'inline' && e.closest('p, li')) continue;
      // Une case ou un bouton radio : la surface cliquable est son etiquette.
      const etiquette = e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio') ? e.closest('label') ?? e.labels?.[0] ?? null : null;
      const mesure = (etiquette ?? e).getBoundingClientRect();
      if (mesure.width < min - 0.01 || mesure.height < min - 0.01) sortie.push({ cible: nom(e), largeur: Math.round(mesure.width * 10) / 10, hauteur: Math.round(mesure.height * 10) / 10 });
    }
    return sortie;
  }, minimum);
}

const dit = (p: readonly Petite[]) => 'Cibles de moins de 24 × 24 :\n' + p.map(c => `  ${c.largeur} × ${c.hauteur}  ${c.cible}`).join('\n');

/** Laisse finir les animations d'entree (une section qui se deplie, un menu qui apparait) : on mesure des tailles posees. */
async function poser(page: Page): Promise<void> {
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => undefined))),
    new Promise(fini => setTimeout(fini, 2000))
  ]).then(() => undefined));
}

const APPAREILS = [
  { nom: '1280 px, a la souris', options: { largeur: 1280, hauteur: 800, tactile: false } },
  { nom: '390 px, au doigt', options: { largeur: 390, hauteur: 800, tactile: true } }
] as const;

describe.each(APPAREILS)('cibles de 24 px au moins : $nom', ({ options }) => {
  const navigateur = pilote();
  const tactile = options.tactile;

  async function ouvrirPage() {
    return (await navigateur.ouvrir(options)).page;
  }
  async function exiger(page: Page) {
    await poser(page);
    const petites = await petitesCibles(page);
    expect(petites, dit(petites)).toEqual([]);
  }
  async function cliquer(l: ReturnType<Page['locator']>) {
    if (tactile) await l.tap(); else await l.click();
  }
  async function editeur() {
    const page = await ouvrirPage();
    await ouvrirExemple(page, tactile);
    return page;
  }
  /** Ouvre le tiroir (au doigt) ou ne fait rien (a la souris, les panneaux sont la). */
  async function tiroir(page: Page, nom: 'Calques' | 'Inspecteur') {
    if (tactile) await page.locator('.editeur-etat').getByRole('button', { name: nom, exact: true }).tap();
  }
  async function toutOuvrir(page: Page, zone: string) {
    await page.locator(zone + ' details.section:not([open]) > summary').evaluateAll(l => l.forEach(e => (e as HTMLElement).click()));
  }

  describe('l accueil', () => {
    it('voie « ouvrir un SVG »', async () => {
      await exiger(await ouvrirPage());
    });

    it('voie « convertir une image », vide puis avec une image deposee', async () => {
      const page = await ouvrirPage();
      await cliquer(page.getByRole('tab', { name: /^Convertir une image/ }));
      await exiger(page);
      await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
      await page.locator('.fiche-resultat').waitFor({ timeout: 60_000 });
      await toutOuvrir(page, '.vectoriser');
      await exiger(page);
    });

    it('voie « bibliotheque » chargee', async () => {
      const page = await ouvrirPage();
      await cliquer(page.getByRole('tab', { name: /^Bibliothèque/ }));
      await cliquer(page.getByRole('button', { name: /Charger la bibliothèque/ }));
      await page.locator('.bibliotheque .vignette').first().waitFor({ timeout: 60_000 });
      await exiger(page);
    });

    it('nuancier ouvert, et boite « A propos et credits »', async () => {
      const page = await ouvrirPage();
      await cliquer(page.getByText('Nuancier proposé dans l’éditeur'));
      await exiger(page);
      await cliquer(page.getByRole('button', { name: 'À propos et crédits' }));
      await page.getByRole('dialog', { name: 'À propos et crédits' }).waitFor();
      await exiger(page);
    });
  });

  describe('l editeur', () => {
    it('avec l exemple : la barre, les calques et le panneau du dessin deplies', async () => {
      const page = await editeur();
      await exiger(page);
      await tiroir(page, 'Calques');
      await toutOuvrir(page, '.editeur-calques');
      await exiger(page);
      if (tactile) await page.locator('.voile').tap({ position: { x: 380, y: 300 } });
      await tiroir(page, 'Inspecteur');
      await toutOuvrir(page, '.editeur-inspecteur');
      await exiger(page);
    });

    it('avec une forme choisie : la rangee de selection et l inspecteur deplie', async () => {
      const page = await editeur();
      const forme = page.locator('.editeur-svg-toile path[data-id="f2"]');
      if (tactile) await forme.tap(); else await forme.click();
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      await exiger(page);
      await tiroir(page, 'Inspecteur');
      await toutOuvrir(page, '.editeur-inspecteur');
      await exiger(page);
    });

    it('avec la bibliotheque chargee dans le panneau du dessin', async () => {
      const page = await editeur();
      await tiroir(page, 'Inspecteur');
      await cliquer(page.locator('.editeur-inspecteur details.section', { hasText: 'Bibliothèque de formes' }).locator('> summary'));
      await cliquer(page.getByRole('button', { name: /Charger la bibliothèque/ }));
      await page.locator('.editeur-inspecteur .vignette').first().waitFor({ timeout: 60_000 });
      await exiger(page);
    });

    it('avec les menus ouverts, dont le panneau d export du menu Fichier', async () => {
      const page = await editeur();
      for (const menu of ['Vue', 'Édition', 'Fichier']) {
        const bouton = await ouvrirMenu(page, menu);
        await page.getByRole('menu', { name: menu }).waitFor();
        await exiger(page);
        await page.keyboard.press('Escape');
        await attend(() => bouton.getAttribute('aria-expanded')).toBe('false');
      }
    });

    it('avec le menu des formes, la boite des credits et le menu d export de l accueil', async () => {
      const page = await editeur();
      await cliquer(page.getByRole('button', { name: 'Choisir une forme' }));
      await page.getByRole('menu', { name: 'Choisir une forme' }).waitFor();
      await exiger(page);
      await page.keyboard.press('Escape');
      // Une modification, puis « Enregistrer » : l'editeur se ferme sur la fiche du resultat et son menu Exporter.
      await cliquer(page.locator('.editeur-svg-toile path[data-id="f2"]'));
      await page.keyboard.press('Delete');
      await page.keyboard.press('Control+s');
      await page.locator('.resultat').waitFor();
      await cliquer(page.locator('.resultat .menu-bouton', { hasText: 'Exporter' }));
      await page.locator('.menu-panneau').waitFor();
      await exiger(page);
    });
  });
});

describe('le detecteur de petites cibles', () => {
  const navigateur = pilote();

  it('nomme une cible de 16 px et ignore ce que le critere permet', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 400, hauteur: 300, naviguer: false });
    await page.setContent(`<body style="margin:0">
      <button id="petit" style="width:16px;height:16px;padding:0">x</button>
      <button style="width:24px;height:24px;padding:0">ok</button>
      <button hidden style="width:8px;height:8px">cache</button>
      <button class="sr-only" style="position:absolute;width:1px;height:1px;padding:0;border:0;overflow:hidden">lecteur</button>
      <label style="display:block;width:30px;height:30px"><input type="checkbox"></label>
      <p>Un <a href="#x">lien</a> dans une phrase.</p>
      <a href="#y" style="display:inline-block;width:10px;height:10px">y</a></body>`);
    const petites = await petitesCibles(page);
    expect(petites.map(c => c.cible.split(' ')[0])).toEqual(['button', 'a']);
    expect(petites[0]).toMatchObject({ largeur: 16, hauteur: 16 });
  });
});
