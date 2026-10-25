// La bulle de la visite guidee (ADR-0019) : posee pres de ce qu'elle montre, sur le vrai editeur, sans voile. Le reste de
// l'editeur reste utilisable : seule la bulle recoit les clics la ou elle est, et un filet autour de la cible (qui laisse
// passer les clics) dit ou regarder.
//
// Le focus : la bulle ne le prend jamais d'elle-meme (la toile le garde). F6 y mene et en revient ; le lien « Aller à la visite
// guidée » est le deuxieme arret de Tab ; la bulle est aussi le dernier element de l'editeur dans l'ordre de Tab, qui en sort
// vers le navigateur comme ailleurs : rien ne piege.

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as KE, type RefObject } from 'react';
import { CHOIX_CRICUT, useVisite } from './contexteGuide.js';
import { useActions, useDessin, useInterface } from './contexteEditeur.js';
import { cadrage, cibleEtape, placerBulle, progression, texteEtape, type EtapeVisite, type Placement, type Rect } from './visite.js';

type Visite = NonNullable<ReturnType<typeof useVisite>>;

/** La toile de l'editeur qui contient `el` : la ou le focus revient quand on quitte la bulle. */
const toileDe = (el: Element | null): SVGElement | null => el?.closest('.editeur-cadre')?.querySelector<SVGElement>('.editeur-svg-toile') ?? null;

/** Les tiroirs ne s'ouvrent que sous 900 px (editeur.css) : au-dessus, les panneaux sont deja la. */
const avecTiroirs = (): boolean => window.matchMedia('(max-width: 900px)').matches;

/** Le lien d'evitement vers la bulle, juste apres « Aller à la toile » ; il n'existe que pendant la visite. */
export function LienVisite() {
  const v = useVisite();
  if (!v?.etape) return null;
  return <a className="saut" href="#visite-guidee" onClick={e => { e.preventDefault(); document.querySelector<HTMLElement>('.bulle-visite')?.focus(); }}>Aller à la visite guidée</a>;
}

export function BulleVisite() {
  const v = useVisite();
  if (!v?.etape) return null;
  return <Bulle v={v} etape={v.etape} />;
}

/** Une pose mesuree, avec l'etape pour laquelle elle l'a ete : le recadrage ne suit jamais la pose de l'etape d'avant. */
interface Pose { etape: EtapeVisite; placement: Placement; cible: Rect | null; zone: Rect | null }

const memePose = (a: Pose | null, b: Pose): boolean => !!a && JSON.stringify(a) === JSON.stringify(b);
const rectDe = (el: Element | null): Rect | null => {
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, l: r.width, h: r.height } : null;
};

/**
 * Mesure la cible et la bulle, et pose la bulle (placerBulle, pur). Elle se replace quand l'ecran change de taille, quand la
 * bulle change de contenu, quand la cible bouge (la rangee de la selection qui apparait retaille la toile) ou change d'element
 * (la barre d'un telephone n'est pas celle du bureau).
 */
function usePose(bulle: RefObject<HTMLDivElement | null>, selecteur: string, etape: EtapeVisite): Pose | null {
  const [pose, poserPose] = useState<Pose | null>(null);
  useLayoutEffect(() => {
    const el = bulle.current, cadre = el?.closest('.editeur-cadre');
    if (!el || !cadre) return;
    let image = 0, observee: Element | null = null;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(image); image = requestAnimationFrame(mesurer); });
    function mesurer() {
      if (!el || !cadre) return;
      const c = cadre.querySelector(selecteur);
      if (c !== observee) { if (observee) ro.unobserve(observee); if (c) ro.observe(c); observee = c; }
      // La bulle vit sur la toile : jamais sur la barre, la rangee de la selection ou un panneau, qu'elle cacherait.
      const cible = rectDe(c), zone = rectDe(cadre.querySelector('.editeur-toile'));
      const ecran = { l: document.documentElement.clientWidth, h: window.innerHeight };
      const p: Pose = { etape, placement: placerBulle(cible, { l: el.offsetWidth, h: el.offsetHeight }, ecran, zone), cible, zone };
      poserPose(avant => (memePose(avant, p) ? avant : p));
    }
    mesurer();
    ro.observe(el);
    ro.observe(cadre);
    const reposer = () => { cancelAnimationFrame(image); image = requestAnimationFrame(mesurer); };
    window.addEventListener('resize', reposer);
    // Un tiroir qui s'ouvre ou un menu qui se ferme ne retaillent rien : un clic quelque part redemande la mesure, a peu de frais.
    window.addEventListener('pointerup', reposer);
    return () => { cancelAnimationFrame(image); ro.disconnect(); window.removeEventListener('resize', reposer); window.removeEventListener('pointerup', reposer); };
  }, [bulle, selecteur, etape]);
  return pose;
}

