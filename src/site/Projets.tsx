// L'ecran « Projets » du site (ADR-0030) : les projets enregistres sur le serveur, ouverts, renommes, dupliques, supprimes ; un
// projet neuf, vierge ou a partir d'un fichier, d'une image, d'une forme. Une seule action pleine : « Nouveau projet » (ADR-0006) ;
// renommer et supprimer s'ouvrent dans la ligne, au clavier comme a la souris, jamais dans une fenetre qui piege le focus.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { MetaProjet } from '../io/serveur.js';
import { EtatVide } from '../zones/commun/EtatVide.js';
import { Message, type TonMessage } from '../zones/commun/Message.js';
import { dateCourte } from '../zones/session.js';
import { nomDeProjet } from '../model/projet.js';
import { locale, t } from '../util/i18n.js';

/** Ce que l'ecran demande au site : chaque geste rend une promesse, la phrase a dire en cas d'echec est deja dans le message. */
export interface GestesProjets {
  readonly ouvrir: (m: MetaProjet) => void;
  readonly nouveau: () => void;
  readonly renommer: (m: MetaProjet, nom: string) => Promise<boolean>;
  readonly dupliquer: (m: MetaProjet) => Promise<boolean>;
  readonly supprimer: (m: MetaProjet) => Promise<boolean>;
  readonly vignette: (m: MetaProjet) => string;
}

/** Les mega-octets a une decimale, toujours ecrite (« 1,0 Mo »), avec le separateur de la langue (ADR-0042). */
const mega = (o: number): string => new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(o / 1048576);
const taille = (o: number): string => (o < 1024 ? t('{n} o', { n: o }) : o < 1048576 ? t('{n} Ko', { n: Math.max(1, Math.round(o / 1024)) }) : t('{n} Mo', { n: mega(o) }));
const quand = (iso: string): string => { const t = Date.parse(iso); return Number.isFinite(t) ? dateCourte(t) : ''; };

type Mode = { genre: 'renommer' | 'supprimer'; id: string } | null;

/** Une ligne : la vignette, le nom (qui ouvre), la date et la taille, puis les gestes ; renommer ou supprimer s'ouvrent ici. */
function LigneProjet({ m, mode, poserMode, gestes }: { m: MetaProjet; mode: Mode; poserMode: (m: Mode) => void; gestes: GestesProjets }) {
  const [nom, poserNom] = useState(m.nom);
  const [occupe, poserOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null), retour = useRef<HTMLButtonElement>(null), confirmer = useRef<HTMLButtonElement>(null);
  const idNom = useId();
  const enCours = mode?.id === m.id ? mode.genre : null;
  useEffect(() => {
    if (enCours === 'renommer') { champ.current?.focus(); champ.current?.select(); }
    if (enCours === 'supprimer') confirmer.current?.focus();
  }, [enCours]);
  const fermer = () => { poserMode(null); requestAnimationFrame(() => retour.current?.focus()); };
  const valider = async (e: FormEvent) => {
    e.preventDefault();
    poserOccupe(true);
    const ok = await gestes.renommer(m, nomDeProjet(nom));
    poserOccupe(false);
    if (ok) fermer();
  };
  return (
    <li className="projet">
      {m.vignette ? <img className="projet-vignette" src={gestes.vignette(m)} alt="" loading="lazy" /> : <span className="projet-vignette vide" aria-hidden="true" />}
      <div className="projet-infos">
        {enCours === 'renommer' ? (
          <form className="projet-renommer" onSubmit={e => { void valider(e); }}>
            <label htmlFor={idNom}>{t('Nouveau nom de « {nom} »', { nom: m.nom })}</label>
            <input id={idNom} ref={champ} type="text" value={nom} maxLength={120} onChange={e => poserNom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fermer(); } }} />
            <div className="actions">
              <button type="submit" disabled={occupe}>{t('Renommer')}</button>
              <button type="button" className="discret" onClick={fermer}>{t('Annuler')}</button>
            </div>
          </form>
        ) : (
          <h3 className="projet-nom"><button type="button" className="lien-projet" onClick={() => gestes.ouvrir(m)}>{m.nom}</button></h3>
        )}
        <p className="aide">{t('Modifié le {date} · {taille}', { date: quand(m.modifieLe), taille: taille(m.taille) })}</p>
        {enCours === 'supprimer' ? (
          <div className="projet-supprimer" role="group" aria-label={t('Supprimer « {nom} »', { nom: m.nom })}>
            <p>{t('Supprimer « {nom} » ? Il part dans la corbeille du serveur, d’où l’administrateur peut le reprendre.', { nom: m.nom })}</p>
            <div className="actions">
              <button type="button" ref={confirmer} disabled={occupe} onClick={() => { poserOccupe(true); void gestes.supprimer(m).then(ok => { poserOccupe(false); if (ok) poserMode(null); }); }}>{t('Supprimer')}</button>
              <button type="button" className="discret" onClick={fermer}>{t('Annuler')}</button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="actions projet-actions">
        <button type="button" onClick={() => gestes.ouvrir(m)} aria-label={t('Ouvrir « {nom} »', { nom: m.nom })}>{t('Ouvrir')}</button>
        <button type="button" ref={retour} onClick={() => { poserNom(m.nom); poserMode({ genre: 'renommer', id: m.id }); }} aria-label={t('Renommer « {nom} »', { nom: m.nom })}>{t('Renommer')}</button>
        <button type="button" disabled={occupe} onClick={() => { poserOccupe(true); void gestes.dupliquer(m).then(() => poserOccupe(false)); }} aria-label={t('Dupliquer « {nom} »', { nom: m.nom })}>{t('Dupliquer')}</button>
        <button type="button" className="discret" onClick={() => poserMode({ genre: 'supprimer', id: m.id })} aria-label={t('Supprimer « {nom} »', { nom: m.nom })}>{t('Supprimer')}</button>
      </div>
    </li>
  );
}

