// La lentille des contenus (ADR-0012, annexe 8, paquet 8-D ; annexe 6 §2 et §3) : modifier sur place la decoupe ou le masque d'un
// groupe avec les outils ordinaires. L'editeur n'edite qu'un dessin, celui de l'historique ; la lentille lui presente le contenu comme
// un dessin de travail (`contenuEnDessin`), et repose le dessin de travail modifie dans son groupe (`reposerContenu`), pour que chaque
// geste reste UNE entree d'historique du dessin complet. Pur.
//
// Ce que la lentille garantit en reposant :
// - entrer puis sortir sans rien faire rend le MEME objet (le dessin de travail est memorise par contenu) ;
// - les identifiants restent dans l'espace unique du dessin (I1) : une operation sur le dessin de travail numerote d'apres lui seul,
//   un numero neuf qui reprendrait celui d'un noeud du reste du dessin est renumerote, et la table des renommages est gardee pour
//   le dessin rendu (`renommagesDe`), de quoi suivre la selection ;
// - une decoupe ne garde que la geometrie : ses feuilles sont refixees par `feuilleDeDecoupe` (un fond, un trait, une opacite, un
//   texte ou des effets poses dans la lentille n'y entrent pas), ses groupes ne gardent que nom, visibilite, verrou et decoupe ;
// - la region d'un masque suit son contenu quand elle le suivait (elle valait la boite du contenu et de ce qu'il masque, comme a la
//   creation) ; une region lue d'un fichier, ou celle d'un masque inverse (son fond blanc la couvre), ne bouge pas ;
// - le plan de travail ne change pas par la lentille ; le nuancier et les reperes, reglages du document, y passent dans les deux sens.

import type { Boite, Contenu, DessinSvg, Forme, Groupe, Masque } from './types.js';
import { arbreDe, normaliser, prochainNumero, visibleEffectif } from './arbre.js';
import { groupeDe } from './groupes.js';
import { boiteVisuelle } from './etendueVisuelle.js';
import { unir } from './geometrie.js';
import { feuilleDeDecoupe } from './fonctions/decoupes.js';
import { estFond } from './masques.js';

/** Ce qu'une lentille presente : la decoupe ou le masque d'un groupe. */
export type GenreContenu = 'decoupe' | 'masque';

/** Le contenu de ce genre que porte le groupe, ou undefined. */
export function contenuDuGroupe(d: Contenu, groupe: string, genre: GenreContenu): Contenu | undefined {
  const g = groupeDe(d, groupe);
  return genre === 'decoupe' ? g?.decoupe?.contenu : g?.masque?.contenu;
}

const memoVues = new WeakMap<Contenu, DessinSvg>();

/**
 * Le contenu de la decoupe ou du masque d'un groupe, presente comme un dessin de travail : le plan, le nuancier et les reperes du dessin,
 * les feuilles et les groupes du contenu (deja dans le repere du plan). Memorise par contenu : deux appels sur le meme etat rendent le
 * meme objet. null si le groupe ne porte pas ce contenu.
 */
export function contenuEnDessin(d: DessinSvg, groupe: string, genre: GenreContenu): DessinSvg | null {
  const c = contenuDuGroupe(d, groupe, genre);
  if (!c) return null;
  const deja = memoVues.get(c);
  if (deja && deja.vb === d.vb && deja.nuancier === d.nuancier && deja.reperes === d.reperes) return deja;
  const vue: DessinSvg = {
    vb: d.vb, formes: c.formes, ...(c.groupes ? { groupes: c.groupes } : {}), ...(d.nuancier ? { nuancier: d.nuancier } : {}), ...(d.reperes ? { reperes: d.reperes } : {})
  };
  memoVues.set(c, vue);
  return vue;
}

/** Vrai si le contenu ne laisse rien : aucune feuille visible qui ait un trace. Une decoupe vide cache tout le groupe, un masque vide aussi. */
export function contenuVide(c: Contenu): boolean {
  return !c.formes.some(f => f.d.length > 0 && visibleEffectif(c, f.id));
}

// ---------------------------------------------------------------- les identifiants (I1)

/** Les identifiants d'un contenu et de ses contenus de decoupes et de masques (les tuiles de motifs sont un espace a part). */
function identifiants(c: Contenu, out = new Set<string>(), niveau = 0): Set<string> {
  for (const f of c.formes) out.add(f.id);
  for (const [id, g] of Object.entries(c.groupes ?? {})) {
    out.add(id);
    if (niveau < 8) for (const s of [g.decoupe?.contenu, g.masque?.contenu]) if (s) identifiants(s, out, niveau + 1);
  }
  return out;
}

