// Les reglages fins du traceur (ADR-0005) : un curseur par parametre qui change quelque chose dans le
// mode choisi, la valeur que le mode donne, une marque quand on s'en ecarte, et le retour d'un clic.
// Le calcul (valeurs par defaut, ce qui est « touche ») est du moteur ; ici, seulement les champs. Le
// panneau vit dans une section repliee de l'atelier, qui porte son titre et le nombre de reglages touches ;
// chaque libelle dit l'effet en mots simples, l'infobulle garde le nom technique du parametre.

import { COULEURS_PALETTE_MAX, parametresDuMode, poserFin, retirerFin, valeursParDefaut, type ReglageVecteurs, type ReglagesFins } from '../engine/vectorisation.js';
import { Icone } from './icones.js';
import { t } from '../util/i18n.js';

const arrondi = (v: number) => Math.round(v * 100) / 100;

/** `plafond` : le nombre de couleurs que le traceur peut recevoir (huit, davantage quand le prétraitement les a réduites). */
export function ReglagesFinsPanneau({ v, nCouleurs, poser, plafond = COULEURS_PALETTE_MAX }: { v: ReglageVecteurs; nCouleurs: number; poser: (v: ReglageVecteurs) => void; plafond?: number }) {
  const defauts = valeursParDefaut(v.mode, v.finesse, nCouleurs > 0 ? nCouleurs : plafond, plafond);
  const fins: ReglagesFins = v.fins ?? {};
  const mettre = (f: ReglagesFins | undefined) => poser(f ? { ...v, fins: f } : { mode: v.mode, finesse: v.finesse });
  const touches = Object.keys(fins).length;
  return (
    <div className="reglages-fins">
      <p className="aide">{t('Changer de mode ou de grain remet ces réglages à leurs valeurs.')}</p>
      {parametresDuMode(v.mode).map(p => {
        const defaut = defauts[p.id];
        const max = p.id === 'couleursMax' ? Math.max(1, Math.min(plafond, nCouleurs > 0 ? nCouleurs : plafond)) : p.max;
        const touche = fins[p.id] !== undefined;
        const valeur = fins[p.id] ?? defaut;
        if (max <= p.min) return null;
        return (
          <label key={p.id} className={'fin' + (touche ? ' touche' : '')} title={t(p.aide)}>
            <span className="fin-libelle">{t(p.libelle)}</span>
            <input type="range" min={p.min} max={max} step={p.pas} value={Math.min(valeur, max)} aria-label={t(p.libelle)}
              onChange={e => mettre(poserFin(v.fins, p.id, Number(e.target.value), defaut))} />
            <output>{arrondi(valeur)}{p.unite ?? ''}</output>
            <button type="button" className="icone-bouton petit" disabled={!touche} title={t('Revenir à la valeur du mode ({v})', { v: arrondi(defaut) })} aria-label={t('Revenir à la valeur du mode pour « {libelle} »', { libelle: t(p.libelle) })}
              onClick={() => mettre(retirerFin(v.fins, p.id))}><Icone nom="annuler" taille={12} /></button>
          </label>
        );
      })}
      <label className={'champ-ligne' + (fins.courbes ? ' touche' : '')} title={t('Courbes de Bézier lissées, ou polygone de segments droits (mode du traceur)')}>
        <span>{t('Courbes')}</span>
        <select value={fins.courbes ?? defauts.courbes} onChange={e => mettre(poserFin(v.fins, 'courbes', e.target.value === 'polygon' ? 'polygon' : 'spline', defauts.courbes))}>
          <option value="spline">{t('Lissées')}</option>
          <option value="polygon">{t('Segments droits')}</option>
        </select>
      </label>
      <label className={'champ-ligne' + (fins.empilement ? ' touche' : '')} title={t('Empilement du traceur (hiérarchie « stacked » ou « cutout »)')}>
        <span>{t('Formes')}</span>
        <select value={fins.empilement ?? defauts.empilement} onChange={e => mettre(poserFin(v.fins, 'empilement', e.target.value === 'cutout' ? 'cutout' : 'stacked', defauts.empilement))}>
          <option value="stacked">{t('Empilées (une couche sous l’autre)')}</option>
          <option value="cutout">{t('Découpées (des trous, sans recouvrement)')}</option>
        </select>
      </label>
      <button type="button" className="discret" disabled={!touches} onClick={() => mettre(undefined)}>{t('Revenir aux valeurs du mode')}</button>

    </div>
  );
}
