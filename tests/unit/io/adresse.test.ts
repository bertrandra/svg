import { afterEach, describe, it, expect } from 'vitest';
import { definirOuvertureAdresse, lireFluxBorne, OCTETS_MAX, ouvertureAdresse, PHRASES_TELECHARGEMENT, telechargerAdresse, telechargerParNavigateur } from '../../../src/io/adresse.js';

// Aller chercher un fichier a une adresse, dans la page autonome (ADR-0036) : sans cookie ni referent, en suivant les redirections,
// le flux lu sous une borne et un delai ; un refus CORS se distingue d'un serveur injoignable ; rien ne leve. Le `fetch` est un faux.

const URL_ESSAI = 'https://exemple.fr/logo.svg';
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="5" height="5"/></svg>');
const signal = () => new AbortController().signal;

/** Un flux sans fin (ou jusqu'a `total`), le meme morceau rendu a chaque lecture : un tres gros fichier qui ne coute rien en memoire. */
function fluxGeant(morceau: number, total = Infinity): { flux: ReadableStream<Uint8Array>; lus: () => number } {
  const bloc = new Uint8Array(morceau).fill(0x20);
  let lus = 0;
  const flux = new ReadableStream<Uint8Array>({
    pull(c) { if (lus * morceau >= total) { c.close(); return; } lus++; c.enqueue(bloc); }
  }, { highWaterMark: 0 });
  return { flux, lus: () => lus };
}

afterEach(() => definirOuvertureAdresse(null));

describe('le telechargement par le navigateur', () => {
  it('demande en GET, sans cookie ni referent, en suivant les redirections, sans cache, et rend les octets', async () => {
    const vus: RequestInit[] = [];
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), { chercher: async (u, init) => { expect(u).toBe(URL_ESSAI); vus.push(init); return new Response(SVG); } });
    expect(r).toEqual({ octets: SVG });
    expect(vus).toHaveLength(1);
    expect(vus[0]).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow', mode: 'cors', cache: 'no-store' });
    expect(vus[0]?.headers).toBeUndefined();
  });

  it('un refus du reseau suivi d une demande opaque qui aboutit : le site refuse la lecture entre origines (CORS), et c est dit', async () => {
    const vus: RequestInit[] = [];
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), {
      chercher: async (_u, init) => { vus.push(init); if (init.mode === 'cors') throw new TypeError('Failed to fetch'); return new Response(null, { status: 200 }); }
    });
    expect(r).toEqual({ erreur: 'Ce site ne permet pas à la page de lire le fichier. Téléchargez-le, puis ouvrez-le ou déposez-le ici.', code: 'cors' });
    expect(vus.map(v => [v.method, v.mode, v.credentials, v.referrerPolicy])).toEqual([['GET', 'cors', 'omit', 'no-referrer'], ['HEAD', 'no-cors', 'omit', 'no-referrer']]);
  });

  it('un serveur injoignable (les deux demandes echouent) est dit comme tel', async () => {
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), { chercher: async () => { throw new TypeError('Failed to fetch'); } });
    expect(r).toEqual({ erreur: PHRASES_TELECHARGEMENT.reseau, code: 'reseau' });
  });

  it('une reponse en erreur dit son statut', async () => {
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), { chercher: async () => new Response('<html>404</html>', { status: 404 }) });
    expect(r).toEqual({ erreur: 'Le serveur a répondu par une erreur (statut 404) : aucun fichier à cette adresse.', code: 'statut' });
    const r2 = await telechargerParNavigateur(URL_ESSAI, signal(), { chercher: async () => new Response('', { status: 403 }) });
    expect('erreur' in r2 && r2.erreur).toContain('n’est pas public');
  });

  it('une taille annoncee trop grande est refusee sans rien lire', async () => {
    const { flux, lus } = fluxGeant(1024);
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), { max: 4096, chercher: async () => new Response(flux, { headers: { 'Content-Length': '5000' } }) });
    expect(r).toEqual({ erreur: PHRASES_TELECHARGEMENT.trop_gros, code: 'trop_gros' });
    expect(lus()).toBe(0);
  });

  it('un flux sans taille annoncee est coupe des qu il depasse la borne', async () => {
    const { flux, lus } = fluxGeant(1024);
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), { max: 10_000, chercher: async () => new Response(flux) });
    expect(r).toEqual({ erreur: PHRASES_TELECHARGEMENT.trop_gros, code: 'trop_gros' });
    expect(lus()).toBeLessThanOrEqual(12);
  });

  it('un fichier vide est dit', async () => {
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), { chercher: async () => new Response(new Uint8Array(0)) });
    expect(r).toEqual({ erreur: PHRASES_TELECHARGEMENT.vide, code: 'vide' });
  });

  it('un serveur qui ne repond pas dans le delai est coupe, et c est dit (sans seconde demande)', async () => {
    let demandes = 0;
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), {
      delai: 30,
      chercher: (_u, init) => { demandes++; return new Promise((_ok, ko) => init.signal?.addEventListener('abort', () => ko(new DOMException('abandon', 'AbortError')))); }
    });
    expect(r).toEqual({ erreur: PHRASES_TELECHARGEMENT.delai, code: 'delai' });
    expect(demandes).toBe(1);
  });

  it('un flux qui s interrompt en route est coupe au delai, pendant la lecture', async () => {
    const lent = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(SVG); } });
    const r = await telechargerParNavigateur(URL_ESSAI, signal(), {
      delai: 30,
      chercher: async (_u, init) => {
        const flux = init.signal ? lent.pipeThrough(new TransformStream(), { signal: init.signal }) : lent;
        return new Response(flux);
      }
    });
    expect(r).toEqual({ erreur: PHRASES_TELECHARGEMENT.delai, code: 'delai' });
  });

  it('« Annuler » coupe la requete, et le dit sans parler de CORS', async () => {
    const ctl = new AbortController();
    const attente = telechargerParNavigateur(URL_ESSAI, ctl.signal, {
      chercher: (_u, init) => new Promise((_ok, ko) => init.signal?.addEventListener('abort', () => ko(new DOMException('abandon', 'AbortError'))))
    });
    ctl.abort();
    expect(await attente).toEqual({ erreur: 'Téléchargement annulé.', code: 'annule' });
    const deja = new AbortController();
    deja.abort();
    let demandes = 0;
    expect(await telechargerParNavigateur(URL_ESSAI, deja.signal, { chercher: async () => { demandes++; return new Response(SVG); } })).toEqual({ erreur: 'Téléchargement annulé.', code: 'annule' });
    expect(demandes).toBe(0);
  });
});

