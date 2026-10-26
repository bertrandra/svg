// La passe de qualite de l'interface riche (ADR-0012, etape 2, paquet 2-D ; annexe 6 §9). Les parcours au clavier que les fichiers de
// chaque etape ne jouaient pas encore, sans souris, chaque geste dit dans la region vocale : creer un groupe, y entrer, y DESSINER (la
// forme posee au reticule entre dans le groupe), en sortir ; creer puis liberer un masque ; creer un motif ; inserer une image, la
// deplacer, la redimensionner, ses points refuses ; saisir un texte et le vectoriser en lettres separees (un groupe « Texte « … » »).
// Puis le budget du DOM de l'arbre des calques (annexe 7 §4 : 400 elements pour 200 groupes replies, a la souris) et ce que le survol
// montre ; axe-core sur les ecrans nouveaux (image, motif, texte en groupe) en clair, en sombre, au doigt et en contraste force, et sur
// les ecrans des etapes 2 a 8 en contraste force (les autres modes sont dans leurs fichiers).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, boutonFichier, encoderPng, ouvrirCode, pilote, RACINE_DEPOT, terminer, URL_PAGE, type OptionsSession } from './aide.js';
import { champPolice } from './polices.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Trois rectangles a plat : en riche, ils se groupent, se masquent, font un motif. */
const TROIS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<rect x="40" y="40" width="80" height="60" fill="#c81e28"/><rect x="160" y="40" width="80" height="60" fill="#1f4e8c"/>'
  + '<rect x="40" y="180" width="80" height="60" fill="#ffffff"/></svg>';
const UN_RECTANGLE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200"><rect x="20" y="20" width="60" height="40" fill="#1f4e8c"/></svg>';
/** Un ciel (un nuage de deux formes et un soleil), une herbe, une forme seule (calques-arbre.e2e.ts). */
const ARBRE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">'
  + '<g data-ed-nom="Ciel"><g data-ed-nom="Nuage"><rect x="40" y="40" width="80" height="60" fill="#c81e28"/><rect x="160" y="40" width="80" height="60" fill="#1f4e8c"/></g>'
  + '<circle cx="300" cy="60" r="30" fill="#e0b84a"/></g>'
  + '<g data-ed-nom="Herbe"><rect x="0" y="250" width="400" height="10" fill="#2a7d4f"/><rect x="0" y="262" width="400" height="10" fill="#1d5c39"/></g>'
  + '<rect x="40" y="180" width="80" height="60" fill="#6b4fa0"/></svg>';
/** Un groupe decoupe, floute, a demi transparent (decoupes-masques-effets.e2e.ts). */
const DECOUPE_EFFETS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<defs><clipPath id="c"><circle cx="100" cy="60" r="50"/></clipPath>'
  + '<filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="120"><feGaussianBlur stdDeviation="2"/></filter></defs>'
  + '<g data-ed-nom="Cartes" clip-path="url(#c)" filter="url(#f)" opacity="0.5"><rect x="20" y="20" width="80" height="60" fill="#c81e28"/>'
  + '<rect x="90" y="40" width="80" height="60" fill="#1f4e8c"/></g></svg>';
const UN_RADIAL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><radialGradient id="s" gradientUnits="userSpaceOnUse" cx="60" cy="60" r="50">'
  + '<stop offset="0" stop-color="#fff1a8"/><stop offset="1" stop-color="#6a2c91"/></radialGradient><circle cx="60" cy="60" r="50" fill="url(#s)"/></svg>';
/** 2 000 feuilles dans 200 groupes de 10, a la racine : le temoin du DOM de la grille (paquet 2-B). */
const DEUX_CENTS_GROUPES = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 200">' + Array.from({ length: 200 }, (_, g) => '<g data-ed-nom="G' + g + '">'
  + Array.from({ length: 10 }, (_, k) => '<rect x="' + ((g * 10 + k) % 100) * 10 + '" y="' + Math.floor((g * 10 + k) / 100) * 10 + '" width="8" height="8" fill="#1f4e8c"/>').join('') + '</g>').join('') + '</svg>';

