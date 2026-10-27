// Les ecrans des comptes du site PHP (ADR-0041 §4 et §5), dans un vrai navigateur, contre le serveur de tests/e2e/site.ts : le menu
// du profil (en-tete, elements selon le role, clavier), « Mon profil » (nom, mot de passe avec ses erreurs liees aux champs,
// langue), l'ecran « Comptes » d'un administrateur (une inscription par le formulaire PHP, confirmee par le lien du mail, approuvee
// ou refusee avec sa raison, suspendue, promue, son adresse changee, supprimee avec ses projets, un compte cree a la main, les etats
// vides, axe sur chaque onglet), « Réglages du site » (config.json relu sur le disque, SMTP, mail d'essai, inscriptions fermees),
// les projets bornes au compte, et la page dont `data-compte` ne se lit pas. Le courrier est en mode fichier : chaque mail se lit dans
// data/journal/courrier.
//
//   npm run construire   (le test ouvre dist/php, il ne construit rien ; PHP 8.1 ou plus doit etre installe)

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { request, type Locator, type Page } from 'playwright';
import { aLeFocus, attend, pilote, texteDe, textesDe } from './aide.js';
import { ADMIN_EMAIL, CONFIG_ESSAI, siteDesTests } from './site.js';

const s = siteDesTests();

/** Un projet minimal, tel que l'API l'accepte : de quoi donner des projets a un compte sans ouvrir l'editeur. */
const projetMinimal = (nom: string) => ({
  format: 'editeur-svg/projet', version: 1, nom,
  dessin: { vb: [0, 0, 100, 80], formes: [{ id: 'f1', d: 'M10 10L90 10L50 70Z', remplissage: '#c81e28', contour: null, epaisseur: 1, opacite: 1, regle: 'nonzero', visible: true, verrouille: false }] },
  production: { contexte: 'generique' }, nuancier: [], ressources: { polices: [], images: [] }
});

/** Le jeton CSRF de la page de l'application. */
const csrfDe = async (page: Page): Promise<string> => (await page.locator('#site').getAttribute('data-csrf')) ?? '';

/** Une ecriture de l'API depuis la page connectee (le jeton de la page, le cookie du contexte). */
async function ecrireApi(page: Page, route: string, corps: unknown): Promise<{ statut: number; corps: unknown }> {
  const r = await page.request.post(s.site + '/api.php?r=' + route, { headers: { 'X-CSRF': await csrfDe(page) }, data: corps });
  return { statut: r.status(), corps: await r.json().catch(() => null) };
}

/** L'administrateur connecte sur `page` cree un compte actif (ADR-0041, « Créer un compte… » par l'API) ; rend son identifiant. */
async function creerUtilisateur(page: Page, email: string, nom: string, mot: string): Promise<string> {
  const r = await ecrireApi(page, 'compte-creer', { email, nom, langue: 'fr', motDePasse: mot });
  expect(r.statut, JSON.stringify(r.corps)).toBe(200);
  return (r.corps as { compte: { id: string } }).compte.id;
}

/** Un client HTTP connecte sous ce compte, hors navigateur : de quoi poser l'etat d'un scenario (ses projets). */
async function clientConnecte(email: string, mot: string) {
  const ctx = await request.newContext({ baseURL: s.site + '/' });
  const page = await (await ctx.get('index.php')).text();
  const csrf = /name="csrf" value="([a-f0-9]{64})"/.exec(page)?.[1] ?? '';
  const r = await ctx.post('index.php', { form: { action: 'connexion', csrf, email, mot_de_passe: mot }, maxRedirects: 0 });
  expect(r.status(), 'connexion de ' + email).toBe(303);
  const jeton = ((await (await ctx.get('api.php?r=jeton')).json()) as { csrf: string }).csrf;
  return {
    ctx,
    async creerProjet(nom: string): Promise<string> {
      const p = await ctx.post('api.php?r=enregistrer', { headers: { 'X-CSRF': jeton }, data: { projet: projetMinimal(nom) } });
      expect(p.status(), await p.text()).toBe(200);
      return ((await p.json()) as { meta: { id: string } }).meta.id;
    },
    fermer: () => ctx.dispose()
  };
}

/** Une inscription par le formulaire PHP, puis la confirmation par le lien du mail : le compte est « en attente ». */
async function inscrireEtConfirmer(page: Page, email: string, nom: string, mot: string): Promise<void> {
  await page.goto(s.site + '/index.php');
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await page.getByRole('heading', { name: 'Créer un compte' }).waitFor();
  await page.getByLabel('Adresse de courrier').fill(email);
  await page.getByLabel('Votre nom').fill(nom);
  await page.getByLabel('Mot de passe', { exact: true }).fill(mot);
  await page.getByLabel('Le même, de nouveau').fill(mot);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await page.getByRole('heading', { name: 'Message envoyé' }).waitFor();
  const jeton = s.jetonDuMail(s.dernierMail(email), 'confirmer');
  expect(jeton, 'le mail de confirmation de ' + email).not.toBe('');
  await page.goto(s.site + '/index.php?confirmer=' + jeton);
  await page.getByRole('heading', { name: 'Adresse confirmée' }).waitFor();
}

