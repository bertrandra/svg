import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Ce que le depot ne doit jamais proposer a un commit : sans ces regles, un worktree d'agent ou un lien
// node_modules apparait en « fichier non suivi » et bloque la fin de session. On interroge git lui-meme
// (check-ignore), pas le texte du fichier : c'est son interpretation qui compte. Le test vit dans un depot
// temporaire qui ne contient que le .gitignore : le resultat ne depend ni d'un node_modules en lien
// symbolique (git refuse alors de lire en dessous), ni de l'existence de .claude/worktrees (une regle de
// dossier ne reconnait qu'un dossier qui existe ou un chemin qui passe dedans).

const racine = join(__dirname, '../../..');
let depot = '';

beforeAll(() => {
  depot = mkdtempSync(join(tmpdir(), 'gitignore-'));
  execFileSync('git', ['init', '-q', depot]);
  copyFileSync(join(racine, '.gitignore'), join(depot, '.gitignore'));
});
afterAll(() => { rmSync(depot, { recursive: true, force: true }); });

const ignore = (chemin: string): boolean => {
  try { execFileSync('git', ['check-ignore', '--no-index', '-q', chemin], { cwd: depot }); return true; } catch { return false; }
};

describe('.gitignore', () => {
  it.each([
    'node_modules', 'node_modules/vitest/package.json', 'dist/editeur-svg.html', 'coverage/lcov.info', 'x.log',
    '.claude/worktrees/agent-a1b2c3', '.claude/worktrees/agent-a1b2c3/src/zones/EditeurSvg.tsx', '.claude/settings.local.json'
  ])('ignore %s', chemin => {
    expect(ignore(chemin)).toBe(true);
  });

  it.each(['src/zones/EditeurSvg.tsx', 'docs/jetons.md', 'tests/fixtures/svg/arcs.svg', '.claude/skills/exemple/SKILL.md', '.claude/settings.json'])('ne cache pas %s', chemin => {
    expect(ignore(chemin)).toBe(false);
  });
});
