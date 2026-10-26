// Ce que les comptes ajoutent au site (ADR-0041) : la personne connectee (telle que la page la donne, puis telle que le serveur la
// rend), le menu du profil, la boite « Mon profil », et pour un administrateur les ecrans « Comptes » et « Réglages du site », qui
// prennent la place de « Mes projets » le temps qu'on y est. L'editeur n'en sait rien : il s'ouvre par-dessus, depuis les projets.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Compte, Serveur } from '../io/serveur.js';
import { EcranComptes } from './Comptes.js';
import { MenuProfil } from './MenuProfil.js';
import { DialogueProfil } from './Profil.js';
import { EcranReglages } from './Reglages.js';

type Ecran = 'projets' | 'comptes' | 'reglages';

interface Proprietes {
  serveur: Serveur;
  csrf: string;
  /** La personne connectee, lue de la page ; null quand la page ne l'a pas dite (le menu n'existe pas, la deconnexion reste). */
  compte: Compte | null;
  /** L'ecran « Mes projets », avec le menu du profil a poser dans son en-tete. */
  projets: (menu: ReactNode) => ReactNode;
}

export function EcransCompte({ serveur, csrf, compte: initial, projets }: Proprietes) {
  const [compte, poserCompte] = useState<Compte | null>(initial);
  const [enAttente, poserEnAttente] = useState<number | null>(null);
  const [ecran, poserEcran] = useState<Ecran>('projets');
  const [profil, poserProfil] = useState(false);

  // Le nombre de demandes en attente vient du serveur (la page ne le donne pas) ; il se recompte apres chaque geste de l'ecran Comptes.
  const admin = compte?.role === 'admin';
  const recompter = useCallback(async () => {
    if (!admin) return;
    const r = await serveur.compte();
    if (r.ok) poserEnAttente(r.valeur.enAttente);
  }, [serveur, admin]);
  useEffect(() => { void recompter(); }, [recompter]);

  const revenir = useCallback(() => poserEcran('projets'), []);
  if (compte && ecran === 'comptes') return <EcranComptes serveur={serveur} moi={compte} retour={revenir} apresChangement={() => { void recompter(); }} />;
  if (compte && ecran === 'reglages') return <EcranReglages serveur={serveur} moi={compte} retour={revenir} />;
  return (
    <>
      {projets(compte ? (
        <MenuProfil compte={compte} enAttente={enAttente} csrf={csrf} ouvrirProfil={() => poserProfil(true)} ouvrirComptes={() => poserEcran('comptes')} ouvrirReglages={() => poserEcran('reglages')} />
      ) : null)}
      {compte && profil ? <DialogueProfil compte={compte} serveur={serveur} fermer={() => poserProfil(false)} changer={poserCompte} /> : null}
    </>
  );
}
