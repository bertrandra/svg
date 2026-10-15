// Le menu d'export (ADR-0004) : le SVG tel quel, le SVG de decoupe (contours seuls), un PNG a la
// largeur voulue, un PDF vectoriel. Le meme menu sert dans la barre de l'editeur et dans la page.

import { useState } from 'react';
import { ecrireDessin, lireDessin, type DessinSvg } from '../engine/editionSvg.js';
import { ecrirePdf } from '../export/pdf.js';
import { svgDecoupe } from '../export/svgs.js';
import { copier, proposer, texteOctets } from '../io/fichiers.js';
import { versPng } from '../io/image.js';
import { Icone } from './icones.js';

const LARGEURS = [512, 1024, 2048, 4096];

/** Le menu, replie sur un bouton. `dessin` est lu depuis `svg` s'il n'est pas donne. */
export function MenuExport({ svg, dessin, nom, dire, compact = false }: { svg: string; dessin?: DessinSvg; nom: string; dire: (t: string) => void; compact?: boolean }) {
  const [largeur, poserLargeur] = useState(1024);
  const [couleurDecoupe, poserCouleurDecoupe] = useState('#ff0000');
  const lu = dessin ?? (() => { const r = lireDessin(svg); return 'erreur' in r ? null : r.dessin; })();
  const svgPropre = lu ? ecrireDessin(lu, 3) : svg;
  const proposerEt = (fichier: string, donnees: Uint8Array | Blob) => { void proposer(fichier, donnees).then(dire); };
  return (
    <details className={'menu-export' + (compact ? ' compact' : '')}>
      <summary className={compact ? 'icone-bouton' : undefined} title="Exporter" aria-label="Exporter">{compact ? <Icone nom="exporter" /> : <><Icone nom="exporter" /> Exporter</>}</summary>
      <div className="contenu-export" role="group" aria-label="Formats d’export">
        <button type="button" onClick={() => proposerEt(nom + '.svg', texteOctets(svgPropre))}>SVG</button>
        <button type="button" onClick={() => { void copier(svgPropre).then(ok => dire(ok ? 'Code SVG copié.' : 'La page n’a pas le droit d’écrire dans le presse-papiers.')); }}>Copier le code SVG</button>
        <div className="ligne-export">
          <button type="button" disabled={!lu} onClick={() => { if (lu) proposerEt(nom + '-decoupe.svg', texteOctets(svgDecoupe(lu, couleurDecoupe))); }}>SVG de découpe</button>
          <input type="color" aria-label="Couleur du trait de découpe" value={couleurDecoupe} onChange={e => poserCouleurDecoupe(e.target.value)} />
          <span className="aide">contours seuls, 0,25 mm</span>
        </div>
        <div className="ligne-export">
          <button type="button" onClick={() => { versPng(svgPropre, largeur).then(b => proposerEt(nom + '-' + largeur + '.png', b)).catch(() => dire('Le rendu PNG a échoué.')); }}>PNG</button>
          <select aria-label="Largeur du PNG" value={largeur} onChange={e => poserLargeur(Number(e.target.value))}>
            {LARGEURS.map(l => <option key={l} value={l}>{l} px</option>)}
          </select>
          <span className="aide">fond transparent</span>
        </div>
        <button type="button" disabled={!lu} onClick={() => { if (lu) proposerEt(nom + '.pdf', new Blob([ecrirePdf(lu) as BlobPart], { type: 'application/pdf' })); }}>PDF vectoriel</button>
      </div>
    </details>
  );
}
