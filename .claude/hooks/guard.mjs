#!/usr/bin/env node
// PreToolUse guard for Bash. Glob deny rules in settings.json are easy to sidestep
// (`git -C . push --force`, `npx netlify env:set ...`, `cat .env.local`), so this checks the
// whole command text with regexes. Exit 2 blocks the call and tells Claude why.
// This is defense in depth, not a sandbox: code run by node/npm can still read files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

let cmd = '';
let cwd = process.cwd();
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  cmd = input?.tool_input?.command ?? '';
  if (typeof input?.cwd === 'string' && input.cwd) cwd = input.cwd;
} catch { process.exit(0); }
if (typeof cmd !== 'string' || cmd === '') process.exit(0);

const block = why => {
  process.stderr.write(`Blocked by PathCheck guard (.claude/hooks/guard.mjs): this command ${why}. ` +
    'This is a hard limit from CLAUDE.md. If it is genuinely needed, stop and ask the human to run it.\n');
  process.exit(2);
};

// `git [-C dir] [-c k=v] [--any-global-option] <sub> <args...>` — args captured up to the next shell separator.
const gitSub = sub => new RegExp(String.raw`\bgit(?:\s+(?:-[Cc]\s+\S+|--?[\w-]+(?:=\S+)?))*\s+(?:${sub})\b([^|;&]*)`, 'g');

