// La boite « À propos et crédits » : la version du produit, la mention que la licence des formes exige, et ce que
// le produit redistribue (fontes, bibliothèques). Le contenu vient de model/credits.ts, la même liste que
// THIRD-PARTY-NOTICES.md et dist/MENTIONS.txt. Une boîte modale : elle prend le focus, rend le reste inerte, Échap la ferme
// et le focus retourne à ce qui l'avait ouverte (useFocusDialogue).

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SOURCES_ORIGINE, composantsDe, type Composant } from '../model/credits.js';
import { useFocusDialogue } from './focusEditeur.js';
import { versionProduit } from './produit.js';

const Lien = ({ href, children }: { href: string; children: string }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;

function Liste({ titre, composants }: { titre: string; composants: readonly Composant[] }) {
  return (
    <section className="credits-section">
      <h3>{titre}</h3>
      <ul>
        {composants.map(c => (
          <li key={c.paquet}><Lien href={c.url}>{c.nom}</Lien> · {c.titulaire} · {c.licence}</li>
        ))}
      </ul>
    </section>
  );
}

/** Le contenu : pur affichage de la liste des crédits. */
export function ContenuCredits() {
  const source = SOURCES_ORIGINE[0];
  return (
    <>
      <p>Éditeur SVG, version {versionProduit()}. Tout se calcule dans votre navigateur.</p>
      {source ? (
        <section className="credits-section">
          <h3>Formes de la bibliothèque</h3>
          <p>
            Les formes de la bibliothèque viennent de <Lien href={source.url}>{source.nom}</Lien>, sous licence{' '}
            <Lien href={source.urlLicence}>{source.licence}</Lien> : vous pouvez les utiliser, y compris dans un
            produit commercial, à condition d’en créditer la source. Vous les recolorez, les redimensionnez et les assemblez
            librement ; ces changements sont des modifications au sens de la licence.
          </p>
          <p>
            Un SVG enregistré ou exporté qui contient de ces formes porte leur mention dans son élément <code>&lt;metadata&gt;</code>,
            et un PDF dans ses informations. Conservez-la en publiant le dessin. Un PNG ne peut pas la porter : citez alors la source à côté de l’image.
          </p>
        </section>
      ) : null}
      <Liste titre="Fontes" composants={composantsDe('fonte')} />
      <Liste titre="Logiciels" composants={composantsDe('logiciel')} />
      <p className="aide">Le texte complet de chaque licence est dans le fichier MENTIONS.txt, livré avec l’éditeur.</p>
    </>
  );
}

/**
 * La boîte, posée dans `conteneur` : l’éditeur quand elle s’ouvre de son menu Fichier (elle reste ainsi dans la racine dont
 * les styles sont cantonnés), le corps de la page sinon. `fermer` est appelé par Échap et par « Fermer ».
 */
export function DialogueCredits({ fermer, conteneur }: { fermer: () => void; conteneur: HTMLElement }) {
  const voile = useRef<HTMLDivElement>(null), boite = useRef<HTMLDivElement>(null), idTitre = useId();
  useFocusDialogue(voile, boite, fermer);
  return createPortal(
    <div className="credits-voile" ref={voile}>
      <div className="credits-dialogue" role="dialog" aria-modal="true" aria-labelledby={idTitre} tabIndex={-1} ref={boite}>
        <h2 id={idTitre}>À propos et crédits</h2>
        <ContenuCredits />
        <div className="actions"><button type="button" className="primaire" onClick={fermer}>Fermer</button></div>
      </div>
    </div>,
    conteneur
  );
}
