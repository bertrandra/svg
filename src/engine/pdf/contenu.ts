// L'interprete d'un flux de contenu (ISO 32000-1, 8 et 9) : les operateurs de trace (m l c v y h re), de peinture
// (f F f* S s B B* b b* n), de decoupe (W W*), d'etat (q Q cm w J j M d gs), de couleur (g G rg RG k K cs CS sc SC scn SCN),
// les formulaires (Do d'un XObject Form, deplie avec sa matrice), le contenu marque (calques) et le texte (BT…ET, en lettres par
// texte.ts quand la lecture a ses polices). Les images (Do d'une image, BI…ID…EI) ne sont pas reprises : elles sont comptees. Un degrade peint par `sh` dans une decoupe
// devient la forme de cette decoupe, d'une couleur unie approchee.
//
// Chaque point est porte dans le repere du dessin des sa construction (matrice courante, puis celle de la page) : la forme
// rendue n'a plus rien a transformer. Les bornes (operateurs, formes, segments, pile, formulaires) sont des refus nommes.

import { IDENTITE, multiplier, translation, type Commande, type Forme, type Matrice } from '../editionSvg.js';
import { couleurInitiale, composantes, hexDe, lireEspace, versRvb, GRIS, RVB, CMJN, type Espace } from './couleurs.js';
import { copier, type Contexte, type Etat, type Peinture } from './etat.js';
import { lireFonction } from './fonctions.js';
import { chercher, estBlanc, Lecteur, lireObjet } from './lexique.js';
import { LIMITES_PDF, RefusPdf, SyntaxePdf, enFrancais } from './limites.js';
import { Mot, dictDe, estDict, estFlux, estNom, estNombre, estRef, estTableau, type Dict, type Flux, type ObjetPdf } from './objets.js';
import { boite } from './pages.js';
import { couleurDe, dessine, formeDe, intersecter } from './trace.js';
import { dictPolice, lettres, policeDe, poser } from './texte.js';
import type { PolicePdf } from './polices.js';
import { t } from '../../util/i18n.js';

type Point = readonly [number, number];

const refus = (quoi: string): RefusPdf => new RefusPdf(t('Ce PDF {quoi} : simplifiez-le dans votre logiciel avant de l’exporter.', { quoi }));
/** Le refus d'une coordonnee hors borne, le meme pour un point et pour une forme. */
const coordonneesDemesurees = (): RefusPdf => refus(t('a des coordonnées démesurées (au-delà de ± {n})', { n: enFrancais(LIMITES_PDF.coordonnee) }));

/** Un flux de contenu en cours d'execution, avec ses ressources et son etat. Un formulaire en a un a lui. */
export class Interprete {
  private e: Etat;
  private t: Matrice;
  private readonly pile: Etat[] = [];
  private readonly ops: ObjetPdf[] = [];
  private chemin: Commande[] = [];
  private depart: Point | null = null;
  private courant: Point | null = null;
  private decoupeEnAttente = false;
  private texte = false;
  private texteMontre = false;
  private tm: Matrice = IDENTITE;
  private tlm: Matrice = IDENTITE;
  private readonly marques: boolean[] = [];

  constructor(private readonly ctx: Contexte, private readonly ressources: Dict | null, etat: Etat, private readonly profondeur: number, private readonly masque: boolean) {
    this.e = copier(etat);
    this.t = multiplier(ctx.page, this.e.ctm);
  }

  /** Execute un flux de contenu. Un defaut de syntaxe arrete ce flux (ce qui precede est garde, et la perte dite). */
  executer(octets: Uint8Array): void {
    const l = new Lecteur(octets);
    try {
      for (;;) {
        const o = lireObjet(l, false);
        if (o === undefined) break;
        if (!(o instanceof Mot)) {
          if (this.ops.length >= LIMITES_PDF.operandes) throw new SyntaxePdf(t('trop d’opérandes'));
          this.ops.push(o);
          continue;
        }
        if (++this.ctx.operateurs > LIMITES_PDF.operateurs) throw refus(t('compte plus de {n} opérations de dessin', { n: enFrancais(LIMITES_PDF.operateurs) }));
        if (o.v === 'BI') this.imageEnLigne(l);
        else this.operateur(o.v);
        this.ops.length = 0;
      }
    } catch (err) {
      if (!(err instanceof SyntaxePdf)) throw err;
      this.ctx.pertes.illisible = true;
    }
    if (this.texte && this.texteMontre) this.ctx.pertes.textes++;
  }

