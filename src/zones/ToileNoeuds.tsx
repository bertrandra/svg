// La toile d'un dessin riche (ADR-0012, annexe 8, etape 2, paquet A) : un rendu par noeud de l'arbre (`arbreDe`), un <g> par
// groupe, et ce que chaque feuille ou groupe porte du modele v2 rendu par les memes crochets que l'ecriture (engine/edition/rendu.ts) :
// peintures, degrades par le recueil <defs>, images, opacite et attributs de groupe. Une fonctionnalite ajoutee au catalogue se voit
// ici sans qu'on y touche. Un dessin plat ne passe jamais par ici : ToileEditeur garde pour lui les calques d'avant, au pixel pres.
//
// Le contexte d'edition (annexe 6 §2) : ce qui est hors du groupe ou l'on est entre s'estompe (`hors-contexte`) et ne prend plus le
// pointeur ; le chemin du contexte (ses ancetres, puis lui) se dessine normalement. La prise, elle, se calcule (engine/prise.ts).
//
// Memoire (ADR-0008, annexe 7 §4) : un groupe ne se redessine que si l'un de ses noeuds a change (memes objets de feuilles et de
// groupes, comparaison par identite) ; une feuille de la racine, comme les calques d'avant, que si elle a change.

import { memo, type ReactNode } from 'react';
import { arbreDe, cheminDuContexte, estPlat, opaciteDuContour, opaciteDuRemplissage, renduDe, type AttributRendu, type DessinSvg, type Forme, type NoeudArbre, type RenduDessin } from '../engine/editionSvg.js';
import { Calque, cheminDe, traitReact } from './Toile.js';

