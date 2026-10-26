// Les outils de trace de l'inspecteur : transformer un contour en forme, le decaler, arrondir les angles,
// joindre ou fermer des tracés, inverser leur sens ; et, en mode points, le type du point actif (angle, lisse,
// symetrique), casser le tracé, retirer le point en gardant la courbe. Chaque champ se valide par Entree ou
// par son bouton : rien ne s'applique en tapant.

import { useState } from 'react';
import type { ActionsEditeur } from './typesEditeur.js';
import { aDesPoignees, lireNoeud, type Forme, type TypeNoeud } from '../engine/editionSvg.js';
import type { Jonction } from '../engine/contours.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { arrondi } from './aidesEditeur.js';
import { nomDeType } from './phrasesTrace.js';
import { ArrondiDirect } from './ArrondiDirect.js';
import { LargeurVariable } from './LargeurVariable.js';
import { t } from '../util/i18n.js';

const nombre = (t: string): number => Number(t.replace(',', '.'));

/**
 * Mene au champ d'un outil depuis le menu Edition (un menu n'a pas de champ numerique) : ouvre le panneau
 * (le tiroir sur un petit ecran), deplie la section « Tracé » et met le focus dans le champ.
 */
export function allerAuChamp(ac: ActionsEditeur, champ: 'decalage' | 'rayon'): void {
  ac.poserTiroir('inspecteur');
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>('.editeur-inspecteur input[data-champ-trace="' + champ + '"]');
    if (!el) return;
    const section = el.closest('details');
    if (section && !section.open) section.open = true;
    el.focus();
    el.select();
  });
}

