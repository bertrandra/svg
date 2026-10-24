// L'audit automatique d'accessibilite : axe-core est injecte dans la page construite (file://, comme un
// utilisateur la recoit) et passe sur chaque ecran qui compte. Toute violation « serious » ou « critical »
// fait echouer le test ; les « moderate » et « minor » sont listees dans la sortie, pour le rapport.
// Un « incomplete » (ce qu'axe ne sait pas trancher) fait echouer aussi, sauf s'il est sur la liste
// ecrite et motivee INCERTAINS_ADMIS : on n'ecarte pas ce qu'on n'a pas lu.
//
// Un faux positif se desactive pour UNE regle sur UN selecteur, avec la raison (voir REGLES_ECARTEES) :
// jamais une regle pour toute la page.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { attend, imageDeTest, ouvrirExemple, pilote, RACINE_DEPOT, URL_INTEGRATION } from './aide.js';

const AXE = readFileSync(resolve(RACINE_DEPOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

/** Ce qu'axe rend d'une violation, reduit a ce que l'on lit. */
interface Violation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  help: string;
  nodes: { target: unknown[]; html: string; failureSummary?: string }[];
}
interface ResultatAxe { violations: Violation[]; incomplete: Violation[] }
interface FenetreAxe { axe: { run: (contexte: unknown, options: unknown) => Promise<ResultatAxe> } }

/**
 * Les faux positifs reconnus : une regle, un selecteur, la raison. Rien n'est ecarte pour toute la page.
 * (Vide tant que l'audit n'en a trouve aucun : chaque violation reelle a ete corrigee.)
 */
const REGLES_ECARTEES: ReadonlyArray<{ regle: string; selecteur: string; raison: string }> = [];

/**
 * Les « incomplete » admis : une regle, un selecteur (prefixe de la cible axe), la raison pour laquelle
 * aucune machine ne peut trancher. Vide tant que chaque doute a ete leve en corrigeant la cause.
 */
const INCERTAINS_ADMIS: ReadonlyArray<{ regle: string; selecteur: string; raison: string }> = [];

const synthese: string[] = [];
// Les doutes non admis du dernier ecran audite : exigerSansViolationGrave les relit (les tests passent l'un apres l'autre).
let dernierIncertains: Violation[] = [];

async function auditer(page: Page, ecran: string): Promise<Violation[]> {
  // Une section qui se deplie fond en 150 ms : mesuree en route, un texte a demi transparent n'a pas son contraste.
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => undefined))),
    new Promise(fini => setTimeout(fini, 2000))
  ]).then(() => undefined));
  await page.addScriptTag({ content: AXE });
  const resultat = await page.evaluate(async ecartees => {
    const w = window as unknown as FenetreAxe;
    // Une regle desactivee sur un selecteur : on exclut ce selecteur de CETTE regle seulement (axe n'a pas d'option plus fine).
    const r = await w.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
    const hors = (v: Violation) => ({
      ...v,
      nodes: v.nodes.filter(n => !ecartees.some(e => e.regle === v.id && n.target.some(t => typeof t === 'string' && (t === e.selecteur || t.startsWith(e.selecteur)))))
    });
    return { violations: r.violations.map(hors).filter(v => v.nodes.length), incomplete: r.incomplete } satisfies ResultatAxe;
  }, REGLES_ECARTEES);
  const incertains = incertainsNonAdmis(resultat.incomplete);
  const graves = resultat.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const autres = resultat.violations.filter(v => v.impact !== 'serious' && v.impact !== 'critical');
  const ligne = (v: Violation) => `    [${v.impact}] ${v.id} : ${v.help} (${v.nodes.length} élément${v.nodes.length > 1 ? 's' : ''}) ${v.nodes.slice(0, 3).map(n => JSON.stringify(n.target)).join(' ')}`;
  // Les « incomplete » sont ce qu'axe ne sait pas trancher (une couleur sur un degrade, un element cache) : pas des echecs, a relire.
  const admis = resultat.incomplete.map(v => `${v.id} ×${v.nodes.length}`).join(', ');
  const restes = incertains.map(v => `${v.id} ×${v.nodes.length}`).join(', ');
  synthese.push(`${ecran} : ${graves.length} grave(s), ${autres.length} autre(s)` + (admis ? ` ; incertains admis ou non : ${admis}` : '') + (restes ? ` ; NON ADMIS : ${restes}` : '') + [...graves, ...autres].map(v => '\n' + ligne(v)).join(''));
  dernierIncertains = incertains;
  return resultat.violations;
}

