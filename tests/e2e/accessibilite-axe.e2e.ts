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
import { attend, boutonFichier, attendreAnimations, choisirVue, imageDeTest, ouvrirCode, ouvrirExemple, ouvrirMenu, permettrePressePapiers, pilote, RACINE_DEPOT, URL_INTEGRATION } from './aide.js';
import { champPolice, choisirPolice } from './polices.js';

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
  // Un texte coupe par le bas de la fenetre ou par le defilement d'un panneau est un « doute » pour axe (fond
  // indeterminable), pas un contraste : la fenetre prend la hauteur du contenu, page et panneaux, avant l'audit.
  // Agrandir la fenetre peut remettre en page (la visionneuse suit la largeur et la hauteur) : on recommence tant que la
  // hauteur du contenu bouge, trois fois au plus.
  for (let essai = 0; essai < 3; essai++) {
    const vue = page.viewportSize();
    if (!vue) break;
    await attendreAnimations(page);
    const hauteur = await page.evaluate(() => {
      const panneaux = [...document.querySelectorAll<HTMLElement>('.editeur-inspecteur, .editeur-calques')].map(e => e.scrollHeight - e.clientHeight);
      return Math.max(document.documentElement.scrollHeight, innerHeight + Math.max(0, ...panneaux));
    });
    if (hauteur <= vue.height) break;
    await page.setViewportSize({ width: vue.width, height: Math.min(4000, hauteur + 40) });
  }
  await attendreAnimations(page);
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

    // Un accueil par public (ADR-0024) : chaque etat de la question et chaque suite adaptee, clair et sombre, bureau et telephone.
    for (const [publicAccueil, nom] of [[undefined, 'question de la première visite'], ['machine', 'public machine'], ['retouche', 'public retouche'], ['integration', 'public intégration'], ['aucun', 'question passée']] as const) {
      for (const schema of ['light', 'dark'] as const) {
        it(`${nom}, thème ${schema === 'light' ? 'clair' : 'sombre'}`, async () => {
          const page = await accueil({ largeur: 1200, hauteur: 900, schema, ...(publicAccueil ? { publicAccueil } : {}) });
          await page.locator('#titre-suite').waitFor();
          exigerSansViolationGrave(await auditer(page, `accueil, ${nom}, ${schema === 'light' ? 'clair' : 'sombre'}`));
        });
      }
    }

    it('question rouverte par « Changer de public », le choix du moment marqué', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900, publicAccueil: 'machine' });
      await page.getByRole('button', { name: 'Changer de public' }).click();
      await page.locator('.publics .public.actuel').waitFor();
      exigerSansViolationGrave(await auditer(page, 'accueil, question rouverte'));
    });

    it('public intégration : code copié et SVG reçu de l’éditeur embarqué', async () => {
      const { page, contexte } = await navigateur.ouvrir({ largeur: 1200, hauteur: 900, publicAccueil: 'integration' });
      await permettrePressePapiers(page, contexte);
      await page.getByRole('button', { name: 'Copier le code' }).click();
      await page.getByRole('button', { name: 'Essayer l’éditeur embarqué' }).click();
      await page.locator('.editeur-cadre').waitFor();
      exigerSansViolationGrave(await auditer(page, 'accueil, éditeur embarqué de la démonstration'));
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      await page.keyboard.press('Delete');
      await page.getByRole('button', { name: 'Mettre à jour le logo', exact: true }).click();
      await page.locator('section.integration .message.neutre').waitFor();
      exigerSansViolationGrave(await auditer(page, 'accueil, intégration, SVG reçu'));
    });

    for (const [publicAccueil, nom] of [[undefined, 'question'], ['machine', 'public machine'], ['integration', 'public intégration']] as const) {
      it(`sur un téléphone de 390 px au doigt : ${nom}`, async () => {
        const page = await accueil({ largeur: 390, hauteur: 800, tactile: true, ...(publicAccueil ? { publicAccueil } : {}) });
        await page.locator('#titre-suite').waitFor();
        exigerSansViolationGrave(await auditer(page, `accueil, 390 px tactile, ${nom}`));
      });
    }

    it('voie « bibliothèque » chargée, avec ses vignettes', async () => {
      const page = await accueil({ largeur: 1200, hauteur: 900 });
      await page.getByRole('tab', { name: /^Bibliothèque/ }).click();
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
      await choisirVue(page, 'Prétraitée');
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

    // Le lisere de survol d'une forme (ADR-0029), en clair et en sombre : le pointeur reste pose sur la forme pendant l'audit.
    for (const schema of ['light', 'dark'] as const) {
      it('avec le lisere de survol d une forme (' + schema + ')', async () => {
        const page = await editeur({ schema });
        const centre = await page.locator('.editeur-svg-toile path[data-id="f2"]').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.mouse.move(centre.x, centre.y);
        await attend(() => page.locator('.editeur-svg-toile .lisere-survol').count()).toBe(1);
        exigerSansViolationGrave(await auditer(page, 'éditeur, liseré de survol (' + (schema === 'light' ? 'clair' : 'sombre') + ')'));
      });
    }

    // « Conserver les proportions » pose, puis coupe : le bouton bascule de « Position et taille » dans ses deux etats, clair et sombre.
    for (const schema of ['light', 'dark'] as const) {
      it('avec le verrou des proportions de « Position et taille » (' + schema + ')', async () => {
        const page = await editeur({ schema });
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        const verrou = page.getByRole('button', { name: 'Conserver les proportions' });
        await verrou.click();
        await attend(() => verrou.getAttribute('aria-pressed')).toBe('true');
        exigerSansViolationGrave(await auditer(page, 'éditeur, proportions conservées (' + (schema === 'light' ? 'clair' : 'sombre') + ')'));
        await verrou.click();
        await attend(() => verrou.getAttribute('aria-pressed')).toBe('false');
        exigerSansViolationGrave(await auditer(page, 'éditeur, proportions libres (' + (schema === 'light' ? 'clair' : 'sombre') + ')'));
      });
    }

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
      await page.getByRole('button', { name: 'Formes (F)' }).click();
      await page.getByRole('menu', { name: 'Formes' }).waitFor();
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
      await page.locator('.editeur-inspecteur .vignette').first().waitFor({ timeout: 60_000 });
      exigerSansViolationGrave(await auditer(page, 'éditeur, bibliothèque chargée'));
    });

    it('avec l outil texte et son panneau', async () => {
      const page = await editeur();
      await page.keyboard.press('t');
      await page.locator('.editeur-inspecteur textarea, .editeur-inspecteur input[type=text]').first().waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, outil texte'));
    });

    // Le texte vivant (ADR-0022) : la section « Texte » de l'inspecteur, l'apercu « forme / ligne » ouvert, la saisie en place.
    async function texteVivant(page: Page, police = 'inter') {
      await page.keyboard.press('t');
      await champPolice(page.locator('.editeur-inspecteur')).waitFor({ timeout: 30_000 });
      await choisirPolice(page.locator('.editeur-inspecteur'), police);
      await page.getByRole('button', { name: 'Ajouter le texte' }).click();
      await page.locator('.editeur-inspecteur details.section', { has: page.locator('summary', { hasText: 'Texte' }) }).waitFor();
      await page.locator('.editeur-inspecteur').getByRole('button', { name: 'Aperçu forme / ligne' }).first().click();
      await page.locator('.apercu-police').waitFor();
      // On audite l'etat au repos : le pointeur laisse le bouton (le survol d'un bouton discret est un voile cyan, juge ailleurs).
      await page.mouse.move(0, 0);
    }
    for (const schema of ['light', 'dark'] as const) {
      it(`avec un texte vivant, sa section Texte et l apercu forme / ligne ouvert (${schema})`, async () => {
        const page = await editeur({ largeur: 1200, hauteur: 900, schema });
        await texteVivant(page, schema === 'dark' ? 'ems-readability' : 'inter');
        exigerSansViolationGrave(await auditer(page, 'éditeur, texte vivant et aperçu (' + schema + ')'));
      });
    }

    // Les polices en ligne (ADR-0025) : « Toutes les polices » ouvert sur la vraie liste fenetree (l'index de dist/), avec ses
    // filtres et son pied ; puis une police non livree en cours de telechargement (la requete est retenue, jamais servie).
    async function toutesLesPolices(page: Page) {
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('t');
      await champPolice(page.locator('.editeur-inspecteur')).waitFor({ timeout: 30_000 });
      await page.locator('.editeur-inspecteur').getByRole('button', { name: 'Toutes les polices' }).click();
      await attend(() => page.locator('.explorateur-polices .polices-total').innerText()).toMatch(/polices$/);
      // Une recherche courte (« sat » : Satisfy, Satoshi et son badge ITF…) pour que chaque ligne tienne entiere dans la liste
      // qui defile : une ligne coupee par son bord n'a pas de fond qu'axe sache lire (« incomplete »), et ses pareilles visibles
      // sont jugees ici. Le fenetrage de la liste entiere a son propre test (tests/unit/model/cataloguePolices.test.ts).
      await page.locator('.explorateur-polices input[type="search"]').fill('sat');
      await attend(() => page.locator('.liste-polices .police-ligne').count()).toBe(4);
      await page.mouse.move(0, 0);
    }
    for (const schema of ['light', 'dark'] as const) {
      it(`avec « Toutes les polices » ouvert (${schema})`, async () => {
        const page = await editeur({ largeur: 1200, hauteur: 900, schema });
        await toutesLesPolices(page);
        exigerSansViolationGrave(await auditer(page, 'éditeur, toutes les polices (' + schema + ')'));
      });
    }

    it('avec une police en cours de téléchargement', async () => {
      const page = await editeur({ largeur: 1200, hauteur: 900 });
      // Aucun vrai reseau : la requete du fichier reste en suspens le temps de l'audit.
      await page.route(url => url.hostname === 'cdn.fontshare.com' || url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'fonts.bunny.net', () => undefined);
      await toutesLesPolices(page);
      await page.locator('.explorateur-polices input[type="search"]').fill('satoshi');
      await page.locator('.liste-polices .police-ligne', { hasText: 'Satoshi' }).first().click();
      await page.locator('.liste-polices .police-arrive').waitFor();
      await page.mouse.move(0, 0);
      exigerSansViolationGrave(await auditer(page, 'éditeur, police en cours de téléchargement'));
    });

    it('sur un téléphone de 390 px, « Toutes les polices » ouvert', async () => {
      const page = await editeur({ largeur: 390, hauteur: 800, tactile: true });
      await page.locator('.editeur-barre button[title^="Texte (T)"]').tap();
      await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
      await champPolice(page.locator('.editeur-inspecteur')).waitFor({ timeout: 30_000 });
      await page.locator('.editeur-inspecteur').getByRole('button', { name: 'Toutes les polices' }).tap();
      await attend(() => page.locator('.explorateur-polices .polices-total').innerText()).toMatch(/polices$/);
      await page.locator('.explorateur-polices input[type="search"]').fill('sat');
      await attend(() => page.locator('.liste-polices .police-ligne').count()).toBe(4);
      exigerSansViolationGrave(await auditer(page, 'éditeur, 390 px, toutes les polices'));
    });

    // La liste deroulante des polices (ADR-0034), ouverte sur le vrai catalogue : ses groupes, les noms dessines, la marque
    // « à télécharger », la ligne active et son pied. Des recherches courtes, pour que chaque ligne tienne entiere dans la liste qui
    // defile (une ligne coupee par son bord n'a pas de fond qu'axe sache lire) : « cave » (Caveat, livree, sans marque ; Caveat Brush,
    // du catalogue, marquee), puis « sat » (Satoshi et son badge ITF).
    async function listeDesPolices(page: Page, zone: string, tactile = false) {
      const z = page.locator(zone);
      const champ = champPolice(z);
      await champ.waitFor({ timeout: 30_000 });
      if (tactile) await champ.tap(); else await champ.click();
      await attend(() => page.locator('.liste-polices-pied p').first().innerText()).toMatch(/polices$/);
      await page.mouse.move(0, 0);
    }
    for (const schema of ['light', 'dark'] as const) {
      it(`avec la liste deroulante des polices ouverte, puis une recherche (${schema})`, async () => {
        const page = await editeur({ largeur: 1200, hauteur: 900, schema });
        await page.locator('.editeur-svg-toile').focus();
        await page.keyboard.press('t');
        await listeDesPolices(page, '.editeur-inspecteur');
        await page.keyboard.type('cave');
        await attend(() => page.locator('[role="listbox"] [role="option"]').count()).toBe(2);
        expect(await page.locator('[role="listbox"] [role="option"][data-etat="a-telecharger"]').count()).toBe(1);
        exigerSansViolationGrave(await auditer(page, 'éditeur, liste des polices ouverte (' + schema + ')'));
        await page.keyboard.press('Control+a');
        await page.keyboard.type('sat');
        await attend(() => page.locator('[role="listbox"] [role="option"]').count()).toBe(4);
        exigerSansViolationGrave(await auditer(page, 'éditeur, liste des polices, recherche (' + schema + ')'));
      });
    }

    it('sur un téléphone de 390 px, la liste des polices de la barre de texte ouverte en feuille', async () => {
      const page = await editeur({ largeur: 390, hauteur: 800, tactile: true });
      await page.locator('.editeur-barre button[title^="Texte (T)"]').tap();
      await listeDesPolices(page, '.barre-texte', true);
      await page.keyboard.type('sat');
      await attend(() => page.locator('[role="listbox"] [role="option"]').count()).toBe(4);
      exigerSansViolationGrave(await auditer(page, 'éditeur, 390 px, liste des polices de la barre'));
    });

    it('avec la saisie en place d un texte vivant', async () => {
      const page = await editeur({ largeur: 1200, hauteur: 900 });
      await texteVivant(page);
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('Enter');
      await page.locator('textarea.saisie-champ').waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, saisie en place'));
    });

    // Le texte sur la toile (ADR-0027) : la saisie ouverte (cadre, curseur, champ invisible), la barre de texte et son trace
    // Median, dans les deux themes ; a 390 px, la barre resserree et son menu ouvert.
    for (const schema of ['light', 'dark'] as const) {
      it(`avec la saisie sur la toile et la barre de texte, trace Median (${schema})`, async () => {
        const page = await editeur({ largeur: 1200, hauteur: 900, schema });
        await page.keyboard.press('t');
        await champPolice(page.locator('.editeur-inspecteur')).waitFor({ timeout: 30_000 });
        const r = await page.locator('.editeur-svg-toile .plan-travail').boundingBox();
        await page.mouse.click((r?.x ?? 0) + 40, (r?.y ?? 0) + (r?.height ?? 0) / 2);
        await page.keyboard.type('Bonjour');
        await page.locator('.barre-texte').getByRole('button', { name: 'Médian' }).click();
        await page.locator('textarea.saisie-champ').focus();
        await page.keyboard.press('Shift+Home');
        await page.mouse.move(0, 0);
        exigerSansViolationGrave(await auditer(page, 'éditeur, saisie sur la toile et barre de texte (' + schema + ')'));
        await page.keyboard.press('Escape');
        exigerSansViolationGrave(await auditer(page, 'éditeur, barre de texte d un texte choisi (' + schema + ')'));
      });
    }

    it('sur un téléphone de 390 px, la barre de texte resserree et son menu', async () => {
      const page = await editeur({ largeur: 390, hauteur: 800, tactile: true });
      await page.locator('.editeur-barre button[title^="Texte (T)"]').tap();
      const r = await page.locator('.editeur-svg-toile .plan-travail').boundingBox();
      await page.touchscreen.tap((r?.x ?? 0) + 20, (r?.y ?? 0) + (r?.height ?? 0) / 2);
      await page.locator('textarea.saisie-champ').waitFor();
      await page.keyboard.type('Salut');
      await page.locator('.barre-texte').getByRole('button', { name: /^Plus de réglages du texte/ }).tap();
      await page.locator('.barre-texte .menu-panneau').waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, 390 px, barre de texte et son menu'));
    });

    it('sur un téléphone de 390 px, l inspecteur d un texte vivant et son apercu', async () => {
      const page = await editeur({ largeur: 390, hauteur: 800, tactile: true });
      await page.locator('.editeur-barre button[title^="Texte (T)"]').tap();
      await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
      await champPolice(page.locator('.editeur-inspecteur')).waitFor({ timeout: 30_000 });
      await page.getByRole('button', { name: 'Ajouter le texte' }).tap();
      await page.locator('.editeur-inspecteur').getByRole('button', { name: 'Aperçu forme / ligne' }).first().tap();
      await page.locator('.apercu-police').waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, 390 px, texte vivant et aperçu'));
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

    for (const schema of ['light', 'dark'] as const) {
      it(`sur un téléphone de 390 px, menu « Plus » ouvert (${schema})`, async () => {
        const page = await editeur({ largeur: 390, hauteur: 800, tactile: true, schema });
        await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
        await page.getByRole('menu', { name: 'Fichier' }).waitFor();
        exigerSansViolationGrave(await auditer(page, `éditeur, 390 px tactile, menu Plus ouvert, ${schema}`));
      });
    }

    for (const schema of ['light', 'dark'] as const) {
      it(`sur un téléphone de 390 px, rangée de sélection resserrée et son menu « Plus » ouvert (${schema})`, async () => {
        const page = await editeur({ largeur: 390, hauteur: 800, tactile: true, schema });
        await page.locator('.editeur-svg-toile path[data-id="f2"]').tap();
        await page.locator('.editeur-barre-selection').getByRole('button', { name: /^Plus de gestes/ }).tap();
        await page.getByRole('menu', { name: 'Empiler' }).waitFor();
        exigerSansViolationGrave(await auditer(page, `éditeur, 390 px tactile, rangée de sélection et son menu, ${schema}`));
      });

      it(`avec « aucun » remplissage choisi, en contexte Cricut, « Terminer » posé en secondaire (${schema})`, async () => {
        // Sans menu ouvert : un menu flottant recouvre l'inspecteur, dont axe ne saurait plus lire les fonds (le menu Fichier ouvert est
        // audite ailleurs ; ici, ce qui compte est le contraste de l'action retiree et de « aucun » choisi). Un grand dessin : sur le
        // petit exemple, le gabarit du tapis deborde de la toile en geometrie, et axe le croit par-dessus la barre d'etat (deja vrai avant).
        const page = await accueil({ schema });
        await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 700"><path d="M96 96H288V288H96Z" fill="#c81e28"/><path d="M384 96H576V288H384Z" fill="#1428a0"/></svg>');
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        await page.locator('.pastille-style button.aucun').first().click();
        await page.locator('.selecteur-contexte .menu-bouton').click();
        await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
        await page.locator('.panneau-cricut .constat, .panneau-cricut .pret').first().waitFor();
        exigerSansViolationGrave(await auditer(page, `éditeur, aucun remplissage, Cricut, Terminer en secondaire, ${schema}`));
      });

      it(`sur l accueil après « Terminer », avec le message neutre et la fiche (${schema})`, async () => {
        const page = await editeur({ schema });
        await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
        await page.keyboard.press('Delete');
        await page.locator('.editeur-barre .groupe.fin button.primaire').click();
        await page.locator('main.accueil > p.message.neutre[role="status"]').waitFor();
        exigerSansViolationGrave(await auditer(page, `accueil, message neutre après enregistrement, ${schema}`));
        // Le menu « Autres formats » de la fiche est le meme contenu que celui de l'editeur, audite plus bas. Ouvert sur l'accueil, son
        // panneau fixe chevauche les voies de la page, et axe ne sait plus lire le fond de chaque ligne (« partially overlaps ») : un doute
        // de mesure, pas de contraste, qu'on ne contourne pas en l'admettant.
      });

      it(`avec « Autres formats » ouvert dans l éditeur (${schema})`, async () => {
        const page = await editeur({ schema });
        await ouvrirMenu(page, 'Autres formats');
        await page.locator('.menu-panneau .contenu-export').waitFor();
        exigerSansViolationGrave(await auditer(page, `éditeur, Autres formats ouvert, ${schema}`));
      });

      it(`en contexte Cricut, la confirmation d un export à corriger puis la carte « Dans Design Space » (${schema})`, async () => {
        // Un grand dessin, comme plus haut ; la fenetre prend la hauteur de l'inspecteur, pour qu'axe juge chaque texte entier et non une
        // position de defilement (un texte a demi cache est un doute pour lui).
        const page = await accueil({ schema });
        await ouvrirCode(page, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 700"><path d="M96 96H288V288H96Z" fill="#c81e28"/><path d="M384 96L576 96L480 288" fill="#1428a0"/></svg>');
        await page.locator('.selecteur-contexte .menu-bouton').click();
        await page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' }).click();
        const exporter = page.locator('.panneau-cricut .export-cricut button.primaire');
        await attend(() => exporter.innerText()).toMatch(/^Exporter quand même/);
        await exporter.click();
        await page.locator('.panneau-cricut .confirmation-export').waitFor();
        const grandir = async () => {
          const h = await page.evaluate(() => { const i = document.querySelector('.editeur-inspecteur'); return i ? Math.ceil(i.scrollHeight - i.clientHeight + innerHeight) : innerHeight; });
          await page.setViewportSize({ width: 1400, height: Math.min(4000, Math.max(900, h + 40)) });
        };
        await grandir();
        exigerSansViolationGrave(await auditer(page, `éditeur, Cricut, confirmation d’export, ${schema}`));
        await Promise.all([page.waitForEvent('download'), page.locator('.panneau-cricut .confirmation-export').getByRole('button', { name: 'Exporter quand même' }).click()]);
        await page.locator('.panneau-cricut .carte-design-space').waitFor();
        await grandir();
        exigerSansViolationGrave(await auditer(page, `éditeur, Cricut, carte Dans Design Space, ${schema}`));
      });
    }

    it('dans le thème sombre, avec une forme choisie', async () => {
      const page = await editeur({ schema: 'dark' });
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      await attend(() => page.locator('.editeur-barre-selection').count()).toBe(1);
      exigerSansViolationGrave(await auditer(page, 'éditeur, thème sombre, une forme choisie'));
    });

    it('dans le thème sombre, avec un menu ouvert', async () => {
      const page = await editeur({ schema: 'dark' });
      await boutonFichier(page).click();
      await page.getByRole('menu', { name: 'Fichier' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, thème sombre, menu Fichier ouvert'));
    });

    it('avec la boîte « À propos et crédits » ouverte depuis le menu Fichier', async () => {
      const page = await editeur();
      await boutonFichier(page).click();
      await page.getByRole('menuitem', { name: 'À propos et crédits' }).click();
      await page.getByRole('dialog', { name: 'À propos et crédits' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, boîte À propos et crédits'));
    });

    it('dans le thème sombre, avec la boîte « À propos et crédits »', async () => {
      const page = await editeur({ schema: 'dark' });
      await boutonFichier(page).click();
      await page.getByRole('menuitem', { name: 'À propos et crédits' }).click();
      await page.getByRole('dialog', { name: 'À propos et crédits' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, thème sombre, boîte À propos et crédits'));
    });

    // L'accueil guide (ADR-0019) : la bulle de la visite a chaque moment qui compte, les reperes et les etats vides.
    async function visite(options: Parameters<typeof navigateur.ouvrir>[0] = {}) {
      const page = await accueil(options);
      const essayer = page.getByRole('button', { name: 'Essayer avec la visite guidée' });
      if (options.tactile) await essayer.tap(); else await essayer.click();
      await page.locator('.bulle-visite').waitFor();
      return page;
    }

    it('à chaque étape de la visite guidée, menée par les vrais gestes (bulle et filet de la cible)', async () => {
      const page = await visite();
      const etape = (n: number) => page.locator('.bulle-progression', { hasText: 'Étape ' + n + ' sur 5' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, visite guidée, étape 1'));
      await page.locator('.editeur-svg-toile path[data-id="f2"]').click();
      await etape(2);
      exigerSansViolationGrave(await auditer(page, 'éditeur, visite guidée, étape 2'));
      await page.locator('.editeur-barre input[type=color][aria-label="Remplissage"]').fill('#1f8a3a');
      await etape(3);
      exigerSansViolationGrave(await auditer(page, 'éditeur, visite guidée, étape 3'));
      await page.locator('.bulle-visite').getByRole('button', { name: 'Suivant' }).click();
      await etape(4);
      exigerSansViolationGrave(await auditer(page, 'éditeur, visite guidée, étape 4'));
      // L'etape 4 vise le bouton Fichier ; le menu ouvert, « Télécharger le SVG » en tete, est audite aussi.
      await boutonFichier(page).click();
      exigerSansViolationGrave(await auditer(page, 'éditeur, visite guidée, étape 4, menu Fichier ouvert'));
      await Promise.all([page.waitForEvent('download'), page.locator('.menu-panneau').getByRole('menuitem', { name: 'Télécharger le SVG', exact: true }).click()]);
      await etape(5);
      exigerSansViolationGrave(await auditer(page, 'éditeur, visite guidée, étape 5'));
    });

    it('à la fin de la visite guidée, ses trois suites, dans le thème sombre', async () => {
      const page = await visite({ schema: 'dark' });
      for (let i = 0; i < 4; i++) await page.locator('.bulle-visite').getByRole('button', { name: 'Suivant' }).click();
      await page.locator('.bulle-progression', { hasText: 'Étape 5 sur 5' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, visite guidée, fin, sombre'));
    });

    it('sur un téléphone de 390 px, la bulle de la visite ouverte', async () => {
      const page = await visite({ largeur: 390, hauteur: 800, tactile: true });
      exigerSansViolationGrave(await auditer(page, 'éditeur, 390 px tactile, visite guidée'));
    });

    it('avec la boîte « Raccourcis clavier » du menu Aide', async () => {
      const page = await editeur();
      await page.locator('.editeur-barre .menu-aide .menu-bouton').click();
      await page.getByRole('menuitem', { name: 'Raccourcis clavier' }).click();
      await page.getByRole('dialog', { name: 'Raccourcis clavier' }).waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, boîte Raccourcis clavier'));
    });

    it('avec le repère des points, au premier double-clic sur une forme', async () => {
      const page = await editeur();
      await page.locator('.editeur-svg-toile path[data-id="f3"]').dblclick();
      await page.locator('.repere[data-repere="points"]').waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, repère des points'));
    });

    // Au bureau, le gabarit du tapis Cricut deborde de la toile (il est plus grand que le dessin) et axe, qui lit les boites des
    // formes SVG sans leur rognure, le croit sur la barre d'etat : un doute qui ne tient pas au repere. Le repere Cricut est audite
    // dans le tiroir d'un telephone, ou le dessin (gabarit compris) est masque sous le tiroir ouvert.
    it('sur un téléphone de 390 px, le repère du contexte Cricut dans le tiroir de l’inspecteur', async () => {
      const page = await editeur({ largeur: 390, hauteur: 800, tactile: true });
      await page.getByRole('button', { name: /^Plus d’actions/ }).tap();
      const cricut = page.getByRole('menuitemradio', { name: 'Cricut Maker (Maker / Maker 3)' });
      await cricut.scrollIntoViewIfNeeded();
      await cricut.tap();
      await page.locator('.editeur-etat button[aria-label="Inspecteur"]').tap();
      await page.locator('.repere[data-repere="cricut"]').waitFor();
      await attend(() => page.locator('.editeur-inspecteur').evaluate(e => getComputedStyle(e).transform)).toBe('none');
      exigerSansViolationGrave(await auditer(page, 'éditeur, 390 px tactile, repère Cricut'));
    });

    it('avec un dessin vidé : les états vides des calques, de l’inspecteur et de la toile', async () => {
      const page = await editeur();
      await page.locator('.editeur-svg-toile').focus();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await page.locator('.toile-vide').waitFor();
      exigerSansViolationGrave(await auditer(page, 'éditeur, dessin vidé, états vides'));
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
