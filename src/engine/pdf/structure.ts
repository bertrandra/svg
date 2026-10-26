// La structure d'un PDF (ISO 32000-1, 7.5) : l'en-tete, la table des objets (classique « xref » ou en flux, PDF 1.5), la chaine
// des enregistrements incrementaux (/Prev, /XRefStm), le trailer, les flux d'objets (ObjStm) et la lecture paresseuse de
// chaque objet. Un fichier dont la table est fausse (decalages faux, table absente, fin tronquee) est reindexe par un balayage
// lineaire des « n g obj », comme le font les lecteurs courants : ce qu'un lecteur de PDF montre, on le lit.
//
// Pur : les octets arrivent, rien ne sort que des objets. La decompression vient du dehors (`Decompression`).

import { chercher, chercherAvant, finitJeton, estBlanc, Lecteur, lireObjet } from './lexique.js';
import { decoder, nouveauBudget, type Decodage } from './filtres.js';
import { LIMITES_PDF, RefusPdf, SyntaxePdf, enFrancais, type Decompression } from './limites.js';
import { Mot, dictDe, estDict, estFlux, estNom, estNombre, estRef, estTableau, type Dict, type Flux, type ObjetPdf } from './objets.js';
import { t } from '../../util/i18n.js';

type Entree = { readonly type: 'n'; readonly pos: number } | { readonly type: 'c'; readonly flot: number; readonly index: number };
interface Flot { readonly donnees: Uint8Array; readonly premier: number; readonly paires: ReadonlyArray<readonly [number, number]> }

// Traduit a l'appel (ADR-0042) : la langue est posee apres le chargement du module.
const REFUS_CHIFFRE = (): string => t('Ce PDF est chiffré (protégé par un mot de passe ou par des restrictions) : il ne s’ouvre pas ici. Enregistrez-en une copie sans protection depuis votre logiciel, puis rouvrez-la.');
/** Le refus d'une table de plus de N objets, le meme pour la table lue et pour le balayage. */
const refusTropDObjets = (): RefusPdf => new RefusPdf(t('Ce PDF compte plus de {n} objets : il est trop gros pour être lu ici.', { n: enFrancais(LIMITES_PDF.objets) }));

/** Un document ouvert : sa table des objets, son trailer, et les objets lus a la demande. */
export class DocumentPdf {
  readonly entrees = new Map<number, Entree>();
  trailer: Dict = new Map();
  readonly decodage: Decodage;
  private readonly cache = new Map<number, ObjetPdf>();
  private readonly decodes = new Map<number, Uint8Array>();
  private readonly enCours = new Set<number>();
  private readonly flots = new Map<number, Flot>();
  private reindexe: Map<number, Entree> | null = null;
  private lus = 0;

  constructor(readonly octets: Uint8Array, decompresser: Decompression) {
    this.decodage = { decompresser, budget: nouveauBudget() };
  }

  poser(n: number, e: Entree): void {
    if (!Number.isInteger(n) || n < 0) return;
    if (this.entrees.size >= LIMITES_PDF.objets && !this.entrees.has(n)) throw refusTropDObjets();
    // La section la plus recente est lue la premiere : une entree deja posee l'emporte.
    if (!this.entrees.has(n)) this.entrees.set(n, e);
  }

  /** L'objet numero `n`, ou null s'il n'existe pas ou ne se lit pas (7.3.10 : un renvoi vers un objet absent vaut null). */
  objet(n: number): ObjetPdf {
    const vu = this.cache.get(n);
    if (vu !== undefined) return vu;
    if (this.enCours.has(n)) throw new SyntaxePdf(t('un objet qui dépend de lui-même'));
    if (++this.lus > LIMITES_PDF.objets) throw new RefusPdf(t('Ce PDF demande de lire plus de {n} objets : il est trop gros pour être lu ici.', { n: enFrancais(LIMITES_PDF.objets) }));
    this.enCours.add(n);
    try {
      let v: ObjetPdf;
      try { v = this.lireEntree(n, this.entrees.get(n)); } catch (e) {
        if (!(e instanceof SyntaxePdf)) throw e;
        // Un decalage faux dans la table : le balayage du fichier retrouve l'objet ou il est vraiment.
        const ailleurs = this.reindexer().get(n);
        try { v = ailleurs ? this.lireEntree(n, ailleurs) : null; } catch (e2) { if (!(e2 instanceof SyntaxePdf)) throw e2; v = null; }
      }
      this.cache.set(n, v);
      return v;
    } finally {
      this.enCours.delete(n);
    }
  }