  private get cache(): boolean { return this.masque || this.marques[this.marques.length - 1] === true; }

  /** Les `n` derniers operandes en nombres (les lecteurs courants ignorent les operandes en trop), ou null. */
  private nombres(n: number): number[] | null {
    if (this.ops.length < n) return null;
    const v = this.ops.slice(this.ops.length - n);
    return v.every(estNombre) ? v : null;
  }

  private point(x: number, y: number): Point {
    const t = this.t, px = t[0] * x + t[2] * y + t[4], py = t[1] * x + t[3] * y + t[5];
    if (!(Math.abs(px) <= LIMITES_PDF.coordonnee && Math.abs(py) <= LIMITES_PDF.coordonnee)) throw coordonneesDemesurees();
    return [px, py];
  }

  private operateur(op: string): void {
    if (this.trace(op) || this.peinture(op) || this.etat(op) || this.couleur(op) || this.etatTexte(op)) return;
    this.autre(op);
  }

  /** Les operateurs d'etat et de position du texte (9.3, 9.4.2). */
  private etatTexte(op: string): boolean {
    const t = this.e.texte, v1 = () => this.nombres(1)?.[0];
    switch (op) {
      case 'Tc': { const v = v1(); if (v !== undefined) t.tc = v; return true; }
      case 'Tw': { const v = v1(); if (v !== undefined) t.tw = v; return true; }
      case 'Tz': { const v = v1(); if (v !== undefined) t.th = v / 100; return true; }
      case 'TL': { const v = v1(); if (v !== undefined) t.tl = v; return true; }
      case 'Tr': { const v = v1(); if (v !== undefined) t.tr = v; return true; }
      case 'Ts': { const v = v1(); if (v !== undefined) t.ts = v; return true; }
      case 'Tf': {
        const nom = this.ops[this.ops.length - 2], taille = this.ops[this.ops.length - 1];
        if (estNom(nom) && estNombre(taille)) { t.police = dictPolice(this.ctx, this.ressources, nom); t.taille = taille; }
        return true;
      }
      case 'Td': case 'TD': {
        const v = this.nombres(2);
        if (v) { if (op === 'TD') t.tl = -(v[1] ?? 0); this.ligne(v[0] ?? 0, v[1] ?? 0); }
        return true;
      }
      case 'T*': this.ligne(0, -t.tl); return true;
      case 'Tm': { const v = this.nombres(6); if (v) this.tm = this.tlm = v as unknown as Matrice; return true; }
      default: return false;
    }
  }

  private ligne(tx: number, ty: number): void { this.tm = this.tlm = multiplier(this.tlm, translation(tx, ty)); }