/** Le nom React d'un attribut ecrit : `data-*` et `aria-*` tels quels, `class` en `className`, le reste en camelCase (`clip-path`). */
export function nomReact(nom: string): string {
  if (nom.startsWith('data-') || nom.startsWith('aria-')) return nom;
  if (nom === 'class') return 'className';
  return nom.replace(/[:-]([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Les attributs d'un ecrivain en proprietes React. Les ecrivains n'ecrivent ni `id`, ni `style`, ni gestionnaire : s'il en venait un,
 * il ne passerait pas (un `style` en texte ferait lever React, un `on…` serait du code).
 */
export function proprietesReact(attributs: readonly AttributRendu[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [nom, valeur] of attributs) if (nom !== 'id' && nom !== 'style' && !/^on/i.test(nom)) r[nomReact(nom)] = valeur;
  return r;
}

/** Ou se trouve un noeud par rapport au contexte : dedans (ou sans contexte), sur son chemin (au-dessus de lui), ou deja estompe. */
type Niveau = 'dedans' | 'dessus' | 'hors';

interface ProprietesNoeud {
  n: NoeudArbre; rendu: RenduDessin; contours: boolean; masquee: string | null;
  /** Le groupe du contexte et ses ancetres (vide a la racine), et leur cle (pour comparer sans parcourir). */
  chemin: readonly string[]; cleChemin: string; contexte: string | null;
  niveau: Niveau;
  /** Un ancetre est verrouille : la feuille ne prend pas le pointeur, comme une feuille verrouillee. */
  verrou: boolean;
}

/** Deux noeuds aux memes objets (feuilles, groupes, structure) : ce qu'ils dessinent n'a pas change. */
function memeNoeud(a: NoeudArbre, b: NoeudArbre): boolean {
  if (a === b) return true;
  if (a.genre === 'feuille' || b.genre === 'feuille') return a.genre === 'feuille' && b.genre === 'feuille' && a.forme === b.forme;
  return a.groupe === b.groupe && a.enfants.length === b.enfants.length && a.enfants.every((x, i) => { const y = b.enfants[i]; return !!y && memeNoeud(x, y); });
}

// Le rendu d'un dessin change avec lui, mais celui d'un objet inchange est le meme (memorise par objet) : il ne compte pas ici.
const memesProprietes = (a: ProprietesNoeud, b: ProprietesNoeud): boolean =>
  a.contours === b.contours && a.masquee === b.masquee && a.cleChemin === b.cleChemin && a.contexte === b.contexte && a.niveau === b.niveau
  && a.verrou === b.verrou && memeNoeud(a.n, b.n);

/** Une feuille, telle que l'ecriture l'ecrirait (sa peinture, ses attributs, ou son element), ou son trace en vue « contours ». */
function feuille(f: Forme, p: ProprietesNoeud): ReactNode {
  if (!f.visible || f.id === p.masquee) return null;
  const inerte = p.verrou || f.verrouille || p.niveau === 'hors';
  if (p.contours) return <path key={f.id} data-id={f.id} className="trace-contour" d={cheminDe(f)} fill="none" fillRule={f.regle} pointerEvents={inerte ? 'none' : 'all'} />;
  const r = p.rendu.feuille(f);
  // Un element (une image) : le balisage de l'ecrivain, deja verifie par la lecture (donnees `data:` d'une image admise, nombres).
  if (r.genre === 'element') return <g key={f.id} data-id={f.id} pointerEvents={inerte ? 'none' : 'visiblePainted'} dangerouslySetInnerHTML={{ __html: r.balisage }} />;
  const x = r.forme;
  return (
    <path key={f.id} data-id={f.id} d={cheminDe(f)} fill={x.remplissage ?? 'none'} fillRule={x.regle} fillOpacity={x.remplissage && opaciteDuRemplissage(x) < 1 ? opaciteDuRemplissage(x) : undefined}
      stroke={x.contour ?? undefined} strokeWidth={x.contour ? x.epaisseur : undefined} strokeOpacity={x.contour && opaciteDuContour(x) < 1 ? opaciteDuContour(x) : undefined} {...traitReact(x)}
      opacity={x.opacite < 1 ? x.opacite : undefined} {...proprietesReact(r.attributs)} pointerEvents={inerte ? 'none' : x.remplissage ? 'visiblePainted' : 'stroke'} />
  );
}

/** Un noeud et ses enfants ; hors du contexte, enveloppe dans le voile qui l'estompe. */
function dessiner(p: ProprietesNoeud): ReactNode {
  const { n } = p;
  if (p.niveau === 'dessus') {
    const id = n.genre === 'feuille' ? n.forme.id : n.groupe.id;
    // Hors du chemin du contexte : estompe, avec tout ce qu'il contient.
    if (n.genre === 'feuille' || !p.chemin.includes(id)) {
      const dedans = dessiner({ ...p, niveau: 'hors' });
      return dedans === null ? null : <g key={'hors-' + id} className="hors-contexte" pointerEvents="none">{dedans}</g>;
    }
  }
  if (n.genre === 'feuille') return feuille(n.forme, p);
  const g = n.groupe;
  if (!g.visible) return null;
  const suite: Niveau = p.niveau === 'dessus' && g.id !== p.contexte ? 'dessus' : p.niveau === 'hors' ? 'hors' : 'dedans';
  const attributs = p.contours ? {} : proprietesReact(p.rendu.groupe(g).attributs);
  return (
    <g key={g.id} data-groupe={g.id} {...attributs}>
      {n.enfants.map(e => <Noeud key={e.genre === 'feuille' ? e.forme.id : e.groupe.id} {...p} n={e} niveau={suite} verrou={p.verrou || g.verrouille} />)}
    </g>
  );
}

const Noeud = memo(function Noeud(p: ProprietesNoeud) { return <>{dessiner(p)}</>; }, memesProprietes);

/** Le debut de chaque definition du recueil : seule une definition porte un identifiant, `ed-<genre>-<empreinte>` (definitions.ts). */
const DEBUT_DEFINITION = /(?=<[A-Za-z]+ id="ed-)/;

/** Les definitions une a une, avec leur identifiant (unique dans le recueil) : la cle d'un morceau qui ne change pas d'un rendu a l'autre. */
export function morceauxDefinitions(definitions: string): Array<{ id: string; balisage: string }> {
  return definitions.split(DEBUT_DEFINITION).filter(Boolean).map(balisage => ({ id: /^<[A-Za-z]+ id="([^"]+)"/.exec(balisage)?.[1] ?? balisage, balisage }));
}

/** Une definition : son balisage ecrit, dans un <g> de <defs> (un identifiant se resout dans tout le document). */
const Definition = memo(function Definition({ balisage }: { balisage: string }) { return <g dangerouslySetInnerHTML={{ __html: balisage }} />; });

/**
 * Les definitions du recueil (degrades, filtres, decoupes), une par element : deplacer une forme a effet change la region de SON
 * filtre, et seul ce morceau se reecrit. D'un seul tenant, tout le <defs> se reanalysait a chaque mouvement (mesure de l'etape 7-B,
 * annexe 8 §0 : 200 formes a ombre, 35 ms de taches par mouvement, contre 16 sans effet).
 */
const Definitions = memo(function Definitions({ definitions }: { definitions: string }) {
  return <defs>{morceauxDefinitions(definitions).map(m => <Definition key={m.id} balisage={m.balisage} />)}</defs>;
});

/**
 * Les formes d'un dessin riche sur la toile : les definitions (degrades, et ce que les etapes suivantes deposeront), puis l'arbre.
 * `masquee` : le texte en saisie vide (rien ne se dessine pour lui), comme pour les calques d'avant. `contexte` : le groupe ou l'on
 * est entre, ou null.
 */
export const NoeudsToile = memo(function NoeudsToile({ dessin, contours, masquee, contexte, brouillon = false }: { dessin: DessinSvg; contours: boolean; masquee: string | null; contexte: string | null; brouillon?: boolean }) {
  const rendu = renduDe(dessin), chemin = cheminDuContexte(dessin, contexte);
  const commun = { rendu, contours, masquee, chemin, cleChemin: chemin.join(' '), contexte, niveau: (contexte === null ? 'dedans' : 'dessus') as Niveau, verrou: false };
  return (
    // Le brouillon d'un geste (etape 7-B, brouillon.ts) : la feuille de style retire les filtres sous `data-brouillon`, rien d'autre ne change.
    <g className="noeuds-toile" data-brouillon={brouillon ? '' : undefined}>
      {/* Les definitions viennent des ecrivains du catalogue (des nombres, des couleurs, des donnees d'image verifiees) : jamais d'un texte lu tel quel. */}
      {rendu.definitions ? <Definitions definitions={rendu.definitions} /> : null}
      {arbreDe(dessin).racine.map(n => <Noeud key={n.genre === 'feuille' ? n.forme.id : n.groupe.id} {...commun} n={n} />)}
    </g>
  );
});

/**
 * Les formes de la toile. Un dessin plat : un calque par forme, le DOM d'avant le modele v2, a l'identique (le reglage du modele n'y
 * change rien ; tests/unit/zones/toile.test.ts le verifie). Un dessin riche : un rendu par noeud de l'arbre, par les crochets de
 * l'ecriture.
 */
export function FormesToile({ dessin, contours, masquee, contexte, brouillon = false }: { dessin: DessinSvg; contours: boolean; masquee: string | null; contexte: string | null; brouillon?: boolean }) {
  if (estPlat(dessin)) return <>{dessin.formes.map(f => <Calque key={f.id} f={f} contours={contours} masquee={f.id === masquee} />)}</>;
  return <NoeudsToile dessin={dessin} contours={contours} masquee={masquee} contexte={contexte} brouillon={brouillon} />;
}
