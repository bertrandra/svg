// Le partage des projets du site PHP (ADR-0043), dans un vrai navigateur, contre le serveur de tests/e2e/site.ts : la titulaire
// ouvre « Partager » dans la ligne d'un projet (le focus sur l'adresse, une adresse inconnue refusee avec la phrase du serveur),
// partage en lecture puis envoie une copie (les mails partent, la ligne dit « Partagé avec 1 personne », Echap rend le focus) ; le
// destinataire voit la copie dans ses projets (« Reçu de … ») et le projet partage sous « Partagés avec moi », l'ouvre en lecture
// (modifie, « Enregistrer une copie » en fait un projet a lui, l'original ne bouge pas), puis le retire de sa liste. axe sur chaque
// ecran.
//
//   npm run construire   (le test ouvre dist/php, il ne construit rien ; PHP 8.1 ou plus doit etre installe)

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { request, type Page } from 'playwright';
import { aLeFocus, attend, ouvrirMenu, pilote, texteDe, textesDe } from './aide.js';
import { siteDesTests } from './site.js';

const s = siteDesTests();

const projetMinimal = (nom: string) => ({
  format: 'editeur-svg/projet', version: 1, nom,
  dessin: { vb: [0, 0, 100, 80], formes: [{ id: 'f1', d: 'M10 10L90 10L50 70Z', remplissage: '#c81e28', contour: null, epaisseur: 1, opacite: 1, regle: 'nonzero', visible: true, verrouille: false }] },
  production: { contexte: 'generique' }, nuancier: [], ressources: { polices: [], images: [] }
});

const csrfDe = async (page: Page): Promise<string> => (await page.locator('#site').getAttribute('data-csrf')) ?? '';

/** L'administrateur connecte sur `page` cree un compte actif ; rend son identifiant. */
async function creerUtilisateur(page: Page, email: string, nom: string, mot: string): Promise<string> {
  const r = await page.request.post(s.site + '/api.php?r=compte-creer', { headers: { 'X-CSRF': await csrfDe(page) }, data: { email, nom, langue: 'fr', motDePasse: mot } });
  expect(r.status(), await r.text()).toBe(200);
  return ((await r.json()) as { compte: { id: string } }).compte.id;
}

/** Un projet enregistre sous ce compte, hors navigateur ; rend son identifiant. */
async function projetDe(email: string, mot: string, nom: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: s.site + '/' });
  try {
    const csrf = /name="csrf" value="([a-f0-9]{64})"/.exec(await (await ctx.get('index.php')).text())?.[1] ?? '';
    expect((await ctx.post('index.php', { form: { action: 'connexion', csrf, email, mot_de_passe: mot }, maxRedirects: 0 })).status()).toBe(303);
    const jeton = ((await (await ctx.get('api.php?r=jeton')).json()) as { csrf: string }).csrf;
    const p = await ctx.post('api.php?r=enregistrer', { headers: { 'X-CSRF': jeton }, data: { projet: projetMinimal(nom) } });
    expect(p.status(), await p.text()).toBe(200);
    return ((await p.json()) as { meta: { id: string } }).meta.id;
  } finally {
    await ctx.dispose();
  }
}

const message = (page: Page) => texteDe(page.locator('main > .message'));
const etat = (page: Page) => texteDe(page.locator('.editeur-etat .etat-enregistrement'));
const mesProjets = (page: Page) => page.locator('.projets:not(.projets-recus) .liste-projets');
const recus = (page: Page) => page.locator('.projets-recus');

