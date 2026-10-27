// Les briques des formulaires du site (ADR-0041) : un champ avec son libelle et son erreur liee (aria-describedby, aria-invalid),
// un choix de langue, et le retour d'un formulaire (succes en neutre, echec en alerte). Chaque formulaire porte son propre retour :
// une boite qui en a deux (le profil et le mot de passe) dit lequel a abouti. Les formulaires qui emploient ces champs sont
// `noValidate` : la bulle native du navigateur (un port hors bornes, une adresse mal formee) bloquerait l'envoi sans rien lier au
// champ ni au lecteur d'ecran ; c'est la validation du formulaire qui dit l'erreur, sur le champ.

import { useId, type ReactNode, type RefObject } from 'react';
import type { Langue } from '../io/serveur.js';
import { Message, type TonMessage } from '../zones/commun/Message.js';
import { LIBELLES_LANGUES } from './comptesSite.js';

interface ChampProprietes {
  libelle: string;
  valeur: string;
  poser: (v: string) => void;
  type?: 'text' | 'email' | 'password' | 'url' | 'number';
  erreur?: string | undefined;
  /** Une aide sous le champ, quand il n'y a pas d'erreur. */
  aide?: string;
  autoComplete?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  requis?: boolean;
  desactive?: boolean;
  /** Le champ qui recoit le focus a l'ouverture : la reference que le parent pose. */
  reference?: RefObject<HTMLInputElement | null>;
}

/** Un champ de saisie : le libelle au-dessus, l'erreur (lue tout de suite) ou l'aide dessous, liees au champ. */
export function Champ({ libelle, valeur, poser, type = 'text', erreur, aide, autoComplete, maxLength, min, max, requis, desactive, reference }: ChampProprietes) {
  const id = useId(), idNote = useId();
  const note = erreur ?? aide;
  return (
    <div className={'champ-site' + (erreur ? ' en-erreur' : '')}>
      <label htmlFor={id}>{libelle}</label>
      <input id={id} ref={reference} type={type} value={valeur} onChange={e => poser(e.target.value)} autoComplete={autoComplete} maxLength={maxLength} min={min} max={max}
        required={requis} disabled={desactive} aria-invalid={erreur ? true : undefined} aria-describedby={note ? idNote : undefined} />
      {erreur ? <p id={idNote} className="champ-erreur" role="alert">{erreur}</p> : aide ? <p id={idNote} className="aide">{aide}</p> : null}
    </div>
  );
}

/** Le choix d'une langue : deux boutons radio nommes par leur legende. */
export function ChoixLangue({ legende, valeur, poser, nom }: { legende: string; valeur: Langue; poser: (l: Langue) => void; nom?: string }) {
  const id = useId();
  return (
    <fieldset className="champ-site choix-langue">
      <legend>{legende}</legend>
      {(['fr', 'en'] as const).map(l => (
        <label key={l} className="choix-radio">
          <input type="radio" name={nom ?? id} value={l} checked={valeur === l} onChange={() => poser(l)} lang={l} />
          <span lang={l}>{LIBELLES_LANGUES[l]}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Le retour d'un formulaire : rien tant qu'il n'a rien dit. */
export type Retour = { readonly texte: string; readonly ton: TonMessage } | null;

export function RetourFormulaire({ retour }: { retour: Retour }) {
  return retour ? <Message ton={retour.ton}>{retour.texte}</Message> : null;
}

/** Une case a cocher avec son libelle, et une aide facultative. */
export function Case({ libelle, coche, poser, aide, children }: { libelle: string; coche: boolean; poser: (v: boolean) => void; aide?: string; children?: ReactNode }) {
  const idAide = useId();
  return (
    <div className="champ-site">
      <label className="choix-case">
        <input type="checkbox" checked={coche} onChange={e => poser(e.target.checked)} aria-describedby={aide ? idAide : undefined} />
        <span>{libelle}</span>
      </label>
      {aide ? <p id={idAide} className="aide">{aide}</p> : null}
      {children}
    </div>
  );
}
