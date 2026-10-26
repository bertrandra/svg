// Un champ chiffre qui s'applique a la validation (Entree, ou en le quittant) : une saisie a moitie tapee ne touche pas
// au dessin, une valeur illisible ou sous le minimum revient a la valeur courante. Inactif, il dit pourquoi (`raison`, en
// infobulle) : un champ grise sans raison lisible n'a pas de sens (DESIGN.md).

import { useEffect, useState } from 'react';
import { arrondi } from '../aidesEditeur.js';

export function Nombre({ libelle, valeur, poser, min, max, desactive, raison }: { libelle: string; valeur: number; poser: (v: number) => void; min?: number; max?: number; desactive?: boolean; raison?: string }) {
  const [t, poserT] = useState(String(arrondi(valeur)));
  useEffect(() => { poserT(String(arrondi(valeur))); }, [valeur]);
  const valider = () => {
    const v = Number(t.replace(',', '.'));
    if (Number.isFinite(v) && v !== arrondi(valeur) && (min === undefined || v >= min) && (max === undefined || v <= max)) poser(v);
    else poserT(String(arrondi(valeur)));
  };
  return (
    <label className="champ-ligne nombre" title={desactive ? raison : undefined}>
      <span>{libelle}</span>
      <input type="text" inputMode="decimal" value={t} disabled={desactive} onChange={e => poserT(e.target.value)} onBlur={valider} onKeyDown={e => { if (e.key === 'Enter') valider(); }} />
    </label>
  );
}