describe('le partage des projets du site', () => {
  const navigateur = pilote({ coopIgnoreeParFirefox: true });

  it('partager en lecture et envoyer une copie ; le destinataire voit, ouvre en lecture, garde une copie, retire de sa liste', async () => {
    s.oublierEssais();
    const { page, requetes, erreurs } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    await creerUtilisateur(page, 'fanny@exemple.org', 'Fanny', 'le mot de passe de Fanny');
    const idGael = await creerUtilisateur(page, 'gael@exemple.org', 'Gaël', 'le mot de passe de Gaël');
    const idProjet = await projetDe('fanny@exemple.org', 'le mot de passe de Fanny', 'Affiche');
    await s.seDeconnecter(page);

    // La titulaire : le panneau s'ouvre dans la ligne, le focus sur l'adresse.
    await s.connecter(page, 'fanny@exemple.org', 'le mot de passe de Fanny');
    expect(await recus(page).count(), 'rien de partage avec Fanny : pas de section').toBe(0);
    const ligne = mesProjets(page).locator('.projet', { has: page.getByRole('button', { name: 'Affiche', exact: true }) });
    const partager = ligne.getByRole('button', { name: 'Partager « Affiche »' });
    await partager.click();
    expect(await partager.getAttribute('aria-expanded')).toBe('true');
    const panneau = page.getByRole('group', { name: 'Partager « Affiche »' });
    const adresse = panneau.getByLabel('Adresse de la personne');
    await attend(() => aLeFocus(adresse)).toBe(true);
    await attend(() => texteDe(panneau.locator('.aide').last())).toBe('Personne pour l’instant.');
    await adresse.fill('personne@exemple.org');
    await panneau.getByRole('button', { name: 'Partager en lecture' }).click();
    await attend(() => message(page)).toBe('Aucun compte actif ne porte cette adresse sur ce site.');
    expect(await adresse.inputValue(), 'l adresse reste a corriger').toBe('personne@exemple.org');

    await adresse.fill('Gael@Exemple.org');
    await panneau.getByRole('button', { name: 'Partager en lecture' }).click();
    await attend(() => message(page)).toBe('« Affiche » est partagé en lecture avec Gaël. Un mail lui a été envoyé.');
    await attend(() => textesDe(panneau.locator('.liste-partages .partage-personne'))).toEqual(['Gaël gael@exemple.org']);
    expect(await adresse.inputValue()).toBe('');
    expect(s.dernierMail('gael@exemple.org')?.sujet).toBe('Fanny partage « Affiche » avec vous — Éditeur SVG');
    await attend(() => texteDe(ligne.locator('.projet-infos > .aide'))).toMatch(/· Partagé avec 1 personne$/);
    await s.sansViolationGrave(page, 'le panneau Partager');

    await adresse.fill('gael@exemple.org');
    await panneau.getByRole('button', { name: 'Envoyer une copie' }).click();
    await attend(() => message(page)).toBe('Une copie de « Affiche » est dans les projets de Gaël. Un mail lui a été envoyé.');
    expect(s.dernierMail('gael@exemple.org')?.sujet).toBe('Fanny vous envoie « Affiche » — Éditeur SVG');
    await adresse.press('Escape');
    await panneau.waitFor({ state: 'detached' });
    await attend(() => aLeFocus(partager)).toBe(true);
    await s.seDeconnecter(page);

    // Le destinataire : la copie est a lui, le projet partage se lit a part.
    await s.connecter(page, 'gael@exemple.org', 'le mot de passe de Gaël');
    await attend(() => textesDe(mesProjets(page).locator('.projet-nom'))).toEqual(['Affiche']);
    expect(await texteDe(mesProjets(page).locator('.projet-infos > .aide'))).toMatch(/· Reçu de Fanny$/);
    await recus(page).waitFor();
    expect(await texteDe(recus(page).getByRole('heading', { level: 2 }))).toBe('Partagés avec moi 1');
    const recu = recus(page).locator('.projet');
    expect(await texteDe(recu.locator('.projet-infos > .aide'))).toMatch(/^Partagé par Fanny · modifié le /);
    await s.sansViolationGrave(page, 'Partagés avec moi');

    await recu.getByRole('button', { name: 'Ouvrir « Affiche »' }).click();
    await page.locator('.editeur-cadre').waitFor();
    await attend(() => etat(page)).toBe('Enregistré');
    // Rien a perdre tant qu'on ne modifie rien : le bouton attend une modification, qui s'enregistrera dans une copie.
    const copie = page.getByRole('button', { name: 'Enregistrer une copie' });
    expect(await copie.getAttribute('aria-disabled')).toBe('true');
    await page.locator('.editeur-svg-toile').focus();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('ArrowRight');
    await attend(() => etat(page)).toBe('Modifications non enregistrées');
    await copie.click();
    await attend(() => page.locator('.editeur-titre').innerText()).toBe('Affiche (copie)');
    await attend(() => etat(page)).toBe('Enregistré');
    expect(await page.getByRole('button', { name: 'Enregistrer une copie' }).count(), 'le travail est devenu le sien').toBe(0);
    await ouvrirMenu(page, 'Fichier');
    await page.getByRole('menuitem', { name: 'Fermer l’éditeur' }).click();
    await page.locator('.editeur-cadre').waitFor({ state: 'detached' });
    await attend(() => textesDe(mesProjets(page).locator('.projet-nom')).then(n => [...n].sort())).toEqual(['Affiche', 'Affiche (copie)']);
    // L'original de Fanny n'a pas bouge : revision 1, dans son dossier.
    const meta = JSON.parse(readFileSync(s.donnees('projets/' + s.idDuCompte('fanny@exemple.org') + '/' + idProjet + '.meta.json'), 'utf8')) as { revision: number };
    expect(meta.revision).toBe(1);

    // Retirer de sa liste, apres confirmation dans la ligne : la section disparait, Fanny ne partage plus avec Gael.
    await recu.getByRole('button', { name: 'Retirer de ma liste « Affiche »' }).click();
    const groupe = page.getByRole('group', { name: 'Retirer de ma liste « Affiche »' });
    await attend(() => aLeFocus(groupe.getByRole('button', { name: 'Retirer', exact: true }))).toBe(true);
    await groupe.getByRole('button', { name: 'Retirer', exact: true }).click();
    await attend(() => message(page)).toBe('« Affiche » est retiré de votre liste.');
    await attend(() => recus(page).count()).toBe(0);
    const partages = JSON.parse(readFileSync(s.donnees('partages.json'), 'utf8')) as { partages: Array<{ destinataire: string }> };
    expect(partages.partages.filter(p => p.destinataire === idGael)).toEqual([]);
    expect(requetes.filter(u => !u.startsWith(s.site + '/')), 'la page ne contacte que le site').toEqual([]);
    // Le refus de l'adresse inconnue (404) s'ecrit dans la console du navigateur de lui-meme : ce n'est pas la page.
    const restent = erreurs.filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e));
    erreurs.length = 0;
    erreurs.push(...restent);
  });
});
