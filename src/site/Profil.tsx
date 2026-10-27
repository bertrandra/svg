// « Mon profil » (ADR-0041 §4) : une boite modale sur « Mes projets », deux formulaires qui partent chacun de leur cote. Le nom et
// la langue d'abord (changer la langue recharge la page : les pages PHP et l'interface la lisent au chargement), le mot de passe
// ensuite (l'ancien, le nouveau deux fois ; le serveur verifie l'ancien et ferme les autres sessions). L'adresse ne se change pas
// ici : un administrateur le fait. Echap ferme, le focus revient a l'icone du profil (useFocusDialogue).

import { useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Compte, Langue, Serveur } from '../io/serveur.js';
import { useFocusDialogue } from '../zones/focusEditeur.js';
import { t } from '../util/i18n.js';
import { NOM_MAX, nomDeCompte, validerMotDePasse, validerProfil } from './comptesSite.js';
import { Champ, ChoixLangue, RetourFormulaire, type Retour } from './Formulaire.js';

interface Proprietes {
  compte: Compte;
  serveur: Serveur;
  fermer: () => void;
  /** Le compte tel que le serveur le garde apres un changement : la page le montre (initiales, en-tete du menu). */
  changer: (c: Compte) => void;
}

function FormulaireIdentite({ compte, serveur, changer }: Pick<Proprietes, 'compte' | 'serveur' | 'changer'>) {
  const [nom, poserNom] = useState(compte.nom);
  const [langue, poserLangue] = useState<Langue>(compte.langue);
  const [erreurs, poserErreurs] = useState<{ nom?: string }>({});
  const [retour, poserRetour] = useState<Retour>(null);
  const [occupe, poserOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const idTitre = useId();
  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const err = validerProfil(nom);
    poserErreurs(err);
    if (err.nom) { champ.current?.focus(); return; }
    const propre = nomDeCompte(nom), langueChange = langue !== compte.langue;
    if (propre === compte.nom && !langueChange) { poserRetour({ texte: t('Rien n’a changé.'), ton: 'info' }); return; }
    poserOccupe(true);
    const r = await serveur.profil({ ...(propre !== compte.nom ? { nom: propre } : {}), ...(langueChange ? { langue } : {}) });
    poserOccupe(false);
    if (!r.ok) { poserRetour({ texte: r.message, ton: 'alerte' }); return; }
    changer(r.valeur);
    // La langue : les pages PHP et l'interface la lisent au chargement (ADR-0042), la page se recharge donc dans la nouvelle.
    if (langueChange) { window.location.reload(); return; }
    poserNom(r.valeur.nom);
    poserRetour({ texte: t('Profil enregistré.'), ton: 'info' });
  };
  return (
    <form className="formulaire-site" aria-labelledby={idTitre} noValidate onSubmit={e => { void envoyer(e); }}>
      <h3 id={idTitre}>{t('Identité')}</h3>
      <Champ libelle={t('Nom')} valeur={nom} poser={poserNom} maxLength={NOM_MAX} autoComplete="name" erreur={erreurs.nom} reference={champ} />
      <p className="champ-site"><span className="aide">{t('Adresse : {email}. Elle ne se change pas ici : demandez-le à un administrateur.', { email: compte.email })}</span></p>
      <ChoixLangue legende={t('Langue')} valeur={langue} poser={poserLangue} />
      <RetourFormulaire retour={retour} />
      <div className="actions">
        <button type="submit" className="primaire" disabled={occupe}>{t('Enregistrer')}</button>
      </div>
    </form>
  );
}

function FormulaireMotDePasse({ serveur }: Pick<Proprietes, 'serveur'>) {
  const [ancien, poserAncien] = useState(''), [nouveau, poserNouveau] = useState(''), [confirmation, poserConfirmation] = useState('');
  const [erreurs, poserErreurs] = useState<ReturnType<typeof validerMotDePasse>>({});
  const [retour, poserRetour] = useState<Retour>(null);
  const [occupe, poserOccupe] = useState(false);
  const idTitre = useId();
  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    const err = validerMotDePasse(ancien, nouveau, confirmation);
    poserErreurs(err);
    if (Object.keys(err).length) return;
    poserOccupe(true);
    const r = await serveur.motDePasse(ancien, nouveau);
    poserOccupe(false);
    if (!r.ok) {
      // Un ancien mot de passe faux est une erreur du champ, pas du formulaire : elle se lit la ou l'on corrige.
      if (r.code === 'invalide') poserErreurs({ ancien: r.message });
      else poserRetour({ texte: r.message, ton: 'alerte' });
      return;
    }
    poserAncien(''); poserNouveau(''); poserConfirmation('');
    poserRetour({ texte: t('Mot de passe changé. Vos autres sessions sont fermées.'), ton: 'info' });
  };
  return (
    <form className="formulaire-site" aria-labelledby={idTitre} noValidate onSubmit={e => { void envoyer(e); }}>
      <h3 id={idTitre}>{t('Mot de passe')}</h3>
      <Champ libelle={t('Mot de passe actuel')} type="password" valeur={ancien} poser={poserAncien} autoComplete="current-password" erreur={erreurs.ancien} />
      <Champ libelle={t('Nouveau mot de passe')} type="password" valeur={nouveau} poser={poserNouveau} autoComplete="new-password" erreur={erreurs.nouveau} aide={t('Dix caractères au moins.')} />
      <Champ libelle={t('Nouveau mot de passe, encore')} type="password" valeur={confirmation} poser={poserConfirmation} autoComplete="new-password" erreur={erreurs.confirmation} />
      <RetourFormulaire retour={retour} />
      <div className="actions">
        <button type="submit" disabled={occupe}>{t('Changer le mot de passe')}</button>
      </div>
    </form>
  );
}

/** La boite, posee dans le corps de la page (l'editeur n'est pas ouvert : on est sur « Mes projets »). */
export function DialogueProfil({ compte, serveur, fermer, changer }: Proprietes) {
  const voile = useRef<HTMLDivElement>(null), boite = useRef<HTMLDivElement>(null), idTitre = useId();
  useFocusDialogue(voile, boite, fermer);
  return createPortal(
    <div className="credits-voile" ref={voile}>
      <div className="credits-dialogue profil-dialogue" role="dialog" aria-modal="true" aria-labelledby={idTitre} tabIndex={-1} ref={boite}>
        <h2 id={idTitre}>{t('Mon profil')}</h2>
        <FormulaireIdentite compte={compte} serveur={serveur} changer={changer} />
        <FormulaireMotDePasse serveur={serveur} />
        <div className="actions"><button type="button" className="discret" onClick={fermer}>{t('Fermer')}</button></div>
      </div>
    </div>,
    document.body
  );
}
