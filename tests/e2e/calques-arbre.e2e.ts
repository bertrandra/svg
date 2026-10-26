// L'arbre des calques au clavier (ADR-0012, etape 2, paquet 2-B ; annexe 6 §1 et §9). Un dessin riche, et rien que le clavier une
// fois le focus pose dans la grille : deplier, replier, choisir, renommer (F2), deplacer un calque dans un groupe par « Déplacer
// vers… » (Maj+F10) puis par Ctrl+Maj+fleches, entrer dans un groupe (Entree), Tab qui sort de la grille ; chaque geste dit sa phrase
// dans la region vocale. Audit axe de l'arbre replie, deplie et en contexte, en clair, en sombre et au doigt. Un dessin plat garde
// sa liste (aucune grille).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, attendreAnimations, ouvrirCode, pilote, RACINE_DEPOT, terminer, URL_PAGE, type OptionsSession } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Un ciel (un nuage de deux formes et un soleil), une herbe de deux formes, une forme seule au premier plan (f6). */
const RICHE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<g data-ed-nom="Ciel"><g data-ed-nom="Nuage"><rect x="40" y="40" width="80" height="60" fill="#c81e28"/><rect x="160" y="40" width="80" height="60" fill="#1f4e8c"/></g>'
  + '<circle cx="300" cy="60" r="30" fill="#e0b84a"/></g>'
  + '<g data-ed-nom="Herbe"><rect x="0" y="250" width="400" height="10" fill="#2a7d4f"/><rect x="0" y="262" width="400" height="10" fill="#1d5c39"/></g>'
  + '<rect x="40" y="180" width="80" height="60" fill="#6b4fa0"/>'
  + '</svg>';

