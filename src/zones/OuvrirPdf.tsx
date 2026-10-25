// Ouvrir un PDF depuis l'accueil (ADR-0020) : ses traces vectoriels deviennent les formes d'un SVG, qui suit ensuite la voie
// d'un SVG ouvert (nettoyage, lecture, editeur). Un PDF d'une page s'ouvre aussitot ; un PDF de plusieurs pages propose de
// choisir la page, la premiere choisie d'avance (« Page 1 sur 4 »), et le choix reste la pour en ouvrir une autre ensuite.
// Ce que la lecture n'a pas repris (texte, images, degrades…) suit le dessin jusqu'a l'editeur, dit comme pour un SVG.

import { useEffect, useRef, useState } from 'react';
import { fichierPdf, ouvrirPdf } from '../io/pdf.js';

/** Ouvrir un SVG dans l'editeur, avec ce que la lecture du document d'origine n'a pas repris. */
export type OuvrirDessin = (nom: string, svg: string, ignores?: readonly string[]) => void;

interface PdfChoisi { readonly nom: string; readonly octets: Uint8Array; readonly pages: number; readonly page: number }

/** Au-dela, une liste de pages serait interminable : un champ numerique la remplace. */
const PAGES_EN_LISTE = 500;

/** Le nom du dessin tire d'une page : celui du fichier, et le numero de page quand il y en a plusieurs. */
export const nomDePage = (fichier: string, page: number, pages: number): string => {
  const base = fichier.replace(/\.pdf$/i, '').trim() || 'document';
  return pages > 1 ? base + '-page-' + page : base;
};

export { fichierPdf };

/** L'ouverture d'un PDF : lire un fichier, et le choix de page quand il en compte plusieurs. */
export function usePdf(ouvrir: OuvrirDessin, dire: (message: string) => void) {
  const [choix, poserChoix] = useState<PdfChoisi | null>(null);
  const [lecture, poserLecture] = useState(false);

  const lirePage = async (pdf: Omit<PdfChoisi, 'pages' | 'page'>, page: number, premiere: boolean): Promise<void> => {
    poserLecture(true);
    dire('Lecture de « ' + pdf.nom + ' »…');
    const r = await ouvrirPdf(pdf.octets, page);
    poserLecture(false);
    const pages = 'erreur' in r ? r.pages ?? 0 : r.pages;
    // Plusieurs pages a la premiere lecture : on propose de choisir, sans rien ouvrir (la premiere est choisie d'avance).
    if (premiere && pages > 1) {
      poserChoix({ ...pdf, pages, page: 1 });
      dire('« ' + pdf.nom + ' » compte ' + pages.toLocaleString('fr-FR') + ' pages : choisissez celle à ouvrir.');
      return;
    }
    if (pages <= 1) poserChoix(null);
    if ('erreur' in r) { dire(r.erreur); return; }
    ouvrir(nomDePage(pdf.nom, r.page, r.pages), r.svg, r.ignores);
  };

  return {
    choix,
    lecture,
    /** Lit un fichier PDF choisi ou depose. */
    ouvrirFichier(f: File): void {
      void f.arrayBuffer()
        .then(b => lirePage({ nom: f.name, octets: new Uint8Array(b) }, 1, true))
        .catch(() => { poserLecture(false); dire('Ce fichier ne se lit pas : le navigateur n’a pas pu l’ouvrir.'); });
    },
    /** Lit les octets d'un PDF deja recus (ouvert depuis une adresse, ADR-0036) : la meme lecture qu'un fichier. */
    ouvrirOctets(nom: string, octets: Uint8Array): void {
      void lirePage({ nom, octets }, 1, true).catch(() => { poserLecture(false); dire('Ce PDF ne se lit pas.'); });
    },
    choisir(page: number): void { if (choix) poserChoix({ ...choix, page }); },
    ouvrirChoix(): void { if (choix) void lirePage(choix, choix.page, false); },
    annuler(): void { poserChoix(null); dire(''); }
  };
}

/** Le choix de la page d'un PDF de plusieurs pages : une liste « Page 1 sur 4 », et l'action qui l'ouvre. */
export function ChoixPagePdf({ pdf }: { pdf: ReturnType<typeof usePdf> }) {
  const champ = useRef<HTMLSelectElement & HTMLInputElement>(null);
  const { choix } = pdf;
  // Le choix apparait apres un fichier choisi au clavier : le focus y va, pour que la suite se fasse sans souris.
  const fichier = choix?.octets;
  useEffect(() => { if (fichier) champ.current?.focus(); }, [fichier]);
  if (!choix) return null;
  const { pages, page, nom } = choix;
  return (
    <section className="reprise choix-page" aria-label="Page du PDF à ouvrir" aria-busy={pdf.lecture}>
      <p><strong className="nom-fichier">{nom}</strong> compte {pages.toLocaleString('fr-FR')} pages.</p>
      <label className="champ-ligne">
        <span>Page</span>
        {pages <= PAGES_EN_LISTE ? (
          <select ref={champ} value={page} onChange={e => pdf.choisir(Number(e.target.value))}>
            {Array.from({ length: pages }, (_, i) => <option key={i} value={i + 1}>{'Page ' + (i + 1) + ' sur ' + pages}</option>)}
          </select>
        ) : (
          <input ref={champ} type="number" min={1} max={pages} step={1} value={page} aria-describedby="choix-page-total"
            onChange={e => { const v = Math.round(Number(e.target.value)); if (v >= 1 && v <= pages) pdf.choisir(v); }} />
        )}
        {pages > PAGES_EN_LISTE ? <span id="choix-page-total">sur {pages.toLocaleString('fr-FR')}</span> : null}
      </label>
      <div className="actions">
        <button type="button" className="primaire" disabled={pdf.lecture} onClick={pdf.ouvrirChoix}>Ouvrir la page</button>
        <button type="button" className="discret" onClick={pdf.annuler}>Annuler</button>
      </div>
    </section>
  );
}
