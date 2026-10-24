// Les reglages fins du traceur (ADR-0005) : un curseur par parametre qui change quelque chose dans le
// mode choisi, la valeur que le mode donne, une marque quand on s'en ecarte, et le retour d'un clic.
// Le calcul (valeurs par defaut, ce qui est « touche ») est du moteur ; ici, seulement les champs.

import { parametresDuMode, poserFin, retirerFin, valeursParDefaut, type ReglageVecteurs, type ReglagesFins } from '../engine/vectorisation.js';
import { Icone } from './icones.js';

const arrondi = (v: number) => Math.round(v * 100) / 100;

export function ReglagesFinsPanneau({ v, nCouleurs, poser }: { v: ReglageVecteurs; nCouleurs: number; poser: (v: ReglageVecteurs) => void }) {
  const defauts = valeursParDefaut(v.mode, v.finesse, nCouleurs > 0 ? nCouleurs : 8);
  const fins: ReglagesFins = v.fins ?? {};
  const mettre = (f: ReglagesFins | undefined) => poser(f ? { ...v, fins: f } : { mode: v.mode, finesse: v.finesse });
  const touches = Object.keys(fins).length;
  return (
    <fieldset className="editeur-groupe reglages-fins">
      <legend>Réglages fins{touches ? ' · ' + touches + ' modifié' + (touches > 1 ? 's' : '') : ''}</legend>
      {parametresDuMode(v.mode).map(p => {
        const defaut = defauts[p.id];
        const max = p.id === 'couleursMax' ? Math.max(1, Math.min(p.max, nCouleurs > 0 ? nCouleurs : p.max)) : p.max;
        const touche = fins[p.id] !== undefined;
        const valeur = fins[p.id] ?? defaut;
        if (max <= p.min) return null;
        return (
          <label key={p.id} className={'fin' + (touche ? ' touche' : '')} title={p.aide}>
            <span className="fin-libelle">{p.libelle}</span>
            <input type="range" min={p.min} max={max} step={p.pas} value={Math.min(valeur, max)} aria-label={p.libelle}
              onChange={e => mettre(poserFin(v.fins, p.id, Number(e.target.value), defaut))} />
            <output>{arrondi(valeur)}</output>
            <button type="button" className="icone-bouton petit" disabled={!touche} title={'Revenir à la valeur du mode (' + arrondi(defaut) + ')'} aria-label={'Revenir à la valeur du mode pour ' + p.libelle}
              onClick={() => mettre(retirerFin(v.fins, p.id))}><Icone nom="annuler" taille={12} /></button>
          </label>
        );
      })}
      <label className={'champ-ligne' + (fins.courbes ? ' touche' : '')}>
        <span>Courbes</span>
        <select value={fins.courbes ?? defauts.courbes} onChange={e => mettre(poserFin(v.fins, 'courbes', e.target.value === 'polygon' ? 'polygon' : 'spline', defauts.courbes))}>
          <option value="spline">Lissées</option>
          <option value="polygon">Segments droits</option>
        </select>
      </label>
      <label className={'champ-ligne' + (fins.empilement ? ' touche' : '')}>
        <span>Formes</span>
        <select value={fins.empilement ?? defauts.empilement} onChange={e => mettre(poserFin(v.fins, 'empilement', e.target.value === 'cutout' ? 'cutout' : 'stacked', defauts.empilement))}>
          <option value="stacked">Empilées (une couche sous l’autre)</option>
          <option value="cutout">Découpées (des trous, sans recouvrement)</option>
        </select>
      </label>
      <button type="button" className="discret" disabled={!touches} onClick={() => mettre(undefined)}>Revenir aux valeurs du mode</button>
    </fieldset>
  );
}
