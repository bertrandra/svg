// « Insérer une image… » (ADR-0012, etape 8 ; reste de l'etape 12) : un PNG, JPEG, GIF ou WebP choisi au menu Fichier, ou depose sur
// la toile, devient une feuille image au centre de la vue. Seulement en modele riche (`groupesActifs`) : une image rend le dessin riche,
// et un dessin plat ne la lirait pas ; a plat, ni l'element de menu, ni le depot n'existent (la toile garde son comportement d'avant).
// La lecture du fichier vit dans `io` (`donneesDuFichier`) ; la verification sur les octets et la pose, dans le moteur (`insererImage`).

import { useRef, type DragEvent, type ReactNode } from 'react';
import { IMAGE_OCTETS_MAX, MSG_IMAGE_ILLISIBLE, MSG_IMAGE_LOURDE } from '../engine/editionSvg.js';
import { donneesDuFichier } from '../io/fichiers.js';
import type { ElementMenu } from './commun/Menu.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { groupesActifs } from './commandesGroupes.js';
import { PHRASE_DEPOT_PAS_IMAGE, phraseImageRefusee } from './phrasesContenus.js';
import type { ActionsEditeur } from './typesEditeur.js';
import { dessinComplet } from './lentille.js';

/** Les types que le choix de fichier propose (la verification decide sur les octets, pas sur le nom). */
export const TYPES_IMAGES = 'image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp';

/** Un fichier choisi ou depose, insere ; trop lourd, il n'est pas lu (le refus de la lecture d'un SVG, mot pour mot). */
export async function insererFichierImage(f: Blob, ac: Pick<ActionsEditeur, 'insererImage' | 'dire'>): Promise<boolean> {
  if (f.size > IMAGE_OCTETS_MAX) { ac.dire(phraseImageRefusee(MSG_IMAGE_LOURDE)); return false; }
  let donnees: string;
  try { donnees = await donneesDuFichier(f); } catch { ac.dire(phraseImageRefusee(MSG_IMAGE_ILLISIBLE)); return false; }
  return ac.insererImage(donnees);
}

/**
 * L'element « Insérer une image… » et son choix de fichier cache, en modele riche ; `null` et rien a plat. Le choix de fichier
 * s'ouvre dans le geste qui a choisi l'element (un navigateur n'ouvre pas un choix de fichier hors d'un geste).
 */
export function useInsertionImage(): { element: ElementMenu | null; entree: ReactNode } {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  const entree = useRef<HTMLInputElement>(null);
  if (!groupesActifs(dessinComplet(mo), ui.modele)) return { element: null, entree: null };
  return {
    element: { id: 'inserer-image', libelle: 'Insérer une image…', icone: 'image', separateur: true, onClick: () => entree.current?.click() },
    entree: (
      <input ref={entree} type="file" accept={TYPES_IMAGES} hidden aria-label="Choisir une image à insérer" data-inserer-image=""
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void insererFichierImage(f, ac); }} />
    )
  };
}

/**
 * Le depot d'une image sur la toile, en modele riche : les gestes a poser sur son conteneur ; rien a plat (aucun gestionnaire : un
 * fichier depose fait ce qu'il faisait). Seul un depot de fichiers est pris : un lien ou un texte glisse passent leur chemin.
 */
export function useDepotImage(): { onDragOver?: (e: DragEvent<HTMLElement>) => void; onDrop?: (e: DragEvent<HTMLElement>) => void } {
  const mo = useDessin(), ui = useInterface(), ac = useActions();
  if (!groupesActifs(dessinComplet(mo), ui.modele)) return {};
  const fichiers = (e: DragEvent<HTMLElement>) => Array.from(e.dataTransfer.types).includes('Files');
  return {
    onDragOver: e => { if (fichiers(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } },
    onDrop: e => {
      if (!fichiers(e)) return;
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      if (f.type && !f.type.startsWith('image/')) { ac.dire(PHRASE_DEPOT_PAS_IMAGE); return; }
      void insererFichierImage(f, ac);
    }
  };
}
