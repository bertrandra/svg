// L'assemblage d'un PDF (ADR-0018) : l'en-tete, les objets numerotes dans l'ordre, la table des decalages, la remorque. Un objet est
// un texte (latin-1, un octet par caractere), ou un dictionnaire suivi d'un flux d'octets (une image, un groupe de transparence :
// etape 13a). Le catalogue est l'objet 1, les informations l'objet 5. Pur et deterministe.

/** Un objet : son texte entier, ou le dictionnaire (`/Length` compris) d'un flux et ses octets. */
export type ObjetPdf = string | { readonly dict: string; readonly flux: Uint8Array };

function latin1(t: string): Uint8Array {
  const out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i) & 0xff;
  return out;
}

/** Les octets du fichier. */
export function assemblerPdf(objets: readonly ObjetPdf[]): Uint8Array {
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  const ajouter = (t: string | Uint8Array) => { const o = typeof t === 'string' ? latin1(t) : t; morceaux.push(o); taille += o.length; };
  ajouter('%PDF-1.4\n%âãÏÓ\n');
  const positions: number[] = [];
  objets.forEach((o, i) => {
    positions.push(taille);
    if (typeof o === 'string') ajouter((i + 1) + ' 0 obj\n' + o + '\nendobj\n');
    else { ajouter((i + 1) + ' 0 obj\n' + o.dict + '\nstream\n'); ajouter(o.flux); ajouter('\nendstream\nendobj\n'); }
  });
  const xref = taille;
  ajouter('xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n' + positions.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('')
    + 'trailer\n<< /Size ' + (objets.length + 1) + ' /Root 1 0 R /Info 5 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
  const out = new Uint8Array(taille);
  let k = 0;
  for (const m of morceaux) { out.set(m, k); k += m.length; }
  return out;
}

/** Un flux de texte (un contenu de page ou de groupe) : son dictionnaire, `/Length` compris, et ses octets. */
export function fluxTexte(dict: string, contenu: string): { readonly dict: string; readonly flux: Uint8Array } {
  const flux = latin1(contenu);
  return { dict: '<< ' + dict + (dict ? ' ' : '') + '/Length ' + flux.length + ' >>', flux };
}

/** Un flux d'octets : son dictionnaire (`/Length` ajoute a la fin) et ses octets. */
export const fluxOctets = (dict: string, flux: Uint8Array): { readonly dict: string; readonly flux: Uint8Array } => ({ dict: '<< ' + dict + ' /Length ' + flux.length + ' >>', flux });
