// Un accueil par public (ADR-0024), cote React : la question « Pour quoi dessinez-vous ? », la ligne qui rappelle le choix, le
// circuit de chaque public et le panneau des integrateurs. Le pur (mots, memoire, ordre, circuit) est dans publics.ts ; la page
// (Application.tsx) garde les voies, le dessin et l'editeur.
//
// La memoire passe par le stockage injecte, comme le brouillon (ADR-0010) : sans lui, ou s'il refuse d'ecrire, le choix tient le
// temps de la page. Rien ne s'ecrit tant qu'on n'a ni choisi un public ni passe la question.

import { useCallback, useId, useState, type ReactNode } from 'react';
import type { Stockage } from '../io/stockage.js';
import { copier } from '../io/fichiers.js';
import { insecables } from '../util/texte.js';
import { Icone } from './icones.js';
import { depotProduit } from './produit.js';
import {
  CHEMIN_GUIDE, CLE_PUBLIC, codeIntegration, lienGuide, lirePublic, memoirePublic, OPTIONS_INTEGRATION, PUBLICS, titrePublic,
  type ChoixPublic, type Circuit
} from './publics.js';

/** L'identifiant du titre qui recoit le focus apres un choix : celui du circuit, ou du panneau des integrateurs. */
export const ID_TITRE_SUITE = 'titre-suite';

// Le choix du temps de la page : relu quand le stockage n'a rien (absent, refuse, plein), garde meme s'il refuse d'ecrire.
let publicDeSession: ChoixPublic | null = null;

/** Le public retenu (stockage, puis session), ou null tant qu'on n'a pas repondu ; et de quoi le changer. */
export function usePublic(stockage: Stockage | null): readonly [ChoixPublic | null, (c: ChoixPublic) => void] {
  const [choix, poser] = useState<ChoixPublic | null>(() => lirePublic(stockage?.lire<unknown>(CLE_PUBLIC)) ?? publicDeSession);
  const choisir = useCallback((c: ChoixPublic) => {
    publicDeSession = c;
    // Par-dessus ce que le stockage a deja : un autre onglet a pu repondre, la reponse d'ici est la plus recente.
    if (lirePublic(stockage?.lire<unknown>(CLE_PUBLIC)) !== c) stockage?.ecrire(CLE_PUBLIC, memoirePublic(c));
    poser(c);
  }, [stockage]);
  return [choix, choisir] as const;
}

interface ProprietesQuestion {
  readonly choix: ChoixPublic | null;
  /** La question est posee (premiere visite, ou « Changer de public ») ; sinon une ligne la rappelle. */
  readonly ouverte: boolean;
  readonly choisir: (c: ChoixPublic) => void;
  readonly rouvrir: () => void;
}

/**
 * La question, ou la ligne qui rappelle la reponse. Trois reponses de meme forme et de meme poids, des boutons secondaires (aucune
 * action pleine : choisir un public n'est pas l'action du moment, c'est un reglage de l'accueil), et « Passer », discret, toujours la.
 */
