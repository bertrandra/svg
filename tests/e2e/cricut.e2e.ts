// Le contexte de production Cricut dans le navigateur (ADR-0013) : le choisir dans la barre (souris et clavier), le
// voir juger un dessin (trait, deux nuances proches, trace ouvert, partie trop fine, piece plus grande que le tapis),
// corriger chaque constat par son bouton et l'annuler, exporter et relire le fichier, Print Then Cut, retrouver le
// contexte a la reouverture, le tout au doigt sur 390 px, sous axe-core, et dit dans la region vocale.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { aLeFocus, attend, attendreAnimations, boutonTelecharger, modifications, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT, texteDe, textesDe } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
interface ResultatAxe { violations: { id: string; nodes: { target: unknown[] }[] }[]; incomplete: { id: string; nodes: { target: unknown[] }[] }[] }

/** Un dessin a 96 unites par pouce : un carre a trait epais, sa nuance voisine, un trace ouvert, une bande de 3/96 po, une barre de 12 po. */
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 700">'
  + '<path d="M96 96H288V288H96Z" fill="#c81e28" stroke="#15181d" stroke-width="8"/>'
  + '<path d="M384 96H576V288H384Z" fill="#c91f27"/>'
  + '<path d="M672 96L864 96L768 288" fill="#1428a0"/>'
  + '<path d="M960 96H963V288H960Z" fill="#1428a0"/>'
  + '<path d="M96 480H1250V560H96Z" fill="#2a9d8f"/></svg>';
const PROPRE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288"><path d="M48 48H240V240H48Z" fill="#c81e28"/><path d="M288 48H432V240H288Z" fill="#1428a0"/></svg>';