  /** Tj, TJ, ' et " : une chaine montree, en lettres si la lecture a ses polices, comptee sinon. */
  private montrer(op: string): void {
    const t = this.e.texte;
    if (op === '\'' || op === '"') {
      if (op === '"') { const v = this.ops.slice(-3); if (estNombre(v[0])) t.tw = v[0]; if (estNombre(v[1])) t.tc = v[1]; }
      this.ligne(0, -t.tl);
    }
    const dernier = this.ops[this.ops.length - 1];
    const elements = op === 'TJ' ? (estTableau(dernier) ? dernier : []) : [dernier ?? null];
    if (!this.ctx.polices) { if (this.texte) this.texteMontre = true; else this.ctx.pertes.textes++; return; }
    const d = t.police, police = d ? policeDe(this.ctx, d) : null;
    if (!police) { this.ctx.pertes.caracteresInconnus++; return; }
    const remplacante = police.fonte || police.type3 ? null : this.ctx.polices.remplacement(police.remplacement.id);
    const pose = poser(this.ctx, this.e, this.tm, police, remplacante, elements);
    this.tm = pose.tm;
    if (t.tr === 3 || t.tr === 7) { this.ctx.pertes.textesInvisibles++; return; }
    if (this.cache) { this.ctx.pertes.masquees++; return; }
    if (t.tr >= 4) this.ctx.pertes.textesDecoupe++;
    if (police.codageInconnu) this.ctx.pertes.codageInconnu = true;
    this.ctx.pertes.caracteresInconnus += pose.inconnus;
    if (police.type3) { for (const g of pose.type3) this.glypheType3(police.type3, g.nom, g.ctm); return; }
    if (!police.fonte && !remplacante) { this.ctx.pertes.textesSansPolice++; return; }
    const remplir = t.tr === 0 || t.tr === 2 || t.tr === 4 || t.tr === 6, tracer = t.tr === 1 || t.tr === 2 || t.tr === 5 || t.tr === 6;
    const motif = (p: Peinture) => this.couleurMotif(p);
    const fond = remplir ? couleurDe(this.e.remplissage, this.ctx.pertes, motif) : null, trait = tracer ? couleurDe(this.e.contour, this.ctx.pertes, motif) : null;
    const formes = lettres(this.ctx, this.e, police, remplacante, pose.poses, fond, trait);
    for (const f of formes) this.ajouterForme(f);
    if (!police.fonte && !police.remplacement.exacte && pose.poses.length) {
      const cle = police.remplacement.demandee + '>' + police.remplacement.id + (police.remplacement.penchee ? '/' : '');
      const r = this.ctx.remplacements.get(cle);
      if (r) r.textes++; else this.ctx.remplacements.set(cle, { r: police.remplacement, textes: 1 });
    }
  }

  /** Une glyphe Type 3 : son flux se dessine comme un formulaire, dans le repere de la glyphe (FontMatrix comprise). */
  private glypheType3(t3: NonNullable<PolicePdf['type3']>, nom: string, ctm: Matrice): void {
    const proc = this.ctx.doc.valeur(t3.procs, nom);
    if (!estFlux(proc)) { this.ctx.pertes.caracteresInconnus++; return; }
    if (this.ctx.formulairesActifs.has(proc.debut)) throw new RefusPdf(t('Ce PDF contient une glyphe qui se dessine elle-même : il ne se lit pas ici.'));
    if (this.profondeur + 1 > LIMITES_PDF.profondeurFormulaires) throw refus('imbrique des formulaires sur plus de ' + LIMITES_PDF.profondeurFormulaires + ' niveaux');
    if (++this.ctx.formulaires > LIMITES_PDF.formulaires) throw refus('dessine plus de ' + enFrancais(LIMITES_PDF.formulaires) + ' formulaires');
    const etat = copier(this.e);
    etat.ctm = ctm;
    etat.texte.tr = 0;
    this.ctx.formulairesActifs.add(proc.debut);
    try { new Interprete(this.ctx, t3.ressources ?? this.ressources, etat, this.profondeur + 1, this.cache).executer(donneesOuRien(this.ctx, proc)); } finally { this.ctx.formulairesActifs.delete(proc.debut); }
  }

  /** Un segment peut suivre une fermeture sans « m » : il repart du debut du sous-trace, qu'il faut alors rouvrir. */
  private rouvrir(): void {
    const dernier = this.chemin[this.chemin.length - 1];
    if (dernier?.c === 'Z' && this.depart) this.chemin.push({ c: 'M', p: [this.depart[0], this.depart[1]] });
  }

