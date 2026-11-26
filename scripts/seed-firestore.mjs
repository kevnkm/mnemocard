import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRA_SEED_DECKS } from './extra-seed-decks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_MONIC_DECKS_DIR = path.resolve(ROOT_DIR, '../monic-decks');

const LEGACY_STARTER_IDS = [
  'starter-neuro-memory',
  'starter-japanese-n3',
  'starter-cs-systems',
  'starter-gre-vocab',
  'starter-calculus-essentials',
  'starter-stoic-philosophy',
];

function parseArgs(argv) {
  const args = {
    dryRun: false,
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    monicDecksDir: DEFAULT_MONIC_DECKS_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--credentials' && argv[i + 1]) args.credentials = argv[++i];
    else if (arg === '--project' && argv[i + 1]) args.projectId = argv[++i];
    else if (arg === '--monic-decks' && argv[i + 1]) args.monicDecksDir = path.resolve(argv[++i]);
  }
  return args;
}

function readDefaultProjectId() {
  try {
    const raw = fs.readFileSync(path.join(ROOT_DIR, '.firebaserc'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed?.projects?.default || '';
  } catch {
    return '';
  }
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csvText[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (csvText[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function resolveMediaValue(deckId, fieldType, raw) {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  if (
    (fieldType === 'image' || fieldType === 'audio' || fieldType === 'video') &&
    trimmed.startsWith('media/')
  ) {
    return `https://cdn.jsdelivr.net/gh/monichq/monic-decks@main/decks/${deckId}/${trimmed}`;
  }
  return trimmed;
}

function buildSearchKeywords(deck, maxTokens = 40) {
  const tokens = new Set();
  const addWord = (raw) => {
    const clean = raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (clean.length < 2) return;
    tokens.add(clean);
    const cap = Math.min(clean.length, 12);
    for (let len = 2; len <= cap; len += 1) {
      tokens.add(clean.slice(0, len));
    }
  };
  for (const word of deck.title.split(/\s+/)) addWord(word);
  if (deck.category) addWord(deck.category);
  if (deck.subject) addWord(deck.subject);
  for (const tag of deck.tags || []) addWord(tag);
  return Array.from(tokens).slice(0, maxTokens);
}

function loadMonicDecks(monicDecksDir) {
  const indexPath = path.join(monicDecksDir, 'index.json');
  const indexJson = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const entries = Array.isArray(indexJson) ? indexJson : indexJson.decks || [];
  const now = new Date().toISOString();

  return entries.map((entry) => {
    const deckDir = path.join(monicDecksDir, entry.path || `decks/${entry.id}`);
    const meta = JSON.parse(fs.readFileSync(path.join(deckDir, 'deck.json'), 'utf8'));
    const csvRows = parseCsv(fs.readFileSync(path.join(deckDir, 'cards.csv'), 'utf8'));
    const [headers = [], ...dataRows] = csvRows;

    const fields = meta.fields || entry.fields || [];
    const columnIndices = fields.map((f) => headers.indexOf(f.column));
    const idColIndex = headers.indexOf('id');

    const fieldConfigs = fields.map((f) => ({
      label: f.label,
      type: f.type || 'text',
      ...(f.lang ? { lang: f.lang } : {}),
      role: f.role || 'none',
    }));

    const cards = dataRows.map((cells, idx) => {
      const rawCardId = idColIndex >= 0 ? (cells[idColIndex] || '').trim() : '';
      const cardId = rawCardId ? `${meta.id}-${rawCardId}` : `${meta.id}-card-${idx}`;
      const content = fields.map((f, fIdx) => {
        const colIdx = columnIndices[fIdx];
        const raw = colIdx >= 0 ? cells[colIdx] : '';
        return resolveMediaValue(meta.id, f.type || 'text', raw);
      });
      return {
        id: cardId,
        deckId: meta.id,
        content,
        orderIndex: idx,
        createdAt: now,
        updatedAt: now,
      };
    });

    const deckObj = {
      id: meta.id,
      title: meta.title,
      description: meta.description || '',
      icon: meta.icon || '📚',
      color: meta.color || '#FF7060',
      category: meta.category || 'other',
      subject: meta.subject || meta.category || 'general',
      tags: Array.isArray(meta.tags) ? meta.tags : [meta.category || 'other'],
      fieldConfigs,
      cards,
      cardCount: cards.length,
      isOfficial: true,
      isPublicSynced: true,
      createdAt: now,
      updatedAt: now,
    };
    deckObj.searchKeywords = buildSearchKeywords(deckObj);
    return deckObj;
  });
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}

function toFirestoreDocument(deck) {
  const { id, ...payload } = deck;
  void id;
  const fields = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(serviceAccount.private_key);
  const jwt = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth token request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function upsertDeck(projectId, accessToken, deck) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/(default)/documents/decks/${encodeURIComponent(deck.id)}`;

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toFirestoreDocument(deck)),
  });

  if (!res.ok) {
    throw new Error(`Failed to write decks/${deck.id} (${res.status}): ${await res.text()}`);
  }
}

async function deleteDeck(projectId, accessToken, deckId) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/(default)/documents/decks/${encodeURIComponent(deckId)}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete decks/${deckId} (${res.status}): ${await res.text()}`);
  }
}

function loadAllSeedDecks(monicDecksDir) {
  const monicDecks = fs.existsSync(path.join(monicDecksDir, 'index.json'))
    ? loadMonicDecks(monicDecksDir)
    : [];

  const baseMs = Date.now();
  const extraDecks = EXTRA_SEED_DECKS.map((deck, idx) => {
    // Stagger timestamps slightly so Explore shows a balanced mix across categories.
    const iso = new Date(baseMs - (idx + 1) * 60_000).toISOString();
    const full = {
      ...deck,
      cards: deck.cards.map((c) => ({ ...c, createdAt: iso, updatedAt: iso })),
      cardCount: deck.cards.length,
      isOfficial: true,
      isPublicSynced: true,
      createdAt: iso,
      updatedAt: iso,
    };
    full.searchKeywords = buildSearchKeywords(full);
    return full;
  });

  // Interleave monic-decks and extra decks so page 1 spans all categories.
  const combined = [];
  const maxLen = Math.max(monicDecks.length, extraDecks.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (monicDecks[i]) combined.push(monicDecks[i]);
    if (extraDecks[i]) combined.push(extraDecks[i]);
  }
  return combined.map((deck, idx) => {
    const iso = new Date(baseMs - idx * 60_000).toISOString();
    return { ...deck, createdAt: iso, updatedAt: iso };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const decks = loadAllSeedDecks(args.monicDecksDir);

  if (args.dryRun) {
    console.log(`[dry-run] Ready to seed ${decks.length} decks:`);
    for (const deck of decks) {
      console.log(`  - ${deck.id} [${deck.category}/${deck.subject}]: ${deck.title} (${deck.cards.length} cards)`);
    }
    return;
  }

  if (!args.credentials) {
    console.error(
      'Missing service account JSON. Pass --credentials /path/to/key.json or set GOOGLE_APPLICATION_CREDENTIALS.'
    );
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(args.credentials), 'utf8'));
  const projectId = args.projectId || serviceAccount.project_id || readDefaultProjectId();
  if (!projectId) {
    console.error('Missing project ID. Pass --project <id> or set FIREBASE_PROJECT_ID.');
    process.exit(1);
  }

  console.log(`Seeding ${decks.length} decks to Firestore project '${projectId}'...`);
  const accessToken = await getAccessToken(serviceAccount);

  for (const deck of decks) {
    await upsertDeck(projectId, accessToken, deck);
    console.log(`  ✓ decks/${deck.id} [${deck.category}/${deck.subject}] (${deck.title}, ${deck.cards.length} cards)`);
  }

  for (const legacyId of LEGACY_STARTER_IDS) {
    await deleteDeck(projectId, accessToken, legacyId);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