describe('le contexte Cricut', () => {
  const navigateur = pilote();

  async function editeur(svg = DESSIN, options: Parameters<typeof navigateur.ouvrir>[0] = {}): Promise<Page> {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, ...options });
    await ouvrirCode(page, svg, options.tactile);
    return page;
  }
  const dit = (page: Page) => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim());
  const selecteur = (page: Page) => page.locator('.selecteur-contexte .menu-bouton');
  const panneau = (page: Page) => page.locator('.panneau-cricut');
  const constats = (page: Page) => panneau(page).locator('.constat').evaluateAll(l => l.map(e => e.className.replace('constat constat-', '')));
  const nombreDeConstats = async (page: Page) => panneau(page).locator('.constat').count();
  const corriger = (page: Page, nom: string) => panneau(page).getByRole('button', { name: nom, exact: true }).click();

  async function choisirCricut(page: Page) {
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await panneau(page).locator('.constat, .pret').first().waitFor();
  }
  async function telecharger(page: Page, action: () => Promise<void>): Promise<{ nom: string; octets: Buffer }> {
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
    return { nom: t.suggestedFilename(), octets: readFileSync(await t.path()) };
  }

  it('se choisit dans la barre a la souris : Generique par defaut, puis Cricut Maker, tapis 12 x 12, papier cartonne, en millimetres', async () => {
    const page = await editeur();
    // Le bouton dit ce qu'il choisit : une machine.
    await expect(selecteur(page).textContent()).resolves.toBe('Machine : Générique');
    expect(await panneau(page).count()).toBe(0);
    // Le menu met la machine en tete : Generique et les trois Cricut, rien d'autre tant qu'aucune n'est choisie.
    await selecteur(page).click();
    expect(await textesDe(page.getByRole('menu', { name: 'Machine' }).getByRole('menuitemradio'))).toEqual(['Générique (aucune machine)', 'Cricut Joy', 'Cricut Explore (Air 2 / 3)', 'Cricut Maker (Maker / Maker 3)']);
    expect(await page.locator('.menu-panneau .menu-rubrique').count()).toBe(1);
    await page.keyboard.press('Escape');
    await choisirCricut(page);
    await expect(selecteur(page).textContent()).resolves.toBe('Cricut Maker · 12 × 12');
    await attend(() => dit(page)).toBe('Contexte Cricut : Maker (Maker / Maker 3), tapis 12 × 12 po, papier cartonné, en millimètres.');
    await selecteur(page).click();
    for (const nom of ['Cricut Maker (Maker / Maker 3)', 'Tapis 12 × 12 po', 'Papier cartonné', 'Découpe', 'Millimètres']) {
      expect(await page.getByRole('menuitemradio', { name: nom, exact: true }).getAttribute('aria-checked'), nom).toBe('true');
    }
    expect(await page.getByRole('menuitemradio', { name: 'Pouces', exact: true }).getAttribute('aria-checked')).toBe('false');
    // Le vinyle, le thermocollant et le feutre sont annonces, pas encore decrits : une seule ligne, inactive, au lieu de trois choix grises.
    const bientot = page.getByRole('menuitem', { name: 'Bientôt : vinyle, thermocollant, feutre' });
    expect(await bientot.isDisabled()).toBe(true);
    expect(await page.getByRole('menuitemradio', { name: /Vinyle|Feutre|Thermocollant/ }).count()).toBe(0);
    await page.getByRole('menuitemradio', { name: 'Tapis 12 × 24 po' }).click();
    await attend(() => dit(page)).toContain('tapis 12 × 24 po');
  });

  it('se choisit au clavier : fleches dans le menu, Entree', async () => {
    const page = await editeur();
    await selecteur(page).focus();
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(page.getByRole('menuitemradio', { name: 'Générique' }))).toBe(true);
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(page.getByRole('menuitemradio', { name: 'Cricut Joy' }))).toBe(true);
    await page.keyboard.press('End');
    await attend(() => aLeFocus(page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }))).toBe(true);
    await page.keyboard.press('Enter');
    await attend(() => selecteur(page).textContent()).toContain('Cricut Maker');
    await attend(() => aLeFocus(selecteur(page))).toBe(true);
    await panneau(page).locator('.constat').first().waitFor();
  });

  it('juge le dessin et montre le gabarit du tapis sur la toile, les debordements et les parties fines', async () => {
    const page = await editeur();
    await choisirCricut(page);
    await attend(() => nombreDeConstats(page)).toBe(5);
    expect(await constats(page)).toEqual(['bloquant', 'bloquant', 'a-corriger', 'a-corriger', 'a-corriger']);
    const texte = await panneau(page).textContent();
    // En millimetres, l'unite par defaut d'une interface francaise (1/16 po : 1,59 mm ; 12,06 × 4,88 po : 306,4 × 123,8 mm).
    for (const bout of ['contour', 'plus grande que la zone utile', 'tracé ouvert', 'presque égales', 'plus étroites que 1,59 mm', '306,4 × 123,8 mm', '4 couches : 4 tapis']) expect(texte, bout).toContain(bout);
    expect(await page.locator('.editeur-svg-toile .gabarit-zone').count()).toBe(1);
    expect(await page.locator('.editeur-svg-toile .gabarit-zone').getAttribute('width')).toBe(String(11.5 * 96));
    expect(await page.locator('.editeur-svg-toile .forme-debordante').count()).toBe(1);
    expect(await page.locator('.editeur-svg-toile .zone-fine').count()).toBe(1);
    // L'export est refuse tant qu'un constat bloque, et le bouton dit pourquoi.
    const exporter = panneau(page).getByRole('button', { name: 'Exporter pour Cricut' });
    expect(await exporter.getAttribute('aria-disabled')).toBe('true');
    // Un bouton aria-disabled reste dans l'ordre de Tab et dit sa raison a l'activation (BoutonRaison).
    await exporter.focus();
    await page.keyboard.press('Enter');
    await attend(() => dit(page)).toBe('Corrigez d’abord les 2 constats bloquants.');
  });

  it('corrige chaque constat par son bouton, une modification chacun, et Ctrl+Z annule', async () => {
    const page = await editeur();
    await choisirCricut(page);
    await attend(() => nombreDeConstats(page)).toBe(5);
    const etapes: Array<[string, string]> = [
      ['Contour en forme', '1 contour transformé en forme.'],
      ['Redimensionner à la zone utile', 'Dessin réduit à'],
      ['Fermer les tracés', '1 tracé fermé.'],
      ['Fusionner les nuances', '1 nuance fusionnée'],
      ['Épaissir', 'de 0,79 mm de chaque côté.']
    ];
    let restant = 5;
    for (const [bouton, phrase] of etapes) {
      const avant = await modifications(page);
      await corriger(page, bouton);
      await attend(() => dit(page)).toContain(phrase);
      expect(await modifications(page), bouton).toBe(avant + 1);
      restant--;
      await attend(() => nombreDeConstats(page), 5000).toBe(restant);
    }
    await attend(() => dit(page)).toContain('Prêt à découper.');
    await panneau(page).locator('.pret').waitFor();
    expect(await panneau(page).getByRole('button', { name: 'Exporter pour Cricut' }).getAttribute('aria-disabled')).toBeNull();
    // Annuler la derniere correction fait revenir la partie trop fine.
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+z');
    await attend(() => nombreDeConstats(page), 5000).toBe(1);
    expect(await panneau(page).textContent()).toContain('plus étroites que');
  });

  it('exporte un SVG a taille physique, sans trait ni opacite, une couleur par couche, qui se rouvre dans son contexte', async () => {
    const page = await editeur(PROPRE);
    await choisirCricut(page);
    await panneau(page).locator('.pret').waitFor();
    const f = await telecharger(page, () => panneau(page).getByRole('button', { name: 'Exporter pour Cricut' }).click());
    expect(f.nom).toBe('dessin-cricut.svg');
    const svg = f.octets.toString('utf8');
    // En millimetres par defaut ; le pouce reste au choix et donne la taille en pouces.
    expect(/^<svg[^>]*>/.exec(svg)?.[0]).toContain('width="127mm" height="76.2mm"');
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Pouces', exact: true }).click();
    await panneau(page).locator('.pret').waitFor();
    const enPouces = await telecharger(page, () => panneau(page).getByRole('button', { name: 'Exporter pour Cricut' }).click());
    expect(/^<svg[^>]*>/.exec(enPouces.octets.toString('utf8'))?.[0]).toContain('width="5in" height="3in"');
    expect(svg).toContain('data-ed-contexte="cricut" data-ed-machine="maker" data-ed-tapis="12x12"');
    expect(svg).not.toMatch(/stroke|opacity/);
    expect(new Set([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(m => m[1]))).toEqual(new Set(['#c81e28', '#1428a0']));
    await attend(() => dit(page)).toContain('2 couches : 2 tapis');
    // La reouverture du fichier exporte retrouve le contexte et son panneau.
    const autre = await editeur(svg);
    await attend(() => selecteur(autre).textContent()).toContain('Cricut Maker');
    await panneau(autre).locator('.pret').waitFor();
  });

  it('garde le contexte dans le SVG telecharge ; en Generique, rien de plus', async () => {
    const page = await editeur(PROPRE);
    const generique = await telecharger(page, () => boutonTelecharger(page).click());
    expect(generique.octets.toString('utf8')).not.toContain('data-ed-');
    await choisirCricut(page);
    // En contexte Cricut, le bouton de la barre exporte pour la machine ; le SVG du dessin (avec son contexte) est sous « Autres formats ».
    expect(await texteDe(boutonTelecharger(page))).toBe('Exporter pour Cricut');
    const cricut = await telecharger(page, async () => { await ouvrirMenu(page, 'Autres formats'); await page.locator('.menu-panneau .contenu-export button', { hasText: /^SVG$/ }).click(); });
    const texte = cricut.octets.toString('utf8');
    expect(texte).toContain(' width="480" height="288" data-ed-contexte="cricut"');
    // Changer de contexte suffit a rendre le dessin : « Terminer » le rend (la fiche dit qu'il est pret) au lieu de fermer sans rien.
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    await attend(() => page.locator('.accueil .message.neutre').count()).toBe(1);
    expect(await texteDe(page.locator('.accueil .message.neutre'))).toBe('Dessin prêt : téléchargez-le en SVG, ou choisissez un autre format.');
    const reouvert = await editeur(texte);
    await attend(() => selecteur(reouvert).textContent()).toContain('Cricut Maker');
  });

  it('Print Then Cut : un autre jugement, et une archive avec l image a imprimer, la coupe et le mode d emploi', async () => {
    const page = await editeur(PROPRE.replace('fill="#1428a0"', 'fill="#1428a0" stroke="#000" stroke-width="6" opacity="0.7"'));
    await choisirCricut(page);
    await attend(() => nombreDeConstats(page)).toBe(2);
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Print Then Cut (imprimer puis découper)' }).click();
    await panneau(page).getByText('Prêt pour Print Then Cut').first().waitFor();
    await panneau(page).locator('.pret').waitFor();
    expect(await page.locator('.editeur-svg-toile .gabarit-zone').count()).toBe(0);
    const f = await telecharger(page, () => panneau(page).getByRole('button', { name: 'Exporter pour Cricut' }).click());
    expect(f.nom).toBe('dessin-print-then-cut.zip');
    const noms: string[] = [];
    for (let p = 0; f.octets.readUInt32LE(p) === 0x04034b50;) {
      const taille = f.octets.readUInt32LE(p + 18), ln = f.octets.readUInt16LE(p + 26);
      noms.push(f.octets.subarray(p + 30, p + 30 + ln).toString('utf8'));
      if (noms.at(-1)?.endsWith('.png')) expect(f.octets.subarray(p + 30 + ln, p + 30 + ln + 4).toString('latin1')).toBe('\x89PNG');
      p += 30 + ln + taille;
    }
    expect(noms).toEqual(['LISEZMOI.txt', 'dessin-impression.png', 'dessin-impression.svg', 'dessin-coupe.svg']);
    await attend(() => dit(page)).toContain('fond perdu de 1,59 mm');
    // La Joy ne fait pas Print Then Cut : le choix se grise, et passer a la Joy ramene la decoupe.
    await selecteur(page).click();
    await page.getByRole('menuitemradio', { name: 'Joy' }).click();
    await attend(() => dit(page)).toContain('Contexte Cricut : Joy, tapis joy 4,5 × 6,5 po');
    await selecteur(page).click();
    expect(await page.getByRole('menuitemradio', { name: 'Print Then Cut (imprimer puis découper)' }).isDisabled()).toBe(true);
    expect(await page.getByRole('menuitemradio', { name: 'Découpe', exact: true }).getAttribute('aria-checked')).toBe('true');
  });

  it('passe axe-core sans violation ni doute, menu et panneau ouverts', async () => {
    const page = await editeur();
    await choisirCricut(page);
    await attend(() => nombreDeConstats(page)).toBe(5);
    await page.locator('.aide-cricut > summary').click();
    const axe = async () => {
      // Un titre a demi cache par le defilement de l'inspecteur est un « doute » pour axe (fond indeterminable) : la
      // fenetre prend la hauteur du contenu, pour que l'audit juge chaque texte entier et non une position de defilement.
      const hauteur = await page.evaluate(() => { const i = document.querySelector('.editeur-inspecteur'); return i ? Math.ceil(i.scrollHeight - i.clientHeight + innerHeight) : innerHeight; });
      await page.setViewportSize({ width: 1280, height: Math.min(4000, Math.max(800, hauteur + 40)) });
      await attendreAnimations(page);
      if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => (await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<ResultatAxe> } }).axe.run(document, { resultTypes: ['violations', 'incomplete'] })));
      expect(r.violations.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
      expect(r.incomplete.map(v => v.id + ' ' + JSON.stringify(v.nodes.map(n => n.target)))).toEqual([]);
    };
    await axe();
    await selecteur(page).click();
    await page.getByRole('menu', { name: 'Machine' }).waitFor();
    await axe();
  });

  it('au doigt sur 390 px : le contexte dans le menu « Plus », le panneau dans le tiroir, des cibles de 40 px', async () => {
    const page = await editeur(DESSIN, { largeur: 390, hauteur: 800, tactile: true });
    expect(await selecteur(page).count()).toBe(0);
    await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
    const cricut = page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' });
    await cricut.scrollIntoViewIfNeeded();
    await cricut.tap();
    await attend(() => dit(page)).toContain('Contexte Cricut : Maker');
    await page.locator('.editeur-etat').getByRole('button', { name: 'Inspecteur', exact: true }).tap();
    await panneau(page).locator('.constat').first().waitFor();
    const hauteurs = await panneau(page).locator('button, summary').evaluateAll(l => l.filter(e => (e as HTMLElement).offsetParent !== null).map(e => [e.textContent?.trim() ?? '', e.getBoundingClientRect().height] as const));
    expect(hauteurs.length).toBeGreaterThan(5);
    // Au centieme de pixel pres : une hauteur de 40 px se mesure parfois 39,99997 apres arrondi du navigateur.
    for (const [nom, h] of hauteurs) expect(h, nom).toBeGreaterThanOrEqual(40 - 0.01);
    await panneau(page).getByRole('button', { name: 'Contour en forme', exact: true }).tap();
    await attend(() => dit(page)).toContain('1 contour transformé en forme.');
  });
});
