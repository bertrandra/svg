// Le panneau des calques : la liste des formes, du premier plan au fond. En contexte Cricut qui coupe ou ecrit (ADR-0028), la liste
// se range en deux groupes, « À couper » et « À écrire » (CalquesOperations.tsx).
//
// Un dessin riche (ADR-0012, annexe 6 §1 : des groupes, ou une feuille qui porte un champ v2) montre ses calques en arbre
// (ArbreCalques.tsx) ; un dessin plat garde la liste d'avant, au noeud pres (tests/unit/zones/calques.test.ts). En contexte Cricut,
// les deux groupes d'operations restent la vue premiere (ce qu'on regle avant d'exporter, feuille par feuille) et, pour un dessin
// riche seulement, l'arbre vient dessous, replie au depart : la structure (masquer, verrouiller, deplacer un groupe) reste atteinte.

import { memo, useEffect } from 'react';
import { estPlat, modifier, type Forme } from '../engine/editionSvg.js';
import { nomDeForme, numeroDeForme } from '../engine/description.js';
import { genreAffiche } from './aidesEditeur.js';
import { au } from '../util/tableaux.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';
import { useFenetre } from './Fenetre.js';
import { ParCouleur } from './ParCouleur.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { GroupesOperations } from './CalquesOperations.js';
import { ArbreCalques } from './ArbreCalques.js';
import { operationsApplicables } from '../engine/preparation.js';
import { Bouton } from './commun/Bouton.js';
import { BoutonRaison } from './commun/BoutonRaison.js';
import { EtatVide } from './commun/EtatVide.js';

/** La liste des formes, du premier plan au fond : tout choisir ou rien, masquer, verrouiller. */
export const Calques = memo(function Calques() {
  const mo = useDessin(), ac = useActions(), { profil } = useInterface();
  const { dessin, sel, choisies } = mo;
  const parOperation = !!profil && operationsApplicables(profil.procede);
  const formes = dessin.formes, total = formes.length, plat = estPlat(dessin);
  const choisissables = formes.filter(f => f.visible && !f.verrouille).map(f => f.id);
  // Un groupe masque compte aussi : « Tout afficher » le montre avec ses formes (un dessin plat n'en a pas).
  const groupesMasques = plat ? [] : Object.values(dessin.groupes ?? {}).filter(g => !g.visible).map(g => g.id);
  const masquees = formes.filter(f => !f.visible).length + groupesMasques.length;
  // La liste d'un dessin plat se fenetre ici ; l'arbre d'un dessin riche a sa propre fenetre, dans le meme panneau.
  const { racine, liste, fenetre, actif, montrer } = useFenetre(plat ? total : 0);
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
  for (let i = parOperation || !plat ? 0 : fenetre.debut; i < (parOperation || !plat ? 0 : fenetre.fin); i++) {
    const f = au(formes, total - 1 - i);
    lignes.push(<LigneCalque key={f.id} sel={sel} f={f} choisie={choisies.has(f.id)} rang={actif ? [i + 1, total] : null} />);
  }
  // Le navigateur ne doit pas ancrer le defilement sur une ligne : elle disparait quand la fenetre bouge, et il ramene la liste en arriere.
  return (
    <aside className="editeur-calques" aria-label={t('Calques')} tabIndex={-1} ref={racine} style={actif ? { overflowAnchor: 'none' } : undefined}>
      <h3>{t('Calques')} <span className="aide">{total}</span></h3>
      <div className="calques-actions">
        <BoutonRaison aide={t('Tout sélectionner (Ctrl+A)')} raison={!choisissables.length ? t('Aucune forme à sélectionner') : sel.length === choisissables.length ? t('Toutes les formes sont déjà sélectionnées') : null}
          onClick={() => { ac.choisir(choisissables); ac.poserPoint(null); }}>{t('Tout')}</BoutonRaison>
        <BoutonRaison aide={t('Ne rien sélectionner (Échap)')} raison={sel.length ? null : t('Rien n’est sélectionné')}
          onClick={() => { ac.choisir([]); ac.poserPoint(null); }}>{t('Aucun')}</BoutonRaison>
        <BoutonRaison aide={t('Inverser la sélection')} raison={choisissables.length ? null : t('Aucune forme à inverser')}
          onClick={() => { ac.choisir(choisissables.filter(id => !choisies.has(id))); ac.poserPoint(null); }}>{t('Inverser')}</BoutonRaison>
        <BoutonRaison aide={t('Afficher toutes les formes masquées')} raison={masquees ? null : t('Aucune forme masquée')}
          onClick={() => ac.faire(d => modifier(d, [...d.formes.filter(f => !f.visible).map(f => f.id), ...groupesMasques], { visible: true }), phraseAffiches(masquees, groupesMasques.length > 0))}>{t('Tout afficher')}</BoutonRaison>
      </div>
      {/* En contexte Cricut, ce que la machine fait de chaque forme vient d'abord : c'est ce qu'on regle avant d'exporter. */}
      {parOperation ? <GroupesOperations panneau={racine} /> : null}
      <ParCouleur />
      {!plat ? <ArbreCalques panneau={racine} /> : parOperation ? null : (
        <>
          <h4>{t('Formes')}</h4>
          <ol ref={liste} style={actif ? { paddingTop: fenetre.haut, paddingBottom: fenetre.bas, boxSizing: 'border-box', minHeight: fenetre.hauteur, alignContent: 'start' } : undefined}>{lignes}</ol>
        </>
      )}
      {/* Une liste vide est un dessin qu'on a vide (le retour est a Ctrl+Z), ou un projet vierge du site (ADR-0030), qui n'a rien a defaire. */}
      {total ? null : mo.h.passe.length
        ? <EtatVide genre="vide" titre={t('Toutes les formes ont été retirées.')}>{t('Annuler (Ctrl+Z) les fait revenir ; chaque forme tracée ou insérée aura sa ligne ici.')}</EtatVide>
        : <EtatVide genre="premiere-fois" titre={t('Aucune forme pour l’instant.')}>{t('Chaque forme tracée ou insérée aura sa ligne ici.')}</EtatVide>}
    </aside>
  );
});

/** Ce que dit « Tout afficher » : « 3 éléments affichés. » quand un groupe en etait, « 2 formes affichées. » sinon. */
function phraseAffiches(n: number, avecGroupes: boolean): string {
  if (avecGroupes) return n > 1 ? t('{n} affichés.', { n: pluriel(n, 'élément') }) : t('{n} affiché.', { n: pluriel(n, 'élément') });
  return n > 1 ? t('{n} affichées.', { n: pluriel(n, 'forme') }) : t('{n} affichée.', { n: pluriel(n, 'forme') });
}

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
      <Bouton icone={f.visible ? 'oeil' : 'masquer'} className="calque-bascule" pressed={!f.visible} aide={f.visible ? t('Masquer la forme {n}', { n: f.id.slice(1) }) : t('Afficher la forme {n}', { n: f.id.slice(1) })}
        onClick={() => ac.appliquer(d => modifier(d, [f.id], { visible: !f.visible }))} />
      <Bouton icone={f.verrouille ? 'verrouiller' : 'deverrouiller'} className="calque-bascule" pressed={f.verrouille} aide={f.verrouille ? t('Déverrouiller la forme {n}', { n: f.id.slice(1) }) : t('Verrouiller la forme {n}', { n: f.id.slice(1) })}
        onClick={() => { ac.appliquer(d => modifier(d, [f.id], { verrouille: !f.verrouille })); if (!f.verrouille) ac.choisir(sel.filter(s => s !== f.id)); }} />
    </li>
  );
}