/** Le contenu dont les identifiants sont renommes par `vers` : feuilles, parents, groupes, textes poses, contenus imbriques. */
function renommerContenu(c: Contenu, vers: ReadonlyMap<string, string>): Contenu {
  const nom = (id: string): string => vers.get(id) ?? id;
  const formes = c.formes.map((f): Forme => {
    let x: Forme = vers.has(f.id) ? { ...f, id: nom(f.id) } : f;
    if (x.parent !== undefined && vers.has(x.parent)) x = { ...x, parent: nom(x.parent) };
    const disp = x.texte?.disposition;
    if (x.texte && disp && vers.has(disp.forme)) x = { ...x, texte: { ...x.texte, disposition: { ...disp, forme: nom(disp.forme) } } };
    return x;
  });
  if (!c.groupes) return { formes };
  const groupes: Record<string, Groupe> = {};
  for (const [id, g] of Object.entries(c.groupes)) {
    let x: Groupe = vers.has(id) ? { ...g, id: nom(id) } : g;
    if (x.parent !== undefined && vers.has(x.parent)) x = { ...x, parent: nom(x.parent) };
    if (x.decoupe) x = { ...x, decoupe: { ...x.decoupe, contenu: renommerContenu(x.decoupe.contenu, vers) } };
    if (x.masque) x = { ...x, masque: { ...x.masque, contenu: renommerContenu(x.masque.contenu, vers) } };
    groupes[x.id] = x;
  }
  return { formes, groupes };
}

/**
 * Les renommages qui gardent l'espace unique : chaque identifiant du contenu nouveau qui n'etait pas dans l'ancien et que porte deja un
 * noeud du reste du dessin prend un numero neuf, au-dela de tous ceux du dessin et du contenu. Vide le plus souvent.
 */
function collisions(d: DessinSvg, avant: Contenu, apres: Contenu): Map<string, string> {
  const vers = new Map<string, string>();
  const anciens = identifiants(avant), dehors = identifiants(d);
  for (const id of anciens) dehors.delete(id);
  // Un contenu partage son espace avec le reste : un identifiant ancien qui serait aussi dehors (un dessin deja fautif) ne bouge pas.
  const fautifs = [...identifiants(apres)].filter(id => !anciens.has(id) && dehors.has(id));
  if (!fautifs.length) return vers;
  let f = Math.max(prochainNumero(d, 'f'), prochainNumero(apres, 'f')), g = Math.max(prochainNumero(d, 'g'), prochainNumero(apres, 'g'));
  for (const id of fautifs) vers.set(id, id.startsWith('g') ? 'g' + g++ : 'f' + f++);
  return vers;
}

// ---------------------------------------------------------------- une decoupe ne garde que la geometrie

/** Deux objets aux memes cles et aux memes valeurs (comparees par identite). */
function memesChamps(a: object, b: object): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/** Une feuille de decoupe refixee (la meme si elle l'est deja). */
function feuilleCanonique(f: Forme): Forme {
  const x = feuilleDeDecoupe(f.id, f.d, f.regle, f.parent, f.visible, f.verrouille);
  return memesChamps(f, x) ? f : x;
}

/** Un groupe de decoupe : nom, visibilite, verrou et sa propre decoupe, rien d'autre (une decoupe ne compose rien). */
function groupeCanonique(g: Groupe): Groupe {
  const interieur = g.decoupe ? decoupeCanonique(g.decoupe.contenu) : undefined;
  const decoupe = g.decoupe && interieur === g.decoupe.contenu && memesChamps(g.decoupe, { contenu: interieur }) ? g.decoupe : interieur ? { contenu: interieur } : undefined;
  const x: Groupe = {
    id: g.id, ...(g.parent !== undefined ? { parent: g.parent } : {}), ...(g.nom !== undefined ? { nom: g.nom } : {}), visible: g.visible, verrouille: g.verrouille,
    ...(decoupe ? { decoupe } : {})
  };
  return memesChamps(g, x) ? g : x;
}

/** Le contenu d'une decoupe refixe ; le meme objet s'il l'etait deja. */
function decoupeCanonique(c: Contenu): Contenu {
  const formes = c.formes.map(feuilleCanonique);
  const groupes = c.groupes ? Object.fromEntries(Object.entries(c.groupes).map(([k, g]) => [k, groupeCanonique(g)] as const)) : undefined;
  const memes = formes.every((f, i) => f === c.formes[i]) && (!groupes || !c.groupes || Object.entries(groupes).every(([k, g]) => g === c.groupes?.[k]));
  if (memes) return c;
  return groupes ? { formes, groupes } : { formes };
}

// ---------------------------------------------------------------- la region d'un masque

/** Deux boites egales a un milliardieme de leur taille pres. */
function memesBoites(a: Boite, b: Boite): boolean {
  const e = 1e-9 * Math.max(1, a.l, a.h, b.l, b.h);
  return Math.abs(a.x - b.x) <= e && Math.abs(a.y - b.y) <= e && Math.abs(a.l - b.l) <= e && Math.abs(a.h - b.h) <= e;
}