  /**
   * L'objet que designe `o` : lui-meme, ou celui de son renvoi. Une chaine de renvois trop longue (ou qui revient sur elle-meme)
   * vaut null, comme un renvoi vers un objet absent : elle ne designe rien de lisible.
   */
  resoudre(o: ObjetPdf | undefined): ObjetPdf {
    let v: ObjetPdf | undefined = o, k = 0;
    while (estRef(v)) {
      if (++k > LIMITES_PDF.renvois) return null;
      v = this.objet(v.n);
    }
    return v ?? null;
  }

  /** La valeur d'une cle d'un dictionnaire, renvoi resolu. */
  valeur(d: Dict | null, cle: string): ObjetPdf { return d ? this.resoudre(d.get(cle)) : null; }
  dict(d: Dict | null, cle: string): Dict | null { const v = this.valeur(d, cle); return estDict(v) ? v : null; }
  nombre(d: Dict | null, cle: string): number | null { const v = this.valeur(d, cle); return estNombre(v) ? v : null; }
  tableau(d: Dict | null, cle: string): readonly ObjetPdf[] | null { const v = this.valeur(d, cle); return estTableau(v) ? v : null; }

  /** Les octets lisibles d'un flux, filtres appliques ; gardes, car un formulaire se dessine parfois des milliers de fois. */
  donnees(f: Flux): Uint8Array {
    const vu = this.decodes.get(f.debut);
    if (vu) return vu;
    const brut = this.octets.subarray(f.debut, f.fin);
    const filtre = this.resoudre(f.dict.get('Filter')), params = this.resoudre(f.dict.get('DecodeParms') ?? f.dict.get('DP'));
    const filtres = (estTableau(filtre) ? filtre.map(x => this.resoudre(x)) : [filtre]).filter(estNom);
    const listeParams = (estTableau(params) ? params.map(x => this.resoudre(x)) : [params]).map(p => (estDict(p) ? p : null));
    const r = filtres.length ? decoder(brut, filtres, listeParams, f.debut, this.decodage) : brut;
    this.decodes.set(f.debut, r);
    return r;
  }

  private lireEntree(n: number, e: Entree | undefined): ObjetPdf {
    if (!e) return null;
    return e.type === 'n' ? this.objetEnPosition(e.pos, n) : this.objetDeFlot(n, e.flot, e.index);
  }

  /** L'objet indirect ecrit a la position `pos` (« n g obj … endobj »), flux compris. `n` absent : on ne verifie pas son numero. */
  objetEnPosition(pos: number, n?: number): ObjetPdf {
    const l = new Lecteur(this.octets, pos);
    const a = l.jeton(), b = l.jeton(), c = l.jeton();
    if (!estNombre(a) || (n !== undefined && a !== n) || !estNombre(b) || !(c instanceof Mot && c.v === 'obj')) throw new SyntaxePdf(t('un objet introuvable à sa position'));
    const v = lireObjet(l, true);
    if (v === undefined) throw new SyntaxePdf(t('un objet coupé par la fin du fichier'));
    if (v instanceof Mot) { if (v.v === 'endobj') return null; throw new SyntaxePdf(t('un objet illisible')); }
    if (!estDict(v)) return v;
    const avant = l.pos, k = l.jeton();
    if (k instanceof Mot && k.v === 'stream') return this.flux(v, l.pos);
    l.pos = avant;
    return v;
  }

