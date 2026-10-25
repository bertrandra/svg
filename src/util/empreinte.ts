// L'empreinte d'une suite d'octets ou d'un texte : un hachage de 53 bits (cyrb53), pur et deterministe, rendu en
// 14 chiffres hexadecimaux. Elle sert a epingler la version d'une fonte qu'un texte vivant a employee (ADR-0022) :
// le coeur pur n'a pas a toucher `crypto`, et une collision n'aurait pour effet qu'un « la police a change » tu.

const lier = (h1: number, h2: number): string => {
  const haut = (h2 >>> 0) & 0x1fffff, bas = h1 >>> 0;
  return haut.toString(16).padStart(6, '0') + bas.toString(16).padStart(8, '0');
};

/** L'empreinte d'octets : 14 chiffres hexadecimaux en minuscules. */
export function empreinteOctets(octets: Uint8Array, graine = 0): string {
  let h1 = 0xdeadbeef ^ graine, h2 = 0x41c6ce57 ^ graine;
  for (const o of octets) {
    h1 = Math.imul(h1 ^ o, 2654435761);
    h2 = Math.imul(h2 ^ o, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return lier(h1, h2);
}

/** L'empreinte d'un texte, par ses unites UTF-16 (un texte de donnees, pas un fichier). */
export function empreinteTexte(texte: string, graine = 0): string {
  const unites = new Uint8Array(texte.length * 2);
  for (let i = 0; i < texte.length; i++) {
    const c = texte.charCodeAt(i);
    unites[2 * i] = c & 0xff;
    unites[2 * i + 1] = c >>> 8;
  }
  return empreinteOctets(unites, graine);
}
