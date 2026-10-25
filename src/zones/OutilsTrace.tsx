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
  const mo = useDessin(), ac = useActions(), { profil } = useInterface();
  const { dessin, sel } = mo;
  // En contexte de production (ADR-0013), les valeurs par defaut sont celles du materiau : decaler de la moitie du detail
  // minimal (ce qu'il faut a une partie trop fine), arrondir au rayon de la lame ; sinon, un quarantieme du plan.
  const [distance, poserDistance] = useState(() => String(arrondi(profil ? profil.detailMin / 2 : Math.max(dessin.vb[2], dessin.vb[3]) / 40)));
  const [jonction, poserJonction] = useState<Jonction>('round');
  const [angle, poserAngle] = useState('45');
  const [rayon, poserRayon] = useState(() => String(arrondi(profil ? profil.rayonLame : Math.max(dessin.vb[2], dessin.vb[3]) / 40)));
  const choisies = dessin.formes.filter(f => mo.choisies.has(f.id));
  const sansContour = !choisies.some(f => f.contour !== null && f.epaisseur > 0);
  return (
    <div className="outils-trace">
      <div className="boutons">
        <button type="button" disabled={sansContour} title="Remplace le contour par une forme pleine de même silhouette : couleur du contour en fond, épaisseur, bouts, jonctions et pointillés compris" onClick={ac.contourEnForme}>Contour en forme</button>
        <button type="button" disabled={!choisies.length} title="Parcourt le tracé à l’envers : sans effet sur le dessin, utile aux pointillés et aux trous" onClick={ac.inverserSens}>Inverser le sens</button>
        <button type="button" disabled={sel.length < 1 || sel.length > 2} title="Un tracé ouvert : le ferme. Deux tracés ouverts : les joint par leurs bouts les plus proches" onClick={ac.joindreSelection}>Joindre ou fermer</button>
      </div>
      <ChampAction
        champ="decalage" libelle="Décaler le contour de" titre="Positif : vers l’extérieur, négatif : vers l’intérieur. Un tracé ouvert est entouré." valeur={distance} poser={poserDistance}
        bouton="Décaler" desactive={!choisies.length} appliquer={() => ac.decalerContour(nombre(distance), jonction)}
        enfants={(
          <label className="champ-ligne">
            <span>Angles du décalage</span>
            <select value={jonction} onChange={e => poserJonction(e.target.value === 'miter' ? 'miter' : e.target.value === 'bevel' ? 'bevel' : 'round')}>
              <option value="round">Arrondis</option>
              <option value="miter">En pointe</option>
              <option value="bevel">Biseautés</option>
            </select>
          </label>
        )}
      />
      <ChampAction
        champ="hachures" libelle="Hachures à (degrés)" titre="Remplit la forme de lignes parallèles espacées de la largeur du stylo (ou d’un deux-centième du plan), trous respectés : ce qu’un stylo sait faire d’un fond" valeur={angle} poser={poserAngle}
        bouton="Hachurer" desactive={!choisies.some(f => f.remplissage !== null)} appliquer={() => ac.hachurer(nombre(angle))}
      />
      <ChampAction
        champ="rayon" libelle="Rayon des angles" titre="Arrondit chaque angle d’un arc de ce rayon ; ramené au plus grand possible si les côtés sont trop courts" valeur={rayon} poser={poserRayon}
        bouton="Arrondir les angles" desactive={!choisies.length} appliquer={() => ac.arrondirAngles(nombre(rayon))}
      />
    </div>
  );
}

const TYPES: ReadonlyArray<readonly [TypeNoeud, string, string]> = [
  ['angle', 'Angle', 'Poignées rentrées : tirez-les une à une'],
  ['lisse', 'Lisse', 'Poignées alignées, de longueurs libres'],
  ['symetrique', 'Symétrique', 'Poignées alignées et de même longueur']
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
        {noeud.type === null ? 'Extrémité du tracé : une seule poignée.' : regle ? 'Type : ' + nomDeType(noeud.type) + '. Alt en tirant une poignée la rompt un instant.' : 'Entre deux segments droits : pas de poignées.'}
      </p>
      <div className="boutons" role="group" aria-label="Type du point">
        {TYPES.map(([type, libelle, aide]) => (
          <button key={type} type="button" title={aide} aria-pressed={noeud.type === type || (type === 'lisse' && noeud.type === 'symetrique')} disabled={!regle} onClick={() => ac.convertirNoeud(type)}>{libelle}</button>
        ))}
      </div>
      <div className="boutons">
        <button type="button" title="Coupe le tracé en ce point : deux tracés ouverts (un tracé fermé s’ouvre)" onClick={ac.casserNoeud}>Casser le tracé ici</button>
        <button type="button" title="Retire le point et recolle les deux segments sans changer la courbe, si c’est possible" onClick={ac.supprimerNoeudFidele}>Supprimer en gardant la courbe</button>
      </div>
    </>
  );
}
