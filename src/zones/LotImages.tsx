// La conversion par lot : plusieurs images deposees d'un coup, converties l'une apres l'autre avec les
// reglages du moment (jamais en parallele, la page reste vivante), puis remises une a une ou en une
// archive ZIP. Une liste dit ou en est chaque image ; « Annuler » arrete le lot apres l'image en cours.
// Le calcul vit dans io/lot.ts et export/zip.ts ; ici, seulement l'etat et les boutons.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ecrireZip, ErreurZip, nomsUniques } from '../export/zip.js';
import { proposer, texteOctets } from '../io/fichiers.js';
import type { Traitement } from '../io/image.js';
import { convertirLot, sansExtension, type EtatLot, type ImageDuLot } from '../io/lot.js';
import { EtatVide } from './commun/EtatVide.js';
import { pluriel } from '../util/texte.js';
import { t } from '../util/i18n.js';

// Une fonction, pas une constante : les libelles se traduisent au rendu, quand le dictionnaire de la langue est pose (ADR-0042).
const libelles = (): Record<EtatLot, string> => ({ attente: t('En attente'), encours: t('En cours…'), ok: t('Terminée'), erreur: t('Échec'), annule: t('Annulée') });

interface Proprietes {
  fichiers: readonly File[];
  traitement: Traitement;
  ouvrir: (nom: string, svg: string) => void;
  fermer: () => void;
}

export function LotImages({ fichiers, traitement, ouvrir, fermer }: Proprietes) {
  const [liste, poserListe] = useState<readonly ImageDuLot[]>([]);
  const [enCours, poserEnCours] = useState(false);
  const [dit, dire] = useState('');
  const annule = useRef(false);
  // Un numéro par lancement : une liste qui revient d'un lot remplacé est jetée.
  const lancement = useRef(0);

  const lancer = useCallback((tr: Traitement) => {
    const mien = ++lancement.current;
    annule.current = false;
    poserEnCours(true);
    dire('');
    void convertirLot(fichiers, tr, l => { if (mien === lancement.current) poserListe(l); }, () => annule.current || mien !== lancement.current).then(fin => {
      if (mien !== lancement.current) return;
      poserEnCours(false);
      const ok = fin.filter(i => i.etat === 'ok').length;
      const v = { n: ok, total: fin.length };
      dire(annule.current
        ? (ok > 1 ? t('Lot annulé : {n} images converties sur {total}.', v) : t('Lot annulé : {n} image convertie sur {total}.', v))
        : (ok > 1 ? t('{n} images converties sur {total}.', v) : t('{n} image convertie sur {total}.', v)));
    });
  }, [fichiers]);

  // Le lot part au dépôt, avec les réglages d'alors.
  useEffect(() => {
    lancer(traitement);
    return () => { lancement.current++; };
    // Un seul départ par dépôt : changer un réglage ensuite ne relance rien sans « Refaire ».
  }, [fichiers]);

  const faites = liste.filter(i => i.etat === 'ok' || i.etat === 'erreur' || i.etat === 'annule').length;
  const reussies = liste.filter(i => i.etat === 'ok');
  const telecharger = () => {
    try {
      const noms = nomsUniques(reussies.map(i => sansExtension(i.nom) + '.svg'));
      const zip = ecrireZip(reussies.map((i, k) => ({ nom: noms[k] ?? 'image.svg', donnees: texteOctets(i.resultat?.svg ?? '') })));
      void proposer('images-svg.zip', new Blob([zip as BlobPart], { type: 'application/zip' })).then(dire);
    } catch (e) {
      dire(e instanceof ErreurZip ? e.message : t('L’archive n’a pas pu être écrite.'));
    }
  };
  return (
    <section className="lot" aria-label={t('Conversion par lot')}>
      <h3>{t('Lot de {n} images', { n: fichiers.length })} <span className="aide">{t('{faites} sur {total}', { faites, total: liste.length || fichiers.length })}</span></h3>
      <progress max={liste.length || fichiers.length} value={faites} aria-label={t('Avancement du lot')} />
      <ul>
        {liste.map(i => (
          <li key={i.id} className={'lot-' + i.etat}>
            <span className="lot-nom">{i.nom}</span>
            <span className="lot-etat" data-etat={i.etat}>{libelles()[i.etat]}{i.etat === 'ok' && i.resultat ? ' · ' + (i.resultat.traces !== null ? pluriel(i.resultat.traces, 'tracé') + ' · ' : '') + t('{n} Ko', { n: Math.max(1, Math.round(i.resultat.svg.length / 1024)) }) : ''}{i.etat === 'erreur' && i.erreur ? t(' : {erreur}', { erreur: i.erreur }) : ''}</span>
            {i.etat === 'ok' && i.resultat ? (
              <span className="actions">
                <button type="button" className="discret" disabled={i.resultat.traces === null} title={i.resultat.traces === null ? t('Une image gardée telle quelle ne s’édite pas : vectorisez-la.') : undefined}
                  aria-label={t('Ouvrir {nom} dans l’éditeur', { nom: i.nom })} onClick={() => ouvrir(sansExtension(i.nom), i.resultat?.svg ?? '')}>{t('Ouvrir')}</button>
                <button type="button" className="discret" aria-label={t('Télécharger le SVG de {nom}', { nom: i.nom })}
                  onClick={() => { void proposer(sansExtension(i.nom) + '.svg', texteOctets(i.resultat?.svg ?? '')).then(dire); }}>{t('Télécharger')}</button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {!enCours && liste.length && !reussies.length ? (
        <EtatVide genre="aucun-resultat" titre={t('Aucune image n’a été convertie.')}>{t('Chaque ligne dit pourquoi. Déposez d’autres images, ou changez un réglage plus haut puis « Refaire avec les réglages actuels ».')}</EtatVide>
      ) : null}
      <div className="actions">
        {enCours ? <button type="button" onClick={() => { annule.current = true; dire(t('Annulation après l’image en cours…')); }}>{t('Annuler le lot')}</button> : null}
        <button type="button" className={enCours ? 'discret' : 'primaire'} disabled={enCours || reussies.length === 0} onClick={telecharger}>{t('Télécharger tout (ZIP)')}</button>
        <button type="button" className="discret" disabled={enCours} onClick={() => lancer(traitement)} title={t('Reconvertit toutes les images avec les réglages affichés maintenant')}>{t('Refaire avec les réglages actuels')}</button>
        <button type="button" className="discret" disabled={enCours} onClick={fermer}>{t('Fermer le lot')}</button>

      </div>
      <span className="aide" role="status">{dit}</span>
    </section>
  );
}
