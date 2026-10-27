// Les gestes que l'ecran des projets demande au serveur du site (ADR-0030) : renommer, dupliquer, supprimer, puis le partage
// (ADR-0043) : partager en lecture, retirer, envoyer une copie, et pour les projets recus, ouvrir en lecture, copier chez soi,
// retirer de sa liste. Chacun dit son resultat dans le message de l'ecran et recharge les listes ; un echec dit la phrase du serveur.
// A part de Site.tsx pour que chaque fonction reste lisible.

import type { Partage, ProjetRecu, Serveur } from '../io/serveur.js';
import type { TonMessage } from '../zones/commun/Message.js';
import type { EtatEnregistrement } from '../zones/EditeurSvg.js';
import { t } from '../util/i18n.js';
import type { GestesProjets } from './Projets.js';
import { travailDuProjet, type TravailOuvert } from './projetSite.js';

interface Hote {
  readonly serveur: Serveur;
  readonly dire: (texte: string, ton?: TonMessage) => void;
  readonly recharger: () => Promise<void>;
  readonly ouvrirTravail: (t: TravailOuvert) => void;
  readonly poserEnregistrement: (e: EtatEnregistrement) => void;
}

/** Tout ce que l'ecran demande, sauf ouvrir un de ses projets et en commencer un neuf, qui restent au site. */
type GestesDuServeur = Omit<GestesProjets, 'ouvrir' | 'nouveau'>;

/** La personne d'un partage, par l'adresse tapee : son nom si le serveur la rend dans la liste, l'adresse sinon. */
const qui = (liste: readonly Partage[], email: string): string => liste.find(p => p.email.toLowerCase() === email.toLowerCase())?.nom ?? email;

export function gestesDuServeur({ serveur, dire, recharger, ouvrirTravail, poserEnregistrement }: Hote): GestesDuServeur {
  /**
   * Un projet recu en lecture : ouvert comme un projet enregistre (fermer sans l'avoir modifie ne demande rien) ; la premiere
   * modification rend « Enregistrer une copie » actif, et « Enregistrer sous… » en garde une a tout moment.
   */
  const ouvrirRecu = async (p: ProjetRecu) => {
    dire(t('Ouverture de « {nom} »…', { nom: p.nom }), 'info');
    const r = await serveur.ouvrir(p.id, p.proprietaire.id);
    if (!r.ok) { dire(r.message); await recharger(); return; }
    const lu = travailDuProjet(r.valeur.projet, p.id, r.valeur.revision);
    if ('erreur' in lu) { dire(lu.erreur); return; }
    ouvrirTravail({ ...lu.travail, lecture: { titulaire: p.proprietaire.nom } });
    poserEnregistrement({ etat: 'enregistre', message: t('« {nom} » est partagé par {personne}, en lecture : si vous le modifiez, « Enregistrer une copie » garde votre version dans vos projets, sans toucher au sien.', { nom: p.nom, personne: p.proprietaire.nom }) });
  };
  return {
    renommer: async (m, nom) => {
      const r = await serveur.renommer(m.id, nom);
      if (!r.ok) { dire(r.message); return false; }
      dire(t('Projet renommé : « {nom} ».', { nom: r.valeur.nom }), 'info'); await recharger(); return true;
    },
    dupliquer: async m => {
      const r = await serveur.dupliquer(m.id);
      if (!r.ok) { dire(r.message); return false; }
      dire(t('Copie créée : « {nom} ».', { nom: r.valeur.nom }), 'info'); await recharger(); return true;
    },
    supprimer: async m => {
      const r = await serveur.supprimer(m.id);
      if (!r.ok) { dire(r.message); return false; }
      dire(t('Projet « {nom} » mis à la corbeille.', { nom: m.nom }), 'info'); await recharger(); return true;
    },
    vignette: m => serveur.adresseVignette(m),
    partages: async m => {
      const r = await serveur.partages(m.id);
      if (!r.ok) { dire(r.message); return null; }
      return r.valeur;
    },
    partager: async (m, email) => {
      const r = await serveur.partager(m.id, email);
      if (!r.ok) { dire(r.message); return null; }
      const valeurs = { projet: m.nom, personne: qui(r.valeur.partages, email) };
      dire(r.valeur.courrier ? t('« {projet} » est partagé en lecture avec {personne}. Un mail lui a été envoyé.', valeurs) : t('« {projet} » est partagé en lecture avec {personne}, mais le mail n’a pas pu partir.', valeurs), r.valeur.courrier ? 'info' : 'alerte');
      await recharger(); return r.valeur.partages;
    },
    retirerPartage: async (m, p) => {
      const r = await serveur.retirerPartage(m.id, p.id);
      if (!r.ok) { dire(r.message); return null; }
      dire(t('« {projet} » n’est plus partagé avec {personne}.', { projet: m.nom, personne: p.nom }), 'info'); await recharger(); return r.valeur;
    },
    envoyerCopie: async (m, email) => {
      const r = await serveur.envoyerCopie(m.id, email);
      if (!r.ok) { dire(r.message); return false; }
      const valeurs = { projet: m.nom, personne: r.valeur.nom };
      dire(r.valeur.courrier ? t('Une copie de « {projet} » est dans les projets de {personne}. Un mail lui a été envoyé.', valeurs) : t('Une copie de « {projet} » est dans les projets de {personne}, mais le mail n’a pas pu partir.', valeurs), r.valeur.courrier ? 'info' : 'alerte');
      return true;
    },
    ouvrirRecu: p => { void ouvrirRecu(p); },
    copierRecu: async p => {
      const r = await serveur.dupliquer(p.id, p.proprietaire.id);
      if (!r.ok) { dire(r.message); await recharger(); return false; }
      dire(t('Copie créée : « {nom} ».', { nom: r.valeur.nom }), 'info'); await recharger(); return true;
    },
    quitterRecu: async p => {
      const r = await serveur.quitterPartage(p.id, p.proprietaire.id);
      if (!r.ok) { dire(r.message); await recharger(); return false; }
      dire(t('« {nom} » est retiré de votre liste.', { nom: p.nom }), 'info'); await recharger(); return true;
    }
  };
}
