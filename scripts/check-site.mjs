import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/xinghui-admin-vue3/';
export const DOCS_BASE = `${BASE}docs/`;
export const ADAPTER_MARKER = 'XINGHUI_STATIC_DEMO_LOCAL_ONLY_V1';
export const API_SENTINEL = '/__static_demo_local_only__';
const ORIGIN = 'https://pages.invalid';
const chapters = {
  overview: ['introduction', 'capabilities', 'reading-path'],
  guide: [
    'quickstart',
    'environment',
    'configuration',
    'first-login',
    'verification',
  ],
  reference: [
    'api-conventions',
    'api-catalog',
    'error-codes',
    'database-migrations',
  ],
  operations: [
    'deployment',
    'backup-restore',
    'troubleshooting',
    'security',
    'quality-gates',
  ],
  releases: ['versions', 'changelog', 'upgrade'],
  contributing: ['gitflow', 'contribution', 'documentation'],
  features: [
    'accounts',
    'authorization',
    'menus',
    'dictionary',
    'parameters',
    'business-config',
    'files',
    'bulk',
    'scheduler',
    'notifications',
    'ai',
    'lowcode',
    'news',
  ],
  development: [
    'structure',
    'module-extension',
    'routes-permissions',
    'request-state',
    'tenant-platform',
    'scheduler-handler',
    'notification-event',
    'ai-extension',
    'lowcode-extension',
  ],
  components: [
    'overview',
    'paged-list',
    'edit-detail',
    'dictionary-select',
    'file-upload',
    'permission-action',
    'feedback',
    'form-table',
  ],
};
export const REQUIRED_DOCS = [
  'index',
  ...Object.entries(chapters).flatMap(([group, names]) =>
    names.map((name) => `${group}/${name}`),
  ),
];
const textExtensions = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.svg',
  '.txt',
  '.webmanifest',
  '.xml',
]);
const allowedExtensions = new Set([
  ...textExtensions,
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.wasm',
]);

export function ensure(condition, code, message) {
  if (!condition) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    throw error;
  }
}

export function checkFilename(relative) {
  const name = path.posix.basename(relative);
  ensure(
    !relative
      .split('/')
      .some((part) => part.startsWith('.') && part !== '.nojekyll'),
    'PRIVATE_FILE',
    relative,
  );
  ensure(
    !/\.(?:map|log|sql|dump|pem|key|dpapi|p12|pfx|zip|tar|gz|ts|tsx|vue|md|ya?ml)$/i.test(
      name,
    ),
    'PRIVATE_FILE',
    relative,
  );
  ensure(
    !/(?:TASK_BOARD|COMMUNICATION|_TASK(?:\.|_)|DELIVERY|HANDOFF|QA[_-]LOG|ID_RSA|CREDENTIALS)/i.test(
      name,
    ),
    'PRIVATE_FILE',
    relative,
  );
  ensure(
    allowedExtensions.has(path.posix.extname(name).toLowerCase()) ||
      /^(?:LICENSE|NOTICE)(?:\.[\w.-]+)?$/i.test(name) ||
      name === '.nojekyll',
    'UNREVIEWED_FILE',
    relative,
  );
}

export function scanText(text, relative) {
  // Only high-confidence private material is rejected. Documentation may explain
  // JWT_SECRET, /api, localhost and other public configuration examples.
  const forbidden = [
    [
      'PRIVATE_KEY',
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    ],
    [
      'VENDOR_TOKEN',
      /\b(?:sk-or-v1-[A-Za-z0-9]{24,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}|sk-proj-[A-Za-z0-9_-]{24,})/,
    ],
    [
      'ISSUED_JWT',
      /\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}\b/,
    ],
    [
      'PRIVATE_PATH',
      /(?:\b[A-Z]:(?:\/+|\\+)(?=[\p{L}\p{N}_.~$@%-])|\/Users\/[^/\s]+\/|\.qa-local[\\/])/iu,
    ],
    [
      'PRIVATE_FIXTURE',
      /\b(?:oss\d{2}_current_\d{8}\w*|[a-z][a-z0-9_]*_qa_\d{8}|qa_(?:ci|oss|bulk|wx|ai))\b/i,
    ],
    ['DPAPI_FILE', /[\w.-]+\.machine\.dpapi/i],
    ['SOURCE_MAP', /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/],
  ];
  for (const [code, pattern] of forbidden)
    ensure(!pattern.test(text), code, relative);
}

export function checkManifest(manifest) {
  const required = {
    schemaVersion: 1,
    mode: 'static-demo',
    apiTransport: 'local-only',
    persistence: 'browser-local',
    base: BASE,
    docsBase: DOCS_BASE,
  };
  for (const [key, value] of Object.entries(required))
    ensure(manifest?.[key] === value, 'DEMO_MANIFEST', `Invalid ${key}`);
}

