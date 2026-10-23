// Les versions nommees (ADR-0004) : « avant recoloration », « v2 »… Chacune garde le SVG du moment
// dans ce navigateur ; on y revient d'un clic (l'historique garde le retour), et la liste s'exporte.

import { useState } from 'react';
import { ecrireDessin, lireDessin } from '../engine/editionSvg.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import type { Edition } from './EditeurSvg.js';
import { Section } from './Section.js';
import { dateCourte } from './session.js';

export function PanneauVersions({ ed }: { ed: Edition }) {
  const [nom, poserNom] = useState('');
  const garder = () => { ed.garderVersion(nom.trim() || 'Version ' + (ed.versions.length + 1), ecrireDessin(ed.dessin, 3)); poserNom(''); };
  const revenir = (svg: string, nomVersion: string) => {
    const lu = lireDessin(svg);
    if ('erreur' in lu) { ed.dire(lu.erreur); return; }
    ed.appliquer(() => lu.dessin);
    ed.choisir([]);
    ed.dire('Retour à « ' + nomVersion + ' » ; Ctrl+Z revient en arrière.');
  };
  return (
    <Section titre="Versions nommées" note={ed.versions.length || undefined}>
      <div className="champ-ligne">
        <input type="text" value={nom} placeholder="avant recoloration…" aria-label="Nom de la version" onChange={e => poserNom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') garder(); }} />
        <button type="button" onClick={garder}>Garder</button>
      </div>
      {ed.versions.length ? (
        <ul className="versions">
          {ed.versions.map(v => (
            <li key={v.id}>
              <span className="nom-version" title={dateCourte(v.quand)}>{v.nom} <span className="aide">{dateCourte(v.quand)}</span></span>
              <button type="button" className="discret" onClick={() => revenir(v.svg, v.nom)}>Revenir</button>
              <button type="button" className="discret" onClick={() => { void proposer(v.nom.replace(/[^\w-]+/g, '-') + '.svg', texteOctets(v.svg)).then(ed.dire); }}>SVG</button>
              <button type="button" className="discret" aria-label={'Supprimer la version ' + v.nom} onClick={() => ed.supprimerVersion(v.id)}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className="aide">Aucune version gardée. Les versions restent dans ce navigateur.</p>}
      {ed.versions.length ? <button type="button" className="discret" onClick={() => { void proposer('versions.json', texteOctets(JSON.stringify(ed.versions, null, 1))).then(ed.dire); }}>Exporter les versions (JSON)</button> : null}
    </Section>
  );
}
