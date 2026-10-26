// Modifier une decoupe ou un masque sur place (ADR-0012, paquet 8-D), dans la page construite, en modele riche. Au clavier : entrer
// dans la decoupe d'un groupe par le menu Edition, deplacer sa forme aux fleches, annuler en une fois, sortir par Echap, enregistrer et
// retrouver le <clipPath> deplace ; de meme pour un masque (sa region lue reste) ; le fil d'Ariane qui ramene ; un contenu vide qui
// refuse la sortie ; le double-clic sur la pastille du calque. Et axe-core dans une decoupe et dans un masque, en clair, en sombre et
// au doigt.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, ouvrirCode, pilote, RACINE_DEPOT, terminer, URL_PAGE } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Un groupe « Cartes » decoupe par un carre, et une forme dehors. */
const DECOUPE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<defs><clipPath id="c"><rect x="40" y="20" width="80" height="80"/></clipPath></defs>'
  + '<g data-ed-nom="Cartes" clip-path="url(#c)"><rect x="20" y="20" width="80" height="60" fill="#c81e28"/>'
  + '<rect x="70" y="40" width="80" height="60" fill="#1f4e8c"/></g><circle cx="175" cy="30" r="15" fill="#f2b705"/></svg>';
/** Un groupe « Ciel » masque par un rond blanc, sa region choisie dans le fichier. */
const MASQUE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="120"><circle cx="80" cy="60" r="40" fill="#ffffff"/></mask></defs>'
  + '<g data-ed-nom="Ciel" mask="url(#m)"><rect x="10" y="10" width="180" height="100" fill="#1f4e8c"/></g></svg>';

