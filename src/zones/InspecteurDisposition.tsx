// La disposition d'un texte dans le panneau Texte (ADR-0031) : libre, sur la forme ou dans la forme, et tous ses reglages. La barre
// de texte porte le frequent (la disposition, l'alignement) ; ici, le reste : la forme qui porte le texte (la montrer ou la masquer,
// en changer), le depart et le cote sur un trace, la repartition des lettres ; dans une forme, la facon de la remplir (en deformant
// les lettres, ADR-0032, ou en lignes), la marge, et la taille ajustee des lignes. Chaque reglage est une entree d'historique ; ce qui
// ne tient pas se dit ici et dans la region vocale.

import { useId } from 'react';
import type { Forme, TexteVivant } from '../engine/editionSvg.js';
import { traceFerme } from '../engine/texte/surTrace.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { useSaisie } from './contexteSaisie.js';
import { useDisposition } from './actionsDisposition.js';
import { ChoixDispositionPanneau } from './ChoixDisposition.js';
import { useDepassement } from './DispositionToile.js';
import { Nombre } from './commun/Nombre.js';
import { LIBELLES_REMPLIR, nomCourt, phraseChoixForme, type ModeRemplir } from './phrasesDisposition.js';
import { useTactile } from './Vue.js';
import { t } from '../util/i18n.js';

export function ReglagesDisposition({ forme }: { forme: Forme & { texte: TexteVivant } }) {
  const mo = useDessin(), ac = useActions(), sx = useSaisie(), dz = useDisposition(), tactile = useTactile();
  const depassement = useDepassement(forme), idDepassement = useId(), idRemplir = useId();
  const p = forme.texte.disposition;
  const base = p ? mo.dessin.formes.find(f => f.id === p.forme) : undefined;
  const changerDeForme = () => {
    if (!p) return;
    sx.poserChoixForme({ id: forme.id, mode: p.mode });
    ac.dire(phraseChoixForme(p.mode, tactile));
  };
  const ferme = base ? traceFerme(base) : true;
  return (
    <fieldset className="editeur-groupe disposition-texte">
      <legend>{t('Disposition')}</legend>
      <ChoixDispositionPanneau forme={forme} />
      {!p || !base ? (
        <p className="aide">{t('Le texte suit sa ligne droite. « Sur la forme » le pose le long d’un tracé, « Dans la forme » le déforme pour qu’il prenne la silhouette d’une forme fermée : cliquez ensuite la forme, ou choisissez-la au clavier (Tab, puis Entrée).')}</p>
      ) : (
        <>
          <p className="aide">{p.mode === 'sur' ? t('Sur {forme}{etat}. Modifier la forme recompose le texte ; la supprimer le rend libre.', { forme: nomCourt(base), etat: base.visible ? '' : t(' (masquée)') }) : t('Dans {forme}{etat}. Modifier la forme recompose le texte ; la supprimer le rend libre.', { forme: nomCourt(base), etat: base.visible ? '' : t(' (masquée)') })}</p>

          <div className="boutons">
            <label className="case"><input type="checkbox" checked={base.visible} disabled={base.verrouille} onChange={e => dz.montrerForme(forme.id, e.target.checked)} /> {t('Montrer la forme de base')}</label>
            <button type="button" className="discret" disabled={forme.verrouille} onClick={changerDeForme}>{t('Changer de forme')}</button>
          </div>
          {p.mode === 'sur' ? (
            <>
              <div className="grille-2">
                <Nombre libelle={t('Départ (%)')} valeur={Math.round(p.depart * 1000) / 10} min={0} max={100} desactive={forme.verrouille || p.repartir && !ferme}
                  poser={v => dz.regler(forme.id, { depart: ferme ? (v >= 100 ? 0 : v / 100) : Math.min(1, v / 100) })} />
              </div>
              <div className="alignement-texte" role="group" aria-label={ferme ? t('Côté de la forme') : t('Côté du tracé')}>
                {(['dessus', 'dessous'] as const).map(c => (
                  <button key={c} type="button" aria-pressed={p.cote === c} disabled={forme.verrouille} onClick={() => dz.regler(forme.id, { cote: c })}>
                    {ferme ? (c === 'dessus' ? t('Extérieur') : t('Intérieur')) : c === 'dessus' ? t('Dessus') : t('Dessous')}
                  </button>
                ))}
              </div>
              <label className="case"><input type="checkbox" checked={p.repartir} disabled={forme.verrouille} onChange={e => dz.regler(forme.id, { repartir: e.target.checked })} /> {t('Répartir les lettres sur tout le tracé')}</label>
            </>
          ) : (
            <>
              {/* Remplir la forme (ADR-0032) : deux boutons a etat, jamais pleins ; un texte deja en lignes le reste. */}
              <div className="alignement-texte choix-remplir" role="group" aria-labelledby={idRemplir}>
                <span id={idRemplir} className="choix-remplir-titre">{t('Remplir')}</span>
                {(['enveloppe', 'dans'] as const satisfies readonly ModeRemplir[]).map(m => (
                  <button key={m} type="button" aria-pressed={p.mode === m} disabled={forme.verrouille} onClick={() => { if (p.mode !== m) dz.poser(forme.id, base.id, m); }}>{LIBELLES_REMPLIR[m]}</button>
                ))}
              </div>
              <div className="grille-2">
                <Nombre libelle={t('Marge')} valeur={Math.round(p.marge * forme.texte.taille * 100) / 100} min={0} desactive={forme.verrouille}
                  poser={v => dz.regler(forme.id, { marge: Math.round((v / forme.texte.taille) * 10000) / 10000 })} />
              </div>
              {p.mode === 'dans' ? (
                <label className="case"><input type="checkbox" checked={p.ajuster} disabled={forme.verrouille} onChange={e => dz.regler(forme.id, { ajuster: e.target.checked })} /> {t('Ajuster la taille pour remplir la forme')}</label>
              ) : (
                <p className="aide">{t('Les lettres s’étirent et se courbent jusqu’au bord de la forme ; la taille se calcule d’après elle.')}</p>

              )}
            </>
          )}
          {depassement ? <p id={idDepassement} className="message">{depassement}</p> : null}
        </>
      )}
    </fieldset>
  );
}
