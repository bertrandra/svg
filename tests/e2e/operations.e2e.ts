// Couper ou ecrire, forme par forme (ADR-0028), par la vraie page : en contexte Cricut, le panneau de gauche range les formes « À
// couper » et « À écrire » ; une ligne choisit sa forme (Maj ou Ctrl : l'ajoute) ; une forme passe d'un groupe a l'autre par son
// bouton, par la rangee de la selection, au clavier (Maj+X, Maj+E) ou en glissant, et Ctrl+Z la rend ; la toile montre la zone que la
// lame detache, hachuree (les trous respectes), et la ligne du stylo, jusqu'a ce que le menu Vue (Maj+O) retire l'apercu ; l'export
// livre une archive qui separe les operations ; Generique ne change pas ; axe-core en clair, en sombre, en contraste force ; au doigt.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { attend, attendreAnimations, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT, texteDe } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
/** Un anneau plein en pair-impair (le trou ne se decoupe pas), un disque plein, une courbe et une ligne en trait seul. */
const DESSIN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288">'
  + '<path d="M40 40H200V200H40Z M80 80V160H160V80Z" fill="#c81e28" fill-rule="evenodd"/>'
  + '<circle cx="320" cy="110" r="60" fill="#1f4e8c"/>'
  + '<path d="M40 240C100 210 160 270 220 240S340 210 400 240" fill="none" stroke="#15181d" stroke-width="2"/>'
  + '<path d="M260 200H420" fill="none" stroke="#2a7f3f" stroke-width="2"/></svg>';

interface Lu { nom: string; octets: Buffer }

/** Les entrees d'une archive ZIP « store » (export/zip.ts) : nom et contenu, lus par les en-tetes locaux. */
function entreesZip(octets: Buffer): Map<string, string> {
  const r = new Map<string, string>();
  let i = 0;
  while (octets.readUInt32LE(i) === 0x04034b50) {
    const methode = octets.readUInt16LE(i + 8), taille = octets.readUInt32LE(i + 18), longueurNom = octets.readUInt16LE(i + 26), extra = octets.readUInt16LE(i + 28);
    const nom = octets.subarray(i + 30, i + 30 + longueurNom).toString('utf8');
    const debut = i + 30 + longueurNom + extra, brut = octets.subarray(debut, debut + taille);
    r.set(nom, (methode === 8 ? inflateRawSync(brut) : brut).toString('utf8'));
    i = debut + taille;
  }
  return r;
}

