// « Réglages du site » (ADR-0041 §7), pour un administrateur : le formulaire de config.json, a la place de « Mes projets ». Le nom, la
// langue par defaut et l'adresse du site, les inscriptions, le courrier (expediteur, mode mail / SMTP, le serveur SMTP) ; le mot de
// passe SMTP ne revient jamais du serveur : laisse vide, il ne change pas. « Envoyer un mail d'essai » dit si le courrier part,
// « Enregistrer » est la seule action pleine (ADR-0006).

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Compte, ModeCourrier, Reglages, SecuriteSmtp, Serveur } from '../io/serveur.js';
import { Message } from '../zones/commun/Message.js';
import { NOM_MAX, validerReglages, type ChampReglages, type Erreurs } from './comptesSite.js';
import { Case, Champ, ChoixLangue, RetourFormulaire, type Retour } from './Formulaire.js';

const MODES: readonly [ModeCourrier, string, string][] = [
  ['mail', 'La fonction mail() de l’hébergeur', 'Le plus simple ; certains hébergeurs ne la proposent pas, ou classent ses messages en indésirables.'],
  ['smtp', 'Un serveur SMTP', 'Le serveur de votre hébergeur ou d’un service d’envoi, avec un compte.'],
  ['fichier', 'Aucun envoi : chaque message est écrit dans data/journal/courrier/', 'Pour essayer le site sans courrier ; l’inscription en libre-service ne fonctionne pas.']
];
const SECURITES: readonly [SecuriteSmtp, string][] = [['starttls', 'STARTTLS (port 587, le plus courant)'], ['ssl', 'SSL implicite (port 465)'], ['aucune', 'Aucune (réseau local seulement)']];