export function QuestionPublic({ choix, ouverte, choisir, rouvrir }: ProprietesQuestion) {
  const id = useId();
  if (!ouverte) {
    return (
      <section className="public-rappel" aria-label="Public de l’accueil">
        <p>
          {choix && choix !== 'aucun' ? <>{insecables('Accueil adapté : ')}<strong>{titrePublic(choix)}</strong></> : 'Accueil général, pour tous les usages.'}
          {' '}<button type="button" className="discret" onClick={rouvrir}>{choix && choix !== 'aucun' ? 'Changer de public' : 'Choisir un public'}</button>
        </p>
      </section>
    );
  }
  return (
    <section className="public-question" aria-labelledby={id + '-titre'}>
      <h2 id={id + '-titre'}>{insecables('Pour quoi dessinez-vous ?')}</h2>
      <p className="aide">L’accueil s’adapte à votre réponse. Elle se change à tout moment, et rien ne vous oblige à répondre.</p>
      <ul className="publics">
        {PUBLICS.map(p => (
          <li key={p.id}>
            <button type="button" className={'public' + (choix === p.id ? ' actuel' : '')} aria-current={choix === p.id ? 'true' : undefined}
              onClick={() => choisir(p.id)}>
              {/* Toute la ligne est le bouton : son nom est le titre puis la phrase de ce qu'on obtient, tels qu'on les voit (axe,
                  label-content-name-mismatch : un nom reduit au titre ne contenait plus le texte visible). */}
              <Icone nom={p.icone} taille={20} />
              <span className="public-titre">{p.titre}</span>
              <span className="public-phrase">{p.phrase}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="public-passer">
        <button type="button" className="discret" onClick={() => choisir('aucun')}>Passer<span className="sr-only"> la question et garder les trois voies</span></button>
      </p>
    </section>
  );
}

/** Les trois etapes d'un circuit, liees par un filet en tirets (un gabarit de carnet) ; les pictogrammes sont decoratifs, le texte dit tout. */
function Etapes({ circuit }: { circuit: Circuit }) {
  return (
    <ol className="circuit">
      {circuit.etapes.map((e, i) => (
        <li key={e.titre} className="etape">
          <span className="etape-picto"><Icone nom={e.icone} taille={20} /></span>
          <span className="etape-texte">
            <span className="etape-titre"><span className="etape-numero" aria-hidden="true">{i + 1}</span>{e.titre}</span>
            <span className="etape-aide">{e.aide}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Le circuit d'un public, au-dessus des voies : d'ou part le dessin, ce que l'editeur en fait, ce qui en sort ; puis la suite propre au public. */
export function CircuitPublic({ circuit, children }: { circuit: Circuit; children?: ReactNode }) {
  return (
    <section className="circuit-public" aria-labelledby={ID_TITRE_SUITE}>
      <h2 id={ID_TITRE_SUITE} tabIndex={-1}>{circuit.titre}</h2>
      <Etapes circuit={circuit} />
      {children}
    </section>
  );
}

interface ProprietesIntegration {
  readonly circuit: Circuit;
  /** Ouvre l'editeur comme le ferait un hote (`ouvrir` avec `libelleEnregistrer`). */
  readonly essayer: () => void;
  /** Ce que la page « hote » a recu de la demonstration, a dire sous ses actions. */
  readonly recu: string;
}

/**
 * Le panneau des integrateurs : ce que fait l'embarquement, ses options principales, un extrait copiable, le guide complet et une
 * demonstration. Aucune promesse : ni client, ni chiffre ; ce qui est dit est ce que docs/integration.md documente.
 */
export function PanneauIntegration({ circuit, essayer, recu }: ProprietesIntegration) {
  const [copie, poserCopie] = useState('');
  const code = codeIntegration();
  const guide = lienGuide(depotProduit());
  const copierCode = () => { void copier(code).then(ok => poserCopie(ok ? 'Code copié.' : insecables('Ce navigateur refuse la copie : sélectionnez le code et copiez-le à la main.'))); };
  return (
    <section className="integration" aria-labelledby={ID_TITRE_SUITE}>
      <h2 id={ID_TITRE_SUITE} tabIndex={-1}>Intégrer l’éditeur à votre produit</h2>
      <p className="aide">{insecables('L’éditeur s’embarque dans votre page, en plein écran par-dessus elle : une fonction ')}<code>ouvrir()</code>{insecables(' à appeler d’un script ordinaire, ou le composant React. Aucun serveur : tout se calcule dans le navigateur de vos utilisateurs.')}</p>
      <Etapes circuit={circuit} />
      <h3 id="options-integration">Les options principales</h3>
      <dl className="options-integration">
        {OPTIONS_INTEGRATION.map(([nom, phrase]) => (
          <div key={nom}><dt><code>{nom}</code></dt><dd>{phrase}</dd></div>
        ))}
      </dl>
      <h3 id="code-integration">Exemple, avec le bundle</h3>
      {/* Focalisable : un extrait plus large que l'ecran defile au clavier (axe, scrollable-region-focusable) ; une region nommee par son
          titre, parce qu'un <pre> sans role ne peut pas porter de nom (aria-prohibited-attr). */}
      <pre className="code-integration" tabIndex={0} role="region" aria-labelledby="code-integration"><code>{code}</code></pre>
      <div className="actions">
        <button type="button" onClick={essayer}>Essayer l’éditeur embarqué</button>
        <button type="button" className="discret" onClick={copierCode}>Copier le code</button>
      </div>
      <p className="aide" role="status">{copie}</p>
      {recu ? <p className="message neutre" role="status">{recu}</p> : null}
      <p className="aide">{insecables('Le guide complet (l’iframe, le bundle, le composant React, la sécurité) : ')}<a href={guide}>{CHEMIN_GUIDE}</a>.</p>
    </section>
  );
}
