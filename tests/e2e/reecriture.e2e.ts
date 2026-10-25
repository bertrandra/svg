// « Un SVG reecrit aujourd'hui doit l'etre a l'identique demain » vaut aussi d'un navigateur a l'autre : le moteur est
// du TypeScript pur, mais Math.sin, Math.cos, Math.tan et Math.hypot sont des approximations que la norme ne fixe pas
// (V8, SpiderMonkey et JavaScriptCore peuvent differer au dernier bit). Les gabarits de tests/unit tournent sous Node
// (V8) ; ici le MEME enchainement, joue dans le navigateur de la passe, doit rendre les memes octets que le moteur sous
// Node. Un ecart sur Firefox ou WebKit est un evenement de version majeure a annoncer, pas un bruit a ignorer
// (docs/navigateurs.md, « Reproductibilite »).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Download, Page } from 'playwright';
import { ecrireDessin, lireDessin } from '../../src/engine/editionSvg.js';
import { incliner, mettreALEchelle, tournerAutour } from '../../src/engine/transformations.js';
import { nettoyerSvg } from '../../src/util/svg.js';
import { ouvrirCode, pilote, RACINE_DEPOT } from './aide.js';

const FIXTURE = (nom: string) => readFileSync(resolve(RACINE_DEPOT, 'tests/fixtures/svg', nom), 'utf8').replace(/\r\n/g, '\n');

/** Ce que le moteur sous Node ecrit pour la rotation, l'inclinaison et l'echelle appliquees a toutes les formes (precision 3, puis nettoyage, comme « Enregistrer »). */
function attendu(svg: string, rotation: number, ix: number, iy: number, echelle: number): string {
  const propre = nettoyerSvg(svg);
  if (!propre) throw new Error('fixture illisible');
  const lu = lireDessin(propre.svg);
  if ('erreur' in lu) throw new Error(lu.erreur);
  const ids = lu.dessin.formes.map(f => f.id);
  const d = mettreALEchelle(incliner(tournerAutour(lu.dessin, ids, rotation), ids, ix, iy), ids, echelle / 100);
  return nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';
}

describe('reecriture identique d\'un navigateur a l\'autre', () => {
  const navigateur = pilote();

  /** Ouvre le SVG, applique la transformation numerique a toute la selection, enregistre et telecharge le SVG de l'accueil. */
  async function reecrit(page: Page, svg: string, t: { rotation: string; ix: string; iy: string; echelle: string }): Promise<string> {
    await ouvrirCode(page, svg);
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+a');
    // La section « Transformer » est repliee : on l'ouvre une fois.
    await page.locator('.editeur-inspecteur details.section', { has: page.locator('summary', { hasText: 'Transformer' }) }).locator('summary').click();
    await page.getByLabel('Rotation °').fill(t.rotation);
    await page.getByLabel('Incl. X °').fill(t.ix);
    await page.getByLabel('Incl. Y °').fill(t.iy);
    await page.getByLabel('Échelle %').fill(t.echelle);
    await page.getByRole('button', { name: 'Appliquer', exact: true }).click();
    // « Terminer » rend le dessin transforme (il a change) ; la fiche le telecharge comme le faisait le bouton « SVG » d'hier.
    await page.locator('.editeur-barre .groupe.fin button.primaire').click();
    await page.locator('.resultat').waitFor();
    const [telechargement]: [Download, void] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.resultat').getByRole('button', { name: 'Télécharger le SVG' }).click()
    ]);
    return readFileSync(await telechargement.path(), 'utf8');
  }

  it('ecrit les memes octets que le moteur sous Node apres rotation, inclinaison et echelle d\'arcs elliptiques', async () => {
    const { page } = await navigateur.ouvrir();
    const svg = FIXTURE('arcs.svg');
    const ecrit = await reecrit(page, svg, { rotation: '17', ix: '20', iy: '5', echelle: '150' });
    expect(ecrit).toBe(attendu(svg, 17, 20, 5, 150));
  });

  it('ecrit les memes octets pour une rotation d\'un angle quelconque sur des chemins courbes', async () => {
    const { page } = await navigateur.ouvrir();
    const svg = FIXTURE('chemins.svg');
    const ecrit = await reecrit(page, svg, { rotation: '37.3', ix: '0', iy: '0', echelle: '100' });
    expect(ecrit).toBe(attendu(svg, 37.3, 0, 0, 100));
  });
});