const decodeEntities = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) =>
      String.fromCodePoint(
        code[0].toLowerCase() === 'x'
          ? parseInt(code.slice(1), 16)
          : Number(code),
      ),
    );

export function tags(html) {
  // Tokenize attributes without executing any HTML or embedded JavaScript.
  const result = [];
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, '$1$2');
  for (const match of stripped.matchAll(
    /<([a-z][\w:-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/gi,
  )) {
    const attributes = {};
    for (const attribute of match[2].matchAll(
      /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g,
    ))
      attributes[attribute[1].toLowerCase()] = decodeEntities(
        attribute[2] ?? attribute[3] ?? attribute[4] ?? '',
      );
    result.push({ name: match[1].toLowerCase(), attributes });
  }
  return result;
}

export function localTarget(
  value,
  from,
  files,
  { resource = false, image = false, docs404 = false } = {},
) {
  ensure(typeof value === 'string' && value.trim().length, 'EMPTY_URL', from);
  const input = value.trim();
  if (image && /^data:image\//i.test(input)) return null;
  if (!resource && /^(?:https?:|mailto:|tel:)/i.test(input)) return null;
  ensure(
    !/^(?:data:|blob:|javascript:|vbscript:)/i.test(input),
    'UNSAFE_URL',
    from,
  );
  ensure(
    !input.includes('\\') && !/[\u0000-\u001f\u007f]/.test(input),
    'UNSAFE_URL',
    from,
  );
  let url;
  try {
    url = new URL(input, `${ORIGIN}${BASE}${from}`);
  } catch {
    ensure(false, 'INVALID_URL', from);
  }
  ensure(url.origin === ORIGIN, 'EXTERNAL_RESOURCE', from);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    ensure(false, 'INVALID_URL', from);
  }
  ensure(pathname.startsWith(BASE), 'PROJECT_BASE', `${from}: ${input}`);
  ensure(
    !pathname.includes('\\') && !pathname.split('/').includes('..'),
    'UNSAFE_URL',
    from,
  );
  if (docs404 && resource)
    ensure(pathname.startsWith(DOCS_BASE), 'ROOT_404_BASE', from);
  const relative = pathname.slice(BASE.length);
  const candidates =
    !relative || relative.endsWith('/')
      ? [`${relative}index.html`]
      : [relative, `${relative}.html`, `${relative}/index.html`];
  const target = candidates.find((candidate) => files.has(candidate));
  ensure(target, 'MISSING_RESOURCE', `${from}: ${input}`);
  if (url.hash && !resource && !url.hash.startsWith('#/')) {
    const text = files.get(target)?.text;
    if (text && target.endsWith('.html')) {
      const anchor = decodeURIComponent(url.hash.slice(1));
      ensure(
        tags(text).some(
          (tag) =>
            tag.attributes.id === anchor || tag.attributes.name === anchor,
        ),
        'MISSING_ANCHOR',
        `${from}: ${input}`,
      );
    }
  }
  return target;
}

export function checkDocument(html, name) {
  const region =
    name === 'index'
      ? html
      : html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i)?.[1];
  ensure(region, 'DOC_BODY', name);
  const title = region.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1];
  ensure(title?.replace(/<[^>]*>/g, '').trim(), 'DOC_TITLE', name);
  const text = region
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  ensure(text.length >= 100, 'DOC_BODY', name);
  return createHash('sha256').update(text).digest('hex');
}

