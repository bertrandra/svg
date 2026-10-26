import { describe, expect, it } from 'vitest';
import {
  ACTIONS_CONFIRMEES, LIBELLES_ACTIONS, ONGLETS, actionsPour, comptesParOnglet, emailValide, initiales, nomDeCompte, ongletDe, phraseAction, raisonRefus,
  validerCreation, validerEmail, validerMotDePasse, validerProfil, validerReglages
} from '../../../src/site/comptesSite.js';
import { REGLAGES_PAR_DEFAUT, type ActionCompte, type FicheCompte } from '../../../src/io/serveur.js';

// La part pure des ecrans des comptes (ADR-0041) : ce que les composants affichent se calcule ici, sans DOM.

const fiche = (p: Partial<FicheCompte> & { id: string }): FicheCompte => ({
  nom: 'Anne', email: 'anne@exemple.org', langue: 'fr', role: 'utilisateur', etat: 'actif', creeLe: '2026-10-01T00:00:00Z', projets: 0, ...p
});

describe('les initiales du profil', () => {
  it('prend la premiere lettre des deux premiers mots, en capitales', () => {
    expect(initiales('Anne Dupont')).toBe('AD');
    expect(initiales('anne')).toBe('A');
    expect(initiales('  Jean-Pierre   Martin ')).toBe('JM');
    expect(initiales('Élodie de la Tour')).toBe('ÉD');
    expect(initiales('李 小龍')).toBe('李小');
  });
  it('rend « ? » sans lettre', () => {
    expect(initiales('')).toBe('?');
    expect(initiales('42 !')).toBe('?');
  });
});

describe('le classement des comptes', () => {
  it('range chaque etat dans son onglet', () => {
    expect(ongletDe('en-attente')).toBe('en-attente');
    expect(ongletDe('actif')).toBe('actifs');
    for (const e of ['a-confirmer', 'refuse', 'suspendu'] as const) expect(ongletDe(e)).toBe('autres');
    expect(ONGLETS).toEqual(['en-attente', 'actifs', 'autres']);
  });

  it('trie les demandes par arrivee, les actifs par nom, les autres par etat puis nom', () => {
    const comptes = [
      fiche({ id: '1', nom: 'zoé', etat: 'actif' }), fiche({ id: '2', nom: 'Émile', etat: 'actif' }), fiche({ id: '3', nom: 'anne', etat: 'actif' }),
      fiche({ id: '4', nom: 'Tard', etat: 'en-attente', confirmeLe: '2026-10-03T00:00:00Z' }), fiche({ id: '5', nom: 'Tôt', etat: 'en-attente', confirmeLe: '2026-10-02T00:00:00Z' }),
      fiche({ id: '6', nom: 'R', etat: 'refuse' }), fiche({ id: '7', nom: 'S', etat: 'suspendu' }), fiche({ id: '8', nom: 'C', etat: 'a-confirmer' }), fiche({ id: '9', nom: 'A', etat: 'refuse' })
    ];
    const t = comptesParOnglet(comptes);
    expect(t.actifs.map(c => c.nom)).toEqual(['anne', 'Émile', 'zoé']);
    expect(t['en-attente'].map(c => c.nom)).toEqual(['Tôt', 'Tard']);
    expect(t.autres.map(c => c.nom)).toEqual(['C', 'S', 'A', 'R']);
  });

  it('propose les gestes de l etat, et confirme les gestes lourds dans la ligne', () => {
    expect(actionsPour(fiche({ id: '1', etat: 'en-attente' }))).toEqual(['approuver', 'refuser']);
    expect(actionsPour(fiche({ id: '1', etat: 'actif' }))).toEqual(['suspendre', 'promouvoir', 'email', 'supprimer']);
    expect(actionsPour(fiche({ id: '1', etat: 'actif', role: 'admin' }))).toEqual(['suspendre', 'retrograder', 'email', 'supprimer']);
    expect(actionsPour(fiche({ id: '1', etat: 'a-confirmer' }))).toEqual(['renvoyer', 'supprimer']);
    expect(actionsPour(fiche({ id: '1', etat: 'suspendu' }))).toEqual(['reactiver', 'supprimer']);
    expect(actionsPour(fiche({ id: '1', etat: 'refuse' }))).toEqual(['reactiver', 'supprimer']);
    for (const a of ACTIONS_CONFIRMEES) expect(LIBELLES_ACTIONS[a].endsWith('…'), a).toBe(true);
    for (const a of ['approuver', 'reactiver', 'renvoyer'] as const) expect(LIBELLES_ACTIONS[a].endsWith('…'), a).toBe(false);
  });

  it('refuse d avance soi-meme et le dernier administrateur actif, pour suspendre, retrograder et supprimer seulement', () => {
    const moi = fiche({ id: 'moi', role: 'admin' }), autre = fiche({ id: 'autre', role: 'admin' }), simple = fiche({ id: 's' });
    expect(raisonRefus('supprimer', moi, 'moi', [moi, autre])).toMatch(/votre propre compte/);
    expect(raisonRefus('email', moi, 'moi', [moi, autre])).toBeNull();
    expect(raisonRefus('retrograder', autre, 'moi', [moi, autre])).toBeNull();
    expect(raisonRefus('retrograder', autre, 'moi', [autre, simple])).toMatch(/dernier administrateur/);
    expect(raisonRefus('suspendre', autre, 'moi', [autre, fiche({ id: 'x', role: 'admin', etat: 'suspendu' })])).toMatch(/dernier administrateur/);
    expect(raisonRefus('supprimer', simple, 'moi', [moi, simple])).toBeNull();
    expect(raisonRefus('approuver', moi, 'moi', [moi])).toBeNull();
  });

  it('a une phrase complete pour chaque geste abouti', () => {
    const actions = Object.keys(LIBELLES_ACTIONS) as ActionCompte[];
    for (const a of actions) {
      const p = phraseAction(a, 'Anne');
      expect(p, a).toContain('« Anne »');
      expect(p.endsWith('.'), a).toBe(true);
    }
  });
});

