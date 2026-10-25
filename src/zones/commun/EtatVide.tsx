// Un etat vide (ADR-0019) : ce qui viendra ici, pourquoi c'est utile, et un seul geste pour commencer. Il remplace un blanc
// muet (une liste sans ligne, une grille sans vignette) par une ou deux lignes et, au plus, une icone deja dessinee et un
// bouton discret : un etat vide est un mode d'emploi, pas une affiche.
//
// Trois genres, que le texte distingue : la premiere fois (rien n'a encore ete fait), vide par la personne (elle a tout
// retire : le retour est a un geste), et aucun resultat (une recherche ou un filtre : on dit quoi changer).

import type { ReactNode } from 'react';
import { insecables } from '../../util/texte.js';
import { Icone, type NomIcone } from '../icones.js';

export type GenreVide = 'premiere-fois' | 'vide' | 'aucun-resultat';

interface Proprietes {
  genre: GenreVide;
  /** Ce qui manque, en une phrase. */
  titre: string;
  /** Pourquoi c'est utile ou comment commencer, en une phrase ; facultatif. */
  children?: ReactNode;
  icone?: NomIcone;
  /** Le geste qui commence : un bouton discret, jamais une action primaire (ADR-0006). */
  action?: { libelle: string; onClick: () => void } | undefined;
}

export function EtatVide({ genre, titre, children, icone, action }: Proprietes) {
  return (
    <div className={'etat-vide ' + genre} data-vide={genre}>
      {icone ? <Icone nom={icone} taille={20} /> : null}
      <p className="etat-vide-titre">{insecables(titre)}</p>
      {children ? <p className="etat-vide-texte">{typeof children === 'string' ? insecables(children) : children}</p> : null}
      {action ? <button type="button" className="discret" onClick={action.onClick}>{action.libelle}</button> : null}
    </div>
  );
}
