// Les versions nommees (ADR-0004) : « avant recoloration », « v2 »… Chacune garde le SVG du moment
// dans ce navigateur ; on y revient d'un clic (l'historique garde le retour), et la liste s'exporte.

import { useState } from 'react';
import { lireDessin } from '../engine/editionSvg.js';
import { svgDocument } from './actionsProduction.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Bouton } from './commun/Bouton.js';
import { Section } from './commun/Section.js';
import { dateCourte } from './session.js';

export function PanneauVersions() {
  const mo = useDessin(), ac = useActions(), { production } = useInterface();
  const [nom, poserNom] = useState('');
  const garder = () => { ac.garderVersion(nom.trim() || 'Version ' + (mo.versions.length + 1), svgDocument(mo.dessin, production)); poserNom(''); };
  const revenir = (svg: string, nomVersion: string) => {
    const lu = lireDessin(svg);
    if ('erreur' in lu) { ac.dire(lu.erreur); return; }
    ac.appliquer(() => lu.dessin);
    ac.choisir([]);
    ac.dire('Retour à « ' + nomVersion + ' » ; Ctrl+Z revient en arrière.');
  };
  return (
    <Section titre="Versions nommées" note={mo.versions.length || undefined}>
      <div className="champ-ligne">
        <input type="text" value={nom} placeholder="avant recoloration…" aria-label="Nom de la version" onChange={e => poserNom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') garder(); }} />
        <button type="button" onClick={garder}>Garder</button>
      </div>
      {mo.versions.length ? (
        <ul className="versions">
          {mo.versions.map(v => (
            <li key={v.id}>
              <span className="nom-version" title={dateCourte(v.quand)}>{v.nom} <span className="aide">{dateCourte(v.quand)}</span></span>
              <button type="button" className="discret" onClick={() => revenir(v.svg, v.nom)}>Revenir</button>
              <button type="button" className="discret" onClick={() => { void proposer(v.nom.replace(/[^\w-]+/g, '-') + '.svg', texteOctets(v.svg)).then(ac.dire); }}>SVG</button>
              <Bouton icone="supprimer" aide={'Supprimer la version ' + v.nom} onClick={() => ac.supprimerVersion(v.id)} />
            </li>
          ))}
        </ul>
      ) : <p className="aide">Aucune version gardée. Les versions restent dans ce navigateur.</p>}
      {mo.versions.length ? <button type="button" className="discret" onClick={() => { void proposer('versions.json', texteOctets(JSON.stringify(mo.versions, null, 1))).then(ac.dire); }}>Exporter les versions (JSON)</button> : null}
    </Section>
  );
}
