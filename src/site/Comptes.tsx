// L'ecran « Comptes » (ADR-0041 §5), pour un administrateur : un `main` a la place de « Mes projets », trois onglets (En attente,
// Actifs, Autres), une ligne par compte avec ses dates et ses gestes. Un geste lourd se confirme dans la ligne, au clavier comme a
// la souris, jamais dans une fenetre du navigateur ; un refus de refuser porte sa raison, d'une ligne. « Approuver » est la seule
// action pleine (ADR-0006). Le serveur tranche (dernier administrateur, soi-meme) et sa phrase se montre telle quelle.

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ActionCompte, Compte, FicheCompte, Langue, Serveur } from '../io/serveur.js';
import { EtatVide } from '../zones/commun/EtatVide.js';
import { Message, type TonMessage } from '../zones/commun/Message.js';
import { focusAuClavier } from '../zones/commun/focusClavier.js';
import { locale, t } from '../util/i18n.js';
import {
  ACTIONS_CONFIRMEES, LIBELLES_ACTIONS, LIBELLES_ETATS, LIBELLES_LANGUES, MOT_DE_PASSE_MIN, NOM_MAX, ONGLETS, TITRES_ONGLETS, actionsPour, comptesParOnglet,
  nomDeCompte, phraseAction, raisonRefus, validerCreation, validerEmail, type Onglet
} from './comptesSite.js';
import { Champ, ChoixLangue, type Retour } from './Formulaire.js';

/** Une date du serveur, dans la langue de l'interface, avec l'annee ; vide si elle ne se lit pas. */
const dateLongue = (iso: string | undefined): string => {
  const instant = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(instant) ? new Date(instant).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
};

/** Un geste qui part au serveur : la phrase du succes est deja connue, celle de l'echec vient du serveur. */
type Agir = (action: ActionCompte, c: FicheCompte, corps?: Record<string, unknown>) => Promise<boolean>;
type Mode = { action: ActionCompte; id: string } | null;

/** Le texte d'une confirmation, lu au moment de l'afficher (ADR-0042) ; undefined pour un geste qui part sans confirmation. */
function texteConfirmation(action: ActionCompte): string | undefined {
  switch (action) {
    case 'refuser': return t('Refuser cette demande ? La personne reçoit un mail, avec la raison si vous en donnez une.');
    case 'suspendre': return t('Suspendre ce compte ? La personne ne pourra plus se connecter tant que vous ne le réactivez pas ; ses projets restent.');
    case 'supprimer': return t('Supprimer ce compte ? Ses projets partent dans la corbeille des comptes du serveur ; la personne pourra se réinscrire.');
    case 'promouvoir': return t('Nommer cette personne administrateur ? Elle pourra approuver des comptes et changer les réglages du site.');
    case 'retrograder': return t('Retirer l’administration à cette personne ? Elle garde son compte et ses projets.');
    case 'email': return t('Changer l’adresse de ce compte ? La personne se connectera avec la nouvelle adresse.');
    default: return undefined;
  }
}

/** La confirmation dans la ligne : un texte, un champ pour une raison ou une adresse, « Confirmer » puis « Annuler ». */
function ConfirmationLigne({ action, c, agir, fermer }: { action: ActionCompte; c: FicheCompte; agir: Agir; fermer: () => void }) {
  const [valeur, poserValeur] = useState(action === 'email' ? c.email : '');
  const [erreur, poserErreur] = useState<string | undefined>(undefined);
  const [occupe, poserOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null), bouton = useRef<HTMLButtonElement>(null);
  useEffect(() => { (champ.current ?? bouton.current)?.focus(); }, []);
  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const email = valeur.trim();
    if (action === 'email') {
      const err = validerEmail(email).email;
      poserErreur(err);
      if (err) { champ.current?.focus(); return; }
    }
    poserOccupe(true);
    const corps = action === 'email' ? { email } : action === 'refuser' && valeur.trim() ? { raison: valeur.trim().slice(0, 200) } : {};
    const ok = await agir(action, c, corps);
    poserOccupe(false);
    if (!ok) fermer();
  };
  return (
    <form className="compte-confirmer" role="group" aria-label={t('{action} « {nom} »', { action: LIBELLES_ACTIONS[action].replace('…', ''), nom: c.nom })} onSubmit={e => { void envoyer(e); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); } }}>
      <p>{texteConfirmation(action)}</p>
      {action === 'refuser' ? <Champ libelle={t('Raison (facultative, une ligne)')} valeur={valeur} poser={poserValeur} maxLength={200} reference={champ} /> : null}
      {action === 'email' ? <Champ libelle={t('Nouvelle adresse')} type="email" valeur={valeur} poser={poserValeur} autoComplete="off" erreur={erreur} reference={champ} /> : null}
      <div className="actions">
        <button type="submit" ref={bouton} disabled={occupe} className={action === 'supprimer' ? 'danger' : undefined}>{LIBELLES_ACTIONS[action].replace('…', '')}</button>
        <button type="button" className="discret" onClick={fermer}>{t('Annuler')}</button>
      </div>
    </form>
  );
}

