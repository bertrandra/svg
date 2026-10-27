// La boite « À propos et crédits » : la version du produit, la mention que la licence des formes exige, et ce que
// le produit redistribue (fontes, bibliothèques). Le contenu vient de model/credits.ts, la même liste que
// THIRD-PARTY-NOTICES.md et dist/MENTIONS.txt. Une boîte modale : elle prend le focus, rend le reste inerte, Échap la ferme
// et le focus retourne à ce qui l'avait ouverte (useFocusDialogue).

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SOURCES_ORIGINE, composantsDe, type Composant } from '../model/credits.js';
import type { LicencePolice } from '../model/sourcesPolices.js';
import { SOURCE_PAR_DEFAUT, sourceFormes } from '../model/sourcesFormes.js';

/** Le paquet de la source par defaut : celle dont la mention est ecrite dans le fichier, presentee a part. */
const PAQUET_PAR_DEFAUT = sourceFormes(SOURCE_PAR_DEFAUT)?.paquet;
import { useFocusDialogue } from './focusEditeur.js';
import { versionProduit } from './produit.js';
import { t } from '../util/i18n.js';

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

/** Une police telechargee qu'emploie le dessin (ADR-0025) : son nom, sa source, sa licence (null quand l'index n'est pas la). */
export interface PoliceCreditee { readonly nom: string; readonly source: string; readonly licence: LicencePolice | null }

/** Les polices telechargees du dessin : leur licence nommee, et ce qu'elles sont (pas redistribuees par l'editeur). */
function PolicesTelechargees({ polices }: { polices: readonly PoliceCreditee[] }) {
  return (
    <section className="credits-section">
      <h3>{t('Polices téléchargées employées dans ce dessin')}</h3>
      <ul>
        {polices.map(p => (
          <li key={p.nom}>{p.nom}{p.source ? ' · ' + p.source : ''}{p.licence ? <> · <Lien href={p.licence.url}>{p.licence.nom}</Lien></> : ' · ' + t('licence : voir l’index des polices')}</li>
        ))}
      </ul>
      <p className="aide">
        {t('Ces polices ne sont pas livrées avec l’éditeur : vous les avez téléchargées depuis leur source. Le dessin enregistré n’en contient que les contours des lettres, jamais le fichier de la police.')}
      </p>
    </section>
  );
}

/** Le contenu : pur affichage de la liste des crédits, et des polices telechargees du dessin quand il y en a. */
export function ContenuCredits({ polices = [] }: { polices?: readonly PoliceCreditee[] } = {}) {
  const source = SOURCES_ORIGINE[0];
  return (
    <>
      <p>{t('Éditeur SVG, version {version}. Tout se calcule dans votre navigateur.', { version: versionProduit() })}</p>
      {source ? (
        <section className="credits-section">
          <h3>{t('Formes de la bibliothèque')}</h3>
          <p>
            {t('Les formes de la bibliothèque par défaut viennent de ')}<Lien href={source.url}>{source.nom}</Lien>{t(', sous licence')}{' '}
            <Lien href={source.urlLicence}>{source.licence}</Lien>{t(' : vous pouvez les utiliser, y compris dans un produit commercial, à condition d’en créditer la source. Vous les recolorez, les redimensionnez et les assemblez librement ; ces changements sont des modifications au sens de la licence.')}
          </p>
          <p>
            {t('Un SVG enregistré ou exporté qui contient de ces formes porte leur mention dans son élément ')}<code>&lt;metadata&gt;</code>{t(', et un PDF dans ses informations. Conservez-la en publiant le dessin. Un PNG ne peut pas la porter : citez alors la source à côté de l’image.')}
          </p>
        </section>
      ) : null}
      <Liste titre={t('Autres bibliothèques de formes (chargées à la demande)')} composants={composantsDe('forme').filter(c => c.paquet !== PAQUET_PAR_DEFAUT)} />
      <p className="aide">
        {t('Leurs licences (MIT, ISC, Apache 2.0) ne demandent pas de mention dans chaque dessin : un SVG qui contient une de leurs formes garde seulement son origine (par exemple ')}<code>mdi:heart</code>{t('), sans élément ')}<code>&lt;metadata&gt;</code>{t('. Leur notice et le texte de leur licence accompagnent l’éditeur dans MENTIONS.txt.')}
      </p>
      <Liste titre={t('Fontes')} composants={composantsDe('fonte')} />
      {polices.length ? <PolicesTelechargees polices={polices} /> : null}
      <Liste titre={t('Logiciels')} composants={composantsDe('logiciel')} />
      <p className="aide">{t('Le texte complet de chaque licence est dans le fichier MENTIONS.txt, livré avec l’éditeur.')}</p>
    </>
  );
}

/**
 * La boîte, posée dans `conteneur` : l’éditeur quand elle s’ouvre de son menu Fichier (elle reste ainsi dans la racine dont
 * les styles sont cantonnés), le corps de la page sinon. `fermer` est appelé par Échap et par « Fermer ».
 */
export function DialogueCredits({ fermer, conteneur, polices }: { fermer: () => void; conteneur: HTMLElement; polices?: readonly PoliceCreditee[] }) {
  const voile = useRef<HTMLDivElement>(null), boite = useRef<HTMLDivElement>(null), idTitre = useId();
  useFocusDialogue(voile, boite, fermer);
  return createPortal(
    <div className="credits-voile" ref={voile}>
      <div className="credits-dialogue" role="dialog" aria-modal="true" aria-labelledby={idTitre} tabIndex={-1} ref={boite}>
        <h2 id={idTitre}>{t('À propos et crédits')}</h2>
        <ContenuCredits {...(polices ? { polices } : {})} />
        <div className="actions"><button type="button" className="primaire" onClick={fermer}>{t('Fermer')}</button></div>
      </div>
    </div>,
    conteneur
  );
}