describe('couper ou ecrire, forme par forme', () => {
  const navigateur = pilote();
  const groupe = (page: Page, op: 'decoupe' | 'ecriture') => page.locator('.editeur-calques .groupe-' + op);
  const lignes = (page: Page, op: 'decoupe' | 'ecriture') => groupe(page, op).locator('li button.calque-nom').evaluateAll(l => l.map(e => e.getAttribute('data-forme')));
  const ligne = (page: Page, id: string) => page.locator('.editeur-calques li', { has: page.locator('button.calque-nom[data-forme="' + id + '"]') });
  const panneau = (page: Page) => page.locator('.panneau-cricut');
  const message = (page: Page) => texteDe(page.locator('.message-etat'));

  async function editeur(options: Parameters<typeof navigateur.ouvrir>[0] = {}, cricut = true): Promise<Page> {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800, ...options });
    await ouvrirCode(page, DESSIN, options.tactile);
    if (!cricut) return page;
    if (options.tactile) {
      const plus = page.locator('.editeur-barre .menu-bouton[aria-label^="Plus d’actions"]');
      await plus.tap();
      await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).tap();
    } else {
      await page.locator('.selecteur-contexte .menu-bouton').click();
      await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    }
    await attend(() => page.locator('.editeur-calques .groupe-operation').count()).toBe(2);
    return page;
  }
  async function telecharger(page: Page, action: () => Promise<void>): Promise<Lu> {
    const [t]: [Download, void] = await Promise.all([page.waitForEvent('download'), action()]);
    return { nom: t.suggestedFilename(), octets: readFileSync(await t.path()) };
  }
  async function auditAxe(page: Page): Promise<string[]> {
    await page.addScriptTag({ content: AXE });
    return page.evaluate(async () => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } };
      return (await w.axe.run(document, { resultTypes: ['violations'] })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id);
    });
  }

  it('range les formes en deux groupes : les pleines « À couper », les traits « À écrire », chacune avec sa vignette et son nom', async () => {
    const page = await editeur();
    expect(await texteDe(groupe(page, 'decoupe').locator('h4'))).toBe('À couper 2');
    expect(await texteDe(groupe(page, 'ecriture').locator('h4'))).toBe('À écrire 2');
    // Du premier plan au fond, comme la liste des formes.
    expect(await lignes(page, 'decoupe')).toEqual(['f2', 'f1']);
    expect(await lignes(page, 'ecriture')).toEqual(['f4', 'f3']);
    expect(await ligne(page, 'f2').locator('button.calque-nom').getAttribute('aria-label')).toMatch(/^Cercle 2, /);
    expect(await ligne(page, 'f2').locator('svg.vignette-forme path').getAttribute('fill')).toBe('#1f4e8c');
    expect(await ligne(page, 'f4').locator('svg.vignette-forme path').getAttribute('fill')).toBe('none');
    expect(await ligne(page, 'f4').locator('svg.vignette-forme path').getAttribute('stroke')).toBe('#2a7f3f');
    // Les groupes viennent avant « Par couleur », la liste « Formes » d'avant n'est pas la.
    expect(await page.locator('.editeur-calques h4', { hasText: /^Formes$/ }).count()).toBe(0);
    expect(await panneau(page).locator('.resume-cricut').innerText()).toContain('2 à couper · 2 à écrire');
  });

  it('choisit une forme depuis le panneau, Maj ou Ctrl l ajoute, et la rangee de la selection dit son operation', async () => {
    const page = await editeur();
    await ligne(page, 'f2').locator('button.calque-nom').click();
    await attend(() => ligne(page, 'f2').locator('button.calque-nom').getAttribute('aria-pressed')).toBe('true');
    expect(await page.locator('.editeur-svg-toile .trace-choisi').count()).toBe(1);
    await ligne(page, 'f1').locator('button.calque-nom').click({ modifiers: ['Shift'] });
    await ligne(page, 'f4').locator('button.calque-nom').click({ modifiers: ['Control'] });
    await attend(() => page.locator('.editeur-svg-toile .trace-choisi').count()).toBe(3);
    expect(await texteDe(page.locator('.editeur-barre-selection > .aide'))).toBe('3 sélectionnées');
    // Une selection melee n'enfonce aucun des deux boutons.
    const couper = page.locator('.operation-selection button[aria-label="À couper (Maj+X)"]'), ecrire = page.locator('.operation-selection button[aria-label="À écrire au stylo (Maj+E)"]');
    expect([await couper.getAttribute('aria-pressed'), await ecrire.getAttribute('aria-pressed')]).toEqual(['false', 'false']);
    await ligne(page, 'f4').locator('button.calque-nom').click({ modifiers: ['Control'] });
    await attend(() => couper.getAttribute('aria-pressed')).toBe('true');
    // La rangee change l'operation de toute la selection.
    await ecrire.click();
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f2', 'f1']);
    expect(await message(page)).toBe('2 formes passent à l’écriture au stylo. Ctrl+Z annule.');
    await attend(() => ecrire.getAttribute('aria-pressed')).toBe('true');
  });

  it('fait passer une forme d un groupe a l autre a la souris et au clavier, et Ctrl+Z la rend', async () => {
    const page = await editeur();
    // A la souris : le bouton de la ligne.
    await ligne(page, 'f2').getByRole('button', { name: 'Écrire au stylo : Cercle 2 (Maj+E)' }).click();
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f2']);
    expect(await lignes(page, 'decoupe')).toEqual(['f1']);
    await page.keyboard.press('Control+z');
    await attend(() => lignes(page, 'decoupe')).toEqual(['f2', 'f1']);
    // Au clavier : Tab jusqu'au bouton d'une ligne, Entree ; puis la forme choisie, Maj+X et Maj+E.
    await ligne(page, 'f3').locator('button.calque-nom').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Couper à la lame : Courbe 3 (Maj+X)');
    await page.keyboard.press('Enter');
    await attend(() => lignes(page, 'decoupe')).toEqual(['f3', 'f2', 'f1']);
    await page.keyboard.press('Control+z');
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3']);
    await ligne(page, 'f1').locator('button.calque-nom').focus();
    await page.keyboard.press('Enter');
    await attend(() => ligne(page, 'f1').locator('button.calque-nom').getAttribute('aria-pressed')).toBe('true');
    await page.keyboard.press('Shift+E');
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f1']);
    await attend(() => page.locator('.editeur-cadre > .annonces').evaluate(e => (e.textContent ?? '').trim())).toBe('Une forme passe à l’écriture au stylo. Ctrl+Z annule.');
    await page.keyboard.press('Shift+X');
    await attend(() => lignes(page, 'decoupe')).toEqual(['f2', 'f1']);
    await page.keyboard.press('Control+z');
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f1']);
    await page.keyboard.press('Control+z');
    await attend(() => lignes(page, 'decoupe')).toEqual(['f2', 'f1']);
  });

  it('fait passer une forme en la glissant d un groupe a l autre (un raccourci, pas le seul chemin)', async () => {
    const page = await editeur();
    // Par sa vignette, la poignee du glisser : un glisser ne commence pas sur un bouton dans firefox.
    await ligne(page, 'f4').locator('.vignette-forme').dragTo(groupe(page, 'decoupe').locator('h4'));
    await attend(() => lignes(page, 'decoupe')).toEqual(['f4', 'f2', 'f1']);
  });

  it('montre sur la toile la zone que la lame decoupe, hachuree, trous respectes, et la ligne du stylo ; le menu Vue et Maj+O la retirent', async () => {
    const page = await editeur();
    const apercu = page.locator('.editeur-svg-toile .apercu-machine');
    await attend(() => apercu.count()).toBe(1);
    // Les formes a couper : une zone hachuree (le motif, la regle de la forme) et un contour net ; les formes a ecrire, un trait.
    expect(await apercu.locator('.apercu-zone').count()).toBe(2);
    expect(await apercu.locator('.apercu-coupe').count()).toBe(2);
    expect(await apercu.locator('.apercu-stylo').count()).toBe(2);
    const anneau = apercu.locator('[data-cible="f1"] .apercu-zone');
    expect(await anneau.getAttribute('fill')).toMatch(/^url\(#hachures-machine-/);
    expect(await anneau.getAttribute('fill-rule')).toBe('evenodd');
    // Le trou de l'anneau n'est pas hachure : la lame ne le detache pas avec la forme.
    expect(await anneau.evaluate(e => { const p = e as SVGGeometryElement; const pt = (x: number, y: number) => new DOMPoint(x, y); return [p.isPointInFill(pt(60, 60)), p.isPointInFill(pt(120, 120))]; })).toEqual([true, false]);
    const jeton = (nom: string) => page.evaluate(n => { const s = document.createElement('span'); s.style.color = 'var(' + n + ')'; document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; }, nom);
    expect(await apercu.locator('.apercu-coupe').first().evaluate(e => getComputedStyle(e).stroke)).toBe(await jeton('--apercu-coupe'));
    expect(await apercu.locator('.apercu-stylo').first().evaluate(e => getComputedStyle(e).stroke)).toBe(await jeton('--apercu-stylo'));
    expect(await apercu.locator('.apercu-stylo').first().getAttribute('fill')).toBe('none');
    // Les formes ordinaires sont dessous, transparentes : elles gardent les clics.
    const carre = page.locator('.editeur-svg-toile path[data-id="f2"]');
    expect(await carre.evaluate(e => getComputedStyle(e).opacity)).toBe('0');
    await carre.click();
    await attend(() => page.locator('.editeur-svg-toile .trace-choisi').count()).toBe(1);
    // Le menu Vue : « Aperçu de la machine », coche, avec son raccourci.
    await page.locator('.menu-bouton', { hasText: 'Vue' }).click();
    const element = page.getByRole('menuitemcheckbox', { name: /Aperçu de la machine/ });
    expect(await element.getAttribute('aria-checked')).toBe('true');
    expect(await texteDe(element)).toBe('Aperçu de la machine Maj+O');
    await element.click();
    await attend(() => apercu.count()).toBe(0);
    expect(await carre.evaluate(e => getComputedStyle(e).opacity)).toBe('1');
    expect(await message(page)).toBe('Aperçu de la machine retiré : le dessin dans ses couleurs.');
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Shift+O');
    await attend(() => apercu.count()).toBe(1);
    // La vue contours (O) l'emporte tant qu'elle est active.
    await page.keyboard.press('o');
    await attend(() => apercu.count()).toBe(0);
  });

  it('exporte une archive qui separe les operations, et la carte « Dans Design Space » dit les deux fichiers', async () => {
    const page = await editeur();
    // Le centre de l'anneau tombera a la decoupe (ADR-0040) : un point a corriger, que l'export fait confirmer.
    const exporter = panneau(page).locator('.export-cricut button.primaire');
    await attend(() => texteDe(exporter)).toBe('Exporter quand même (1 point à corriger)');
    const exporterQuandMeme = async () => {
      await exporter.click();
      return telecharger(page, () => panneau(page).locator('.confirmation-export').getByRole('button', { name: 'Exporter quand même' }).click());
    };
    // Par defaut, le tapis est fixe (ADR-0039, revision du 26 octobre 2026) : trois fichiers a la taille du tapis, un cadre de reperage
    // par couleur sous les formes de la lame et sous les traits du stylo, et le mode d'emploi le dit.
    const fixe = entreesZip((await exporterQuandMeme()).octets);
    expect(fixe.get('dessin-a-couper.svg')?.match(/<path /g)).toHaveLength(4);
    expect([...(fixe.get('dessin-a-ecrire.svg') ?? '').matchAll(/ fill="([^"]*)"/g)].map(m => m[1])).toEqual(['none', 'none', 'none', 'none']);
    for (const s of ['dessin-a-couper.svg', 'dessin-a-ecrire.svg', 'dessin-cricut.svg']) expect(fixe.get(s)).toMatch(/ width="304.8mm" height="304.8mm"/);
    expect(fixe.get('LISEZMOI.txt')).toContain('3. Tapis fixe (« Recalage automatique » décoché, le réglage par défaut)');
    // La case cochee, puis Ctrl+Z qui rend l'ancien plan (cocher ne touche pas au dessin) : l'archive d'avant la revision, a la taille
    // du dessin, sans cadre.
    await panneau(page).getByRole('checkbox', { name: 'Recalage automatique' }).check();
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await attend(() => texteDe(exporter)).toBe('Exporter quand même (1 point à corriger)');
    const f = await exporterQuandMeme();
    expect(f.nom).toBe('dessin-cricut.zip');
    const zip = entreesZip(f.octets);
    expect([...zip.keys()]).toEqual(['LISEZMOI.txt', 'dessin-a-couper.svg', 'dessin-a-ecrire.svg', 'dessin-cricut.svg']);
    const aCouper = zip.get('dessin-a-couper.svg') ?? '', aEcrire = zip.get('dessin-a-ecrire.svg') ?? '', combine = zip.get('dessin-cricut.svg') ?? '';
    expect(aCouper.match(/<path /g)).toHaveLength(2);
    expect(aCouper).not.toContain('stroke');
    expect([...aEcrire.matchAll(/ fill="([^"]*)"/g)].map(m => m[1])).toEqual(['none', 'none']);
    expect(combine).toMatch(/<g id="a-couper">.*<\/g><g id="a-ecrire">.*<\/g>/);
    for (const s of [aCouper, aEcrire, combine]) { expect(s).toMatch(/ width="127mm" height="76.2mm"/); expect(s).not.toContain('data-ed-operation'); }
    expect(zip.get('LISEZMOI.txt')).toContain('À VÉRIFIER');
    const carte = panneau(page).locator('.carte-design-space');
    await attend(() => carte.count()).toBe(1);
    expect(await carte.locator('li').first().innerText()).toBe('Ouvrez l’archive dessin-cricut.zip : le fichier à couper, le fichier à écrire, les deux ensemble et un mode d’emploi.');
    expect(await carte.locator('li', { hasText: '« Dessiner »' }).locator('.a-verifier').count()).toBe(1);
  });

  it('garde l operation choisie dans le SVG enregistre, en Cricut et hors du defaut seulement', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, DESSIN);
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await attend(() => page.locator('.editeur-calques .groupe-operation').count()).toBe(2);
    await ligne(page, 'f2').getByRole('button', { name: /^Écrire au stylo : Cercle 2/ }).click();
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f2']);
    // Le SVG du document (Fichier > « Télécharger le SVG », options neutres : ce que « Terminer » rend a la page).
    const f = await telecharger(page, async () => {
      await ouvrirMenu(page, 'Fichier');
      await page.locator('.menu-panneau').getByRole('menuitem', { name: 'Télécharger le SVG', exact: true }).click();
    });
    const svg = f.octets.toString('utf8');
    expect(svg.match(/data-ed-operation="[a-z]+"/g)).toEqual(['data-ed-operation="ecriture"']);
    expect(svg).toContain('data-ed-contexte="cricut"');
    // Rouvert, le cercle est toujours a ecrire.
    await page.goto(page.url());
    await ouvrirCode(page, svg);
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f2']);
  });

  it('en Generique, rien ne change : la liste des formes, aucune hachure, Maj+E choisit l ellipse', async () => {
    const page = await editeur({}, false);
    expect(await page.locator('.editeur-calques .groupe-operation').count()).toBe(0);
    expect(await page.locator('.editeur-calques h4', { hasText: /^Formes$/ }).count()).toBe(1);
    expect(await page.locator('.editeur-calques ol > li').count()).toBe(4);
    expect(await page.locator('.editeur-svg-toile .apercu-machine').count()).toBe(0);
    await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
    expect(await page.locator('.operation-selection').count()).toBe(0);
    await page.locator('.menu-bouton', { hasText: 'Vue' }).click();
    expect(await page.getByRole('menuitemcheckbox', { name: /Aperçu de la machine/ }).count()).toBe(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Shift+E');
    await attend(() => page.locator('.editeur-barre .icone-bouton[aria-label^="Ellipse"]').getAttribute('aria-pressed')).toBe('true');
  });

  for (const schema of ['light', 'dark'] as const) {
    it('passe axe-core en ' + (schema === 'light' ? 'clair' : 'sombre') + ', panneau, selection et apercu ouverts', async () => {
      const page = await editeur({ schema });
      await ligne(page, 'f2').locator('button.calque-nom').click();
      await page.locator('.operation-selection').waitFor();
      expect(await auditAxe(page)).toEqual([]);
    });
  }

  it('en contraste force : l apercu garde ses couleurs, lisibles sur le plan, et la ligne choisie se voit ; puis axe-core passe sur l ecran', async () => {
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await page.emulateMedia({ forcedColors: 'active' });
    await ouvrirCode(page, DESSIN);
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await attend(() => page.locator('.editeur-svg-toile .apercu-machine').count()).toBe(1);
    const coupe = page.locator('.editeur-svg-toile .apercu-coupe').first();
    expect(await coupe.evaluate(e => getComputedStyle(e).stroke)).toBe('rgb(204, 74, 26)');
    expect(await coupe.evaluate(e => getComputedStyle(e).strokeWidth)).toBe('2.5px');
    expect(await page.locator('.editeur-svg-toile .apercu-hachure').first().evaluate(e => getComputedStyle(e).stroke)).toBe('rgb(204, 74, 26)');
    expect(await page.locator('.editeur-svg-toile .apercu-stylo').first().evaluate(e => getComputedStyle(e).stroke)).toBe('rgb(61, 111, 224)');
    await ligne(page, 'f2').locator('button.calque-nom').click();
    const fond = await ligne(page, 'f2').evaluate(e => getComputedStyle(e).backgroundColor);
    expect(fond).not.toBe(await ligne(page, 'f1').evaluate(e => getComputedStyle(e).backgroundColor));
    // L'audit axe se fait hors du mode : en contraste force, le contraste d'un bouton plein est celui de la paire du systeme
    // (Highlight sur HighlightText), que la page ne choisit pas ; l'emulation de firefox et webkit la donne a 2,94:1 et axe la
    // jugerait comme une couleur de la page. Les couleurs du mode sont verifiees ci-dessus, l'ecran entier l'est par axe ici.
    await page.emulateMedia({ forcedColors: 'none' });
    // Les couleurs reviennent par leurs transitions : l'audit lit l'etat d'arrivee, pas un melange en cours.
    await attendreAnimations(page);
    expect(await auditAxe(page)).toEqual([]);
  });

  it('fenetre un long groupe (ADR-0008) : quatre cents formes a couper, une poignee de lignes dessinees, chacune comptee', async () => {
    const carres = Array.from({ length: 400 }, (_, i) => '<rect x="' + (i % 40) * 12 + '" y="' + Math.floor(i / 40) * 12 + '" width="10" height="10" fill="#c81e28"/>').join('');
    const { page } = await navigateur.ouvrir({ largeur: 1280, hauteur: 800 });
    await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 288">' + carres + '<path d="M0 250H480" fill="none" stroke="#1f4e8c" stroke-width="2"/></svg>');
    await page.locator('.selecteur-contexte .menu-bouton').click();
    await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
    await attend(() => texteDe(groupe(page, 'decoupe').locator('h4'))).toBe('À couper 400');
    const rendues = await groupe(page, 'decoupe').locator('li').count();
    expect(rendues).toBeGreaterThan(0);
    expect(rendues).toBeLessThan(150);
    expect(await groupe(page, 'decoupe').locator('li').first().getAttribute('aria-setsize')).toBe('400');
    expect(await lignes(page, 'ecriture')).toEqual(['f401']);
  });

  it('a 390 px au doigt : le tiroir des calques porte les deux groupes en cibles de 40 px, la rangee un menu d operation', async () => {
    const page = await editeur({ largeur: 390, hauteur: 800, tactile: true });
    await page.locator('.editeur-etat button[aria-label="Calques"]').tap();
    await attend(() => groupe(page, 'decoupe').isVisible()).toBe(true);
    // Le tiroir glisse a l'ecran : mesurer pendant l'entree comparerait deux instants (firefox et webkit l'animent plus lentement).
    await attendreAnimations(page);
    const bouton = ligne(page, 'f2').getByRole('button', { name: /^Écrire au stylo : Cercle 2/ });
    const boite = await bouton.boundingBox();
    expect(boite?.height ?? 0).toBeGreaterThanOrEqual(40);
    expect(boite?.width ?? 0).toBeGreaterThanOrEqual(40);
    expect((await ligne(page, 'f2').locator('button.calque-nom').boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
    // La ligne tient dans le tiroir : rien ne deborde a droite.
    const tiroir = await page.locator('.editeur-calques').boundingBox(), droite = await ligne(page, 'f1').locator('.calque-bascule').last().boundingBox();
    expect((droite?.x ?? 0) + (droite?.width ?? 0)).toBeLessThanOrEqual((tiroir?.x ?? 0) + (tiroir?.width ?? 0));
    await bouton.tap();
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f2']);
    expect(await auditAxe(page)).toEqual([]);
    // La forme choisie, la rangee resserree porte l'operation dans un menu de deux choix.
    await ligne(page, 'f1').locator('button.calque-nom').tap();
    await page.locator('.voile').tap({ position: { x: 370, y: 400 } });
    const menu = page.locator('.editeur-barre-selection .operation-selection .menu-bouton');
    await attend(() => menu.getAttribute('aria-label')).toBe('Opération de la sélection : à couper');
    await menu.tap();
    await page.getByRole('menuitemradio', { name: /À écrire au stylo/ }).tap();
    await attend(() => lignes(page, 'ecriture')).toEqual(['f4', 'f3', 'f2', 'f1']);
    const rangee = await page.locator('.editeur-barre-selection').boundingBox();
    expect((rangee?.width ?? 999)).toBeLessThanOrEqual(390);
  });
});
