// Les comptes du site (ADR-0041), la part pure (comptesSite.ts, a cote de Comptes.tsx : un nom qui ne se confond pas avec l'ecran) : les initiales d'un nom, le classement des comptes par onglet, les raisons d'un
// refus connues d'avance, la validation des formulaires et les phrases des gestes. Les ecrans (MenuProfil, Profil, Comptes,
// Reglages) ne font que les appeler ; rien ici ne touche au DOM ni au reseau, tout se teste sans navigateur.

import type { ActionCompte, EtatCompte, FicheCompte, Langue, Reglages, RoleCompte } from '../io/serveur.js';
import { t } from '../util/i18n.js';

export const NOM_MAX = 120;
export const MOT_DE_PASSE_MIN = 10;

// Les libelles des tables de ce fichier sont des accesseurs : `t` se lit au moment de l'affichage, jamais au chargement du module,
// ou le dictionnaire d'une autre langue n'est pas encore la (ADR-0042). Les tables gardent leur forme pour qui les lit.

/** Les trois onglets de l'ecran « Comptes » (ADR-0041 §5). */
export type Onglet = 'en-attente' | 'actifs' | 'autres';
export const ONGLETS: readonly Onglet[] = ['en-attente', 'actifs', 'autres'];
export const TITRES_ONGLETS: Readonly<Record<Onglet, string>> = {
  get 'en-attente'() { return t('En attente'); }, get actifs() { return t('Actifs'); }, get autres() { return t('Autres'); }
};

/** L'onglet d'un compte selon son etat : les demandes a approuver, les comptes qui se connectent, le reste. */
export const ongletDe = (etat: EtatCompte): Onglet => (etat === 'en-attente' ? 'en-attente' : etat === 'actif' ? 'actifs' : 'autres');

/** Les initiales d'un nom, pour l'icone du profil : la premiere lettre des deux premiers mots, en capitales ; « ? » sans lettre. */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(m => /\p{L}/u.test(m));
  const lettres = mots.slice(0, 2).map(m => [...m].find(c => /\p{L}/u.test(c)) ?? '');
  const t = lettres.join('').toLocaleUpperCase('fr-FR');
  return t || '?';
}

/** Un nom tel qu'on le garde : espaces reduits, borne a NOM_MAX. */
export const nomDeCompte = (nom: string): string => nom.trim().replace(/\s+/g, ' ').slice(0, NOM_MAX);

/** Une adresse de courrier plausible : un seul @, un domaine avec un point, aucun blanc. Le serveur a le dernier mot. */
export const emailValide = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;

const collation = new Intl.Collator('fr', { sensitivity: 'base' });
const parNom = (a: FicheCompte, b: FicheCompte) => collation.compare(a.nom, b.nom) || a.email.localeCompare(b.email);
const ORDRE_ETATS: readonly EtatCompte[] = ['a-confirmer', 'suspendu', 'refuse', 'en-attente', 'actif'];

/**
 * Les comptes de chaque onglet, tries : les demandes dans l'ordre d'arrivee (la plus ancienne confirmation d'abord : une file),
 * les actifs par nom, les autres par etat (a confirmer, suspendus, refuses) puis par nom.
 */
export function comptesParOnglet(comptes: readonly FicheCompte[]): Readonly<Record<Onglet, readonly FicheCompte[]>> {
  const sortie: Record<Onglet, FicheCompte[]> = { 'en-attente': [], actifs: [], autres: [] };
  for (const c of comptes) sortie[ongletDe(c.etat)].push(c);
  sortie['en-attente'].sort((a, b) => (a.confirmeLe ?? a.creeLe).localeCompare(b.confirmeLe ?? b.creeLe) || parNom(a, b));
  sortie.actifs.sort(parNom);
  sortie.autres.sort((a, b) => ORDRE_ETATS.indexOf(a.etat) - ORDRE_ETATS.indexOf(b.etat) || parNom(a, b));
  return sortie;
}

/** Les gestes d'une ligne, selon l'etat du compte (ADR-0041 §5) ; « email » change l'adresse. */
export function actionsPour(c: FicheCompte): readonly ActionCompte[] {
  switch (c.etat) {
    case 'en-attente': return ['approuver', 'refuser'];
    case 'actif': return ['suspendre', c.role === 'admin' ? 'retrograder' : 'promouvoir', 'email', 'supprimer'];
    case 'a-confirmer': return ['renvoyer', 'supprimer'];
    default: return ['reactiver', 'supprimer'];
  }
}

export const LIBELLES_ACTIONS: Readonly<Record<ActionCompte, string>> = {
  get approuver() { return t('Approuver'); }, get refuser() { return t('Refuser…'); }, get suspendre() { return t('Suspendre…'); },
  get reactiver() { return t('Réactiver'); }, get supprimer() { return t('Supprimer…'); }, get promouvoir() { return t('Nommer administrateur…'); },
  get retrograder() { return t('Retirer l’administration…'); }, get renvoyer() { return t('Renvoyer le mail'); }, get email() { return t('Changer l’adresse…'); },
  get creer() { return t('Créer un compte…'); }
};

/** Les gestes qui se confirment dans la ligne avant de partir ; les autres partent au clic. */
export const ACTIONS_CONFIRMEES: readonly ActionCompte[] = ['refuser', 'suspendre', 'supprimer', 'promouvoir', 'retrograder', 'email'];

/** Les gestes qu'on ne fait jamais sur soi-meme ni sur le dernier administrateur actif. */
const GARDES: readonly ActionCompte[] = ['suspendre', 'retrograder', 'supprimer'];

/**
 * Pourquoi un geste est refuse d'avance, ou null s'il peut partir : sur soi-meme et sur le dernier administrateur actif, on ne
 * suspend, ne retrograde ni ne supprime pas (ADR-0041 §5). Le serveur verifie de son cote ; ici, le bouton le dit avant le clic.
 */
