'use strict';

const fs = require('fs');

const RESULT_PATH = 'parse-result.json';
const RIVALS_PATH = 'rivals.json';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url, options = {}, maxRetries = 4) {
  let attempt = 0;
  let delay = 500;

  while (true) {
    try {
      const res = await fetch(url, options);

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        await sleep(delay);
        delay *= 2;
        attempt += 1;
        continue;
      }

      return res;
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      await sleep(delay);
      delay *= 2;
      attempt += 1;
    }
  }
}

function readIssueBody() {
  const args = process.argv.slice(2);
  const inputFileArgIndex = args.indexOf('--input-file');

  if (inputFileArgIndex !== -1 && args[inputFileArgIndex + 1]) {
    return fs.readFileSync(args[inputFileArgIndex + 1], 'utf8');
  }

  if (process.env.ISSUE_BODY) {
    return process.env.ISSUE_BODY;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
      return event.issue && typeof event.issue.body === 'string' ? event.issue.body : '';
    } catch {
      return '';
    }
  }

  return '';
}

function parseJsonMode(input) {
  try {
    const parsed = JSON.parse(input);
    const items = parsed && Array.isArray(parsed.items) ? parsed.items : null;
    if (!items) {
      return null;
    }

    const candidates = [];
    for (const item of items) {
      if (!item || typeof item.handle !== 'string') {
        continue;
      }

      if (item.isRival === true || item.reverseRival === true) {
        candidates.push(item.handle.trim());
      }
    }

    return { mode: 'JSON', candidates };
  } catch {
    return null;
  }
}

function parseTextMode(input) {
  const byProfile = [];
  const profileRegex = /solved\.ac\/profile\/([A-Za-z0-9_]{2,24})/gi;
  let match;

  while ((match = profileRegex.exec(input)) !== null) {
    byProfile.push(match[1]);
  }

  const generic = [];
  const genericRegex = /\b[A-Za-z0-9_]{2,24}\b/g;
  while ((match = genericRegex.exec(input)) !== null) {
    generic.push(match[0]);
  }

  const deny = new Set([
    'https', 'http', 'solved', 'profile', 'ranking', 'rival', 'page',
    'true', 'false', 'null', 'items', 'handle', 'isRival', 'reverseRival',
    'class', 'title', 'style', 'script', 'div', 'span', 'href', 'json'
  ]);

  const combined = [...byProfile, ...generic]
    .map((v) => v.trim())
    .filter((v) => v.length >= 2 && v.length <= 24)
    .filter((v) => /[A-Za-z]/.test(v))
    .filter((v) => !deny.has(v));

  return { mode: 'TEXT', candidates: combined };
}

function dedupePreserveOrder(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }

  return out;
}

async function validateHandles(candidates) {
  const valid = [];
  const dropped = [];

  for (const candidate of candidates) {
    const url = `https://solved.ac/api/v3/user/show?handle=${encodeURIComponent(candidate)}`;

    try {
      const res = await fetchWithBackoff(url, { headers: { Accept: 'application/json' } });

      if (!res.ok) {
        dropped.push(candidate);
        continue;
      }

      const data = await res.json();
      if (data && typeof data.handle === 'string' && data.handle.length > 0) {
        valid.push(data.handle);
      } else {
        dropped.push(candidate);
      }
    } catch {
      dropped.push(candidate);
    }
  }

  return { valid: dedupePreserveOrder(valid), dropped };
}

function writeResult(result) {
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

function writeRivals(handles, stats) {
  const payload = {
    updatedAt: new Date().toISOString(),
    source: 'issue',
    handles,
    stats
  };

  fs.writeFileSync(RIVALS_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const input = readIssueBody();

  if (!input || input.trim().length === 0) {
    throw new Error('Issue body is empty.');
  }

  const jsonMode = parseJsonMode(input);
  const parsed = jsonMode || parseTextMode(input);
  const dedupedCandidates = dedupePreserveOrder(parsed.candidates);
  const { valid } = await validateHandles(dedupedCandidates);

  const stats = {
    totalCandidates: dedupedCandidates.length,
    validated: valid.length,
    dropped: Math.max(0, dedupedCandidates.length - valid.length)
  };

  writeRivals(valid, stats);

  const result = {
    mode: parsed.mode,
    stats
  };

  writeResult(result);

  console.log(`mode=${parsed.mode}`);
  console.log(`totalCandidates=${stats.totalCandidates}`);
  console.log(`validated=${stats.validated}`);
  console.log(`dropped=${stats.dropped}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
