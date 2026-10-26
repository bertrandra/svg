// Le PDF natif d'un dessin riche dans le navigateur (ADR-0012, etape 13a) : un degrade, une decoupe, une image PNG a alpha (son flux
// decompresse par le DecompressionStream du navigateur), une image WebP et un flou. Le fichier telecharge porte le shading, le
// chemin de decoupe et l'image en XObject a alpha ; il est, a l'octet, celui que l'ecriture pure donne hors du navigateur ; la phrase
// de l'export dit ce qui est perdu (le flou, le WebP) et rien d'approche.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { attend, ouvrirCode, ouvrirMenu, pilote, RACINE_DEPOT, URL_PAGE } from './aide.js';
import { lireDessin } from '../../src/engine/editionSvg.js';
import { aplatirPour, phrasePertes } from '../../src/engine/aplatir.js';
import { CAPACITES_PDF } from '../../src/export/capacites.js';
import { ecrirePdf } from '../../src/export/pdf.js';
import { aDecompresser, preparerImagesPdf } from '../../src/export/pdfImages.js';
import { inflateSync } from 'node:zlib';

const images = [...readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/pdf-natif/images.svg'), 'utf8').matchAll(/href="(data:image\/png;base64,[^"]+)"/g)].map(m => m[1] ?? '');
const webp = /href="(data:image\/webp;base64,[^"]+)"/.exec(readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/pdf-natif/images-perdues.svg'), 'utf8'))?.[1] ?? '';

/** Le dessin riche : un degrade, un groupe decoupe (un trait qui deborde), un PNG a alpha, un WebP, un flou. */
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">'
  + '<defs><linearGradient id="a"><stop offset="0" stop-color="#c81e28"/><stop offset="1" stop-color="#1428a0"/></linearGradient>'
  + '<clipPath id="c"><circle cx="150" cy="40" r="30"/></clipPath><filter id="f"><feGaussianBlur stdDeviation="2"/></filter></defs>'
  + '<rect x="10" y="10" width="80" height="50" fill="url(#a)"/>'
  + '<g clip-path="url(#c)"><rect x="110" y="0" width="80" height="80" fill="#e0b84a" stroke="#1f4e8c" stroke-width="8"/></g>'
  + '<image href="' + (images[1] ?? '') + '" x="10" y="70" width="48" height="36"/>'
  + '<image href="' + webp + '" x="70" y="70" width="40" height="40"/>'
  + '<circle cx="150" cy="95" r="15" fill="#2a8a5a" filter="url(#f)"/>'
  + '</svg>';

describe('le PDF natif d un dessin riche', () => {
  const navigateur = pilote();

  async function page(): Promise<Page> {
    const s = await navigateur.ouvrir({ naviguer: false });
    await s.contexte.addInitScript(() => { try { localStorage.setItem('svg.modele', JSON.stringify({ modele: 'riche' })); } catch { /* sans stockage */ } });
    await s.page.goto(URL_PAGE);
    return s.page;
  }

  it('ecrit degrade, decoupe et image nativement, les memes octets qu hors du navigateur, et dit ce qui est perdu', async () => {
    const p = await page();
    await ouvrirCode(p, SVG);
    await ouvrirMenu(p, 'Autres formats');
    const [telechargement]: [Download, void] = await Promise.all([
      p.waitForEvent('download'),
      p.locator('.menu-panneau .contenu-export button', { hasText: 'PDF vectoriel' }).click()
    ]);
    const octets = readFileSync(await telechargement.path());
    const texte = octets.toString('latin1');
    expect(texte.startsWith('%PDF-1.4\n')).toBe(true);
    expect(texte).toMatch(/\/ShadingType 2 /);
    expect(texte).toMatch(/\nW n\n/);
    expect(texte).toMatch(/\/Subtype \/Image [^>]*\/SMask \d+ 0 R/);

    // L'ecriture pure, hors du navigateur, sur le meme dessin lu en riche : les memes octets.
    const lu = lireDessin(SVG, { modele: 'riche' });
    if ('erreur' in lu) throw new Error(lu.erreur);
    const r = aplatirPour(lu.dessin, CAPACITES_PDF);
    if (!r.scene) throw new Error('pas de scene');
    const imgs = preparerImagesPdf(r.scene, new Map(aDecompresser(r.scene).map(f => [f.donnees, new Uint8Array(inflateSync(f.flux))])));
    expect(octets.equals(Buffer.from(ecrirePdf(r.dessin, {}, { scene: r.scene, images: imgs })))).toBe(true);

    const phrase = phrasePertes([...r.pertes, ...imgs.pertes], [...r.perdus, ...imgs.perdus]);
    expect(phrase).toBe('Perdu dans ce format : le flou ou l’ombre portée d’une forme (ce format ne les porte pas : ils ne sont pas exportés) ; une image WebP (ce format ne la lit pas : elle n’est pas exportée).');
    await attend(() => p.locator('.editeur-svg .annonces').textContent()).toContain(phrase);
  });
});
