// Recolorer en masse (ADR-0004) : une palette d'evenement ou la sienne, posee sur les couleurs du
// dessin ; une seule couleur pour tout ; et le nuancier de la page comme palette.

import { useState } from 'react';
import { appliquerPalette, PALETTES, uneCouleur } from '../engine/palettes.js';
import type { Edition } from './EditeurSvg.js';
import { Section } from './commun/Section.js';

const estHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

export function PanneauPalettes({ ed }: { ed: Edition }) {
  const [choix, poserChoix] = useState(PALETTES[0]?.id ?? '');
  const [propre, poserPropre] = useState('#c81e28 #1428a0 #15181d');
  const couleurs = propre.split(/[\s,;]+/).filter(estHex).map(c => c.toLowerCase());
  const nuancier = ed.nuancier.map(t => t.hex);
  const appliquer = (palette: readonly string[], texte: string) => { if (palette.length) ed.faire(d => appliquerPalette(d, palette), texte); };
  return (
    <Section titre="Recolorer">
      <label className="champ-ligne">
        <span>Palette</span>
        <select value={choix} onChange={e => poserChoix(e.target.value)}>
          <optgroup label="Événements">{PALETTES.filter(p => p.evenement).map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup>
          <optgroup label="Neutres">{PALETTES.filter(p => !p.evenement).map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</optgroup>
        </select>
      </label>
      <div className="nuancier" aria-hidden="true">{(PALETTES.find(p => p.id === choix)?.couleurs ?? []).map(c => <span key={c} className="echantillon" style={{ background: c }} />)}</div>
      <div className="boutons">
        <button type="button" className="primaire" onClick={() => { const p = PALETTES.find(x => x.id === choix); if (p) appliquer(p.couleurs, 'Palette « ' + p.nom + ' » appliquée : la couleur la plus présente a pris la première.'); }}>Appliquer la palette</button>
        {nuancier.length ? <button type="button" onClick={() => appliquer(nuancier, 'Nuancier appliqué au dessin.')}>Appliquer le nuancier</button> : null}
        <button type="button" onClick={() => ed.faire(d => uneCouleur(d, ed.style.remplissage ?? '#000000'), 'Tout le dessin d’une seule couleur.')}>Une couleur ({(ed.style.remplissage ?? '#000000').toUpperCase()})</button>
      </div>
      <label className="champ-ligne">
        <span>La mienne</span>
        <input type="text" value={propre} onChange={e => poserPropre(e.target.value)} placeholder="#rrggbb #rrggbb …" />
        <button type="button" className="discret" disabled={!couleurs.length} onClick={() => appliquer(couleurs, 'Palette appliquée.')}>OK</button>
      </label>
    </Section>
  );
}