describe('modifier une decoupe ou un masque sur place', () => {
  const navigateur = pilote();

  async function page(options: Parameters<typeof navigateur.ouvrir>[0] = {}): Promise<Page> {
    const s = await navigateur.ouvrir({ ...options, naviguer: false });
    await s.contexte.addInitScript(() => { try { localStorage.setItem('svg.modele', JSON.stringify({ modele: 'riche' })); } catch { /* sans stockage */ } });
    await s.page.goto(URL_PAGE);
    return s.page;
  }

  const toile = (p: Page) => p.locator('.editeur-svg-toile');
  const dit = (p: Page) => p.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const brouillon = (p: Page) => p.evaluate(() => (JSON.parse(localStorage.getItem('svg.brouillon') ?? '{}') as { svg?: string }).svg ?? '');
  const fil = (p: Page) => p.getByRole('navigation', { name: 'Contexte d’édition' });
  /** Le trace du <clipPath> (ou du contenu du <mask>) que la toile ecrit pour le groupe, tel qu'il s'enregistrera. */
  const defini = (p: Page, balise: 'clipPath' | 'mask') => toile(p).locator('.lentille-fond defs ' + balise + ' path').first().getAttribute('d');

  async function ouvrir(p: Page, svg: string, tactile = false): Promise<void> {
    await ouvrirCode(p, svg, tactile);
    await attend(() => aLeFocus(toile(p))).toBe(true);
  }

  /** Choisit un element du menu Edition au clavier, puis rend le focus a la toile. */
  async function commandeAuClavier(p: Page, nom: string): Promise<void> {
    const bouton = p.locator('.editeur-svg .menu-bouton', { hasText: 'Édition' });
    await bouton.focus();
    await p.keyboard.press('Enter');
    const element = p.getByRole('menuitem', { name: nom, exact: true });
    await element.waitFor();
    await element.focus();
    await p.keyboard.press('Enter');
    await attend(() => element.count()).toBe(0);
    await toile(p).focus();
  }

  async function auditAxe(p: Page): Promise<string[]> {
    await attendreAnimations(p);
    await p.addScriptTag({ content: AXE });
    return p.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Array<{ target: unknown[] }> }>; incomplete: Array<{ id: string; nodes: unknown[] }> }> } };
      const r = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
      return [
        ...r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target))),
        ...r.incomplete.map(v => 'à relire : ' + v.id + ' ×' + v.nodes.length)
      ];
    });
  }

  it('au clavier : entrer dans la decoupe, deplacer sa forme, annuler en une fois, sortir, retrouver le <clipPath> deplace', async () => {
    const p = await page();
    await ouvrir(p, DECOUPE);
    await p.keyboard.press('PageDown');
    await attend(() => dit(p)).toMatch(/^Groupe « Cartes » sélectionné/);
    await commandeAuClavier(p, 'Modifier la découpe');
    await attend(() => dit(p)).toMatch(/^Dans la découpe du groupe « Cartes », 1 forme, tracée en contour : seule la forme compte ; le reste est estompé\. Échap ou Maj\+Entrée en sort\. Forme \d+ sélectionnée/);
    await attend(() => fil(p).textContent()).toBe('Racine›Cartes›Découpe');
    expect(await fil(p).locator('[aria-current="location"]').textContent()).toBe('Découpe');
    // La toile : le reste estompe et inerte, la forme de la decoupe tracee en contour, seule a prendre le pointeur.
    expect(await toile(p).locator('.lentille-fond').getAttribute('class')).toContain('hors-contexte');
    expect(await toile(p).locator('.lentille-decoupe path.trace-contour').count()).toBe(1);
    const avant = await defini(p, 'clipPath');
    expect(avant).toBe('M40 20L120 20L120 100L40 100Z');
    // Le texte ne passe pas par la lentille : son outil est grise, sa touche le dit.
    expect(await p.getByRole('button', { name: /^Texte \(T\)/ }).isDisabled()).toBe(true);

    // Un deplacement aux fleches (Maj : dix milliemes du plan) : une entree d'historique, la decoupe ecrite suit.
    await p.keyboard.press('Shift+ArrowRight');
    await attend(() => defini(p, 'clipPath')).toBe('M42 20L122 20L122 100L42 100Z');
    await p.keyboard.press('Control+z');
    await attend(() => defini(p, 'clipPath')).toBe(avant);
    await attend(() => dit(p)).toBe('Annulé.');
    expect(await p.locator('.compte-modifications').textContent()).toBe('0 modification');
    await p.keyboard.press('Shift+ArrowRight');
    await p.keyboard.press('Shift+ArrowDown');
    await attend(() => defini(p, 'clipPath')).toBe('M42 22L122 22L122 102L42 102Z');

    // Echap : la selection, puis la decoupe, reposee, et l'on est dans le groupe.
    await p.keyboard.press('Escape');
    await p.keyboard.press('Escape');
    await attend(() => dit(p)).toBe('Découpe reposée. Dans le groupe « Cartes », 2 éléments.');
    await attend(() => fil(p).textContent()).toBe('Racine›Cartes');
    expect(await toile(p).locator('.lentille-decoupe').count()).toBe(0);
    await terminer(p);
    const svg = await brouillon(p);
    expect(svg).toMatch(/<clipPath id="ed-c-[0-9a-f]{14}"><path d="M42 22L122 22L122 102L42 102Z"\/><\/clipPath>/);
    expect(svg).toMatch(/<g clip-path="url\(#ed-c-[0-9a-f]{14}\)"/);
  });

  it('au clavier : entrer dans le masque, deplacer son contenu, sortir par Maj+Entree, le retrouver a l enregistrement', async () => {
    const p = await page();
    await ouvrir(p, MASQUE);
    await p.keyboard.press('PageDown');
    await attend(() => dit(p)).toMatch(/^Groupe « Ciel » sélectionné/);
    await commandeAuClavier(p, 'Modifier le masque');
    await attend(() => dit(p)).toMatch(/^Dans le masque du groupe « Ciel », 1 forme : le clair laisse voir, le sombre cache ; le reste est estompé\./);
    await attend(() => fil(p).textContent()).toBe('Racine›Ciel›Masque');
    // Le contenu se dessine tel quel, cerne de son jeton, et la region en tirets.
    expect(await toile(p).locator('.lentille-masque path[data-id]').getAttribute('fill')).toBe('#ffffff');
    expect(await toile(p).locator('.lentille-masque .contour-masque').count()).toBe(1);
    expect(await toile(p).locator('.lentille-masque .region-masque').getAttribute('width')).toBe('200');
    await p.keyboard.press('Shift+ArrowLeft');
    await p.keyboard.press('Shift+ArrowLeft');
    await attend(() => toile(p).locator('.lentille-masque path[data-id]').getAttribute('d')).toMatch(/^M36 60/);
    await p.keyboard.press('Shift+Enter');
    await attend(() => dit(p)).toBe('Masque reposé. Dans le groupe « Ciel », 1 élément.');
    await terminer(p);
    const svg = await brouillon(p);
    // La region est celle du fichier (elle ne suivait pas le contenu) ; le rond a recule de quatre.
    expect(svg).toMatch(/<mask id="ed-m-[0-9a-f]{14}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="120"><path d="M36 60[^"]*" fill="#ffffff"\/><\/mask>/);
  });

  it('un contenu vide refuse la sortie et dit quoi faire ; le fil d Ariane et le double-clic sur la pastille', async () => {
    const p = await page();
    await ouvrir(p, DECOUPE);
    // Le double-clic sur la pastille « découpe » de la ligne du groupe y fait entrer (le groupe choisi d'abord : la ligne ne bouge plus).
    await p.keyboard.press('PageDown');
    await attend(() => dit(p)).toMatch(/^Groupe « Cartes » sélectionné/);
    await p.locator('.calque-ligne [data-pastille="decoupe"]').first().dblclick();
    await attend(() => fil(p).textContent()).toBe('Racine›Cartes›Découpe');
    await toile(p).focus();
    await p.keyboard.press('Delete');
    await p.keyboard.press('Escape');
    await attend(() => dit(p)).toBe('La découpe est vide : elle cacherait tout le groupe. Dessinez la forme qui découpe, annulez (Ctrl+Z), ou choisissez « Libérer la découpe » (menu Édition).');
    expect(await fil(p).textContent()).toBe('Racine›Cartes›Découpe');
    // Annuler rend la forme ; le fil d'Ariane ramene alors a la racine, et rend le focus a la toile.
    await p.keyboard.press('Control+z');
    await fil(p).getByRole('button', { name: 'Racine' }).focus();
    await p.keyboard.press('Enter');
    await attend(() => dit(p)).toBe('Découpe reposée. Retour à la racine.');
    await attend(() => fil(p).count()).toBe(0);
    await attend(() => aLeFocus(toile(p))).toBe(true);
  });

  for (const [nom, options] of [['clair', { schema: 'light' }], ['sombre', { schema: 'dark' }], ['au doigt', { tactile: true, largeur: 1280, hauteur: 1000 }]] as const) {
    it('axe : dans une decoupe, puis dans un masque, le menu Edition ouvert, ' + nom, async () => {
      const p = await page(options);
      await ouvrir(p, DECOUPE, 'tactile' in options);
      await p.keyboard.press('PageDown');
      await commandeAuClavier(p, 'Modifier la découpe');
      await attend(() => fil(p).textContent()).toBe('Racine›Cartes›Découpe');
      expect(await auditAxe(p)).toEqual([]);
      const bouton = p.locator('.editeur-svg .menu-bouton', { hasText: 'Édition' });
      await bouton.focus();
      await p.keyboard.press('Enter');
      await p.getByRole('menuitem', { name: 'Modifier le masque' }).waitFor();
      expect(await p.getByRole('menuitem', { name: 'Modifier la découpe' }).isDisabled()).toBe(true);
      expect(await p.getByRole('menuitem', { name: 'Créer un masque' }).isDisabled()).toBe(true);
      expect(await auditAxe(p)).toEqual([]);
      await p.keyboard.press('Escape');

      const q = await page(options);
      await ouvrir(q, MASQUE, 'tactile' in options);
      await q.keyboard.press('PageDown');
      await commandeAuClavier(q, 'Modifier le masque');
      await attend(() => fil(q).textContent()).toBe('Racine›Ciel›Masque');
      expect(await auditAxe(q)).toEqual([]);
    });
  }
});
