// L'icone du profil (ADR-0041 §5) : en haut a droite de « Mes projets », un rond aux initiales du nom, qui ouvre un menu : le nom et
// l'adresse (en tete, qu'on lit), « Mon profil… », pour un administrateur « Comptes » (avec le nombre de demandes en attente) et
// « Réglages du site… », puis « Se déconnecter ». La deconnexion reste un vrai formulaire POST avec le jeton CSRF, comme avant ce
// menu : l'element du menu le soumet, et la page de connexion dit « Vous êtes déconnecté ».

import { useRef } from 'react';
import type { Compte } from '../io/serveur.js';
import { MenuDeroulant, type ElementMenu } from '../zones/commun/Menu.js';
import { t } from '../util/i18n.js';
import { initiales } from './comptesSite.js';

interface Proprietes {
  compte: Compte;
  /** Les demandes en attente (administrateur) ; null tant qu'on ne les connait pas. */
  enAttente: number | null;
  csrf: string;
  ouvrirProfil: () => void;
  ouvrirComptes: () => void;
  ouvrirReglages: () => void;
}

export function MenuProfil({ compte, enAttente, csrf, ouvrirProfil, ouvrirComptes, ouvrirReglages }: Proprietes) {
  const formulaire = useRef<HTMLFormElement>(null);
  const admin = compte.role === 'admin';
  const elements: ElementMenu[] = [
    { id: 'profil', libelle: t('Mon profil…'), onClick: ouvrirProfil },
    ...(admin ? [
      { id: 'comptes', libelle: enAttente ? t('Comptes ({n} en attente)', { n: enAttente }) : t('Comptes'), onClick: ouvrirComptes },
      { id: 'reglages', libelle: t('Réglages du site…'), onClick: ouvrirReglages }
    ] : []),
    { id: 'deconnexion', libelle: t('Se déconnecter'), separateur: true, onClick: () => formulaire.current?.requestSubmit() }
  ];
  return (
    <div className="menu-profil">
      <MenuDeroulant etiquette={t('Compte : {nom}', { nom: compte.nom })} alignement="droite" chevron={false} className="menu-profil-bouton" elements={elements}
        contenu={<span className="profil-initiales" aria-hidden="true">{initiales(compte.nom)}{admin && enAttente ? <span className="profil-pastille">{enAttente}</span> : null}</span>}
        entete={<><strong className="profil-nom">{compte.nom}</strong><span className="profil-email">{compte.email}</span></>} />
      {/* Le formulaire de deconnexion : un vrai POST, jamais une requete de script, soumis par l'element du menu. */}
      <form method="post" action="index.php" className="site-deconnexion" ref={formulaire} hidden>
        <input type="hidden" name="action" value="deconnexion" />
        <input type="hidden" name="csrf" value={csrf} />
        <button type="submit" tabIndex={-1}>{t('Se déconnecter')}</button>
      </form>
    </div>
  );
}
