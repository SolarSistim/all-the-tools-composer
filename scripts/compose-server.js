/**
 * Compose Server — local dev tool for editing JSON content files.
 * Runs on port 3001. Only use locally; never deployed.
 *
 * Start: node scripts/compose-server.js
 * Content is stored in the local /content directory and pulled from
 * https://json.allthethings.dev on demand (or auto-pulled on first run).
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const archiver = require('archiver');

const app = express();
const PORT = 3001;

// Content lives inside this project under /content
const JSON_REPO = path.join(__dirname, '..', 'content');

const CDN_BASE = 'https://json.allthethings.dev';

// ── Netlify deploy credentials ────────────────────────────────────────────────
let netlifyToken = process.env.NETLIFY_TOKEN || '';
let netlifySiteId = process.env.NETLIFY_SITE_ID || '';
let mainSiteBuildHook = process.env.MAIN_SITE_BUILD_HOOK || '';

const CONFIG_FILE = path.join(__dirname, 'compose-config.json');
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    netlifyToken     = netlifyToken     || cfg.netlifyToken     || '';
    netlifySiteId    = netlifySiteId    || cfg.netlifySiteId    || '';
    mainSiteBuildHook = mainSiteBuildHook || cfg.mainSiteBuildHook || '';
  } catch (e) {
    console.warn('Warning: could not read compose-config.json:', e.message);
  }
}

// ── CDN pull ──────────────────────────────────────────────────────────────────

/**
 * Fetch a URL and return the response body as a string.
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}

/**
 * CDN section definitions — maps to paths on json.allthethings.dev
 * and their local mirror locations under JSON_REPO.
 */
const CDN_SECTIONS = [
  {
    key: 'blog',
    indexUrl: `${CDN_BASE}/blog/blog.json`,
    indexLocalPath: 'blog/blog.json',
    itemsKey: 'articles',
    itemUrl: (id) => `${CDN_BASE}/blog/articles/${id}.json`,
    itemLocalPath: (id) => `blog/articles/${id}.json`,
  },
  {
    key: 'resources',
    indexUrl: `${CDN_BASE}/resources/resources.json`,
    indexLocalPath: 'resources/resources.json',
    itemsKey: 'resources',
    itemUrl: (id) => `${CDN_BASE}/resources/resources/${id}.json`,
    itemLocalPath: (id) => `resources/resources/${id}.json`,
  },
  {
    key: 'artists',
    indexUrl: `${CDN_BASE}/3d-artist-spotlight/artists.json`,
    indexLocalPath: '3d-artist-spotlight/artists.json',
    itemsKey: 'artists',
    itemUrl: (id) => `${CDN_BASE}/3d-artist-spotlight/artists/${id}.json`,
    itemLocalPath: (id) => `3d-artist-spotlight/artists/${id}.json`,
  },
];

// Pull state (used to report progress via /api/pull-status)
let pullState = {
  running: false,
  lastPulledAt: null,
  counts: {},
  error: null,
};

// Load persisted pull metadata if present
const PULL_META_FILE = path.join(JSON_REPO, '.pull-meta.json');
function loadPullMeta() {
  try {
    if (fs.existsSync(PULL_META_FILE)) {
      const meta = JSON.parse(fs.readFileSync(PULL_META_FILE, 'utf-8'));
      pullState.lastPulledAt = meta.lastPulledAt || null;
      pullState.counts = meta.counts || {};
    }
  } catch (_) {}
}

function savePullMeta() {
  try {
    fs.mkdirSync(JSON_REPO, { recursive: true });
    fs.writeFileSync(
      PULL_META_FILE,
      JSON.stringify({ lastPulledAt: pullState.lastPulledAt, counts: pullState.counts }, null, 2),
      'utf-8'
    );
  } catch (_) {}
}

/**
 * Pull all content from the CDN into JSON_REPO.
 * Returns a summary { counts: { blog, resources, artists } }.
 */
