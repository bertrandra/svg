// Le tapis dans le panneau « Prêt pour Cricut » (ADR-0039) : le recalage automatique, la feuille posee sur le tapis, et le chemin vers
// « Dupliquer sur la feuille ». Le recalage et la feuille sont des reglages de production : hors de l'historique, gardes dans le
// document par la marque `data-ed-*` (seulement hors du defaut), jamais dans un export. Depuis la revision du 26 octobre 2026, la case
// est decochee par defaut : le tapis est fixe des le depart, et la cocher revient au recalage sur le coin haut gauche du dessin.

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { depuisUnite, feuillePartielle, operationsApplicables, versUnite, type ProfilProduction } from '../engine/preparation.js';
import { NOMS_UNITE } from '../model/contextes.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { useActionsRegles } from './contexteRegles.js';
import { arrondi } from './aidesEditeur.js';
import { TITRE_FEUILLE } from './PanneauFeuille.js';

type Cote = 'x' | 'y' | 'l' | 'h';
const COTES: ReadonlyArray<readonly [Cote, string, string]> = [
  ['l', 'Largeur', 'La largeur de la feuille'], ['h', 'Hauteur', 'La hauteur de la feuille'],
  ['x', 'Depuis la gauche', 'La distance du bord gauche du tapis au bord gauche de la feuille'], ['y', 'Depuis le haut', 'La distance du bord haut du tapis au bord haut de la feuille']
];

/** L'objet sans l'une de ses cles : un reglage revenu a son defaut ne s'ecrit plus (exactOptionalPropertyTypes). */
const sans = <T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> => Object.fromEntries(Object.entries(o).filter(([n]) => n !== k)) as Omit<T, K>;

const textes = (p: ProfilProduction): Record<Cote, string> => ({
  x: String(arrondi(versUnite(p.feuille.x, p.unite))), y: String(arrondi(versUnite(p.feuille.y, p.unite))),
  l: String(arrondi(versUnite(p.feuille.l, p.unite))), h: String(arrondi(versUnite(p.feuille.h, p.unite)))
});

/**
 * L'aide de la case : les deux comportements, quel que soit l'etat (on sait ce que cocher changerait avant de le faire), le defaut
 * d'abord.
 */
export const AIDE_RECALAGE = 'Décochée (par défaut), le plan de travail est le tapis : les formes restent où vous les posez, et l’export garde leur place, pour une feuille posée n’importe où sur le tapis. '
  + 'Cochée, le tapis suit le dessin : Design Space posera les formes dans le coin haut gauche du tapis.';

export function ReglagesTapis() {
  const { production, profil } = useInterface(), { sel } = useDessin(), ac = useActions(), arg = useActionsRegles(), id = useId();
  const [saisie, poserSaisie] = useState<Record<Cote, string> | null>(null);
  // Les champs suivent la feuille du profil (un autre tapis la ramene dessus) tant qu'on ne tape pas.
  useEffect(() => { poserSaisie(null); }, [profil]);
  if (!profil || production.contexte !== 'cricut' || !operationsApplicables(profil.procede)) return null;
  const valeurs = saisie ?? textes(profil), u = NOMS_UNITE[profil.unite];
  const valider = () => {
    if (!saisie) return;
    const lu = (c: Cote): number => { const v = Number(saisie[c].trim().replace(',', '.')); return saisie[c].trim() !== '' && Number.isFinite(v) ? depuisUnite(v, profil.unite) : profil.feuille[c]; };
    ac.poserProduction({ ...production, feuille: { x: lu('x'), y: lu('y'), l: lu('l'), h: lu('h') } });
    poserSaisie(null);
  };
  const touche = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); valider(); } };
  const toutLeTapis = () => { ac.poserProduction(sans(production, 'feuille')); poserSaisie(null); };
  const basculerRecalage = (actif: boolean) => ac.poserProduction(actif ? { ...production, recalage: true } : sans(production, 'recalage'));
  return (
    <div className="reglages-tapis">
      <label className="case">
        <input type="checkbox" checked={profil.recalage} aria-describedby={id + '-recalage'} onChange={e => basculerRecalage(e.target.checked)} /> Recalage automatique
      </label>
      <p className="aide" id={id + '-recalage'}>{AIDE_RECALAGE}</p>
      <fieldset className="champ-groupe feuille-tapis">
        <legend>Feuille sur le tapis</legend>
        <div className="champs-feuille">
          {COTES.map(([c, nom, aide]) => (
            <label key={c} className="champ-ligne nombre" title={aide}>
              <span>{nom}</span>
              <input type="text" inputMode="decimal" value={valeurs[c]} onChange={e => poserSaisie({ ...valeurs, [c]: e.target.value })} onBlur={valider} onKeyDown={touche} />
              <span className="unite">{u}</span>
            </label>
          ))}
        </div>
        <div className="boutons">
          <button type="button" disabled={!feuillePartielle(profil)} onClick={toutLeTapis}>Tapis entier</button>
          <button type="button" disabled={!sel.length} title={sel.length ? undefined : 'Choisissez d’abord une forme'} onClick={() => arg.ouvrir('feuille')}>{TITRE_FEUILLE}…</button>
        </div>
      </fieldset>
    </div>
  );
}
