// Largeur variable (ADR-0038) : le trait des formes choisies devient une surface dont la largeur suit un profil (debut, milieu,
// fin). Une conversion, comme « Contour en forme » (ADR-0015), que Ctrl+Z defait : le modele a plat ne garde pas de profil de
// largeur sur un trait (ce sera le modele v2). Le calcul est pur (engine/contour/largeur.ts).

import { useId, useState } from 'react';
import { largeurVariable } from '../engine/contours.js';
import { useActions, useDessin } from './contexteEditeur.js';
import { arrondi } from './aidesEditeur.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';

const nombre = (t: string): number => (t.trim() === '' ? Number.NaN : Number(t.replace(',', '.')));

export function LargeurVariable() {
  const mo = useDessin(), ac = useActions(), titre = useId();
  const choisies = mo.dessin.formes.filter(f => mo.choisies.has(f.id));
  const avecTrait = choisies.filter(f => f.contour !== null && f.epaisseur > 0);
  // Le profil propose : un trait qui part fin, s'epaissit au milieu (trois fois l'epaisseur) et finit fin, comme un coup de pinceau.
  const e = avecTrait[0]?.epaisseur ?? 1;
  const [debut, poserDebut] = useState(String(arrondi(e / 2)));
  const [milieu, poserMilieu] = useState(String(arrondi(e * 3)));
  const [fin, poserFin] = useState(String(arrondi(e / 2)));
  const appliquer = () => {
    const r = largeurVariable(mo.dessin, mo.sel, { debut: nombre(debut), milieu: nombre(milieu), fin: nombre(fin) });
    if (!r.elargis) { ac.dire(r.erreur ?? t('Aucun contour à élargir.')); return; }
    ac.appliquer(() => r.dessin);
    ac.choisir([...r.ids]);
    const traits = pluriel(r.elargis, 'trait'), formes = pluriel(r.ignorees, 'forme');
    const faits = r.elargis > 1 ? t('{traits} devenus des surfaces de largeur variable', { traits }) : t('{traits} devenu une surface de largeur variable', { traits });
    const laissees = r.ignorees ? (r.ignorees > 1 ? t(' ; {formes} sans contour laissées telles', { formes }) : t(' ; {formes} sans contour laissée telle', { formes })) : '';
    ac.dire(faits + laissees + '.');
  };
  const champ = (libelle: string, valeur: string, poser: (t: string) => void) => (
    <label className="champ-ligne nombre">
      <span>{libelle}</span>
      <input type="text" inputMode="decimal" value={valeur} onChange={ev => poser(ev.target.value)} onKeyDown={ev => { if (ev.key === 'Enter') appliquer(); }} />
    </label>
  );
  return (
    // Un groupe nomme, sans cadre : l'inspecteur se range en sections, pas en boites (ADR-0006).
    <div className="outil-trace largeur-variable" role="group" aria-labelledby={titre}>
      <span className="peinture-titre" id={titre}>{t('Largeur variable du trait')}</span>
      <div className="grille-3">
        {champ(t('Début'), debut, poserDebut)}
        {champ(t('Milieu'), milieu, poserMilieu)}
        {champ(t('Fin'), fin, poserFin)}
      </div>
      <button type="button" className="discret" disabled={!avecTrait.length} title={t('Le trait devient une surface pleine qui suit ces largeurs, de son début à sa fin')} onClick={appliquer}>{t('Élargir le trait')}</button>

    </div>
  );
}
