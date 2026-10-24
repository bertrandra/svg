// Le bouton d'outil que les barres et les panneaux partagent : une icone, une infobulle qui dit le
// geste et son raccourci. Il vit ici, et non dans la barre, pour que les gestes et les panneaux ne
// dependent pas de la barre d'outils.

import { Icone, type NomIcone } from '../icones.js';

export function Bouton({ icone, aide, onClick, pressed, disabled, className }: { icone: NomIcone; aide: string; onClick: () => void; pressed?: boolean; disabled?: boolean; className?: string }) {
  return <button type="button" className={'icone-bouton' + (className ? ' ' + className : '')} title={aide} aria-label={aide} aria-pressed={pressed} disabled={disabled} onClick={onClick}><Icone nom={icone} /></button>;
}
