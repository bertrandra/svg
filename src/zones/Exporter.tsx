// Les formats d'export (ADR-0004 et suite) : en vectoriel le SVG, le SVG de decoupe, le PDF, l'EPS et le DXF ;
// en image le PNG, le JPEG et le WebP ; et un petit panneau d'options qu'ils se partagent (unite, taille,
// resolution, fond perdu, CMJN, precision). `ContenuExport` sert dans le menu Fichier de l'editeur ;
// `MenuExport` en fait un menu a part pour la page. Les options sont un etat de session, jamais stocke.

import { useState } from 'react';
import { lireDessin, type DessinSvg } from '../engine/editionSvg.js';
import { LARGEURS_PNG, OPTIONS_EXPORT_DEFAUT, type OptionsExport } from '../export/options.js';
import { MenuDeroulant } from './commun/Menu.js';
import { copierSvg, exporterDecoupe, exporterDxf, exporterEps, exporterPdf, exporterPng, exporterRaster, exporterSvg, svgPropreDe, type ContexteExport } from './actionsExport.js';
import { OptionsExportPanneau } from './OptionsExport.js';

interface Proprietes {
  svg: string; dessin?: DessinSvg; nom: string; dire: (t: string) => void;
  /** En contexte Cricut (ADR-0013) : l'export pour la machine, seule action primaire de ce panneau. */
  pourCricut?: () => void;
}

// Ce que la personne a regle survit a la fermeture du menu (qui demonte son contenu) le temps de la session ;
// rien n'est ecrit dans le navigateur.
const session = { options: OPTIONS_EXPORT_DEFAUT, largeurPng: 1024, couleurDecoupe: '#ff0000' };

/** Les boutons d'export, sans cadre : a poser dans un menu ou dans une section. */
export function ContenuExport({ svg, dessin, nom, dire, pourCricut }: Proprietes) {
  const [options, poserOptions] = useState<OptionsExport>(session.options);
  const [largeurPng, poserLargeurPng] = useState(session.largeurPng);
  const [couleurDecoupe, poserCouleurDecoupe] = useState(session.couleurDecoupe);
  const lu = dessin ?? (() => { const r = lireDessin(svg); return 'erreur' in r ? null : r.dessin; })();
  const poser = (p: Partial<OptionsExport>) => { const n = { ...options, ...p }; session.options = n; poserOptions(n); };
  const c: ContexteExport = { lu, svgPropre: svgPropreDe(lu, svg), nom, options, couleurDecoupe, largeurPng, dire };
  return (
    <div className="contenu-export" role="group" aria-label="Formats d’export">
      {pourCricut ? (
        <>
          <p className="menu-titre">Cricut</p>
          <div className="ligne-export">
            <button type="button" className="primaire" onClick={pourCricut}>Exporter pour Cricut</button>
            <span className="aide">taille physique, fonds pleins, une couleur par tapis</span>
          </div>
        </>
      ) : null}
      <p className="menu-titre">Vectoriel</p>
      <div className="ligne-export">
        <button type="button" onClick={() => exporterSvg(c)}>SVG</button>
        <button type="button" onClick={() => copierSvg(c)}>Copier le code SVG</button>
      </div>
      <div className="ligne-export">
        <button type="button" disabled={!lu} onClick={() => exporterDecoupe(c)}>SVG de découpe</button>
        <input type="color" aria-label="Couleur du trait de découpe" value={couleurDecoupe} onChange={e => { session.couleurDecoupe = e.target.value; poserCouleurDecoupe(e.target.value); }} />
        <span className="aide">contours seuls, 0,25 mm</span>
      </div>
      <div className="ligne-export">
        <button type="button" disabled={!lu} onClick={() => exporterPdf(c)}>PDF vectoriel</button>
        <button type="button" disabled={!lu} onClick={() => exporterEps(c)}>EPS</button>
        <button type="button" disabled={!lu} onClick={() => exporterDxf(c)}>DXF</button>
      </div>
      <p className="menu-titre">Image</p>
      <div className="ligne-export">
        <button type="button" onClick={() => exporterPng(c)}>PNG</button>
        <select aria-label="Largeur du PNG" value={largeurPng} onChange={e => { session.largeurPng = Number(e.target.value); poserLargeurPng(Number(e.target.value)); }}>
          {LARGEURS_PNG.map(l => <option key={l} value={l}>{l} px</option>)}
        </select>
        <span className="aide">fond transparent</span>
      </div>
      <div className="ligne-export">
        <button type="button" onClick={() => exporterRaster(c, 'image/jpeg')}>JPEG</button>
        <button type="button" onClick={() => exporterRaster(c, 'image/webp')}>WebP</button>
        <span className="aide">même largeur</span>
      </div>
      <OptionsExportPanneau o={options} poser={poser} dessin={lu} />
    </div>
  );
}

/** Le menu d'export de la page. */
export function MenuExport(p: Proprietes) {
  return <MenuDeroulant etiquette="Exporter" libelle="Exporter" icone="exporter" enfants={<ContenuExport {...p} />} />;
}
