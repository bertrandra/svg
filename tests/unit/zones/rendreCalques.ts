// Le panneau des calques rendu hors navigateur (renderToStaticMarkup), dans un editeur de facade : un dessin, une selection, un
// profil de production facultatif, les groupes deplies. Les verbes ne font rien ; ce qui compte ici est le DOM rendu.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DessinSvg } from '../../../src/engine/editionSvg.js';
import type { ProfilProduction } from '../../../src/engine/preparation.js';
import { Calques } from '../../../src/zones/Calques.js';
import { FournisseurEditeur } from '../../../src/zones/contexteEditeur.js';
import type { ActionsEditeur, EtatInterface, ModeleDessin } from '../../../src/zones/typesEditeur.js';

export interface OptionsRendu {
  readonly sel?: readonly string[];
  readonly profil?: ProfilProduction | null;
  readonly deplies?: ReadonlySet<string>;
  readonly contexte?: string | null;
  /** Un historique qui a un passe (le dessin a ete vide par un geste) : l'etat vide qui le dit. */
  readonly passe?: boolean;
}

/** Des verbes qui ne font rien : chaque propriete lue est une fonction vide. */
const actions = new Proxy({}, { get: () => () => undefined }) as ActionsEditeur;

export function rendreCalques(dessin: DessinSvg, o: OptionsRendu = {}): string {
  const sel = [...(o.sel ?? [])];
  const modele = {
    h: { passe: o.passe ? [dessin] : [], present: dessin, futur: [], cle: null },
    dessin, sel, choisies: new Set(sel), boite: null, formeSeule: null, nuancier: [], ignores: [], bibliotheque: null, versions: [], presse: [], preparation: null
  } as unknown as ModeleDessin;
  const etat = {
    profil: o.profil ?? null, deplies: o.deplies ?? new Set<string>(), contexte: o.contexte ? { groupe: o.contexte } : null
  } as unknown as EtatInterface;
  return renderToStaticMarkup(createElement(FournisseurEditeur, { dessin: modele, actions, etat, children: createElement(Calques) }));
}