const boutonProfil = (page: Page) => page.getByRole('button', { name: /^Compte : / });
const onglet = (page: Page, nom: string) => page.getByRole('tab', { name: new RegExp('^' + nom + ' \\d+$') });
const nombreOnglet = async (page: Page, nom: string) => Number(/(\d+)$/.exec(await texteDe(onglet(page, nom)))?.[1]);
const ligneCompte = (page: Page, nom: string) => page.locator('.liste-comptes .compte', { has: page.locator('.compte-nom > strong').filter({ hasText: new RegExp('^' + nom + '$') }) });
const bouton = (ligne: Locator, action: string, nom: string) => ligne.getByRole('button', { name: action + ' « ' + nom + ' »', exact: true });
/** Le message de l'ecran (comptes, reglages, projets), au-dessus de la carte. */
const message = (page: Page) => texteDe(page.locator('main > .message'));
const titreVide = (page: Page) => texteDe(page.locator('[role="tabpanel"] .etat-vide-titre'));

/** Ouvre le menu du profil puis un de ses elements, et attend l'ecran nomme. */
async function ouvrirEcran(page: Page, element: RegExp, titre: string): Promise<void> {
  await boutonProfil(page).click();
  await page.getByRole('menuitem', { name: element }).click();
  await page.getByRole('heading', { name: titre, level: 1 }).waitFor();
}

/** Confirme un geste dans la ligne : le bouton, puis « Confirmer » (le libelle du geste) dans le groupe nomme ; attend le message. */
async function confirmer(page: Page, ligne: Locator, action: string, nom: string, remplir?: (groupe: Locator) => Promise<void>): Promise<void> {
  await bouton(ligne, action + '…', nom).click();
  const groupe = page.getByRole('group', { name: action + ' « ' + nom + ' »' });
  await groupe.waitFor();
  if (remplir) await remplir(groupe);
  await groupe.getByRole('button', { name: action, exact: true }).click();
  await groupe.waitFor({ state: 'detached' });
}

/** Le champ nomme d'un formulaire du site, et l'erreur qui lui est liee (aria-describedby), ou '' sans erreur. */
async function erreurDuChamp(page: Page, libelle: string): Promise<{ invalide: boolean; texte: string }> {
  const champ = page.getByLabel(libelle, { exact: true });
  const id = await champ.getAttribute('aria-describedby');
  const note = id ? page.locator('[id="' + id + '"]') : null;
  const texte = note && (await note.count()) ? await texteDe(note) : '';
  return { invalide: (await champ.getAttribute('aria-invalid')) === 'true', texte };
}

const config = () => JSON.parse(readFileSync(s.donnees('config/config.json'), 'utf8')) as typeof CONFIG_ESSAI;

