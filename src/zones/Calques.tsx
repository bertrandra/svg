// Le panneau des calques : la liste des formes, du premier plan au fond.

import { memo, useEffect } from 'react';
import { modifier, type Forme } from '../engine/editionSvg.js';
import { nomDeForme } from '../engine/description.js';
import { au } from '../util/tableaux.js';
import { pluriel } from '../util/texte.js';
import { useFenetre } from './Fenetre.js';
import { ParCouleur } from './ParCouleur.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { Bouton } from './commun/Bouton.js';
import { BoutonRaison } from './commun/BoutonRaison.js';
import { EtatVide } from './commun/EtatVide.js';

/** La liste des formes, du premier plan au fond : tout choisir ou rien, masquer, verrouiller. */
export const Calques = memo(function Calques() {
  const mo = useDessin(), ac = useActions();
  const { dessin, sel, choisies } = mo;
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
  for (let i = fenetre.debut; i < fenetre.fin; i++) {
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
      <ParCouleur />
      <h4>Formes</h4>
      <ol ref={liste} style={actif ? { paddingTop: fenetre.haut, paddingBottom: fenetre.bas, boxSizing: 'border-box', minHeight: fenetre.hauteur, alignContent: 'start' } : undefined}>{lignes}</ol>
      {/* Un dessin sans forme ne s'ouvre pas : une liste vide est un dessin qu'on a vide, le retour est a Ctrl+Z. */}
      {total ? null : <EtatVide genre="vide" titre="Toutes les formes ont été retirées.">Annuler (Ctrl+Z) les fait revenir ; chaque forme tracée ou insérée aura sa ligne ici.</EtatVide>}
    </aside>
  );
});

/**
 * Une ligne : le nom (qui choisit), masquer, verrouiller. `rang` n'est donne que pour une liste
 * fenetree, dont les lignes absentes du DOM doivent quand meme se compter pour les lecteurs d'ecran.
 */
function LigneCalque({ sel, f, choisie, rang }: { sel: string[]; f: Forme; choisie: boolean; rang: readonly [number, number] | null }) {
  const ac = useActions();
  // La fenetre borne deja le DOM : `content-visibility: auto` y fausserait la mesure du pas.
  const fenetree = rang ? { contentVisibility: 'visible' as const } : undefined;
  return (
    <li className={choisie ? 'choisi' : undefined} style={fenetree} aria-posinset={rang?.[0]} aria-setsize={rang?.[1]}>
      <button type="button" className="calque-nom" aria-label={nomDeForme(f)} aria-pressed={choisie} disabled={f.verrouille} onClick={e => {
        ac.choisir(e.shiftKey ? (choisie ? sel.filter(s => s !== f.id) : [...sel, f.id]) : [f.id]);
        ac.poserPoint(null);
      }}>
        <span className="echantillon" style={{ background: f.remplissage ?? 'transparent', borderColor: f.contour ?? undefined }} />
        {'Forme ' + f.id.slice(1)}
      </button>
      <Bouton icone={f.visible ? 'oeil' : 'masquer'} className="calque-bascule" pressed={!f.visible} aide={(f.visible ? 'Masquer la forme ' : 'Afficher la forme ') + f.id.slice(1)}
        onClick={() => ac.appliquer(d => modifier(d, [f.id], { visible: !f.visible }))} />
      <Bouton icone={f.verrouille ? 'verrouiller' : 'deverrouiller'} className="calque-bascule" pressed={f.verrouille} aide={(f.verrouille ? 'Déverrouiller la forme ' : 'Verrouiller la forme ') + f.id.slice(1)}
        onClick={() => { ac.appliquer(d => modifier(d, [f.id], { verrouille: !f.verrouille })); if (!f.verrouille) ac.choisir(sel.filter(s => s !== f.id)); }} />
    </li>
  );
}
