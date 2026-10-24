// Le stockage dont l'editeur peut se passer : des confort (le dessin en cours, les versions nommees,
// les corrections de la bibliotheque), jamais un besoin. L'editeur ne connait que cette interface ; la
// page lui donne celle du navigateur, un hote lui donne ce qu'il veut (ou rien), un test lui donne la
// memoire. Tout est du JSON, et rien ne leve : un stockage absent, plein ou refuse se lit comme vide.

export interface Stockage {
  /** La valeur gardee sous `cle`, ou null si elle manque, est illisible ou si le stockage est refuse. */
  lire: <T = unknown>(cle: string) => T | null;
  /** Garde `valeur` (JSON) sous `cle` ; faux si le stockage la refuse (plein, bloque, valeur non serialisable). */
  ecrire: (cle: string, valeur: unknown) => boolean;
  /** Oublie `cle` ; sans effet si elle manque ou si le stockage est refuse. */
  retirer: (cle: string) => void;
}

/** Ce qu'un stockage rend comme texte au plus : localStorage en tient 5 a 10 Mo, au-dela c'est une valeur qui n'est pas de nous. */
const TEXTE_MAX = 32 * 1024 * 1024;

/** Les cles qui, dans un objet JSON, visent le prototype : elles ne sont jamais lues (pollution), quoi que contienne le stockage. */
const CLES_DE_PROTOTYPE: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Lit du JSON ; du texte qui n'en est pas, ou demesure, se lit comme absent. Les cles `__proto__`, `constructor` et
 * `prototype` sont retirees a la lecture : un code qui fusionne l'objet lu dans un autre (`{ ...v }`, `Object.assign`)
 * ne touche alors jamais un prototype. La forme du resultat reste a valider par celui qui le lit (zones/session.ts).
 */
function decoder<T>(texte: string | null | undefined): T | null {
  if (!texte || texte.length > TEXTE_MAX) return null;
  try { return JSON.parse(texte, (cle, valeur: unknown) => (CLES_DE_PROTOTYPE.has(cle) ? undefined : valeur)) as T; } catch { return null; }
}

/**
 * Le `localStorage` de l'origine. Chaque appel retente d'y acceder : l'acces lui-meme peut lever
 * (fenetre privee, donnees de site bloquees, cadre sans `allow-same-origin`), et le stockage peut
 * revenir ou disparaitre entre deux appels.
 */
export function stockageNavigateur(): Stockage {
  return {
    lire: <T>(cle: string): T | null => { try { return decoder<T>(localStorage.getItem(cle)); } catch { return null; } },
    ecrire: (cle, valeur) => { try { const t = JSON.stringify(valeur); if (t === undefined) return false; localStorage.setItem(cle, t); return true; } catch { return false; } },
    retirer: cle => { try { localStorage.removeItem(cle); } catch { /* sans stockage, rien a oublier */ } }
  };
}

/**
 * Un stockage en memoire, pour un test ou pour « sans magasin » : il garde le temps de la page et
 * rend des copies (comme le ferait un vrai stockage), jamais l'objet qu'on lui a donne.
 */
export function stockageMemoire(depart: Readonly<Record<string, unknown>> = {}): Stockage {
  const textes = new Map<string, string>();
  const ecrire = (cle: string, valeur: unknown): boolean => {
    try { const t = JSON.stringify(valeur); if (t === undefined) return false; textes.set(cle, t); return true; } catch { return false; }
  };
  for (const [cle, valeur] of Object.entries(depart)) ecrire(cle, valeur);
  return {
    lire: <T>(cle: string): T | null => decoder<T>(textes.get(cle)),
    ecrire,
    retirer: cle => { textes.delete(cle); }
  };
}

/** Vrai quand `v` a les trois verbes d'un stockage (ce qu'un hote non type doit fournir). */
export const estStockage = (v: unknown): v is Stockage =>
  typeof v === 'object' && v !== null && ['lire', 'ecrire', 'retirer'].every(k => typeof (v as Record<string, unknown>)[k] === 'function');

/**
 * Un stockage d'hote, rendu sur : si l'un de ses verbes leve, on le lit comme refuse. L'interface
 * promet que rien ne leve, mais l'hote n'est pas type.
 */
export function stockageProtege(s: Stockage): Stockage {
  return {
    lire: <T>(cle: string): T | null => { try { return s.lire<T>(cle) ?? null; } catch { return null; } },
    ecrire: (cle, valeur) => { try { return s.ecrire(cle, valeur) === true; } catch { return false; } },
    retirer: cle => { try { s.retirer(cle); } catch { /* refuse : rien a oublier */ } }
  };
}