describe('la lecture bornee d un flux', () => {
  it('un tres gros flux (plus de 100 Mo) est coupe a la borne de l ouverture d un fichier, sans tout garder', async () => {
    expect(OCTETS_MAX).toBe(100 * 1024 * 1024);
    const { flux, lus } = fluxGeant(1024 * 1024, 300 * 1024 * 1024);
    expect(await lireFluxBorne(new Response(flux), OCTETS_MAX)).toBeNull();
    expect(lus()).toBe(101);
  });

  it('rend les octets assembles quand ils tiennent, flux ou corps', async () => {
    const { flux } = fluxGeant(1000, 3000);
    expect((await lireFluxBorne(new Response(flux), 3000))?.length).toBe(3000);
    expect(await lireFluxBorne(new Response(SVG), 3000)).toEqual(SVG);
  });
});

describe('le chemin que l hote pose', () => {
  it('sans ouverture posee (un hote qui embarque l editeur), rien ne part', async () => {
    expect(ouvertureAdresse()).toBeNull();
    expect(await telechargerAdresse(URL_ESSAI, signal())).toEqual({ erreur: PHRASES_TELECHARGEMENT.indisponible, code: 'indisponible' });
  });

  it('le site passe par son serveur, avec le meme resultat', async () => {
    const vus: string[] = [];
    definirOuvertureAdresse({ qui: 'Le site.', serveur: async u => { vus.push(u); return { octets: SVG }; } });
    expect(await telechargerAdresse(URL_ESSAI, signal())).toEqual({ octets: SVG });
    expect(vus).toEqual([URL_ESSAI]);
  });
});