  private trace(op: string): boolean {
    switch (op) {
      case 'm': { const v = this.nombres(2); if (v) { const p = this.point(v[0] ?? 0, v[1] ?? 0); this.chemin.push({ c: 'M', p: [...p] }); this.depart = this.courant = p; } return true; }
      case 'l': {
        const v = this.nombres(2);
        if (!v) return true;
        const p = this.point(v[0] ?? 0, v[1] ?? 0);
        if (!this.courant) { this.chemin.push({ c: 'M', p: [...p] }); this.depart = p; } else { this.rouvrir(); this.chemin.push({ c: 'L', p: [...p] }); }
        this.courant = p;
        return true;
      }
      case 'c': case 'v': case 'y': this.courbe(op); return true;
      case 'h': if (this.courant && this.chemin.length && this.chemin[this.chemin.length - 1]?.c !== 'Z') { this.chemin.push({ c: 'Z', p: [] }); this.courant = this.depart; } return true;
      case 're': {
        const v = this.nombres(4);
        if (!v) return true;
        const [x = 0, y = 0, l = 0, h = 0] = v;
        const a = this.point(x, y), b = this.point(x + l, y), c = this.point(x + l, y + h), d = this.point(x, y + h);
        this.chemin.push({ c: 'M', p: [...a] }, { c: 'L', p: [...b] }, { c: 'L', p: [...c] }, { c: 'L', p: [...d] }, { c: 'Z', p: [] });
        this.depart = this.courant = a;
        return true;
      }
      default: return false;
    }
  }

  private courbe(op: 'c' | 'v' | 'y'): void {
    const v = this.nombres(op === 'c' ? 6 : 4);
    if (!v) return;
    const pts: Point[] = [];
    for (let k = 0; k < v.length; k += 2) pts.push(this.point(v[k] ?? 0, v[k + 1] ?? 0));
    const fin = pts[pts.length - 1] ?? [0, 0];
    if (!this.courant) { this.chemin.push({ c: 'M', p: [...fin] }); this.depart = this.courant = fin; return; }
    this.rouvrir();
    const [p1, p2] = op === 'c' ? [pts[0] ?? fin, pts[1] ?? fin] : op === 'v' ? [this.courant, pts[0] ?? fin] : [pts[0] ?? fin, fin];
    this.chemin.push({ c: 'C', p: [p1[0], p1[1], p2[0], p2[1], fin[0], fin[1]] });
    this.courant = fin;
  }

  private peinture(op: string): boolean {
    switch (op) {
      case 'S': this.peindre(false, true, 'nonzero', false); return true;
      case 's': this.peindre(false, true, 'nonzero', true); return true;
      case 'f': case 'F': this.peindre(true, false, 'nonzero', false); return true;
      case 'f*': this.peindre(true, false, 'evenodd', false); return true;
      case 'B': this.peindre(true, true, 'nonzero', false); return true;
      case 'B*': this.peindre(true, true, 'evenodd', false); return true;
      case 'b': this.peindre(true, true, 'nonzero', true); return true;
      case 'b*': this.peindre(true, true, 'evenodd', true); return true;
      case 'n': this.peindre(false, false, 'nonzero', false); return true;
      case 'W': case 'W*': this.decoupeEnAttente = true; return true;
      default: return false;
    }
  }

  private peindre(remplir: boolean, tracer: boolean, regle: 'nonzero' | 'evenodd', fermer: boolean): void {
    if (fermer) this.trace('h');
    const d = this.chemin;
    if ((remplir || tracer) && dessine(d)) {
      if (this.cache) this.ctx.pertes.masquees++;
      else {
        const motif = (p: Peinture) => this.couleurMotif(p);
        const fond = remplir ? couleurDe(this.e.remplissage, this.ctx.pertes, motif) : null;
        const trait = tracer ? couleurDe(this.e.contour, this.ctx.pertes, motif) : null;
        this.ajouter(d, fond, trait, regle);
      }
    }
    if (this.decoupeEnAttente) {
      this.e.decoupe = intersecter(this.e.decoupe, d);
      this.e.cheminDecoupe = dessine(d) ? d : this.e.cheminDecoupe;
      this.decoupeEnAttente = false;
    }
    this.chemin = [];
    this.depart = this.courant = null;
  }

