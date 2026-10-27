// « Insérer depuis une adresse… » (menu Fichier de l'editeur, ADR-0036) : un SVG, ou la premiere page d'un PDF, telecharge puis
// insere au centre du plan comme une forme de la bibliotheque (`insererForme`). Les octets suivent la lecture d'un fichier
// d'inconnu (nettoyerSvgNomme, puis lireDessin ; lirePdf pour un PDF). Une image ne s'insere pas : l'editeur ne garde pas de pixels
// (ADR-0001), elle se convertit d'abord dans la voie « Convertir une image », et la boite le dit.

import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lireDessin } from '../engine/editionSvg.js';
import { ouvrirPdf } from '../io/pdf.js';
import { contientTexte, lettresDuSvg } from '../io/texteSvg.js';
import { nettoyerSvgNomme } from '../util/svg.js';
import { useActions, useInterface } from './contexteEditeur.js';
import { optionsModele } from './modele.js';
import type { Modele } from './typesEditeur.js';
import { useFocusDialogue } from './focusEditeur.js';
import { ChampAdresse, texteDuSvg, useTelechargement, type Recu } from './OuvrirAdresse.js';
import { estImage } from '../engine/natureOctets.js';
import { t } from '../util/i18n.js';

// La cle francaise (le module se charge avant la langue, `t` y rend la cle) : le refus la repasse par `t` au moment de le dire.
export const PHRASE_IMAGE_EDITEUR = t('C’est une image : l’éditeur ne garde que des formes vectorielles. Fermez l’éditeur, puis ouvrez cette adresse dans « Convertir une image », qui la vectorise.');

/**
 * Le texte SVG a inserer, tire d'un fichier recu ; ou la phrase du refus. Le texte d'un SVG devient des lettres, comme a l'ouverture.
 * `modele` : celui de l'editeur (ADR-0012, annexe 5 §3), dans lequel `insererForme` le lira.
 */
export async function svgAInserer(r: Recu, modele: Modele = 'plat'): Promise<{ svg: string } | { erreur: string }> {
  if (estImage(r.nature)) return { erreur: t(PHRASE_IMAGE_EDITEUR) };
  let texte: string;
  if (r.nature === 'pdf') {
    const lu = await ouvrirPdf(r.octets, 1);
    if ('erreur' in lu) return { erreur: lu.erreur };
    texte = lu.svg;
  } else {
    texte = texteDuSvg(r.octets);
  }
  const propre = nettoyerSvgNomme(texte);
  if (propre && 'erreur' in propre) return { erreur: propre.erreur };
  if (!propre) return { erreur: t('Ce contenu n’est pas un SVG lisible : il lui faut une balise <svg> avec un viewBox ou des dimensions.') };
  let svg = propre.svg;
  if (contientTexte(svg)) {
    const lettres = await lettresDuSvg(svg, undefined, modele);
    if ('erreur' in lettres) return { erreur: lettres.erreur };
    svg = lettres.svg;
  }
  const lu = lireDessin(svg, optionsModele(modele));
  if ('erreur' in lu) return { erreur: lu.erreur };
  return { svg };
}

/** La boite : une adresse, « Ouvrir », l'etat du telechargement, et ce qui ne s'insere pas. Posee dans l'editeur, modale, Echap la ferme. */
export function BoiteInsererAdresse({ fermer }: { fermer: () => void }) {
  const ac = useActions(), { modele } = useInterface();
  const voile = useRef<HTMLDivElement>(null), champ = useRef<HTMLInputElement>(null), titre = useId();
  const [message, poserMessage] = useState('');
  const [lecture, poserLecture] = useState(false);
  const telechargement = useTelechargement(r => {
    poserLecture(true);
    void svgAInserer(r, modele).then(x => {
      poserLecture(false);
      if ('erreur' in x) { poserMessage(x.erreur); return; }
      fermer();
      ac.insererForme(x.svg);
    });
  }, texte => poserMessage(texte));
  useFocusDialogue(voile, champ, fermer);
  return createPortal(
    <div className="credits-voile" ref={voile}>
      <div className="credits-dialogue inserer-adresse" role="dialog" aria-modal="true" aria-labelledby={titre} aria-busy={lecture}>
        <h2 id={titre}>{t('Insérer depuis une adresse')}</h2>
        <ChampAdresse t={telechargement} champ={champ} aide={t('Un SVG, ou la première page d’un PDF, inséré au centre du plan.')} />
        {message ? <p className="message" role="alert">{message}</p> : null}
        {lecture ? <p className="aide" role="status">{t('Lecture du fichier…')}</p> : null}
        <div className="actions">
          <button type="button" onClick={fermer}>{t('Fermer')}</button>
        </div>
      </div>
    </div>,
    document.querySelector<HTMLElement>('.editeur-svg') ?? document.body
  );
}
