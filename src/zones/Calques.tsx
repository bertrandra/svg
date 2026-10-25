// Le panneau des calques : la liste des formes, du premier plan au fond. En contexte Cricut qui coupe ou ecrit (ADR-0028), la liste
// se range en deux groupes, « À couper » et « À écrire » (CalquesOperations.tsx).

import { memo, useEffect } from 'react';
import { modifier, type Forme } from '../engine/editionSvg.js';
import { nomDeForme, numeroDeForme } from '../engine/description.js';
import { genreAffiche } from './aidesEditeur.js';
import { au } from '../util/tableaux.js';
import { pluriel } from '../util/texte.js';
import { useFenetre } from './Fenetre.js';
import { ParCouleur } from './ParCouleur.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { GroupesOperations } from './CalquesOperations.js';
import { operationsApplicables } from '../engine/preparation.js';
import { Bouton } from './commun/Bouton.js';
import { BoutonRaison } from './commun/BoutonRaison.js';
import { EtatVide } from './commun/EtatVide.js';

/** La liste des formes, du premier plan au fond : tout choisir ou rien, masquer, verrouiller. */
export const Calques = memo(function Calques() {
  const mo = useDessin(), ac = useActions(), { profil } = useInterface();
  const { dessin, sel, choisies } = mo;
  const parOperation = !!profil && operationsApplicables(profil.procede);
  const formes = dessin.formes, total = formes.length;
  const choisissables = formes.filter(f => f.visible && !f.verrouille).map(f => f.id);
  const masquees = formes.filter(f => !f.visible).length;
  const { racine, liste, fenetre, actif, montrer } = useFenetre(total);
  // Une forme choisie ailleurs (sur la toile) reste atteignable : la liste defile jusqu'a elle.
  const unique = sel.length === 1 ? sel[0] : null;
  useEffect(() => {
    if (unique === null || !actif) return;
    const i = formes.findIndex(f => f.id === unique);
    if (i >= 0) montrer(total - 1 - i);
    // Seul un changement de forme choisie fait defiler, pas chaque modification du dessin.
  }, [unique, actif]);
  // La liste va du premier plan au fond : la ligne `i` est la forme `total - 1 - i`.
  const lignes = [];
  for (let i = parOperation ? 0 : fenetre.debut; i < (parOperation ? 0 : fenetre.fin); i++) {
    const f = au(formes, total - 1 - i);
    lignes.push(<LigneCalque key={f.id} sel={sel} f={f} choisie={choisies.has(f.id)} rang={actif ? [i + 1, total] : null} />);
  }
  // Le navigateur ne doit pas ancrer le defilement sur une ligne : elle disparait quand la fenetre bouge, et il ramene la liste en arriere.
  return (
    <aside className="editeur-calques" aria-label="Calques" tabIndex={-1} ref={racine} style={actif ? { overflowAnchor: 'none' } : undefined}>
      <h3>Calques <span className="aide">{total}</span></h3>
      <div className="calques-actions">
        <BoutonRaison aide="Tout sélectionner (Ctrl+A)" raison={!choisissables.length ? 'Aucune forme à sélectionner' : sel.length === choisissables.length ? 'Toutes les formes sont déjà sélectionnées' : null}
          onClick={() => { ac.choisir(choisissables); ac.poserPoint(null); }}>Tout</BoutonRaison>
        <BoutonRaison aide="Ne rien sélectionner (Échap)" raison={sel.length ? null : 'Rien n’est sélectionné'}
          onClick={() => { ac.choisir([]); ac.poserPoint(null); }}>Aucun</BoutonRaison>
        <BoutonRaison aide="Inverser la sélection" raison={choisissables.length ? null : 'Aucune forme à inverser'}
          onClick={() => { ac.choisir(choisissables.filter(id => !choisies.has(id))); ac.poserPoint(null); }}>Inverser</BoutonRaison>
        <BoutonRaison aide="Afficher toutes les formes masquées" raison={masquees ? null : 'Aucune forme masquée'}
          onClick={() => ac.faire(d => modifier(d, d.formes.filter(f => !f.visible).map(f => f.id), { visible: true }), pluriel(masquees, 'forme') + ' affichée' + (masquees > 1 ? 's' : '') + '.')}>Tout afficher</BoutonRaison>
      </div>
      {/* En contexte Cricut, ce que la machine fait de chaque forme vient d'abord : c'est ce qu'on regle avant d'exporter. */}
      {parOperation ? <GroupesOperations panneau={racine} /> : null}
      <ParCouleur />
      {parOperation ? null : (
        <>
          <h4>Formes</h4>
          <ol ref={liste} style={actif ? { paddingTop: fenetre.haut, paddingBottom: fenetre.bas, boxSizing: 'border-box', minHeight: fenetre.hauteur, alignContent: 'start' } : undefined}>{lignes}</ol>
        </>
      )}
      {/* Un dessin sans forme ne s'ouvre pas : une liste vide est un dessin qu'on a vide, le retour est a Ctrl+Z. */}
      {total ? null : <EtatVide genre="vide" titre="Toutes les formes ont été retirées.">Annuler (Ctrl+Z) les fait revenir ; chaque forme tracée ou insérée aura sa ligne ici.</EtatVide>}
    </aside>
  );
});