export function checkNotFoundHtml(html, file) {
  if (/<h1\b[^>]*>[\s\S]*?\S[\s\S]*?<\/h1\s*>/i.test(html)) return;
  // VitePress emits its 404 as a client-rendered shell. Require its actual
  // localized site data and project-rooted module loader, not an empty page.
  const markup = tags(html);
  const data = html.match(
    /window\.__VP_SITE_DATA__\s*=\s*(?:deserializeFunctions\()?JSON\.parse\(\s*("(?:[^"\\]|\\.)*")\s*\)\)?\s*;/,
  );
  let config;
  try {
    config = data && JSON.parse(JSON.parse(data[1]));
  } catch {
    ensure(false, 'EMPTY_404', file);
  }
  ensure(
    /<title>\s*404(?:\s|\|)/i.test(html) &&
      markup.some((tag) => tag.attributes.id === 'app') &&
      markup.some(
        (tag) =>
          tag.name === 'script' &&
          tag.attributes.type === 'module' &&
          tag.attributes.src?.startsWith(DOCS_BASE),
      ) &&
      config?.base === DOCS_BASE &&
      ['title', 'quote', 'linkText', 'linkLabel'].every(
        (key) =>
          typeof config?.themeConfig?.notFound?.[key] === 'string' &&
          config.themeConfig.notFound[key].trim(),
      ),
    'EMPTY_404',
    file,
  );
}

export function checkDemoHtml(html) {
  const meta = tags(html).filter(
    (tag) =>
      tag.name === 'meta' &&
      tag.attributes['http-equiv']?.toLowerCase() === 'content-security-policy',
  );
  ensure(meta.length === 1, 'DEMO_CSP', 'Exactly one demo CSP is required');
  const directives = new Map();
  for (const item of meta[0].attributes.content.split(';')) {
    const [name, ...values] = item.trim().split(/\s+/);
    if (!name) continue;
    ensure(!directives.has(name), 'DEMO_CSP', 'Duplicate directive');
    directives.set(name, values.join(' '));
  }
  for (const directive of ['connect-src', 'form-action', 'object-src'])
    ensure(directives.get(directive) === "'none'", 'DEMO_CSP', directive);
  ensure(
    /window\.__XINGHUI_STATIC_DEMO__\s*=\s*Object\.freeze\(/.test(html) &&
      html.includes(ADAPTER_MARKER) &&
      /VITE_APP_DEMO\s*:\s*true/.test(html),
    'DEMO_HTML',
    'Explicit enabled demo marker is required',
  );
}

export function checkRuntimeConfig(text) {
  const assignment = text.match(
    /\bwindow\.[$\w]+\s*=\s*(?:(\{[^;]*?\})|Object\.freeze\(\s*(\{[^;]*?\})\s*\))\s*;/,
  );
  ensure(assignment, 'RUNTIME_CONFIG', 'Expected generated JSON configuration');
  let config;
  try {
    config = JSON.parse(assignment[1] ?? assignment[2]);
  } catch {
    ensure(false, 'RUNTIME_CONFIG', 'Configuration must be literal JSON');
  }
  ensure(
    config.VITE_GLOB_API_URL === API_SENTINEL,
    'REAL_API_CONFIG',
    'Static demo sentinel is required',
  );
  for (const [key, value] of Object.entries(config)) {
    if (/API.*(?:URL|BASE)|(?:URL|BASE).*API/i.test(key))
      ensure(value === API_SENTINEL, 'REAL_API_CONFIG', key);
    if (
      /JWT_SECRET|CONFIG_MASTER_KEY|DB_PASSWORD|REDIS_PASSWORD|MAIL_PASS|API_KEY|APP_SECRET|ACCESS_KEY|SECRET_KEY/i.test(
        key,
      )
    )
      ensure(value === '' || value === null, 'SERVER_SECRET_CONFIG', key);
  }
}

export function checkDocumentation(files) {
  const docs = new Set();
  for (const chapter of REQUIRED_DOCS) {
    const file = [`docs/${chapter}.html`, `docs/${chapter}/index.html`].find(
      (candidate) => files.has(candidate),
    );
    ensure(file, 'DOC_MISSING', chapter);
    const hash = checkDocument(files.get(file).text, chapter);
    ensure(!docs.has(hash), 'DUPLICATE_DOC', chapter);
    docs.add(hash);
  }
  return docs;
}

function walk(root) {
  ensure(
    existsSync(root) &&
      lstatSync(root).isDirectory() &&
      !lstatSync(root).isSymbolicLink(),
    'SITE_MISSING',
    'Reviewed site directory is required',
  );
  const files = new Map();
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const stat = lstatSync(absolute);
      ensure(!stat.isSymbolicLink(), 'LINKED_FILE', relative);
      if (stat.isDirectory()) {
        ensure(!entry.name.startsWith('.'), 'PRIVATE_FILE', relative);
        visit(absolute);
      } else {
        ensure(stat.isFile() && stat.nlink === 1, 'LINKED_FILE', relative);
        checkFilename(relative);
        const text =
          textExtensions.has(path.extname(entry.name).toLowerCase()) ||
          /^(LICENSE|NOTICE)/i.test(entry.name)
            ? readFileSync(absolute, 'utf8')
            : null;
        if (text !== null) scanText(text, relative);
        files.set(relative, { absolute, text, bytes: stat.size });
      }
    }
  };
  visit(root);
  return files;
}

