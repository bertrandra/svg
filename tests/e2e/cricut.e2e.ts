// Le contexte de production Cricut dans le navigateur (ADR-0013) : le choisir dans la barre (souris et clavier), le
// voir juger un dessin (trait, deux nuances proches, trace ouvert, partie trop fine, piece plus grande que le tapis),
// corriger chaque constat par son bouton et l'annuler, exporter et relire le fichier, Print Then Cut, retrouver le
// contexte a la reouverture, le tout au doigt sur 390 px, sous axe-core, et dit dans la region vocale.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { aLeFocus, attend, modifications, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT } from './aide.js';

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
    await page.getByRole('menuitemradio', { name: 'Cricut' }).click();
    await panneau(page).locator('.constat, .pret').first().waitFor();
  }
  async function telecharger(page: Page, action: () => Promise<void>): Promise<{ nom: string; octets: Buffer }> {
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
    return { nom: t.suggestedFilename(), octets: readFileSync(await t.path()) };
  }

  it('se choisit dans la barre a la souris : Generique par defaut, puis Cricut Maker, tapis 12 x 12, papier cartonne', async () => {
    const page = await editeur();
    await expect(selecteur(page).textContent()).resolves.toContain('Générique');
    expect(await panneau(page).count()).toBe(0);
    await choisirCricut(page);
    await expect(selecteur(page).textContent()).resolves.toContain('Cricut Maker');
    await attend(() => dit(page)).toBe('Contexte Cricut : Maker (Maker / Maker 3), tapis 12 × 12 po, papier cartonné, en pouces.');
    await selecteur(page).click();
    for (const nom of ['Cricut', 'Maker (Maker / Maker 3)', 'Tapis 12 × 12 po', 'Papier cartonné', 'Découpe', 'Pouces']) {
      expect(await page.getByRole('menuitemradio', { name: nom, exact: true }).getAttribute('aria-checked'), nom).toBe('true');
    }
    // Le vinyle est annonce, pas encore decrit : il ne se choisit pas.
    expect(await page.getByRole('menuitemradio', { name: 'Vinyle (bientôt)' }).isDisabled()).toBe(true);
    await page.getByRole('menuitemradio', { name: 'Tapis 12 × 24 po' }).click();
    await attend(() => dit(page)).toContain('tapis 12 × 24 po');
  });

  it('se choisit au clavier : fleches dans le menu, Entree', async () => {
    const page = await editeur();
    await selecteur(page).focus();
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(page.getByRole('menuitemradio', { name: 'Générique' }))).toBe(true);
    await page.keyboard.press('ArrowDown');
    await attend(() => aLeFocus(page.getByRole('menuitemradio', { name: 'Cricut' }))).toBe(true);
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
    for (const bout of ['contour', 'plus grande que la zone utile', 'tracé ouvert', 'presque égales', 'plus étroites que 0,06 po', '12,1 × 4,88 po', '4 couches : 4 tapis']) expect(texte, bout).toContain(bout);
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
      ['Épaissir', 'de 0,03 po de chaque côté.']
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
    expect(/^<svg[^>]*>/.exec(svg)?.[0]).toContain('width="5in" height="3in"');
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
    const generique = await telecharger(page, async () => { await ouvrirMenu(page, 'Fichier'); await page.getByRole('menuitem', { name: 'Télécharger le SVG' }).click(); });
    expect(generique.octets.toString('utf8')).not.toContain('data-ed-');
    await choisirCricut(page);
    // Changer de contexte suffit a pouvoir enregistrer : il s'ecrit dans le fichier.
    expect(await page.locator('.editeur-barre button', { hasText: 'Enregistrer' }).getAttribute('aria-disabled')).toBeNull();
    const cricut = await telecharger(page, async () => { await ouvrirMenu(page, 'Fichier'); await page.getByRole('menuitem', { name: 'Télécharger le SVG' }).click(); });
    const texte = cricut.octets.toString('utf8');
    expect(texte).toContain(' width="480" height="288" data-ed-contexte="cricut"');
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
    await attend(() => dit(page)).toContain('fond perdu de 0,06 po');
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
      // Le jugement se recalcule 200 ms apres le dernier geste et peut remonter une section, dont le fondu repart :
      // on attend qu'aucune animation finie ne tourne plus, trois sondages de suite, avant de mesurer un contraste.
      await page.evaluate(async () => {
        const enCours = () => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
        const limite = performance.now() + 4000;
        let calmes = 0;
        while (calmes < 3 && performance.now() < limite) {
          const actives = enCours();
          if (actives.length) { calmes = 0; await Promise.race([Promise.all(actives.map(a => a.finished.catch(() => undefined))), new Promise(fini => setTimeout(fini, 500))]); }
          else { calmes++; await new Promise(fini => setTimeout(fini, 120)); }
        }
      });
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
    const cricut = page.getByRole('menuitemradio', { name: 'Cricut' });
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