async function pullFromCDN() {
  pullState.running = true;
  pullState.error = null;
  const counts = {};

  try {
    for (const sec of CDN_SECTIONS) {
      console.log(`  Pulling ${sec.key}...`);

      // Fetch and save index file
      const indexBody = await fetchUrl(sec.indexUrl);
      const indexLocalFull = path.join(JSON_REPO, sec.indexLocalPath);
      fs.mkdirSync(path.dirname(indexLocalFull), { recursive: true });
      fs.writeFileSync(indexLocalFull, indexBody, 'utf-8');

      // Parse index to get item ids
      const indexData = JSON.parse(indexBody);
      const items = indexData[sec.itemsKey] || [];
      counts[sec.key] = 0;

      // Fetch each item in parallel (batches of 10)
      const BATCH = 10;
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);
        await Promise.all(
          batch.map(async (item) => {
            const id = item.id || item.slug;
            if (!id) return;
            try {
              const body = await fetchUrl(sec.itemUrl(id));
              const localFull = path.join(JSON_REPO, sec.itemLocalPath(id));
              fs.mkdirSync(path.dirname(localFull), { recursive: true });
              fs.writeFileSync(localFull, body, 'utf-8');
              counts[sec.key]++;
            } catch (e) {
              console.warn(`    Warning: could not fetch ${id}:`, e.message);
            }
          })
        );
      }

      console.log(`  ✓ ${sec.key}: ${counts[sec.key]} files`);
    }

    pullState.lastPulledAt = new Date().toISOString();
    pullState.counts = counts;
    savePullMeta();

    console.log('  Regenerating previews...');
    const previewCount = regenerateAllPreviews();
    console.log(`  ✓ previews: ${previewCount} files`);

    return counts;
  } finally {
    pullState.running = false;
  }
}

// ── Netlify deploy via API ────────────────────────────────────────────────────