export function checkSite(directory = 'site') {
  const root = path.resolve(directory);
  const files = walk(root);
  for (const required of [
    'index.html',
    '404.html',
    'docs/index.html',
    'docs/404.html',
    '_app.config.js',
    'demo-manifest.json',
    '.nojekyll',
  ])
    ensure(files.has(required), 'REQUIRED_FILE', required);
  ensure(
    tags(files.get('index.html').text).some(
      (tag) => tag.attributes.id === 'app',
    ),
    'APP_ENTRY',
    'Missing application mount',
  );
  checkDemoHtml(files.get('index.html').text);
  for (const file of ['404.html', 'docs/404.html'])
    checkNotFoundHtml(files.get(file).text, file);
  let manifest;
  try {
    manifest = JSON.parse(files.get('demo-manifest.json').text);
  } catch {
    ensure(false, 'DEMO_MANIFEST', 'Missing valid manifest JSON');
  }
  checkManifest(manifest);
  checkRuntimeConfig(files.get('_app.config.js').text);
  const docs = checkDocumentation(files);
  let resourceCount = 0;
  let htmlCount = 0;
  const appEntries = new Set();
  for (const [file, item] of files) {
    if (file.endsWith('.html')) {
      htmlCount++;
      ensure(!/<base\b/i.test(item.text), 'HTML_BASE_OVERRIDE', file);
      for (const { name, attributes: a } of tags(item.text)) {
        const resources = [];
        if (name === 'script' && a.src !== undefined)
          resources.push([a.src, false]);
        if (
          name === 'link' &&
          /(?:stylesheet|modulepreload|preload|prefetch|icon)/i.test(
            a.rel ?? '',
          )
        )
          resources.push([a.href, false]);
        if (
          ['img', 'source', 'audio', 'video', 'iframe', 'embed'].includes(
            name,
          ) &&
          a.src !== undefined
        )
          resources.push([a.src, name === 'img' || name === 'source']);
        if (name === 'video' && a.poster !== undefined)
          resources.push([a.poster, true]);
        if (name === 'image' && (a.href || a['xlink:href']))
          resources.push([a.href || a['xlink:href'], true]);
        if (a.srcset && !a.srcset.startsWith('data:'))
          for (const value of a.srcset.split(','))
            resources.push([value.trim().split(/\s+/)[0], true]);
        for (const [value, image] of resources) {
          const target = localTarget(value, file, files, {
            resource: true,
            image,
            docs404: file === '404.html',
          });
          resourceCount++;
          if (
            file === 'index.html' &&
            name === 'script' &&
            target?.endsWith('.js')
          )
            appEntries.add(target);
        }
        if (name === 'a' && a.href) localTarget(a.href, file, files);
      }
      // Inline analytics/external executable sources are not documentation examples.
      for (const script of item.text.matchAll(
        /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi,
      )) {
        ensure(
          !/(?:\b(?:fetch|import|importScripts)\s*\(\s*["'`]https?:\/\/|\.(?:src|href)\s*=\s*["'`]https?:\/\/|hm\.baidu\.com|google-analytics\.com)/i.test(
            script[1],
          ),
          'INLINE_NETWORK_SCRIPT',
          file,
        );
      }
    } else if (file.endsWith('.css')) {
      const css = item.text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of css.matchAll(
        /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
      )) {
        const value = match[1] ?? match[2] ?? match[3];
        if (/^data:(?:image|font|application\/font)/i.test(value)) continue;
        localTarget(value, file, files, { resource: true, image: true });
        resourceCount++;
      }
      for (const match of css.matchAll(/@import\s+["']([^"']+)["']/gi))
        localTarget(match[1], file, files, { resource: true });
    }
  }
  ensure(
    appEntries.size,
    'APP_ENTRY',
    'Application HTML must reference its built JavaScript',
  );
  const reachable = new Set();
  const visitScript = (file) => {
    if (reachable.has(file)) return;
    ensure(
      !file.startsWith('docs/'),
      'APP_ENTRY',
      'Documentation cannot act as the demo adapter',
    );
    reachable.add(file);
    const source = files.get(file).text;
    // Inspect concrete JS module specifiers in generated app chunks. Shared
    // libraries may contain fetch/XHR or /api without executing those transports.
    for (const match of source.matchAll(
      /\b(?:from|import)\s*(?:\(\s*)?["']([^"'\s]+\.(?:m?js)(?:\?[^"']*)?)["']/g,
    )) {
      const target = localTarget(match[1], file, files, { resource: true });
      visitScript(target);
    }
  };
  for (const file of appEntries) visitScript(file);
  const evidence = [...reachable].filter((file) =>
    files.get(file).text.includes(ADAPTER_MARKER),
  );
  ensure(
    evidence.length,
    'DEMO_ADAPTER',
    'No local-only adapter marker in reachable application chunks',
  );
  return {
    status: 'passed',
    base: BASE,
    docsBase: DOCS_BASE,
    documents: docs.size,
    htmlFiles: htmlCount,
    files: files.size,
    resources: resourceCount,
    appChunks: reachable.size,
    adapterEvidence: evidence.map((file) => ({
      file,
      sha256: createHash('sha256').update(files.get(file).text).digest('hex'),
    })),
    limitation:
      'Static evidence only; browser verification must confirm no API/provider requests and supported local operations.',
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(checkSite(process.argv[2] ?? 'site'), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
