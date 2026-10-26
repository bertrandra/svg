// Les gestes d'un texte pose sur ou dans une forme (ADR-0031), ou deforme dans une forme (ADR-0032) : le poser, le rendre libre,
// regler sa disposition, montrer ou masquer sa forme. Le moteur compose et garde le lien (engine/texte/disposition.ts) ; ici, on trouve la fonte, on passe par les verbes de
// l'editeur (une entree d'historique par geste) et on dit ce qui s'est passe.

import { useCallback } from 'react';
import { modifier, type DessinSvg, type DispositionDansForme, type DispositionEnveloppe, type DispositionSurForme, type DispositionTexte, type Forme } from '../engine/editionSvg.js';
import { peutPorter, texteDispose } from '../engine/texte/disposition.js';
import type { RefusEnveloppe } from '../engine/texte/pose.js';
import type { Police } from '../io/polices.js';
import { appliquerChangement, dispositionPour, formePorteuse, policeDe, poseApres, type ChangementTexte } from './actionsTexte.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useTexte } from './contexteTexte.js';
import { PHRASE_FORME_REFUSEE, PHRASE_LIBRE, PHRASE_TAILLE_AJUSTEE, phraseDepassement, phraseFormeVisible, phrasePose, phraseRemplir, phraseRienNeTient, remplit, type ModeDisposition } from './phrasesDisposition.js';
import { t } from '../util/i18n.js';

/** Les formes qui peuvent porter ce texte, dans l'ordre du dessin : visibles, deverrouillees, pas des textes. */
export const candidatesPour = (d: DessinSvg, idTexte: string): Forme[] => d.formes.filter(f => f.visible && !f.verrouille && peutPorter(f, idTexte));

/** Ce que la pose donne a dire : le depassement du texte pose (lettres hors du trace, mots hors de la forme). */
export function depassementDe(d: DessinSvg, id: string, police: Police | null): { depasse: number; nonPlaces: number } {
  const f = d.formes.find(x => x.id === id);
  const r = f && police ? texteDispose(d, f, police.glyphes) : null;
  return { depasse: r?.pose.depasse ?? 0, nonPlaces: r?.pose.nonPlaces ?? 0 };
}

/** Pourquoi un texte deforme ne se deforme plus (sa forme a perdu son interieur, ADR-0032) ; undefined s'il se deforme. */
export function refusDe(d: DessinSvg, id: string, police: Police | null): RefusEnveloppe | undefined {
  const f = d.formes.find(x => x.id === id);
  return f?.texte?.disposition?.mode === 'enveloppe' && police ? texteDispose(d, f, police.glyphes)?.pose.refus : undefined;
}

/** Un reglage de la disposition (ADR-0031, 0032) : un champ de « sur la forme », de « dans la forme » ou du texte deforme. */
export type ReglageDisposition = Partial<Omit<DispositionSurForme, 'mode' | 'forme'>> | Partial<Omit<DispositionDansForme, 'mode' | 'forme'>> | Partial<Omit<DispositionEnveloppe, 'mode' | 'forme'>>;