  private ajouter(d: Commande[], fond: string | null, trait: string | null, regle: 'nonzero' | 'evenodd'): void {
    const f = formeDe('f' + (this.ctx.formes.length + 1), d, this.e, fond, trait, regle, this.ctx.pertes);
    if (f) this.ajouterForme(f);
  }

  private ajouterForme(f: Forme): void {
    if (this.ctx.formes.length >= LIMITES_PDF.formes) throw refus('dessine plus de ' + enFrancais(LIMITES_PDF.formes) + ' formes sur cette page');
    this.ctx.segments += f.d.length;
    if (this.ctx.segments > LIMITES_PDF.segments) throw refus(t('compte plus de {n} segments de tracé sur cette page', { n: enFrancais(LIMITES_PDF.segments) }));
    for (const c of f.d) for (const v of c.p) if (!(Math.abs(v) <= LIMITES_PDF.coordonnee)) throw coordonneesDemesurees();
    this.ctx.formes.push(f);
  }

  private etat(op: string): boolean {
    const e = this.e;
    switch (op) {
      case 'q':
        if (this.pile.length >= LIMITES_PDF.pile) throw refus(t('empile plus de {n} états graphiques', { n: LIMITES_PDF.pile }));
        this.pile.push(copier(e));
        return true;
      case 'Q': { const avant = this.pile.pop(); if (avant) { this.e = avant; this.t = multiplier(this.ctx.page, avant.ctm); } return true; }
      case 'cm': { const v = this.nombres(6); if (v) { e.ctm = multiplier(e.ctm, v as unknown as Matrice); this.t = multiplier(this.ctx.page, e.ctm); } return true; }
      case 'w': { const v = this.nombres(1); if (v) e.epaisseur = Math.abs(v[0] ?? 1); return true; }
      case 'J': { const v = this.nombres(1); if (v) e.bout = v[0] ?? 0; return true; }
      case 'j': { const v = this.nombres(1); if (v) e.jonction = v[0] ?? 0; return true; }
      case 'M': { const v = this.nombres(1); if (v) e.limite = v[0] ?? 10; return true; }
      case 'd': { const t = this.ops[this.ops.length - 2], p = this.ops[this.ops.length - 1]; if (estTableau(t) && estNombre(p)) { e.tirets = t.filter(estNombre); e.phase = p; } return true; }
      case 'gs': this.etatExterne(); return true;
      case 'i': case 'ri': return true;
      default: return false;
    }
  }

  /** `gs` : l'etat graphique nomme dans les ressources (8.4.5). */
  private etatExterne(): void {
    const doc = this.ctx.doc, nom = this.ops[this.ops.length - 1];
    if (!estNom(nom)) return;
    const g = doc.dict(doc.dict(this.ressources, 'ExtGState'), nom);
    if (!g) return;
    const e = this.e, n = (cle: string) => doc.nombre(g, cle);
    const lw = n('LW'), lc = n('LC'), lj = n('LJ'), ml = n('ML'), ca = n('ca'), CA = n('CA');
    if (lw !== null) e.epaisseur = Math.abs(lw);
    if (lc !== null) e.bout = lc;
    if (lj !== null) e.jonction = lj;
    if (ml !== null) e.limite = ml;
    if (ca !== null) e.ca = Math.min(1, Math.max(0, ca));
    if (CA !== null) e.CA = Math.min(1, Math.max(0, CA));
    const tirets = doc.tableau(g, 'D');
    if (tirets) { const t = doc.resoudre(tirets[0]), p = doc.resoudre(tirets[1]); if (estTableau(t)) { e.tirets = t.map(x => doc.resoudre(x)).filter(estNombre); e.phase = estNombre(p) ? p : 0; } }
    const masque = doc.valeur(g, 'SMask');
    if (g.has('SMask')) e.masqueDoux = masque !== 'None';
    const bm = doc.valeur(g, 'BM'), premier = estTableau(bm) ? doc.resoudre(bm[0]) : bm;
    if (g.has('BM')) e.fusion = estNom(premier) && premier !== 'Normal' && premier !== 'Compatible';
  }

