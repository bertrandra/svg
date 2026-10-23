// Une section repliable de l'inspecteur (ADR-0006) : un titre, un chevron, un filet au-dessus, pas de
// cadre. Une section fermee ne coute qu'une ligne ; son etat se retient d'un panneau a l'autre, pour
// que passer de la selection au dessin ne referme pas ce qu'on avait ouvert.

import type { ReactNode } from 'react';

const memoire = new Map<string, boolean>();

export function Section({ titre, ouverte = false, note, children }: { titre: string; ouverte?: boolean; note?: ReactNode; children: ReactNode }) {
  return (
    <details className="section" open={memoire.get(titre) ?? ouverte} onToggle={e => { memoire.set(titre, (e.currentTarget as HTMLDetailsElement).open); }}>
      <summary><span>{titre}</span>{note ? <span className="aide">{note}</span> : null}</summary>
      <div className="section-corps">{children}</div>
    </details>
  );
}