// --- Secrets -------------------------------------------------------------------------
// Messages may mention ".env"; allow that only when nothing in the command executes.
const messageOnly = /^\s*(git\s+commit|gh\s+pr\s+(create|edit|comment))\b/.test(cmd) && !/\$\(|`|<|\||;|&|\n/.test(cmd) && !/(^|\s)(--body-file|-F)(?=[\s=]|$)/.test(cmd);
if (!messageOnly && /(^|[\s'"`=:/(<])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'"`;|&)>/*])/.test(cmd)) block('reads or touches a .env secret file');
// Spellings the shell would turn into a secret file name: quotes or backslashes inside the
// name (.e"nv"), and globs or braces on a dotfile name (.e*, .en?, .[e]nv, .{env,x}).
const unquoted = cmd.replace(/\$\{[^}]*\}/g, '').replace(/\$(?=['"])/g, '').replace(/['"\\]/g, '');
if (!messageOnly && unquoted !== cmd && /(^|[\s=:/(<])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s;|&)>/*])/.test(unquoted)) block('reads or touches a .env secret file');
const secretNames = ['.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test'];
// Shell pattern -> regex. Bracket expressions ([e], [!a], [[:alpha:]]) become "any
// character": blocking slightly too much is fine. (a|b) is zsh grouping, {a,b} is braces.
const globToRegex = glob => new RegExp('^' + glob
  .replace(/\[(?:\[:\w+:\]|[^\]])*\]/g, '?')
  .replace(/[.+^$]/g, '\\$&')
  .replace(/\{([^{}]*)\}/g, (_, list) => '(' + list.split(',').join('|') + ')')
  .replace(/\*/g, '.*')
  .replace(/\?/g, '.') + '$');
if (!messageOnly) {
  // Three ways to cut the command into words, so a pattern is seen whole however it is
  // wrapped: `cat .(e|x)nv`, `$(cat .e*)`, `{cat,.e*}`.
  for (const [separators, unparsable] of [[/[\s;&<>=`]+/, false], [/[\s;&<>=`()|]+/, true], [/[\s;&<>=`()|{},]+/, true]]) {
    for (const token of unquoted.split(separators)) {
      const name = token.slice(token.lastIndexOf('/') + 1);
      if (!name.startsWith('.') || !/[*?[{(]/.test(name)) continue;
      let matches;
      try { const re = globToRegex(name); matches = secretNames.some(secret => re.test(secret)); } catch { matches = unparsable; }
      if (matches) block('uses a wildcard that matches a .env secret file');
    }
  }
  if (/\*\(D\)|\bGLOBIGNORE\b|\bdotglob\b|\bglob_?dots\b/i.test(cmd)) block('makes wildcards match hidden files');
}
if (/\.(pem|key)\b(?=$|[\s'"`;|&)])/.test(cmd)) block('touches a private key file');
if (/(^|[|;&(]\s*|\$\(\s*|\b(then|do|else)\s+)(env(\s+-0)?|export(\s+-p)?|set|declare(\s+-x)?|typeset(\s+-x)?)(?=\s*($|[|;&>)\n]))/.test(cmd)) block('prints environment variables');
if (!messageOnly && /\bprintenv\b|\b(declare|typeset)\s+-[a-zA-Z]*p\b/.test(cmd)) block('prints an environment variable');
const secretName = String.raw`\w*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)\w*`;
if (new RegExp(String.raw`\$\{?!?${secretName}`).test(cmd)) block('reads a secret-named environment variable');
if (new RegExp(String.raw`process\.env\s*(\.|\[\s*['"\x60]?)${secretName}|\bos\.environ\b|\bgetenv\s*\(`).test(cmd)) block('reads a secret-named environment variable');
if (/\.config\/gh\/hosts|\.netlify\/|\.config\/netlify|Library\/Preferences\/netlify|\bsecurity\s+find-(generic|internet)-password\b|\bgh\s+auth\s+token\b/.test(cmd)) block('reads a stored login token');

// --- Git ---------------------------------------------------------------------------
for (const m of cmd.matchAll(gitSub('push'))) {
  const args = m[1] ?? '';
  if (/(^|\s|:)['"]?(refs\/heads\/)?(main|master)['"]?(?=\s|$)/.test(args)) block('pushes to main');
  if (/(^|\s)(-[a-zA-Z]*[fd][a-zA-Z]*|--force\S*|--mirror|--all|--delete|--prune)(?=\s|$)/.test(args)) block('force/mirror/delete push');
  if (/\s['"]?[+:]\S/.test(args)) block('force (+) or delete (:) refspec push');

  // A push that does not plainly name a branch pushes the current one: not allowed on main.
  // Words after the remote count as naming a branch only if they are simple names
  // (not HEAD, not $(...) or a variable); redirections, comments and option values don't count.
  const words = args.split(/\n|\s#/)[0].trim().split(/\s+/).filter(Boolean);
  const positional = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/['"]/g, '');
    if (/^(-o|--push-option|--receive-pack|--exec|--repo)$/.test(word)) { i++; continue; }
    if (word.startsWith('-') || /^\d*[<>]/.test(word)) continue;
    positional.push(word);
  }
  const refspecs = positional.slice(1);
  const namesBranch = refspecs.length > 0 && refspecs.every(ref => /^[\w./-]+(:[\w./-]+)?$/.test(ref) && !/^(HEAD|@)(:|$)/.test(ref));
  if (namesBranch) continue;

  // Which branch is current? The last checkout/switch earlier in the same command decides
  // if there is one; otherwise ask git, in the directory the push runs in (-C or cd).
  const before = cmd.slice(0, m.index);
  const switches = [...before.matchAll(/\bgit\b[^|;&\n]*?\b(?:checkout|switch)\b([^|;&\n]*)/g)];
  if (switches.length > 0) {
    const target = switches[switches.length - 1][1];
    const creates = /(^|\s)(-[bBcC]|--orphan)(?=\s|$)/.test(target);
    if (!creates && /(^|\s)['"]?(main|master)['"]?(?=\s|$)/.test(target)) block('pushes the current branch after switching to main');
    continue;
  }
  const dashC = /\s-C\s+(['"]?)([^\s'"]+)\1/.exec(m[0].slice(0, m[0].length - args.length));
  const cds = [...before.matchAll(/(?:^|[;&|\n(]\s*)cd\s+(['"]?)([^\s'";&|)]+)\1/g)];
  let dir = dashC?.[2] ?? cds[cds.length - 1]?.[2] ?? '.';
  if (dir.startsWith('~')) dir = homedir() + dir.slice(1);
  if (/[$`*]/.test(dir)) block('pushes the current branch from a directory the guard cannot check');
  let branch = '';
  try { branch = execFileSync('git', ['branch', '--show-current'], { cwd: resolve(cwd, dir), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a repository */ }
  if (branch === 'main' || branch === 'master') block('pushes the current branch, which is main');
}
if (gitSub('clean|filter-branch|filter-repo').test(cmd)) block('git clean or history rewrite');
if (gitSub(String.raw`reset\s+--hard|branch\s+-D|worktree\s+remove|update-ref\s+-d`).test(cmd)) block('destructive git operation');

// --- GitHub admin surfaces -------------------------------------------------------------
if (/\bgh\s+(api|secret|ruleset|variable)\b/.test(cmd)) block('GitHub API/secret/ruleset access');
if (/\bgh\s+(repo\s+(edit|delete|rename|archive)|release\s+delete)\b/.test(cmd)) block('changes GitHub repository settings');
if (/\bgh\s+pr\s+merge\b[^|;&]*--admin\b/.test(cmd)) block('admin merge bypass');
if (/\bgh\s+(workflow\s+(disable|enable)|run\s+(cancel|delete))\b/.test(cmd)) block('disables or cancels CI');
if (/\[(skip[ -](ci|actions)|(ci|actions)[ -]skip|no[ -]ci)\]/i.test(cmd)) block('skips CI');

// --- Netlify (bare or via npx) ---------------------------------------------------------
if (/\bnetlify\s+(env(:\S*)?|api|sites:delete)(?=\s|$)/.test(cmd)) block('Netlify env/secret or admin API');
// Production deploys happen only at M3, after the owner's check; the owner runs them.
// Staging/preview deploys (no --prod) stay allowed.
if (/\bnetlify\s+deploy\b[^|;&\n]*\s(--prod[\w-]*|-[a-zA-Z]*p[a-zA-Z]*)(?=[\s=]|$)/.test(cmd)) block('deploys to production');

// --- Network: remote code and data leaving the machine -----------------------------------
const fetches = /\b(curl|wget)\b/.test(cmd);
if (fetches && /\|\s*(sudo\s+)?((ba|z|da|k)?sh|node|python3?|perl|ruby)\b/.test(cmd)) block('pipes downloaded content into an interpreter');
if (/<\(\s*(curl|wget)\b/.test(cmd)) block('runs downloaded content');
if (fetches) {
  const local = /https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?=[:/\s'"]|$)/i.test(cmd);
  const remoteUrl = /https?:\/\/(?!(127\.0\.0\.1|localhost|\[::1\])(?=[:/\s'"]|$))/i.test(cmd);
  const writes = /(\s(-d|--data\S*|-F|--form\S*|-T|--upload-file|--post-file|--post-data)(?=[\s=@'"]|$))|(\s(-X|--request)\s*['"]?(POST|PUT|PATCH|DELETE)\b)|(\s-[a-zA-Z]*[dFT]@)/i.test(cmd);
  if (writes && (!local || remoteUrl)) block('sends data or a file to a non-local host');
}

// --- Filesystem wipes -----------------------------------------------------------------
for (const m of cmd.matchAll(/\brm\s+((?:(?:-[a-zA-Z]+|--recursive|--force)\s+)+)(?:--\s+)?(['"]?)([^\s'"]+)\2/g)) {
  const flags = m[1], target = m[3];
  if (!/(-[a-zA-Z]*r|--recursive)/i.test(flags)) continue;
  if (/^(\/\*?|\/[A-Za-z]+\/?|~(\/.*)?|\$HOME(\/.*)?|\$\{HOME\}(\/.*)?|\.\.?\/?|\*)$/.test(target)) block('recursive delete of a top-level or home path');
}
process.exit(0);