/** F6 va a la bulle et en revient ; le focus qui y etait ne se perd ni quand l'etape change ni quand la bulle part. */
function useFocusBulle(bulle: RefObject<HTMLDivElement | null>, etape: EtapeVisite): void {
  const dedans = useRef(false);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const el = bulle.current;
      if (e.key !== 'F6' || !el) return;
      e.preventDefault();
      if (el.contains(document.activeElement)) toileDe(el)?.focus();
      else el.focus({ preventScroll: true });
    };
    const suivre = () => { dedans.current = !!bulle.current?.contains(document.activeElement); };
    window.addEventListener('keydown', touche);
    document.addEventListener('focusin', suivre);
    return () => { window.removeEventListener('keydown', touche); document.removeEventListener('focusin', suivre); };
  }, [bulle]);
  // Un bouton qui disparait d'une etape a l'autre (Precedent) ferait tomber le focus sur le corps de la page : il revient a la bulle.
  useLayoutEffect(() => {
    if (dedans.current && (document.activeElement === document.body || document.activeElement === null)) bulle.current?.focus({ preventScroll: true });
  }, [bulle, etape]);
  // En partant (passer, terminer, Echap), la bulle rend le focus a la toile s'il etait chez elle ; avant son retrait du DOM.
  useLayoutEffect(() => {
    const el = bulle.current;
    return () => { if (el?.contains(document.activeElement)) toileDe(el)?.focus({ preventScroll: true }); };
  }, [bulle]);
}

/**
 * La bulle occupe une bande de la toile, en haut ou en bas ; une fois par etape, la vue se recadre pour que tout le plan tienne a
 * cote d'elle. La bulle ne cache jamais le dessin qu'elle demande de toucher, et elle ne se lit que sur le fond de la toile.
 */
function useCadrage(etape: EtapeVisite, pose: Pose | null): void {
  const { dessin } = useDessin(), { vues } = useInterface();
  const fait = useRef<EtapeVisite | null>(null);
  useLayoutEffect(() => {
    const zone = pose?.zone;
    if (!pose || !zone || pose.etape !== etape || fait.current === etape) return;
    fait.current = etape;
    vues.poserVue(cadrage(dessin.vb, { l: zone.l, h: zone.h }, pose.placement.reserve));
    // Le cadrage ne suit que l'entree dans l'etape : un zoom de la personne ensuite reste le sien.
  }, [etape, pose]);
}

