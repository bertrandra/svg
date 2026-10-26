// Les calques d'un dessin riche en arbre (ADR-0012, annexe 6 §1) : un `treegrid` ARIA, parce qu'une ligne porte des boutons
// (visibilite, verrou) qu'un `tree` ne laisse pas atteindre. Un seul arret de tabulation (tabindex itinerant) : Tab entre dans la
// grille et en ressort, jamais piege (ADR-0011). Le dessin plat garde sa liste d'avant (Calques.tsx), au noeud pres.
//
// Clavier (modele de l'APG, surcharges de l'annexe) : Haut et Bas, la ligne voisine (Maj : etendre la selection) ; Droite deplie un
// groupe replie, entre dans un groupe deplie (son premier enfant), et sur une feuille atteint ses boutons ; Gauche replie, ou remonte
// au parent ; sur un bouton, Gauche et Droite vont d'une cellule a l'autre, Haut et Bas gardent la colonne. Origine, Fin, Page
// precedente et suivante. Entree entre dans un groupe (ou choisit une feuille) ; Espace ajoute ou retire de la selection ; F2
// renomme un groupe ; * deplie les groupes freres ; Maj+F10 ou la touche Menu ouvre « Déplacer vers… ». Alternatives au glisser :
// Ctrl+Maj+Haut et Bas (un rang parmi les freres), Ctrl+Maj+Gauche (sortir du groupe), Ctrl+Maj+Droite (entrer dans le groupe juste
// au-dessus), et « Déplacer vers… » qui liste les groupes. Le glisser-deposer d'une ligne sur un groupe l'y fait entrer.
//
// Fenetre au-dela de 150 lignes visibles (ADR-0008) : deux cales tiennent la place des autres, la ligne qui a le focus reste
// dessinee hors de la fenetre (`segmentsFenetre`). Les gestes sont delegues a la grille : une ligne n'est qu'un dessin memorise, qui
// ne se redessine que si sa forme, son groupe ou son etat change.

import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ancetres, NOM_GROUPE_MAX, verrouilleEffectif, visibleEffectif, type Forme, type Groupe } from '../engine/editionSvg.js';
import { nomDeForme, numeroDeForme } from '../engine/description.js';
import { segmentsFenetre } from '../util/fenetre.js';
import { pluriel } from '../util/texte.js';
import { genreAffiche } from './aidesEditeur.js';
import { MenuDeroulant } from './commun/Menu.js';
import { focusAuClavier } from './commun/focusClavier.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useFenetre } from './Fenetre.js';
import { gesteClavier, gestesDepot, gestesSouris, verbesArbre, type Depot, type FocusArbre, type MemoireArbre } from './gestesArbreCalques.js';
import { Icone } from './icones.js';
import { lignesVisibles } from './lignesCalques.js';
import { nomDeGroupe } from './phrasesGroupes.js';

/** L'element qui porte le focus dans une ligne : aucun, la ligne, ou l'une de ses deux cellules a bouton (visibilite, verrou). */
type Arret = 'aucun' | 'ligne' | 0 | 1;

/** Le nom d'un groupe tel que sa ligne le dit : « Groupe « Nuage », 3 éléments, masqué ». */
function nomDeLigneGroupe(g: Groupe, enfants: number): string {
  return (g.nom ? 'Groupe « ' + g.nom + ' »' : nomDeGroupe(g)) + ', ' + pluriel(enfants, 'élément') + (g.verrouille ? ', verrouillé' : '') + (g.visible ? '' : ', masqué');
}

