// La saisie en place d'un texte vivant (ADR-0021) : double-clic ou Entree sur un texte ouvre un champ sous lui, sur la
// toile. On tape, le texte se recompose sous les yeux ; Entree valide, Maj+Entree va a la ligne, Echap rend le texte
// d'avant. Toute la frappe est un seul geste de l'historique (fondu par sa cle). Le champ est un vrai <textarea> nomme :
// le clavier complet et les lecteurs d'ecran y sont chez eux. En le quittant, le focus revient a la toile.

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { Forme, TexteVivant } from '../engine/editionSvg.js';
import { boiteForme } from '../engine/editionSvg.js';
import { appliquerChangement, policeDe } from './actionsTexte.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { usePolices, useTexte } from './contexteTexte.js';

export function SaisieTexte({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const mo = useDessin(), tx = useTexte();
  const f = tx.saisie ? mo.dessin.formes.find(x => x.id === tx.saisie) : undefined;
  // Une forme qui n'est plus un texte (vectorisee, supprimee, annulee) ferme la saisie.
  useEffect(() => { if (tx.saisie && !f?.texte) tx.fermerSaisie(); }, [tx, f]);
  return f?.texte ? <Saisie key={f.id} forme={{ ...f, texte: f.texte }} svgRef={svgRef} /> : null;
}

function Saisie({ forme, svgRef }: { forme: Forme & { texte: TexteVivant }; svgRef: RefObject<SVGSVGElement | null> }) {
  const ac = useActions(), ui = useInterface(), tx = useTexte(), { polices } = usePolices();
  const [valeur, poserValeur] = useState(forme.texte.texte);
  const cle = useRef<string | null>(null), champ = useRef<HTMLTextAreaElement>(null), fini = useRef(false);
  const aide = useId();
  const police = policeDe(forme, polices);
  useEffect(() => {
    // Le curseur se pose a la fin : on ajoute plus souvent qu'on ne remplace, et rien n'est efface par megarde.
    const c = champ.current;
    c?.focus();
    c?.setSelectionRange(c.value.length, c.value.length);
    ac.annoncer('Saisie du texte : Entrée valide, Maj et Entrée vont à la ligne, Échap annule.');
  }, [ac]);
  const fermer = (garder: boolean) => {
    if (fini.current) return;
    fini.current = true;
    if (!garder && cle.current) ac.annulerGeste(cle.current);
    else ac.finir();
    tx.fermerSaisie();
    ac.dire(garder ? (cle.current ? 'Texte modifié : « ' + (valeur.length > 40 ? valeur.slice(0, 39) + '…' : valeur) + ' ».' : 'Texte inchangé.') : 'Saisie annulée : le texte est revenu.');
    svgRef.current?.focus();
  };
  const taper = (v: string) => {
    poserValeur(v);
    if (!police || !v.trim()) return;
    cle.current ??= 'saisie-' + forme.id + '-' + ac.nouvelleCle();
    ac.appliquer(d => appliquerChangement(d, forme.id, { texte: v }, police, ui.profil), cle.current);
  };
  const b = boiteForme(forme), { zoom, x, y } = ui.vues.vue;
  const position = b ? { left: Math.max(0, b.x * zoom + x), top: Math.max(0, (b.y + b.h) * zoom + y) } : { left: 0, top: 0 };
  return (
    <div className="saisie-texte" style={position}>
      <textarea ref={champ} rows={Math.min(6, Math.max(1, valeur.split('\n').length))} value={valeur} readOnly={!police} aria-label="Texte de la forme" aria-describedby={aide}
        onChange={e => taper(e.target.value)} onBlur={() => fermer(true)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(false); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); fermer(true); }
        }} />
      <span id={aide} className="aide">{police ? 'Entrée valide · Maj+Entrée : à la ligne · Échap annule' : polices === null ? 'Chargement des polices…' : 'Police absente : choisissez-en une dans l’inspecteur.'}</span>
    </div>
  );
}
