// Remettre un fichier a la personne, et copier un texte. Les deux passent par le navigateur ; le
// moteur n'en sait rien. Publiee comme artefact, la page n'a pas le droit de proposer un lien de
// telechargement : elle passe alors par la capacite `downloads` de la page hote quand elle existe.

import { t } from '../util/i18n.js';

interface Telechargements { save(o: { filename: string; data: Blob }): Promise<unknown> }
interface Hote { use(nom: string): Promise<unknown> }

function hote(): Hote | null {
  const w = window as unknown as { claude?: Hote };
  return w.claude && typeof w.claude.use === 'function' ? w.claude : null;
}

export const texteOctets = (t: string): Uint8Array => new TextEncoder().encode(t);

/** Laisse le navigateur peindre avant un calcul long : le message « en cours » se voit avant que la page ne se fige. */
export const pause = (): Promise<void> => new Promise(ok => requestAnimationFrame(() => setTimeout(ok, 0)));

/** Propose un fichier au telechargement ; rend la phrase a montrer. */
export async function proposer(nom: string, donnees: Uint8Array | Blob): Promise<string> {
  const blob = donnees instanceof Blob ? donnees : new Blob([donnees as BlobPart]);
  let dl: Telechargements | null = null;
  try { dl = (await hote()?.use('downloads') as Telechargements | undefined) ?? null; } catch { dl = null; }
  if (dl) {
    try {
      await dl.save({ filename: nom, data: blob });
      return t('Fichier proposé : {nom}.', { nom });
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      return code === 'declined' ? t('Téléchargement annulé.') : t('Le téléchargement a échoué ({code}).', { code: code ?? t('inconnu') });
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return t('Fichier enregistré : {nom}.', { nom });
}

/** Copie un texte ; rend faux si la page n'en a pas le droit. */
export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

/** Les types d'image qu'un fichier choisi peut annoncer, d'apres ses premiers octets quand le navigateur n'en donne pas. */
const ENTETES_IMAGES: ReadonlyArray<readonly [string, (o: Uint8Array) => boolean]> = [
  ['image/png', o => o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47],
  ['image/jpeg', o => o[0] === 0xff && o[1] === 0xd8],
  ['image/gif', o => o[0] === 0x47 && o[1] === 0x49 && o[2] === 0x46],
  ['image/webp', o => o[8] === 0x57 && o[9] === 0x45 && o[10] === 0x42 && o[11] === 0x50]
];

/**
 * Un fichier choisi ou depose, en adresse `data:<type>;base64,…` : ce que le moteur verifie ensuite sur les octets (nature,
 * dimensions, bornes : `verifierDonneesImage`). Le type est celui que le navigateur annonce, ou celui que les premiers octets donnent ;
 * un type faux est corrige par la verification, un contenu qui n'est pas une image y est refuse en le nommant.
 */
export async function donneesDuFichier(f: Blob): Promise<string> {
  const o = new Uint8Array(await f.arrayBuffer());
  const type = f.type || (ENTETES_IMAGES.find(([, ok]) => ok(o))?.[0] ?? 'application/octet-stream');
  // Par tranches : String.fromCharCode d'un seul tenant depasserait la pile sur quelques megaoctets.
  let t = '';
  for (let i = 0; i < o.length; i += 0x8000) t += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return 'data:' + type + ';base64,' + btoa(t);
}