  /** Un flux dont le mot « stream » finit en `apres` : ses bornes, par sa longueur si elle tombe juste, sinon par « endstream ». */
  private flux(dict: Dict, apres: number): Flux {
    const o = this.octets;
    let debut = apres;
    if (o[debut] === 13 && o[debut + 1] === 10) debut += 2; else if (o[debut] === 10 || o[debut] === 13) debut += 1;
    let longueur: ObjetPdf = dict.get('Length') ?? null;
    if (estRef(longueur)) { try { longueur = this.resoudre(longueur); } catch (e) { if (!(e instanceof SyntaxePdf)) throw e; longueur = null; } }
    if (estNombre(longueur) && longueur >= 0 && debut + longueur <= o.length) {
      let k = debut + longueur;
      while (k < o.length && k < debut + longueur + 64 && estBlanc(o[k] ?? 0)) k++;
      if (chercher(o, 'endstream', k, k + 9) === k) return { t: 'flux', dict, debut, fin: debut + longueur };
    }
    // Sans « endstream », le fichier a ete coupe : le flux va jusqu'a la fin, ce qui s'en lit est garde.
    const fin = chercher(o, 'endstream', debut);
    let f = fin < 0 ? o.length : fin;
    if (o[f - 1] === 10) f--;
    if (o[f - 1] === 13) f--;
    return { t: 'flux', dict, debut, fin: Math.max(debut, f) };
  }

  private objetDeFlot(n: number, numero: number, index: number): ObjetPdf {
    let flot = this.flots.get(numero);
    if (!flot) {
      const f = this.objet(numero);
      if (!estFlux(f) || f.dict.get('Type') !== 'ObjStm') throw new SyntaxePdf(t('un flux d’objets introuvable'));
      flot = lireFlot(this.donnees(f), f.dict);
      this.flots.set(numero, flot);
    }
    // L'index de la table donne la paire ; un producteur fautif se rattrape par le numero.
    const paire = flot.paires[index]?.[0] === n ? flot.paires[index] : flot.paires.find(p => p[0] === n);
    if (!paire) return null;
    const v = lireObjet(new Lecteur(flot.donnees, flot.premier + paire[1]), true);
    if (v === undefined || v instanceof Mot) throw new SyntaxePdf(t('un objet illisible dans un flux d’objets'));
    return v;
  }

  /** L'index du fichier par balayage (calcule une fois) : chaque « n g obj », le dernier ecrit l'emportant. */
  reindexer(): Map<number, Entree> {
    if (!this.reindexe) this.reindexe = balayer(this.octets);
    return this.reindexe;
  }

  /** Les flux d'objets de l'index balaye : leurs objets entrent dans la table quand elle ne les connait pas. */
  indexerFlots(): void {
    for (const [n, e] of [...this.entrees]) {
      if (e.type !== 'n' || !commenceParDict(this.octets, e.pos)) continue;
      const f = this.objet(n);
      if (!estFlux(f) || f.dict.get('Type') !== 'ObjStm') continue;
      let flot: Flot;
      try { flot = lireFlot(this.donnees(f), f.dict); } catch (err) { if (err instanceof SyntaxePdf) continue; throw err; }
      flot.paires.forEach(([m], i) => this.poser(m, { type: 'c', flot: n, index: i }));
    }
  }
}

function lireFlot(donnees: Uint8Array, dict: Dict): Flot {
  const nombre = dict.get('N'), premier = dict.get('First');
  if (!estNombre(nombre) || !estNombre(premier) || nombre < 0 || premier < 0 || nombre > donnees.length / 2) throw new SyntaxePdf(t('un flux d’objets mal décrit'));
  const l = new Lecteur(donnees, 0, premier), paires: Array<readonly [number, number]> = [];
  for (let k = 0; k < nombre; k++) {
    const a = l.jeton(), b = l.jeton();
    if (!estNombre(a) || !estNombre(b)) break;
    paires.push([a, b]);
  }
  return { donnees, premier, paires };
}

/** Vrai si l'objet ecrit en `pos` est un dictionnaire (donc peut-etre un flux) : on n'analyse pas le reste. */
function commenceParDict(o: Uint8Array, pos: number): boolean {
  const k = chercher(o, 'obj', pos, pos + 64);
  if (k < 0) return false;
  let i = k + 3;
  while (i < o.length && estBlanc(o[i] ?? 0)) i++;
  return o[i] === 60 && o[i + 1] === 60;
}

