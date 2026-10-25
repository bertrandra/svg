// Le dialogue qui demande, une fois, la permission de telecharger une police (ADR-0025) : il dit quel serveur sera contacte,
// ce qui part (le fichier demande, rien d'autre) et comment retirer la permission. Une boite modale comme « A propos et
// credits » : elle prend le focus, rend le reste inerte, Echap vaut « Pas maintenant », le focus revient d'ou l'on venait.
// Une seule action pleine : accepter.

import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LICENCES_POLICES, SERVEURS_POLICES, sourcePolices, type IdServeur } from '../model/sourcesPolices.js';
import type { VariantePolice } from '../model/cataloguePolices.js';
import { useFocusDialogue } from './focusEditeur.js';

/** « jsDelivr (cdn.jsdelivr.net), puis, s'il ne répond pas, Bunny Fonts (fonts.bunny.net) ». */
export function phraseServeurs(serveurs: readonly IdServeur[]): string {
  const nommer = (id: IdServeur) => SERVEURS_POLICES[id].nom + ' (' + SERVEURS_POLICES[id].hote + ')';
  const principaux = serveurs.filter(id => !SERVEURS_POLICES[id].repli), replis = serveurs.filter(id => SERVEURS_POLICES[id].repli);
  const liste = (l: readonly IdServeur[]) => l.map(nommer).join(', ');
  if (!principaux.length) return liste(replis);
  return liste(principaux) + (replis.length ? ', puis, s’il ne répond pas, ' + liste(replis) : '');
}

export interface ProprietesConsentement {
  readonly variante: VariantePolice;
  readonly serveurs: readonly IdServeur[];
  /** Vrai quand l'editeur a un stockage : la permission se retient ; sinon, elle vaut pour la session. */
  readonly retenu: boolean;
  readonly repondre: (oui: boolean) => void;
}

export function DialogueConsentement({ variante, serveurs, retenu, repondre }: ProprietesConsentement) {
  const voile = useRef<HTMLDivElement>(null), boite = useRef<HTMLDivElement>(null), idTitre = useId(), idTexte = useId();
  useFocusDialogue(voile, boite, () => repondre(false));
  const licence = LICENCES_POLICES[variante.famille.licence], source = sourcePolices(variante.famille.source);
  const conteneur = document.querySelector<HTMLElement>('.editeur-svg') ?? document.body;
  return createPortal(
    <div className="credits-voile" ref={voile}>
      <div className="credits-dialogue consentement-polices" role="dialog" aria-modal="true" aria-labelledby={idTitre} aria-describedby={idTexte} tabIndex={-1} ref={boite}>
        <h2 id={idTitre}>Télécharger la police « {variante.famille.nom} » ?</h2>
        <p id={idTexte}>
          Cette police n’est pas livrée avec l’éditeur. Pour l’employer, l’éditeur va demander son fichier à {phraseServeurs(serveurs)}.
        </p>
        <p>
          Ce qui part : la demande de ce fichier, rien d’autre. Ni votre dessin, ni votre texte, ni aucune donnée personnelle ; comme pour
          toute page, le serveur voit l’adresse IP de votre connexion. Chaque fichier est vérifié par son empreinte avant d’être lu.
        </p>
        <p className="aide">
          Source : {source?.nom ?? variante.famille.source}. Licence : <a href={licence.url} target="_blank" rel="noreferrer noopener">{licence.nom}</a>
          {licence.badge ? <> <span className="badge-licence">{licence.badge}</span></> : null}.{' '}
          {retenu ? 'Votre accord sera retenu dans ce navigateur ; vous pourrez le retirer dans « Toutes les polices ».' : 'Votre accord vaudra jusqu’à la fermeture de l’éditeur.'}
        </p>
        <div className="actions boutons">
          <button type="button" onClick={() => repondre(false)}>Pas maintenant</button>
          <button type="button" className="primaire" onClick={() => repondre(true)}>{retenu ? 'Accepter et retenir' : 'Accepter pour cette session'}</button>
        </div>
      </div>
    </div>,
    conteneur
  );
}
