// Les palettes, pour recolorer en masse (ADR-0004) : une palette d'evenement ou la sienne, posee sur les couleurs du
// dessin ; une seule couleur pour tout ; et le nuancier de la page comme palette.

import { useState } from 'react';
import { appliquerPalette, PALETTES, uneCouleur } from '../engine/palettes.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Section } from './commun/Section.js';
import { t } from '../util/i18n.js';

const estHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

export function PanneauPalettes() {
  const mo = useDessin(), ac = useActions(), ui = useInterface();
  const [choix, poserChoix] = useState(PALETTES[0]?.id ?? '');
  const [propre, poserPropre] = useState('#c81e28 #1428a0 #15181d');
  const couleurs = propre.split(/[\s,;]+/).filter(estHex).map(c => c.toLowerCase());
  const nuancier = mo.nuancier.map(te => te.hex);
  const appliquer = (palette: readonly string[], texte: string) => { if (palette.length) ac.faire(d => appliquerPalette(d, palette), texte); };
  return (
    <Section titre={t('Palettes')}>
      <label className="champ-ligne">
        <span>{t('Palette')}</span>
        <select value={choix} onChange={e => poserChoix(e.target.value)}>
          <optgroup label={t('Événements')}>{PALETTES.filter(p => p.evenement).map(p => <option key={p.id} value={p.id}>{t(p.nom)}</option>)}</optgroup>
          <optgroup label={t('Neutres')}>{PALETTES.filter(p => !p.evenement).map(p => <option key={p.id} value={p.id}>{t(p.nom)}</option>)}</optgroup>
        </select>
      </label>
      <div className="nuancier" aria-hidden="true">{(PALETTES.find(p => p.id === choix)?.couleurs ?? []).map(c => <span key={c} className="echantillon" style={{ background: c }} />)}</div>
      <div className="boutons">
        <button type="button" className="primaire" onClick={() => { const p = PALETTES.find(x => x.id === choix); if (p) appliquer(p.couleurs, t('Palette « {nom} » appliquée : la couleur la plus présente a pris la première.', { nom: t(p.nom) })); }}>{t('Appliquer la palette')}</button>
        {nuancier.length ? <button type="button" onClick={() => appliquer(nuancier, t('Nuancier appliqué au dessin.'))}>{t('Appliquer le nuancier')}</button> : null}
        <button type="button" onClick={() => ac.faire(d => uneCouleur(d, ui.style.remplissage ?? '#000000'), t('Tout le dessin d’une seule couleur.'))}>{t('Une couleur ({hex})', { hex: (ui.style.remplissage ?? '#000000').toUpperCase() })}</button>
      </div>
      <label className="champ-ligne">
        <span>{t('La mienne')}</span>
        <input type="text" value={propre} onChange={e => poserPropre(e.target.value)} placeholder="#rrggbb #rrggbb …" />
        <button type="button" className="discret" disabled={!couleurs.length} onClick={() => appliquer(couleurs, t('Palette appliquée.'))}>{t('OK')}</button>

      </label>
    </Section>
  );
}