/**
 * Une ligne : le nom (qui choisit), masquer, verrouiller. Le nom visible est le genre de la forme suivi de son numero, et le nom
 * accessible commence par lui (« Triangle 3, fond bleu… », description.ts). `data-forme` porte l'identifiant, pour qui doit le lire. `rang` n'est donne que pour une liste
 * fenetree, dont les lignes absentes du DOM doivent quand meme se compter pour les lecteurs d'ecran.
 */
function LigneCalque({ sel, f, choisie, rang }: { sel: string[]; f: Forme; choisie: boolean; rang: readonly [number, number] | null }) {
  const ac = useActions();
  // La fenetre borne deja le DOM : `content-visibility: auto` y fausserait la mesure du pas.
  const fenetree = rang ? { contentVisibility: 'visible' as const } : undefined;
  return (
    <li className={choisie ? 'choisi' : undefined} style={fenetree} aria-posinset={rang?.[0]} aria-setsize={rang?.[1]}>
      <button type="button" className="calque-nom" data-forme={f.id} aria-label={nomDeForme(f)} aria-pressed={choisie} disabled={f.verrouille} onClick={e => {
        ac.choisir(e.shiftKey ? (choisie ? sel.filter(s => s !== f.id) : [...sel, f.id]) : [f.id]);
        ac.poserPoint(null);
      }}>
        {/* Le contour se dit par un anneau interieur : en bordure, une encre sombre disparaissait sur le panneau sombre (le filet fort reste autour). */}
        <span className="echantillon" style={{ background: f.remplissage ?? 'transparent', boxShadow: f.contour ? 'inset 0 0 0 2px ' + f.contour : undefined }} />
        <span className="calque-genre">{genreAffiche(f)}</span> <span className="calque-numero">{numeroDeForme(f)}</span>
      </button>
      <Bouton icone={f.visible ? 'oeil' : 'masquer'} className="calque-bascule" pressed={!f.visible} aide={(f.visible ? 'Masquer la forme ' : 'Afficher la forme ') + f.id.slice(1)}
        onClick={() => ac.appliquer(d => modifier(d, [f.id], { visible: !f.visible }))} />
      <Bouton icone={f.verrouille ? 'verrouiller' : 'deverrouiller'} className="calque-bascule" pressed={f.verrouille} aide={(f.verrouille ? 'Déverrouiller la forme ' : 'Verrouiller la forme ') + f.id.slice(1)}
        onClick={() => { ac.appliquer(d => modifier(d, [f.id], { verrouille: !f.verrouille })); if (!f.verrouille) ac.choisir(sel.filter(s => s !== f.id)); }} />
    </li>
  );
}