export function raisonRefus(action: ActionCompte, c: FicheCompte, moi: string, comptes: readonly FicheCompte[]): string | null {
  if (!GARDES.includes(action)) return null;
  if (c.id === moi) return t('C’est votre propre compte.');
  if (c.role === 'admin' && c.etat === 'actif' && !comptes.some(x => x.id !== c.id && x.role === 'admin' && x.etat === 'actif')) return t('C’est le dernier administrateur actif.');
  return null;
}

/** La phrase qui dit qu'un geste a abouti. */
export function phraseAction(action: ActionCompte, nom: string): string {
  switch (action) {
    case 'approuver': return t('Compte « {nom} » approuvé : la personne a reçu un mail.', { nom });
    case 'refuser': return t('Demande de « {nom} » refusée : la personne a reçu un mail.', { nom });
    case 'suspendre': return t('Compte « {nom} » suspendu.', { nom });
    case 'reactiver': return t('Compte « {nom} » réactivé.', { nom });
    case 'supprimer': return t('Compte « {nom} » supprimé : ses projets sont dans la corbeille des comptes du serveur.', { nom });
    case 'promouvoir': return t('« {nom} » est désormais administrateur.', { nom });
    case 'retrograder': return t('« {nom} » n’est plus administrateur.', { nom });
    case 'renvoyer': return t('Mail de confirmation renvoyé à « {nom} ».', { nom });
    case 'email': return t('Adresse de « {nom} » changée.', { nom });
    case 'creer': return t('Compte « {nom} » créé, actif : donnez-lui son mot de passe provisoire.', { nom });
  }
}

export const LIBELLES_ETATS: Readonly<Record<EtatCompte, string>> = {
  get 'a-confirmer'() { return t('Adresse à confirmer'); }, get 'en-attente'() { return t('En attente d’approbation'); }, get actif() { return t('Actif'); },
  get refuse() { return t('Refusé'); }, get suspendu() { return t('Suspendu'); }
};
/** Le nom de chaque langue, dans cette langue (il porte son `lang`) : il ne change pas avec la langue de l'interface. */
export const LIBELLES_LANGUES: Readonly<Record<Langue, string>> = { get fr() { return t('Français'); }, en: 'English' };
export const LIBELLES_ROLES: Readonly<Record<RoleCompte, string>> = { get admin() { return t('Administrateur'); }, get utilisateur() { return t('Utilisateur'); } };

/** Les erreurs d'un formulaire, par champ : vide, le formulaire peut partir. */
export type Erreurs<C extends string> = Partial<Record<C, string>>;

export function validerProfil(nom: string): Erreurs<'nom'> {
  return nomDeCompte(nom) ? {} : { nom: t('Le nom ne peut pas être vide.') };
}

export function validerMotDePasse(ancien: string, nouveau: string, confirmation: string): Erreurs<'ancien' | 'nouveau' | 'confirmation'> {
  const e: Erreurs<'ancien' | 'nouveau' | 'confirmation'> = {};
  if (!ancien) e.ancien = t('Tapez votre mot de passe actuel.');
  if (nouveau.length < MOT_DE_PASSE_MIN) e.nouveau = t('Le nouveau mot de passe doit faire au moins {min} caractères.', { min: MOT_DE_PASSE_MIN });
  else if (nouveau === ancien) e.nouveau = t('Le nouveau mot de passe est le même que l’ancien.');
  if (confirmation !== nouveau) e.confirmation = t('Les deux saisies du nouveau mot de passe diffèrent.');
  return e;
}

export interface Creation { readonly email: string; readonly nom: string; readonly langue: Langue; readonly motDePasse: string }

export function validerCreation(c: Creation): Erreurs<'email' | 'nom' | 'motDePasse'> {
  const e: Erreurs<'email' | 'nom' | 'motDePasse'> = {};
  if (!emailValide(c.email.trim())) e.email = t('Tapez une adresse de courrier valable.');
  if (!nomDeCompte(c.nom)) e.nom = t('Le nom ne peut pas être vide.');
  if (c.motDePasse.length < MOT_DE_PASSE_MIN) e.motDePasse = t('Le mot de passe provisoire doit faire au moins {min} caractères.', { min: MOT_DE_PASSE_MIN });
  return e;
}

export function validerEmail(email: string): Erreurs<'email'> {
  return emailValide(email.trim()) ? {} : { email: t('Tapez une adresse de courrier valable.') };
}

export type ChampReglages = 'nom' | 'adresse' | 'expediteur' | 'hote' | 'port';

/** Les reglages du site : un nom, une adresse https (ou rien), un expediteur plausible, et un hote SMTP avec un port quand le mode est SMTP. */
export function validerReglages(r: Reglages): Erreurs<ChampReglages> {
  const e: Erreurs<ChampReglages> = {};
  if (!r.site.nom.trim()) e.nom = t('Le nom du site ne peut pas être vide.');
  if (r.site.adresse && !/^https?:\/\/\S+$/.test(r.site.adresse)) e.adresse = t('L’adresse du site commence par https:// (ou reste vide : celle de la page servira).');
  if (r.courrier.expediteur && !emailValide(r.courrier.expediteur)) e.expediteur = t('Tapez une adresse d’expédition valable.');
  if (r.courrier.mode === 'smtp') {
    if (!r.courrier.smtp.hote.trim()) e.hote = t('Le serveur SMTP est requis pour envoyer par SMTP.');
    if (!Number.isInteger(r.courrier.smtp.port) || r.courrier.smtp.port < 1 || r.courrier.smtp.port > 65535) e.port = t('Le port est un nombre entre 1 et 65535.');
  }
  return e;
}