export function useDisposition() {
  // Les fontes deja chargees, sans les demander : qui monte ce crochet pour un texte les a demandees (barre, panneau, toile).
  const mo = useDessin(), ac = useActions(), ui = useInterface(), { polices } = useTexte();
  const { dessin } = mo;

  /** Applique un changement au texte et rend le dessin d'apres, ou null s'il ne se compose pas (police absente, rien ne se dessine). */
  const changer = useCallback((id: string, c: ChangementTexte, cle?: string | null): { dessin: DessinSvg; police: Police } | null => {
    const f = dessin.formes.find(x => x.id === id), police = policeDe(f, polices);
    if (!f?.texte || !police) return null;
    const apres = appliquerChangement(dessin, id, c, police, ui.profil);
    if (apres === dessin) return null;
    ac.appliquer(() => apres, cle);
    return { dessin: apres, police };
  }, [ac, dessin, polices, ui.profil]);

  /** Pose le texte sur ou dans la forme ; le texte reste choisi. Faux (et dit) si la forme ne peut pas le porter. */
  const poser = useCallback((idTexte: string, idForme: string, mode: ModeDisposition): boolean => {
    const f = dessin.formes.find(x => x.id === idTexte), base = formePorteuse(dessin, idForme, idTexte);
    if (!f?.texte) return false;
    if (f.verrouille) { ac.dire(t('Ce texte est verrouillé : déverrouillez-le pour le poser sur une forme.')); return false; }
    if (!base) { ac.dire(t(PHRASE_FORME_REFUSEE)); return false; }
    if (!policeDe(f, polices)) { ac.dire(polices ? t('Police absente : choisissez-en une pour poser le texte.') : t('Les polices se chargent encore : recommencez dans un instant.')); return false; }
    const avant = f.texte.disposition, memeForme = avant?.forme === base.id, dispo = dispositionPour(mode, base, memeForme ? avant : undefined);
    // Passer de deforme a en lignes (ou l'inverse) dans la meme forme garde l'alignement : c'est toujours « dans la forme ».
    const bascule = memeForme && remplit(avant?.mode) && remplit(mode);
    const c: ChangementTexte = { disposition: dispo, ...(avant?.mode === mode || bascule ? {} : { alignement: 'centre' as const }) };
    // Dans une forme ou aucun mot ne tient a la taille du texte, la taille s'ajuste d'elle-meme (et c'est dit) : poser ne se refuse pas.
    const ajuste = dispo.mode === 'dans' && !dispo.ajuster ? { ...c, disposition: { ...dispo, ajuster: true } } : null;
    let r = changer(idTexte, c), ajustee = false;
    if (!r && ajuste) { r = changer(idTexte, ajuste); ajustee = !!r; }
    const police = policeDe(f, polices);
    if (!r) { ac.dire(phraseRienNeTient(mode, mode === 'enveloppe' && police ? poseApres(dessin, idTexte, c, police)?.refus : undefined)); return false; }
    ac.choisir([idTexte]);
    const { depasse, nonPlaces } = depassementDe(r.dessin, idTexte, r.police);
    ac.dire((bascule && remplit(mode) ? phraseRemplir(mode) : phrasePose(mode, base, depasse, nonPlaces)) + (ajustee ? ' ' + t(PHRASE_TAILLE_AJUSTEE) : ''));
    return true;
  }, [ac, changer, dessin, polices]);

  /** Le texte redevient libre, compose en ligne droite a son point d'ancrage. */
  const liberer = useCallback((idTexte: string) => {
    if (!dessin.formes.find(x => x.id === idTexte)?.texte?.disposition) return;
    if (changer(idTexte, { disposition: null })) ac.dire(t(PHRASE_LIBRE));
  }, [ac, changer, dessin]);

  /**
   * Regle la disposition du texte (depart, cote, repartir, marge, ajuster, justifier), et dit ce qui depasse quand cela change. `cle`
   * fond un geste continu (la poignee de depart) en une entree ; `taire` laisse dire l'appelant.
   */
  const regler = useCallback((idTexte: string, r: ReglageDisposition, cle?: string | null, taire = false): { dessin: DessinSvg; police: Police } | null => {
    const tv = dessin.formes.find(x => x.id === idTexte)?.texte, p = tv?.disposition;
    if (!tv || !p) return null;
    const neuve = { ...p, ...r } as DispositionTexte;
    const fait = changer(idTexte, { disposition: neuve, ...(neuve.mode === 'dans' && neuve.justifier ? { alignement: 'gauche' as const } : {}) }, cle);
    if (!fait) {
      const police = policeDe(dessin.formes.find(x => x.id === idTexte), polices);
      if (!taire) ac.dire(phraseRienNeTient(p.mode, p.mode === 'enveloppe' && police ? poseApres(dessin, idTexte, { disposition: neuve }, police)?.refus : undefined));
      return null;
    }
    if (!taire) {
      const { depasse, nonPlaces } = depassementDe(fait.dessin, idTexte, fait.police);
      const avant = depassementDe(dessin, idTexte, fait.police);
      const dit = phraseDepassement(p.mode, depasse, nonPlaces);
      if (dit && (depasse !== avant.depasse || nonPlaces !== avant.nonPlaces)) ac.dire(dit);
      else if (!dit && (avant.depasse || avant.nonPlaces)) ac.dire(p.mode === 'sur' ? t('Tout le texte tient sur le tracé.') : t('Tout le texte tient dans la forme.'));
    }
    return fait;
  }, [ac, changer, dessin, polices]);

  /** Montre ou masque la forme qui porte le texte (masquee, elle ne s'ecrit pas ; le lien reste). */
  const montrerForme = useCallback((idTexte: string, visible: boolean) => {
    const p = dessin.formes.find(x => x.id === idTexte)?.texte?.disposition;
    const base = p ? dessin.formes.find(x => x.id === p.forme) : undefined;
    if (!base || base.visible === visible) return;
    ac.appliquer(d => modifier(d, [base.id], { visible }));
    ac.dire(phraseFormeVisible(visible));
  }, [ac, dessin]);

  return { poser, liberer, regler, montrerForme, polices };
}
