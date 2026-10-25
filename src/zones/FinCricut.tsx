// La fin du parcours Cricut dans le panneau « Prêt pour Cricut » (ADR-0013, amendement) : le bouton d'export qui dit ce qu'il
// reste a corriger, la confirmation legere qui liste ces points (un message dans le panneau, pas une fenetre qui piege), et la
// carte « Dans Design Space » qui dit quoi faire du fichier. Le texte est pur (parcoursCricut.ts) ; ici, l'affichage et le focus.

import { useEffect, useId, useRef } from 'react';
import type { Constat } from '../engine/preparation.js';
import { BoutonRaison } from './commun/BoutonRaison.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { etapesDesignSpace, etatExport, pointsACorriger } from './parcoursCricut.js';

/** Les tiroirs ne s'ouvrent que sous 900 px (editeur.css) : au-dessus, le panneau est deja la. */
const avecTiroirs = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches;

/** Apres l'ouverture d'un tiroir, qui prend le focus pour lui : le focus voulu passe ensuite. */
const apresTiroir = (f: () => void): void => { setTimeout(f, 60); };

/**
 * L'export du panneau : le bouton (« Exporter quand même (2 points à corriger) » tant qu'un point reste), ou la confirmation
 * qu'il a demandee ; apres l'export, la carte des etapes dans Design Space.
 */
export function ExportCricut({ nom }: { nom: string }) {
  const { preparation } = useDessin(), { profil, suiteCricut } = useInterface(), ac = useActions();
  if (!profil) return null;
  const e = etatExport(preparation?.constats ?? null, profil.procede);
  const ptc = profil.procede === 'imprimer-decouper', stylo = profil.procede === 'dessin-stylo';
  if (suiteCricut === 'confirmer' && e.raison === null && e.aCorriger.length) return <Confirmation nom={nom} aCorriger={e.aCorriger} />;
  return (
    <>
      <div className="boutons export-cricut">
        <BoutonRaison className="primaire" aide={ptc ? 'L’image à imprimer, avec son fond perdu, et la ligne de coupe, dans une archive ZIP' : stylo ? 'Un SVG à taille physique, des traits sans remplissage, une couleur par stylo' : 'Un SVG à taille physique, fonds pleins, une couleur par tapis'}
          raison={e.raison} onClick={() => ac.exporterPourCricut(nom)}>{e.libelle}</BoutonRaison>
      </div>
      {suiteCricut === 'design-space' ? <CarteDesignSpace nom={nom} /> : null}
    </>
  );
}

/**
 * La confirmation : les points a corriger, « Exporter quand même » et « Revoir » (l'action sure, seule pleine). Elle prend le focus
 * sur « Revoir » (ouvrant le tiroir de l'inspecteur sur un petit ecran) ; Tab en sort comme de tout le panneau.
 */
function Confirmation({ nom, aCorriger }: { nom: string; aCorriger: readonly Constat[] }) {
  const ac = useActions(), { tiroir } = useInterface();
  const revoir = useRef<HTMLButtonElement>(null), idTitre = useId();
  const tiroirAuDepart = useRef(tiroir);
  useEffect(() => {
    const viser = () => { revoir.current?.focus({ preventScroll: true }); revoir.current?.scrollIntoView({ block: 'nearest' }); };
    if (avecTiroirs() && tiroirAuDepart.current !== 'inspecteur') { ac.poserTiroir('inspecteur'); apresTiroir(viser); } else viser();
  }, [ac]);
  const allerAuxPoints = () => {
    ac.fermerSuiteCricut();
    // Le titre « À corriger » du panneau prend le focus : la personne est la ou les corrections se font.
    apresTiroir(() => {
      const titre = document.querySelector<HTMLElement>('.panneau-cricut .gravite-a-corriger .titre-gravite');
      titre?.focus({ preventScroll: true });
      titre?.scrollIntoView({ block: 'nearest' });
    });
  };
  return (
    <div className="confirmation-export" role="group" aria-labelledby={idTitre}>
      <p id={idTitre} className="titre-confirmation">Il reste {pointsACorriger(aCorriger.length)} :</p>
      <ul>{aCorriger.map(c => <li key={c.code}>{c.message}</li>)}</ul>
      <p className="aide">À ces endroits, la découpe risque de mal tourner. Vous pouvez revoir ces points, ou exporter quand même.</p>
      <div className="boutons">
        <button type="button" onClick={() => ac.exporterPourCricut(nom, true)}>Exporter quand même</button>
        <button ref={revoir} type="button" className="primaire" onClick={allerAuxPoints}>Revoir</button>
      </div>
    </div>
  );
}

/** Les etapes dans Design Space, apres l'export : refermable, sans promesse inventee (ce qui n'est pas verifie est marque). */
function CarteDesignSpace({ nom }: { nom: string }) {
  const { preparation } = useDessin(), { profil } = useInterface(), ac = useActions(), id = useId();
  if (!profil) return null;
  const etapes = etapesDesignSpace(profil, nom, preparation?.taille ?? null);
  return (
    <section className="carte-design-space" aria-labelledby={id}>
      <h3 id={id}>Dans Design Space</h3>
      <ol>{etapes.map(e => <li key={e.texte}>{e.texte}{e.aVerifier ? <span className="a-verifier"> (à vérifier)</span> : null}</li>)}</ol>
      <button type="button" className="discret" onClick={ac.fermerSuiteCricut}>Fermer ces étapes</button>
    </section>
  );
}
