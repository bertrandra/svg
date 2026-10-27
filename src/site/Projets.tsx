// L'ecran « Projets » du site (ADR-0030) : les projets enregistres sur le serveur, ouverts, renommes, dupliques, partages (ADR-0043),
// supprimes, puis ceux que d'autres partagent avec la personne ; un projet neuf, vierge ou a partir d'un fichier, d'une image, d'une
// forme. Une seule action pleine : « Nouveau projet » (ADR-0006) ; renommer, partager et supprimer s'ouvrent dans la ligne, au clavier
// comme a la souris, jamais dans une fenetre qui piege le focus.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { MetaProjet, ProjetRecu } from '../io/serveur.js';
import { EtatVide } from '../zones/commun/EtatVide.js';
import { Message, type TonMessage } from '../zones/commun/Message.js';
import { nomDeProjet } from '../model/projet.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';
import { quand, taille } from './fiche.js';
import { PanneauPartage, type GestesPartage } from './Partage.js';
import { SectionRecus, type GestesRecus } from './PartagesRecus.js';

/** Ce que l'ecran demande au site : chaque geste rend une promesse, la phrase a dire en cas d'echec est deja dans le message. */
export interface GestesProjets extends GestesPartage, Omit<GestesRecus, 'vignette'> {
  readonly ouvrir: (m: MetaProjet) => void;
  readonly nouveau: () => void;
  readonly renommer: (m: MetaProjet, nom: string) => Promise<boolean>;
  readonly dupliquer: (m: MetaProjet) => Promise<boolean>;
  readonly supprimer: (m: MetaProjet) => Promise<boolean>;
  readonly vignette: (m: MetaProjet | ProjetRecu) => string;
}

/** Ce que la ligne dit de la fiche : la date et la taille, puis d'ou vient une copie recue et avec combien de personnes il est partage. */
function details(m: MetaProjet): string {
  return [
    t('Modifié le {date} · {taille}', { date: quand(m.modifieLe), taille: taille(m.taille) }),
    ...(m.recuDe ? [t('Reçu de {nom}', { nom: m.recuDe })] : []),
    ...(m.partages ? [t('Partagé avec {personnes}', { personnes: pluriel(m.partages, 'personne') })] : [])
  ].join(' · ');
}

type Mode = { genre: 'renommer' | 'supprimer' | 'partager'; id: string } | null;

/** Une ligne : la vignette, le nom (qui ouvre), la date et la taille, puis les gestes ; renommer ou supprimer s'ouvrent ici. */
function LigneProjet({ m, mode, poserMode, gestes }: { m: MetaProjet; mode: Mode; poserMode: (m: Mode) => void; gestes: GestesProjets }) {
  const [nom, poserNom] = useState(m.nom);
  const [occupe, poserOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null), retour = useRef<HTMLButtonElement>(null), confirmer = useRef<HTMLButtonElement>(null), partager = useRef<HTMLButtonElement>(null);
  const idNom = useId();
  const enCours = mode?.id === m.id ? mode.genre : null;
  useEffect(() => {
    if (enCours === 'renommer') { champ.current?.focus(); champ.current?.select(); }
    if (enCours === 'supprimer') confirmer.current?.focus();
  }, [enCours]);
  const fermer = () => { poserMode(null); requestAnimationFrame(() => retour.current?.focus()); };
  const fermerPartage = () => { poserMode(null); requestAnimationFrame(() => partager.current?.focus()); };
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
        <p className="aide">{details(m)}</p>
        {enCours === 'supprimer' ? (
          <div className="projet-supprimer" role="group" aria-label={t('Supprimer « {nom} »', { nom: m.nom })}>
            <p>{t('Supprimer « {nom} » ? Il part dans la corbeille du serveur, d’où l’administrateur peut le reprendre.', { nom: m.nom })}{m.partages ? ' ' + t('Les personnes avec qui il est partagé ne le verront plus.') : ''}</p>
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
        <button type="button" ref={partager} aria-expanded={enCours === 'partager'} onClick={() => (enCours === 'partager' ? fermerPartage() : poserMode({ genre: 'partager', id: m.id }))} aria-label={t('Partager « {nom} »', { nom: m.nom })}>{t('Partager')}</button>
        <button type="button" className="discret" onClick={() => poserMode({ genre: 'supprimer', id: m.id })} aria-label={t('Supprimer « {nom} »', { nom: m.nom })}>{t('Supprimer')}</button>
      </div>
      {enCours === 'partager' ? <PanneauPartage m={m} gestes={gestes} fermer={fermerPartage} /> : null}
    </li>
  );
}

interface Proprietes {
  projets: readonly MetaProjet[] | null;
  /** Les projets que d'autres comptes partagent en lecture avec la personne (ADR-0043) ; la section n'apparait que s'il y en a. */
  recus: readonly ProjetRecu[];
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

export function EcranProjets({ projets, recus, message, gestes, csrf, menu, voies, pied }: Proprietes) {
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
      <SectionRecus recus={recus} gestes={gestes} />
      {voies}
      {pied}
    </main>
  );
}
