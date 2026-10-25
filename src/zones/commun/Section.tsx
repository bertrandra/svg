// Une section repliable de l'inspecteur (ADR-0006) : un titre, un chevron, un filet au-dessus, pas de
// cadre. Une section fermee ne coute qu'une ligne ; son etat se retient d'un panneau a l'autre, pour
// que passer de la selection au dessin ne referme pas ce qu'on avait ouvert.
//
// La memoire est celle d'un editeur, pas du module : deux editeurs dans la meme page (l'hote qui
// embarque l'editeur, ou deux appels a `ouvrir` l'un apres l'autre) ne se passent pas leurs sections.
// Hors de tout fournisseur, une section n'a pas de memoire et suit sa valeur par defaut.

import { createContext, useContext, useState, type ReactNode } from 'react';

const ContexteSections = createContext<Map<string, boolean> | null>(null);

/** Donne a ses descendants une memoire de sections neuve, propre a cet arbre. */
export function FournisseurSections({ children }: { children: ReactNode }) {
  const [memoire] = useState(() => new Map<string, boolean>());
  return <ContexteSections.Provider value={memoire}>{children}</ContexteSections.Provider>;
}

export function Section({ titre, ouverte = false, note, className, children }: { titre: string; ouverte?: boolean; note?: ReactNode; className?: string; children: ReactNode }) {
  const memoire = useContext(ContexteSections);
  return (
    <details className={'section' + (className ? ' ' + className : '')} open={memoire?.get(titre) ?? ouverte} onToggle={e => { memoire?.set(titre, (e.currentTarget as HTMLDetailsElement).open); }}>
      <summary><span>{titre}</span>{note ? <span className="aide">{note}</span> : null}</summary>
      <div className="section-corps">{children}</div>
    </details>
  );
}
