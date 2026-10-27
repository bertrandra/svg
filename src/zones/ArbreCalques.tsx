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
//
// Le budget du DOM (annexe 7 §4, paquet 2-D, mesure : ≈ 17 elements par ligne, dont 11 pour les deux boutons a icone) : a la souris,
// les boutons de visibilite et de verrou ne se dessinent que sur la ligne active (celle du tabindex itinerant : le clavier les atteint
// toujours par Droite), la ligne survolee, et une ligne masquee ou verrouillee (son etat se voit) ; leurs cellules restent, vides,
// a la meme largeur. Au doigt, sans survol, chaque ligne garde ses boutons. Le chevron d'un groupe est dessine par la feuille de style.

import { memo, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { ancetres, NOM_GROUPE_MAX, verrouilleEffectif, visibleEffectif, type Forme, type Groupe } from '../engine/editionSvg.js';
import { nomDeForme, numeroDeForme, porteParGroupe } from '../engine/description.js';
import { segmentsFenetre } from '../util/fenetre.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';
import { genreAffiche } from './aidesEditeur.js';
import { MenuDeroulant } from './commun/Menu.js';
import { focusAuClavier } from './commun/focusClavier.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useFenetre } from './Fenetre.js';
import { gesteClavier, gestesDepot, gestesSouris, verbesArbre, type Depot, type FocusArbre, type MemoireArbre } from './gestesArbreCalques.js';
import { Icone } from './icones.js';
import { useSurvolFin } from './Vue.js';
import { lignesVisibles, pastillesGroupe } from './lignesCalques.js';
import { nomDeGroupe } from './phrasesGroupes.js';
import { niveauEdition } from './lentille.js';

/** L'element qui porte le focus dans une ligne : aucun, la ligne, ou l'une de ses deux cellules a bouton (visibilite, verrou). */
type Arret = 'aucun' | 'ligne' | 0 | 1;

/** Le nom d'un groupe tel que sa ligne le dit : « Groupe « Nuage », 3 éléments, masqué ». */
function nomDeLigneGroupe(g: Groupe, enfants: number): string {
  // Ce que le groupe porte (decoupe, masque, effets, opacite : ADR-0012, etape 8) suit le nombre d'elements, avant les etats.
  const porte = porteParGroupe(g);
  const morceaux = [g.nom ? t('Groupe « {nom} »', { nom: g.nom }) : nomDeGroupe(g), pluriel(enfants, 'élément'), ...porte];
  if (g.verrouille) morceaux.push(t('verrouillé'));
  if (!g.visible) morceaux.push(t('masqué'));
  return morceaux.join(', ');
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
  // La ligne sous la souris (survolFin seulement) : la seule, avec l'active, a dessiner ses boutons sans etat a montrer.
  const [survol, poserSurvol] = useState<string | null>(null);
  const survolFin = useSurvolFin();
  const memoire = useRef<MemoireArbre>({ ancre: null, focusVoulu: false, dernierFocus: null, renommeEnCours: null, premierClic: null }).current;

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
  const survoler = (ev: PointerEvent<HTMLDivElement>) => {
    if (!survolFin || ev.pointerType === 'touch') return;
    const id = ev.target instanceof Element ? ev.target.closest<HTMLElement>('[data-ligne]')?.dataset['ligne'] ?? null : null;
    if (id !== survol) poserSurvol(id);
  };
  return (
    <>
      <div className="arbre-entete">
        <h4 id={idTitre}>{t('Formes et groupes')}</h4>
        <MenuDeroulant etiquette={t('Déplacer vers… (Maj+F10 dans la liste)')} libelle={t('Déplacer vers…')} elements={v.elementsMenu()} alignement="droite" demandeOuverture={demandeMenu} className="deplacer-vers" />
      </div>
      <div role="treegrid" ref={f.liste} className="arbre-calques" aria-labelledby={idTitre} aria-multiselectable="true" aria-rowcount={total}
        onClick={souris.clic} onDoubleClick={souris.doubleClic} onKeyDown={gesteClavier(etat, v)} onFocus={souris.prendFocus} onBlur={souris.perdFocus}
        onPointerOver={survoler} onPointerLeave={() => { if (survol !== null) poserSurvol(null); }}
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
              deplie={deplies.has(id)} choisie={choisies.has(id)} arret={arret} contexte={niveauEdition(contexte) === id} renomme={renomme === id}
              depot={depot?.id === id ? depot.mode : null} verrouille={verrouilleEffectif(dessin, id)} masquee={!visibleEffectif(dessin, id)}
              boutons={!survolFin || id === actif || id === survol} />
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
  /** Dessiner les boutons de visibilite et de verrou meme a l'etat de repos (ligne active, survolee, ou au doigt). */
  boutons: boolean;
}

/**
 * Une ligne : le chevron d'un groupe, l'echantillon d'une feuille, le nom (le genre et le numero d'une feuille, le nom d'un groupe et
 * son nombre d'enfants), puis deux cellules a bouton, la visibilite et le verrou. Le nom accessible de la ligne est celui de la liste
 * d'un dessin plat pour une feuille (« Triangle 3, fond bleu… », description.ts), « Groupe « Nuage », 3 éléments » pour un groupe.
 */
const LigneArbreCalque = memo(function LigneArbreCalque(p: ProprietesLigne) {
  const { id, forme: fo, groupe: g } = p;
  const visible = g ? g.visible : fo?.visible ?? true, verrouille = g ? g.verrouille : fo?.verrouille ?? false;
  const nomG = g ? (g.nom ? t('« {nom} »', { nom: g.nom }) : nomDeGroupe(g)) : '';
  const quoi = g ? t('le groupe {nom}', { nom: nomG }) : t('la forme {numero}', { numero: fo ? numeroDeForme(fo) : id });
  // Une ligne masquee ou verrouillee montre toujours ses boutons : son etat se lit sur eux.
  const boutons = p.boutons || !visible || verrouille;
  const classe = 'calque-ligne' + (p.choisie ? ' choisi' : '') + (p.contexte ? ' contexte' : '') + (p.masquee ? ' estompee' : '') + (p.depot ? ' depot-' + p.depot : '');
  return (
    <div role="row" className={classe} data-ligne={id} aria-level={p.niveau} aria-posinset={p.position} aria-setsize={p.freres} aria-rowindex={p.rang}
      aria-expanded={g ? p.deplie : undefined} aria-selected={p.choisie} aria-current={p.contexte ? 'true' : undefined}
      aria-label={g ? nomDeLigneGroupe(g, p.enfants) : fo ? nomDeForme(fo) : id} tabIndex={p.arret === 'ligne' ? 0 : -1} draggable={!p.verrouille && !p.renomme}>
      {/* Le retrait dit le niveau ; une variable d'espacement, multipliee, jamais une valeur ecrite. */}
      <div role="gridcell" className="calque-arbre-nom" style={p.niveau > 1 ? { paddingInlineStart: 'calc(var(--esp-l) * ' + (p.niveau - 1) + ')' } : undefined}>
        {g
          ? <button type="button" tabIndex={-1} className="calque-chevron" data-action="deplier" aria-label={p.deplie ? t('Replier le groupe {nom}', { nom: nomG }) : t('Déplier le groupe {nom}', { nom: nomG })} title={p.deplie ? t('Replier (Gauche, Droite)') : t('Déplier (Gauche, Droite)')} />
          : <span className="calque-chevron" aria-hidden="true" />}
        {fo ? <span className="echantillon" style={{ background: fo.remplissage ?? 'transparent', boxShadow: fo.contour ? 'inset 0 0 0 2px ' + fo.contour : undefined }} /> : null}
        {p.renomme && g
          ? <input type="text" className="calque-renommer" aria-label={t('Nouveau nom du groupe {nom} (Entrée valide, Échap annule)', { nom: nomG })} defaultValue={g.nom ?? ''} placeholder={nomDeGroupe(g)} maxLength={NOM_GROUPE_MAX} autoFocus />
          : g
            ? <><span className="calque-genre">{g.nom ?? nomDeGroupe(g)}</span> <span className="calque-numero">{p.enfants}</span><PastillesGroupe groupe={g} /></>
            : fo ? <><span className="calque-genre">{genreAffiche(fo)}</span> <span className="calque-numero">{numeroDeForme(fo)}</span></> : null}
      </div>
      <div role="gridcell" className="calque-cellule-bascule">
        {boutons ? <button type="button" className="icone-bouton calque-bascule" data-action="visible" data-cellule="0" tabIndex={p.arret === 0 ? 0 : -1} aria-pressed={!visible}
          aria-label={visible ? t('Masquer {quoi}', { quoi }) : t('Afficher {quoi}', { quoi })} title={visible ? t('Masquer {quoi}', { quoi }) : t('Afficher {quoi}', { quoi })}><Icone nom={visible ? 'oeil' : 'masquer'} /></button> : null}
      </div>
      <div role="gridcell" className="calque-cellule-bascule">
        {boutons ? <button type="button" className="icone-bouton calque-bascule" data-action="verrou" data-cellule="1" tabIndex={p.arret === 1 ? 0 : -1} aria-pressed={verrouille}
          aria-label={verrouille ? t('Déverrouiller {quoi}', { quoi }) : t('Verrouiller {quoi}', { quoi })} title={verrouille ? t('Déverrouiller {quoi}', { quoi }) : t('Verrouiller {quoi}', { quoi })}><Icone nom={verrouille ? 'verrouiller' : 'deverrouiller'} /></button> : null}
      </div>
    </div>
  );
});

/**
 * Les pastilles d'un groupe (decoupe, masque, flou, ombre, opacite) : leurs icones d'abord, qui se voient toujours, puis leurs mots, sur
 * une bande d'une ligne ; un mot qui ne tient plus passe a la ligne suivante, cachee, plutot que de pousser les bascules ou d'etre rogne
 * (jamais une deuxieme hauteur de ligne : le fenetrage la suppose constante). Le nom de la ligne les dit toutes, l'infobulle aussi.
 * Le double-clic sur celle d'une decoupe ou d'un masque fait modifier ce contenu ; au clavier, c'est la commande du menu Edition.
 */
function PastillesGroupe({ groupe }: { groupe: Groupe }) {
  const p = pastillesGroupe(groupe);
  if (!p.length) return null;
  return (
    <span className="calque-pastilles" aria-hidden="true" title={p.map(x => x.mot).join(', ')}>
      {/* Un double-clic sur la pastille d'une decoupe ou d'un masque en modifie le contenu (paquet 8-D) : `data-pastille` la nomme. */}
      {p.map(x => <span key={x.icone} className="pastille-icone" data-pastille={x.icone}><Icone nom={x.icone} taille={12} /></span>)}
      {p.map(x => <span key={x.icone} className="pastille-mot" data-pastille={x.icone}>{x.mot}</span>)}
    </span>
  );
}
