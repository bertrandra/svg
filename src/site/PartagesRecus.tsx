// « Partagés avec moi » (ADR-0043) : les projets que d'autres comptes partagent en lecture avec la personne connectee, sous ses
// propres projets, seulement s'il y en a. Une ligne s'ouvre (en lecture : « Enregistrer une copie » la garde chez soi), se copie
// dans ses projets, ou se retire de la liste apres confirmation dans la ligne (le titulaire seul peut la partager de nouveau).

import { useEffect, useRef, useState } from 'react';
import type { ProjetRecu } from '../io/serveur.js';
import { t } from '../util/i18n.js';
import { quand } from './fiche.js';

export interface GestesRecus {
  readonly ouvrirRecu: (r: ProjetRecu) => void;
  readonly copierRecu: (r: ProjetRecu) => Promise<boolean>;
  readonly quitterRecu: (r: ProjetRecu) => Promise<boolean>;
  readonly vignette: (r: ProjetRecu) => string;
}

function LigneRecu({ r, gestes }: { r: ProjetRecu; gestes: GestesRecus }) {
  const [retrait, poserRetrait] = useState(false);
  const [occupe, poserOccupe] = useState(false);
  const retour = useRef<HTMLButtonElement>(null), confirmer = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (retrait) confirmer.current?.focus(); }, [retrait]);
  const fermer = () => { poserRetrait(false); requestAnimationFrame(() => retour.current?.focus()); };
  return (
    <li className="projet">
      {r.vignette ? <img className="projet-vignette" src={gestes.vignette(r)} alt="" loading="lazy" /> : <span className="projet-vignette vide" aria-hidden="true" />}
      <div className="projet-infos">
        <h3 className="projet-nom"><button type="button" className="lien-projet" onClick={() => gestes.ouvrirRecu(r)}>{r.nom}</button></h3>
        <p className="aide">{t('Partagé par {nom} · modifié le {date}', { nom: r.proprietaire.nom, date: quand(r.modifieLe) })}</p>
        {retrait ? (
          <div className="projet-supprimer" role="group" aria-label={t('Retirer de ma liste « {nom} »', { nom: r.nom })}>
            <p>{t('Retirer « {nom} » de votre liste ? Pour le revoir, il faudra que {personne} le partage de nouveau.', { nom: r.nom, personne: r.proprietaire.nom })}</p>
            <div className="actions">
              <button type="button" ref={confirmer} disabled={occupe} onClick={() => { poserOccupe(true); void gestes.quitterRecu(r).then(() => poserOccupe(false)); }}>{t('Retirer')}</button>
              <button type="button" className="discret" onClick={fermer}>{t('Annuler')}</button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="actions projet-actions">
        <button type="button" onClick={() => gestes.ouvrirRecu(r)} aria-label={t('Ouvrir « {nom} »', { nom: r.nom })}>{t('Ouvrir')}</button>
        <button type="button" disabled={occupe} onClick={() => { poserOccupe(true); void gestes.copierRecu(r).then(() => poserOccupe(false)); }} aria-label={t('Copier dans mes projets « {nom} »', { nom: r.nom })}>{t('Copier dans mes projets')}</button>
        <button type="button" className="discret" ref={retour} onClick={() => poserRetrait(true)} aria-label={t('Retirer de ma liste « {nom} »', { nom: r.nom })}>{t('Retirer de ma liste')}</button>
      </div>
    </li>
  );
}

/** La section, absente tant que rien n'est partage avec la personne. */
export function SectionRecus({ recus, gestes }: { recus: readonly ProjetRecu[]; gestes: GestesRecus }) {
  if (recus.length === 0) return null;
  return (
    <section className="projets projets-recus" aria-labelledby="titre-recus">
      <div className="projets-tete">
        <h2 id="titre-recus">{t('Partagés avec moi')} <span className="aide">{recus.length}</span></h2>
      </div>
      <p className="aide">{t('Des projets que d’autres personnes partagent avec vous, en lecture : ouvrez-les, téléchargez-les, ou copiez-les dans vos projets pour les modifier.')}</p>
      <ul className="liste-projets">
        {recus.map(r => <LigneRecu key={r.proprietaire.id + r.id + ':' + r.revision} r={r} gestes={gestes} />)}
      </ul>
    </section>
  );
}