function Bulle({ v, etape }: { v: Visite; etape: EtapeVisite }) {
  const bulle = useRef<HTMLDivElement>(null);
  const idTitre = useId(), idCorps = useId();
  const pose = usePose(bulle, cibleEtape(etape, v.contexte), etape);
  useCadrage(etape, pose);
  useFocusBulle(bulle, etape);
  const t = texteEtape(etape, v.contexte);
  const p = pose?.placement;
  const style: CSSProperties = p ? { left: p.x, top: p.y } : { visibility: 'hidden' };
  const clavier = (e: KE<HTMLDivElement>) => {
    // Echap dans la bulle quitte la visite, et rien d'autre : l'editeur derriere ne doit pas aussi se fermer.
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); v.quitter(false); }
  };
  return (
    <>
      {pose?.cible ? <RepereCible cible={pose.cible} dedans={pose.placement.cote === 'dedans'} /> : null}
      <div ref={bulle} id="visite-guidee" className={'bulle-visite ' + (p?.cote ?? 'dedans')} role="dialog" aria-labelledby={idTitre} aria-describedby={idCorps} tabIndex={-1} style={style} onKeyDown={clavier}>
        {p && p.fleche !== null ? <span className="bulle-fleche" aria-hidden="true" style={{ left: p.fleche }} /> : null}
        <p className="bulle-progression">{progression(etape)}</p>
        <h2 id={idTitre} className="bulle-titre">{t.titre}</h2>
        <p id={idCorps} className="bulle-corps">{t.corps}</p>
        {etape === 'fin' ? <Suites v={v} /> : null}
        <div className="bulle-actions">
          {etape === 'fin' ? null : <button type="button" className="discret" onClick={() => v.quitter(false)}>Passer la visite</button>}
          <span className="espace" />
          {etape !== 'choisir' && etape !== 'fin' ? <button type="button" onClick={v.precedent}>Précédent</button> : null}
          {/* Une seule cle pour « Suivant » et « Terminer » : le meme bouton change de nom, le focus reste dessus. */}
          <button key="avancer" type="button" onClick={etape === 'fin' ? () => v.quitter(true) : v.suivant}>{etape === 'fin' ? 'Terminer' : 'Suivant'}</button>
        </div>
      </div>
    </>
  );
}

/** Le filet autour de ce que montre l'etape : il laisse passer les clics, on ne le voit pas au lecteur d'ecran. */
function RepereCible({ cible, dedans }: { cible: Rect; dedans: boolean }) {
  const pas = dedans ? -3 : 3;
  return <div className={'visite-cible' + (dedans ? ' dedans' : '')} aria-hidden="true" style={{ left: cible.x - pas, top: cible.y - pas, width: cible.l + 2 * pas, height: cible.h + 2 * pas }} />;
}

/** Les trois suites de la fin, selon ce que ce contexte permet : convertir (la page), la bibliotheque (si l'editeur l'a), la Cricut. */
function Suites({ v }: { v: Visite }) {
  const ac = useActions(), mo = useDessin();
  const ouvrirPanneau = (titre: string) => {
    if (avecTiroirs()) ac.poserTiroir('inspecteur');
    // Apres le rendu (et le focus que prend un tiroir qui s'ouvre) : la section voulue s'ouvre et prend le focus.
    setTimeout(() => {
      const section = Array.from(document.querySelectorAll<HTMLDetailsElement>('.editeur-inspecteur details.section')).find(d => d.querySelector('summary')?.textContent?.startsWith(titre));
      if (!section) return;
      section.open = true;
      section.scrollIntoView({ block: 'nearest' });
      section.querySelector<HTMLElement>('summary')?.focus();
    }, 60);
  };
  const convertir = v.convertir;
  return (
    <ul className="bulle-suites" aria-label="Pour la suite">
      {convertir ? (
        <li><button type="button" onClick={() => { v.quitter(true); if (mo.h.passe.length) ac.enregistrerTout(); else ac.fermer(); convertir(); }}>Convertir une image en SVG</button></li>
      ) : null}
      {mo.bibliotheque ? (
        <li><button type="button" onClick={() => { v.quitter(true); ac.choisir([]); ac.poserOutil('selection'); ouvrirPanneau('Bibliothèque de formes'); }}>Prendre une forme dans la bibliothèque</button></li>
      ) : null}
      <li><button type="button" onClick={() => { v.quitter(true); ac.poserProduction(CHOIX_CRICUT); ouvrirPanneau('Prêt pour'); }}>Préparer pour une Cricut</button></li>
    </ul>
  );
}