/** Le choix du mode de courrier : des boutons radio, chacun avec une ligne d'explication. */
function ChoixMode({ valeur, poser }: { valeur: ModeCourrier; poser: (m: ModeCourrier) => void }) {
  const nom = useId();
  return (
    <fieldset className="champ-site choix-mode">
      <legend>Envoi des mails</legend>
      {MODES.map(([mode, libelle, aide]) => (
        <label key={mode} className="choix-radio">
          <input type="radio" name={nom} value={mode} checked={valeur === mode} onChange={() => poser(mode)} />
          <span>{libelle}<span className="aide">{aide}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

function ChampsSmtp({ r, poser, erreurs, motDePasse, poserMotDePasse }: { r: Reglages; poser: (r: Reglages) => void; erreurs: Erreurs<ChampReglages>; motDePasse: string; poserMotDePasse: (v: string) => void }) {
  const smtp = r.courrier.smtp, idSecurite = useId();
  const poserSmtp = (p: Partial<Reglages['courrier']['smtp']>) => poser({ ...r, courrier: { ...r.courrier, smtp: { ...smtp, ...p } } });
  return (
    <div className="champs-smtp">
      <Champ libelle="Serveur SMTP" valeur={smtp.hote} poser={v => poserSmtp({ hote: v })} autoComplete="off" erreur={erreurs.hote} />
      <Champ libelle="Port" type="number" min={1} max={65535} valeur={String(smtp.port)} poser={v => poserSmtp({ port: Number(v) })} erreur={erreurs.port} />
      <div className="champ-site">
        <label htmlFor={idSecurite}>Sécurité</label>
        <select id={idSecurite} value={smtp.securite} onChange={e => poserSmtp({ securite: e.target.value as SecuriteSmtp })}>
          {SECURITES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <Champ libelle="Utilisateur" valeur={smtp.utilisateur} poser={v => poserSmtp({ utilisateur: v })} autoComplete="off" />
      <Champ libelle="Mot de passe SMTP" type="password" valeur={motDePasse} poser={poserMotDePasse} autoComplete="new-password"
        aide={r.smtpMotDePassePose ? 'Un mot de passe est enregistré ; laissez vide pour le garder.' : 'Aucun mot de passe enregistré.'} />
    </div>
  );
}

interface Proprietes { serveur: Serveur; moi: Compte; retour: () => void }

export function EcranReglages({ serveur, moi, retour }: Proprietes) {
  const [reglages, poserReglages] = useState<Reglages | null>(null);
  const [motDePasse, poserMotDePasse] = useState('');
  const [erreurs, poserErreurs] = useState<Erreurs<ChampReglages>>({});
  const [message, poserMessage] = useState<Retour>(null);
  const [essai, poserEssai] = useState<Retour>(null);
  const [destinataire, poserDestinataire] = useState(moi.email);
  const [occupe, poserOccupe] = useState(false);
  const titre = useRef<HTMLHeadingElement>(null), idTitre = useId();
  useEffect(() => { titre.current?.focus(); }, []);

  const charger = useCallback(async () => {
    const r = await serveur.reglages();
    if (!r.ok && r.code === 'session') { window.location.reload(); return; }
    if (r.ok) poserReglages(r.valeur); else poserMessage({ texte: r.message, ton: 'alerte' });
  }, [serveur]);
  useEffect(() => { void charger(); }, [charger]);

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault();
    if (!reglages) return;
    const err = validerReglages(reglages);
    poserErreurs(err);
    if (Object.keys(err).length) { poserMessage({ texte: 'Corrigez les champs signalés avant d’enregistrer.', ton: 'alerte' }); return; }
    poserOccupe(true);
    const r = await serveur.poserReglages(reglages, motDePasse);
    poserOccupe(false);
    if (!r.ok) { poserMessage({ texte: r.message, ton: 'alerte' }); return; }
    poserReglages(r.valeur); poserMotDePasse('');
    poserMessage({ texte: 'Réglages enregistrés.', ton: 'info' });
  };

  const envoyerEssai = async () => {
    poserOccupe(true);
    const r = await serveur.courrierEssai(destinataire.trim() || undefined);
    poserOccupe(false);
    poserEssai(r.ok ? { texte: 'Mail d’essai parti vers ' + (destinataire.trim() || moi.email) + ' : vérifiez sa réception (et les indésirables).', ton: 'info' } : { texte: r.message, ton: 'alerte' });
  };

  const r = reglages;
  return (
    <main className="accueil site-reglages">
      <header className="tete site-tete">
        <div>
          <p className="fil-retour"><button type="button" className="discret" onClick={retour}>← Mes projets</button></p>
          <h1 ref={titre} tabIndex={-1}>Réglages du site</h1>
          <p>Le nom et la langue du site, les inscriptions, et comment partent les mails (confirmation d’adresse, approbation, mot de passe oublié). Ces réglages vivent dans data/config/config.json.</p>
        </div>
      </header>
      {message ? <Message ton={message.ton}>{message.texte}</Message> : null}
      {r === null ? <p className="aide" role="status">Chargement des réglages…</p> : (
        <form className="carte-site formulaire-site" aria-labelledby={idTitre} onSubmit={e => { void enregistrer(e); }}>
          <h2 id={idTitre}>Site</h2>
          <Champ libelle="Nom du site" valeur={r.site.nom} poser={v => poserReglages({ ...r, site: { ...r.site, nom: v } })} maxLength={NOM_MAX} erreur={erreurs.nom} />
          <ChoixLangue legende="Langue par défaut (pages avant connexion, visiteurs sans préférence)" valeur={r.site.langue} poser={l => poserReglages({ ...r, site: { ...r.site, langue: l } })} />
          <Champ libelle="Adresse du site" type="url" valeur={r.site.adresse} poser={v => poserReglages({ ...r, site: { ...r.site, adresse: v } })} autoComplete="off" erreur={erreurs.adresse}
            aide="Sert aux liens des mails (https://exemple.org/svg/) ; vide, l’adresse de la page sert." />
          <Case libelle="Inscriptions ouvertes" coche={r.inscriptions.ouvertes} poser={v => poserReglages({ ...r, inscriptions: { ouvertes: v } })}
            aide="Décochée, la page de connexion ne propose plus de s’inscrire ; vous créez les comptes dans l’écran Comptes." />
          <h2>Courrier</h2>
          <Champ libelle="Adresse d’expédition" type="email" valeur={r.courrier.expediteur} poser={v => poserReglages({ ...r, courrier: { ...r.courrier, expediteur: v } })} autoComplete="off" erreur={erreurs.expediteur} />
          <Champ libelle="Nom de l’expéditeur" valeur={r.courrier.nom} poser={v => poserReglages({ ...r, courrier: { ...r.courrier, nom: v } })} maxLength={NOM_MAX} autoComplete="off" />
          <ChoixMode valeur={r.courrier.mode} poser={m => poserReglages({ ...r, courrier: { ...r.courrier, mode: m } })} />
          {r.courrier.mode === 'smtp' ? <ChampsSmtp r={r} poser={poserReglages} erreurs={erreurs} motDePasse={motDePasse} poserMotDePasse={poserMotDePasse} /> : null}
          <div className="essai-courrier" role="group" aria-label="Mail d’essai">
            <Champ libelle="Destinataire du mail d’essai" type="email" valeur={destinataire} poser={poserDestinataire} autoComplete="off" aide="Avec les réglages enregistrés : enregistrez d’abord ce que vous venez de changer." />
            <div className="actions"><button type="button" disabled={occupe} onClick={() => { void envoyerEssai(); }}>Envoyer un mail d’essai</button></div>
            <RetourFormulaire retour={essai} />
          </div>
          <div className="actions">
            <button type="submit" className="primaire" disabled={occupe}>Enregistrer</button>
          </div>
        </form>
      )}
    </main>
  );
}
