// L'etat d'un editeur et les trois valeurs de contexte qu'on en tire (voir typesEditeur.ts). Tout ce que
// l'editeur retient vit ici, une fois ; `Atelier` n'a plus qu'a le donner aux contextes.

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { aimanter, boiteDe, ecrireDessin, pasGrille, STYLE_DEFAUT, type DessinSvg, type Forme, type Style } from '../engine/editionSvg.js';
import type { Focale } from '../engine/navigation.js';
import type { Aimant } from '../engine/transformations.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import { historique, type Historique } from '../util/historique.js';
import type { Annonce } from './annonces.js';
import { creerActions, type EtatDuMoment } from './creerActions.js';
import { useStockage } from './contexteStockage.js';
import { lireVersions, type Version } from './session.js';
import type { ActionsEditeur, EtatInterface, Fond, ModeleDessin, Outil, Point, Teinte, Tiroir, Vues } from './typesEditeur.js';
import { useVue } from './Vue.js';

export interface ParametresEtat {
  initial: DessinSvg; ignores: readonly string[]; nuancier: readonly Teinte[]; bibliotheque: Bibliotheque | 'a-charger' | null;
  enregistrer: (svg: string) => void; fermer: () => void; brouillon?: ((svg: string) => void) | undefined;
}

export interface EtatEditeur {
  modele: ModeleDessin; actions: ActionsEditeur; etat: EtatInterface; vues: Vues; modifie: boolean;
  toile: RefObject<HTMLDivElement | null>; svgRef: RefObject<SVGSVGElement | null>;
}

export function useEtatEditeur(p: ParametresEtat): EtatEditeur {
  const stockage = useStockage();
  const [h, poserH] = useState<Historique<DessinSvg>>(() => historique(p.initial));
  const [selection, choisir] = useState<string[]>([]);
  const [outil, poserOutilBrut] = useState<Outil>('selection');
  const [point, poserPoint] = useState<number | null>(null);
  const [style, poserStyle] = useState<Style>(() => ({ ...STYLE_DEFAUT, remplissage: p.nuancier[0]?.hex ?? STYLE_DEFAUT.remplissage }));
  const [trace, poserTrace] = useState<readonly Point[]>([]);
  const [presse, poserPresse] = useState<readonly Forme[]>([]);
  const [grille, poserGrille] = useState(false);
  const [aimants, poserAimants] = useState(true);
  // Un reglage de la session, rien de plus : il ne s'ecrit nulle part et revient a « oui » a chaque ouverture.
  const [lisserBooleens, poserLisserBooleens] = useState(true);
  const [guides, poserGuides] = useState<readonly Aimant[]>([]);
  const [versions, poserVersions] = useState<readonly Version[]>(() => lireVersions(stockage));
  const [tiroir, poserTiroir] = useState<Tiroir>(null);
  const [contours, poserContours] = useState(false);
  const [fond, poserFond] = useState<Fond>('damier');
  const [message, dire] = useState('');
  const [quitter, poserQuitter] = useState(false);
  const [curseur, poserCurseur] = useState<Point | null>(null);
  const [focale, poserFocale] = useState<Focale | null>(null);
  const [annonce, poserAnnonce] = useState<Annonce>({ texte: '', rang: 0 });
  const toile = useRef<HTMLDivElement>(null), svgRef = useRef<SVGSVGElement>(null);
  const dessin = h.present;
  const modifie = h.passe.length > 0;
  const vues = useVue(toile, svgRef, dessin.vb);

  const pas = useMemo(() => pasGrille(dessin.vb), [dessin.vb]);
  const presentes = useMemo(() => new Set(dessin.formes.map(f => f.id)), [dessin]);
  // Tant que toutes les formes choisies existent, la selection reste le meme tableau : rien en aval ne se recalcule pendant un geste.
  const sel = useMemo(() => (selection.every(id => presentes.has(id)) ? selection : selection.filter(id => presentes.has(id))), [selection, presentes]);
  const choisies = useMemo(() => new Set(sel), [sel]);
  const formeSeule = sel.length === 1 ? dessin.formes.find(f => f.id === sel[0]) ?? null : null;
  const boite = useMemo(() => boiteDe(dessin, sel), [dessin, sel]);
  const origine = dessin.vb[0];
  const aimant = useMemo(() => (grille ? (v: number) => aimanter(v, pas, origine % pas) : (v: number) => v), [grille, pas, origine]);

  // L'etat du dernier rendu, que les verbes lisent au moment de l'appel : c'est ce qui les rend stables.
  const moment = useRef<EtatDuMoment | null>(null);
  moment.current = { dessin, sel, formeSeule, outil, point, style, trace, presse, vues, lisserBooleens, enregistrer: p.enregistrer, modifie, refaisable: h.futur.length > 0, versions, fermer: p.fermer, stockage };
  const [actions] = useState(() => creerActions(
    () => { if (!moment.current) throw new Error('Un verbe de l’éditeur a été appelé avant le premier rendu.'); return moment.current; },
    { poserH, choisir, poserOutilBrut, poserPoint, poserStyle, poserTrace, poserPresse, poserGrille, poserAimants, poserLisserBooleens, poserGuides, poserVersions, poserTiroir, poserContours, poserFond, dire, poserQuitter, poserCurseur, poserFocale, poserAnnonce, toile }
  ));

  // Le brouillon : le SVG du moment, une seconde apres la derniere modification.
  const { brouillon } = p;
  useEffect(() => {
    if (!brouillon || !modifie) return;
    const t = setTimeout(() => brouillon(ecrireDessin(dessin, 3)), 1000);
    return () => clearTimeout(t);
  }, [brouillon, dessin, modifie]);

  const modele = useMemo<ModeleDessin>(
    () => ({ h, dessin, sel, choisies, boite, formeSeule, nuancier: p.nuancier, ignores: p.ignores, bibliotheque: p.bibliotheque, versions, presse }),
    [h, dessin, sel, choisies, boite, formeSeule, p.nuancier, p.ignores, p.bibliotheque, versions, presse]
  );
  const etat = useMemo<EtatInterface>(
    () => ({ outil, point, style, trace, grille, aimants, lisserBooleens, guides, tiroir, contours, fond, pas, aimant, vues, message, quitter, curseur, focale, annonce }),
    [outil, point, style, trace, grille, aimants, lisserBooleens, guides, tiroir, contours, fond, pas, aimant, vues, message, quitter, curseur, focale, annonce]
  );
  return { modele, actions, etat, vues, modifie, toile, svgRef };
}
