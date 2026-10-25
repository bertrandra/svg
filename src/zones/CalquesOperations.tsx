// Le panneau de gauche en contexte Cricut (ADR-0028) : les formes en deux groupes, « À couper » et « À écrire ». Chaque ligne montre
// la forme en petit (pleine pour la lame, en trait pour le stylo), la choisit sur la toile (Maj ou Ctrl : l'ajoute a la selection),
// la fait passer dans l'autre groupe d'un bouton, et garde ses bascules (masquer, verrouiller). Glisser une ligne d'un groupe a
// l'autre fait la meme chose : un raccourci pour la souris, jamais le seul chemin. Le calcul est pur (engine/preparation/operations.ts).
//
// Une longue liste se fenetre (ADR-0008, au-dela de 150 lignes) : chaque groupe a sa fenetre dans le panneau qui defile.

import { memo, useEffect, useId, type DragEvent, type RefObject } from 'react';
import { boiteForme, modifier, type Forme, type Operation } from '../engine/editionSvg.js';
import { nomDeForme, numeroDeForme } from '../engine/description.js';
import { partagerOperations } from '../engine/preparation.js';
import { au } from '../util/tableaux.js';
import { genreAffiche } from './aidesEditeur.js';
import { Bouton } from './commun/Bouton.js';
import { EtatVide } from './commun/EtatVide.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useFenetre } from './Fenetre.js';
import { cheminDe } from './Toile.js';
import { Icone } from './icones.js';

/** Ce que chaque groupe dit et fait : son titre, l'autre operation, le geste qui y mene et son raccourci. */
const GROUPES: Readonly<Record<Operation, { titre: string; vers: Operation; geste: string; icone: 'couper' | 'stylo'; vide: string; aide: string }>> = {
  decoupe: { titre: 'À couper', vers: 'ecriture', geste: 'Écrire au stylo', icone: 'stylo', vide: 'Aucune forme à couper.', aide: '« Couper » (Maj+X) y range les formes choisies.' },
  ecriture: { titre: 'À écrire', vers: 'decoupe', geste: 'Couper à la lame', icone: 'couper', vide: 'Aucune forme à écrire.', aide: '« Écrire » (Maj+E) y range les formes choisies ; un trait seul s’y range de lui-même.' }
};

/** Le type des donnees glissees d'une ligne : les identifiants des formes, separes par des espaces. */
const TYPE_GLISSE = 'application/x-svg-formes';

/** Les deux groupes, dans le panneau des calques qui defile (`panneau`). */
export const GroupesOperations = memo(function GroupesOperations({ panneau }: { panneau: RefObject<HTMLElement | null> }) {
  const { dessin } = useDessin(), { profil } = useInterface();
  if (!profil) return null;
  const { decoupe, ecriture } = partagerOperations(dessin, profil.procede);
  return (
    <div className="groupes-operations">
      <Groupe operation="decoupe" formes={decoupe.formes} panneau={panneau} />
      <Groupe operation="ecriture" formes={ecriture.formes} panneau={panneau} />
    </div>
  );
});