/** Un champ numerique qui s'applique a Entree, et son bouton. */
function ChampAction({ champ, libelle, titre, valeur, poser, bouton, appliquer, desactive, enfants }: {
  champ: string; libelle: string; titre: string; valeur: string; poser: (t: string) => void; bouton: string; appliquer: () => void; desactive: boolean; enfants?: React.ReactNode;
}) {
  return (
    <div className="outil-trace">
      <label className="champ-ligne nombre" title={titre}>
        <span>{libelle}</span>
        <input type="text" inputMode="decimal" data-champ-trace={champ} value={valeur} onChange={e => poser(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') appliquer(); }} />
      </label>
      {enfants}
      <button type="button" className="discret" disabled={desactive} onClick={appliquer}>{bouton}</button>
    </div>
  );
}

/** Contour en forme, decalage, angles arrondis, jonction et sens : ce qui s'applique aux formes choisies. */
export function OutilsTrace() {
  const mo = useDessin(), ac = useActions(), { profil, outil, point } = useInterface();
  const { dessin, sel } = mo;
  // En contexte de production (ADR-0013), les valeurs par defaut sont celles du materiau : decaler de la moitie du detail
  // minimal (ce qu'il faut a une partie trop fine), arrondir au rayon de la lame ; sinon, un quarantieme du plan.
  const [distance, poserDistance] = useState(() => String(arrondi(profil ? profil.detailMin / 2 : Math.max(dessin.vb[2], dessin.vb[3]) / 40)));
  const [jonction, poserJonction] = useState<Jonction>('round');
  const [angle, poserAngle] = useState('45');
  const choisies = dessin.formes.filter(f => mo.choisies.has(f.id));
  const sansContour = !choisies.some(f => f.contour !== null && f.epaisseur > 0);
  return (
    <div className="outils-trace">
      <div className="boutons">
        <button type="button" disabled={sansContour} title={t('Remplace le contour par une forme pleine de même silhouette : couleur du contour en fond, épaisseur, bouts, jonctions et pointillés compris')} onClick={ac.contourEnForme}>{t('Contour en forme')}</button>
        <button type="button" disabled={!choisies.length} title={t('Parcourt le tracé à l’envers : sans effet sur le dessin, utile aux pointillés et aux trous')} onClick={ac.inverserSens}>{t('Inverser le sens')}</button>
        <button type="button" disabled={sel.length < 1 || sel.length > 2} title={t('Un tracé ouvert : le ferme. Deux tracés ouverts : les joint par leurs bouts les plus proches')} onClick={ac.joindreSelection}>{t('Joindre ou fermer')}</button>
      </div>
      <ChampAction
        champ="decalage" libelle={t('Décaler le contour de')} titre={t('Positif : vers l’extérieur, négatif : vers l’intérieur. Un tracé ouvert est entouré.')} valeur={distance} poser={poserDistance}
        bouton={t('Décaler')} desactive={!choisies.length} appliquer={() => ac.decalerContour(nombre(distance), jonction)}
        enfants={(
          <label className="champ-ligne">
            <span>{t('Angles du décalage')}</span>
            <select value={jonction} onChange={e => poserJonction(e.target.value === 'miter' ? 'miter' : e.target.value === 'bevel' ? 'bevel' : 'round')}>
              <option value="round">{t('Arrondis')}</option>
              <option value="miter">{t('En pointe')}</option>
              <option value="bevel">{t('Biseautés')}</option>
            </select>
          </label>
        )}
      />
      <ChampAction
        champ="hachures" libelle={t('Hachures à (degrés)')} titre={t('Remplit la forme de lignes parallèles espacées de la largeur du stylo (ou d’un deux-centième du plan), trous respectés : ce qu’un stylo sait faire d’un fond')} valeur={angle} poser={poserAngle}
        bouton={t('Hachurer')} desactive={!choisies.some(f => f.remplissage !== null)} appliquer={() => ac.hachurer(nombre(angle))}
      />
      {/* Arrondir en direct (ADR-0038) : le curseur arrondit sous les yeux ; en mode points, le seul coin du point actif. */}
      <ArrondiDirect coin={outil === 'points' && mo.formeSeule && point !== null ? point : null} />
      {/* La largeur variable (ADR-0038) : le trait devient une surface qui suit un profil. */}
      <LargeurVariable />
    </div>
  );
}

// Une fonction, pas une constante : les libelles se traduisent au rendu, quand le dictionnaire de la langue est pose (ADR-0042).
const types = (): ReadonlyArray<readonly [TypeNoeud, string, string]> => [
  ['angle', t('Angle'), t('Poignées rentrées : tirez-les une à une')],
  ['lisse', t('Lisse'), t('Poignées alignées, de longueurs libres')],
  ['symetrique', t('Symétrique'), t('Poignées alignées et de même longueur')]
];

/** Le type du point actif, ses conversions, et les gestes qui coupent ou retirent le point. */
export function NoeudsPoint({ forme, point }: { forme: Forme; point: number }) {
  const ac = useActions();
  const noeud = lireNoeud(forme.d, point);
  if (!noeud) return null;
  const regle = aDesPoignees(forme.d, point) && noeud.type !== null;
  return (
    <>
      <p className="aide">
        {noeud.type === null ? t('Extrémité du tracé : une seule poignée.') : regle ? t('Type : {type}. Alt en tirant une poignée la rompt un instant.', { type: nomDeType(noeud.type) }) : t('Entre deux segments droits : pas de poignées.')}
      </p>
      <div className="boutons" role="group" aria-label={t('Type du point')}>
        {types().map(([type, libelle, aide]) => (
          <button key={type} type="button" title={aide} aria-pressed={noeud.type === type || (type === 'lisse' && noeud.type === 'symetrique')} disabled={!regle} onClick={() => ac.convertirNoeud(type)}>{libelle}</button>
        ))}
      </div>
      <div className="boutons">
        <button type="button" title={t('Coupe le tracé en ce point : deux tracés ouverts (un tracé fermé s’ouvre)')} onClick={ac.casserNoeud}>{t('Casser le tracé ici')}</button>
        <button type="button" title={t('Retire le point et recolle les deux segments sans changer la courbe, si c’est possible')} onClick={ac.supprimerNoeudFidele}>{t('Supprimer en gardant la courbe')}</button>

      </div>
    </>
  );
}
