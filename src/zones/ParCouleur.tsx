// Les calques par couleur (ADR-0006) : chaque couleur du dessin, avec ses formes, et ce qu'on peut en
// faire d'un geste : les choisir, la changer partout, les afficher ou les masquer, les verrouiller,
// n'afficher qu'elles (et en sortir), choisir ou fusionner ses nuances proches. Les listes se lisent sur
// le remplissage, le contour, ou les deux.
//
// Un dessin issu d'une photo compte des milliers de couleurs (ADR-0008) : la liste se fenetre
// (ListeCouleurs.tsx), les lignes se memoisent, et les couleurs ne se relisent que si une couleur, une
// visibilite ou un verrou change : deplacer une forme ne touche a rien de tout cela.

import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { couleursProches, lireCouleurs, type LectureCouleurs, type SurCouleur } from '../engine/editionSvg.js';
import { pluriel } from '../util/texte.js';
import { EtatVide } from './commun/EtatVide.js';
import { Section } from './commun/Section.js';
import { useDessin, useInterface } from './contexteEditeur.js';
import { ListeCouleurs } from './ListeCouleurs.js';
import { useActionsCouleur } from './actionsCouleur.js';

const SURS: ReadonlyArray<readonly [SurCouleur, string, string]> = [
  ['tout', 'Les deux', 'Couleurs du remplissage et du contour'], ['remplissage', 'Fond', 'Couleurs de remplissage seulement'], ['contour', 'Trait', 'Couleurs de contour seulement']
];

// La tolerance se regle en centiemes d'ecart OKLab (util/couleur.ts) : 2 se devine, 10 saute aux yeux.
const TOLERANCE_MIN = 1, TOLERANCE_MAX = 15, TOLERANCE_DEFAUT = 4;

// Un petit dessin n'a rien a gagner d'un regroupement par couleur : la liste des formes et « Couleurs du dessin » disent deja tout, et
// l'ouvrir ajoute au premier ecran des onglets, une tolerance et deux boutons qu'on ne touche pas encore. La section ne s'ouvre d'elle-meme
// qu'a partir de ces seuils, jugee une fois, a l'ouverture du dessin (pas a chaque forme qu'on ajoute : elle ne bougerait plus d'elle-meme) ;
// ce que la personne ouvre ou ferme ensuite se retient (Section).
const FORMES_POUR_OUVRIR = 5, COULEURS_POUR_OUVRIR = 3;

export function ParCouleur() {
  const mo = useDessin();
  const { dessin } = mo;
  const [sur, poserSur] = useState<SurCouleur>('tout');
  const { profil } = useInterface();
  // En contexte de production, la tolerance de depart est la distance de fusion du materiau (deux papiers que l'oeil confond).
  const [tolerance, poserTolerance] = useState(() => (profil ? Math.min(TOLERANCE_MAX, Math.max(TOLERANCE_MIN, Math.round(profil.fusionNuances * 100))) : TOLERANCE_DEFAUT));
  // Les groupes se relisent quand une couleur, une visibilite ou un verrou change, pas quand une forme bouge ; les
  // groupes inchanges gardent leur objet, et leur ligne ne se redessine pas. La lecture garde aussi un dessin
  // stable tant que les couleurs le sont : c'est de lui que dependent les nuances proches.
  const lecture = useRef<LectureCouleurs | null>(null);
  const courante = lireCouleurs(dessin, sur, lecture.current);
  lecture.current = courante;
  const groupes = courante.groupes;
  const [ouverteParDefaut] = useState(() => dessin.formes.length >= FORMES_POUR_OUVRIR && groupes.length >= COULEURS_POUR_OUVRIR);
  // L'apercu passe apres le reste : pendant un geste continu il retarde d'un cran plutot que de le ralentir.
  const dessinApercu = useDeferredValue(courante.dessin);
  const proches = useMemo(() => couleursProches(dessinApercu, tolerance / 100, sur), [dessinApercu, tolerance, sur]);
  const { actions, suivi, reference, isole, quitterIsolement, nuancesProchesDe, fusionner } = useActionsCouleur(sur, tolerance, groupes);

  if (!dessin.formes.length) return null;

  const fondues = proches.reduce((n, p) => n + p.membres.length, 0);
  return (
    <Section titre="Par couleur" ouverte={ouverteParDefaut} note={groupes.length}>
      <div className="mini-onglets" role="group" aria-label="Couleurs lues sur">
        {SURS.map(([id, libelle, aide]) => <button key={id} type="button" aria-pressed={sur === id} title={aide} onClick={() => poserSur(id)}>{libelle}</button>)}
      </div>
      {isole ? (
        <div className="isolement" role="status">
          <span className="aide">Une seule couleur est affichée.</span>
          <button type="button" className="discret" title="Rendre à chaque forme sa visibilité d’avant (Ctrl+Z annule aussi)" onClick={quitterIsolement}>Quitter l’isolement</button>
        </div>
      ) : null}
      {groupes.length ? (
        <ListeCouleurs groupes={groupes} choisies={mo.choisies} sur={sur} nuancier={mo.nuancier} actions={actions} suivi={suivi} />
      ) : sur === 'tout'
        ? <EtatVide genre="aucun-resultat" titre="Aucune forme n’a de couleur." />
        : <EtatVide genre="aucun-resultat" titre={'Aucune forme n’a de ' + (sur === 'contour' ? 'contour' : 'remplissage') + '.'} action={{ libelle: 'Lire le fond et le trait', onClick: () => poserSur('tout') }} />}
      <div className="nuances-proches">
        <label className="champ-ligne">
          <span>Tolérance</span>
          <input type="range" min={TOLERANCE_MIN} max={TOLERANCE_MAX} step={1} value={tolerance} aria-valuetext={'Tolérance ' + tolerance + ' sur ' + TOLERANCE_MAX}
            title="Écart de couleur toléré entre deux nuances : 2 se devine, 10 saute aux yeux" onChange={e => poserTolerance(Number(e.target.value))} />
          <output>{tolerance}</output>
        </label>
        <p className="aide" role="status">
          {fondues ? pluriel(fondues, 'nuance') + ' se fondrai' + (fondues > 1 ? 'ent' : 't') + ' dans ' + pluriel(proches.length, 'couleur') + '.' : 'Aucune nuance proche à cette tolérance.'}
        </p>
        <div className="boutons">
          <button type="button" disabled={!reference} title={reference ? 'Choisir les formes proches de ' + reference.toUpperCase() : 'Choisissez d’abord une couleur'}
            onClick={() => { if (reference) nuancesProchesDe(reference); }}>Sélectionner les nuances proches</button>
          <button type="button" disabled={!fondues} title="Ramener chaque groupe de nuances à sa couleur la plus employée (Ctrl+Z annule)" onClick={fusionner}>Fusionner les nuances proches</button>
        </div>
      </div>
    </Section>
  );
}