export const ArbreCalques = memo(function ArbreCalques({ panneau }: { panneau: RefObject<HTMLElement | null> }) {
  const mo = useDessin(), ac = useActions(), { deplies, contexte } = useInterface();
  const { dessin, sel, choisies } = mo;
  const { lignes, index } = lignesVisibles(dessin, deplies);
  const total = lignes.length;
  const f = useFenetre<HTMLDivElement>(total, panneau);
  const idTitre = useId();
  const [focus, poserFocus] = useState<FocusArbre | null>(null);
  const [renomme, poserRenomme] = useState<string | null>(null);
  const [depot, poserDepot] = useState<Depot>(null);
  const [demandeMenu, poserDemandeMenu] = useState(0);
  const memoire = useRef<MemoireArbre>({ ancre: null, focusVoulu: false, dernierFocus: null, renommeEnCours: null }).current;

  // La ligne active : celle du focus si elle est visible, sinon son plus proche ancetre visible, la premiere choisie, la premiere.
  let actif: string | null = null;
  if (focus) actif = index.has(focus.id) ? focus.id : ancetres(dessin, focus.id).find(g => index.has(g)) ?? null;
  actif ??= sel.find(id => index.has(id)) ?? lignes[0]?.id ?? null;
  const cellule = focus && focus.id === actif ? focus.cellule : -1;
  const iActif = actif === null ? -1 : index.get(actif) ?? -1;

  // Le navigateur ne doit pas ancrer le defilement du panneau sur une ligne : elle disparait quand la fenetre bouge (Calques.tsx).
  useEffect(() => {
    const p = panneau.current;
    if (!p || !f.actif) return;
    p.style.overflowAnchor = 'none';
    return () => { p.style.overflowAnchor = ''; };
  }, [f.actif, panneau]);

  // Une forme choisie ailleurs (sur la toile) reste atteignable : ses groupes se deplient, la liste defile jusqu'a elle.
  const unique = sel.length === 1 ? sel[0] ?? null : null;
  const uniqueVisible = unique !== null && index.has(unique);
  useEffect(() => {
    if (unique === null) return;
    if (!uniqueVisible) {
      const replies = ancetres(dessin, unique).filter(g => !deplies.has(g));
      if (replies.length) ac.deplier(replies, true);
      return;
    }
    const i = index.get(unique);
    if (i !== undefined && f.actif) f.montrer(i);
    // Seul un changement de forme choisie (ou sa ligne qui apparait) fait defiler, pas chaque modification du dessin.
  }, [unique, uniqueVisible]);

  // Le focus suit un geste du clavier (ou revient d'une ligne retiree) : la ligne, ou son bouton, le prend ; le panneau defile.
  useLayoutEffect(() => {
    const grille = f.liste.current, perdu = memoire.dernierFocus;
    if (!grille || actif === null) return;
    const rendre = !!perdu && !perdu.isConnected && (document.activeElement === document.body || document.activeElement === null);
    if (!memoire.focusVoulu && !rendre) return;
    memoire.focusVoulu = false;
    memoire.dernierFocus = null;
    if (f.actif && iActif >= 0) f.montrer(iActif);
    const ligne = grille.querySelector<HTMLElement>('[data-ligne="' + actif + '"]');
    const cible = cellule >= 0 ? ligne?.querySelector<HTMLElement>('[data-cellule="' + cellule + '"]') : ligne;
    focusAuClavier(cible ?? ligne, { preventScroll: f.actif });
  });

  // Quand l'arbre s'en va (le dessin redevient plat : son dernier groupe defait), le focus qu'il portait revient au panneau.
  useLayoutEffect(() => () => {
    const grille = f.liste.current;
    if (grille && document.activeElement && grille.contains(document.activeElement)) panneau.current?.focus();
  }, []);

  const etat = {
    dessin, sel, choisies, deplies, contexte, lignes, index, focus, depot, pas: f.pas, ac, panneau, memoire,
    poserFocus, poserRenomme, poserDepot, demanderMenu: () => poserDemandeMenu(n => n + 1)
  };
  const v = verbesArbre(etat), souris = gestesSouris(etat, v), depose = gestesDepot(etat, v);
  const segments = segmentsFenetre(f.fenetre, total, f.pas, iActif >= 0 ? iActif : null);
  return (
    <>
      <div className="arbre-entete">
        <h4 id={idTitre}>Formes et groupes</h4>
        <MenuDeroulant etiquette="Déplacer vers… (Maj+F10 dans la liste)" libelle="Déplacer vers…" elements={v.elementsMenu()} alignement="droite" demandeOuverture={demandeMenu} className="deplacer-vers" />
      </div>
      <div role="treegrid" ref={f.liste} className="arbre-calques" aria-labelledby={idTitre} aria-multiselectable="true" aria-rowcount={total}
        onClick={souris.clic} onDoubleClick={souris.doubleClic} onKeyDown={gesteClavier(etat, v)} onFocus={souris.prendFocus} onBlur={souris.perdFocus}
        onDragStart={depose.glisser} onDragOver={depose.survoler} onDrop={depose.deposer} onDragLeave={depose.quitter} onDragEnd={depose.finir}>
        {segments.map(sg => {
          if (sg.type === 'cale') return <div key={'cale-' + sg.lieu} data-cale="" aria-hidden="true" style={{ height: sg.hauteur }} />;
          const l = lignes[sg.index];
          if (!l) return null;
          const n = l.noeud, id = l.id;
          const arret: Arret = id !== actif ? 'aucun' : cellule === 0 ? 0 : cellule === 1 ? 1 : 'ligne';
          return (
            <LigneArbreCalque key={id} id={id} niveau={l.niveau} position={l.position} freres={l.freres} rang={sg.index + 1}
              forme={n.genre === 'feuille' ? n.forme : null} groupe={n.genre === 'groupe' ? n.groupe : null} enfants={n.genre === 'groupe' ? n.enfants.length : 0}
              deplie={deplies.has(id)} choisie={choisies.has(id)} arret={arret} contexte={contexte?.groupe === id} renomme={renomme === id}
              depot={depot?.id === id ? depot.mode : null} verrouille={verrouilleEffectif(dessin, id)} masquee={!visibleEffectif(dessin, id)} />
          );
        })}
      </div>
    </>
  );
});

