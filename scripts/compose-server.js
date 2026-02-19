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

const app = express();
const PORT = 3001;

// Sibling directory: ../all-the-tools-json relative to project root
const JSON_REPO = path.resolve(__dirname, '..', '..', 'all-the-tools-json');

// ── Netlify deploy hook ───────────────────────────────────────────────────────
// Read hook URL from scripts/compose-config.json or NETLIFY_HOOK_URL env var
let netlifyHookUrl = process.env.NETLIFY_HOOK_URL || '';
const CONFIG_FILE = path.join(__dirname, 'compose-config.json');
if (!netlifyHookUrl && fs.existsSync(CONFIG_FILE)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    netlifyHookUrl = cfg.netlifyHookUrl || '';
  } catch (e) {
    console.warn('Warning: could not read compose-config.json:', e.message);
  }
}

function triggerNetlifyDeploy() {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(netlifyHookUrl);
      const req = https.request(
        { hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Length': 0 } },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ status: res.statusCode, body }));
        }
      );
      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
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

// POST /api/deploy — trigger Netlify deploy hook
app.post('/api/deploy', async (req, res) => {
  if (!netlifyHookUrl) {
    return res.status(500).json({
      error: 'Netlify hook URL not configured. Add netlifyHookUrl to scripts/compose-config.json.',
    });
  }

  try {
    const result = await triggerNetlifyDeploy();
    if (result.status >= 200 && result.status < 300) {
      res.json({ success: true, message: 'Netlify deploy triggered successfully.' });
    } else {
      res.status(500).json({ error: `Netlify returned status ${result.status}: ${result.body}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n✓ Compose server running at http://localhost:${PORT}`);
  console.log(`  JSON repo: ${JSON_REPO}`);
  console.log(`  Sections: blog, resources, artists`);
  console.log(`  Netlify hook: ${netlifyHookUrl ? '✓ configured' : '✗ NOT configured (add to scripts/compose-config.json)'}\n`);
});
