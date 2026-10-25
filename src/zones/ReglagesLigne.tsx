// Les reglages de la ligne mediane (ADR-0021) : l'epaisseur du trait se voit a cote du mode et du grain ; le
// seuil, les taches, les barbules, les coupures et la couleur sont des reglages fins, dans la section repliee.
// Comme pour vtracer (ADR-0005), un curseur n'est « modifie » que s'il differe de la valeur que l'image mesuree
// et le grain donnent, et revient d'un clic ; ces valeurs se calculent dans le moteur, jamais ici.

import { PARAMETRES_LIGNE, poserLigne, retirerLigne, valeursLigneParDefaut, type MesureLigne, type ParametreLigne, type ReglagesLigne } from '../engine/lignemediane.js';
import type { ReglageVecteurs } from '../engine/vectorisation.js';
import { Icone } from './icones.js';

const arrondi = (v: number) => Math.round(v * 100) / 100;
const parametre = (id: ParametreLigne['id']): ParametreLigne => PARAMETRES_LIGNE.find(p => p.id === id) ?? (PARAMETRES_LIGNE[0] as ParametreLigne);

interface Proprietes {
  v: ReglageVecteurs;
  /** Ce que la derniere ligne mediane a mesure sur l'image ; null avant le premier resultat. */
  mesure: MesureLigne | null;
  poser: (v: ReglageVecteurs) => void;
}

/** Un curseur de la ligne mediane : la valeur, une marque quand elle est touchee, le retour d'un clic. */
function CurseurLigne({ id, v, mesure, poser }: Proprietes & { id: ParametreLigne['id'] }) {
  const p = parametre(id), defauts = valeursLigneParDefaut(v.finesse, mesure), defaut = defauts[id];
  const touche = v.ligne?.[id] !== undefined, valeur = v.ligne?.[id] ?? defaut;
  const mettre = (r: ReglagesLigne | undefined) => poser(r ? { ...v, ligne: r } : { mode: v.mode, finesse: v.finesse });
  return (
    <label className={'fin' + (touche ? ' touche' : '')} title={p.aide}>
      <span className="fin-libelle">{p.libelle}</span>
      <input type="range" min={p.min} max={p.max} step={p.pas} value={Math.min(p.max, Math.max(p.min, valeur))} aria-label={p.libelle}
        onChange={e => mettre(poserLigne(v.ligne, id, Number(e.target.value), defaut))} />
      <output>{arrondi(valeur)}{p.unite ?? ''}</output>
      <button type="button" className="icone-bouton petit" disabled={!touche} title={'Revenir à la valeur par défaut (' + arrondi(defaut) + ')'} aria-label={'Revenir à la valeur par défaut pour « ' + p.libelle + ' »'}
        onClick={() => mettre(retirerLigne(v.ligne, id))}><Icone nom="annuler" taille={12} /></button>
    </label>
  );
}

/** L'epaisseur du trait, visible dans le groupe « Tracé », a la mise en page des reglages fins. */
export function EpaisseurLigne(props: Proprietes) {
  return <div className="reglages-fins"><CurseurLigne {...props} id="epaisseur" /></div>;
}

/** Les reglages fins de la ligne mediane. */
export function ReglagesLignePanneau({ v, mesure, poser }: Proprietes) {
  const ligne = v.ligne ?? {}, defauts = valeursLigneParDefaut(v.finesse, mesure);
  const fins = Object.keys(ligne).filter(k => k !== 'epaisseur').length;
  const mettre = (r: ReglagesLigne | undefined) => poser(r ? { ...v, ligne: r } : { mode: v.mode, finesse: v.finesse });
  return (
    <div className="reglages-fins">
      <p className="aide">Changer de grain remet ces réglages à leurs valeurs par défaut, mesurées sur l’image.</p>
      {(['seuil', 'taches', 'barbules', 'coupures'] as const).map(id => <CurseurLigne key={id} id={id} v={v} mesure={mesure} poser={poser} />)}
      <label className={'champ-ligne' + (ligne.couleur ? ' touche' : '')} title="La couleur des lignes écrites : la couleur dominante du trait (noir pour un trait gris ou noir), ou noir">
        <span>Couleur</span>
        <select value={ligne.couleur ?? defauts.couleur} onChange={e => mettre(poserLigne(v.ligne, 'couleur', e.target.value === 'noir' ? 'noir' : 'trait', defauts.couleur))}>
          <option value="trait">Celle du trait</option>
          <option value="noir">Noir</option>
        </select>
      </label>
      <button type="button" className="discret" disabled={!fins} onClick={() => mettre(ligne.epaisseur !== undefined ? { epaisseur: ligne.epaisseur } : undefined)}>Revenir aux valeurs par défaut</button>
    </div>
  );
}
