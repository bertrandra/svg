// Les outils de pro de l'ADR-0038 dans le navigateur : regles et reperes (tirer, s'y aimanter, poser a une valeur, effacer, au
// clavier), dupliquer en grille, repetition radiale, symetrie, arrondir en direct ; a 390 px, et sous axe en clair et en sombre.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, formesVisibles, modifications, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
interface ResultatAxe { violations: { id: string; impact: string | null; nodes: { target: unknown[] }[] }[]; incomplete: { id: string; nodes: { target: unknown[] }[] }[] }

const svg = (corps: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">${corps}</svg>`;
/** Un carre de 40 en (50, 50). */
const CARRE = svg('<path d="M50 50H90V90H50Z" fill="#c81e28"/>');

describe('regles, reperes et repetitions', () => {
  const navigateur = pilote();

  async function editeur(contenu = CARRE, options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    await ouvrirCode(page, contenu, options.tactile);
    await page.locator('.editeur-svg-toile').focus();
    await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
    return page;
  }

  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const reperes = (page: Page, axe: 'h' | 'v') => page.locator(`.editeur-svg-toile .reperes [data-repere^="${axe}:"]:not(.tire)`);
  const valeurs = async (page: Page, axe: 'h' | 'v') => (await reperes(page, axe).evaluateAll(l => l.map(e => e.getAttribute('data-repere') ?? ''))).map(v => Number(v.slice(2)));
  /** Le point de l'ecran ou tombe un point du plan. */
  const ecran = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => {
    const g = document.querySelector('.editeur-svg-toile > g[transform]');
    const m = (g as SVGGraphicsElement | null)?.getScreenCTM();
    return m ? { x: m.a * px + m.e, y: m.d * py + m.f } : { x: 0, y: 0 };
  }, [x, y] as const);
  /** La boite d'une forme dans le plan. */
  const boite = (page: Page, id: string) => page.locator(`.editeur-svg-toile path[data-id="${id}"]`).evaluate(e => { const b = (e as unknown as SVGGraphicsElement).getBBox(); return { x: b.x, y: b.y, l: b.width, h: b.height }; });
  const panneau = (page: Page) => page.locator('.panneau-flottant');
  const champ = (page: Page, libelle: string) => panneau(page).getByLabel(libelle, { exact: true });

  async function afficherRegles(page: Page) {
    await page.keyboard.press('Shift+R');
    await attend(() => page.locator('.regle-h').count()).toBe(1);
  }

  /** Tire un repere horizontal depuis la regle du haut jusqu'a l'ordonnee `y` du plan. */
  async function tirerHorizontal(page: Page, y: number) {
    const r = await page.locator('.regle-h').boundingBox();
    if (!r) throw new Error('pas de regle');
    const cible = await ecran(page, 200, y);
    await page.mouse.move(r.x + 200, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + 200, cible.y, { steps: 6 });
    await page.mouse.up();
  }

  describe('regles et reperes', () => {
    it('Maj+R montre les regles ; un repere se tire de la regle du haut, en une modification, et se dit', async () => {
      const page = await editeur();
      expect(await page.locator('.regle').count()).toBe(0);
      await afficherRegles(page);
      const avant = await modifications(page);
      await tirerHorizontal(page, 150);
      await attend(() => reperes(page, 'h').count()).toBe(1);
      const [v] = await valeurs(page, 'h');
      expect(Math.abs((v ?? 0) - 150)).toBeLessThan(1.5);
      expect(await modifications(page)).toBe(avant + 1);
      await attend(() => dit(page)).toMatch(/^Repère horizontal à [\d,]+ posé\.$/);
      // Relache sur la regle elle-meme : rien n'est pose.
      const r = await page.locator('.regle-h').boundingBox();
      if (!r) throw new Error('pas de regle');
      await page.mouse.move(r.x + 100, r.y + 5);
      await page.mouse.down();
      await page.mouse.move(r.x + 120, r.y + 8, { steps: 3 });
      await page.mouse.up();
      expect(await reperes(page, 'h').count()).toBe(1);
    });

    it('la forme deplacee s accroche au repere (aimants)', async () => {
      const page = await editeur();
      await afficherRegles(page);
      await tirerHorizontal(page, 150);
      await attend(() => reperes(page, 'h').count()).toBe(1);
      const [g] = await valeurs(page, 'h');
      // La forme choisie d'abord : la rangee de la selection qui apparait ferait descendre la toile pendant le geste.
      await page.keyboard.press('Control+a');
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      // Le carre (haut a 50) glisse de 97 unites : son haut passe a 147, a 3 du repere ; il s'y colle.
      const depart = await ecran(page, 70, 70), arrivee = await ecran(page, 70, 167);
      await page.mouse.move(depart.x, depart.y);
      await page.mouse.down();
      await page.mouse.move(arrivee.x, arrivee.y, { steps: 8 });
      await page.mouse.up();
      const b = await boite(page, 'f1');
      expect(Math.abs(b.y - (g ?? 0))).toBeLessThan(0.01);
    });

    it('un double-clic ouvre son champ : Entree le pose a la valeur exacte ; le panneau en ajoute un autre a une valeur', async () => {
      const page = await editeur();
      await afficherRegles(page);
      await tirerHorizontal(page, 150);
      await attend(() => reperes(page, 'h').count()).toBe(1);
      const [v] = await valeurs(page, 'h');
      const p = await ecran(page, 300, v ?? 0);
      await page.mouse.dblclick(p.x, p.y);
      await attend(() => panneau(page).count()).toBe(1);
      const champRepere = panneau(page).getByLabel(/^Repère horizontal/);
      await attend(() => aLeFocus(champRepere)).toBe(true);
      await page.keyboard.press('Control+a');
      await page.keyboard.type('120');
      await page.keyboard.press('Enter');
      await attend(() => valeurs(page, 'h')).toEqual([120]);
      await panneau(page).getByLabel('Sens du repère à ajouter').selectOption('v');
      await panneau(page).getByLabel('À l’abscisse').fill('200,5');
      await panneau(page).getByRole('button', { name: 'Poser le repère' }).click();
      await attend(() => valeurs(page, 'v')).toEqual([200.5]);
      await page.keyboard.press('Escape');
      await attend(() => panneau(page).count()).toBe(0);
    });

    it('s efface : glisse hors de la toile, par Suppr, ou tous par Ctrl+Maj+; ; Ctrl+Z les rend', async () => {
      const page = await editeur();
      await afficherRegles(page);
      for (const y of [100, 150, 200]) await tirerHorizontal(page, y);
      await attend(() => reperes(page, 'h').count()).toBe(3);
      // Glisser le premier sur la regle du haut le retire.
      const [premier] = await valeurs(page, 'h');
      const p = await ecran(page, 300, premier ?? 0), regle = await page.locator('.regle-h').boundingBox();
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x, (regle?.y ?? 0) + 4, { steps: 6 });
      await page.mouse.up();
      await attend(() => reperes(page, 'h').count()).toBe(2);
      await attend(() => dit(page)).toMatch(/retiré\.$/);
      // Un clic le choisit, Suppr le retire (et pas la forme).
      const [second] = await valeurs(page, 'h');
      const q = await ecran(page, 300, second ?? 0);
      await page.mouse.click(q.x, q.y);
      await page.keyboard.press('Delete');
      await attend(() => reperes(page, 'h').count()).toBe(1);
      expect(await formesVisibles(page)).toBe(1);
      await page.keyboard.press('Control+Shift+Semicolon');
      await attend(() => reperes(page, 'h').count()).toBe(0);
      await attend(() => dit(page)).toBe('1 repère effacé : Ctrl+Z les fait revenir.');
      await page.keyboard.press('Control+z');
      await attend(() => reperes(page, 'h').count()).toBe(1);
    });

    it('au menu Vue : afficher, verrouiller, effacer ; verrouilles, ils ne se prennent plus', async () => {
      const page = await editeur();
      await ouvrirMenu(page, 'Vue');
      await page.getByRole('menuitemcheckbox', { name: /Afficher les règles/ }).click();
      await tirerHorizontal(page, 150);
      await attend(() => reperes(page, 'h').count()).toBe(1);
      await ouvrirMenu(page, 'Vue');
      await page.getByRole('menuitemcheckbox', { name: /Verrouiller les repères/ }).click();
      await attend(() => page.locator('.reperes .repere.verrouille').count()).toBe(1);
      expect(await page.locator('.reperes .repere-cible').count()).toBe(0);
      await ouvrirMenu(page, 'Vue');
      await page.getByRole('menuitemcheckbox', { name: /Afficher les repères/ }).click();
      await attend(() => page.locator('.reperes').count()).toBe(0);
      await page.keyboard.press('Control+Semicolon');
      await attend(() => reperes(page, 'h').count()).toBe(1);
      await ouvrirMenu(page, 'Vue');
      await page.getByRole('menuitem', { name: /Effacer les repères/ }).click();
      await attend(() => reperes(page, 'h').count()).toBe(0);
    });

    it('au clavier : Entree sur une regle pose un repere et ouvre son champ ; choisi, les fleches le deplacent', async () => {
      const page = await editeur();
      await afficherRegles(page);
      await page.locator('.regle-v .regle-prise').focus();
      await page.keyboard.press('Enter');
      await attend(() => reperes(page, 'v').count()).toBe(1);
      const champRepere = panneau(page).getByLabel(/^Repère vertical/);
      await attend(() => aLeFocus(champRepere)).toBe(true);
      await page.keyboard.press('Control+a');
      await page.keyboard.type('100');
      await page.keyboard.press('Enter');
      await attend(() => valeurs(page, 'v')).toEqual([100]);
      await page.keyboard.press('Escape');
      await attend(() => panneau(page).count()).toBe(0);
      // Le repere reste choisi et la toile a le focus : les fleches le poussent d'un millieme du plan (dix avec Maj).
      await attend(() => aLeFocus(page.locator('.editeur-svg-toile'))).toBe(true);
      await page.keyboard.press('Shift+ArrowRight');
      await attend(() => valeurs(page, 'v')).toEqual([104]);
      await page.keyboard.press('Delete');
      await attend(() => reperes(page, 'v').count()).toBe(0);
    });
  });

  describe('repetitions', () => {
    it('duplique en grille 3 x 4 avec un apercu, en une modification que Ctrl+Z defait', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: 'Dupliquer en grille…' }).click();
      await attend(() => panneau(page).count()).toBe(1);
      await champ(page, 'Lignes').fill('3');
      await champ(page, 'Colonnes').fill('4');
      await champ(page, 'Pas →').fill('50');
      await champ(page, 'Pas ↓').fill('60');
      // L'apercu est sur la toile avant d'appliquer.
      await attend(() => formesVisibles(page)).toBe(12);
      const avant = await modifications(page);
      await panneau(page).getByRole('button', { name: 'Appliquer', exact: true }).click();
      await attend(() => panneau(page).count()).toBe(0);
      await attend(() => dit(page)).toBe('Grille de 3 × 4 : 11 copies posées.');
      expect(await modifications(page)).toBe(avant);
      expect(await page.locator('.editeur-barre-selection .aide').first().textContent()).toBe('12 sélectionnées');
      const derniere = await boite(page, 'f12');
      expect([derniere.x, derniere.y]).toEqual([200, 170]);
      await page.keyboard.press('Control+z');
      await attend(() => formesVisibles(page)).toBe(1);
    });

    it('repetition radiale de 8, depuis le menu de la selection ; Echap abandonne l apercu', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await page.locator('.editeur-barre-selection').getByRole('button', { name: 'Répéter : grille, radiale, symétrie' }).click();
      await page.getByRole('menuitem', { name: 'Répétition radiale…' }).click();
      await attend(() => formesVisibles(page)).toBe(8);
      await page.keyboard.press('Escape');
      await attend(() => panneau(page).count()).toBe(0);
      await attend(() => formesVisibles(page)).toBe(1);
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: 'Répétition radiale…' }).click();
      await champ(page, 'Exemplaires').fill('8');
      await panneau(page).getByRole('button', { name: 'Appliquer', exact: true }).click();
      await attend(() => formesVisibles(page)).toBe(8);
      await attend(() => dit(page)).toBe('Répétition radiale de 8 exemplaires : 7 copies posées.');
    });

    it('symetrie horizontale autour d un axe, l original garde ; puis sans le garder', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: 'Symétrie…' }).click();
      await champ(page, 'Axe à x =').fill('200');
      await attend(() => formesVisibles(page)).toBe(2);
      await panneau(page).getByRole('button', { name: 'Appliquer', exact: true }).click();
      const reflet = await boite(page, 'f2');
      expect([reflet.x, reflet.y, reflet.l]).toEqual([310, 50, 40]);
      await page.keyboard.press('Control+a');
      await ouvrirMenu(page, 'Édition');
      await page.getByRole('menuitem', { name: 'Symétrie…' }).click();
      await panneau(page).getByRole('button', { name: /Vertical/ }).click();
      await panneau(page).getByLabel('Garder l’original').uncheck();
      await panneau(page).getByRole('button', { name: 'Appliquer', exact: true }).click();
      await attend(() => dit(page)).toBe('Sélection retournée en miroir vertical.');
      expect(await formesVisibles(page)).toBe(2);
    });
  });

  describe('arrondir en direct', () => {
    async function transformer(page: Page) {
      await page.keyboard.press('Control+a');
      const resume = page.locator('.editeur-inspecteur details.section > summary', { hasText: 'Transformer' });
      if (!(await resume.evaluate(e => (e.parentElement as HTMLDetailsElement).open))) await resume.click();
    }

    it('le curseur arrondit le carre sous les yeux, en une modification, et le dit en le quittant', async () => {
      const page = await editeur();
      await transformer(page);
      const curseur = page.locator('.arrondi-direct input[type="range"]');
      const avant = await modifications(page);
      await curseur.focus();
      for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
      await attend(() => page.locator('.editeur-svg-toile path[data-id="f1"]').getAttribute('d').then(d => (d?.match(/C/g) ?? []).length)).toBe(4);
      await page.locator('.arrondi-direct input[data-champ-trace="rayon"]').focus();
      await attend(() => dit(page)).toMatch(/^4 angles arrondis au rayon/);
      expect(await modifications(page)).toBe(avant + 1);
      await page.keyboard.press('Escape');
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('Control+z');
      await attend(() => page.locator('.editeur-svg-toile path[data-id="f1"]').getAttribute('d').then(d => (d?.match(/C/g) ?? []).length)).toBe(0);
    });

    it('en mode points, seul le coin du point actif s arrondit', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Enter');
      await attend(() => page.locator('.editeur-svg-toile rect[data-ancre]').count()).toBeGreaterThan(2);
      await page.locator('.editeur-svg-toile rect[data-ancre="2"]').click();
      const resume = page.locator('.editeur-inspecteur details.section > summary', { hasText: 'Transformer' });
      if (!(await resume.evaluate(e => (e.parentElement as HTMLDetailsElement).open))) await resume.click();
      await page.locator('.arrondi-direct input[data-champ-trace="rayon"]').fill('10');
      await page.getByRole('button', { name: 'Arrondir ce coin' }).click();
      await attend(() => dit(page)).toBe('1 angle arrondi au rayon 10.');
      expect(((await page.locator('.editeur-svg-toile path[data-id="f1"]').getAttribute('d')) ?? '').match(/C/g)?.length).toBe(1);
    });
  });

  describe('largeur variable', () => {
    it('le trait d une courbe devient une surface qui suit le profil, couleur du trait en fond', async () => {
      const page = await editeur(svg('<path d="M40 200C100 80 300 80 360 200" stroke="#1428a0" stroke-width="4" fill="none"/>'));
      await page.keyboard.press('Control+a');
      const resume = page.locator('.editeur-inspecteur details.section > summary', { hasText: 'Transformer' });
      if (!(await resume.evaluate(e => (e.parentElement as HTMLDetailsElement).open))) await resume.click();
      const groupe = page.getByRole('group', { name: 'Largeur variable du trait' });
      await groupe.getByLabel('Début', { exact: true }).fill('1');
      await groupe.getByLabel('Milieu', { exact: true }).fill('20');
      await groupe.getByLabel('Fin', { exact: true }).fill('1');
      await groupe.getByRole('button', { name: 'Élargir le trait' }).click();
      await attend(() => page.locator('.editeur-svg-toile path[data-id="f1"]').getAttribute('fill')).toBe('#1428a0');
      await attend(() => dit(page)).toBe('1 trait devenu une surface de largeur variable.');
      const b = await boite(page, 'f1');
      expect(b.h).toBeGreaterThan(80);
    });
  });

  describe('sur un telephone de 390 px', () => {
    it('regles par le menu Plus, repetition par le menu de la selection ; le panneau tient dans l ecran', async () => {
      const page = await editeur(CARRE, { largeur: 390, hauteur: 844, tactile: true });
      await ouvrirMenu(page, 'Vue');
      await page.getByRole('menuitemcheckbox', { name: /Afficher les règles/ }).tap();
      await attend(() => page.locator('.regle-h').count()).toBe(1);
      expect((await page.locator('.regle-h').boundingBox())?.height).toBe(40);
      await page.keyboard.press('Control+a');
      await page.locator('.editeur-barre-selection').getByRole('button', { name: /Plus de gestes/ }).tap();
      await page.getByRole('menuitem', { name: 'Dupliquer en grille…' }).tap();
      await attend(() => panneau(page).count()).toBe(1);
      const b = await panneau(page).boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 390).toBe(true);
      const cibles = await panneau(page).locator('button, input, select').evaluateAll(l => l.map(e => Math.round(e.getBoundingClientRect().height)));
      expect(Math.min(...cibles)).toBeGreaterThanOrEqual(40);
      await attend(() => formesVisibles(page)).toBe(4);
    });
  });

  describe('accessibilite', () => {
    for (const schema of ['light', 'dark'] as const) {
      it('axe ne trouve ni violation ni doute : regles, reperes, panneau des reperes puis de la repetition (' + schema + ')', async () => {
        const page = await editeur(CARRE, { schema });
        await afficherRegles(page);
        await tirerHorizontal(page, 150);
        await attend(() => reperes(page, 'h').count()).toBe(1);
        await ouvrirMenu(page, 'Vue');
        await page.getByRole('menuitem', { name: 'Repères : valeurs exactes…' }).click();
        await attend(() => panneau(page).count()).toBe(1);
        await attendreAnimations(page);
        await page.addScriptTag({ content: AXE });
        // L'audit porte sur la toile, ou vivent les regles, les reperes et les panneaux ; l'editeur entier a le sien (accessibilite-axe).
        const auditer = () => page.evaluate(async () => (await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<ResultatAxe> } }).axe.run({ include: [['.editeur-toile']] }, { resultTypes: ['violations', 'incomplete'] })));
        const lire = (r: ResultatAxe) => [...r.violations, ...r.incomplete].map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)));
        expect(lire(await auditer())).toEqual([]);
        await page.keyboard.press('Escape');
        await page.locator('.editeur-svg-toile').focus();
        await page.keyboard.press('Control+a');
        await ouvrirMenu(page, 'Édition');
        await page.getByRole('menuitem', { name: 'Répétition radiale…' }).click();
        await attend(() => panneau(page).count()).toBe(1);
        await attendreAnimations(page);
        expect(lire(await auditer())).toEqual([]);
      });
    }
  });
});