  private couleur(op: string): boolean {
    const e = this.e;
    switch (op) {
      case 'g': case 'G': this.poser(op === 'G', GRIS, this.nombres(1)); return true;
      case 'rg': case 'RG': this.poser(op === 'RG', RVB, this.nombres(3)); return true;
      case 'k': case 'K': this.poser(op === 'K', CMJN, this.nombres(4)); return true;
      case 'cs': case 'CS': {
        const nom = this.ops[this.ops.length - 1];
        if (nom === undefined) return true;
        const espace = lireEspace(this.ctx.doc, nom, this.ressources);
        this.poser(op === 'CS', espace, couleurInitiale(espace));
        return true;
      }
      case 'sc': case 'scn': case 'SC': case 'SCN': {
        const trait = op === 'SC' || op === 'SCN', p = trait ? e.contour : e.remplissage;
        const nom = this.ops[this.ops.length - 1];
        const valeurs = this.ops.filter(estNombre).slice(0, Math.max(composantes(p.espace), 1));
        const suite: Peinture = { espace: p.espace, valeurs: valeurs.length ? valeurs : p.valeurs, motif: estNom(nom) ? nom : null };
        if (trait) e.contour = suite; else e.remplissage = suite;
        return true;
      }
      default: return false;
    }
  }

  private poser(trait: boolean, espace: Espace, valeurs: readonly number[] | null): void {
    if (!valeurs) return;
    const p: Peinture = { espace, valeurs, motif: null };
    if (trait) this.e.contour = p; else this.e.remplissage = p;
  }

  private autre(op: string): void {
    switch (op) {
      case 'BT': this.texte = true; this.texteMontre = false; this.tm = this.tlm = IDENTITE; return;
      case 'ET': if (this.texteMontre) this.ctx.pertes.textes++; this.texte = false; this.texteMontre = false; return;
      case 'Tj': case 'TJ': case '\'': case '"': this.montrer(op); return;
      case 'Do': this.dessinerObjet(); return;
      case 'sh': this.degrade(); return;
      case 'BMC': this.marques.push(this.cache); return;
      case 'BDC': this.marques.push(this.cache || this.calqueEteint()); return;
      case 'EMC': this.marques.pop(); return;
      default: return;
    }
  }

  /** `BDC /OC /nom` : un contenu marque de calque, eteint si le calque l'est a l'ouverture. */
  private calqueEteint(): boolean {
    const tag = this.ops[this.ops.length - 2], props = this.ops[this.ops.length - 1];
    if (tag !== 'OC') return false;
    const ref = estNom(props) ? this.ctx.doc.dict(this.ressources, 'Properties')?.get(props) : props;
    return calqueEteint(this.ctx, ref);
  }

  /** `BI … ID … EI` : une image en ligne, comptee ; ses octets sont sautes. */
  private imageEnLigne(l: Lecteur): void {
    const params = new Map<string, ObjetPdf>();
    for (;;) {
      const cle = lireObjet(l, false);
      if (cle === undefined) throw new SyntaxePdf(t('une image en ligne coupée'));
      if (cle instanceof Mot) { if (cle.v === 'ID') break; throw new SyntaxePdf(t('une image en ligne mal décrite')); }
      const v = lireObjet(l, false);
      if (!estNom(cle) || v === undefined || v instanceof Mot) throw new SyntaxePdf(t('une image en ligne mal décrite'));
      params.set(cle, v);
    }
    const o = l.octets;
    let debut = l.pos + 1;
    const longueur = params.get('L') ?? params.get('Length');
    if (estNombre(longueur) && longueur >= 0) debut += longueur;
    // Faute de longueur : le premier « EI » entoure de blancs, comme les lecteurs courants.
    let fin = chercher(o, 'EI', debut, l.fin);
    while (fin >= 0 && !(estBlanc(o[fin - 1] ?? 32) && (fin + 2 >= l.fin || estBlanc(o[fin + 2] ?? 32)))) fin = chercher(o, 'EI', fin + 2, l.fin);
    if (fin < 0) throw new SyntaxePdf(t('une image en ligne sans fin'));
    l.pos = fin + 2;
    if (!this.cache) this.ctx.pertes.images++;
  }