type Mode = { nom: string; options: OptionsSession; force?: boolean };
const MODES: readonly Mode[] = [
  { nom: 'clair', options: { schema: 'light' } },
  { nom: 'sombre', options: { schema: 'dark' } },
  { nom: 'au doigt', options: { tactile: true, largeur: 1280, hauteur: 1000 } },
  { nom: 'contraste force', options: {}, force: true }
];

describe('l interface riche, parcours et ecrans (paquet 2-D)', () => {
  const navigateur = pilote();

  /** Une page en modele riche (pose par la page, lu a l'ouverture d'un dessin : voir modele-riche.e2e.ts), en contraste force si demande. */
  async function page(options: OptionsSession = {}, force = false): Promise<Page> {
    const s = await navigateur.ouvrir({ ...options, naviguer: false });
    if (force) await s.page.emulateMedia({ forcedColors: 'active' });
    await s.page.goto(URL_PAGE);
    await s.page.evaluate(() => { localStorage.setItem('svg.modele', JSON.stringify({ modele: 'riche' })); });
    return s.page;
  }

  const toile = (p: Page) => p.locator('.editeur-svg-toile');
  const dit = (p: Page) => p.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const traces = (p: Page) => toile(p).locator('.trace-choisi').count();
  const brouillon = (p: Page) => p.evaluate(() => (JSON.parse(localStorage.getItem('svg.brouillon') ?? '{}') as { svg?: string }).svg ?? '');
  const grille = (p: Page) => p.locator('.editeur-calques [role="treegrid"]');

  /** Ouvre un SVG ; la toile a le focus. */
  async function ouvrir(p: Page, svg: string, tactile = false): Promise<void> {
    await ouvrirCode(p, svg, tactile);
    await attend(() => aLeFocus(toile(p))).toBe(true);
  }

  /**
   * Ouvre un menu de la barre au clavier (le bouton, Entree) et attend que le focus soit dans le menu, sur son premier element : le
   * menu l'y pose apres le rendu, et un focus donne avant serait repris par lui (Entree partirait alors sur le premier element).
   */
  async function ouvrirMenuAuClavier(p: Page, menu: string): Promise<void> {
    // Fichier n'est qu'une icone, nommee par aria-label ; les autres menus ont leur nom en texte.
    await (menu === 'Fichier' ? boutonFichier(p) : p.locator('.editeur-svg .menu-bouton', { hasText: menu })).focus();
    await p.keyboard.press('Enter');
    await attend(() => p.evaluate(() => !!document.activeElement?.closest('[role="menu"]'))).toBe(true);
  }

  /** Un element d'un menu de la barre, au clavier : le bouton du menu, Entree, puis l'element, Entree. */
  async function commandeAuClavier(p: Page, menu: string, nom: string): Promise<void> {
    await ouvrirMenuAuClavier(p, menu);
    const element = p.getByRole('menuitem', { name: nom, exact: true });
    await element.focus();
    await p.keyboard.press('Enter');
    await attend(() => element.count()).toBe(0);
  }

  /**
   * axe-core, violations graves et « à relire ». En contraste force, un contraste entre deux couleurs du systeme (HighlightText sur
   * Highlight…) n'est pas le notre : c'est la palette que la personne a choisie, et celle que Firefox et WebKit emulent sans ecran (un
   * Highlight a 2,9:1 et 4:1 sous son texte) ne dit rien de la page. Ces noeuds-la seuls sont laisses ; tout autre contraste compte.
   */
  async function auditAxe(p: Page): Promise<string[]> {
    await attendreAnimations(p);
    await p.addScriptTag({ content: AXE });
    return p.evaluate(async () => {
      type Noeud = { target: unknown[]; any: Array<{ data?: { fgColor?: string; bgColor?: string } | null }> };
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; nodes: Noeud[] }>; incomplete: Array<{ id: string; nodes: Noeud[] }> }> } };
      const force = matchMedia('(forced-colors: active)').matches;
      const hex = (mot: string): string => {
        const x = document.createElement('span'); x.style.color = mot; document.body.appendChild(x);
        const [r = 0, v = 0, b = 0] = (getComputedStyle(x).color.match(/\d+(\.\d+)?/g) ?? []).map(Number); x.remove();
        return '#' + [r, v, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
      };
      const systeme = new Set(force ? ['Highlight', 'HighlightText', 'Canvas', 'CanvasText', 'ButtonText', 'ButtonFace', 'GrayText', 'LinkText'].map(hex) : []);
      const choisi = (n: Noeud) => { const d = n.any[0]?.data; return !(d?.fgColor && d.bgColor && systeme.has(d.fgColor) && systeme.has(d.bgColor)); };
      const r = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
      return [
        ...r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => ({ ...v, nodes: v.id === 'color-contrast' ? v.nodes.filter(choisi) : v.nodes }))
          .filter(v => v.nodes.length).map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target))),
        ...r.incomplete.map(v => ({ ...v, nodes: v.id === 'color-contrast' ? v.nodes.filter(choisi) : v.nodes })).filter(v => v.nodes.length)
          .map(v => 'à relire : ' + v.id + ' ×' + v.nodes.length + ' ' + JSON.stringify(v.nodes.map(n => n.target)))
      ];
    });
  }

  /** Choisit les deux premieres formes au clavier et les groupe : le groupe est choisi. */
  async function grouperAuClavier(p: Page): Promise<void> {
    await p.keyboard.press('PageDown');
    await attend(() => dit(p)).toMatch(/^Forme 1 sélectionnée : /);
    await p.keyboard.press('Shift+PageDown');
    await attend(() => dit(p)).toBe('Forme 2 ajoutée : 2 formes sélectionnées.');
    await p.keyboard.press('Control+g');
    await attend(() => dit(p)).toBe('Groupe créé : 2 formes.');
  }

  /** Un PNG de 40 x 30 pixels, un rond rouge sur blanc. */
  const png = () => encoderPng(40, 30, (x, y) => ((x - 20) ** 2 + (y - 15) ** 2 < 100 ? [0xc8, 0x1e, 0x28] : null));

  /** « Insérer une image… » au clavier (menu Fichier), le fichier donne au selecteur ; l'image est inseree et choisie. */
  async function insererImage(p: Page): Promise<void> {
    // L'attente du choix de fichier se pose avant d'ouvrir le menu : Playwright n'intercepte le dialogue qu'une fois sa demande faite au
    // navigateur, et une touche part plus vite qu'un clic (sans cette avance, le dialogue s'ouvrait parfois avant l'interception).
    const attenteChoix = p.waitForEvent('filechooser');
    await ouvrirMenuAuClavier(p, 'Fichier');
    const element = p.getByRole('menuitem', { name: 'Insérer une image…' });
    await element.focus();
    await p.keyboard.press('Enter');
    const choix = await attenteChoix;
    await choix.setFiles({ name: 'rond.png', mimeType: 'image/png', buffer: png() });
    await attend(() => dit(p)).toMatch(/^Image insérée : 40 × 30 pixels/);
  }

  it('au clavier : creer un groupe, y entrer, y dessiner au reticule (la forme entre dans le groupe), en sortir', async () => {
    const p = await page();
    await ouvrir(p, TROIS);
    await grouperAuClavier(p);
    await p.keyboard.press('Enter');
    await attend(() => dit(p)).toMatch(/^Dans le groupe 1, 2 éléments\. Forme 1 sélectionnée : /);
    // Dessiner dans le groupe : R, une fleche pose le reticule, Entree pose le carre ; il entre au premier plan du groupe, choisi,
    // prenable (la seule forme estompee reste celle d'avant, hors du groupe).
    await p.keyboard.press('r');
    await attend(() => dit(p)).toMatch(/^Outil rectangle : flèches déplacent le réticule/);
    await p.keyboard.press('ArrowRight');
    await attend(() => dit(p)).toMatch(/^Réticule à /);
    await p.keyboard.press('Enter');
    await attend(() => dit(p)).toMatch(/^Forme 4 ajoutée et sélectionnée : carré/);
    await attend(() => toile(p).locator('g[data-groupe] path[data-id]').count()).toBe(3);
    expect(await toile(p).locator('g[data-groupe] path[data-id]').evaluateAll(l => l.map(e => e.getAttribute('data-id')))).toEqual(['f1', 'f2', 'f4']);
    expect(await toile(p).locator('.hors-contexte path[data-id]').evaluateAll(l => l.map(e => e.getAttribute('data-id')))).toEqual(['f3']);
    expect(await traces(p)).toBe(1);
    // Tab parcourt les trois enfants ; Ctrl+A les prend tous les trois.
    await p.keyboard.press('Shift+Tab');
    await attend(() => dit(p)).toMatch(/^Forme 2 sélectionnée : /);
    await p.keyboard.press('Control+a');
    await attend(() => dit(p)).toBe('3 formes sélectionnées.');
    // Maj+Entree sort : le groupe, choisi, porte ses trois formes.
    await p.keyboard.press('Shift+Enter');
    await attend(() => dit(p)).toBe('Retour à la racine.');
    await attend(() => traces(p)).toBe(3);
    await terminer(p);
    expect(await brouillon(p)).toMatch(/<g>(<path [^>]*\/>){3}<\/g>/);
  });

  it('au clavier : creer un masque puis le liberer, le contenu revient choisi dans le groupe devenu le contexte', async () => {
    const p = await page();
    await ouvrir(p, TROIS);
    await p.keyboard.press('Control+a');
    await attend(() => dit(p)).toBe('3 formes sélectionnées.');
    await commandeAuClavier(p, 'Édition', 'Créer un masque');
    await attend(() => dit(p)).toBe('Masque créé : l’élément du dessus masque 2 formes ; le clair laisse voir, le sombre cache.');
    await attend(() => toile(p).locator('defs mask').count()).toBe(1);
    await commandeAuClavier(p, 'Édition', 'Libérer le masque');
    await attend(() => dit(p)).toBe('Masque libéré : son élément revient au premier plan du groupe.');
    await attend(() => toile(p).locator('defs mask').count()).toBe(0);
    await attend(() => p.getByRole('navigation', { name: 'Contexte d’édition' }).textContent()).toBe('Racine›Groupe 1');
    expect(await traces(p)).toBe(1);
    expect(await toile(p).locator('g[data-groupe] path[data-id]').count()).toBe(3);
    expect(await auditAxe(p)).toEqual([]);
  });

  it('au clavier : creer un motif depuis la selection, le retrouver a l enregistrement', async () => {
    const p = await page();
    await ouvrir(p, TROIS);
    await p.keyboard.press('PageDown');
    await p.keyboard.press('Shift+PageDown');
    await attend(() => dit(p)).toBe('Forme 2 ajoutée : 2 formes sélectionnées.');
    await commandeAuClavier(p, 'Édition', 'Créer un motif depuis la sélection');
    await attend(() => dit(p)).toBe('Motif créé : la sélection se répète dans un rectangle, à sa place. Ctrl+Z la rend.');
    await attend(() => toile(p).locator('defs pattern[id^="ed-p-"]').count()).toBe(1);
    expect(await traces(p)).toBe(1);
    // Ctrl+Z rend les deux formes, Ctrl+Maj+Z refait le motif.
    await toile(p).focus();
    await p.keyboard.press('Control+z');
    await attend(() => toile(p).locator('defs pattern[id^="ed-p-"]').count()).toBe(0);
    await p.keyboard.press('Control+Shift+Z');
    await attend(() => toile(p).locator('defs pattern[id^="ed-p-"]').count()).toBe(1);
    await terminer(p);
    expect(await brouillon(p)).toMatch(/<pattern id="ed-p-[0-9a-f]{14}" patternUnits="userSpaceOnUse"/);
  });

  it('au clavier : inserer une image, la deplacer et la redimensionner aux fleches ; ses points sont refuses', async () => {
    const p = await page();
    await ouvrir(p, UN_RECTANGLE);
    await insererImage(p);
    await attend(() => toile(p).locator('image').count()).toBe(1);
    await toile(p).focus();
    const x = () => toile(p).locator('image').evaluate(e => e.getBoundingClientRect().x);
    const avant = await x();
    await p.keyboard.press('ArrowRight');
    await attend(() => dit(p)).toMatch(/^À [\d,]+, [\d,]+\.$/);
    await attend(() => x()).toBeGreaterThan(avant);
    await p.keyboard.press('Alt+ArrowRight');
    await attend(() => dit(p)).toMatch(/^[\d,]+ × [\d,]+\.$/);
    // Entree (les points d'une forme) est refusee sur une image, et dit quoi faire ; l'image reste choisie.
    await p.keyboard.press('Enter');
    await attend(() => dit(p)).toMatch(/^Les points d’une image ne se modifient pas/);
    expect(await toile(p).locator('[data-ancre]').count()).toBe(0);
    expect(await traces(p)).toBe(1);
  });

  it('au clavier : saisir un texte et le vectoriser en lettres separees donne un groupe « Texte « … » », choisi', async () => {
    const p = await page();
    await ouvrir(p, UN_RECTANGLE);
    await p.keyboard.press('t');
    await p.keyboard.press('Enter');
    const saisie = p.locator('textarea.saisie-champ');
    await attend(() => aLeFocus(saisie)).toBe(true);
    await champPolice(p.locator('.editeur-inspecteur')).waitFor({ timeout: 30_000 });
    await p.keyboard.type('Ciel');
    await p.keyboard.press('Escape');
    await attend(() => aLeFocus(toile(p))).toBe(true);
    await p.keyboard.press('Control+Shift+O');
    await attend(() => dit(p)).toMatch(/^1 texte vectorisé \(lettres séparées\) : 4 formes ordinaires, en un groupe\. Ctrl\+Z rend le texte modifiable\.$/);
    await attend(() => grille(p).getByRole('row', { name: /^Groupe « Texte « Ciel » », 4 éléments/ }).count()).toBe(1);
    expect(await grille(p).getByRole('row', { name: /^Groupe « Texte « Ciel » »/ }).getAttribute('aria-selected')).toBe('true');
    await attend(() => traces(p)).toBe(4);
    // Entree y entre : la premiere lettre est choisie.
    await p.keyboard.press('Enter');
    await attend(() => dit(p)).toMatch(/^Dans le groupe « Texte « Ciel » », 4 éléments\./);
  });

  it('l arbre de 200 groupes replies tient le budget du DOM a la souris ; le survol et une ligne masquee montrent leurs boutons', async () => {
    const p = await page();
    await ouvrir(p, DEUX_CENTS_GROUPES);
    await grille(p).locator('[role="row"]').first().waitFor();
    // Annexe 7 §4 : 400 elements pour la grille repliee (avant le paquet 2-D : 698, trois boutons a icone par ligne).
    const elements = () => grille(p).evaluate(g => g.querySelectorAll('*').length + 1);
    expect(await elements()).toBeLessThanOrEqual(400);
    const boutons = (nom: RegExp) => grille(p).getByRole('row', { name: nom }).locator('[data-action="visible"]').count();
    // La ligne active (la premiere : l'arret de tabulation) a ses boutons ; les autres, non, tant qu'on ne les survole pas.
    expect(await boutons(/^Groupe « G199 »/)).toBe(1);
    expect(await boutons(/^Groupe « G198 »/)).toBe(0);
    await grille(p).getByRole('row', { name: /^Groupe « G198 »/ }).hover();
    await attend(() => boutons(/^Groupe « G198 »/)).toBe(1);
    // La ligne active les garde, survolee ou non : le clavier les atteint toujours.
    await grille(p).locator('[tabindex="0"]').focus();
    await p.keyboard.press('ArrowDown');
    await attend(() => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toMatch(/^Groupe « G198 »/);
    await p.mouse.move(5, 5);
    await attend(() => boutons(/^Groupe « G198 »/)).toBe(1);
    // Masquer la ligne active depuis son bouton : la ligne garde son bouton « Afficher » quand le focus la quitte (Bas garde la colonne).
    const masquer = grille(p).getByRole('row', { name: /^Groupe « G198 »/ }).getByRole('button', { name: 'Masquer le groupe « G198 »' });
    await masquer.focus();
    await p.keyboard.press('Enter');
    await attend(() => grille(p).getByRole('row', { name: /^Groupe « G198 »/ }).getAttribute('aria-label')).toMatch(/masqué$/);
    await p.keyboard.press('ArrowDown');
    await attend(() => p.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')).toBe('Masquer le groupe « G197 »');
    expect(await grille(p).getByRole('row', { name: /^Groupe « G198 »/ }).getByRole('button', { name: 'Afficher le groupe « G198 »' }).count()).toBe(1);
    expect(await elements()).toBeLessThanOrEqual(400);
  });

  for (const mode of MODES) {
    it('axe : une image choisie, un motif choisi, un texte vectorise en groupe, ' + mode.nom, async () => {
      const tactile = !!mode.options.tactile;
      const p = await page(mode.options, mode.force);
      await ouvrir(p, UN_RECTANGLE, tactile);
      await insererImage(p);
      await attend(() => traces(p)).toBe(1);
      expect(await auditAxe(p)).toEqual([]);
      // Le motif : le rectangle seul, choisi au clavier.
      await toile(p).focus();
      await p.keyboard.press('Escape');
      await p.keyboard.press('PageDown');
      await attend(() => dit(p)).toMatch(/^Forme 1 sélectionnée/);
      await commandeAuClavier(p, 'Édition', 'Créer un motif depuis la sélection');
      await attend(() => toile(p).locator('defs pattern[id^="ed-p-"]').count()).toBe(1);
      expect(await auditAxe(p)).toEqual([]);
    });
  }

  it('axe en contraste force : contexte de groupe et fil d Ariane, arbre deplie et « Déplacer vers… », degrade lineaire et radial, Effets et pastilles, dans une decoupe', async () => {
    const p = await page({}, true);
    expect(await p.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    await ouvrir(p, ARBRE);
    await grille(p).locator('[tabindex="0"]').focus();
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('*');
    await attend(() => dit(p)).toBe('2 groupes dépliés.');
    await p.keyboard.press('Enter');
    await attend(() => p.getByRole('navigation', { name: 'Contexte d’édition' }).count()).toBe(1);
    expect(await auditAxe(p)).toEqual([]);
    await p.keyboard.press('Shift+F10');
    await p.getByRole('menu', { name: /Déplacer vers/ }).waitFor();
    expect(await auditAxe(p)).toEqual([]);

    const d = await page({}, true);
    await ouvrir(d, UN_RADIAL);
    await d.keyboard.press('PageDown');
    await d.getByRole('listbox', { name: 'Arrêts du remplissage' }).waitFor();
    expect(await auditAxe(d)).toEqual([]);
    await d.locator('fieldset.choix-genre-peinture').filter({ hasText: 'Remplissage' }).getByRole('radio', { name: 'Dégradé linéaire' }).check();
    await attend(() => d.getByRole('slider', { name: /^Angle/ }).count()).toBe(1);
    expect(await auditAxe(d)).toEqual([]);

    const e = await page({}, true);
    await ouvrir(e, DECOUPE_EFFETS);
    await e.keyboard.press('PageDown');
    await attend(() => dit(e)).toMatch(/^Groupe « Cartes » sélectionné/);
    await attend(() => e.getByRole('checkbox', { name: 'Flou' }).isChecked()).toBe(true);
    expect(await auditAxe(e)).toEqual([]);
    // Dans la decoupe (paquet 8-D) : le contenu seul, le reste estompe, le fil d'Ariane jusqu'a « Découpe ».
    await commandeAuClavier(e, 'Édition', 'Modifier la découpe');
    await attend(() => e.getByRole('navigation', { name: 'Contexte d’édition' }).textContent()).toBe('Racine›Cartes›Découpe');
    expect(await auditAxe(e)).toEqual([]);
  });
});
