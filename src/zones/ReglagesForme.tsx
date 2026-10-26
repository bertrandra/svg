// Les reglages de la forme a tracer (ADR-0033), dans le panneau du dessin quand un outil de forme est choisi : le nombre de
// cotes, de branches, le creux, le rayon des coins, l'epaisseur de l'anneau, le sens de la fleche… Une donnee de la session :
// rien ne s'ecrit, et la forme posee ne garde pas ses reglages (un chemin ordinaire, ADR-0001). Ici, que des champs.

import { BORNES_FORMES, FICHES_FORMES, type ParametresFormes } from '../engine/editionSvg.js';
import { FORMES, nomOutilForme } from './aidesEditeur.js';
import { Nombre } from './commun/Nombre.js';
import { Section } from './commun/Section.js';
import { useActions, useInterface } from './contexteEditeur.js';
import { Icone } from './icones.js';
import type { OutilForme } from './typesEditeur.js';
import { t } from '../util/i18n.js';

// Une fonction, pas une constante : les noms se traduisent au rendu, quand le dictionnaire de la langue est pose (ADR-0042).
const nomsCotes = (): Readonly<Record<number, string>> => ({ 3: t('triangle'), 4: t('losange'), 5: t('pentagone'), 6: t('hexagone'), 8: t('octogone') });

/** Les entiers d'une borne, en options : « 6 (hexagone) ». */
const entiers = ([min, max]: readonly [number, number], noms: Readonly<Record<number, string>> = {}): ReadonlyArray<readonly [string, string]> =>
  Array.from({ length: max - min + 1 }, (_, i) => { const n = min + i, nom = noms[n]; return [String(n), nom ? t('{n} ({nom})', { n, nom }) : String(n)] as const; });

/** Un choix parmi quelques valeurs, en liste deroulante (le clavier et le doigt la connaissent). */
function Choix({ libelle, valeur, options, poser }: { libelle: string; valeur: string; options: ReadonlyArray<readonly [string, string]>; poser: (v: string) => void }) {
  return (
    <label className="champ-ligne">
      <span>{libelle}</span>
      <select value={valeur} onChange={e => poser(e.target.value)}>{options.map(([v, libelle]) => <option key={v} value={v}>{libelle}</option>)}</select>
    </label>
  );
}

/** Une part, de `min` a `max` %, en curseur ; la valeur se lit a cote, en chiffres tabulaires. */
function Part({ libelle, valeur, bornes, poser }: { libelle: string; valeur: number; bornes: readonly [number, number]; poser: (v: number) => void }) {
  const pc = Math.round(valeur * 100);
  return (
    <label className="champ-ligne reglage-part">
      <span>{libelle}</span>
      <input type="range" min={Math.round(bornes[0] * 100)} max={Math.round(bornes[1] * 100)} step={1} value={pc} aria-valuetext={t('{n} %', { n: pc })} onChange={e => poser(Number(e.target.value) / 100)} />
      <span className="aide valeur-part">{t('{n} %', { n: pc })}</span>
    </label>
  );
}

