// L'editeur SVG plein ecran : retoucher un dessin vectoriel comme dans un logiciel de dessin.
// Selection, deplacement, mise a l'echelle, points et poignees, outils de trace (rectangle, ellipse,
// etoile, ligne, plume), couleurs d'un nuancier, empilement, alignement, nettoyage du trace,
// insertion depuis la bibliotheque de formes, et un historique qui annule chaque geste. Tout le
// calcul est dans `engine/editionSvg.ts` ; ici, l'affichage et les gestes.
//
// Le composant ne connait aucun magasin : il recoit le SVG, un nuancier facultatif, la bibliotheque
// facultative, et rend le SVG retouche a `enregistrer`. C'est ce qui le rend reutilisable.
//
// L'etat de l'editeur (etatEditeur.ts) se donne aux panneaux par trois contextes : le dessin, les
// actions, l'interface (contexteEditeur.tsx). Un panneau lit ce qui le concerne.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DessinSvg } from '../engine/editionSvg.js';
import type { Bibliotheque } from '../io/bibliotheque.js';
import type { Stockage } from '../io/stockage.js';
import { Cadre } from './Cadre.js';
import { FournisseurSections } from './commun/Section.js';
import { FournisseurEditeur } from './contexteEditeur.js';
import { FournisseurStockage } from './contexteStockage.js';
import { useEtatEditeur } from './etatEditeur.js';
import { lireDessinMemo } from './lecture.js';
import { estHex } from './aidesEditeur.js';
import type { Teinte } from './typesEditeur.js';

// Les types que les autres zones lisent ici : ils vivent dans typesEditeur.ts (types seuls, sans cycle).
export type { ActionsEditeur, EtatInterface, ModeleDessin, Outil, OutilForme, Teinte, Vues } from './typesEditeur.js';

export interface ProprietesEditeur {
  /** Le SVG a retoucher, tel quel. */
  svg: string;
  /** Le titre de la fenetre. */
  titre: string;
  /** Le nom du fichier propose au telechargement, sans extension. */
  nom: string;
  /** Les couleurs proposees dans l'inspecteur et pour le remplacement d'une couleur partout. */
  nuancier?: readonly Teinte[];
  /** La bibliotheque de formes a inserer : deja chargee, ou a charger au premier besoin. */
  bibliotheque?: Bibliotheque | 'a-charger';
  fermer: () => void;
  /** Recoit le SVG retouche, deja nettoye par `nettoyerSvg`. */
  enregistrer: (svg: string) => void;
  /** Recoit le SVG du moment apres chaque modification (une seconde de repos) : de quoi reprendre apres un rechargement. */
  brouillon?: (svg: string) => void;
  /**
   * Ou garder les versions nommees. Absent ou null : l'editeur ne garde rien (il ne connait aucun
   * magasin). La page lui donne celui du navigateur (`stockageNavigateur`), un hote ce qu'il veut.
   */
  stockage?: Stockage | null;
}

/** Une image enveloppee dans un SVG ne s'edite pas : il faut d'abord la vectoriser. */
export const editable = (svg: string): boolean => !/<image\b/i.test(svg);

const SANS_NUANCIER: readonly Teinte[] = [];

/** Un nuancier propre : codes en minuscules, sans doublon, et un nom a chaque teinte. */
export function nuancierPropre(teintes: readonly Teinte[]): Teinte[] {
  const vus = new Set<string>(), r: Teinte[] = [];
  for (const t of teintes) {
    const hex = t.hex.trim().toLowerCase();
    if (estHex(hex) && !vus.has(hex)) { vus.add(hex); r.push({ nom: t.nom.trim() || hex, hex }); }
  }
  return r;
}

/**
 * Le bouton qui ouvre l'editeur sur un SVG, et l'editeur quand il est ouvert. `enregistrer` recoit
 * le SVG retouche, deja nettoye. Une image enveloppee ne s'edite pas : il faut la vectoriser.
 */
export function BoutonEditerSvg({ svg, titre, nom, nuancier, bibliotheque, enregistrer, stockage }: Omit<ProprietesEditeur, 'fermer'>) {
  const [ouvert, ouvrir] = useState(false);
  const ok = editable(svg);
  return (
    <>
      <button type="button" className="discret" disabled={!ok} title={ok ? 'Ouvrir l’éditeur SVG plein écran' : 'Une image enveloppée ne s’édite pas : vectorisez-la d’abord.'}
        onClick={() => ouvrir(true)}>Éditer le SVG en plein écran</button>
      {ouvert ? <EditeurSvg svg={svg} titre={titre} nom={nom} nuancier={nuancier ?? SANS_NUANCIER} {...(bibliotheque === undefined ? {} : { bibliotheque })} {...(stockage === undefined ? {} : { stockage })} fermer={() => ouvrir(false)} enregistrer={s => { enregistrer(s); ouvrir(false); }} /> : null}
    </>
  );
}

export function EditeurSvg({ svg, titre, nom, nuancier: brut = SANS_NUANCIER, bibliotheque, fermer, enregistrer, brouillon, stockage }: ProprietesEditeur) {
  const lu = useMemo(() => lireDessinMemo(svg), [svg]);
  const nuancier = useMemo(() => nuancierPropre(brut), [brut]);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = avant; };
  }, []);
  return createPortal(
    <div className="editeur-svg" role="dialog" aria-modal="true" aria-label={'Éditer : ' + titre}>
      {'erreur' in lu ? (
        <div className="editeur-erreur">
          <p>{lu.erreur}</p>
          <button type="button" onClick={fermer}>Fermer</button>
        </div>
      ) : (
        <FournisseurStockage stockage={stockage ?? null}>
          <FournisseurSections><Atelier initial={lu.dessin} ignores={lu.ignores} titre={titre} nom={nom} nuancier={nuancier} bibliotheque={bibliotheque ?? null} fermer={fermer} enregistrer={enregistrer} brouillon={brouillon} /></FournisseurSections>
        </FournisseurStockage>
      )}
    </div>,
    document.body
  );
}

interface ProprietesAtelier {
  initial: DessinSvg; ignores: readonly string[]; titre: string; nom: string; nuancier: readonly Teinte[]; bibliotheque: Bibliotheque | 'a-charger' | null;
  fermer: () => void; enregistrer: (svg: string) => void; brouillon?: ((svg: string) => void) | undefined;
}

/** Garde l'etat de l'editeur et le donne aux contextes ; le dessin de l'ecran est dans `Cadre`. */
function Atelier({ titre, nom, ...p }: ProprietesAtelier) {
  const e = useEtatEditeur(p);
  return (
    <FournisseurEditeur dessin={e.modele} actions={e.actions} etat={e.etat}>
      <Cadre titre={titre} nom={nom} toile={e.toile} svgRef={e.svgRef} />
    </FournisseurEditeur>
  );
}
