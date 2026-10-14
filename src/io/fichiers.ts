// Remettre un fichier a la personne, et copier un texte. Les deux passent par le navigateur ; le
// moteur n'en sait rien.

export const texteOctets = (t: string): Uint8Array => new TextEncoder().encode(t);

/** Propose un fichier au telechargement ; rend la phrase a montrer. */
export async function proposer(nom: string, donnees: Uint8Array | Blob): Promise<string> {
  const blob = donnees instanceof Blob ? donnees : new Blob([donnees as BlobPart]);
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