function deployViaZip() {
  const buildZip = () => new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    // Always inject a _headers file so Netlify serves CORS headers for every
    // JSON file — without this the browser blocks fetches from www.allthethings.dev.
    const headersContent = `/*\n  Access-Control-Allow-Origin: https://www.allthethings.dev\n  Access-Control-Allow-Methods: GET\n  Vary: Origin\n`;
    archive.append(headersContent, { name: '_headers' });

    archive.glob('**/*', {
      cwd: JSON_REPO,
      // Exclude any local _headers so the injected one is the only copy.
      ignore: ['**/.git/**', '**/node_modules/**', '**/.DS_Store', '.pull-meta.json', '_headers'],
    });
    archive.finalize();
  });

  const postZip = (zipBuffer) => new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.netlify.com',
        path: `/api/v1/sites/${netlifySiteId}/deploys`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${netlifyToken}`,
          'Content-Type': 'application/zip',
          'Content-Length': zipBuffer.length,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          console.log(`Netlify API response ${res.statusCode}:`, body.slice(0, 300));
          try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body }); }
        });
      }
    );
    req.on('error', reject);
    req.write(zipBuffer);
    req.end();
  });

  return buildZip().then((buf) => {
    console.log(`Zip built: ${(buf.length / 1024).toFixed(1)} KB — posting to Netlify...`);
    return postZip(buf);
  });
}

function triggerMainSiteRebuild() {
  return new Promise((resolve, reject) => {
    const url = new URL(mainSiteBuildHook);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Length': 0 },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          console.log(`Main site build hook response ${res.statusCode}:`, body.slice(0, 200));
          resolve({ status: res.statusCode });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Preview generation ────────────────────────────────────────────────────────

function stripHtml(str) {
  return typeof str === 'string' ? str.replace(/<[^>]*>/g, '') : str;
}

/** Returns the text up to and including the first sentence-ending punctuation. */
function firstSentence(str) {
  if (typeof str !== 'string') return str;
  const match = str.match(/^.*?[.!?](?=\s|$)/s);
  return match ? match[0].trim() : str.trim();
}

/**
 * Each entry maps a content file path pattern to its preview path and transform.
 * Paths use forward slashes and are relative to JSON_REPO.
 */
const PREVIEW_CONFIGS = [
  {
    pattern: /^blog\/articles\/(.+\.json)$/,
    previewPath: (m) => `blog/previews/${m[1]}`,
    transform({ readTime, metaDescription, metaKeywords, relatedArticles, content, ...rest }) {
      return rest;
    },
  },
  {
    pattern: /^resources\/resources\/(.+\.json)$/,
    previewPath: (m) => `resources/previews/${m[1]}`,
    transform({ externalUrl, metaDescription, metaKeywords, relatedResources, ...rest }) {
      if (rest.description) rest.description = firstSentence(stripHtml(rest.description));
      return rest;
    },
  },
  {
    pattern: /^3d-artist-spotlight\/artists\/(.+\.json)$/,
    previewPath: (m) => `3d-artist-spotlight/previews/${m[1]}`,
    transform({ longDescription, metaDescription, metaKeywords, links, ...rest }) {
      return rest;
    },
  },
];

/**
 * If relPath matches a known content path, delete its preview sibling.
 */
function maybeDeletePreview(relPath) {
  for (const cfg of PREVIEW_CONFIGS) {
    const m = relPath.match(cfg.pattern);
    if (!m) continue;
    const previewRel = cfg.previewPath(m);
    try {
      const fullPath = safeFullPath(previewRel);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log(`  ✓ preview deleted: ${previewRel}`);
      }
    } catch (e) {
      console.warn(`  ✗ preview delete failed (${previewRel}):`, e.message);
    }
    break;
  }
}

/**
 * If relPath matches a known content path, write its preview sibling.
 * Safe to call unconditionally — silently skips non-content files.
 */
function maybeWritePreview(relPath, jsonContent) {
  let data;
  try { data = JSON.parse(jsonContent); } catch { return; }

  for (const cfg of PREVIEW_CONFIGS) {
    const m = relPath.match(cfg.pattern);
    if (!m) continue;
    const previewRel = cfg.previewPath(m);
    try {
      const fullPath = safeFullPath(previewRel);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, JSON.stringify(cfg.transform(data), null, 2), 'utf-8');
      console.log(`  ✓ preview: ${previewRel}`);
    } catch (e) {
      console.warn(`  ✗ preview write failed (${previewRel}):`, e.message);
    }
    break;
  }
}

/**
 * Regenerate ALL previews from whatever is currently on disk.
 * Called after a CDN pull so the deploy zip is always consistent.
 */
function regenerateAllPreviews() {
  const dirs = [
    'blog/articles',
    'resources/resources',
    '3d-artist-spotlight/artists',
  ];
  let count = 0;
  for (const dir of dirs) {
    const fullDir = path.join(JSON_REPO, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const file of fs.readdirSync(fullDir).filter((f) => f.endsWith('.json'))) {
      const relPath = `${dir}/${file}`;
      try {
        const content = fs.readFileSync(path.join(fullDir, file), 'utf-8');
        maybeWritePreview(relPath, content);
        count++;
      } catch (e) {
        console.warn(`  ✗ could not regenerate preview for ${relPath}:`, e.message);
      }
    }
  }
  return count;
}

// ── CORS (localhost:4200 only) ────────────────────────────────────────────────

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:4200');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '10mb' }));

// ── Section definitions ───────────────────────────────────────────────────────

const SECTIONS = {
  blog: {
    label: 'Blog Articles',
    dir: path.join(JSON_REPO, 'blog', 'articles'),
    indexFile: path.join(JSON_REPO, 'blog', 'blog.json'),
  },
  resources: {
    label: 'Resources',
    dir: path.join(JSON_REPO, 'resources', 'resources'),
    indexFile: path.join(JSON_REPO, 'resources', 'resources.json'),
  },
  artists: {
    label: '3D Artist Spotlight',
    dir: path.join(JSON_REPO, '3d-artist-spotlight', 'artists'),
    indexFile: path.join(JSON_REPO, '3d-artist-spotlight', 'artists.json'),
  },
};

// ── Helper: validate path stays inside JSON_REPO ──────────────────────────────

function safeFullPath(relPath) {
  const full = path.resolve(JSON_REPO, relPath);
  if (!full.startsWith(JSON_REPO + path.sep) && full !== JSON_REPO) {
    throw new Error('Path traversal blocked');
  }
  return full;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/config — return current config (token is masked)
app.get('/api/config', (req, res) => {
  res.json({
    netlifyToken: netlifyToken ? '***' + netlifyToken.slice(-4) : '',
    netlifySiteId,
    mainSiteBuildHook,
  });
});

// POST /api/config — save config values to compose-config.json
app.post('/api/config', (req, res) => {
  const { netlifyToken: newToken, netlifySiteId: newSiteId, mainSiteBuildHook: newHook } = req.body;

  if (newToken) netlifyToken = newToken;
  if (newSiteId !== undefined) netlifySiteId = newSiteId;
  if (newHook !== undefined) mainSiteBuildHook = newHook;

  try {
    let cfg = {};
    if (fs.existsSync(CONFIG_FILE)) {
      cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
    if (newToken) cfg.netlifyToken = newToken;
    if (newSiteId !== undefined) cfg.netlifySiteId = newSiteId;
    if (newHook !== undefined) cfg.mainSiteBuildHook = newHook;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pull-status — current pull state
app.get('/api/pull-status', (req, res) => {
  res.json({
    running: pullState.running,
    lastPulledAt: pullState.lastPulledAt,
    counts: pullState.counts,
    contentExists: fs.existsSync(path.join(JSON_REPO, 'blog', 'articles')),
  });
});

// POST /api/pull — pull all content from CDN
app.post('/api/pull', async (req, res) => {
  if (pullState.running) {
    return res.status(409).json({ error: 'Pull already in progress' });
  }
  try {
    console.log('\nPulling content from CDN...');
    const counts = await pullFromCDN();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    res.json({
      success: true,
      message: `Pulled ${total} files (blog: ${counts.blog}, resources: ${counts.resources}, artists: ${counts.artists})`,
      counts,
      lastPulledAt: pullState.lastPulledAt,
    });
  } catch (err) {
    console.error('Pull error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sections — list available sections
app.get('/api/sections', (req, res) => {
  const result = Object.entries(SECTIONS).map(([key, sec]) => ({
    key,
    label: sec.label,
  }));
  res.json(result);
});

// GET /api/files/:section — list JSON files in a section directory
app.get('/api/files/:section', (req, res) => {
  const sec = SECTIONS[req.params.section];
  if (!sec) return res.status(404).json({ error: 'Unknown section' });

  try {
    // Pinned index file at the top
    const result = [];
    if (fs.existsSync(sec.indexFile)) {
      const stat = fs.statSync(sec.indexFile);
      const filename = path.basename(sec.indexFile);
      result.push({
        filename,
        slug: filename.replace(/\.json$/, ''),
        relativePath: path.relative(JSON_REPO, sec.indexFile).replace(/\\/g, '/'),
        mtime: stat.mtime.toISOString(),
        size: stat.size,
        isIndex: true,
      });
    }

    // Individual content files
    const files = fs.readdirSync(sec.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((filename) => {
        const fullPath = path.join(sec.dir, filename);
        const stat = fs.statSync(fullPath);
        return {
          filename,
          slug: filename.replace(/\.json$/, ''),
          relativePath: path.relative(JSON_REPO, fullPath).replace(/\\/g, '/'),
          mtime: stat.mtime.toISOString(),
          size: stat.size,
          isIndex: false,
        };
      });

    res.json([...result, ...files]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/file?path=blog/articles/foo.json — read file contents
app.get('/api/file', (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: 'Missing path query param' });

  try {
    const fullPath = safeFullPath(relPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ content });
  } catch (err) {
    const code = err.message === 'Path traversal blocked' ? 403 : 404;
    res.status(code).json({ error: err.message });
  }
});

// POST /api/file — write file contents
app.post('/api/file', (req, res) => {
  const { path: relPath, content } = req.body;
  if (!relPath || content === undefined) {
    return res.status(400).json({ error: 'Missing path or content' });
  }

  try {
    const fullPath = safeFullPath(relPath);
    JSON.parse(content);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    maybeWritePreview(relPath, content);
    res.json({ success: true });
  } catch (err) {
    const code = err.message === 'Path traversal blocked' ? 403 : 500;
    res.status(code).json({ error: err.message });
  }
});

// DELETE /api/file?path=... — delete a content file and its preview
app.delete('/api/file', (req, res) => {
  const relPath = req.query.path;
  if (!relPath) return res.status(400).json({ error: 'Missing path query param' });

  try {
    const fullPath = safeFullPath(relPath);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    fs.unlinkSync(fullPath);
    maybeDeletePreview(relPath);
    res.json({ success: true });
  } catch (err) {
    const code = err.message === 'Path traversal blocked' ? 403 : 500;
    res.status(code).json({ error: err.message });
  }
});

// POST /api/deploy — zip content and deploy via Netlify API
app.post('/api/deploy', async (req, res) => {
  if (!netlifyToken || !netlifySiteId) {
    return res.status(500).json({
      error: 'Netlify credentials not configured. Open Config and add netlifyToken and netlifySiteId.',
    });
  }

  if (!fs.existsSync(JSON_REPO)) {
    return res.status(500).json({ error: 'No local content found. Pull from CDN first.' });
  }

  try {
    console.log(`Deploying ${JSON_REPO} to Netlify site ${netlifySiteId}...`);
    const result = await deployViaZip();
    if (result.status < 200 || result.status >= 300) {
      const detail = result.data?.message || result.body || result.status;
      return res.status(500).json({ error: `Netlify API error: ${detail}` });
    }
    res.json({ success: true, message: 'JSON content deployed successfully.' });
  } catch (err) {
    console.error('Deploy error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rebuild — trigger main site rebuild via build hook
app.post('/api/rebuild', async (req, res) => {
  if (!mainSiteBuildHook) {
    return res.status(400).json({ error: 'No main site build hook configured. Open Config and add the build hook URL.' });
  }
  try {
    console.log('Triggering main site rebuild...');
    await triggerMainSiteRebuild();
    res.json({ success: true, message: 'Main site rebuild triggered. Prerendered pages will update in ~1–2 minutes.' });
  } catch (err) {
    console.error('Rebuild error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

loadPullMeta();

app.listen(PORT, async () => {
  console.log(`\n✓ Compose server running at http://localhost:${PORT}`);
  console.log(`  Content dir: ${JSON_REPO}`);
  const netlifyOk = netlifyToken && netlifySiteId;
  console.log(`  Netlify deploy: ${netlifyOk ? '✓ configured' : '✗ NOT configured (open Config in the app)'}`);
  console.log(`  Main site rebuild: ${mainSiteBuildHook ? '✓ configured' : '✗ NOT configured (open Config in the app)'}`);

  // Auto-pull on first run if content directory doesn't exist yet
  const contentExists = fs.existsSync(path.join(JSON_REPO, 'blog', 'articles'));
  if (!contentExists) {
    console.log('\n  No local content found — pulling from CDN...');
    try {
      const counts = await pullFromCDN();
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`  ✓ Auto-pull complete: ${total} files downloaded\n`);
    } catch (err) {
      console.error('  ✗ Auto-pull failed:', err.message, '\n');
    }
  } else {
    const lastPull = pullState.lastPulledAt
      ? new Date(pullState.lastPulledAt).toLocaleString()
      : 'unknown';
    console.log(`  Content: ✓ present (last pulled: ${lastPull})\n`);
  }
});