/** Les « n g obj » du fichier, en un balayage lineaire. */
function balayer(o: Uint8Array): Map<number, Entree> {
  const index = new Map<number, Entree>();
  const chiffre = (c: number) => c >= 48 && c <= 57;
  for (let i = chercher(o, 'obj', 0); i >= 0; i = chercher(o, 'obj', i + 3)) {
    if (!estBlanc(o[i - 1] ?? 0) || (i + 3 < o.length && !finitJeton(o[i + 3] ?? 0))) continue;
    let j = i - 1;
    while (j >= 0 && estBlanc(o[j] ?? 0)) j--;
    const finG = j;
    while (j >= 0 && chiffre(o[j] ?? 0)) j--;
    if (j === finG || !estBlanc(o[j] ?? 0)) continue;
    while (j >= 0 && estBlanc(o[j] ?? 0)) j--;
    const finN = j;
    while (j >= 0 && chiffre(o[j] ?? 0)) j--;
    if (j === finN || (j >= 0 && !finitJeton(o[j] ?? 0))) continue;
    let n = 0;
    for (let k = j + 1; k <= finN; k++) n = n * 10 + ((o[k] ?? 0) - 48);
    if (index.size >= LIMITES_PDF.objets && !index.has(n)) throw refusTropDObjets();
    index.set(n, { type: 'n', pos: j + 1 });
  }
  return index;
}

/** Ouvre un PDF : en-tete, table des objets (ou reindexation), trailer ; refuse en le nommant un fichier chiffre ou illisible. */
export function ouvrirDocument(octets: Uint8Array, decompresser: Decompression): DocumentPdf {
  if (octets.length > LIMITES_PDF.octets) throw new RefusPdf(t('Ce PDF pèse plus de {n} Mo : il est trop gros pour être lu ici.', { n: enFrancais(LIMITES_PDF.octets / 1048576) }));
  if (chercher(octets, '%PDF-', 0, Math.min(octets.length, 1024 + 5)) < 0) throw new RefusPdf(t('Ce fichier n’est pas un PDF : il ne commence pas par « %PDF- ».'));
  const doc = new DocumentPdf(octets, decompresser);
  let lue = false;
  try { lireTables(doc); lue = estRef(doc.trailer.get('Root')); } catch (e) { if (!(e instanceof SyntaxePdf)) throw e; }
  if (!lue) reconstruire(doc);
  if (doc.trailer.has('Encrypt')) throw new RefusPdf(REFUS_CHIFFRE());
  return doc;
}

function lireTables(doc: DocumentPdf): void {
  const o = doc.octets;
  const sx = chercherAvant(o, 'startxref', o.length, Math.max(0, o.length - 4096));
  if (sx < 0) throw new SyntaxePdf(t('« startxref » manque'));
  let pos: number | null = (() => { const v = new Lecteur(o, sx + 9).jeton(); return estNombre(v) ? v : null; })();
  const vues = new Set<number>();
  let premier: Dict | null = null;
  while (pos !== null && !vues.has(pos)) {
    vues.add(pos);
    if (vues.size > LIMITES_PDF.sections) throw new RefusPdf(t('Ce PDF enchaîne plus de {n} enregistrements successifs : il ne se lit pas ici.', { n: LIMITES_PDF.sections }));
    const trailer = lireSection(doc, pos);
    premier = premier ?? trailer;
    const flux = trailer.get('XRefStm');
    if (estNombre(flux) && !vues.has(flux)) { vues.add(flux); lireSection(doc, flux); }
    const prev = trailer.get('Prev');
    pos = estNombre(prev) ? prev : null;
  }
  if (!premier) throw new SyntaxePdf(t('aucune table des objets'));
  doc.trailer = premier;
}

function lireSection(doc: DocumentPdf, pos: number): Dict {
  if (pos < 0 || pos >= doc.octets.length) throw new SyntaxePdf(t('une table des objets hors du fichier'));
  const l = new Lecteur(doc.octets, pos);
  const m = l.jeton();
  if (m instanceof Mot && m.v === 'xref') return lireTableClassique(doc, l);
  const f = doc.objetEnPosition(pos);
  if (!estFlux(f) || f.dict.get('Type') !== 'XRef') throw new SyntaxePdf(t('une table des objets introuvable'));
  lireTableFlux(doc, f);
  return f.dict;
}

