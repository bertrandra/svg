// Le panneau des calques : la liste des formes, du premier plan au fond.

import { useEffect } from 'react';
import { modifier, type Forme } from '../engine/editionSvg.js';
import { au } from '../util/tableaux.js';
import { pluriel } from '../util/texte.js';
import { useFenetre } from './Fenetre.js';
import { ParCouleur } from './ParCouleur.js';
import type { Edition } from './typesEditeur.js';

/** La liste des formes, du premier plan au fond : tout choisir ou rien, masquer, verrouiller. */
export function Calques({ ed }: { ed: Edition }) {
  const { dessin, sel, choisies } = ed;
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
    lignes.push(<LigneCalque key={f.id} ed={ed} f={f} choisie={choisies.has(f.id)} rang={actif ? [i + 1, total] : null} />);
  }
  // Le navigateur ne doit pas ancrer le defilement sur une ligne : elle disparait quand la fenetre bouge, et il ramene la liste en arriere.
  return (
    <aside className="editeur-calques" aria-label="Calques" ref={racine} style={actif ? { overflowAnchor: 'none' } : undefined}>
      <h3>Calques <span className="aide">{total}</span></h3>
      <div className="calques-actions">
        <button type="button" className="discret" disabled={!choisissables.length || sel.length === choisissables.length} title="Tout sélectionner (Ctrl+A)" onClick={() => { ed.choisir(choisissables); ed.poserPoint(null); }}>Tout</button>
        <button type="button" className="discret" disabled={!sel.length} title="Ne rien sélectionner (Échap)" onClick={() => { ed.choisir([]); ed.poserPoint(null); }}>Aucun</button>
        <button type="button" className="discret" disabled={!choisissables.length} title="Inverser la sélection" onClick={() => { ed.choisir(choisissables.filter(id => !choisies.has(id))); ed.poserPoint(null); }}>Inverser</button>
        <button type="button" className="discret" disabled={!masquees} title="Afficher toutes les formes masquées" onClick={() => ed.faire(d => modifier(d, d.formes.filter(f => !f.visible).map(f => f.id), { visible: true }), pluriel(masquees, 'forme') + ' affichée' + (masquees > 1 ? 's' : '') + '.')}>Tout afficher</button>
      </div>
      <ParCouleur ed={ed} />
      <h4>Formes</h4>
      <ol ref={liste} style={actif ? { paddingTop: fenetre.haut, paddingBottom: fenetre.bas, boxSizing: 'border-box', minHeight: fenetre.hauteur, alignContent: 'start' } : undefined}>{lignes}</ol>
    </aside>
  );
}

/**
 * Une ligne : le nom (qui choisit), masquer, verrouiller. `rang` n'est donne que pour une liste
 * fenetree, dont les lignes absentes du DOM doivent quand meme se compter pour les lecteurs d'ecran.
 */
function LigneCalque({ ed, f, choisie, rang }: { ed: Edition; f: Forme; choisie: boolean; rang: readonly [number, number] | null }) {
  const { sel } = ed;
  // La fenetre borne deja le DOM : `content-visibility: auto` y fausserait la mesure du pas.
  const fenetree = rang ? { contentVisibility: 'visible' as const } : undefined;
  return (
    <li className={choisie ? 'choisi' : undefined} style={fenetree} aria-posinset={rang?.[0]} aria-setsize={rang?.[1]}>
      <button type="button" className="calque-nom" disabled={f.verrouille} onClick={e => {
        ed.choisir(e.shiftKey ? (choisie ? sel.filter(s => s !== f.id) : [...sel, f.id]) : [f.id]);
        ed.poserPoint(null);
      }}>
        <span className="echantillon" style={{ background: f.remplissage ?? 'transparent', borderColor: f.contour ?? undefined }} />
        {'Forme ' + f.id.slice(1)}
      </button>
      <button type="button" className="calque-bascule" aria-pressed={!f.visible} title={f.visible ? 'Masquer' : 'Afficher'} aria-label={(f.visible ? 'Masquer la forme ' : 'Afficher la forme ') + f.id.slice(1)}
        onClick={() => ed.appliquer(d => modifier(d, [f.id], { visible: !f.visible }))}>{f.visible ? '◉' : '○'}</button>
      <button type="button" className="calque-bascule" aria-pressed={f.verrouille} title={f.verrouille ? 'Déverrouiller' : 'Verrouiller'} aria-label={(f.verrouille ? 'Déverrouiller la forme ' : 'Verrouiller la forme ') + f.id.slice(1)}
        onClick={() => { ed.appliquer(d => modifier(d, [f.id], { verrouille: !f.verrouille })); if (!f.verrouille) ed.choisir(sel.filter(s => s !== f.id)); }}>{f.verrouille ? '🔒' : '🔓'}</button>
    </li>
  );
}