/**
 * La region qu'aurait un masque de ce contenu sur ce groupe a sa creation (`creerMasque`) : la boite visuelle du contenu et des enfants
 * visibles du groupe, sans son masque ni ses effets. null si rien ne se voit.
 */
function regionSuivie(d: DessinSvg, groupe: string, c: Contenu): Boite | null {
  const n = arbreDe(d).parId.get(groupe);
  const enfants = n?.genre === 'groupe' ? n.enfants.filter(e => (e.genre === 'feuille' ? e.forme.visible : e.groupe.visible)).map(e => boiteVisuelle(d, e.genre === 'feuille' ? e.forme.id : e.groupe.id)) : [];
  const contenu = arbreDe(c).racine.filter(e => (e.genre === 'feuille' ? e.forme.visible : e.groupe.visible)).map(e => boiteVisuelle(c, e.genre === 'feuille' ? e.forme.id : e.groupe.id));
  return unir([...contenu, ...enfants]);
}

/** La region du masque reposee : recalculee si elle suivait le contenu, gardee sinon. */
function regionReposee(d: DessinSvg, groupe: string, mq: Masque, contenu: Contenu): Boite {
  if (estFond(mq.contenu.formes[0], mq.region)) return mq.region;
  const avant = regionSuivie(d, groupe, mq.contenu);
  if (!avant || !memesBoites(avant, mq.region)) return mq.region;
  const apres = regionSuivie(d, groupe, contenu);
  return apres && apres.l > 0 && apres.h > 0 ? apres : mq.region;
}

// ---------------------------------------------------------------- reposer

const SANS_RENOMMAGE: ReadonlyMap<string, string> = new Map();
const memoRenommages = new WeakMap<DessinSvg, ReadonlyMap<string, string>>();

/** Les renommages faits par le `reposerContenu` qui a rendu ce dessin (I1) ; vide pour tout autre dessin. */
export const renommagesDe = (d: DessinSvg): ReadonlyMap<string, string> => memoRenommages.get(d) ?? SANS_RENOMMAGE;

/** Le dessin avec le nuancier et les reperes du dessin de travail (le meme s'ils n'ont pas change). */
function avecReglages(d: DessinSvg, travail: DessinSvg): DessinSvg {
  if (travail.nuancier === d.nuancier && travail.reperes === d.reperes) return d;
  const { nuancier: _n, reperes: _r, ...reste } = d;
  void _n; void _r;
  return { ...reste, ...(travail.nuancier ? { nuancier: travail.nuancier } : {}), ...(travail.reperes ? { reperes: travail.reperes } : {}) };
}

/**
 * Le dessin complet ou le dessin de travail modifie (tire de `contenuEnDessin(d, groupe, genre)`) reprend sa place : le contenu du
 * groupe devient ses feuilles et ses groupes, ramenes a leurs invariants, renumerotes la ou ils reprendraient un numero du reste du
 * dessin, refixes pour une decoupe, la region recalculee pour un masque qui la suivait. Le MEME dessin si rien n'a change ; le meme
 * dessin aussi si le groupe ne porte plus ce contenu (rien a reposer). Ne leve jamais.
 */
export function reposerContenu(d: DessinSvg, groupe: string, genre: GenreContenu, travail: DessinSvg): { dessin: DessinSvg; renommes: ReadonlyMap<string, string> } {
  const g = groupeDe(d, groupe), avant = contenuDuGroupe(d, groupe, genre);
  if (!g || !avant) return { dessin: d, renommes: SANS_RENOMMAGE };
  if (travail.formes === avant.formes && travail.groupes === avant.groupes) return { dessin: avecReglages(d, travail), renommes: SANS_RENOMMAGE };
  let contenu = normaliser<Contenu>(travail.groupes ? { formes: travail.formes, groupes: travail.groupes } : { formes: travail.formes });
  const renommes = collisions(d, avant, contenu);
  if (renommes.size) contenu = renommerContenu(contenu, renommes);
  let porteur: Groupe;
  if (genre === 'decoupe' && g.decoupe) porteur = { ...g, decoupe: { ...g.decoupe, contenu: decoupeCanonique(contenu) } };
  else if (g.masque) porteur = { ...g, masque: { ...g.masque, contenu, region: regionReposee(d, groupe, g.masque, contenu) } };
  else return { dessin: d, renommes: SANS_RENOMMAGE };
  const dessin = avecReglages({ ...d, groupes: { ...d.groupes, [groupe]: porteur } }, travail);
  if (renommes.size) memoRenommages.set(dessin, renommes);
  return { dessin, renommes };
}