function lireTableClassique(doc: DocumentPdf, l: Lecteur): Dict {
  for (;;) {
    const debut = l.jeton();
    if (debut instanceof Mot && debut.v === 'trailer') break;
    const nombre = l.jeton();
    if (!estNombre(debut) || !estNombre(nombre) || nombre < 0) throw new SyntaxePdf(t('une table des objets illisible'));
    let premier = debut;
    for (let k = 0; k < nombre; k++) {
      const pos = l.jeton(), g = l.jeton(), type = l.jeton();
      if (!estNombre(pos) || !estNombre(g) || !(type instanceof Mot)) throw new SyntaxePdf(t('une entrée de table illisible'));
      // Un decalage courant chez les producteurs fautifs : une section « 1 n » qui commence par l'entree libre de l'objet 0.
      if (k === 0 && premier === 1 && pos === 0 && type.v === 'f') premier = 0;
      if (type.v === 'n' && pos > 0) doc.poser(premier + k, { type: 'n', pos });
    }
  }
  const trailer = lireObjet(l, true);
  if (!estDict(trailer)) throw new SyntaxePdf(t('un trailer illisible'));
  return trailer;
}

function lireTableFlux(doc: DocumentPdf, f: Flux): void {
  const largeurs = f.dict.get('W'), taille = f.dict.get('Size');
  if (!estTableau(largeurs) || largeurs.length < 3) throw new SyntaxePdf(t('une table en flux sans /W'));
  const w = largeurs.slice(0, 3).map(v => (estNombre(v) ? Math.floor(v) : -1));
  const [w0 = 0, w1 = 0, w2 = 0] = w;
  if (w.some(v => v < 0 || v > 8) || w0 + w1 + w2 === 0) throw new SyntaxePdf(t('une table en flux aux largeurs invalides'));
  const index = f.dict.get('Index') ?? [0, estNombre(taille) ? taille : 0];
  if (!estTableau(index)) throw new SyntaxePdf(t('une table en flux à l’index illisible'));
  const d = doc.donnees(f), pas = w0 + w1 + w2;
  let i = 0;
  const lire = (n: number) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + (d[i++] ?? 0); return v; };
  for (let s = 0; s + 1 < index.length; s += 2) {
    const debut = index[s], nombre = index[s + 1];
    if (!estNombre(debut) || !estNombre(nombre) || nombre < 0) throw new SyntaxePdf(t('une table en flux à l’index illisible'));
    for (let k = 0; k < nombre && i + pas <= d.length; k++) {
      const type = w0 ? lire(w0) : 1, a = lire(w1), b = lire(w2);
      if (type === 1 && a > 0) doc.poser(debut + k, { type: 'n', pos: a });
      else if (type === 2) doc.poser(debut + k, { type: 'c', flot: a, index: b });
    }
  }
}

/** La table refaite par balayage : chaque objet, puis le trailer le plus recent (ou, a defaut, le catalogue trouve). */
function reconstruire(doc: DocumentPdf): void {
  doc.entrees.clear();
  for (const [n, e] of doc.reindexer()) doc.poser(n, e);
  if (!doc.entrees.size) throw new RefusPdf(t('Ce PDF ne se lit pas : aucun objet n’y a été trouvé (fichier tronqué ou endommagé).'));
  doc.indexerFlots();
  const o = doc.octets;
  let trailer: Dict | null = null;
  for (let i = chercher(o, 'trailer', 0); i >= 0; i = chercher(o, 'trailer', i + 7)) {
    try {
      const d = lireObjet(new Lecteur(o, i + 7), true);
      if (estDict(d) && (estRef(d.get('Root')) || d.has('Encrypt'))) trailer = d;
    } catch (e) { if (!(e instanceof SyntaxePdf)) throw e; }
  }
  if (!trailer) trailer = trailerDesObjets(doc);
  if (!trailer) throw new RefusPdf(t('Ce PDF ne se lit pas : son catalogue de pages est introuvable (fichier tronqué ou endommagé).'));
  doc.trailer = trailer;
}

/** Faute de trailer ecrit : le dictionnaire d'une table en flux qui nomme le catalogue, sinon un objet /Catalog. */
function trailerDesObjets(doc: DocumentPdf): Dict | null {
  let catalogue: number | null = null, flux: Dict | null = null;
  for (const n of [...doc.entrees.keys()].sort((a, b) => a - b)) {
    const v = doc.objet(n), d = dictDe(v);
    if (!d) continue;
    if (d.get('Type') === 'XRef' && (estRef(d.get('Root')) || d.has('Encrypt'))) flux = d;
    else if (d.get('Type') === 'Catalog') catalogue = n;
  }
  return flux ?? (catalogue !== null ? new Map<string, ObjetPdf>([['Root', { t: 'ref', n: catalogue, g: 0 }]]) : null);
}
