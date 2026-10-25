// Le pretraitement et le lot de l'atelier de conversion (ADR-0005 prolonge) : une image bruitee comme un
// JPEG mediocre est fabriquee en memoire ; on verifie ce que le pretraitement change (couleurs, formes,
// poids), les prereglages, la vue « Pretraitee » et le rideau, la distinction des essais, le rejeu apres
// pause, puis le lot (avancement, annulation, archive ZIP relue a la main) et les cibles de 40 px au doigt.

import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import type { Download, Page } from 'playwright';
import { attend, choisirVue, encoderPng, pilote, texteDe } from './aide.js';

const TRACE = 60_000;

/** Un bruit deterministe (hachage entier de la position) : le grain d'un JPEG, a plus ou moins 14 niveaux. */
const grain = (x: number, y: number, graine: number): number => {
  let h = Math.imul(x * 73856093 ^ y * 19349663 ^ graine * 83492791, 2654435761) >>> 0;
  h ^= h >>> 15;
  return (h % 29) - 14;
};

/** Un logo (disque rouge, carre bleu, anneau vert) sur fond blanc, bruite partout. `echelle` en change la taille. */
function logoBruite(nom: string, largeur = 240, hauteur = 190, graine = 1) {
  const png = encoderPng(largeur, hauteur, (x, y) => {
    const d = (cx: number, cy: number) => Math.hypot(x - cx * largeur, y - cy * hauteur);
    let c: readonly [number, number, number] = [255, 255, 255];
    if (d(0.3, 0.5) < hauteur * 0.3) c = [200, 30, 40];
    else if (x > largeur * 0.55 && x < largeur * 0.8 && y > hauteur * 0.25 && y < hauteur * 0.75) c = [20, 60, 190];
    else if (d(0.88, 0.5) < hauteur * 0.2 && d(0.88, 0.5) > hauteur * 0.1) c = [30, 150, 60];
    const b = grain(x, y, graine);
    return [Math.min(255, Math.max(0, c[0] + b)), Math.min(255, Math.max(0, c[1] + grain(y, x, graine + 1))), Math.min(255, Math.max(0, c[2] + grain(x + 7, y + 3, graine + 2)))];
  });
  return { name: nom, mimeType: 'image/png', buffer: png };
}

