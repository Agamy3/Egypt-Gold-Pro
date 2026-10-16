import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';
const require = createRequire(import.meta.url);
const strip = require('strip-json-comments');
const root = path.resolve(import.meta.dirname, '..');
const read = file => JSON.parse(strip(fs.readFileSync(path.join(root, file), 'utf8')));
const base = read('wrangler.cron.jsonc');
const website = read('wrangler.jsonc');
const localFile = path.join(root, '.dev.vars');
const localVars = fs.existsSync(localFile) ? parseEnv(fs.readFileSync(localFile, 'utf8')) : {};
// Only background-job configuration. No billing, trading, OpenAI or admin keys.
const allowed = ['CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'GOLDAPI_API_KEY', 'GOLDAPI_KEY', 'NEWS_RSS_FEEDS_JSON', 'NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL',
  'NOTIF_FROM_EMAIL', 'NOTIF_FROM_NAME', 'RESEND_API_KEY', 'RESEND_BASE_URL',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'VAPID_PRIVATE_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_SUBJECT',
  'TELEGRAM_BOT_TOKEN', 'EG_AGGREGATION_MIN_SOURCES', 'MARKET_HEALTH_FRESHNESS_HOURS',
  'INGESTION_DEBUG', 'MARKET_DEBUG', 'SUPABASE_AUTH_DEBUG'];
const vars = Object.fromEntries(allowed.flatMap(key => {
  const value = process.env[key] ?? localVars[key] ?? website.vars?.[key];
  return typeof value === 'string' ? [[key, value]] : [];
}));
for (const key of ['CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!vars[key]) throw new Error(`Missing job configuration: ${key}`);
}
const dir = path.join(root, '.cron-worker');
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
// Keep config beside tsconfig.json: Wrangler resolves TypeScript paths from it.
const file = path.join(root, '.wrangler.jobs.deploy.json');
const config = { ...base, vars };
try {
  fs.writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
  const args = [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', file];
  if (process.argv.includes('--dry-run')) args.push('--dry-run', '--outdir', path.join(dir, 'build'));
  const result = spawnSync(process.execPath, args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  // Wrangler prints configured variables. Keep those out of terminal output.
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  for (const line of output.split('\n')) {
    if (/^(Total Upload:|Worker Startup Time:|Uploaded |Deployed |Current Version ID:|--dry-run:)/.test(line)) console.log(line);
  }
  if (result.status !== 0) {
    let diagnostic = output;
    for (const value of Object.values({ ...website.vars, ...localVars, ...vars }).sort((a, b) => String(b).length - String(a).length)) {
      if (String(value).length >= 4) diagnostic = diagnostic.split(String(value)).join('[redacted]');
    }
    console.error(diagnostic.split('\n').filter(line => !line.startsWith('env.')).slice(-45).join('\n'));
    process.exitCode = result.status || 1;
  }
} finally {
  fs.rmSync(file, { force: true });
}
