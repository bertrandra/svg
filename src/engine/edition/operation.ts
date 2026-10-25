// L'operation d'une forme dans le fichier (ADR-0028) : `data-ed-operation="decoupe"` ou `"ecriture"` sur son <path>. Ici,
// seulement les octets : le nom de l'attribut, sa lecture stricte et son ecriture. Ce que vaut l'operation par defaut, et quand
// elle merite d'etre ecrite, se decide dans engine/preparation/operations.ts, qui connait les procedes. Pur.

import type { Forme, Operation } from './types.js';

export const ATTRIBUT_OPERATION = 'data-ed-operation';
export const OPERATIONS: readonly Operation[] = ['decoupe', 'ecriture'];

/** L'operation lue sur la valeur d'un attribut, ou undefined : seules les deux valeurs exactes se lisent, rien n'est devine. */
export function lireOperation(v: string | undefined): Operation | undefined {
  const t = (v ?? '').trim();
  return t === 'decoupe' || t === 'ecriture' ? t : undefined;
}

/** Ce que l'ecriture ajoute au <path> d'une forme qui porte une operation : ` data-ed-operation="…"`, ou rien. */
export const attributOperation = (f: Forme): string => (f.operation ? ' ' + ATTRIBUT_OPERATION + '="' + f.operation + '"' : '');
