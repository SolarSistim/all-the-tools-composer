/**
 * One-off script: generate preview files for all existing content.
 * Run with: node scripts/generate-previews.js
 */

const fs = require('fs');
const path = require('path');

const JSON_REPO = path.join(__dirname, '..', 'content');

function stripHtml(str) {
  return typeof str === 'string' ? str.replace(/<[^>]*>/g, '') : str;
}

function firstSentence(str) {
  if (typeof str !== 'string') return str;
  const match = str.match(/^.*?[.!?](?=\s|$)/s);
  return match ? match[0].trim() : str.trim();
}

const PREVIEW_CONFIGS = [
  {
    dir: 'blog/articles',
    previewDir: 'blog/previews',
    transform({ readTime, metaDescription, metaKeywords, relatedArticles, content, ...rest }) {
      return rest;
    },
  },
  {
    dir: 'resources/resources',
    previewDir: 'resources/previews',
    transform({ externalUrl, metaDescription, metaKeywords, relatedResources, ...rest }) {
      if (rest.description) rest.description = firstSentence(stripHtml(rest.description));
      return rest;
    },
  },
  {
    dir: '3d-artist-spotlight/artists',
    previewDir: '3d-artist-spotlight/previews',
    transform({ longDescription, metaDescription, metaKeywords, links, ...rest }) {
      return rest;
    },
  },
];

let total = 0;
let errors = 0;

for (const cfg of PREVIEW_CONFIGS) {
  const srcDir = path.join(JSON_REPO, cfg.dir);
  const outDir = path.join(JSON_REPO, cfg.previewDir);

  if (!fs.existsSync(srcDir)) {
    console.warn(`  skipping ${cfg.dir} (not found)`);
    continue;
  }

  fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.json'));
  console.log(`\n${cfg.dir} → ${cfg.previewDir} (${files.length} files)`);

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(srcDir, file), 'utf-8'));
      const preview = cfg.transform(data);
      fs.writeFileSync(path.join(outDir, file), JSON.stringify(preview, null, 2), 'utf-8');
      console.log(`  ✓ ${file}`);
      total++;
    } catch (e) {
      console.error(`  ✗ ${file}: ${e.message}`);
      errors++;
    }
  }
}

console.log(`\nDone. ${total} previews written, ${errors} errors.`);