/** Les champs propres a une forme ; aucun pour une forme sans reglage. */
function Champs({ forme, p, poser }: { forme: OutilForme; p: ParametresFormes; poser: (r: Partial<ParametresFormes>) => void }) {
  switch (forme) {
    case 'rectangle-arrondi': return <Nombre libelle={t('Rayon des coins')} valeur={p.rayonCoins} min={0} poser={v => poser({ rayonCoins: v })} />;
    case 'triangle': return <Choix libelle={t('Angle')} valeur={p.triangle} options={[['isocele', t('Isocèle')], ['rectangle', t('Droit (triangle rectangle)')]]} poser={v => poser({ triangle: v === 'rectangle' ? 'rectangle' : 'isocele' })} />;
    case 'polygone': return <Choix libelle={t('Côtés')} valeur={String(p.cotes)} options={entiers(BORNES_FORMES.cotes, nomsCotes())} poser={v => poser({ cotes: Number(v) })} />;
    case 'etoile': return (
      <>
        <Choix libelle={t('Branches')} valeur={String(p.branches)} options={entiers(BORNES_FORMES.branches)} poser={v => poser({ branches: Number(v) })} />
        <Part libelle={t('Creux')} valeur={p.creux} bornes={BORNES_FORMES.creux} poser={v => poser({ creux: v })} />
      </>
    );
    case 'fleche': return (
      <>
        <Choix libelle={t('Pointe')} valeur={p.pointe} options={[['simple', t('Simple')], ['double', t('Double')]]} poser={v => poser({ pointe: v === 'double' ? 'double' : 'simple' })} />
        <Choix libelle={t('Sens')} valeur={p.sens} options={[['droite', t('Vers la droite')], ['gauche', t('Vers la gauche')], ['haut', t('Vers le haut')], ['bas', t('Vers le bas')]]}
          poser={v => poser({ sens: v === 'gauche' || v === 'haut' || v === 'bas' ? v : 'droite' })} />
      </>
    );
    case 'croix': return <Part libelle={t('Épaisseur des bras')} valeur={p.bras} bornes={BORNES_FORMES.bras} poser={v => poser({ bras: v })} />;
    case 'anneau': return <Part libelle={t('Épaisseur')} valeur={p.epaisseurAnneau} bornes={BORNES_FORMES.epaisseurAnneau} poser={v => poser({ epaisseurAnneau: v })} />;
    case 'demi-cercle': return <Choix libelle={t('Portion')} valeur={p.portion} options={[['demi', t('Demi-cercle')], ['quart', t('Quart de cercle')]]} poser={v => poser({ portion: v === 'quart' ? 'quart' : 'demi' })} />;
    case 'badge': return <Choix libelle={t('Festons')} valeur={String(p.festons)} options={entiers(BORNES_FORMES.festons)} poser={v => poser({ festons: Number(v) })} />;
    case 'spirale': return <Choix libelle={t('Tours')} valeur={String(p.tours)} options={entiers(BORNES_FORMES.tours)} poser={v => poser({ tours: Number(v) })} />;
    case 'vague': return <Choix libelle={t('Ondulations')} valeur={String(p.ondulations)} options={entiers(BORNES_FORMES.ondulations)} poser={v => poser({ ondulations: Number(v) })} />;
    default: return null;
  }
}

/** Ce que dit l'aide sous les reglages : ce que fait Maj, et ce qui distingue la forme. */
function aideDe(forme: OutilForme): string {
  if (forme === 'carre' || forme === 'cercle') return t('Ses côtés restent égaux, quel que soit le tracé.');
  if (forme === 'ligne') return t('Maj en traçant : à 45° près.');
  if (forme === 'rectangle-arrondi') return t('Le rayon, en unités du plan, s’arrête à la moitié du petit côté. Maj en traçant : un carré arrondi.');
  if (forme === 'anneau') return t('L’épaisseur est une part du rayon ; le trou reste vide à la découpe. Maj en traçant : un anneau rond.');
  if (FICHES_FORMES[forme].trait) return t('Un trait sans fond, à la couleur du contour. Maj en traçant : une boîte carrée.');
  return t('Maj en traçant : une boîte carrée, la forme sans étirement.');
}

/** La section « Forme à tracer » : le nom et l'icone de l'outil, ses reglages, et l'aide. Rien hors d'un outil de forme. */
export function ReglagesForme() {
  const { outil, parametres } = useInterface(), ac = useActions();
  if (!FORMES.has(outil)) return null;
  const forme = outil as OutilForme;
  return (
    <Section titre={t('Forme à tracer')} ouverte>

      <p className="forme-a-tracer"><Icone nom={forme} taille={20} /><span>{nomOutilForme(forme)}</span></p>
      <Champs forme={forme} p={parametres} poser={ac.poserParametres} />
      <p className="aide">{aideDe(forme)}</p>
    </Section>
  );
}
