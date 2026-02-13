'use strict';

const fs = require('fs');

const RIVALS_PATH = 'rivals.json';
const STATE_PATH = 'state.json';
const SELF_HANDLE = (process.env.SELF_HANDLE || '').trim().toLowerCase();

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

function readJsonFile(path, fallback) {
  if (!fs.existsSync(path)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function mergeSeenProblemIds(oldIds, newIds, maxSize = 500) {
  const seen = new Set(oldIds);
  for (const id of newIds) {
    seen.add(String(id));
  }

  return Array.from(seen).slice(-maxSize);
}

async function fetchUser(handle) {
  const url = `https://solved.ac/api/v3/user/show?handle=${encodeURIComponent(handle)}`;
  const res = await fetchWithBackoff(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`user/show failed for ${handle}: ${res.status}`);
  }
  return res.json();
}

async function fetchRecentSolvedProblems(handle) {
  const query = encodeURIComponent(`solved_by:${handle}`);
  const url = `https://solved.ac/api/v3/search/problem?query=${query}&page=1`;
  const res = await fetchWithBackoff(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];

  return items.map((item) => ({
    id: String(item.problemId || item.id || ''),
    title: String(item.titleKo || item.title || 'Untitled')
  })).filter((p) => p.id.length > 0);
}

async function sendSlackMessage(webhookUrl, message) {
  const res = await fetchWithBackoff(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message })
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status}`);
  }
}

function buildSlackMessage(handle, problems) {
  const lines = problems
    .slice(0, 5)
    .map((p) => `• ${p.id} - ${p.title}\nhttps://www.acmicpc.net/problem/${p.id}`);
  return `📌 ${handle} 님이 새 문제를 풀었어요!\n\n${lines.join('\n\n')}`;
}

async function main() {
  const rivals = readJsonFile(RIVALS_PATH, { handles: [] });
  const handles = (Array.isArray(rivals.handles) ? rivals.handles : [])
    .filter((h) => typeof h === 'string')
    .filter((h) => !SELF_HANDLE || h.toLowerCase() !== SELF_HANDLE);

  if (handles.length === 0) {
    console.log('No rivals configured.');
    return;
  }

  const state = readJsonFile(STATE_PATH, {});
  const nextState = { ...state };
  const notifications = [];

  for (const handle of handles) {
    const previous = nextState[handle] || { solvedCount: 0, seenProblemIds: [] };

    try {
      const user = await fetchUser(handle);
      const solvedCount = Number(user.solvedCount || 0);
      const seenProblemIds = Array.isArray(previous.seenProblemIds) ? previous.seenProblemIds.map(String) : [];

      let newlySolved = [];
      if (solvedCount > Number(previous.solvedCount || 0)) {
        const recentProblems = await fetchRecentSolvedProblems(handle);
        newlySolved = recentProblems.filter((p) => !seenProblemIds.includes(p.id));
      }

      if (newlySolved.length > 0) {
        notifications.push({ handle, solvedCount, problems: newlySolved });
      }

      nextState[handle] = {
        solvedCount,
        seenProblemIds: mergeSeenProblemIds(seenProblemIds, newlySolved.map((p) => p.id))
      };
    } catch (error) {
      console.error(`Skipping ${handle}: ${error.message}`);
    }
  }

  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (webhook) {
    for (const n of notifications) {
      const message = buildSlackMessage(n.handle, n.problems);
      try {
        await sendSlackMessage(webhook, message);
      } catch (error) {
        console.error(`Slack send failed for ${n.handle}: ${error.message}`);
      }
    }
  } else {
    console.log('SLACK_WEBHOOK_URL is not set. Skipping notifications.');
  }

  const prevStateString = JSON.stringify(state);
  const nextStateString = JSON.stringify(nextState);

  if (prevStateString !== nextStateString) {
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
    console.log('state.json updated.');
  } else {
    console.log('No state changes.');
  }

  console.log(`Notifications attempted: ${notifications.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