describe('l arbre des calques', () => {
  const navigateur = pilote();

  async function page(options: OptionsSession = {}, modele: 'plat' | 'riche' = 'riche'): Promise<Page> {
    const s = await navigateur.ouvrir({ ...options, naviguer: false });
    await s.contexte.addInitScript(m => { try { if (localStorage.getItem('svg.modele') === null) localStorage.setItem('svg.modele', JSON.stringify({ modele: m })); } catch { /* sans stockage */ } }, modele);
    await s.page.goto(URL_PAGE);
    return s.page;
  }

  const grille = (p: Page) => p.locator('.editeur-calques [role="treegrid"]');
  const ligne = (p: Page, nom: string | RegExp) => grille(p).getByRole('row', { name: nom });
  const annonce = (p: Page) => p.locator('.editeur-svg .annonces').textContent();
  const focusSur = (p: Page) => p.evaluate(() => { const a = document.activeElement; return a?.getAttribute('aria-label') ?? a?.tagName ?? ''; });
  /** Les lignes de la grille, du haut en bas : leur niveau et le debut de leur nom. */
  const lignes = (p: Page) => grille(p).locator('[role="row"]').evaluateAll(t => t.map(e => e.getAttribute('aria-level') + ' ' + (e.getAttribute('aria-label') ?? '').split(',')[0]));
  const touche = (p: Page, t: string) => p.keyboard.press(t);

  async function auditAxe(p: Page): Promise<string[]> {
    await attendreAnimations(p);
    await p.addScriptTag({ content: AXE });
    return p.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)));
    });
  }

  it('se pilote sans souris : deplier, choisir, renommer, deplacer, entrer, et Tab en sort', async () => {
    const p = await page();
    await ouvrirCode(p, RICHE);
    await grille(p).waitFor();
    expect(await lignes(p)).toEqual(['1 Rectangle 6', '1 Groupe « Herbe »', '1 Groupe « Ciel »']);
    // Un seul arret de tabulation : la premiere ligne ; le focus s'y pose comme Tab l'y amenerait.
    expect(await grille(p).locator('[tabindex="0"]').count()).toBe(1);
    await grille(p).locator('[tabindex="0"]').focus();

    // Bas, Droite deplie le groupe, Gauche le replie.
    await touche(p, 'ArrowDown');
    await attend(() => focusSur(p)).toMatch(/^Groupe « Herbe »/);
    await touche(p, 'ArrowRight');
    await attend(() => ligne(p, /^Groupe « Herbe »/).getAttribute('aria-expanded')).toBe('true');
    await attend(() => annonce(p)).toBe('Groupe « Herbe » déplié : 2 éléments.');
    expect(await auditAxe(p)).toEqual([]);
    await touche(p, 'ArrowLeft');
    await attend(() => ligne(p, /^Groupe « Herbe »/).getAttribute('aria-expanded')).toBe('false');
    await attend(() => annonce(p)).toBe('Groupe « Herbe » replié.');

    // Le ciel : Droite deplie, Droite descend au premier enfant (le soleil), Espace le choisit ; le contexte devient le ciel.
    await touche(p, 'ArrowDown');
    await touche(p, 'ArrowRight');
    await touche(p, 'ArrowRight');
    await attend(() => focusSur(p)).toMatch(/^Cercle 3/);
    await touche(p, ' ');
    await attend(() => ligne(p, /^Cercle 3/).getAttribute('aria-selected')).toBe('true');
    await attend(() => p.locator('.editeur-svg-toile .contour-groupe').count()).toBe(1);
    // Gauche remonte au parent ; F2 le renomme.
    await touche(p, 'ArrowLeft');
    await attend(() => focusSur(p)).toMatch(/^Groupe « Ciel »/);
    await touche(p, 'F2');
    const champ = grille(p).getByRole('textbox');
    await attend(() => champ.evaluate(e => e === document.activeElement)).toBe(true);
    await p.keyboard.type('Firmament');
    await touche(p, 'Enter');
    await attend(() => annonce(p)).toBe('Groupe renommé : « Firmament ».');
    await attend(() => focusSur(p)).toMatch(/^Groupe « Firmament », 2 éléments/);

    // « Déplacer vers… » : Origine, Entree choisit la forme seule, Maj+F10 ouvre la liste des groupes ; le premier permis est l'herbe.
    await touche(p, 'Home');
    await touche(p, 'Enter');
    await attend(() => ligne(p, /^Rectangle 6/).getAttribute('aria-selected')).toBe('true');
    await touche(p, 'Shift+F10');
    const menu = p.getByRole('menu', { name: /Déplacer vers/ });
    await menu.waitFor();
    expect(await menu.getByRole('menuitem').evaluateAll(t => t.map(e => (e.textContent ?? '') + ((e as HTMLButtonElement).disabled ? ' (inactif)' : ''))))
      .toEqual(['Racine (inactif)', 'Herbe', 'Firmament', 'Firmament › Nuage']);
    expect(await auditAxe(p)).toEqual([]);
    await touche(p, 'Enter');
    await attend(() => annonce(p)).toBe('Rectangle 6 passe dans le groupe « Herbe ».');
    await attend(() => lignes(p)).toEqual(['1 Groupe « Herbe »', '2 Rectangle 6', '2 Rectangle 5', '2 Rectangle 4', '1 Groupe « Firmament »', '2 Cercle 3', '2 Groupe « Nuage »']);
    await attend(() => focusSur(p)).toMatch(/^Rectangle 6/);

    // Ctrl+Maj+Gauche : il ressort, juste sous l'herbe ; Ctrl+Maj+Haut : il monte d'un rang ; Ctrl+Maj+Bas puis Droite : il rentre.
    await touche(p, 'Control+Shift+ArrowLeft');
    await attend(() => annonce(p)).toBe('Rectangle 6 sort du groupe « Herbe », à la racine.');
    await attend(() => lignes(p)).toEqual(['1 Groupe « Herbe »', '2 Rectangle 5', '2 Rectangle 4', '1 Rectangle 6', '1 Groupe « Firmament »', '2 Cercle 3', '2 Groupe « Nuage »']);
    await touche(p, 'Control+Shift+ArrowUp');
    await attend(() => annonce(p)).toBe('Rectangle 6 monte d’un rang.');
    await attend(() => lignes(p)).toEqual(['1 Rectangle 6', '1 Groupe « Herbe »', '2 Rectangle 5', '2 Rectangle 4', '1 Groupe « Firmament »', '2 Cercle 3', '2 Groupe « Nuage »']);
    await touche(p, 'Control+Shift+ArrowDown');
    await attend(() => annonce(p)).toBe('Rectangle 6 descend d’un rang.');
    await touche(p, 'Control+Shift+ArrowRight');
    await attend(() => annonce(p)).toBe('Rectangle 6 passe dans le groupe « Herbe ».');
    await attend(() => lignes(p)).toEqual(['1 Groupe « Herbe »', '2 Rectangle 5', '2 Rectangle 4', '2 Rectangle 6', '1 Groupe « Firmament »', '2 Cercle 3', '2 Groupe « Nuage »']);
    expect(await focusSur(p)).toMatch(/^Rectangle 6/);

    // Entree sur un groupe y entre : la toile estompe le reste, la region vocale le dit.
    await touche(p, 'Home');
    await touche(p, 'Enter');
    await attend(() => annonce(p)).toBe('Dans le groupe « Herbe », 3 éléments.');
    await attend(() => p.locator('.editeur-svg-toile .contour-groupe').count()).toBe(1);
    expect(await auditAxe(p)).toEqual([]);

    // Tab sort de la grille (jamais piege) ; Maj+Tab y revient, sur la ligne active.
    await touche(p, 'Tab');
    expect(await p.evaluate(() => !!document.activeElement?.closest('[role="treegrid"]'))).toBe(false);
    await touche(p, 'Shift+Tab');
    await attend(() => focusSur(p)).toMatch(/^Groupe « Herbe »/);

    // « Terminer » : le groupe renomme et la forme deplacee sont dans le SVG rendu.
    await terminer(p);
    const svg = await p.evaluate(() => (JSON.parse(localStorage.getItem('svg.brouillon') ?? '{}') as { svg?: string }).svg ?? '');
    expect(svg).toContain('data-ed-nom="Firmament"');
    expect(svg).toMatch(/<g data-ed-nom="Herbe">(<path [^>]*\/>){3}<\/g>/);
  });

  it('les boutons d une ligne : Droite y mene, Haut et Bas gardent la colonne, et ils masquent un groupe', async () => {
    const p = await page();
    await ouvrirCode(p, RICHE);
    await grille(p).locator('[tabindex="0"]').focus();
    await touche(p, 'ArrowRight');
    await attend(() => focusSur(p)).toMatch(/^Masquer la forme 6/);
    await touche(p, 'ArrowDown');
    await attend(() => focusSur(p)).toBe('Masquer le groupe « Herbe »');
    await touche(p, 'Enter');
    await attend(() => ligne(p, /^Groupe « Herbe »/).getAttribute('aria-label')).toMatch(/masqué$/);
    await attend(() => p.locator('.editeur-svg-toile g[data-groupe][data-ed-nom="Herbe"]').count()).toBe(0);
    await touche(p, 'ArrowRight');
    await attend(() => focusSur(p)).toBe('Verrouiller le groupe « Herbe »');
    await touche(p, 'ArrowLeft');
    await touche(p, 'ArrowLeft');
    await attend(() => focusSur(p)).toMatch(/^Groupe « Herbe »/);
  });

  for (const [nom, options] of [['sombre', { schema: 'dark' }], ['au doigt', { tactile: true }]] as const) {
    it(`axe : arbre replie, deplie et en contexte, ${nom}`, async () => {
      const p = await page(options);
      await ouvrirCode(p, RICHE, 'tactile' in options);
      await grille(p).waitFor();
      expect(await auditAxe(p)).toEqual([]);
      await grille(p).locator('[tabindex="0"]').focus();
      await touche(p, 'ArrowDown');
      await touche(p, '*');
      await attend(() => annonce(p)).toBe('2 groupes dépliés.');
      await attend(() => lignes(p)).toEqual(['1 Rectangle 6', '1 Groupe « Herbe »', '2 Rectangle 5', '2 Rectangle 4', '1 Groupe « Ciel »', '2 Cercle 3', '2 Groupe « Nuage »']);
      expect(await auditAxe(p)).toEqual([]);
      await touche(p, 'Enter');
      await attend(() => p.locator('.editeur-svg-toile .contour-groupe').count()).toBe(1);
      expect(await auditAxe(p)).toEqual([]);
      if ('tactile' in options) {
        // Au doigt, chaque ligne et chaque bouton de l'arbre font 40 px au moins.
        const petites = await grille(p).locator('[role="row"], [role="row"] button').evaluateAll(t => t.filter(e => e.getBoundingClientRect().height < 39.5).length);
        expect(petites).toBe(0);
      }
    });
  }

  it('un double-clic sur une ligne de groupe non choisie y entre, meme si la rangee de la selection decale la liste entre les deux clics', async () => {
    const p = await page();
    await ouvrirCode(p, RICHE);
    await grille(p).waitFor();
    // Rien n'est choisi : le premier clic fait apparaitre la rangee de la selection, au-dessus des panneaux, et la liste descend.
    expect(await p.locator('.editeur-barre-selection').count()).toBe(0);
    await ligne(p, /^Groupe « Herbe »/).dblclick();
    await attend(() => annonce(p)).toBe('Dans le groupe « Herbe », 2 éléments.');
    expect(await ligne(p, /^Groupe « Herbe »/).getAttribute('aria-current')).toBe('true');
  });

  it('glisser une ligne sur un groupe l y fait entrer', async () => {
    const p = await page();
    await ouvrirCode(p, RICHE);
    await grille(p).waitFor();
    await ligne(p, /^Rectangle 6/).dragTo(ligne(p, /^Groupe « Herbe »/));
    await attend(() => annonce(p)).toBe('Rectangle 6 passe dans le groupe « Herbe ».');
    await attend(() => lignes(p)).toEqual(['1 Groupe « Herbe »', '2 Rectangle 6', '2 Rectangle 5', '2 Rectangle 4', '1 Groupe « Ciel »']);
  });

  it('un dessin plat garde sa liste : aucune grille', async () => {
    const p = await page({}, 'plat');
    await ouvrirCode(p, RICHE);
    await p.locator('.editeur-calques ol > li').first().waitFor();
    expect(await p.locator('.editeur-calques [role="treegrid"]').count()).toBe(0);
    expect(await p.locator('.editeur-calques ol > li').count()).toBe(6);
  });
});