  /** `Do` : une image (comptee) ou un formulaire (deplie). */
  private dessinerObjet(): void {
    const doc = this.ctx.doc, nom = this.ops[this.ops.length - 1];
    if (!estNom(nom)) return;
    const x = doc.valeur(doc.dict(this.ressources, 'XObject'), nom);
    if (!estFlux(x)) return;
    const genre = doc.valeur(x.dict, 'Subtype');
    if (genre === 'Image') { if (!this.cache) this.ctx.pertes.images++; return; }
    if (genre !== 'Form') return;
    if (this.ctx.formulairesActifs.has(x.debut)) throw new RefusPdf(t('Ce PDF contient un formulaire qui se dessine lui-même : il ne se lit pas ici.'));
    if (this.profondeur + 1 > LIMITES_PDF.profondeurFormulaires) throw refus('imbrique des formulaires sur plus de ' + LIMITES_PDF.profondeurFormulaires + ' niveaux');
    if (++this.ctx.formulaires > LIMITES_PDF.formulaires) throw refus('dessine plus de ' + enFrancais(LIMITES_PDF.formulaires) + ' formulaires');
    this.deplier(x.dict, donneesOuRien(this.ctx, x), x.debut);
  }

  private deplier(dict: Dict, octets: Uint8Array, cle: number): void {
    const doc = this.ctx.doc, etat = copier(this.e);
    const m = (doc.tableau(dict, 'Matrix') ?? []).map(v => doc.resoudre(v));
    if (m.length === 6 && m.every(estNombre)) etat.ctm = multiplier(etat.ctm, m as unknown as Matrice);
    const cadre = boite(doc, dict.get('BBox'));
    if (cadre) {
      // Le cadre du formulaire le decoupe (8.10.1) : il ne compte que s'il cache une forme.
      const t = multiplier(this.ctx.page, etat.ctm), p = (x: number, y: number): [number, number] => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
      const coins: Commande[] = [{ c: 'M', p: p(cadre[0], cadre[1]) }, { c: 'L', p: p(cadre[2], cadre[1]) }, { c: 'L', p: p(cadre[2], cadre[3]) }, { c: 'L', p: p(cadre[0], cadre[3]) }, { c: 'Z', p: [] }];
      etat.decoupe = intersecter(etat.decoupe, coins);
    }
    const groupe = doc.dict(dict, 'Group');
    if (groupe && doc.valeur(groupe, 'S') === 'Transparency') {
      // Un groupe de transparence se compose avec l'opacite courante, et ses formes repartent opaques (11.6.6).
      etat.groupe *= etat.ca;
      etat.ca = etat.CA = 1;
      etat.masqueDoux = etat.fusion = false;
    }
    const ressources = doc.dict(dict, 'Resources') ?? this.ressources;
    const cache = this.cache || calqueEteint(this.ctx, dict.get('OC'));
    this.ctx.formulairesActifs.add(cle);
    try { new Interprete(this.ctx, ressources, etat, this.profondeur + 1, cache).executer(octets); } finally { this.ctx.formulairesActifs.delete(cle); }
  }

