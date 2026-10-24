// Remettre un fichier a la personne, et copier un texte. Les deux passent par le navigateur ; le
// moteur n'en sait rien. Publiee comme artefact, la page n'a pas le droit de proposer un lien de
// telechargement : elle passe alors par la capacite `downloads` de la page hote quand elle existe.

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
      return 'Fichier proposé : ' + nom + '.';
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      return code === 'declined' ? 'Téléchargement annulé.' : 'Le téléchargement a échoué (' + (code ?? 'inconnu') + ').';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'Fichier enregistré : ' + nom + '.';
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
