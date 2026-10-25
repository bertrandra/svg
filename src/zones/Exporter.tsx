// Les formats d'un dessin, au-dela du SVG qu'on telecharge d'un geste (ADR-0004 et suite ; la fin du parcours) : le PDF, le PNG,
// le JPEG, le WebP, l'EPS, le DXF, le SVG de decoupe, et le code a copier, chacun avec une ligne qui dit a quoi il sert, puis les
// options qu'ils se partagent (unite, taille, resolution, fond perdu, CMJN, precision). `ListeFormats` sert sous « Autres formats »
// dans l'editeur et sur la fiche de la page. Les options sont un etat de session, jamais stocke.
//
// Pourquoi une ligne par format : neuf boutons de meme poids (« EPS », « DXF », « WebP ») ne disaient rien a un debutant, qui ne
// savait pas lequel prendre. Le plus frequent (le SVG) n'est plus parmi eux : il a son bouton a lui.

import { useId, useState, type ReactNode } from 'react';
import { lireDessin, type DessinSvg } from '../engine/editionSvg.js';
import { LARGEURS_PNG, OPTIONS_EXPORT_DEFAUT, type OptionsExport } from '../export/options.js';
import { MenuDeroulant } from './commun/Menu.js';
import { copierSvg, exporterDecoupe, exporterDxf, exporterEps, exporterPdf, exporterPng, exporterRaster, exporterSvg, svgPropreDe, type ContexteExport } from './actionsExport.js';
import { OptionsExportPanneau } from './OptionsExport.js';

interface Proprietes {
  svg: string; dessin?: DessinSvg; nom: string; dire: (t: string) => void;
  /** Une ligne de plus en tete (l'export du contexte, ou le SVG quand le bouton principal est un autre format). */
  enTete?: ReactNode;
}

// Ce que la personne a regle survit a la fermeture du menu (qui demonte son contenu) le temps de la session ;
// rien n'est ecrit dans le navigateur.
const session = { options: OPTIONS_EXPORT_DEFAUT, largeurPng: 1024, couleurDecoupe: '#ff0000' };

/** Les options du moment (session) : le bouton principal « Télécharger le SVG » de la page les suit, comme le faisait « SVG ». */
export const optionsDeSession = (): OptionsExport => session.options;

/** Le contexte d'export d'un SVG donne (la page) ou d'un dessin deja lu (l'editeur), avec les reglages de la session. */
export function contexteExport(svg: string, dessin: DessinSvg | undefined, nom: string, dire: (t: string) => void, options = session.options): ContexteExport {
  const lu = dessin ?? (() => { const r = lireDessin(svg); return 'erreur' in r ? null : r.dessin; })();
  return { lu, svgPropre: svgPropreDe(lu, svg), nom, options, couleurDecoupe: session.couleurDecoupe, largeurPng: session.largeurPng, dire };
}

/** Une ligne de format : le bouton qui le fait, puis la phrase qui dit a quoi il sert (sa description pour un lecteur d'ecran). */
export function LigneFormat({ libelle, aide, desactive, onClick, children }: { libelle: string; aide: string; desactive?: boolean; onClick: () => void; children?: ReactNode }) {
  const id = useId();
  return (
    <div className="ligne-export">
      <span className="ligne-export-geste"><button type="button" disabled={desactive} aria-describedby={id} onClick={onClick}>{libelle}</button>{children}</span>
      <span id={id} className="aide">{aide}</span>
    </div>
  );
}

/** Les autres formats, une ligne chacun, puis les options d'export repliees. */
export function ListeFormats({ svg, dessin, nom, dire, enTete }: Proprietes) {
  const [options, poserOptions] = useState<OptionsExport>(session.options);
  const [largeurPng, poserLargeurPng] = useState(session.largeurPng);
  const [couleurDecoupe, poserCouleurDecoupe] = useState(session.couleurDecoupe);
  const poser = (p: Partial<OptionsExport>) => { const n = { ...options, ...p }; session.options = n; poserOptions(n); };
  const c: ContexteExport = { ...contexteExport(svg, dessin, nom, dire, options), couleurDecoupe, largeurPng };
  const vect = !c.lu;
  return (
    <div className="contenu-export" role="group" aria-label="Autres formats">
      {enTete}
      <LigneFormat libelle="PDF vectoriel" aide="un document à imprimer ou à envoyer, net à toute taille" desactive={vect} onClick={() => exporterPdf(c)} />
      <LigneFormat libelle="PNG" aide="une image pour un site ou un message, fond transparent" onClick={() => exporterPng(c)}>
        <select aria-label="Largeur du PNG" value={largeurPng} onChange={e => { session.largeurPng = Number(e.target.value); poserLargeurPng(Number(e.target.value)); }}>
          {LARGEURS_PNG.map(l => <option key={l} value={l}>{l} px</option>)}
        </select>
      </LigneFormat>
      <LigneFormat libelle="JPEG" aide="une image légère, sur un fond uni, même largeur" onClick={() => exporterRaster(c, 'image/jpeg')} />
      <LigneFormat libelle="WebP" aide="une image légère pour un site, fond transparent" onClick={() => exporterRaster(c, 'image/webp')} />
      <LigneFormat libelle="EPS" aide="pour un imprimeur ou un ancien logiciel de mise en page" desactive={vect} onClick={() => exporterEps(c)} />
      <LigneFormat libelle="DXF" aide="pour une découpeuse laser ou un logiciel de dessin technique" desactive={vect} onClick={() => exporterDxf(c)} />
      <LigneFormat libelle="SVG de découpe" aide="les contours seuls, en trait de 0,25 mm, pour une machine qui suit un trait" desactive={vect} onClick={() => exporterDecoupe(c)}>
        <input type="color" aria-label="Couleur du trait de découpe" value={couleurDecoupe} onChange={e => { session.couleurDecoupe = e.target.value; poserCouleurDecoupe(e.target.value); }} />
      </LigneFormat>
      <LigneFormat libelle="Copier le code SVG" aide="pour le coller dans une page web ou un autre outil" onClick={() => copierSvg(c)} />
      <OptionsExportPanneau o={options} poser={poser} dessin={c.lu} />
    </div>
  );
}

/** La ligne du SVG, quand le bouton principal fait autre chose (l'export d'une machine) : le dessin tel quel, pour tout logiciel. */
export function LigneSvg({ faire }: { faire: () => void }) {
  return <LigneFormat libelle="SVG" aide="le dessin tel quel, pour tout logiciel de dessin" onClick={faire} />;
}

/** « Télécharger le SVG » de la page : le SVG avec les options d'export du moment, comme le faisait le bouton « SVG » du menu. */
export function telechargerSvgPage(svg: string, nom: string, dire: (t: string) => void): void {
  exporterSvg(contexteExport(svg, undefined, nom, dire));
}

/** « Autres formats » de la fiche de la page : un menu dont le contenu est la liste des formats. */
export function MenuAutresFormats(p: Proprietes) {
  return <MenuDeroulant etiquette="Autres formats : PDF, PNG, JPEG, WebP, EPS, DXF, SVG de découpe, code" libelle="Autres formats" icone="exporter" enfants={<ListeFormats {...p} />} />;
}
