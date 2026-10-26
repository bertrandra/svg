// Lire un petit document XML (un SVG) en arbre, sans DOM : le coeur pur l'edite et les tests le
// lisent sous Node. Ce n'est pas un validateur : on lit ce qu'un logiciel de dessin ecrit
// (declarations, commentaires, CDATA, balises et attributs), et l'on refuse, en le nommant, un texte
// casse ou demesure.
//
// Le decoupage est un balayage lineaire, ecrit a la main : un SVG vient d'un inconnu (docs/securite.md),
// et une expression reguliere a groupes imbriques peut devenir quadratique sur une balise jamais fermee.
// Les entites declarees par un DOCTYPE ne sont JAMAIS developpees (ni internes, ni externes) : une
// reference inconnue reste telle quelle, ce qui rend inertes les bombes d'entites et les entites externes.
// Les limites ci-dessous bornent le temps et la memoire, avec un refus nomme au-dela.

import { nombre } from './i18n.js';

export interface Noeud {
  nom: string;
  attributs: Record<string, string>;
  enfants: Noeud[];
  texte: string;
  /** Le contenu dans l'ordre du document, textes et elements meles (le texte d'un <text> entoure ses <tspan>). */
  suite?: Array<string | Noeud>;
}

/** Ce qu'on accepte de lire. Hautes, pour qu'aucun SVG reel n'y touche ; basses, pour qu'un SVG hostile ne coute pas plus de quelques secondes. */
export interface LimitesXml {
  /** Longueur du texte, en caracteres. Un SVG de 5 000 formes vectorisees pese ~2 Mo ; 64 Mo est un dessin que personne n'edite. */
  readonly caracteres: number;
  /** Elements au total. Une carte detaillee en compte quelques centaines de milliers. */
  readonly noeuds: number;
  /** Niveaux d'elements imbriques. Les outils de dessin en font moins de 50 (un test du depot en monte 600) ; la pile des fonctions recursives tient bien au-dela. */
  readonly profondeur: number;
  /** Attributs d'un meme element. Un element reel en porte moins de 60. */
  readonly attributs: number;
  /** Longueur d'un nom d'element ou d'attribut. */
  readonly nom: number;
}

export const LIMITES_XML: LimitesXml = { caracteres: 64 * 1024 * 1024, noeuds: 1_000_000, profondeur: 1024, attributs: 1000, nom: 256 };

/** Un attribut tel qu'il est ecrit : ses blancs d'avant, son nom, sa valeur brute (entites non decodees) et son guillemet. */
export interface AttributBrut { readonly blancs: string; readonly corps: string; readonly nom: string; readonly valeur: string; readonly guillemet: '"' | "'" | ''; readonly aValeur: boolean }

export type Jeton =
  | { readonly t: 'debut'; readonly nom: string; readonly attributs: readonly AttributBrut[]; readonly queue: string; readonly autoFermant: boolean; readonly profondeur: number }
  | { readonly t: 'fin'; readonly nom: string }
  | { readonly t: 'texte'; readonly brut: string }
  | { readonly t: 'cdata'; readonly contenu: string }
  | { readonly t: 'commentaire' | 'instruction' }
  | { readonly t: 'doctype'; readonly entites: boolean };

/** Un refus de lecture : son message est pret a etre montre. */
export class ErreurXml extends Error {}

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decoderEntites(t: string): string {
  if (!t.includes('&')) return t;
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[e.toLowerCase()] ?? tout;
  });
}

export const echapperAttribut = (t: string): string => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const MOT_NOM = /^[\p{L}_:][\p{L}\p{M}\p{N}_:.\-·]*$/u;

const estBlanc = (c: number): boolean => c === 32 || c === 10 || c === 9 || c === 13 || c === 12;
const court = (t: string): string => (t.length > 40 ? t.slice(0, 37) + '…' : t);

/** Le DOCTYPE qui commence en `debut` (« <! »), jusqu'a son « > » : le sous-ensemble interne [ … ] et les chaines quotees s'enjambent. */
function finDoctype(t: string, debut: number): { fin: number; entites: boolean } {
  let i = debut + 2, crochet = 0, guillemet = 0, entites = false;
  for (; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (guillemet) { if (c === guillemet) guillemet = 0; continue; }
    if (c === 34 || c === 39) guillemet = c;
    else if (c === 91) crochet++;
    else if (c === 93 && crochet > 0) crochet--;
    else if (c === 60 && crochet > 0) {
      if (t.startsWith('<!--', i)) {
        const f = t.indexOf('-->', i + 4);
        if (f < 0) throw new ErreurXml('un commentaire du DOCTYPE n’est jamais fermé');
        i = f + 2;
      } else if (/^<!ENTITY/i.test(t.slice(i, i + 9))) entites = true;
    } else if (c === 62 && crochet === 0) return { fin: i, entites };
  }
  throw new ErreurXml('le DOCTYPE n’est jamais fermé');
}

