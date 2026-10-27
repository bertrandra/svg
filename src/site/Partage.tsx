// Le panneau « Partager » d'un projet (ADR-0043), ouvert dans sa ligne comme renommer ou supprimer, jamais dans une fenetre qui
// piege le focus : l'adresse d'une personne qui a un compte sur le site, puis « Partager en lecture » (elle voit le projet tel qu'on
// l'enregistre, sans pouvoir l'ecrire) ou « Envoyer une copie » (une copie lui appartient et vit a part) ; dessous, les personnes
// avec qui le projet est deja partage, chacune avec « Retirer ». Echap ferme, le focus revient au bouton qui l'a ouvert.

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { MetaProjet, Partage } from '../io/serveur.js';
import { t } from '../util/i18n.js';

/** Ce que le panneau demande au site ; chaque geste dit lui-meme son echec (le message de l'ecran) et rend null ou faux. */
export interface GestesPartage {
  readonly partages: (m: MetaProjet) => Promise<readonly Partage[] | null>;
  readonly partager: (m: MetaProjet, email: string) => Promise<readonly Partage[] | null>;
  readonly retirerPartage: (m: MetaProjet, p: Partage) => Promise<readonly Partage[] | null>;
  readonly envoyerCopie: (m: MetaProjet, email: string) => Promise<boolean>;
}

export function PanneauPartage({ m, gestes, fermer }: { m: MetaProjet; gestes: GestesPartage; fermer: () => void }) {
  const [email, poserEmail] = useState('');
  const [personnes, poserPersonnes] = useState<readonly Partage[] | null>(null);
  const [occupe, poserOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const idChamp = useId(), idAide = useId(), idListe = useId();

  useEffect(() => {
    champ.current?.focus();
    let vivant = true;
    void gestes.partages(m).then(p => { if (vivant) poserPersonnes(p ?? []); });
    return () => { vivant = false; };
  }, [gestes, m]);

  /** Un geste a la fois ; l'adresse s'efface quand il reussit, reste a corriger sinon. */
  const faire = async (geste: () => Promise<boolean>) => {
    poserOccupe(true);
    const ok = await geste();
    poserOccupe(false);
    if (ok) poserEmail('');
    champ.current?.focus();
  };
  const lecture = (e: FormEvent) => {
    e.preventDefault();
    void faire(async () => { const p = await gestes.partager(m, email.trim()); if (p) poserPersonnes(p); return p !== null; });
  };
  const copie = () => { void faire(() => gestes.envoyerCopie(m, email.trim())); };
  const retirer = (p: Partage) => {
    poserOccupe(true);
    void gestes.retirerPartage(m, p).then(liste => { poserOccupe(false); if (liste) poserPersonnes(liste); champ.current?.focus(); });
  };

  return (
    <div className="projet-partager" role="group" aria-label={t('Partager « {nom} »', { nom: m.nom })}>
      <form className="projet-partager-adresse" onSubmit={lecture} noValidate>
        <label htmlFor={idChamp}>{t('Adresse de la personne')}</label>
        <input id={idChamp} ref={champ} type="email" value={email} maxLength={254} autoComplete="off" spellCheck={false} aria-describedby={idAide}
          onChange={e => poserEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); fermer(); } }} />
        <p id={idAide} className="aide">{t('Une personne qui a un compte sur ce site. En lecture, elle voit le projet tel que vous l’enregistrez, sans pouvoir le modifier ; une copie lui appartient et vit à part.')}</p>
        <div className="actions">
          <button type="submit" disabled={occupe}>{t('Partager en lecture')}</button>
          <button type="button" disabled={occupe} onClick={copie}>{t('Envoyer une copie')}</button>
          <button type="button" className="discret" onClick={fermer}>{t('Fermer')}</button>
        </div>
      </form>
      <h4 id={idListe}>{t('Partagé en lecture avec')}</h4>
      {personnes === null ? <p className="aide" role="status">{t('Chargement…')}</p>
        : personnes.length === 0 ? <p className="aide">{t('Personne pour l’instant.')}</p>
          : (
            <ul className="liste-partages" aria-labelledby={idListe}>
              {personnes.map(p => (
                <li key={p.id}>
                  <span className="partage-personne">{p.nom} <span className="aide">{p.email}</span></span>
                  <button type="button" className="discret" disabled={occupe} onClick={() => retirer(p)} aria-label={t('Retirer le partage avec {nom}', { nom: p.nom })}>{t('Retirer')}</button>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
}
