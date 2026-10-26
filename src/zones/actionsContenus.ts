// Decoupes, masques, effets et images inseres (ADR-0012, etape 8 ; annexe 6 §3 et §6) : les verbes que le menu Edition, le menu Fichier,
// l'inspecteur et le depot sur la toile appellent en modele riche. Le calcul est celui du moteur (edition/decoupes.ts, masques.ts,
// effetsOperations.ts, imagesOperations.ts) ; ici, la selection qui suit et la phrase dite. Comme les autres actions, ils lisent l'etat
// du moment (`lire`) et ne capturent rien.

import {
  ancetres, contenuEnDessin, creerDecoupe, creerMasque, groupeDe, insererImage, inverserMasque, liberer, libererMasque, poserEffets, unites, type DessinSvg, type ReglageEffets
} from '../engine/editionSvg.js';
import { formeVoisine } from '../engine/navigation.js';
import type { EtatLu, Leviers } from './actions.js';
import { phraseSelection } from './annonces.js';
import {
  phraseDecoupeCreee, phraseDecoupeLiberee, phraseEntreeContenu, phraseImageInseree, phraseImageRefusee, phraseMasqueCree, phraseMasqueLibere, PHRASE_MASQUE_INVERSE,
  RAISONS_LENTILLE
} from './phrasesContenus.js';
import { lentilleDe, niveauEdition } from './lentille.js';
import type { ActionsEditeur, ContexteEdition } from './typesEditeur.js';
import { t } from '../util/i18n.js';

export type ActionsContenus = Pick<ActionsEditeur, 'creerDecoupe' | 'libererDecoupe' | 'creerMasque' | 'inverserMasque' | 'libererMasque' | 'poserEffets' | 'insererImage' | 'modifierContenu'>;

/** Les leviers de ces verbes : ceux des autres actions, et ce qui vise le dessin complet meme dans une lentille (paquet 8-D). */
export type LeviersContenus = Leviers & { appliquerComplet?: (f: (d: DessinSvg) => DessinSvg) => void };

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

export function actionsContenus(
  lire: () => EtatContenus, l: LeviersContenus, poserContexte: (c: ContexteEdition | null) => void, poserContexteBrut: (c: ContexteEdition | null) => void = poserContexte
): ActionsContenus {
  const { appliquer, choisir, poserPoint, dire } = l;
  const appliquerComplet = l.appliquerComplet ?? appliquer;
  const annoncer = l.annoncer ?? dire;
  /**
   * Le groupe que vise une liberation ou une inversion, et le dessin ou il vit : hors d'une lentille, le porteur de la selection dans le
   * dessin ; dans une decoupe (ou un masque), son groupe, dans le dessin complet, quand la commande vise ce contenu-la ; sinon une raison.
   */
  const viser = (champ: 'decoupe' | 'masque'): { id: string; dessin: DessinSvg } | { raison: string } => {
    const e = lire(), lent = lentilleDe(e.contexte);
    if (lent) return lent.genre === champ ? { id: lent.groupe, dessin: e.complet ?? e.dessin } : { raison: RAISONS_LENTILLE.autreContenu };
    const id = porteurDe(e.dessin, e.sel, niveauEdition(e.contexte), champ);
    return id === null ? { raison: champ === 'decoupe' ? t('Choisissez un groupe découpé.') : t('Choisissez un groupe masqué.') } : { id, dessin: e.dessin };
  };
  /** Vrai, et la raison dite, quand on est dans une decoupe : une decoupe ne garde que la geometrie. */
  const refuseDansDecoupe = (): boolean => {
    if (lentilleDe(lire().contexte)?.genre !== 'decoupe') return false;
    dire(t(RAISONS_LENTILLE.decoupe));
    return true;
  };
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
      const v = viser('decoupe');
      if ('raison' in v) { dire(v.raison); return; }
      const { id } = v, r = liberer(v.dessin, id);
      if (r.erreur) { dire(r.erreur); return; }
      appliquerComplet(() => r.dessin);
      rendre(id, r.ids);
      dire(phraseDecoupeLiberee(r.ids.length));
    },
    creerMasque: () => {
      if (refuseDansDecoupe()) return;
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
      const v = viser('masque');
      if ('raison' in v) { dire(v.raison); return; }
      const r = inverserMasque(v.dessin, v.id);
      if (r.erreur) { dire(r.erreur); return; }
      appliquerComplet(() => r.dessin);
      dire(t(PHRASE_MASQUE_INVERSE));
    },
    libererMasque: () => {
      const v = viser('masque');
      if ('raison' in v) { dire(v.raison); return; }
      const { id } = v, r = libererMasque(v.dessin, id);
      if (r.erreur) { dire(r.erreur); return; }
      appliquerComplet(() => r.dessin);
      rendre(id, r.ids);
      dire(phraseMasqueLibere(r.ids.length));
    },
    poserEffets: (reglage: ReglageEffets, cle?: string | null) => {
      const { sel } = lire();
      if (!sel.length || refuseDansDecoupe()) return;
      appliquer(d => poserEffets(d, sel, reglage), cle === undefined || cle === null ? null : 'effets:' + cle + ':' + sel.join(','));
    },
    insererImage: (donnees: string) => {
      if (refuseDansDecoupe()) return false;
      const { dessin, vues, contexte } = lire();
      // Le centre de la vue, dans le plan ; sans toile mesurable (un test hors navigateur), le centre du plan.
      const el = l.toile.current, v = vues.vue, [vx, vy, vl, vh] = dessin.vb;
      const centre = el && el.clientWidth > 0 && v.zoom > 0
        ? { x: (el.clientWidth / 2 - v.x) / v.zoom, y: (el.clientHeight / 2 - v.y) / v.zoom }
        : { x: vx + vl / 2, y: vy + vh / 2 };
      const r = insererImage(dessin, donnees, centre, niveauEdition(contexte) ?? undefined);
      if ('refus' in r) { dire(phraseImageRefusee(r.refus)); return false; }
      const img = r.dessin.formes.find(f => f.id === r.id)?.image;
      appliquer(() => r.dessin);
      choisir([r.id]);
      l.poserOutil('selection');
      dire(phraseImageInseree(r.verifiee.l, r.verifiee.h, !!img && (img.l < r.verifiee.l - 1e-9 || img.h < r.verifiee.h - 1e-9)));
      return true;
    },
    modifierContenu: (genre, vise) => {
      // L'etat lu une fois, avant de le changer : le dessin est ici le dessin complet (on n'est dans aucune lentille).
      const { dessin, sel, contexte, outil } = lire();
      if (lentilleDe(contexte)) { dire(t(RAISONS_LENTILLE.dejaDedans)); return false; }
      const groupe = vise ?? porteurDe(dessin, sel, niveauEdition(contexte), genre);
      const vue = groupe === null ? null : contenuEnDessin(dessin, groupe, genre);
      if (groupe === null || !vue) { dire(t(genre === 'decoupe' ? RAISONS_LENTILLE.modifierDecoupe : RAISONS_LENTILLE.modifierMasque)); return false; }
      poserContexteBrut({ groupe, dans: genre });
      // Le premier element du contenu est choisi : les fleches le deplacent aussitot, Tab parcourt les autres (ADR-0011).
      const premier = formeVoisine(vue, [], 1, false, null);
      choisir(premier !== null ? [premier] : []);
      poserPoint(null);
      if (outil !== 'selection') l.poserOutil('selection');
      annoncer(phraseEntreeContenu(dessin, groupe, genre, vue) + (premier !== null ? ' ' + phraseSelection(vue, [premier]) : ''));
      return true;
    }
  };
}
