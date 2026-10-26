import { describe, expect, it } from 'vitest';
import { creerServeur, lireMeta } from '../../../src/io/serveur.js';
import { FORMAT_PROJET, VERSION_PROJET, type Projet } from '../../../src/model/projet.js';

// Le client de l'API du site (ADR-0030) : jamais d'exception, toujours un code et une phrase ; le jeton CSRF sur chaque ecriture,
// la revision ouverte sur un enregistrement par-dessus ; un projet lu est valide avant d'etre cru. Pas de vrai reseau : un faux fetch.

const META = { id: '0123456789abcdef', nom: 'Carte', creeLe: '2026-10-25T10:00:00Z', modifieLe: '2026-10-25T11:00:00Z', revision: 3, taille: 120, vignette: true };
const PROJET: Projet = {
  format: FORMAT_PROJET, version: VERSION_PROJET, nom: 'Carte', dessin: { vb: [0, 0, 10, 10], formes: [] },
  production: { contexte: 'generique' }, nuancier: [], ressources: { polices: [], images: [] }
};

interface Appel { url: string; init: RequestInit }
function faux(reponse: (a: Appel) => Response | Promise<Response>) {
  const appels: Appel[] = [];
  const chercher = async (url: string, init: RequestInit) => { const a = { url, init }; appels.push(a); return reponse(a); };
  return { appels, serveur: creerServeur({ api: 'api.php', csrf: 'jeton', chercher }) };
}
const json = (statut: number, corps: unknown, entetes: Record<string, string> = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });

describe('le serveur du site', () => {
  it('liste les projets, et ne croit que des fiches bien formees', async () => {
    const { serveur, appels } = faux(() => json(200, { projets: [META, { ...META, id: '../etc' }, { nope: 1 }] }));
    const r = await serveur.lister();
    expect(r).toEqual({ ok: true, valeur: [META] });
    expect(appels[0]?.url).toBe('api.php?r=projets');
    expect(appels[0]?.init.credentials).toBe('same-origin');
  });

  it('ouvre un projet avec sa revision (ETag), et refuse un projet invalide ou plus recent en le nommant', async () => {
    const ok = faux(() => json(200, PROJET, { ETag: '"3"' }));
    expect(await ok.serveur.ouvrir(META.id)).toEqual({ ok: true, valeur: { projet: PROJET, revision: 3, migre: false } });
    // Un serveur qui compresse la reponse (nginx, gzip ou brotli) rend un ETag faible : le projet s'ouvre quand meme (vu en ligne).
    const faible = faux(() => json(200, PROJET, { ETag: 'W/"3"' }));
    expect(await faible.serveur.ouvrir(META.id)).toEqual({ ok: true, valeur: { projet: PROJET, revision: 3, migre: false } });
    const recent = faux(() => json(200, { ...PROJET, version: VERSION_PROJET + 1 }, { ETag: '"3"' }));
    const r = await recent.serveur.ouvrir(META.id);
    expect(r.ok ? '' : r.message).toMatch(/version plus récente/);
    const piege = faux(() => json(200, { ...PROJET, dessin: { vb: [0, 0, 10, 10], formes: [{ id: 'f1', d: 'M0 0', remplissage: 'url(http://x)', contour: null, epaisseur: 1, opacite: 1, regle: 'nonzero', visible: true, verrouille: false }] } }, { ETag: '"1"' }));
    const p = await piege.serveur.ouvrir(META.id);
    expect(p.ok ? '' : p.code).toBe('invalide');
  });

  it('enregistre avec le jeton CSRF ; par-dessus un projet, avec la revision ouverte', async () => {
    const { serveur, appels } = faux(() => json(200, { meta: META }));
    expect(await serveur.enregistrer(PROJET, null, '<svg/>')).toEqual({ ok: true, valeur: META });
    expect(appels[0]?.url).toBe('api.php?r=enregistrer');
    expect(appels[0]?.init.method).toBe('POST');
    expect((appels[0]?.init.headers as Record<string, string>)['X-CSRF']).toBe('jeton');
    expect((appels[0]?.init.headers as Record<string, string>)['If-Match']).toBeUndefined();
    expect(JSON.parse(String(appels[0]?.init.body))).toEqual({ projet: PROJET, vignette: '<svg/>' });
    await serveur.enregistrer(PROJET, { id: META.id, revision: 3 }, null);
    expect(appels[1]?.url).toBe('api.php?r=enregistrer&id=0123456789abcdef');
    expect((appels[1]?.init.headers as Record<string, string>)['If-Match']).toBe('"3"');
    expect(JSON.parse(String(appels[1]?.init.body))).toEqual({ projet: PROJET });
  });

  it('dit un conflit, une session expiree, un reseau coupe, une reponse illisible : jamais une exception', async () => {
    const conflit = await faux(() => json(409, { erreur: 'conflit', message: 'x', meta: { ...META, revision: 4 } })).serveur.enregistrer(PROJET, { id: META.id, revision: 3 }, null);
    expect(conflit).toMatchObject({ ok: false, code: 'conflit', meta: { revision: 4 } });
    expect(conflit.ok ? '' : conflit.message).toMatch(/Enregistrer sous/);
    const session = await faux(() => json(401, { erreur: 'session', message: '…' })).serveur.lister();
    expect(session).toMatchObject({ ok: false, code: 'session' });
    expect(session.ok ? '' : session.message).toMatch(/reconnectez-vous/);
    const coupe = await faux(() => { throw new TypeError('Failed to fetch'); }).serveur.lister();
    expect(coupe).toMatchObject({ ok: false, code: 'reseau' });
    const illisible = await faux(() => new Response('<html>', { status: 200 })).serveur.lister();
    expect(illisible).toMatchObject({ ok: false, code: 'serveur' });
    const sansEtag = await faux(() => json(200, PROJET)).serveur.ouvrir(META.id);
    expect(sansEtag.ok).toBe(false);
  });

  it('apres une reconnexion ailleurs, reprend le jeton de la session et reessaie l ecriture une fois', async () => {
    const { serveur, appels } = faux(a => {
      if (a.url === 'api.php?r=jeton') return json(200, { csrf: 'neuf' });
      const jeton = (a.init.headers as Record<string, string>)['X-CSRF'];
      return jeton === 'neuf' ? json(200, { meta: META }) : json(403, { erreur: 'csrf', message: 'Requête refusée' });
    });
    expect(await serveur.enregistrer(PROJET, null, null)).toEqual({ ok: true, valeur: META });
    expect(appels.map(a => a.url)).toEqual(['api.php?r=enregistrer', 'api.php?r=jeton', 'api.php?r=enregistrer']);
    expect(String(appels[2]?.init.body)).toBe(String(appels[0]?.init.body));
    // Le jeton neuf sert ensuite tout de suite.
    expect((await serveur.renommer(META.id, 'x')).ok).toBe(true);
    expect(appels).toHaveLength(4);
    const toujours = faux(a => (a.url === 'api.php?r=jeton' ? json(401, { erreur: 'session' }) : json(403, { erreur: 'csrf', message: 'x' })));
    expect(await toujours.serveur.supprimer(META.id)).toMatchObject({ ok: false, code: 'session' });
  });

  it('renomme, duplique, supprime par POST avec le jeton', async () => {
    const { serveur, appels } = faux(a => (a.url.includes('supprimer') ? json(200, { ok: true }) : json(200, { meta: META })));
    expect((await serveur.renommer(META.id, 'Neuf')).ok).toBe(true);
    expect((await serveur.dupliquer(META.id)).ok).toBe(true);
    expect(await serveur.supprimer(META.id)).toEqual({ ok: true, valeur: null });
    expect(appels.map(a => [a.url, a.init.method, (a.init.headers as Record<string, string>)['X-CSRF']])).toEqual([
      ['api.php?r=renommer&id=0123456789abcdef', 'POST', 'jeton'], ['api.php?r=dupliquer&id=0123456789abcdef', 'POST', 'jeton'], ['api.php?r=supprimer&id=0123456789abcdef', 'POST', 'jeton']
    ]);
    expect(JSON.parse(String(appels[0]?.init.body))).toEqual({ nom: 'Neuf' });
  });

  it('lit une annexe de donnees en JSON, et la liste des fontes avec leurs fichiers', async () => {
    const { serveur, appels } = faux(a => {
      if (a.url.includes('f=polices-catalogue')) return json(200, { format: 1 });
      if (a.url.includes('f=polices')) return json(200, [{ id: 'inter', nom: 'Inter', fichier: 'inter.ttf' }, { id: 'ems-readability', nom: 'EMS', nature: 'trait', glyphes: [] }]);
      if (a.url.includes('r=fonte')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      return json(404, { erreur: 'introuvable', message: 'non' });
    });
    expect(await serveur.donnees('polices-catalogue')).toEqual({ format: 1 });
    expect(await serveur.donnees('bibliotheque')).toBeUndefined();
    expect(await serveur.donnees('polices')).toEqual([{ id: 'inter', nom: 'Inter', base64: 'AQID' }, { id: 'ems-readability', nom: 'EMS', nature: 'trait', glyphes: [] }]);
    expect(appels.some(a => a.url === 'api.php?r=fonte&f=inter.ttf')).toBe(true);
    expect(serveur.adressePolice('ab+c/d=')).toBe('api.php?r=police&sha=ab%2Bc%2Fd%3D');
    expect(serveur.adresseVignette(META)).toBe('api.php?r=vignette&id=0123456789abcdef&v=3');
  });

  it('refuse une fiche dont l identifiant n est pas un identifiant de disque', () => {
    expect(lireMeta(META)).toEqual(META);
    expect(lireMeta({ ...META, id: '0123456789ABCDEF' })).toBeNull();
    expect(lireMeta({ ...META, revision: 0 })).toBeNull();
    expect(lireMeta('x')).toBeNull();
  });
});

describe('ouvrir depuis une adresse par le serveur du site (ADR-0036)', () => {
  const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
  const signal = () => new AbortController().signal;

  it('demande l adresse au serveur par POST, avec le jeton CSRF, et rend les octets bruts', async () => {
    const { serveur, appels } = faux(() => new Response(SVG, { headers: { 'Content-Type': 'application/octet-stream' } }));
    expect(await serveur.telechargerAdresse('https://exemple.fr/a.svg', signal())).toEqual({ octets: SVG });
    expect(appels[0]?.url).toBe('api.php?r=adresse');
    expect(appels[0]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin', cache: 'no-store' });
    expect((appels[0]?.init.headers as Record<string, string>)['X-CSRF']).toBe('jeton');
    expect(JSON.parse(String(appels[0]?.init.body))).toEqual({ adresse: 'https://exemple.fr/a.svg' });
  });

  it('dit le refus du serveur (adresse privee, schema, trop gros, delai) avec sa phrase, et ramene son code', async () => {
    const prive = await faux(() => json(403, { erreur: 'adresse_interdite', message: 'Cette adresse mène à un réseau privé, local ou réservé : le site ne la demande pas.' })).serveur.telechargerAdresse('https://intranet/a.svg', signal());
    expect(prive).toEqual({ erreur: 'Cette adresse mène à un réseau privé, local ou réservé : le site ne la demande pas.', code: 'refuse' });
    expect(await faux(() => json(413, { erreur: 'trop_gros', message: 'Trop gros.' })).serveur.telechargerAdresse('https://e.fr/a', signal())).toEqual({ erreur: 'Trop gros.', code: 'trop_gros' });
    expect(await faux(() => json(504, { erreur: 'delai', message: 'Trop long.' })).serveur.telechargerAdresse('https://e.fr/a', signal())).toEqual({ erreur: 'Trop long.', code: 'delai' });
    expect(await faux(() => json(502, { erreur: 'injoignable', message: 'Ne répond pas.' })).serveur.telechargerAdresse('https://e.fr/a', signal())).toEqual({ erreur: 'Ne répond pas.', code: 'reseau' });
    const session = await faux(() => json(401, { erreur: 'session', message: '…' })).serveur.telechargerAdresse('https://e.fr/a', signal());
    expect(session).toMatchObject({ code: 'session' });
    expect(await faux(() => { throw new TypeError('coupe'); }).serveur.telechargerAdresse('https://e.fr/a', signal())).toMatchObject({ code: 'reseau' });
  });

  it('borne la reponse du serveur comme un fichier : un corps annonce trop grand n est pas lu', async () => {
    const r = await faux(() => new Response(SVG, { headers: { 'Content-Length': String(200 * 1024 * 1024) } })).serveur.telechargerAdresse('https://e.fr/a', signal());
    expect(r).toMatchObject({ code: 'trop_gros' });
  });

  it('apres une reconnexion ailleurs, reprend le jeton de la session et reessaie une fois', async () => {
    let n = 0;
    const { serveur, appels } = faux(a => {
      if (a.url === 'api.php?r=jeton') return json(200, { csrf: 'neuf' });
      return n++ === 0 ? json(403, { erreur: 'csrf', message: 'x' }) : new Response(SVG);
    });
    expect(await serveur.telechargerAdresse('https://e.fr/a.svg', signal())).toEqual({ octets: SVG });
    expect(appels.map(a => a.url)).toEqual(['api.php?r=adresse', 'api.php?r=jeton', 'api.php?r=adresse']);
    expect((appels[2]?.init.headers as Record<string, string>)['X-CSRF']).toBe('neuf');
  });

  it('« Annuler » coupe la requete au serveur', async () => {
    const ctl = new AbortController();
    const { serveur } = faux(a => new Promise((_ok, ko) => a.init.signal?.addEventListener('abort', () => ko(new DOMException('abandon', 'AbortError')))));
    const attente = serveur.telechargerAdresse('https://e.fr/a.svg', ctl.signal);
    ctl.abort();
    expect(await attente).toEqual({ erreur: 'Téléchargement annulé.', code: 'annule' });
  });
});
