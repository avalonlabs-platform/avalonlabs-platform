import { readFileSync, existsSync, mkdirSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const extensionDir = join(projectRoot, 'extension');
const distDir = join(projectRoot, 'dist');

const REQUIRED_MANIFEST_FIELDS = ['manifest_version', 'name', 'version', 'description'];
// Sprint 2 replaced the popup (popup.html/js/css) with a persistent side
// panel (sidepanel.html/js/css) plus the floating in-page quick-action
// pill (content.js/css) and its dependency-free markdown renderer
// (markdown.js) — see extension/manifest.json's "side_panel" and
// "content_scripts" entries.
const REQUIRED_FILES = [
  'manifest.json',
  'sidepanel.html',
  'sidepanel.js',
  'sidepanel.css',
  'content.js',
  'content.css',
  'markdown.js',
  'background.js',
  'config.js',
];
const REQUIRED_ICONS = ['icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'];
const MAX_DESCRIPTION_LENGTH = 132; // Chrome Web Store's hard limit.

function validateManifest() {
  const manifestPath = join(extensionDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing ${manifestPath}`);
  }

  const raw = readFileSync(manifestPath, 'utf-8');
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    throw new Error(`extension/manifest.json is not valid JSON: ${error.message}`);
  }

  if (manifest.manifest_version !== 3) {
    throw new Error(`manifest_version must be 3 for Chrome Web Store, found ${manifest.manifest_version}`);
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!manifest[field]) {
      throw new Error(`manifest.json is missing required field "${field}"`);
    }
  }
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) {
    throw new Error(
      `manifest.json "version" ("${manifest.version}") must match Chrome Web Store's dotted-integer format (e.g. "1.0.0")`
    );
  }
  if (manifest.description.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(
      `manifest.json "description" is ${manifest.description.length} chars — Chrome Web Store's limit is ${MAX_DESCRIPTION_LENGTH}.`
    );
  }

  return manifest;
}

function validateRequiredFiles() {
  const missing = [...REQUIRED_FILES, ...REQUIRED_ICONS].filter(
    (relativePath) => !existsSync(join(extensionDir, relativePath))
  );
  if (missing.length > 0) {
    throw new Error(`extension/ is missing required file(s): ${missing.join(', ')}`);
  }
}

async function zipExtension(manifest) {
  mkdirSync(distDir, { recursive: true });
  const outputPath = join(distDir, `avalonlabs-extension-v${manifest.version}.zip`);

  await new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    // Zip the *contents* of extension/ at the archive root — manifest.json
    // must sit at the top level of the zip, not nested inside an
    // "extension/" folder, or Chrome Web Store upload rejects it.
    archive.directory(extensionDir, false);
    archive.finalize();
  });

  return outputPath;
}

async function main() {
  console.log('\n==================================================');
  console.log('           CHROME EXTENSION PACKAGER               ');
  console.log('==================================================');

  console.log('Validating extension/manifest.json...');
  const manifest = validateManifest();
  console.log(`  [OK] manifest_version 3, name "${manifest.name}", version ${manifest.version}`);

  console.log('Checking required files...');
  validateRequiredFiles();
  console.log('  [OK] All required files present (side panel, content script, background, config, icons).');

  console.log('Packaging...');
  const outputPath = await zipExtension(manifest);
  console.log(`  [OK] Wrote ${outputPath}`);

  console.log('==================================================');
  console.log('Ready for Chrome Web Store upload:');
  console.log(`  ${outputPath}`);
  console.log('==================================================\n');
}

main().catch((error) => {
  console.error('[Packager Error]', error.message);
  process.exit(1);
});