/** L'index qui suit un DOCTYPE commencant en `debut` (« <! »), ou -1 s'il n'est pas ferme. Sert a trouver la racine sans etre trompe par son sous-ensemble interne. */
export function apresDoctype(texte: string, debut: number): number {
  try { return finDoctype(texte, debut).fin + 1; } catch (e) { if (e instanceof ErreurXml) return -1; throw e; }
}

/** Une balise ouvrante lue depuis `lt` (le « < ») : son nom, ses attributs, et ou elle finit. */
function lireBalise(t: string, lt: number, lim: LimitesXml): { nom: string; attributs: AttributBrut[]; queue: string; autoFermant: boolean; fin: number } {
  const n = t.length;
  let j = lt + 1;
  while (j < n) { const c = t.charCodeAt(j); if (estBlanc(c) || c === 47 || c === 62) break; j++; }
  const nom = t.slice(lt + 1, j);
  if (nom.length > lim.nom || !MOT_NOM.test(nom)) throw new ErreurXml(nom.length > lim.nom ? 'un nom d’élément dépasse ' + lim.nom + ' caractères' : 'le nom d’élément « ' + court(nom) + ' » n’est pas valide');
  const attributs: AttributBrut[] = [];
  for (;;) {
    const debutBlancs = j;
    while (j < n && estBlanc(t.charCodeAt(j))) j++;
    if (j >= n) throw new ErreurXml('la balise « ' + court(nom) + ' » n’est jamais fermée');
    const c = t.charCodeAt(j);
    if (c === 62) return { nom, attributs, queue: t.slice(debutBlancs, j + 1), autoFermant: false, fin: j + 1 };
    if (c === 47) {
      if (t.charCodeAt(j + 1) !== 62) throw new ErreurXml('une barre isolée dans la balise « ' + court(nom) + ' »');
      return { nom, attributs, queue: t.slice(debutBlancs, j + 2), autoFermant: true, fin: j + 2 };
    }
    if (j === debutBlancs) throw new ErreurXml('des attributs collés dans la balise « ' + court(nom) + ' »');
    const d = j;
    while (j < n) { const k = t.charCodeAt(j); if (estBlanc(k) || k === 61 || k === 47 || k === 62) break; j++; }
    const nomAttr = t.slice(d, j);
    if (nomAttr.length > lim.nom || !MOT_NOM.test(nomAttr)) throw new ErreurXml(nomAttr.length > lim.nom ? 'un nom d’attribut dépasse ' + lim.nom + ' caractères' : 'le nom d’attribut « ' + court(nomAttr) + ' » n’est pas valide');
    if (attributs.length >= lim.attributs) throw new ErreurXml('l’élément « ' + court(nom) + ' » porte plus de ' + lim.attributs + ' attributs');
    const blancs = t.slice(debutBlancs, d);
    let k = j;
    while (k < n && estBlanc(t.charCodeAt(k))) k++;
    if (t.charCodeAt(k) !== 61) { attributs.push({ blancs, corps: nomAttr, nom: nomAttr, valeur: '', guillemet: '', aValeur: false }); continue; }
    k++;
    while (k < n && estBlanc(t.charCodeAt(k))) k++;
    const q = t.charCodeAt(k);
    if (q === 34 || q === 39) {
      const f = t.indexOf(q === 34 ? '"' : "'", k + 1);
      if (f < 0) throw new ErreurXml('une valeur d’attribut de « ' + court(nom) + ' » n’est jamais fermée');
      attributs.push({ blancs, corps: t.slice(d, f + 1), nom: nomAttr, valeur: t.slice(k + 1, f), guillemet: q === 34 ? '"' : "'", aValeur: true });
      j = f + 1;
    } else {
      let f = k;
      while (f < n && !estBlanc(t.charCodeAt(f)) && t.charCodeAt(f) !== 62) f++;
      attributs.push({ blancs, corps: t.slice(d, f), nom: nomAttr, valeur: t.slice(k, f), guillemet: '', aValeur: true });
      j = f;
    }
  }
}

/**
 * Parcourt le document jeton par jeton, en verifiant l'imbrication (une fermeture orpheline ou une balise jamais fermee
 * est un refus). Leve `ErreurXml` au premier defaut ou au premier depassement d'une limite.
 */