/** Les doutes d'axe qui ne figurent pas sur la liste ecrite (voir INCERTAINS_ADMIS). */
function incertainsNonAdmis(incomplete: readonly Violation[]): Violation[] {
  return incomplete
    .map(v => ({ ...v, nodes: v.nodes.filter(n => !INCERTAINS_ADMIS.some(a => a.regle === v.id && n.target.some(t => typeof t === 'string' && t.startsWith(a.selecteur)))) }))
    .filter(v => v.nodes.length);
}

/** Echoue en disant tout : la regle, l'aide, les elements et ce qu'il faut changer. */
function exigerSansViolationGrave(violations: readonly Violation[]): void {
  const graves = violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  const detail = graves.map(v => `[${v.impact}] ${v.id} : ${v.help}\n` + v.nodes.slice(0, 5).map(n => `   ${JSON.stringify(n.target)}\n   ${n.html.slice(0, 160)}\n   ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')).join('\n');
  expect(graves.length, detail).toBe(0);
  const doutes = dernierIncertains.map(v => `[à relire] ${v.id} : ${v.help}\n` + v.nodes.slice(0, 6).map(n => `   ${JSON.stringify(n.target)}\n   ${n.html.slice(0, 160)}\n   ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')).join('\n');
  expect(dernierIncertains.length, 'Doutes d’axe ni levés ni admis (INCERTAINS_ADMIS) :\n' + doutes).toBe(0);
}

describe('axe-core : accessibilite automatique', () => {
  const navigateur = pilote();

  afterAll(() => {
    // Le rapport : une section par ecran, les graves d'abord ; visible dans la sortie de `npm run e2e`.
    console.log('\n=== Audit axe-core ===\n' + synthese.join('\n') + '\n');
  });

  async function accueil(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
    return (await navigateur.ouvrir(options)).page;
  }

  describe('la page d accueil', () => {
    for (const [onglet, nom] of [['Ouvrir un SVG', 'ouvrir un SVG'], ['Convertir une image', 'convertir une image'], ['Bibliothèque', 'bibliothèque']] as const) {
      it(`voie « ${nom} »`, async () => {
        const page = await accueil({ largeur: 1200, hauteur: 900 });
        await page.getByRole('tab', { name: new RegExp('^' + onglet) }).click();
        await attend(() => page.getByRole('tab', { name: new RegExp('^' + onglet) }).getAttribute('aria-selected')).toBe('true');
        exigerSansViolationGrave(await auditer(page, 'accueil, voie ' + nom));
      });
    }

    it('voie « bibliothèque » chargée, avec ses vignettes', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900 });
      await page.getByRole('tab', { name: /^Bibliothèque/ }).click();
      await page.getByRole('button', { name: /Charger la bibliothèque/ }).click();
      await page.locator('.bibliotheque .vignette').first().waitFor({ timeout: 60_000 });
      exigerSansViolationGrave(await auditer(page, 'accueil, bibliothèque chargée'));
    });

    it('voie « convertir une image » avec une image vectorisée et ses réglages fins', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900 });
      await page.getByRole('tab', { name: /^Convertir une image/ }).click();
      await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
      await page.locator('.fiche-resultat').waitFor({ timeout: 60_000 });
      exigerSansViolationGrave(await auditer(page, 'accueil, image vectorisée'));
    });

    it('avec la boîte « À propos et crédits » ouverte depuis le pied de page', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900 });
      await page.getByRole('button', { name: 'À propos et crédits' }).click();
      await page.getByRole('dialog', { name: 'À propos et crédits' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'accueil, boîte À propos et crédits'));
    });

    it('sur un téléphone de 420 px, avec la boîte « À propos et crédits »', async () => {
      const page = await accueil({ largeur: 420, hauteur: 860, tactile: true });
      await page.getByRole('button', { name: 'À propos et crédits' }).tap();
      await page.getByRole('dialog', { name: 'À propos et crédits' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'accueil, 420 px tactile, boîte À propos et crédits'));
    });

    it('voie « convertir une image » avec la section Prétraitement ouverte, un préréglage posé et la vue Prétraitée', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900 });
      await page.getByRole('tab', { name: /^Convertir une image/ }).click();
      await page.locator('.vectoriser input[type=file]').setInputFiles(imageDeTest());
      await page.locator('.fiche-resultat').waitFor({ timeout: 60_000 });
      await page.locator('details.section summary', { hasText: 'Prétraitement' }).click();
      await page.getByRole('button', { name: 'Logo net', exact: true }).click();
      await page.getByRole('button', { name: 'Prétraitée', exact: true }).click();
      await attend(() => page.locator('.bilan-pretraitement .aide').first().innerText(), 60_000).toContain('couleur');
      exigerSansViolationGrave(await auditer(page, 'accueil, section Prétraitement ouverte'));
    });

    it('voie « convertir une image » avec une liste de lot terminée', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900 });
      await page.getByRole('tab', { name: /^Convertir une image/ }).click();
      await page.locator('.vectoriser input[type=file]').setInputFiles([imageDeTest(), { ...imageDeTest(), name: 'deuxieme.png' }]);
      await attend(async () => (await page.locator('.lot li .lot-etat').allInnerTexts()).filter(e => e.startsWith('Terminée')).length, 60_000).toBe(2);
      exigerSansViolationGrave(await auditer(page, 'accueil, lot terminé'));
    });

    it('avec le nuancier ouvert et un dessin en cours', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900 });
      await page.getByText('Nuancier proposé dans l’éditeur').click();
      exigerSansViolationGrave(await auditer(page, 'accueil, nuancier ouvert'));
    });
  });

  describe('l editeur', () => {
    async function editeur(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
      const page = await accueil(options);
      await ouvrirExemple(page, options.tactile);
      return page;
    }

    it('avec le dessin d exemple', async () => {
      exigerSansViolationGrave(await auditer(await editeur(), 'éditeur, exemple'));
    });

    it('avec une forme choisie (inspecteur et rangée de sélection)', async () => {
      const page = await editeur();
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      exigerSansViolationGrave(await auditer(page, 'éditeur, une forme choisie'));
    });

    it('avec plusieurs formes choisies et l inspecteur ouvert sur ses sections', async () => {
      const page = await editeur();
      await page.keyboard.press('Control+a');
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      await page.locator('.editeur-inspecteur details.section:not([open]) > summary').evaluateAll(l => l.forEach(e => (e as HTMLElement).click()));
      exigerSansViolationGrave(await auditer(page, 'éditeur, tout choisi, sections ouvertes'));
    });

    it('avec un menu ouvert', async () => {
      const page = await editeur();
      await page.locator('.menu-bouton', { hasText: 'Vue' }).click();
      await page.getByRole('menu', { name: 'Vue' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, menu Vue ouvert'));
    });

    it('avec le menu des formes ouvert', async () => {
      const page = await editeur();
      await page.getByRole('button', { name: 'Choisir une forme' }).click();
      await page.getByRole('menu', { name: 'Choisir une forme' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, menu des formes ouvert'));
    });

    it('avec les couleurs du dessin déployées dans les calques', async () => {
      const page = await editeur();
      const couleurs = page.locator('.editeur-calques details.section', { hasText: 'Par couleur' });
      if (!(await couleurs.evaluate(e => (e as HTMLDetailsElement).open))) await couleurs.locator('> summary').click();
      await page.locator('.par-couleur .couleur-choix').first().click();
      await page.locator('.editeur-calques [aria-label^="Autres actions sur"]').first().click();
      await page.getByRole('menu').waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, couleurs des calques déployées, menu d’une couleur ouvert'));
    });

    it('avec toutes les sections du panneau du dessin ouvertes', async () => {
      const page = await editeur();
      await page.locator('.editeur-inspecteur details.section:not([open]) > summary').evaluateAll(l => l.forEach(e => (e as HTMLElement).click()));
      exigerSansViolationGrave(await auditer(page, 'éditeur, panneau du dessin, sections ouvertes'));
    });

    it('avec la bibliothèque chargée dans le panneau du dessin', async () => {
      const page = await editeur();
      await page.locator('.editeur-inspecteur details.section', { hasText: 'Bibliothèque de formes' }).locator('> summary').click();
      await page.getByRole('button', { name: /Charger la bibliothèque/ }).click();
      await page.locator('.editeur-inspecteur .vignette').first().waitFor({ timeout: 60_000 });
      exigerSansViolationGrave(await auditer(page, 'éditeur, bibliothèque chargée'));
    });

    it('avec l outil texte et son panneau', async () => {
      const page = await editeur();
      await page.keyboard.press('t');
      await page.locator('.editeur-inspecteur textarea, .editeur-inspecteur input[type=text]').first().waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, outil texte'));
    });

    it('avec la confirmation d abandon', async () => {
      const page = await editeur();
      await page.keyboard.press('PageDown');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByRole('alertdialog').waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, confirmation d’abandon'));
    });

    it('avec un outil de tracé et son réticule', async () => {
      const page = await editeur();
      await page.keyboard.press('p');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      exigerSansViolationGrave(await auditer(page, 'éditeur, plume et réticule'));
    });

    it('avec une forme masquée, une forme verrouillée et le curseur de sélection au clavier', async () => {
      const page = await editeur();
      await page.getByRole('button', { name: 'Masquer la forme 3', exact: true }).click();
      await page.getByRole('button', { name: 'Verrouiller la forme 4', exact: true }).click();
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('PageDown');
      await page.keyboard.press('Shift+PageDown');
      await attend(() => page.locator('.editeur-svg-toile path.focale').count()).toBe(1);
      exigerSansViolationGrave(await auditer(page, 'éditeur, calques masqué et verrouillé, curseur de sélection'));
    });

    it('avec un premier coin posé au clavier et son aperçu', async () => {
      const page = await editeur();
      await page.keyboard.press('r');
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      await attend(() => page.locator('.editeur-svg-toile path.trace-en-cours').count()).toBe(1);
      exigerSansViolationGrave(await auditer(page, 'éditeur, forme à deux coins en cours'));
    });

    it('avec une version gardée dans le panneau du dessin', async () => {
      const page = await editeur();
      await page.locator('.editeur-inspecteur details.section', { hasText: 'Versions nommées' }).locator('> summary').click();
      await page.getByRole('button', { name: 'Garder', exact: true }).click();
      await page.getByRole('button', { name: /^Supprimer la version/ }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, une version gardée'));
    });

    for (const [nom, bouton] of [['les calques', 'Calques'], ['l’inspecteur', 'Inspecteur']] as const) {
      it(`sur un téléphone de 420 px avec ${nom} ouverts`, async () => {
        const page = await editeur({ largeur: 420, hauteur: 860, tactile: true });
        await page.locator(`.editeur-etat button[aria-label="${bouton}"]`).tap();
        await attend(() => page.locator('.voile').count()).toBe(1);
        await attend(() => page.locator(bouton === 'Calques' ? '.editeur-calques' : '.editeur-inspecteur').evaluate(e => getComputedStyle(e).transform)).toBe('none');
        exigerSansViolationGrave(await auditer(page, `éditeur, 420 px tactile, ${nom} ouverts`));
      });
    }

    it('sur un téléphone de 420 px, fermé', async () => {
      const page = await editeur({ largeur: 420, hauteur: 860, tactile: true });
      exigerSansViolationGrave(await auditer(page, 'éditeur, 420 px tactile, tiroirs fermés'));
    });

    it('dans le thème sombre, avec une forme choisie', async () => {
      const page = await editeur({ schema: 'dark' });
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      exigerSansViolationGrave(await auditer(page, 'éditeur, thème sombre, une forme choisie'));
    });

    it('dans le thème sombre, avec un menu ouvert', async () => {
      const page = await editeur({ schema: 'dark' });
      await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
      await page.getByRole('menu', { name: 'Fichier' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, thème sombre, menu Fichier ouvert'));
    });

    it('avec la boîte « À propos et crédits » ouverte depuis le menu Fichier', async () => {
      const page = await editeur();
      await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
      await page.getByRole('menuitem', { name: 'À propos et crédits' }).click();
      await page.getByRole('dialog', { name: 'À propos et crédits' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, boîte À propos et crédits'));
    });

    it('dans le thème sombre, avec la boîte « À propos et crédits »', async () => {
      const page = await editeur({ schema: 'dark' });
      await page.locator('.menu-bouton', { hasText: 'Fichier' }).click();
      await page.getByRole('menuitem', { name: 'À propos et crédits' }).click();
      await page.getByRole('dialog', { name: 'À propos et crédits' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, thème sombre, boîte À propos et crédits'));
    });

    it('dans le thème sombre, sur l accueil', async () => {
      const page = await accueil({ schema: 'dark', largeur: 1200, hauteur: 900 });
      exigerSansViolationGrave(await auditer(page, 'accueil, thème sombre'));
    });
  });

  describe('la page d hôte de l embarquement', () => {
    it('hôte seul, puis avec l éditeur ouvert dessus', async () => {
      const { page } = await navigateur.ouvrir({ naviguer: false });
      await page.goto(URL_INTEGRATION);
      exigerSansViolationGrave(await auditer(page, 'page d’hôte de l’embarquement, éditeur fermé'));
      await page.locator('#editer').click();
      await page.locator('.editeur-svg .editeur-cadre').waitFor();
      exigerSansViolationGrave(await auditer(page, 'page d’hôte de l’embarquement, éditeur ouvert'));
    });

    it('éditeur ouvert, thème sombre, sur un téléphone', async () => {
      const { page } = await navigateur.ouvrir({ naviguer: false, schema: 'dark', largeur: 390, hauteur: 800, tactile: true });
      await page.goto(URL_INTEGRATION);
      await page.locator('#editer').tap();
      await page.locator('.editeur-svg .editeur-cadre').waitFor();
      exigerSansViolationGrave(await auditer(page, 'page d’hôte, éditeur ouvert, sombre, 390 px'));
    });
  });
});
