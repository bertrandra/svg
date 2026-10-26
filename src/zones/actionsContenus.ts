// Decoupes, masques, effets et images inseres (ADR-0012, etape 8 ; annexe 6 §3 et §6) : les verbes que le menu Edition, le menu Fichier,
// l'inspecteur et le depot sur la toile appellent en modele riche. Le calcul est celui du moteur (edition/decoupes.ts, masques.ts,
// effetsOperations.ts, imagesOperations.ts) ; ici, la selection qui suit et la phrase dite. Comme les autres actions, ils lisent l'etat
// du moment (`lire`) et ne capturent rien.

import {
  ancetres, creerDecoupe, creerMasque, groupeDe, insererImage, inverserMasque, liberer, libererMasque, poserEffets, unites, type DessinSvg, type ReglageEffets
} from '../engine/editionSvg.js';
import type { EtatLu, Leviers } from './actions.js';
import { phraseDecoupeCreee, phraseDecoupeLiberee, phraseImageInseree, phraseImageRefusee, phraseMasqueCree, phraseMasqueLibere, PHRASE_MASQUE_INVERSE } from './phrasesContenus.js';
import type { ActionsEditeur, ContexteEdition } from './typesEditeur.js';

export type ActionsContenus = Pick<ActionsEditeur, 'creerDecoupe' | 'libererDecoupe' | 'creerMasque' | 'inverserMasque' | 'libererMasque' | 'poserEffets' | 'insererImage'>;

/** L'etat que ces verbes lisent : celui des autres actions, et le contexte d'edition (l'image s'y pose). */
export type EtatContenus = EtatLu & { contexte?: ContexteEdition | null | undefined };

/**
 * Le groupe qui porte une decoupe (ou un masque) pour une commande : un groupe choisi qui en porte un ; sinon le plus proche ancetre
 * du premier element choisi qui en porte un (une image decoupee se choisit, la decoupe est sur le groupe qui l'enveloppe) ; sinon le
 * groupe du contexte d'edition. null quand rien ne s'y prete.
 */
export function porteurDe(d: DessinSvg, sel: readonly string[], contexte: string | null, champ: 'decoupe' | 'masque'): string | null {
  const porte = (id: string | null | undefined): id is string => !!id && groupeDe(d, id)?.[champ] !== undefined;
  const choisi = sel.find(porte);
  if (choisi) return choisi;
  const [premier] = sel;
  const ancetre = premier !== undefined ? ancetres(d, premier).find(porte) : undefined;
  if (ancetre) return ancetre;
  return porte(contexte) ? contexte : null;
}

export function actionsContenus(lire: () => EtatContenus, l: Leviers, poserContexte: (c: ContexteEdition | null) => void): ActionsContenus {
  const { appliquer, choisir, poserPoint, dire } = l;
  /** Apres une liberation : le groupe devient le contexte, ce qui revient est choisi, pour le modifier aussitot. */
  const rendre = (groupe: string, ids: readonly string[]) => {
    poserContexte({ groupe });
    choisir([...ids]);
    poserPoint(null);
  };
  return {
    creerDecoupe: () => {
      const { dessin, sel } = lire();
      const r = creerDecoupe(dessin, sel);
      if (r.id === null) { dire(r.erreur ?? ''); return; }
      const autres = unites(dessin, sel).filter(id => r.dessin.formes.some(f => f.id === id) || groupeDe(r.dessin, id));
      appliquer(() => r.dessin);
      choisir([r.id]);
      poserPoint(null);
      dire(phraseDecoupeCreee(dessin, autres));
    },
    libererDecoupe: () => {
      const { dessin, sel, contexte } = lire();
      const id = porteurDe(dessin, sel, contexte?.groupe ?? null, 'decoupe');
      if (id === null) { dire('Choisissez un groupe découpé.'); return; }
      const r = liberer(dessin, id);
      if (r.erreur) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      rendre(id, r.ids);
      dire(phraseDecoupeLiberee(r.ids.length));
    },
    creerMasque: () => {
      const { dessin, sel } = lire();
      const r = creerMasque(dessin, sel);
      if (r.id === null) { dire(r.erreur ?? ''); return; }
      const autres = unites(dessin, sel).filter(id => r.dessin.formes.some(f => f.id === id) || groupeDe(r.dessin, id));
      appliquer(() => r.dessin);
      choisir([r.id]);
      poserPoint(null);
      dire(phraseMasqueCree(dessin, autres));
    },
    inverserMasque: () => {
      const { dessin, sel, contexte } = lire();
      const id = porteurDe(dessin, sel, contexte?.groupe ?? null, 'masque');
      if (id === null) { dire('Choisissez un groupe masqué.'); return; }
      const r = inverserMasque(dessin, id);
      if (r.erreur) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      dire(PHRASE_MASQUE_INVERSE);
    },
    libererMasque: () => {
      const { dessin, sel, contexte } = lire();
      const id = porteurDe(dessin, sel, contexte?.groupe ?? null, 'masque');
      if (id === null) { dire('Choisissez un groupe masqué.'); return; }
      const r = libererMasque(dessin, id);
      if (r.erreur) { dire(r.erreur); return; }
      appliquer(() => r.dessin);
      rendre(id, r.ids);
      dire(phraseMasqueLibere(r.ids.length));
    },
    poserEffets: (reglage: ReglageEffets, cle?: string | null) => {
      const { sel } = lire();
      if (!sel.length) return;
      appliquer(d => poserEffets(d, sel, reglage), cle === undefined || cle === null ? null : 'effets:' + cle + ':' + sel.join(','));
    },
    insererImage: (donnees: string) => {
      const { dessin, vues, contexte } = lire();
      // Le centre de la vue, dans le plan ; sans toile mesurable (un test hors navigateur), le centre du plan.
      const el = l.toile.current, v = vues.vue, [vx, vy, vl, vh] = dessin.vb;
      const centre = el && el.clientWidth > 0 && v.zoom > 0
        ? { x: (el.clientWidth / 2 - v.x) / v.zoom, y: (el.clientHeight / 2 - v.y) / v.zoom }
        : { x: vx + vl / 2, y: vy + vh / 2 };
      const r = insererImage(dessin, donnees, centre, contexte?.groupe);
      if ('refus' in r) { dire(phraseImageRefusee(r.refus)); return false; }
      const img = r.dessin.formes.find(f => f.id === r.id)?.image;
      appliquer(() => r.dessin);
      choisir([r.id]);
      l.poserOutil('selection');
      dire(phraseImageInseree(r.verifiee.l, r.verifiee.h, !!img && (img.l < r.verifiee.l - 1e-9 || img.h < r.verifiee.h - 1e-9)));
      return true;
    }
  };
}