interface Proprietes {
  projets: readonly MetaProjet[] | null;
  message: { texte: string; ton: TonMessage };
  gestes: GestesProjets;
  /** Le jeton CSRF de la session, pour le formulaire de deconnexion (un vrai formulaire : il marche meme si le script a echoue). */
  csrf: string;
  /** Le menu du profil (ADR-0041), en haut a droite ; null quand la page n'a pas pu dire qui est connecte : la deconnexion reste. */
  menu: ReactNode;
  /** Les voies pour commencer d'un fichier, d'une image, d'une forme (celles de la page autonome). */
  voies: ReactNode;
  pied: ReactNode;
}

export function EcranProjets({ projets, message, gestes, csrf, menu, voies, pied }: Proprietes) {
  const [mode, poserMode] = useState<Mode>(null);
  return (
    <main className="accueil site-projets">
      <header className="tete site-tete">
        <div>
          <h1>{t('Mes projets')}</h1>
          <p>{t('Vos dessins enregistrés sur ce site, avec tout ce qu’il faut pour les rouvrir à l’identique. Le SVG, le PDF et les autres formats se téléchargent depuis l’éditeur.')}</p>
        </div>
        {menu ?? (
          <form method="post" action="index.php" className="site-deconnexion">
            <input type="hidden" name="action" value="deconnexion" />
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit" className="discret">{t('Se déconnecter')}</button>
          </form>
        )}
      </header>
      {message.texte ? <Message ton={message.ton}>{message.texte}</Message> : null}
      <section className="projets" aria-labelledby="titre-projets">
        <div className="projets-tete">
          <h2 id="titre-projets">{t('Projets enregistrés')} {projets ? <span className="aide">{projets.length}</span> : null}</h2>
          <button type="button" className="primaire" onClick={gestes.nouveau}>{t('Nouveau projet')}</button>
        </div>
        {projets === null ? <p className="aide" role="status">{t('Chargement des projets…')}</p>
          : projets.length === 0 ? (
            <EtatVide genre="premiere-fois" icone="ouvrir" titre={t('Aucun projet enregistré pour l’instant.')}>
              {t('Commencez un projet vierge, ou à partir d’un fichier, d’une image ou d’une forme ci-dessous : « Enregistrer » le gardera ici.')}
            </EtatVide>
          ) : (
            <ul className="liste-projets">
              {projets.map(m => <LigneProjet key={m.id + ':' + m.revision} m={m} mode={mode} poserMode={poserMode} gestes={gestes} />)}
            </ul>
          )}
      </section>
      {voies}
      {pied}
    </main>
  );
}