  /** `sh` : un degrade peint sur toute la decoupe ; il devient la forme de cette decoupe, d'une couleur unie approchee. */
  private degrade(): void {
    const doc = this.ctx.doc, nom = this.ops[this.ops.length - 1];
    if (!estNom(nom)) return;
    const s = doc.valeur(doc.dict(this.ressources, 'Shading'), nom);
    const d = this.e.cheminDecoupe;
    if (!d || this.e.decoupe === null) { this.ctx.pertes.degrades++; return; }
    if (this.cache) { this.ctx.pertes.masquees++; return; }
    const c = couleurDegrade(this.ctx, s, this.ressources);
    this.ctx.pertes.motifs++;
    const ancienne = this.e.decoupe;
    // La forme est la decoupe elle-meme : elle ne s'y coupe pas.
    this.e.decoupe = null;
    this.ajouter(d.map(x => ({ c: x.c, p: [...x.p] })), hexDe(c), null, 'nonzero');
    this.e.decoupe = ancienne;
  }

  /** La couleur approchee d'un motif : celle de son degrade, ou un gris moyen pour un motif de pavage. */
  private couleurMotif(p: Peinture): [number, number, number] | null {
    const doc = this.ctx.doc;
    const motif = p.motif ? doc.valeur(doc.dict(this.ressources, 'Pattern'), p.motif) : null;
    const d = dictDe(motif);
    if (d && doc.valeur(d, 'PatternType') === 2) return couleurDegrade(this.ctx, doc.valeur(d, 'Shading'), this.ressources);
    // Un pavage sans couleur propre (PaintType 2) se peint de la couleur donnee avec lui, dans l'espace sous-jacent.
    if (d && doc.valeur(d, 'PaintType') === 2 && p.espace.k === 'motif' && p.espace.sous) return versRvb(p.espace.sous, p.valeurs) ?? [0.5, 0.5, 0.5];
    return [0.5, 0.5, 0.5];
  }
}

/** La couleur au milieu d'un degrade (sa fonction au centre de son domaine), ou un gris moyen s'il ne se calcule pas. */
function couleurDegrade(ctx: Contexte, o: ObjetPdf, ressources: Dict | null): [number, number, number] {
  const doc = ctx.doc, d = dictDe(o);
  if (!d) return [0.5, 0.5, 0.5];
  const espace = lireEspace(doc, d.get('ColorSpace'), ressources);
  const f = lireFonction(doc, d.get('Function'));
  const domaine = (doc.tableau(d, 'Domain') ?? [0, 1]).map(v => doc.resoudre(v));
  const t0 = estNombre(domaine[0]) ? domaine[0] : 0, t1 = estNombre(domaine[1]) ? domaine[1] : 1;
  const v = f?.([(t0 + t1) / 2]);
  return (v && versRvb(espace, v)) || [0.5, 0.5, 0.5];
}

/**
 * Les octets d'un flux de contenu, ou rien s'il ne se decompresse pas : un flux casse (tronque, somme fausse) est une partie
 * perdue de la page, dite, pas un refus du fichier entier. Les bornes, elles, restent des refus.
 */
export function donneesOuRien(ctx: Contexte, f: Flux): Uint8Array {
  try { return ctx.doc.donnees(f); } catch (e) {
    if (!(e instanceof SyntaxePdf)) throw e;
    ctx.pertes.illisible = true;
    return new Uint8Array(0);
  }
}

/** Vrai si le calque (OCG) ou l'appartenance (OCMD) designe par `o` est eteint a l'ouverture. */
export function calqueEteint(ctx: Contexte, o: ObjetPdf | undefined): boolean {
  if (o === undefined) return false;
  const doc = ctx.doc, d = doc.resoudre(o);
  if (!estDict(d)) return false;
  if (d.get('Type') === 'OCMD') {
    const ocgs = d.get('OCGs'), liste = estTableau(doc.resoudre(ocgs)) ? (doc.resoudre(ocgs) as readonly ObjetPdf[]) : [ocgs];
    const etats = liste.filter(estRef).map(r => ctx.calquesEteints(r.n));
    if (!etats.length) return false;
    switch (doc.valeur(d, 'P')) {
      case 'AllOn': return etats.some(x => x);
      case 'AnyOff': return !etats.some(x => x);
      case 'AllOff': return !etats.every(x => x);
      default: return etats.every(x => x);
    }
  }
  return estRef(o) && ctx.calquesEteints(o.n);
}