/** Un ZIP relu a la main, de la fin vers le debut, avec les CRC-32 de Node : un controle independant de l'ecrivain. */
function lireZip(octets: Buffer): Array<{ nom: string; texte: string; crcOk: boolean }> {
  let fin = octets.length - 22;
  while (fin >= 0 && octets.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('pas de fin de repertoire central');
  const n = octets.readUInt16LE(fin + 10);
  let p = octets.readUInt32LE(fin + 16);
  const sortie: Array<{ nom: string; texte: string; crcOk: boolean }> = [];
  for (let i = 0; i < n; i++) {
    const crc = octets.readUInt32LE(p + 16), taille = octets.readUInt32LE(p + 24), ln = octets.readUInt16LE(p + 28), lx = octets.readUInt16LE(p + 30), lc = octets.readUInt16LE(p + 32);
    const decalage = octets.readUInt32LE(p + 42), nom = octets.subarray(p + 46, p + 46 + ln).toString('utf8');
    const debut = decalage + 30 + octets.readUInt16LE(decalage + 26) + octets.readUInt16LE(decalage + 28);
    const donnees = octets.subarray(debut, debut + taille);
    sortie.push({ nom, texte: donnees.toString('utf8'), crcOk: crc32(donnees) === crc });
    p += 46 + ln + lx + lc;
  }
  return sortie;
}

describe('pretraitement et lot', () => {
  const navigateur = pilote();

  async function atelier(image = logoBruite('bruite.png'), options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    const { page } = await navigateur.ouvrir(options);
    await page.getByRole('tab').nth(1).click();
    await page.locator('.vectoriser input[type=file]').setInputFiles(image);
    await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
    return page;
  }
  const resume = (page: Page) => texteDe(page.locator('.fiche-resultat .aide').first());
  const traces = async (page: Page) => Number(/(\d+) tracés?/.exec(await resume(page))?.[1]);
  const essais = (page: Page) => page.locator('.essais li').count();
  const section = (page: Page) => page.locator('details.section', { has: page.locator('summary', { hasText: 'Prétraitement' }) });
  const ouvrirSection = async (page: Page) => { if (!(await section(page).getAttribute('open') !== null)) await section(page).locator('summary').click(); };
  const note = (page: Page) => texteDe(section(page).locator('summary'));
  const bilan = (page: Page) => texteDe(section(page).locator('.bilan-pretraitement'));
  /** Passe en mode « Fidèle » : le grain y devient des dizaines de formes, et le pretraitement se voit. */
  const fidele = async (page: Page) => {
    const avant = await resume(page);
    await page.locator('.reglages-vecto select').first().selectOption('fidele');
    await attend(() => resume(page), TRACE).not.toBe(avant);
  };

  it('un logo bruite : le preset « Logo net » reduit les couleurs, les formes et le poids', async () => {
    const page = await atelier();
    await fidele(page);
    const avant = await resume(page);
    const formesAvant = await traces(page);
    expect(formesAvant).toBeGreaterThan(20);
    await ouvrirSection(page);
    expect(await note(page)).toBe('Prétraitement');

    await section(page).getByRole('button', { name: 'Logo net', exact: true }).click();
    // Le preset pose cinq reglages d'un coup, qui se lisent ensuite comme des valeurs touchees.
    await attend(() => note(page)).toContain('5 modifiés');
    expect(await section(page).locator('.fin.touche').count()).toBe(3); // débruitage, couleurs, lissage
    expect(await section(page).getByLabel('Aplatir les bords translucides').isChecked()).toBe(true);
    expect(await section(page).getByLabel('Garder le blanc / le fond').isChecked()).toBe(true);
    expect(await section(page).getByRole('button', { name: 'Logo net', exact: true }).getAttribute('aria-pressed')).toBe('true');

    await attend(() => resume(page), TRACE).not.toBe(avant);
    const formesApres = await traces(page);
    expect(formesApres).toBeLessThan(formesAvant / 3);
    expect(await resume(page)).toMatch(/\d+ Ko/);
    // Le bilan dit les couleurs avant/apres et l'effet sur le trace, contre l'essai sans pretraitement.
    const b = await bilan(page);
    const apres = Number(/(\d+) couleurs?/.exec(b)?.[1]), avantCouleurs = Number((/avant : ([^)]*)\)/.exec(b)?.[1] ?? '').replace(/\D/g, ''));
    expect(apres).toBeLessThanOrEqual(8);
    expect(avantCouleurs).toBeGreaterThan(1000);
    await attend(() => bilan(page)).toContain('sans prétraitement : ' + formesAvant + ' tracé');
  });

  it('les essais distinguent les reglages, et un clic reprend le pretraitement', async () => {
    const page = await atelier();
    await ouvrirSection(page);
    expect(await essais(page)).toBe(0);
    await section(page).getByRole('button', { name: 'Photo (aplats)', exact: true }).click();
    await attend(() => essais(page), TRACE).toBe(2);
    await section(page).getByRole('button', { name: 'Dessin au trait', exact: true }).click();
    await attend(() => essais(page), TRACE).toBe(3);
    await expect.poll(() => page.locator('.essais li').allTextContents(), { timeout: TRACE }).toEqual(expect.arrayContaining([expect.stringContaining('couleurs 12'), expect.stringContaining('couleurs 2')]));

    // Le plus ancien est sans pretraitement : le reprendre retire tout.
    await page.locator('.essais li').last().locator('button').click();
    await attend(() => note(page)).toBe('Prétraitement');
    // Le plus recent le rend.
    await page.locator('.essais li').first().locator('button').click();
    await attend(() => note(page)).toContain('modifiés');
  });

  it('la vue « Prétraitée » et le rideau montrent l\'image que le traceur lit', async () => {
    const page = await atelier();
    const base = page.locator('.visionneuse .calque.base');
    await ouvrirSection(page);
    // Sans pretraitement : « Prétraitée » est l'image détourée.
    await choisirVue(page, 'Prétraitée');
    await attend(() => base.getAttribute('alt')).toBe('Image prétraitée');
    const detouree = await base.getAttribute('src');

    await section(page).getByRole('button', { name: 'Logo net', exact: true }).click();
    await attend(() => base.getAttribute('src')).not.toBe(detouree);
    expect(await base.getAttribute('src')).toMatch(/^data:image\/png/);

    // Le rideau compare l'image prétraitée (choisie d'office) aux vecteurs, et le côté se choisit.
    await choisirVue(page, 'Comparer');
    const cote = page.getByLabel('Image du côté gauche du rideau');
    await attend(() => cote.inputValue()).toBe('pretraitee');
    await attend(() => base.getAttribute('alt')).toBe('Image prétraitée');
    await cote.selectOption('detouree');
    await attend(() => base.getAttribute('alt')).toBe('Image détourée');
    await cote.selectOption('origine');
    await attend(() => base.getAttribute('alt')).toBe('Image déposée');
  });

  it('rejoue après une pause : deux gestes rapprochés ne font qu\'un essai', async () => {
    const page = await atelier();
    await ouvrirSection(page);
    const debruitage = section(page).locator('input[aria-label="Effacer le grain"]');
    const premier = await resume(page);
    await debruitage.fill('1');
    await debruitage.fill('3');
    await attend(() => resume(page), TRACE).not.toBe(premier);
    await attend(() => essais(page)).toBe(2);
    // Rien d'autre ne part : l'étape intermédiaire n'a jamais été tracée.
    await page.waitForTimeout(900);
    expect(await essais(page)).toBe(2);
    expect(await note(page)).toContain('1 modifié');
    expect(await section(page).locator('output').first().innerText()).toBe('3');
    // Retirer le réglage d'un clic.
    await section(page).getByRole('button', { name: 'Retirer le réglage « Effacer le grain »' }).click();
    await attend(() => note(page)).toBe('Prétraitement');
  });

  it('réduit les couleurs à N, agrandit sans changer la taille du SVG, et garde le SVG ouvrable', async () => {
    const page = await atelier(logoBruite('petit.png', 90, 70));
    await ouvrirSection(page);
    await section(page).getByLabel('Réduire le nombre de couleurs').check();
    await section(page).locator('input[aria-label="Couleurs"]').fill('3');
    await section(page).getByLabel('Agrandir ×2 avant le tracé').check();
    await attend(() => bilan(page), TRACE).toContain('180 × 140 px');
    expect(Number(/(\d+) couleurs?/.exec(await bilan(page))?.[1])).toBeLessThanOrEqual(3);
    await attend(() => page.locator('.fiche-resultat .aide').nth(1).innerText(), TRACE).toContain('agrandi ×2');
    await page.getByRole('button', { name: 'Ouvrir dans l’éditeur' }).click();
    await page.locator('.editeur-cadre').waitFor();
  });

  describe('le lot', () => {
    const images = (noms: string[], taille: [number, number] = [160, 120]) => noms.map((n, i) => logoBruite(n, taille[0] + i * 8, taille[1], i + 1));
    const etats = (page: Page) => page.locator('.lot li .lot-etat').allInnerTexts();

    async function deposerLot(page: Page, lot: ReturnType<typeof images>) {
      await page.locator('.vectoriser input[type=file]').setInputFiles(lot);
    }
    async function telecharger(page: Page): Promise<Buffer> {
      const [dl]: [Download, void] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger tout (ZIP)' }).click()]);
      const dossier = mkdtempSync(join(tmpdir(), 'lot-'));
      try { const chemin = join(dossier, 'lot.zip'); await dl.saveAs(chemin); expect(dl.suggestedFilename()).toBe('images-svg.zip'); return readFileSync(chemin); } finally { rmSync(dossier, { recursive: true, force: true }); }
    }

    it('trois images : avancement, état par image, archive ZIP relue (noms uniques, CRC valides)', async () => {
      const { page } = await navigateur.ouvrir();
      await page.getByRole('tab').nth(1).click();
      await deposerLot(page, images(['logo.png', 'logo.png', 'autre.png']));
      await page.locator('.lot').waitFor();
      // La première image s'ouvre aussi dans l'atelier, pour régler.
      await page.locator('.fiche-resultat').waitFor({ timeout: TRACE });
      await attend(async () => (await etats(page)).filter(e => e.startsWith('Terminée')).length, TRACE).toBe(3);
      expect(await page.locator('.lot progress').getAttribute('value')).toBe('3');
      expect(await page.locator('.lot progress').getAttribute('max')).toBe('3');
      expect(await texteDe(page.locator('.lot h3'))).toContain('Lot de 3 images');
      expect(await page.locator('.lot li').count()).toBe(3);

      const zip = await telecharger(page);
      const entrees = lireZip(zip);
      expect(entrees.map(e => e.nom)).toEqual(['logo.svg', 'logo-2.svg', 'autre.svg']);
      for (const e of entrees) { expect(e.crcOk, e.nom).toBe(true); expect(e.texte.startsWith('<svg')).toBe(true); expect(e.texte).toContain('<path'); }
      // Le contrôle de Python, quand il est là.
      if (spawnSync('python3', ['-c', 'import zipfile'], { encoding: 'utf8' }).status === 0) {
        const dossier = mkdtempSync(join(tmpdir(), 'lot-py-'));
        try {
          const { writeFileSync } = await import('node:fs');
          writeFileSync(join(dossier, 'lot.zip'), zip);
          const r = spawnSync('python3', ['-I', '-c', 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(",".join(z.namelist()))', join(dossier, 'lot.zip')], { encoding: 'utf8' });
          expect(r.stdout.trim()).toBe('logo.svg,logo-2.svg,autre.svg');
        } finally { rmSync(dossier, { recursive: true, force: true }); }
      }

      // Une image du lot s'ouvre dans l'éditeur.
      await page.getByRole('button', { name: 'Ouvrir autre.png dans l’éditeur' }).click();
      await page.locator('.editeur-cadre').waitFor();
    });

    it('annuler arrête le lot après l\'image en cours ; l\'archive ne porte que les images converties', async () => {
      const page = await atelier(logoBruite('seule.png', 200, 150));
      // Des réglages lourds rendent chaque image assez lente pour qu'on ait le temps d'annuler.
      await ouvrirSection(page);
      await section(page).locator('input[aria-label="Effacer le grain"]').fill('3');
      await section(page).locator('input[aria-label="Lissage des bords"]').fill('3');
      await attend(() => note(page)).toContain('2 modifiés');
      await attend(() => essais(page), TRACE).toBeGreaterThanOrEqual(1);
      await deposerLot(page, images(['a.png', 'b.png', 'c.png', 'd.png', 'e.png', 'f.png', 'g.png', 'h.png', 'i.png', 'j.png'], [900, 680]));
      await page.locator('.lot').waitFor();
      await attend(async () => (await etats(page)).filter(e => e.startsWith('Terminée')).length, TRACE).toBeGreaterThanOrEqual(1);
      // Le clic part sans test d'actionnabilité : la liste se repeint à chaque image, et la cible bouge.
      await page.getByRole('button', { name: 'Annuler le lot' }).dispatchEvent('click');
      await page.getByRole('button', { name: 'Annuler le lot' }).waitFor({ state: 'detached', timeout: TRACE });
      const fin = await etats(page);
      const ok = fin.filter(e => e.startsWith('Terminée')).length, annulees = fin.filter(e => e.startsWith('Annulée')).length;
      expect(ok).toBeGreaterThanOrEqual(1);
      expect(annulees).toBeGreaterThanOrEqual(1);
      expect(ok + annulees).toBe(10);
      expect(await texteDe(page.locator('.lot [role=status]'))).toContain('Lot annulé');
      const entrees = lireZip(await telecharger(page));
      expect(entrees.length).toBe(ok);
    });

    it('une image illisible dans le lot dit pourquoi sans arrêter les autres', async () => {
      const { page } = await navigateur.ouvrir();
      await page.getByRole('tab').nth(1).click();
      const faux = { name: 'pas-une-image.png', mimeType: 'image/png', buffer: Buffer.from('ceci n\'est pas un PNG') };
      await page.locator('.vectoriser input[type=file]').setInputFiles([logoBruite('bonne.png', 120, 90), faux]);
      await page.locator('.lot').waitFor();
      await attend(async () => (await etats(page)).map(e => e.split(' ')[0]), TRACE).toEqual(['Terminée', 'Échec']);
      expect((await etats(page))[1]).toContain('ne se lit pas');
    });
  });

  it('au doigt (420 px), les contrôles du prétraitement et du lot ont 40 px au moins', async () => {
    const page = await atelier(logoBruite('tactile.png', 160, 120), { largeur: 420, hauteur: 860, tactile: true });
    await ouvrirSection(page);
    await section(page).getByLabel('Réduire le nombre de couleurs').check();
    const petites = (racine: string) => page.locator(`${racine} button:visible, ${racine} select:visible, ${racine} input:visible`).evaluateAll(
      (l, min) => l
        // Une case à cocher se touche par son étiquette : c'est elle qu'on mesure.
        .map(e => { const r = ((e as HTMLInputElement).type === 'checkbox' ? e.closest('label') ?? e : e).getBoundingClientRect(); return { nom: (e.getAttribute('aria-label') ?? (e as HTMLElement).innerText ?? e.className).slice(0, 30), l: Math.round(r.width), h: Math.round(r.height), type: (e as HTMLInputElement).type }; })
        .filter(c => c.h < min || (c.type !== 'range' && c.type !== 'checkbox' && c.l < min)),
      40
    );
    expect(await petites('details.section[open]')).toEqual([]);
    await page.locator('.vectoriser input[type=file]').setInputFiles([logoBruite('a.png', 120, 90), logoBruite('b.png', 120, 90)]);
    await page.locator('.lot').waitFor();
    await attend(async () => (await page.locator('.lot li .lot-etat').allInnerTexts()).filter(e => e.startsWith('Terminée')).length, TRACE).toBe(2);
    expect(await petites('.lot')).toEqual([]);
    // `clientWidth`, pas `innerWidth` : sous `isMobile`, Chromium elargit la fenetre jusqu'au contenu qui deborde, et la mesure
    // y restait nulle alors que les six onglets de la visionneuse (« Prétraitée » en plus) poussaient la page de 20 px, ce que
    // Firefox et WebKit, eux, voyaient.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