/** Un groupe : son titre et son nombre, la liste du premier plan au fond (fenetree au-dela du seuil), ou ce qui y viendra. */
function Groupe({ operation, formes, panneau }: { operation: Operation; formes: readonly Forme[]; panneau: RefObject<HTMLElement | null> }) {
  const { sel, choisies } = useDessin(), ac = useActions();
  const g = GROUPES[operation], total = formes.length, idTitre = useId();
  const { liste, fenetre, actif, montrer } = useFenetre(total, panneau);
  // Une forme choisie ailleurs (sur la toile) reste atteignable : la liste de son groupe defile jusqu'a elle.
  const unique = sel.length === 1 ? sel[0] : null;
  useEffect(() => {
    if (unique === null || !actif) return;
    const i = formes.findIndex(f => f.id === unique);
    if (i >= 0) montrer(total - 1 - i);
    // Seul un changement de forme choisie fait defiler, pas chaque modification du dessin.
  }, [unique, actif]);
  const lignes = [];
  for (let i = fenetre.debut; i < fenetre.fin; i++) {
    const f = au(formes, total - 1 - i);
    lignes.push(<LigneOperation key={f.id} f={f} operation={operation} sel={sel} choisie={choisies.has(f.id)} rang={actif ? [i + 1, total] : null} />);
  }
  // Deposer une ligne glissee de l'autre groupe : la meme operation que son bouton.
  const survoler = (e: DragEvent) => { if (e.dataTransfer.types.includes(TYPE_GLISSE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } };
  const deposer = (e: DragEvent) => {
    const ids = e.dataTransfer.getData(TYPE_GLISSE).split(' ').filter(Boolean);
    if (!ids.length) return;
    e.preventDefault();
    ac.poserOperation(operation, ids);
  };
  return (
    <section className={'groupe-operation groupe-' + operation} aria-labelledby={idTitre} onDragOver={survoler} onDrop={deposer}>
      <h4 id={idTitre}><span><Icone nom={operation === 'decoupe' ? 'couper' : 'stylo'} taille={14} />{g.titre}</span> <span className="aide">{total}</span></h4>
      {total ? (
        <ul ref={liste} aria-labelledby={idTitre} style={actif ? { paddingTop: fenetre.haut, paddingBottom: fenetre.bas, boxSizing: 'border-box', minHeight: fenetre.hauteur, alignContent: 'start' } : undefined}>{lignes}</ul>
      ) : <EtatVide genre="premiere-fois" titre={g.vide}>{g.aide}</EtatVide>}
    </section>
  );
}

const boites = new WeakMap<Forme, string>();
/** Le cadre de la vignette : la boite de la forme, un rien elargie, carree pour ne pas la deformer. */
function cadreVignette(f: Forme): string {
  let v = boites.get(f);
  if (v === undefined) {
    const b = boiteForme(f);
    const cote = b ? Math.max(b.l, b.h, 1e-6) * 1.15 : 1;
    v = b ? [b.x + b.l / 2 - cote / 2, b.y + b.h / 2 - cote / 2, cote, cote].join(' ') : '0 0 1 1';
    boites.set(f, v);
  }
  return v;
}

/** La forme en petit, telle que la machine la traitera : pleine pour la lame, en trait pour le stylo. Decorative : la ligne a un nom. */
function Vignette({ f, operation }: { f: Forme; operation: Operation }) {
  const couleur = operation === 'decoupe' ? f.remplissage ?? f.contour : f.contour ?? f.remplissage;
  return (
    <svg className="vignette-forme" viewBox={cadreVignette(f)} aria-hidden="true" focusable="false">
      {operation === 'decoupe' && f.remplissage !== null
        ? <path d={cheminDe(f)} fill={couleur ?? 'none'} fillRule={f.regle} />
        : <path className="vignette-trait" d={cheminDe(f)} fill="none" stroke={couleur ?? 'none'} />}
    </svg>
  );
}

/**
 * Une ligne : la vignette et le nom (qui choisit), le geste qui fait passer la forme dans l'autre groupe, masquer, verrouiller. Une
 * ligne choisie parmi plusieurs fait passer toute la selection de son groupe : on agit sur ce qu'on a choisi.
 */
function LigneOperation({ f, operation, sel, choisie, rang }: { f: Forme; operation: Operation; sel: string[]; choisie: boolean; rang: readonly [number, number] | null }) {
  const ac = useActions(), g = GROUPES[operation];
  const fenetree = rang ? { contentVisibility: 'visible' as const } : undefined;
  const plusieurs = choisie && sel.length > 1;
  const cibles = plusieurs ? sel : [f.id];
  const nom = genreAffiche(f) + ' ' + numeroDeForme(f);
  const glisser = (e: DragEvent) => { e.dataTransfer.setData(TYPE_GLISSE, cibles.join(' ')); e.dataTransfer.effectAllowed = 'move'; };
  return (
    <li className={choisie ? 'choisi' : undefined} style={fenetree} aria-posinset={rang?.[0]} aria-setsize={rang?.[1]} draggable={!f.verrouille} onDragStart={glisser}>
      {/* La vignette, hors du bouton, est la poignee du glisser : firefox ne commence jamais un glisser sur un bouton. */}
      <Vignette f={f} operation={operation} />
      <button type="button" className="calque-nom" data-forme={f.id} aria-label={nomDeForme(f)} aria-pressed={choisie} disabled={f.verrouille} onClick={e => {
        const ajout = e.shiftKey || e.ctrlKey || e.metaKey;
        ac.choisir(ajout ? (choisie ? sel.filter(s => s !== f.id) : [...sel, f.id]) : [f.id]);
        ac.poserPoint(null);
      }}>
        <span className="calque-genre">{genreAffiche(f)}</span> <span className="calque-numero">{numeroDeForme(f)}</span>
      </button>
      <Bouton icone={g.icone} className="calque-bascule calque-operation" disabled={f.verrouille}
        aide={g.geste + (plusieurs ? ' : les ' + sel.length + ' formes choisies' : ' : ' + nom) + ' (Maj+' + (g.vers === 'ecriture' ? 'E' : 'X') + ')'}
        onClick={() => ac.poserOperation(g.vers, cibles)} />
      <Bouton icone={f.visible ? 'oeil' : 'masquer'} className="calque-bascule" pressed={!f.visible} aide={(f.visible ? 'Masquer la forme ' : 'Afficher la forme ') + numeroDeForme(f)}
        onClick={() => ac.appliquer(d => modifier(d, [f.id], { visible: !f.visible }))} />
      <Bouton icone={f.verrouille ? 'verrouiller' : 'deverrouiller'} className="calque-bascule" pressed={f.verrouille} aide={(f.verrouille ? 'Déverrouiller la forme ' : 'Verrouiller la forme ') + numeroDeForme(f)}
        onClick={() => { ac.appliquer(d => modifier(d, [f.id], { verrouille: !f.verrouille })); if (!f.verrouille) ac.choisir(sel.filter(s => s !== f.id)); }} />
    </li>
  );
}
