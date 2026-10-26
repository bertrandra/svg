// Les options d'export que partagent les formats (unite, taille, resolution, page, fond perdu, CMJN,
// precision…). Un etat de session : rien ne se stocke, et tout part neutre pour que chaque export rende ce
// qu'il rendait avant. Le panneau est une section repliee dans le menu d'export.

import { useState } from 'react';
import type { DessinSvg } from '../engine/editionSvg.js';
import { hauteurPour, UNITES, type Unite } from '../export/dimensions.js';
import { DPI_CHOIX, PAGES_EXPORT, PRECISIONS, lireNombre, tailleDe, type OptionsExport, type PageExport } from '../export/options.js';
import { Section } from './commun/Section.js';
import { nombre } from '../util/i18n.js';

const NOMS_UNITE: Readonly<Record<Unite, string>> = { mm: 'mm', in: 'pouce', px: 'px' };
const NOMS_PAGE: Readonly<Record<PageExport, string>> = { dessin: 'Taille du dessin', A4: 'A4', A3: 'A3', Letter: 'Letter', perso: 'Personnalisée' };
const QUALITES = [60, 75, 90, 100];

interface Proprietes { o: OptionsExport; poser: (p: Partial<OptionsExport>) => void; dessin: DessinSvg | null }

/** Un nombre tape : on garde le texte tel quel pendant la frappe, et on ne remonte que ce qui est une valeur permise. */
function ChampMesure({ libelle, aria, valeur, vide, min, max, poser, indice }: { libelle: string; aria: string; valeur: number | null; vide: number | null; min: number; max: number; poser: (v: number | null) => void; indice?: string }) {
  const [texte, poserTexte] = useState(valeur === null ? '' : String(valeur).replace('.', ','));
  const v = lireNombre(texte), invalide = texte.trim() !== '' && (v === null || v < min || v > max);
  return (
    <label className="champ-ligne">
      <span>{libelle}</span>
      <input type="text" inputMode="decimal" aria-label={aria} aria-invalid={invalide || undefined} placeholder={indice} value={texte}
        onChange={e => {
          poserTexte(e.target.value);
          const n = lireNombre(e.target.value);
          if (e.target.value.trim() === '') poser(vide);
          else if (n !== null && n >= min && n <= max) poser(n);
        }} />
    </label>
  );
}

const formater = (v: number) => nombre(v, 2);

export function OptionsExportPanneau({ o, poser, dessin }: Proprietes) {
  const taille = tailleDe(o);
  const hauteur = dessin && taille ? hauteurPour(dessin.vb, taille) : null;
  return (
    <Section titre="Options d’export" note="unité, taille, CMJN…">
      <div className="options-export">
        <label className="champ-ligne"><span>Unité</span>
          <select aria-label="Unité d’export" value={o.unite} onChange={e => poser({ unite: e.target.value as Unite })}>
            {UNITES.map(u => <option key={u} value={u}>{NOMS_UNITE[u]}</option>)}
          </select>
        </label>
        <ChampMesure libelle="Largeur" aria="Largeur du dessin exporté" valeur={o.largeur} vide={null} min={0.1} max={100000} indice="celle du dessin" poser={v => poser({ largeur: v })} />
        {hauteur !== null ? <p className="aide" aria-live="polite">Hauteur : {formater(hauteur)} {NOMS_UNITE[o.unite]}, selon les proportions du plan.</p> : <p className="aide">Vide : le dessin garde sa taille (un pixel fait 1/96 de pouce).</p>}
        <label className="champ-ligne"><span>Résolution</span>
          <select aria-label="Résolution du PNG" value={o.dpi ?? 0} onChange={e => poser({ dpi: Number(e.target.value) || null })}>
            <option value={0}>Aucune</option>
            {DPI_CHOIX.map(d => <option key={d} value={d}>{d} ppp</option>)}
          </select>
        </label>
        <p className="aide">Écrite dans le PNG ; avec une taille en mm ou en pouces, elle donne sa largeur en pixels.</p>

        <label className="champ-ligne"><span>Page PDF</span>
          <select aria-label="Format de page du PDF" value={o.page} onChange={e => poser({ page: e.target.value as PageExport })}>
            {PAGES_EXPORT.map(p => <option key={p} value={p}>{NOMS_PAGE[p]}</option>)}
          </select>
        </label>
        {o.page === 'perso' ? (
          <div className="grille-2">
            <ChampMesure libelle="L" aria="Largeur de la page, en mm" valeur={o.pageLargeur} vide={o.pageLargeur} min={10} max={5000} poser={v => poser({ pageLargeur: v ?? o.pageLargeur })} />
            <ChampMesure libelle="H" aria="Hauteur de la page, en mm" valeur={o.pageHauteur} vide={o.pageHauteur} min={10} max={5000} poser={v => poser({ pageHauteur: v ?? o.pageHauteur })} />
          </div>
        ) : null}
        <ChampMesure libelle="Marge" aria="Marge de la page, en mm" valeur={o.marge || null} vide={0} min={0} max={500} indice="0 mm" poser={v => poser({ marge: v ?? 0 })} />
        <div className="champ-ligne">
          <label className="case"><input type="checkbox" checked={o.fondPerdu} onChange={e => poser({ fondPerdu: e.target.checked })} /> Fond perdu et repères de coupe</label>
          {o.fondPerdu ? <ChampMesure libelle="mm" aria="Fond perdu, en mm" valeur={o.fondPerduMm} vide={o.fondPerduMm} min={0.5} max={50} poser={v => poser({ fondPerduMm: v ?? o.fondPerduMm })} /> : null}
        </div>
        <label className="case"><input type="checkbox" checked={o.cmjn} onChange={e => poser({ cmjn: e.target.checked })} /> Couleurs en CMJN (PDF et EPS)</label>
        {o.cmjn ? <p className="aide">Conversion naïve, sans profil ICC : une indication, pas une séparation. L’imprimeur vous donnera son profil.</p> : null}
        <ChampTexte libelle="Titre" aria="Titre du PDF et de l’EPS" valeur={o.titre} poser={t => poser({ titre: t })} />

        <label className="champ-ligne"><span>Précision</span>
          <select aria-label="Décimales des coordonnées du SVG" value={o.precision} onChange={e => poser({ precision: Number(e.target.value) })}>
            {PRECISIONS.map(p => <option key={p} value={p}>{p} décimale{p > 1 ? 's' : ''}{p === 3 ? ' (habituel)' : ''}</option>)}
          </select>
        </label>
        <label className="case"><input type="checkbox" checked={o.optimise} onChange={e => poser({ optimise: e.target.checked })} /> SVG optimisé (formes regroupées, chemins compacts)</label>

        <label className="champ-ligne"><span>Fond JPEG</span>
          <input type="color" aria-label="Fond du JPEG" value={o.fond} onChange={e => poser({ fond: e.target.value })} />
        </label>
        <label className="champ-ligne"><span>Qualité</span>
          <select aria-label="Qualité du JPEG et du WebP" value={o.qualite} onChange={e => poser({ qualite: Number(e.target.value) })}>
            {QUALITES.map(q => <option key={q} value={q}>{q} %</option>)}
          </select>
        </label>
      </div>
    </Section>
  );
}

function ChampTexte({ libelle, aria, valeur, poser }: { libelle: string; aria: string; valeur: string; poser: (t: string) => void }) {
  return <label className="champ-ligne"><span>{libelle}</span><input type="text" aria-label={aria} maxLength={120} value={valeur} onChange={e => poser(e.target.value)} /></label>;
}