function LigneCompte({ c, moi, comptes, onglet, mode, poserMode, agir }: { c: FicheCompte; moi: string; comptes: readonly FicheCompte[]; onglet: Onglet; mode: Mode; poserMode: (m: Mode) => void; agir: Agir }) {
  const [occupe, poserOccupe] = useState(false);
  // Le bouton qui a ouvert la confirmation garde la reference apres la fermeture : le focus y revient (ADR-0011).
  const retour = useRef<HTMLButtonElement>(null), ouverte = useRef<ActionCompte | null>(null);
  const enCours = mode?.id === c.id ? mode.action : null;
  const fermer = () => { poserMode(null); requestAnimationFrame(() => retour.current?.focus()); };
  const ouvrir = (action: ActionCompte) => { ouverte.current = action; poserMode({ action, id: c.id }); };
  const direct = (action: ActionCompte) => { poserOccupe(true); void agir(action, c).then(() => poserOccupe(false)); };
  const dates = [
    [t('Inscrit le'), c.creeLe], [t('Adresse confirmée le'), c.confirmeLe], [t('Approuvé le'), c.approuveLe], [t('Dernière connexion le'), c.derniereConnexion]
  ].map(([l, d]) => [l, dateLongue(d)]).filter(([, d]) => d);
  return (
    <li className="compte">
      <div className="compte-infos">
        <p className="compte-nom">
          <strong>{c.nom}</strong>
          {c.role === 'admin' ? <span className="compte-marque">{t('Administrateur')}</span> : null}
          {c.id === moi ? <span className="compte-marque">{t('Vous')}</span> : null}
          {onglet === 'autres' ? <span className="compte-marque etat">{LIBELLES_ETATS[c.etat]}</span> : null}
        </p>
        <p className="compte-email">{c.email} · <span lang={c.langue}>{LIBELLES_LANGUES[c.langue]}</span></p>
        <p className="aide">{dates.map(([l, d]) => l + ' ' + d).join(' · ')}{dates.length ? ' · ' : ''}{c.projets === 1 ? t('1 projet') : t('{n} projets', { n: c.projets })}</p>
        {enCours ? <ConfirmationLigne key={enCours} action={enCours} c={c} agir={agir} fermer={fermer} /> : null}
      </div>
      <div className="actions compte-actions">
        {actionsPour(c).map(action => {
          const raison = raisonRefus(action, c, moi, comptes);
          const confirme = ACTIONS_CONFIRMEES.includes(action);
          return (
            <button key={action} type="button" ref={ouverte.current === action ? retour : undefined} disabled={occupe || raison !== null} title={raison ?? undefined}
              className={action === 'approuver' ? 'primaire' : action === 'supprimer' ? 'discret' : undefined} aria-label={t('{action} « {nom} »', { action: LIBELLES_ACTIONS[action], nom: c.nom })}
              onClick={() => (confirme ? ouvrir(action) : direct(action))}>
              {LIBELLES_ACTIONS[action]}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** « Créer un compte… » : une carte sous l'en-tete ; le compte nait actif, avec un mot de passe provisoire a transmettre. */
function FormulaireCreation({ agir, fermer }: { agir: (corps: Record<string, unknown>) => Promise<boolean>; fermer: () => void }) {
  const [email, poserEmail] = useState(''), [nom, poserNom] = useState(''), [langue, poserLangue] = useState<Langue>('fr'), [motDePasse, poserMotDePasse] = useState('');
  const [erreurs, poserErreurs] = useState<ReturnType<typeof validerCreation>>({});
  const [occupe, poserOccupe] = useState(false);
  const premier = useRef<HTMLInputElement>(null), idTitre = useId();
  useEffect(() => { premier.current?.focus(); }, []);
  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const err = validerCreation({ email, nom, langue, motDePasse });
    poserErreurs(err);
    if (Object.keys(err).length) return;
    poserOccupe(true);
    const ok = await agir({ email: email.trim(), nom: nomDeCompte(nom), langue, motDePasse });
    poserOccupe(false);
    if (ok) fermer();
  };
  return (
    <form className="carte-site formulaire-site creation-compte" aria-labelledby={idTitre} onSubmit={e => { void envoyer(e); }}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fermer(); } }}>
      <h2 id={idTitre}>{t('Créer un compte')}</h2>
      <p className="aide">{t('Pour une personne qui ne peut pas s’inscrire elle-même (sans mail qui parte, par exemple) : le compte est actif tout de suite, sans confirmation ni approbation. Transmettez-lui le mot de passe provisoire ; elle le changera dans son profil.')}</p>
      <Champ libelle={t('Adresse de courrier')} type="email" valeur={email} poser={poserEmail} autoComplete="off" erreur={erreurs.email} reference={premier} />
      <Champ libelle={t('Nom')} valeur={nom} poser={poserNom} maxLength={NOM_MAX} autoComplete="off" erreur={erreurs.nom} />
      <ChoixLangue legende={t('Langue')} valeur={langue} poser={poserLangue} nom="langue-creation" />
      <Champ libelle={t('Mot de passe provisoire')} type="text" valeur={motDePasse} poser={poserMotDePasse} autoComplete="off" erreur={erreurs.motDePasse} aide={t('{min} caractères au moins.', { min: MOT_DE_PASSE_MIN })} />
      <div className="actions">
        <button type="submit" disabled={occupe}>{t('Créer le compte')}</button>
        <button type="button" className="discret" onClick={fermer}>{t('Annuler')}</button>
      </div>
    </form>
  );
}

/** Les trois onglets : un `tablist`, les fleches passent de l'un a l'autre, chaque onglet dit son nombre. */
function Onglets({ base, onglet, poserOnglet, nombres }: { base: string; onglet: Onglet; poserOnglet: (o: Onglet) => void; nombres: Readonly<Record<Onglet, number>> }) {
  return (
    <div className="onglets" role="tablist" aria-label={t('Comptes par état')}>
      {ONGLETS.map((id, i) => (
        <button key={id} type="button" role="tab" id={base + id} aria-selected={onglet === id} aria-controls={base + 'panneau-' + id} tabIndex={onglet === id ? 0 : -1} className="onglet"
          onClick={() => poserOnglet(id)}
          onKeyDown={e => {
            const pas = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!pas) return;
            e.preventDefault();
            const suite = ONGLETS[(i + pas + ONGLETS.length) % ONGLETS.length];
            if (suite) { poserOnglet(suite); focusAuClavier(document.getElementById(base + suite)); }
          }}>
          {TITRES_ONGLETS[id]} <span className="onglet-nombre">{nombres[id]}</span>
        </button>
      ))}
    </div>
  );
}

/** Le titre et le texte d'un onglet vide, lus au moment de l'afficher (ADR-0042). */
function videDe(onglet: Onglet): readonly [string, string] {
  switch (onglet) {
    case 'en-attente': return [t('Aucune demande en attente.'), t('Quand une personne s’inscrit et confirme son adresse, sa demande apparaît ici, et vous recevez un mail.')];
    case 'actifs': return [t('Aucun compte actif.'), t('Les comptes approuvés, qui peuvent se connecter, se trouvent ici.')];
    case 'autres': return [t('Aucun compte à confirmer, suspendu ou refusé.'), t('Les inscriptions dont l’adresse n’est pas confirmée, les comptes suspendus et les demandes refusées se trouvent ici.')];
  }
}

interface Proprietes {
  serveur: Serveur;
  moi: Compte;
  retour: () => void;
  /** Apres un geste qui a abouti : la page recompte les demandes en attente (la pastille du menu). */
  apresChangement: () => void;
}

export function EcranComptes({ serveur, moi, retour, apresChangement }: Proprietes) {
  const [comptes, poserComptes] = useState<readonly FicheCompte[] | null>(null);
  const [onglet, poserOnglet] = useState<Onglet>('en-attente');
  const [message, poserMessage] = useState<Retour>(null);
  const [mode, poserMode] = useState<Mode>(null);
  const [creation, poserCreation] = useState(false);
  const titre = useRef<HTMLHeadingElement>(null), idPanneau = useId();
  const dire = useCallback((texte: string, ton: TonMessage = 'alerte') => poserMessage({ texte, ton }), []);
  useEffect(() => { titre.current?.focus(); }, []);

  const recharger = useCallback(async () => {
    const r = await serveur.comptes();
    // Une session expiree ramene a la connexion, qui le dit ; rien n'est ouvert ici.
    if (!r.ok && r.code === 'session') { window.location.reload(); return; }
    if (r.ok) poserComptes(r.valeur); else { poserComptes(c => c ?? []); dire(r.message); }
  }, [serveur, dire]);
  useEffect(() => { void recharger(); }, [recharger]);

  const agir = useCallback<Agir>(async (action, c, corps) => {
    const r = await serveur.actionCompte(action, c.id, corps);
    if (!r.ok) { dire(r.message); return false; }
    poserMode(null);
    dire(phraseAction(action, c.nom), 'info');
    await recharger();
    apresChangement();
    return true;
  }, [serveur, dire, recharger, apresChangement]);

  const creer = useCallback(async (corps: Record<string, unknown>) => {
    const r = await serveur.actionCompte('creer', null, corps);
    if (!r.ok) { dire(r.message); return false; }
    dire(phraseAction('creer', r.valeur?.nom ?? String(corps['nom'] ?? '')), 'info');
    poserOnglet('actifs');
    await recharger();
    return true;
  }, [serveur, dire, recharger]);

  const parOnglet = comptesParOnglet(comptes ?? []);
  const nombres = { 'en-attente': parOnglet['en-attente'].length, actifs: parOnglet.actifs.length, autres: parOnglet.autres.length };
  const liste = parOnglet[onglet], [titreVide, texteVide] = videDe(onglet);
  return (
    <main className="accueil site-comptes">
      <header className="tete site-tete">
        <div>
          <p className="fil-retour"><button type="button" className="discret" onClick={retour}>{t('← Mes projets')}</button></p>
          <h1 ref={titre} tabIndex={-1}>{t('Comptes')}</h1>
          <p>{t('Les personnes inscrites sur ce site : approuvez les demandes, suspendez ou réactivez un compte, nommez un autre administrateur. Vous voyez le nombre de projets de chacun, jamais leur contenu.')}</p>
        </div>
        <div className="actions">
          <button type="button" onClick={() => poserCreation(c => !c)} aria-expanded={creation}>{t('Créer un compte…')}</button>
        </div>
      </header>
      {creation ? <FormulaireCreation agir={creer} fermer={() => poserCreation(false)} /> : null}
      {message ? <Message ton={message.ton}>{message.texte}</Message> : null}
      <section className="carte-site comptes">
        <Onglets base={idPanneau} onglet={onglet} poserOnglet={o => { poserOnglet(o); poserMode(null); }} nombres={nombres} />
        <div role="tabpanel" id={idPanneau + 'panneau-' + onglet} aria-labelledby={idPanneau + onglet}>
          {comptes === null ? <p className="aide" role="status">{t('Chargement des comptes…')}</p>
            : liste.length === 0 ? <EtatVide genre="vide" titre={titreVide}>{texteVide}</EtatVide>
              : <ul className="liste-comptes">{liste.map(c => <LigneCompte key={c.id} c={c} moi={moi.id} comptes={comptes} onglet={onglet} mode={mode} poserMode={poserMode} agir={agir} />)}</ul>}
        </div>
      </section>
    </main>
  );
}