interface ProprietesLigne {
  id: string; niveau: number; position: number; freres: number; rang: number;
  forme: Forme | null; groupe: Groupe | null; enfants: number;
  deplie: boolean; choisie: boolean; arret: Arret; contexte: boolean; renomme: boolean; depot: 'dans' | 'sous' | null;
  /** Verrouillee, elle ou un groupe qui la contient : elle ne se choisit pas et ne se glisse pas. */
  verrouille: boolean;
  /** Masquee, elle ou un groupe qui la contient : la ligne s'estompe. */
  masquee: boolean;
}

/**
 * Une ligne : le chevron d'un groupe, l'echantillon d'une feuille, le nom (le genre et le numero d'une feuille, le nom d'un groupe et
 * son nombre d'enfants), puis deux cellules a bouton, la visibilite et le verrou. Le nom accessible de la ligne est celui de la liste
 * d'un dessin plat pour une feuille (« Triangle 3, fond bleu… », description.ts), « Groupe « Nuage », 3 éléments » pour un groupe.
 */
const LigneArbreCalque = memo(function LigneArbreCalque(p: ProprietesLigne) {
  const { id, forme: fo, groupe: g } = p;
  const visible = g ? g.visible : fo?.visible ?? true, verrouille = g ? g.verrouille : fo?.verrouille ?? false;
  const nomG = g ? (g.nom ? '« ' + g.nom + ' »' : nomDeGroupe(g)) : '';
  const quoi = g ? 'le groupe ' + nomG : 'la forme ' + (fo ? numeroDeForme(fo) : id);
  const classe = 'calque-ligne' + (p.choisie ? ' choisi' : '') + (p.contexte ? ' contexte' : '') + (p.masquee ? ' estompee' : '') + (p.depot ? ' depot-' + p.depot : '');
  return (
    <div role="row" className={classe} data-ligne={id} aria-level={p.niveau} aria-posinset={p.position} aria-setsize={p.freres} aria-rowindex={p.rang}
      aria-expanded={g ? p.deplie : undefined} aria-selected={p.choisie} aria-current={p.contexte ? 'true' : undefined}
      aria-label={g ? nomDeLigneGroupe(g, p.enfants) : fo ? nomDeForme(fo) : id} tabIndex={p.arret === 'ligne' ? 0 : -1} draggable={!p.verrouille && !p.renomme}>
      {/* Le retrait dit le niveau ; une variable d'espacement, multipliee, jamais une valeur ecrite. */}
      <div role="gridcell" className="calque-arbre-nom" style={p.niveau > 1 ? { paddingInlineStart: 'calc(var(--esp-l) * ' + (p.niveau - 1) + ')' } : undefined}>
        {g
          ? <button type="button" tabIndex={-1} className="calque-chevron" data-action="deplier" aria-label={(p.deplie ? 'Replier le groupe ' : 'Déplier le groupe ') + nomG} title={(p.deplie ? 'Replier' : 'Déplier') + ' (Gauche, Droite)'}><Icone nom="chevron-bas" taille={12} /></button>
          : <span className="calque-chevron" aria-hidden="true" />}
        {fo ? <span className="echantillon" style={{ background: fo.remplissage ?? 'transparent', boxShadow: fo.contour ? 'inset 0 0 0 2px ' + fo.contour : undefined }} /> : null}
        {p.renomme && g
          ? <input type="text" className="calque-renommer" aria-label={'Nouveau nom du groupe ' + nomG + ' (Entrée valide, Échap annule)'} defaultValue={g.nom ?? ''} placeholder={nomDeGroupe(g)} maxLength={NOM_GROUPE_MAX} autoFocus />
          : g
            ? <><span className="calque-genre">{g.nom ?? nomDeGroupe(g)}</span> <span className="calque-numero">{p.enfants}</span></>
            : fo ? <><span className="calque-genre">{genreAffiche(fo)}</span> <span className="calque-numero">{numeroDeForme(fo)}</span></> : null}
      </div>
      <div role="gridcell">
        <button type="button" className="icone-bouton calque-bascule" data-action="visible" data-cellule="0" tabIndex={p.arret === 0 ? 0 : -1} aria-pressed={!visible}
          aria-label={(visible ? 'Masquer ' : 'Afficher ') + quoi} title={(visible ? 'Masquer ' : 'Afficher ') + quoi}><Icone nom={visible ? 'oeil' : 'masquer'} /></button>
      </div>
      <div role="gridcell">
        <button type="button" className="icone-bouton calque-bascule" data-action="verrou" data-cellule="1" tabIndex={p.arret === 1 ? 0 : -1} aria-pressed={verrouille}
          aria-label={(verrouille ? 'Déverrouiller ' : 'Verrouiller ') + quoi} title={(verrouille ? 'Déverrouiller ' : 'Verrouiller ') + quoi}><Icone nom={verrouille ? 'verrouiller' : 'deverrouiller'} /></button>
      </div>
    </div>
  );
});
