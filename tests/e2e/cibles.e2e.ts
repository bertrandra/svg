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
import { attend, attendreAnimations, imageDeTest, ouvrirCode, ouvrirExemple, ouvrirMenu, pilote } from './aide.js';

const MIN = 24;

interface Petite { cible: string; largeur: number; hauteur: number }

/** Les cibles visibles de la page qui font moins de 24 × 24, nommees pour qu'on les retrouve. */
async function petitesCibles(page: Page, minimum = MIN): Promise<Petite[]> {
  return page.evaluate(min => {
    const SELECTEUR = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"]';
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
  await attendreAnimations(page);
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

    // Un accueil par public (ADR-0022) : la question, la ligne qui la rappelle, chaque suite adaptee (le panneau des integrateurs compris).
    it('la question du public, puis chaque public et la question rouverte', async () => {
      const page = await ouvrirPage();
      await exiger(page);
      for (const nom of ['Découper ou dessiner avec une machine', 'Retoucher un dessin ou une image', 'Intégrer l’éditeur à mon produit']) {
        await cliquer(page.locator('.public-question').getByRole('button', { name: new RegExp('^' + nom) }));
        await page.locator('.public-rappel').waitFor();
        await exiger(page);
        await cliquer(page.getByRole('button', { name: 'Changer de public' }));
        await page.locator('.public-question').waitFor();
        await exiger(page);
      }
      await cliquer(page.locator('.public-question').getByRole('button', { name: /^Passer/ }));
      await page.getByRole('button', { name: 'Choisir un public' }).waitFor();
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

    it('avec un texte vivant : sa section Texte, l apercu forme / ligne ouvert, et sa saisie en place', async () => {
      const page = await editeur();
      const outil = page.locator('.editeur-barre button[title^="Texte (T)"]');
      await cliquer(outil);
      await tiroir(page, 'Inspecteur');
      await page.locator('.editeur-inspecteur select[aria-label="Police"]').waitFor({ timeout: 30_000 });
      await cliquer(page.getByRole('button', { name: 'Ajouter le texte' }));
      await page.locator('.editeur-inspecteur details.section', { has: page.locator('summary', { hasText: 'Texte' }) }).waitFor();
      await cliquer(page.locator('.editeur-inspecteur').getByRole('button', { name: 'Aperçu forme / ligne' }).first());
      await page.locator('.apercu-police').waitFor();
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

    it('en contexte Cricut : le selecteur ouvert, le panneau « Pret pour Cricut » et ses corrections, le gabarit', async () => {
      const page = await ouvrirPage();
      // Un trait, deux nuances proches, une bande trop fine et une barre plus large que le tapis : tous les boutons du panneau.
      await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 700"><path d="M96 96H288V288H96Z" fill="#c81e28" stroke="#15181d" stroke-width="8"/>'
        + '<path d="M384 96H576V288H384Z" fill="#c91f27"/><path d="M960 96H963V288H960Z" fill="#1428a0"/><path d="M96 480H1250V560H96Z" fill="#2a9d8f"/></svg>', tactile);
      const bouton = tactile ? page.getByRole('button', { name: /^Plus d’actions/ }) : page.locator('.selecteur-contexte .menu-bouton');
      await cliquer(bouton);
      await page.getByRole('menu', { name: 'Machine' }).waitFor();
      await exiger(page);
      const cricut = page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' });
      await cricut.scrollIntoViewIfNeeded();
      await cliquer(cricut);
      await cliquer(bouton);
      await page.getByRole('menu', { name: 'Machine' }).waitFor();
      await exiger(page);
      await page.keyboard.press('Escape');
      await attend(() => bouton.getAttribute('aria-expanded')).toBe('false');
      await tiroir(page, 'Inspecteur');
      await page.locator('.panneau-cricut .constat').first().waitFor();
      await cliquer(page.locator('.panneau-cricut .aide-cricut > summary'));
      await exiger(page);
    });

    it('la fin du parcours : « Autres formats », la confirmation d un export Cricut et la carte « Dans Design Space »', async () => {
      const page = await ouvrirPage();
      // Un triangle ouvert a la pointe fine : deux points a corriger, aucun bloquant.
      await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28"/><path d="M288 48L432 48L360 240" fill="#1428a0"/></svg>', tactile);
      await ouvrirMenu(page, 'Autres formats');
      await page.locator('.menu-panneau .contenu-export').waitFor();
      await exiger(page);
      await page.keyboard.press('Escape');
      await attend(() => page.locator('.menu-panneau').count()).toBe(0);
      const bouton = tactile ? page.getByRole('button', { name: /^Plus d’actions/ }) : page.locator('.selecteur-contexte .menu-bouton');
      await cliquer(bouton);
      const maker = page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' });
      await maker.scrollIntoViewIfNeeded();
      await cliquer(maker);
      await tiroir(page, 'Inspecteur');
      const exporter = page.locator('.panneau-cricut .export-cricut button.primaire');
      await attend(() => exporter.innerText()).toMatch(/^Exporter quand même/);
      await cliquer(exporter);
      await page.locator('.panneau-cricut .confirmation-export').waitFor();
      await exiger(page);
      await Promise.all([page.waitForEvent('download'), cliquer(page.locator('.panneau-cricut .confirmation-export').getByRole('button', { name: 'Exporter quand même' }))]);
      await page.locator('.panneau-cricut .carte-design-space').waitFor();
      await exiger(page);
    });

    it('la visite guidee : la bulle a chaque etape, ses suites, et la boite des raccourcis', async () => {
      const page = await ouvrirPage();
      await cliquer(page.getByRole('button', { name: 'Essayer avec la visite guidée' }));
      await page.locator('.bulle-visite').waitFor();
      await exiger(page);
      for (const n of [2, 3, 4, 5]) {
        await cliquer(page.locator('.bulle-visite').getByRole('button', { name: 'Suivant' }));
        await page.locator('.bulle-progression', { hasText: 'Étape ' + n + ' sur 5' }).waitFor();
        await exiger(page);
      }
      await cliquer(page.locator('.bulle-visite').getByRole('button', { name: 'Terminer' }));
      await ouvrirMenu(page, 'Aide');
      await cliquer(page.getByRole('menuitem', { name: 'Raccourcis clavier' }));
      await page.getByRole('dialog', { name: 'Raccourcis clavier' }).waitFor();
      await exiger(page);
    });

    it('les reperes de premiere rencontre et les etats vides', async () => {
      const page = await editeur();
      const bouton = tactile ? page.getByRole('button', { name: /^Plus d’actions/ }) : page.locator('.selecteur-contexte .menu-bouton');
      await cliquer(bouton);
      const cricut = page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' });
      await cricut.scrollIntoViewIfNeeded();
      await cliquer(cricut);
      await tiroir(page, 'Inspecteur');
      await page.locator('.repere[data-repere="cricut"]').waitFor();
      await exiger(page);
      // Le tiroir de l'inspecteur est a droite : le voile se touche a gauche.
      if (tactile) await page.locator('.voile').tap({ position: { x: 20, y: 300 } });
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await tiroir(page, 'Inspecteur');
      await page.locator('.editeur-inspecteur [data-vide="vide"]').waitFor();
      await exiger(page);
    });

    it('avec le menu des formes, la boite des credits et le menu d export de l accueil', async () => {
      const page = await editeur();
      await cliquer(page.getByRole('button', { name: 'Choisir une forme' }));
      await page.getByRole('menu', { name: 'Choisir une forme' }).waitFor();
      await exiger(page);
      await page.keyboard.press('Escape');
      // Une modification, puis « Terminer » : l'editeur se ferme sur la fiche du resultat et son menu « Autres formats ».
      await cliquer(page.locator('.editeur-svg-toile path[data-id="f2"]'));
      await page.keyboard.press('Delete');
      // Le geste de fin : dans la barre au bureau, dans la barre d'etat sur un telephone.
      await cliquer(page.locator('.editeur-barre .groupe.fin button.primaire, .editeur-etat button.primaire').first());
      await page.locator('.resultat').waitFor();
      await exiger(page);
      await cliquer(page.locator('.resultat .menu-bouton', { hasText: 'Autres formats' }));
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
