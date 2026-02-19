/**
 * Compose Server — local dev tool for editing JSON content files.
 * Runs on port 3001. Only use locally; never deployed.
 *
 * Start: node scripts/compose-server.js
 * Reads/writes files in the sibling all-the-tools-json repo.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const archiver = require('archiver');

const app = express();
const PORT = 3001;

// Sibling directory: ../all-the-tools-json relative to project root
const JSON_REPO = path.resolve(__dirname, '..', '..', 'all-the-tools-json');

// ── Netlify deploy via API ────────────────────────────────────────────────────
// Reads netlifyToken + netlifySiteId + mainSiteBuildHook from scripts/compose-config.json
// No CLI login needed — token travels with the project config file.
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

/**
 * Zips JSON_REPO into a buffer, then POSTs it to the Netlify deploy API.
 * Buffers first so we can set an accurate Content-Length header.
 */
function deployViaZip() {
  // Step 1: build zip in memory
  const buildZip = () => new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    archive.glob('**/*', {
      cwd: JSON_REPO,
      ignore: ['**/.git/**', '**/node_modules/**', '**/.DS_Store'],
    });
    archive.finalize();
  });

  // Step 2: POST the buffer to Netlify
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

/**
 * POSTs to the Netlify build hook for the main allthethings.dev site.
 * This triggers a full rebuild + prerender so article pages pick up
 * any JSON content that was just deployed to json.allthethings.dev.
 */
function triggerMainSiteRebuild() {
  return new Promise((resolve, reject) => {
    // Build hook URLs look like: https://api.netlify.com/build_hooks/<id>
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

  // Update in-memory values
  if (newToken) netlifyToken = newToken;
  if (newSiteId !== undefined) netlifySiteId = newSiteId;
  if (newHook !== undefined) mainSiteBuildHook = newHook;

  // Persist to compose-config.json
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
    const files = fs.readdirSync(sec.dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((filename) => {
        const fullPath = path.join(sec.dir, filename);
        const stat = fs.statSync(fullPath);
        return {
          filename,
          slug: filename.replace(/\.json$/, ''),
          relativePath: path
            .relative(JSON_REPO, fullPath)
            .replace(/\\/g, '/'),
          mtime: stat.mtime.toISOString(),
          size: stat.size,
        };
      });
    res.json(files);
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
// Body: { path: string, content: string }
app.post('/api/file', (req, res) => {
  const { path: relPath, content } = req.body;
  if (!relPath || content === undefined) {
    return res.status(400).json({ error: 'Missing path or content' });
  }

  try {
    const fullPath = safeFullPath(relPath);

    // Validate JSON before writing
    JSON.parse(content);

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    const code = err.message === 'Path traversal blocked' ? 403 : 500;
    res.status(code).json({ error: err.message });
  }
});

// POST /api/deploy — zip JSON_REPO and deploy via Netlify API
app.post('/api/deploy', async (req, res) => {
  if (!netlifyToken || !netlifySiteId) {
    return res.status(500).json({
      error: 'Netlify credentials not configured. Add netlifyToken and netlifySiteId to scripts/compose-config.json.',
    });
  }

  if (!fs.existsSync(JSON_REPO)) {
    return res.status(500).json({ error: `JSON repo not found at: ${JSON_REPO}` });
  }

  try {
    // Step 1: deploy JSON content to json.allthethings.dev
    console.log(`Deploying ${JSON_REPO} to Netlify site ${netlifySiteId}...`);
    const result = await deployViaZip();
    if (result.status < 200 || result.status >= 300) {
      const detail = result.data?.message || result.body || result.status;
      return res.status(500).json({ error: `Netlify API error: ${detail}` });
    }

    // Step 2: trigger rebuild of allthethings.dev so prerendered pages pick up new content
    if (mainSiteBuildHook) {
      console.log('Triggering main site rebuild...');
      try {
        await triggerMainSiteRebuild();
        return res.json({ success: true, message: 'JSON deployed and main site rebuild triggered.' });
      } catch (hookErr) {
        // JSON deployed fine; just the rebuild hook failed — warn but don't error
        console.warn('Build hook failed:', hookErr.message);
        return res.json({ success: true, message: 'JSON deployed. Warning: main site rebuild hook failed — check compose-config.json.' });
      }
    }

    res.json({ success: true, message: 'JSON deployed. (No main site build hook configured.)' });
  } catch (err) {
    console.error('Deploy error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✓ Compose server running at http://localhost:${PORT}`);
  console.log(`  JSON repo: ${JSON_REPO}`);
  console.log(`  Sections: blog, resources, artists`);
  const netlifyOk = netlifyToken && netlifySiteId;
  console.log(`  Netlify deploy: ${netlifyOk ? '✓ configured' : '✗ NOT configured (add netlifyToken + netlifySiteId to scripts/compose-config.json)'}`);
  console.log(`  Main site rebuild: ${mainSiteBuildHook ? '✓ configured' : '✗ NOT configured (add mainSiteBuildHook to scripts/compose-config.json)'}\n`);
});