describe('les formulaires', () => {
  it('normalise un nom et le borne a 120 caracteres', () => {
    expect(nomDeCompte('  Anne   Dupont ')).toBe('Anne Dupont');
    expect(nomDeCompte('x'.repeat(130))).toHaveLength(120);
    expect(validerProfil('   ')).toEqual({ nom: 'Le nom ne peut pas être vide.' });
    expect(validerProfil('Anne')).toEqual({});
  });

  it('juge une adresse plausible sans etre tatillon : le serveur tranche', () => {
    expect(emailValide('anne@exemple.org')).toBe(true);
    expect(emailValide('anne+svg@sous.exemple.org')).toBe(true);
    expect(emailValide('anne@exemple')).toBe(false);
    expect(emailValide('anne exemple.org')).toBe(false);
    expect(emailValide('')).toBe(false);
    expect(validerEmail(' anne@exemple.org ')).toEqual({});
    expect(validerEmail('x')).toHaveProperty('email');
  });

  it('exige l ancien mot de passe, dix caracteres au moins, et deux saisies egales, chaque erreur sur son champ', () => {
    expect(validerMotDePasse('ancien-secret', 'nouveau-secret', 'nouveau-secret')).toEqual({});
    expect(Object.keys(validerMotDePasse('', 'court', 'autre'))).toEqual(['ancien', 'nouveau', 'confirmation']);
    expect(validerMotDePasse('a', 'x'.repeat(10), 'x'.repeat(10))).toEqual({});
    expect(validerMotDePasse('meme-secret', 'meme-secret', 'meme-secret')).toEqual({ nouveau: 'Le nouveau mot de passe est le même que l’ancien.' });
    expect(validerMotDePasse('a', 'nouveau-secret', 'nouveau-secre')).toEqual({ confirmation: 'Les deux saisies du nouveau mot de passe diffèrent.' });
  });

  it('valide la creation d un compte : adresse, nom, mot de passe provisoire', () => {
    expect(validerCreation({ email: 'b@exemple.org', nom: 'B', langue: 'en', motDePasse: 'provisoire-10' })).toEqual({});
    expect(Object.keys(validerCreation({ email: 'b', nom: ' ', langue: 'fr', motDePasse: 'court' }))).toEqual(['email', 'nom', 'motDePasse']);
  });

  it('valide les reglages : nom, adresse https ou vide, expediteur, et SMTP seulement en mode SMTP', () => {
    expect(validerReglages(REGLAGES_PAR_DEFAUT)).toEqual({});
    const r = { ...REGLAGES_PAR_DEFAUT, site: { ...REGLAGES_PAR_DEFAUT.site, nom: ' ', adresse: 'exemple.org' }, courrier: { ...REGLAGES_PAR_DEFAUT.courrier, expediteur: 'x' } };
    expect(Object.keys(validerReglages(r))).toEqual(['nom', 'adresse', 'expediteur']);
    const smtp = { ...REGLAGES_PAR_DEFAUT, courrier: { ...REGLAGES_PAR_DEFAUT.courrier, mode: 'smtp' as const, smtp: { ...REGLAGES_PAR_DEFAUT.courrier.smtp, port: 0 } } };
    expect(Object.keys(validerReglages(smtp))).toEqual(['hote', 'port']);
    const ok = { ...smtp, courrier: { ...smtp.courrier, smtp: { ...smtp.courrier.smtp, hote: 'smtp.exemple.org', port: 587 } } };
    expect(validerReglages(ok)).toEqual({});
    expect(validerReglages({ ...REGLAGES_PAR_DEFAUT, site: { ...REGLAGES_PAR_DEFAUT.site, adresse: 'https://exemple.org/svg/' } })).toEqual({});
  });
});
