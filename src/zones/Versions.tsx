// Les versions nommees (ADR-0004) : « avant recoloration », « v2 »… Chacune garde le SVG du moment
// dans ce navigateur ; on y revient d'un clic (l'historique garde le retour), et la liste s'exporte.

import { useState } from 'react';
import { lireDessin } from '../engine/editionSvg.js';
import { svgDocument } from './actionsProduction.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { Bouton } from './commun/Bouton.js';
import { EtatVide } from './commun/EtatVide.js';
import { Section } from './commun/Section.js';
import { useStockage } from './contexteStockage.js';
import { dateCourte } from './session.js';
import { optionsModele, refusModele } from './modele.js';
import { dessinComplet } from './lentille.js';
import { t } from '../util/i18n.js';

export function PanneauVersions() {
  const mo = useDessin(), ac = useActions(), { production, modele } = useInterface(), stockage = useStockage();
  const [nom, poserNom] = useState('');
  const garder = () => { ac.garderVersion(nom.trim() || t('Version {n}', { n: mo.versions.length + 1 }), svgDocument(dessinComplet(mo), production)); poserNom(''); };
  const revenir = (svg: string, nomVersion: string) => {
    // Une version ecrite en modele riche ne se rouvre pas a plat (annexe 5 §3) : on le dit, elle reste gardee.
    const refus = refusModele(svg, modele, 'version');
    if (refus) { ac.dire(refus); return; }
    const lu = lireDessin(svg, optionsModele(modele));
    if ('erreur' in lu) { ac.dire(lu.erreur); return; }
    ac.appliquer(() => lu.dessin);
    ac.choisir([]);
    ac.dire(t('Retour à « {nom} » ; Ctrl+Z revient en arrière.', { nom: nomVersion }));
  };
  return (
    <Section titre={t('Versions nommées')} note={mo.versions.length || undefined}>
      <div className="champ-ligne">
        <input type="text" value={nom} placeholder={t('avant recoloration…')} aria-label={t('Nom de la version')} onChange={e => poserNom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') garder(); }} />
        <button type="button" onClick={garder}>{t('Garder')}</button>
      </div>
      {mo.versions.length ? (
        <ul className="versions">
          {mo.versions.map(v => (
            <li key={v.id}>
              <span className="nom-version" title={dateCourte(v.quand)}>{v.nom} <span className="aide">{dateCourte(v.quand)}</span></span>
              <button type="button" className="discret" onClick={() => revenir(v.svg, v.nom)}>{t('Revenir')}</button>
              <button type="button" className="discret" onClick={() => { void proposer(v.nom.replace(/[^\w-]+/g, '-') + '.svg', texteOctets(v.svg)).then(ac.dire); }}>SVG</button>
              <Bouton icone="supprimer" aide={t('Supprimer la version {nom}', { nom: v.nom })} onClick={() => ac.supprimerVersion(v.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <EtatVide genre="premiere-fois" icone="versions" titre={t('Aucune version gardée.')}>
          {stockage
            ? t('Une version garde le dessin tel qu’il est, pour y revenir plus tard (avant de tout recolorer, par exemple) : nommez-la, puis « Garder ». Elle reste dans ce navigateur.')
            : t('Une version garde le dessin tel qu’il est, pour y revenir plus tard (avant de tout recolorer, par exemple) : nommez-la, puis « Garder ». Ici, elle ne dure que le temps de l’édition.')}
        </EtatVide>
      )}
      {mo.versions.length ? <button type="button" className="discret" onClick={() => { void proposer('versions.json', texteOctets(JSON.stringify(mo.versions, null, 1))).then(ac.dire); }}>{t('Exporter les versions (JSON)')}</button> : null}
    </Section>
  );
}
