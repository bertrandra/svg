// Le nuancier d'une image convertie (ADR-0037), sous le resultat de l'atelier : les couleurs dominantes de l'image (coupe mediane
// deterministe, engine/extraction.ts), celles-la memes que le traceur recoit en mode « Aplats » (« Nombre de couleurs » en prend
// les premieres) ; puis, une fois l'image tracee, les couleurs reelles du dessin, celles que l'editeur proposera a l'ouverture
// dans « Couleurs du dessin ». Des pastilles a regarder, pas a cliquer : rien ne se peint encore ici.

import { memo, useMemo } from 'react';
import { lireDessin } from '../engine/editionSvg.js';
import { nuancierDuDessin, teintesDImage } from '../engine/nuancier.js';
import type { TeinteDessin } from '../model/nuancier.js';
import type { ImageConvertie } from '../io/image.js';
import { nomDeTeinte } from './actionsNuancier.js';
import { t } from '../util/i18n.js';

function Rangee({ titre, note, teintes }: { titre: string; note: string; teintes: readonly TeinteDessin[] }) {
  return (
    <div className="nuancier-image-rangee">
      <p className="nuancier-image-titre">{titre} <span className="aide">{note}</span></p>
      <ul className="nuancier-image-teintes" aria-label={titre}>
        {teintes.map(te => <li key={te.hex}><span className="echantillon" role="img" aria-label={nomDeTeinte(te)} title={nomDeTeinte(te)} style={{ background: te.hex }} /></li>)}
      </ul>
    </div>
  );
}

/** Les deux nuanciers d'un resultat : celui de l'image, celui du trace (pour de vrais vecteurs seulement). */
export const NuancierImage = memo(function NuancierImage({ resultat }: { resultat: ImageConvertie }) {
  const image = useMemo(() => teintesDImage(resultat.couleurs), [resultat]);
  // La lecture directe, pas celle de la page (zones/lecture.ts) : elle ne garde que la derniere, celle que l'ouverture relira.
  const trace = useMemo(() => {
    if (resultat.traces === null) return [];
    const lu = lireDessin(resultat.svg);
    return 'erreur' in lu ? [] : nuancierDuDessin(lu.dessin).teintes;
  }, [resultat]);
  if (!image.length && !trace.length) return null;
  const aplats = resultat.traitement.vecteurs?.mode === 'aplats';
  return (
    <div className="nuancier-image">
      {image.length ? <Rangee titre={t('Nuancier de l’image')} note={t('{n} · couleurs dominantes', { n: image.length }) + (aplats ? t(', données au traceur') : '')} teintes={image} /> : null}
      {trace.length ? <Rangee titre={t('Couleurs du tracé')} note={t('{n} · le nuancier proposé dans l’éditeur', { n: trace.length })} teintes={trace} /> : null}

    </div>
  );
});