export function parcourirXml(texte: string, rappel: (j: Jeton) => void, lim: LimitesXml = LIMITES_XML): void {
  if (texte.length > lim.caracteres) throw new ErreurXml('il dépasse ' + Math.round(lim.caracteres / 1048576) + ' millions de caractères');
  const pile: string[] = [];
  const n = texte.length;
  let i = 0, noeuds = 0;
  while (i < n) {
    const lt = texte.indexOf('<', i);
    const finTexte = lt < 0 ? n : lt;
    if (finTexte > i) rappel({ t: 'texte', brut: texte.slice(i, finTexte) });
    if (lt < 0) break;
    const c = texte.charCodeAt(lt + 1);
    if (c === 33) { // « <! » : commentaire, CDATA, DOCTYPE
      if (texte.startsWith('<!--', lt)) {
        const f = texte.indexOf('-->', lt + 4);
        if (f < 0) throw new ErreurXml('un commentaire n’est jamais fermé');
        rappel({ t: 'commentaire' });
        i = f + 3;
      } else if (texte.startsWith('<![CDATA[', lt)) {
        const f = texte.indexOf(']]>', lt + 9);
        if (f < 0) throw new ErreurXml('une section CDATA n’est jamais fermée');
        rappel({ t: 'cdata', contenu: texte.slice(lt + 9, f) });
        i = f + 3;
      } else {
        const d = finDoctype(texte, lt);
        rappel({ t: 'doctype', entites: d.entites });
        i = d.fin + 1;
      }
    } else if (c === 63) { // « <? » : instruction de traitement
      const f = texte.indexOf('?>', lt + 2);
      if (f < 0) throw new ErreurXml('une instruction de traitement n’est jamais fermée');
      rappel({ t: 'instruction' });
      i = f + 2;
    } else if (c === 47) { // « </ » : fermeture
      const f = texte.indexOf('>', lt + 2);
      if (f < 0) throw new ErreurXml('une balise fermante n’est jamais terminée');
      const nom = texte.slice(lt + 2, f).trim();
      if (pile.pop() !== nom) throw new ErreurXml('la balise fermante « ' + court(nom) + ' » ne ferme rien');
      rappel({ t: 'fin', nom });
      i = f + 1;
    } else {
      if (!(c >= 0) || estBlanc(c) || c === 62 || c === 60 || c === 61) throw new ErreurXml('un « < » isolé');
      if (++noeuds > lim.noeuds) throw new ErreurXml('il a plus de ' + nombre(lim.noeuds) + ' éléments');
      const b = lireBalise(texte, lt, lim);
      if (!b.autoFermant && pile.length >= lim.profondeur) throw new ErreurXml('il est trop profond (plus de ' + lim.profondeur + ' niveaux d’éléments imbriqués)');
      rappel({ t: 'debut', nom: b.nom, attributs: b.attributs, queue: b.queue, autoFermant: b.autoFermant, profondeur: pile.length });
      if (!b.autoFermant) pile.push(b.nom);
      i = b.fin;
    }
  }
  if (pile.length > 0) throw new ErreurXml('la balise « ' + court(pile[pile.length - 1] ?? '') + ' » n’est jamais fermée');
}

/**
 * La phrase montree pour un refus de lecture. Un message qui commence par « il » dit une limite depassee (le SVG est trop gros,
 * trop profond…) ; les autres disent un defaut de forme.
 */
export const phraseErreurXml = (message: string): string =>
  message.startsWith('il ') ? 'Ce SVG ' + message.slice(3) + ' : simplifiez-le dans votre logiciel.' : 'Ce SVG ne se lit pas : ' + message + '.';

/** Le document lu en arbre, ou le refus nomme (« Ce SVG … » moins son debut). */
export function analyserXml(texte: string, lim: LimitesXml = LIMITES_XML): { racine: Noeud } | { erreur: string } {
  const racine: Noeud = { nom: '#document', attributs: {}, enfants: [], texte: '' };
  const pile: Noeud[] = [racine];
  try {
    parcourirXml(texte, j => {
      const courant = pile[pile.length - 1] ?? racine;
      if (j.t === 'texte') { const t = decoderEntites(j.brut); courant.texte += t; (courant.suite ??= []).push(t); }
      else if (j.t === 'cdata') { courant.texte += j.contenu; (courant.suite ??= []).push(j.contenu); }
      else if (j.t === 'fin') pile.pop();
      else if (j.t === 'debut') {
        const attributs: Record<string, string> = {};
        for (const a of j.attributs) attributs[a.nom] = decoderEntites(a.valeur);
        const noeud: Noeud = { nom: j.nom, attributs, enfants: [], texte: '' };
        courant.enfants.push(noeud);
        (courant.suite ??= []).push(noeud);
        if (!j.autoFermant) pile.push(noeud);
      }
    }, lim);
  } catch (e) {
    if (e instanceof ErreurXml) return { erreur: e.message };
    throw e;
  }
  return { racine };
}

/** La racine du document, ou null s'il ne se lit pas (balise non fermee, fermeture orpheline, limite depassee). */
export function lireXml(texte: string): Noeud | null {
  const r = analyserXml(texte);
  return 'racine' in r ? r.racine : null;
}

/** Le premier element de ce nom, en profondeur (la profondeur est bornee par `LIMITES_XML.profondeur`). */
export function trouver(n: Noeud, nom: string): Noeud | null {
  for (const e of n.enfants) {
    if (e.nom === nom) return e;
    const r = trouver(e, nom);
    if (r) return r;
  }
  return null;
}
