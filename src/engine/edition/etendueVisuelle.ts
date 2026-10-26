// La boite visuelle d'un noeud du modele v2 (ADR-0012, etape 1) : a part d'`etendue.ts`, parce qu'elle consulte le catalogue des
// fonctionnalites, et qu'une fonctionnalite (les images) emploie ce qu'`etendue.ts` emploie deja : un seul module ferait un cycle
// d'import. Pur.

import type { Boite, Contenu } from './types.js';
import { unir } from './geometrie.js';
import { boiteAvecTrait } from './etendue.js';
import { arbreDe, type NoeudArbre } from './arbre.js';
import { etendreFeuille, etendreGroupe, type Fonctionnalite } from './fonctionnalites.js';
import { FONCTIONNALITES } from './catalogue.js';

/**
 * La boite visuelle d'un noeud (ADR-0012, annexe 3 §2) : ce qui se voit, pour `ajusterPlan` et la region d'un filtre. Une feuille :
 * sa boite avec son trait, que chaque fonctionnalite peut elargir (ses effets) ; un groupe : l'union de ses enfants visibles, que
 * chaque fonctionnalite peut rogner (sa decoupe) ou elargir (ses effets). Les etapes 5 et 7 remplissent ces crochets
 * (`etendue.feuille`, `etendue.groupe`) sans toucher a ce fichier. null : un noeud inconnu ou sans rien de visible.
 */
export function boiteVisuelle(d: Contenu, id: string, fonctions: readonly Fonctionnalite[] = FONCTIONNALITES): Boite | null {
  const noeud = arbreDe(d).parId.get(id);
  return noeud ? boiteDuNoeud(noeud, fonctions) : null;
}

function boiteDuNoeud(n: NoeudArbre, fonctions: readonly Fonctionnalite[]): Boite | null {
  if (n.genre === 'feuille') {
    const b = boiteAvecTrait(n.forme);
    return b ? etendreFeuille(fonctions, n.forme, b) : null;
  }
  const b = unir(n.enfants.filter(e => (e.genre === 'feuille' ? e.forme.visible : e.groupe.visible)).map(e => boiteDuNoeud(e, fonctions)));
  return b ? etendreGroupe(fonctions, n.groupe, b) : null;
}
