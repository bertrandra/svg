// La section « Position et taille » de l'inspecteur : X et Y, puis L et H, entre eux le verrou « Conserver les proportions ». Le
// verrou est un reglage de la session (etatEditeur.ts) : pose, une largeur tapee recalcule la hauteur dans la proportion de
// reference (engine/proportions.ts), et l'inverse, en une seule entree d'historique ; le coin et Alt et fleches le suivent aussi.

import { redimensionner, type Boite } from '../engine/editionSvg.js';
import { boiteAvecCote } from '../engine/proportions.js';
import { phraseTaille } from './annonces.js';
import { Section } from './commun/Section.js';
import { Nombre } from './commun/Nombre.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Icone } from './icones.js';
import { t } from '../util/i18n.js';

/** Le nom accessible du verrou : fixe, c'est `aria-pressed` qui porte l'etat (un nom qui changerait serait lu deux fois). */
export const nomVerrouProportions = (): string => t('Conserver les proportions');

/** L'infobulle du verrou : ce qu'il fait, et ce que Maj devient sur un coin. */
export const aideVerrouProportions = (): string => t('Conserver les proportions : la hauteur suit la largeur, et l’inverse, aux champs, aux coins et au clavier (Alt et flèches). Sur un coin, Maj inverse le réglage le temps du geste.');

export function SectionPositionTaille({ boite }: { boite: Boite }) {
  const mo = useDessin(), ac = useActions(), { verrouProportions } = useInterface();
  const { sel } = mo;
  const placer = (cible: Boite) => ac.appliquer(d => redimensionner(d, sel, cible));
  // Un cote tape : verrou pose (et une boite qui a une proportion), l'autre suit ; la region vocale dit alors la taille entiere,
  // puisqu'un champ que la personne n'a pas touche a change.
  const poserCote = (cote: 'l' | 'h', v: number) => {
    const ref = ac.proportionsDe(sel, boite), cible = boiteAvecCote(boite, cote, v, ref);
    if (!ref || !(v > 0)) { placer(cible); return; }
    const apres = redimensionner(mo.dessin, sel, cible);
    ac.appliquer(() => apres);
    ac.annoncer(phraseTaille(apres, sel));
  };
  return (
    <Section titre={t('Position et taille')} ouverte>
      <div className="grille-2 grille-taille">
        <Nombre libelle="X" valeur={boite.x} poser={v => placer({ ...boite, x: v })} />
        <span aria-hidden="true" />
        <Nombre libelle="Y" valeur={boite.y} poser={v => placer({ ...boite, y: v })} />
        <Nombre libelle={t('L')} valeur={boite.l} min={0} poser={v => poserCote('l', v)} />
        <button type="button" className="icone-bouton verrou-proportions" aria-label={nomVerrouProportions()} title={aideVerrouProportions()}
          aria-pressed={verrouProportions} onClick={() => ac.poserVerrouProportions(!verrouProportions)}>
          <Icone nom={verrouProportions ? 'proportions-liees' : 'proportions-libres'} />
        </button>
        <Nombre libelle={t('H')} valeur={boite.h} min={0} poser={v => poserCote('h', v)} />
      </div>
    </Section>
  );
}