describe('les comptes du site PHP', () => {
  const navigateur = pilote({ coopIgnoreeParFirefox: true });

  it('l ecran Comptes : inscription confirmee → en attente (pastille), approuver, refuser avec raison, suspendre, promouvoir, adresse, supprimer avec ses projets, creer ; etats vides ; axe', async () => {
    s.oublierEssais();
    const { page } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    const { page: autre } = await s.ouvrirSite(navigateur);
    await boutonProfil(page).click();
    expect(await textesDe(page.getByRole('menu').getByRole('menuitem'))).toEqual(['Mon profil…', 'Comptes', 'Réglages du site…', 'Se déconnecter']);
    await page.getByRole('menuitem', { name: 'Comptes', exact: true }).click();
    const titre = page.getByRole('heading', { name: 'Comptes', level: 1 });
    await titre.waitFor();
    expect(await aLeFocus(titre)).toBe(true);
    // Les etats vides : aucune demande, aucun compte a part ; l'administrateur, seul actif, ne peut rien faire sur lui-meme.
    await attend(() => titreVide(page)).toBe('Aucune demande en attente.');
    expect(await onglet(page, 'En attente').getAttribute('aria-selected')).toBe('true');
    await s.sansViolationGrave(page, 'comptes : en attente (vide)');
    await onglet(page, 'Autres').click();
    await attend(() => titreVide(page)).toBe('Aucun compte à confirmer, suspendu ou refusé.');
    await s.sansViolationGrave(page, 'comptes : autres (vide)');
    // Les fleches passent d'un onglet a l'autre, le focus suit.
    await onglet(page, 'Autres').press('ArrowRight');
    await attend(() => onglet(page, 'En attente').getAttribute('aria-selected')).toBe('true');
    expect(await aLeFocus(onglet(page, 'En attente'))).toBe(true);
    await onglet(page, 'En attente').press('ArrowLeft');
    await attend(() => onglet(page, 'Autres').getAttribute('aria-selected')).toBe('true');
    await onglet(page, 'Actifs').click();
    const moi = ligneCompte(page, 'Admin');
    await moi.waitFor();
    expect(await textesDe(moi.locator('.compte-marque'))).toEqual(['Administrateur', 'Vous']);
    for (const action of ['Suspendre…', 'Retirer l’administration…', 'Supprimer…']) {
      expect(await bouton(moi, action, 'Admin').isDisabled(), action).toBe(true);
      expect(await bouton(moi, action, 'Admin').getAttribute('title'), action).toBe('C’est votre propre compte.');
    }
    expect(await bouton(moi, 'Changer l’adresse…', 'Admin').isDisabled()).toBe(false);

    // Anne s'inscrit par le formulaire PHP et confirme son adresse par le lien du mail : l'administrateur recoit un mail, et sa page,
    // rechargee, montre la demande (la pastille et l'element du menu).
    const MOT_ANNE = 'le mot de passe d’Anne';
    await inscrireEtConfirmer(autre, 'anne@exemple.org', 'Anne', MOT_ANNE);
    const avis = s.dernierMail(ADMIN_EMAIL);
    expect(avis?.sujet).toBe('Nouvelle demande de compte : Anne');
    expect(avis?.corps).toContain('Nouvelle demande : Anne (anne@exemple.org)');
    await page.reload();
    await page.locator('main.site-projets h1').waitFor();
    await attend(() => page.locator('.profil-pastille').innerText()).toBe('1');
    await ouvrirEcran(page, /^Comptes \(1 en attente\)$/, 'Comptes');
    await attend(() => nombreOnglet(page, 'En attente')).toBe(1);
    const anne = ligneCompte(page, 'Anne');
    await anne.waitFor();
    expect(await texteDe(anne.locator('.compte-email'))).toBe('anne@exemple.org · Français');
    expect(await texteDe(anne.locator('.aide'))).toMatch(/^Inscrit le \S+ · Adresse confirmée le \S+ · 0 projets$/);
    await s.sansViolationGrave(page, 'comptes : en attente');
    // Une confirmation ouverte (refuser), auditee, puis annulee : le focus revient au bouton qui l'a ouverte.
    await bouton(anne, 'Refuser…', 'Anne').click();
    const refus = page.getByRole('group', { name: 'Refuser « Anne »' });
    await refus.waitFor();
    expect(await aLeFocus(refus.getByLabel('Raison (facultative, une ligne)'))).toBe(true);
    await s.sansViolationGrave(page, 'comptes : confirmation ouverte');
    await refus.getByRole('button', { name: 'Annuler' }).click();
    await attend(() => aLeFocus(bouton(anne, 'Refuser…', 'Anne'))).toBe(true);
    // Approuver : la seule action pleine ; Anne passe dans « Actifs », recoit un mail, la pastille disparait.
    expect(await bouton(anne, 'Approuver', 'Anne').getAttribute('class')).toContain('primaire');
    await bouton(anne, 'Approuver', 'Anne').click();
    await attend(() => message(page)).toBe('Compte « Anne » approuvé : la personne a reçu un mail.');
    await attend(() => nombreOnglet(page, 'En attente')).toBe(0);
    expect(await nombreOnglet(page, 'Actifs')).toBe(2);
    expect(s.dernierMail('anne@exemple.org')?.sujet).toBe('Votre compte est ouvert — Éditeur SVG');
    await attend(() => page.locator('.profil-pastille').count()).toBe(0);

    // Bob s'inscrit et confirme ; l'ecran, rouvert, le montre ; refuse avec une raison, il passe dans « Autres » et le mail la porte.
    await inscrireEtConfirmer(autre, 'bob@exemple.org', 'Bob', 'le mot de passe de Bob');
    await page.getByRole('button', { name: '← Mes projets' }).click();
    await page.locator('main.site-projets h1').waitFor();
    await ouvrirEcran(page, /^Comptes/, 'Comptes');
    const bob = ligneCompte(page, 'Bob');
    await bob.waitFor();
    await confirmer(page, bob, 'Refuser', 'Bob', g => g.getByLabel('Raison (facultative, une ligne)').fill('Adresse inconnue de l’atelier'));
    await attend(() => message(page)).toBe('Demande de « Bob » refusée : la personne a reçu un mail.');
    expect(s.dernierMail('bob@exemple.org')?.corps).toContain('Raison donnée : Adresse inconnue de l’atelier');
    await attend(() => titreVide(page)).toBe('Aucune demande en attente.');
    await onglet(page, 'Autres').click();
    await bob.waitFor();
    await attend(() => textesDe(bob.locator('.compte-marque'))).toEqual(['Refusé']);
    expect(await textesDe(bob.getByRole('button'))).toEqual(['Réactiver', 'Supprimer…']);
    await s.sansViolationGrave(page, 'comptes : autres');

    // Suspendre Anne, la reactiver ; la nommer administrateur, lui retirer l'administration.
    await onglet(page, 'Actifs').click();
    await confirmer(page, anne, 'Suspendre', 'Anne');
    await attend(() => message(page)).toBe('Compte « Anne » suspendu.');
    await onglet(page, 'Autres').click();
    await anne.waitFor();
    await attend(() => textesDe(anne.locator('.compte-marque'))).toEqual(['Suspendu']);
    await bouton(anne, 'Réactiver', 'Anne').click();
    await attend(() => message(page)).toBe('Compte « Anne » réactivé.');
    await onglet(page, 'Actifs').click();
    await anne.waitFor();
    await confirmer(page, anne, 'Nommer administrateur', 'Anne');
    await attend(() => message(page)).toBe('« Anne » est désormais administrateur.');
    await attend(() => textesDe(anne.locator('.compte-marque'))).toEqual(['Administrateur']);
    // Deux administrateurs actifs : rien n'est le dernier, mais soi-meme reste garde.
    expect(await bouton(anne, 'Retirer l’administration…', 'Anne').isDisabled()).toBe(false);
    expect(await bouton(moi, 'Retirer l’administration…', 'Admin').getAttribute('title')).toBe('C’est votre propre compte.');
    await confirmer(page, anne, 'Retirer l’administration', 'Anne');
    await attend(() => message(page)).toBe('« Anne » n’est plus administrateur.');
    await attend(() => anne.locator('.compte-marque').count()).toBe(0);
    await s.sansViolationGrave(page, 'comptes : actifs');

    // Changer l'adresse d'Anne : elle se connecte avec la nouvelle (et son mot de passe d'inscription).
    await confirmer(page, anne, 'Changer l’adresse', 'Anne', async g => {
      expect(await g.getByLabel('Nouvelle adresse').inputValue()).toBe('anne@exemple.org');
      await g.getByLabel('Nouvelle adresse').fill('anne.martin@exemple.org');
    });
    await attend(() => message(page)).toBe('Adresse de « Anne » changée.');
    await attend(() => texteDe(anne.locator('.compte-email'))).toBe('anne.martin@exemple.org · Français');
    await autre.goto(s.site + '/index.php');
    await s.connecter(autre, 'anne.martin@exemple.org', MOT_ANNE);
    expect(await texteDe(autre.locator('.menu-profil .menu-bouton'))).toBe('A');
    // Anne a un projet ; la supprimer emporte son dossier entier dans projets/corbeille-comptes/, et ferme sa session.
    const anneApi = await clientConnecte('anne.martin@exemple.org', MOT_ANNE);
    await anneApi.creerProjet('Carte d’Anne');
    await anneApi.fermer();
    const idAnne = s.idDuCompte('anne.martin@exemple.org');
    expect(readdirSync(s.donnees('projets/' + idAnne)).some(f => f.endsWith('.json'))).toBe(true);
    await page.getByRole('button', { name: '← Mes projets' }).click();
    await ouvrirEcran(page, /^Comptes/, 'Comptes');
    await onglet(page, 'Actifs').click();
    await anne.waitFor();
    expect(await texteDe(anne.locator('.aide'))).toMatch(/· 1 projet$/);
    await confirmer(page, anne, 'Supprimer', 'Anne');
    await attend(() => message(page)).toBe('Compte « Anne » supprimé : ses projets sont dans la corbeille des comptes du serveur.');
    await attend(() => anne.count()).toBe(0);
    expect(existsSync(s.donnees('projets/' + idAnne))).toBe(false);
    const corbeille = readdirSync(s.donnees('projets/corbeille-comptes')).filter(d => d.endsWith('-' + idAnne));
    expect(corbeille).toHaveLength(1);
    const contenu = readdirSync(s.donnees('projets/corbeille-comptes/' + corbeille[0]));
    expect(contenu).toContain('compte.json');
    expect(contenu.some(f => /^[a-f0-9]{16}\.json$/.test(f))).toBe(true);
    expect((await autre.request.get(s.site + '/api.php?r=projets')).status()).toBe(401);

    // « Créer un compte… » : les erreurs liees aux champs, puis un compte actif d'emblee, qui se connecte avec le mot de passe provisoire.
    await page.getByRole('button', { name: 'Créer un compte…' }).click();
    const creation = page.locator('form.creation-compte');
    await creation.waitFor();
    expect(await aLeFocus(creation.getByLabel('Adresse de courrier'))).toBe(true);
    await creation.getByRole('button', { name: 'Créer le compte' }).click();
    expect(await erreurDuChamp(page, 'Adresse de courrier')).toEqual({ invalide: true, texte: 'Tapez une adresse de courrier valable.' });
    expect(await erreurDuChamp(page, 'Nom')).toEqual({ invalide: true, texte: 'Le nom ne peut pas être vide.' });
    expect(await erreurDuChamp(page, 'Mot de passe provisoire')).toEqual({ invalide: true, texte: 'Le mot de passe provisoire doit faire au moins 10 caractères.' });
    await s.sansViolationGrave(page, 'comptes : creation en erreur');
    await creation.getByLabel('Adresse de courrier').fill('carla@exemple.org');
    await creation.getByLabel('Nom').fill('Carla');
    await creation.getByLabel('Mot de passe provisoire').fill('provisoire pour Carla');
    await creation.getByRole('button', { name: 'Créer le compte' }).click();
    await attend(() => message(page)).toBe('Compte « Carla » créé, actif : donnez-lui son mot de passe provisoire.');
    // La carte se ferme une fois la liste relue.
    await attend(() => creation.count()).toBe(0);
    expect(await onglet(page, 'Actifs').getAttribute('aria-selected')).toBe('true');
    await ligneCompte(page, 'Carla').waitFor();
    await autre.goto(s.site + '/index.php');
    await s.connecter(autre, 'carla@exemple.org', 'provisoire pour Carla');
    // Retour aux projets.
    await page.getByRole('button', { name: '← Mes projets' }).click();
    await page.getByRole('heading', { name: 'Mes projets', level: 1 }).waitFor();
  });

  it('le menu du profil d un utilisateur : l en-tete, Mon profil et Se deconnecter seulement, le clavier, la deconnexion', async () => {
    s.oublierEssais();
    const { page } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    await creerUtilisateur(page, 'marc@exemple.org', 'Marc Dupont', 'le mot de passe de Marc');
    await s.seDeconnecter(page);
    await s.connecter(page, 'marc@exemple.org', 'le mot de passe de Marc');
    const b = boutonProfil(page);
    expect(await b.getAttribute('aria-label')).toBe('Compte : Marc Dupont, MD');
    expect(await texteDe(b)).toBe('MD');
    expect(await page.locator('.profil-pastille').count()).toBe(0);
    await b.click();
    const menu = page.getByRole('menu', { name: 'Compte : Marc Dupont, MD' });
    await menu.waitFor();
    expect(await texteDe(page.locator('.menu-entete .profil-nom'))).toBe('Marc Dupont');
    expect(await texteDe(page.locator('.menu-entete .profil-email'))).toBe('marc@exemple.org');
    expect(await textesDe(menu.getByRole('menuitem'))).toEqual(['Mon profil…', 'Se déconnecter']);
    await s.sansViolationGrave(page, 'menu du profil');
    // L'API d'administration le refuse aussi.
    expect((await page.request.get(s.site + '/api.php?r=comptes')).status()).toBe(403);
    expect((await page.request.get(s.site + '/api.php?r=reglages')).status()).toBe(403);
    // Au clavier : Echap ferme et rend le focus au bouton ; les fleches ouvrent sur le premier element et parcourent.
    await page.keyboard.press('Escape');
    await attend(() => menu.count()).toBe(0);
    expect(await aLeFocus(b)).toBe(true);
    await page.keyboard.press('ArrowDown');
    await menu.waitFor();
    expect(await aLeFocus(menu.getByRole('menuitem', { name: 'Mon profil…' }))).toBe(true);
    await page.keyboard.press('ArrowDown');
    expect(await aLeFocus(menu.getByRole('menuitem', { name: 'Se déconnecter' }))).toBe(true);
    await page.keyboard.press('ArrowUp');
    expect(await aLeFocus(menu.getByRole('menuitem', { name: 'Mon profil…' }))).toBe(true);
    await page.keyboard.press('Escape');
    await attend(() => menu.count()).toBe(0);
    expect(await aLeFocus(b)).toBe(true);
    // Se deconnecter : la page de connexion le dit.
    await page.keyboard.press('ArrowUp');
    await menu.waitFor();
    await page.keyboard.press('Enter');
    await attend(() => texteDe(page.locator('.message.neutre'))).toBe('Vous êtes déconnecté.');
    expect((await page.request.get(s.site + '/api.php?r=projets')).status()).toBe(401);
  });

  it('Mon profil : le nom (initiales et en-tete suivent), le mot de passe et ses erreurs liees aux champs, la langue (la page se recharge)', async () => {
    s.oublierEssais();
    const { page, erreurs: erreursPage } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    const MOT_PAULE = 'le mot de passe de Paule';
    await creerUtilisateur(page, 'paule@exemple.org', 'Paule', MOT_PAULE);
    await s.seDeconnecter(page);
    await s.connecter(page, 'paule@exemple.org', MOT_PAULE);
    await boutonProfil(page).click();
    await page.getByRole('menuitem', { name: 'Mon profil…' }).click();
    const boite = page.getByRole('dialog', { name: 'Mon profil' });
    await boite.waitFor();
    expect(await aLeFocus(boite)).toBe(true);
    await s.sansViolationGrave(page, 'mon profil');
    const identite = boite.locator('form', { has: page.getByRole('heading', { name: 'Identité' }) });
    const motDePasse = boite.locator('form', { has: page.getByRole('heading', { name: 'Mot de passe', level: 3 }) });
    expect(await texteDe(identite.locator('.aide'))).toBe('Adresse : paule@exemple.org. Elle ne se change pas ici : demandez-le à un administrateur.');
    // Rien ne change : c'est dit, rien ne part.
    await identite.getByRole('button', { name: 'Enregistrer' }).click();
    await attend(() => texteDe(identite.locator('.message'))).toBe('Rien n’a changé.');
    // Un nom vide : l'erreur liee au champ, le focus dessus.
    await identite.getByLabel('Nom').fill('   ');
    await identite.getByRole('button', { name: 'Enregistrer' }).click();
    expect(await erreurDuChamp(page, 'Nom')).toEqual({ invalide: true, texte: 'Le nom ne peut pas être vide.' });
    expect(await aLeFocus(identite.getByLabel('Nom'))).toBe(true);
    // Le nom change : la boite le dit, les initiales et l'en-tete du menu suivent.
    await identite.getByLabel('Nom').fill('Paule  Martin ');
    await identite.getByRole('button', { name: 'Enregistrer' }).click();
    await attend(() => texteDe(identite.locator('.message'))).toBe('Profil enregistré.');
    expect(await identite.getByLabel('Nom').inputValue()).toBe('Paule Martin');
    expect(await erreurDuChamp(page, 'Nom')).toEqual({ invalide: false, texte: '' });
    expect(JSON.parse(readFileSync(s.donnees('comptes/' + s.idDuCompte('paule@exemple.org') + '.json'), 'utf8'))).toMatchObject({ nom: 'Paule Martin' });
    // La boite est modale (le reste de la page est inerte) : Echap la ferme, le focus revient au bouton du profil, qui porte les
    // nouvelles initiales ; l'en-tete du menu suit.
    await page.keyboard.press('Escape');
    await attend(() => boite.count()).toBe(0);
    expect(await aLeFocus(boutonProfil(page))).toBe(true);
    expect(await texteDe(boutonProfil(page))).toBe('PM');
    expect(await boutonProfil(page).getAttribute('aria-label')).toBe('Compte : Paule Martin, PM');
    await boutonProfil(page).click();
    await attend(() => texteDe(page.locator('.menu-entete .profil-nom'))).toBe('Paule Martin');
    await page.getByRole('menuitem', { name: 'Mon profil…' }).click();
    await boite.waitFor();

    // Le mot de passe : les erreurs se lisent sur leur champ.
    const champs = ['Mot de passe actuel', 'Nouveau mot de passe', 'Nouveau mot de passe, encore'] as const;
    const erreurs = async () => Promise.all(champs.map(c => erreurDuChamp(page, c).then(e => (e.invalide ? e.texte : ''))));
    await motDePasse.getByRole('button', { name: 'Changer le mot de passe' }).click();
    expect(await erreurs()).toEqual(['Tapez votre mot de passe actuel.', 'Le nouveau mot de passe doit faire au moins 10 caractères.', '']);
    expect((await erreurDuChamp(page, 'Mot de passe actuel')).invalide).toBe(true);
    expect((await erreurDuChamp(page, 'Nouveau mot de passe, encore')).invalide).toBe(false);
    await s.sansViolationGrave(page, 'mon profil en erreur');
    await motDePasse.getByLabel('Mot de passe actuel').fill(MOT_PAULE);
    await motDePasse.getByLabel('Nouveau mot de passe', { exact: true }).fill('court');
    await motDePasse.getByLabel('Nouveau mot de passe, encore').fill('court');
    await motDePasse.getByRole('button', { name: 'Changer le mot de passe' }).click();
    expect(await erreurs()).toEqual(['', 'Le nouveau mot de passe doit faire au moins 10 caractères.', '']);
    await motDePasse.getByLabel('Nouveau mot de passe', { exact: true }).fill('un nouveau mot de passe');
    await motDePasse.getByLabel('Nouveau mot de passe, encore').fill('un autre mot de passe');
    await motDePasse.getByRole('button', { name: 'Changer le mot de passe' }).click();
    expect(await erreurs()).toEqual(['', '', 'Les deux saisies du nouveau mot de passe diffèrent.']);
    // L'ancien faux : le serveur refuse, l'erreur se lit sur le champ de l'ancien.
    await motDePasse.getByLabel('Mot de passe actuel').fill('pas le bon mot de passe');
    await motDePasse.getByLabel('Nouveau mot de passe, encore').fill('un nouveau mot de passe');
    await motDePasse.getByRole('button', { name: 'Changer le mot de passe' }).click();
    await attend(() => erreurs()).toEqual(['L’ancien mot de passe est incorrect.', '', '']);
    expect((await erreurDuChamp(page, 'Mot de passe actuel')).invalide).toBe(true);
    // Le bon : les champs se vident, la reconnexion passe par le nouveau.
    await motDePasse.getByLabel('Mot de passe actuel').fill(MOT_PAULE);
    await motDePasse.getByRole('button', { name: 'Changer le mot de passe' }).click();
    await attend(() => texteDe(motDePasse.locator('.message'))).toBe('Mot de passe changé. Vos autres sessions sont fermées.');
    expect(await motDePasse.getByLabel('Mot de passe actuel').inputValue()).toBe('');
    expect(await erreurs()).toEqual(['', '', '']);
    await boite.getByRole('button', { name: 'Fermer' }).click();
    await attend(() => boite.count()).toBe(0);
    await s.seDeconnecter(page);
    await s.connecter(page, 'paule@exemple.org', 'un nouveau mot de passe');

    // La langue : la page se recharge dans la nouvelle (le compte la garde, les pages PHP la lisent).
    await boutonProfil(page).click();
    await page.getByRole('menuitem', { name: 'Mon profil…' }).click();
    await boite.waitFor();
    await boite.getByRole('group', { name: 'Langue' }).getByRole('radio', { name: 'English' }).check();
    await boite.locator('form', { has: page.getByRole('heading', { name: 'Identité' }) }).getByRole('button', { name: 'Enregistrer' }).click();
    await attend(() => page.locator('html[lang="en"]').count()).toBe(1);
    await attend(() => page.title()).toBe('My projects · Éditeur SVG');
    expect(JSON.parse(readFileSync(s.donnees('comptes/' + s.idDuCompte('paule@exemple.org') + '.json'), 'utf8'))).toMatchObject({ langue: 'en' });
    await page.locator('main.site-projets h1').waitFor();
    // L'interface React suit la langue du compte des que le site pose `preparerLangue(compte.langue)` avant le premier rendu
    // (src/site/demarrer.tsx, ADR-0042, pose a l'integration) ; tant qu'elle n'y est pas, le titre reste en francais sous une page
    // en anglais. L'un ou l'autre : ce test ne juge que le rechargement et la langue de la page ; l'amorce resserrera le titre.
    expect(await texteDe(page.locator('main.site-projets h1'))).toMatch(/^(My projects|Mes projets)$/);
    // Le refus de l'ancien mot de passe (400) s'ecrit dans la console du navigateur de lui-meme : ce n'est pas la page.
    const restent = erreursPage.filter(e => !/Failed to load resource: the server responded with a status of 400/.test(e));
    erreursPage.length = 0;
    erreursPage.push(...restent);
  });

  it('chaque compte ne voit que ses projets ; l identifiant d un projet d un autre compte est introuvable pour l API', async () => {
    s.oublierEssais();
    const { page } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    await creerUtilisateur(page, 'dina@exemple.org', 'Dina', 'le mot de passe de Dina');
    await creerUtilisateur(page, 'eli@exemple.org', 'Eli', 'le mot de passe d’Eli');
    const dinaApi = await clientConnecte('dina@exemple.org', 'le mot de passe de Dina');
    const eliApi = await clientConnecte('eli@exemple.org', 'le mot de passe d’Eli');
    const idDina = await dinaApi.creerProjet('Carte de Dina');
    const idEli = await eliApi.creerProjet('Carte d’Eli');
    await Promise.all([dinaApi.fermer(), eliApi.fermer()]);
    // L'administrateur ne voit pas les projets des autres non plus : les siens seulement (ici, aucun), leur nombre dans l'ecran Comptes.
    expect(((await (await page.request.get(s.site + '/api.php?r=projets')).json()) as { projets: unknown[] }).projets).toEqual([]);
    expect((await page.request.get(s.site + '/api.php?r=projet&id=' + idDina)).status()).toBe(404);
    await s.seDeconnecter(page);

    await s.connecter(page, 'dina@exemple.org', 'le mot de passe de Dina');
    await attend(() => textesDe(page.locator('.liste-projets .projet-nom'))).toEqual(['Carte de Dina']);
    const liste = (await (await page.request.get(s.site + '/api.php?r=projets')).json()) as { projets: Array<{ id: string }> };
    expect(liste.projets.map(p => p.id)).toEqual([idDina]);
    const reponse = await page.request.get(s.site + '/api.php?r=projet&id=' + idEli);
    expect(reponse.status()).toBe(404);
    expect(((await reponse.json()) as { erreur: string }).erreur).toBe('introuvable');
    expect((await page.request.get(s.site + '/api.php?r=vignette&id=' + idEli)).status()).toBe(404);
    expect((await ecrireApi(page, 'renommer&id=' + idEli, { nom: 'Volée' })).statut).toBe(404);
    expect((await ecrireApi(page, 'supprimer&id=' + idEli, {})).statut).toBe(404);
    expect((await page.request.get(s.site + '/api.php?r=projet&id=' + idDina)).status()).toBe(200);
    await s.seDeconnecter(page);

    await s.connecter(page, 'eli@exemple.org', 'le mot de passe d’Eli');
    await attend(() => textesDe(page.locator('.liste-projets .projet-nom'))).toEqual(['Carte d’Eli']);
    expect((await page.request.get(s.site + '/api.php?r=projet&id=' + idDina)).status()).toBe(404);
    // Sur le disque, chacun son dossier.
    expect(readdirSync(s.donnees('projets/' + s.idDuCompte('dina@exemple.org')))).toContain(idDina + '.json');
    expect(readdirSync(s.donnees('projets/' + s.idDuCompte('eli@exemple.org')))).toContain(idEli + '.json');
  });

  it('les reglages du site : config.json charge, SMTP et son port, duree de connexion, enregistrer relit le disque, mot de passe vide inchange, mail d essai, inscriptions fermees', async () => {
    s.oublierEssais();
    writeFileSync(s.donnees('config/config.json'), JSON.stringify(CONFIG_ESSAI));
    const { page } = await s.ouvrirSite(navigateur);
    await s.connecter(page);
    try {
      await ouvrirEcran(page, /^Réglages du site…$/, 'Réglages du site');
      const formulaire = page.locator('form.formulaire-site');
      await formulaire.waitFor();
      expect(await aLeFocus(page.getByRole('heading', { name: 'Réglages du site', level: 1 }))).toBe(true);
      // Les valeurs de config.json.
      expect(await page.getByLabel('Nom du site', { exact: true }).inputValue()).toBe('Éditeur SVG');
      expect(await page.getByRole('radio', { name: 'Français' }).isChecked()).toBe(true);
      expect(await page.getByLabel('Inscriptions ouvertes').isChecked()).toBe(true);
      expect(await page.getByLabel('Rester connecté sans revenir pendant').inputValue()).toBe('7200');
      expect(await page.getByLabel('Adresse d’expédition').inputValue()).toBe('no-reply@exemple.org');
      expect(await page.getByRole('radio', { name: /^Aucun envoi/ }).isChecked()).toBe(true);
      expect(await page.locator('.champs-smtp').count()).toBe(0);
      expect(await page.getByLabel('Destinataire du mail d’essai').inputValue()).toBe(ADMIN_EMAIL);
      await s.sansViolationGrave(page, 'reglages');
      // Le mode SMTP montre ses champs ; un port invalide est une erreur liee au champ, rien ne part.
      await page.getByRole('radio', { name: 'Un serveur SMTP' }).check();
      await page.locator('.champs-smtp').waitFor();
      expect(await page.getByLabel('Port', { exact: true }).inputValue()).toBe('587');
      expect(await page.getByLabel('Sécurité', { exact: true }).inputValue()).toBe('starttls');
      expect(await erreurDuChamp(page, 'Mot de passe SMTP')).toEqual({ invalide: false, texte: 'Aucun mot de passe enregistré.' });
      await page.getByLabel('Port', { exact: true }).fill('0');
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await attend(() => message(page)).toBe('Corrigez les champs signalés avant d’enregistrer.');
      expect(await erreurDuChamp(page, 'Port')).toEqual({ invalide: true, texte: 'Le port est un nombre entre 1 et 65535.' });
      expect(await erreurDuChamp(page, 'Serveur SMTP')).toEqual({ invalide: true, texte: 'Le serveur SMTP est requis pour envoyer par SMTP.' });
      expect(config().courrier.mode).toBe('fichier');
      await s.sansViolationGrave(page, 'reglages en erreur');
      // Corrige et complete : le nom du site, la langue, les inscriptions, le mot de passe SMTP ; enregistrer relit le disque.
      await page.getByLabel('Serveur SMTP', { exact: true }).fill('smtp.exemple.org');
      await page.getByLabel('Port', { exact: true }).fill('2525');
      await page.getByLabel('Sécurité', { exact: true }).selectOption('ssl');
      await page.getByLabel('Utilisateur', { exact: true }).fill('robot');
      await page.getByLabel('Mot de passe SMTP', { exact: true }).fill('le secret smtp');
      await page.getByLabel('Nom du site', { exact: true }).fill('Atelier d’essai');
      await page.getByRole('radio', { name: 'English' }).check();
      await page.getByLabel('Inscriptions ouvertes').uncheck();
      await page.getByLabel('Rester connecté sans revenir pendant').selectOption({ label: '30 jours' });
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await attend(() => message(page)).toBe('Réglages enregistrés.');
      expect(config()).toMatchObject({ site: { nom: 'Atelier d’essai', langue: 'en' }, inscriptions: { ouvertes: false }, sessions: { inactivite: 2592000 }, courrier: { mode: 'smtp', smtp: { hote: 'smtp.exemple.org', port: 2525, securite: 'ssl', utilisateur: 'robot', motDePasse: 'le secret smtp' } } });
      expect(await page.getByLabel('Mot de passe SMTP', { exact: true }).inputValue()).toBe('');
      expect(await erreurDuChamp(page, 'Mot de passe SMTP')).toEqual({ invalide: false, texte: 'Un mot de passe est enregistré ; laissez vide pour le garder.' });
      // Rouvert, l'ecran montre ce qui est sur le disque, jamais le mot de passe.
      await page.getByRole('button', { name: '← Mes projets' }).click();
      await ouvrirEcran(page, /^Réglages du site…$/, 'Réglages du site');
      await formulaire.waitFor();
      expect(await page.getByLabel('Nom du site', { exact: true }).inputValue()).toBe('Atelier d’essai');
      expect(await page.getByRole('radio', { name: 'English' }).isChecked()).toBe(true);
      expect(await page.getByLabel('Inscriptions ouvertes').isChecked()).toBe(false);
      expect(await page.getByLabel('Rester connecté sans revenir pendant').inputValue()).toBe('2592000');
      expect(await page.getByLabel('Port', { exact: true }).inputValue()).toBe('2525');
      expect(await page.getByLabel('Mot de passe SMTP', { exact: true }).inputValue()).toBe('');
      // Retour au mode fichier et au francais, le mot de passe laisse vide : il reste sur le disque.
      await page.getByRole('radio', { name: /^Aucun envoi/ }).check();
      await page.getByRole('radio', { name: 'Français' }).check();
      await page.getByRole('button', { name: 'Enregistrer' }).click();
      await attend(() => message(page)).toBe('Réglages enregistrés.');
      expect(config()).toMatchObject({ site: { langue: 'fr' }, courrier: { mode: 'fichier', smtp: { motDePasse: 'le secret smtp', port: 2525 } } });
      // Le mail d'essai, en mode fichier : un .eml pour l'administrateur, au nom du site.
      const avant = s.mailsEcrits().length;
      await page.getByRole('button', { name: 'Envoyer un mail d’essai' }).click();
      await attend(() => texteDe(page.locator('.essai-courrier .message'))).toBe('Mail d’essai parti vers admin@exemple.org : vérifiez sa réception (et les indésirables).');
      expect(s.mailsEcrits().length).toBe(avant + 1);
      expect(s.dernierMail(ADMIN_EMAIL)?.sujet).toBe('Message d’essai — Atelier d’essai');
      // Les inscriptions fermees : la page de connexion ne propose plus de creer un compte, et la route le dit.
      await page.getByRole('button', { name: '← Mes projets' }).click();
      await s.seDeconnecter(page);
      expect(await texteDe(page.getByRole('heading', { level: 1 }))).toBe('Atelier d’essai');
      expect(await textesDe(page.locator('.liens-secondaires a'))).toEqual(['Mot de passe oublié ?']);
      expect((await page.request.get(s.site + '/index.php?inscription')).status()).toBe(403);
    } finally {
      writeFileSync(s.donnees('config/config.json'), JSON.stringify(CONFIG_ESSAI));
    }
  });

  it('une page dont data-compte ne se lit pas : l application s ouvre sans le menu, avec la deconnexion d avant, et le dit', async () => {
    s.oublierEssais();
    const { page } = await s.ouvrirSite(navigateur);
    // La page de l'application, forgee : l'attribut du compte n'est pas du JSON (un mandataire, un cache, un bogue du serveur).
    await page.route(/\/(index\.php)?(\?.*)?$/, async route => {
      const reponse = await route.fetch();
      const html = await reponse.text();
      if (!html.includes('data-compte="')) { await route.fulfill({ response: reponse, body: html }); return; }
      await route.fulfill({ response: reponse, body: html.replace(/data-compte="[^"]*"/, 'data-compte="{pas du JSON"') });
    });
    await s.connecter(page);
    expect(await texteDe(page.getByRole('alert'))).toBe('La page n’a pas pu dire qui est connecté : le menu du profil n’est pas disponible. Rechargez la page ; si cela persiste, reconnectez-vous.');
    expect(await boutonProfil(page).count()).toBe(0);
    const deconnexion = page.locator('.site-tete form.site-deconnexion').getByRole('button', { name: 'Se déconnecter' });
    expect(await deconnexion.isVisible()).toBe(true);
    // Les projets se chargent quand meme : l'application marche, seul le menu manque.
    await attend(() => page.locator('.projets [role="status"]').count()).toBe(0);
    await s.sansViolationGrave(page, 'projets sans compte lisible');
    await deconnexion.click();
    await attend(() => texteDe(page.locator('.message.neutre'))).toBe('Vous êtes déconnecté.');
  });
});
