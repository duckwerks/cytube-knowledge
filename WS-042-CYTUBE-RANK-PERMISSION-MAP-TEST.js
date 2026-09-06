/*
============================================================
WS-042 — CYTUBE RANK & PERMISSION MAP TEST
PASSIVE / READ-ONLY / MOBILE
============================================================

PURPOSE
------------------------------------------------------------
Determine how CyTube exposes rank, permissions, and related
capability state to the browser client.

THIS TEST DOES NOT:
  - change rank
  - send moderation commands
  - modify playlist state
  - modify channel settings
  - click privileged controls
  - write to localStorage/sessionStorage/cookies
  - alter CyTube runtime objects

It only inspects already-exposed runtime state and reports
candidate rank / permission information.

IMPORTANT
------------------------------------------------------------
A value discovered here is an OBSERVATION, not proof that the
server accepts an action at that rank. Client-side permissions
can be UI hints while the server remains authoritative.

Run by pasting this entire block into the CyTube browser console.
============================================================
*/

(() => {
  'use strict';

  const TEST = 'WS-042';
  const started = new Date().toISOString();
  const seen = new WeakSet();
  const hits = [];

  const typeOf = v => {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  };

  const safeString = v => {
    try {
      if (typeof v === 'function') return '[Function]';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (v === null) return 'null';
      return JSON.stringify(v);
    } catch (_) {
      return '[unserializable]';
    }
  };

  const addHit = (path, value, reason) => {
    if (hits.length >= 150) return;
    hits.push({
      path,
      type: typeOf(value),
      value: safeString(value),
      reason
    });
  };

  // Strong candidate names first. These are intentionally generic
  // because CyTube builds / versions may expose different objects.
  const rankNames = [
    'rank', 'userRank', 'globalRank', 'channelRank', 'user_rank',
    'channel_rank', 'rankName', 'rankname', 'userLevel', 'level'
  ];

  const permissionNames = [
    'permissions', 'permission', 'perms', 'perm', 'capabilities',
    'capability', 'can', 'allowed', 'actions', 'privileges'
  ];

  const actionNames = [
    'playlist', 'queue', 'delete', 'remove', 'skip', 'seek',
    'play', 'pause', 'edit', 'settings', 'kick', 'ban', 'mute',
    'rank', 'assignRank', 'lock', 'channelJS', 'channelCSS',
    'script', 'moderate', 'chat'
  ];

  const interestingKey = key => {
    const k = String(key).toLowerCase();
    return rankNames.some(x => k === x.toLowerCase() || k.includes(x.toLowerCase())) ||
           permissionNames.some(x => k === x.toLowerCase() || k.includes(x.toLowerCase())) ||
           actionNames.some(x => k === x.toLowerCase() || k.includes(x.toLowerCase()));
  };

  const scan = (obj, path, depth = 0) => {
    if (!obj || depth > 3 || hits.length >= 150) return;
    const t = typeof obj;
    if (t !== 'object' && t !== 'function') return;

    if (t === 'object') {
      if (seen.has(obj)) return;
      seen.add(obj);
    }

    let keys = [];
    try {
      keys = Object.keys(obj).slice(0, 120);
    } catch (_) {
      return;
    }

    for (const key of keys) {
      let value;
      try { value = obj[key]; } catch (_) { continue; }
      const childPath = path + '.' + key;

      if (interestingKey(key)) {
        addHit(childPath, value, 'candidate rank/permission/capability key');
      }

      // Only descend into likely state containers. This prevents the
      // test from walking huge Cytube objects or library internals.
      const kl = String(key).toLowerCase();
      const likelyContainer =
        kl.includes('user') || kl.includes('client') || kl.includes('channel') ||
        kl.includes('rank') || kl.includes('permission') || kl.includes('perm') ||
        kl.includes('capab') || kl === 'state' || kl === 'room' ||
        kl === 'settings' || kl === 'callbacks';

      if (likelyContainer && depth < 3) {
        scan(value, childPath, depth + 1);
      }
    }
  };

  console.log('============================================================');
  console.log(TEST + ' — CYTUBE RANK & PERMISSION MAP TEST');
  console.log('PASSIVE / READ-ONLY / MOBILE');
  console.log('============================================================');
  console.log('TEST STARTED');
  console.log(started);

  console.log('\nRUNTIME');
  console.log('------------------------------------------------------------');
  console.log('window === globalThis:', window === globalThis);
  console.log('window.socket exists:', !!window.socket);
  console.log('socket connected:', !!(window.socket && window.socket.connected));
  console.log('window.Callbacks exists:', !!window.Callbacks);

  console.log('\nDIRECT GLOBAL CANDIDATES');
  console.log('------------------------------------------------------------');

  const globals = [
    'CLIENT', 'client', 'USER', 'user', 'ME', 'me',
    'CHANNEL', 'channel', 'ROOM', 'room', 'STATE', 'state',
    'SETTINGS', 'settings', 'PERMISSIONS', 'permissions',
    'RANKS', 'ranks', 'Callbacks', 'socket'
  ];

  for (const name of globals) {
    try {
      if (name in window) {
        const value = window[name];
        console.log(name + ':', typeOf(value), value);
        scan(value, 'window.' + name, 0);
      }
    } catch (e) {
      console.log(name + ': [access error]');
    }
  }

  console.log('\nTOP-LEVEL WINDOW CANDIDATES');
  console.log('------------------------------------------------------------');
  let topKeys = [];
  try { topKeys = Object.keys(window); } catch (_) {}

  const topMatches = topKeys.filter(interestingKey).sort();
  console.log('matching window keys:', topMatches.length);
  console.log(topMatches.slice(0, 100));

  for (const key of topMatches.slice(0, 100)) {
    try {
      const value = window[key];
      addHit('window.' + key, value, 'top-level window candidate');
      scan(value, 'window.' + key, 1);
    } catch (_) {}
  }

  console.log('\nDOM PRIVILEGE / CONTROL HINTS');
  console.log('------------------------------------------------------------');
  console.log('These are UI observations only. No controls are clicked.');

  const selectors = [
    '[data-rank]', '[data-permission]', '[data-perm]',
    '[data-action]', '[data-command]',
    '[class*="rank"]', '[class*="permission"]', '[class*="perm"]',
    '[id*="rank"]', '[id*="permission"]', '[id*="perm"]',
    '[id*="kick"]', '[id*="ban"]', '[id*="mute"]',
    '[id*="playlist"]', '[id*="queue"]', '[id*="settings"]'
  ];

  for (const selector of selectors) {
    try {
      const nodes = document.querySelectorAll(selector);
      if (!nodes.length) continue;
      console.log(selector + ': ' + nodes.length);
      Array.from(nodes).slice(0, 20).forEach((el, i) => {
        const attrs = {};
        for (const a of el.attributes || []) {
          if (/rank|perm|action|command|role|disabled/i.test(a.name)) {
            attrs[a.name] = a.value;
          }
        }
        console.log('  [' + i + ']', el.tagName, attrs, 'disabled=' + !!el.disabled);
      });
    } catch (_) {}
  }

  console.log('\nCANDIDATE RANK / PERMISSION DATA');
  console.log('------------------------------------------------------------');
  console.log('Total candidate observations:', hits.length);

  if (!hits.length) {
    console.log('NO CANDIDATE DATA FOUND');
    console.log('This is useful: rank/permission state may be hidden,');
    console.log('stored under differently named objects, or derived');
    console.log('only inside specific callbacks/UI code.');
  } else {
    hits.forEach((h, i) => {
      console.log(
        '[' + i + ']',
        h.path,
        '| type=' + h.type,
        '| value=' + h.value,
        '| ' + h.reason
      );
    });
  }

  console.log('\nINTERPRETATION RULES');
  console.log('------------------------------------------------------------');
  console.log('1. A discovered rank number/name is NOT yet a permission map.');
  console.log('2. A discovered canX/permission value is client-side evidence.');
  console.log('3. Server enforcement must be tested separately and deliberately.');
  console.log('4. Do not infer rank ordering from one observation alone.');
  console.log('5. Record exact object path + value + user/channel context.');

  console.log('\nNEXT STEP');
  console.log('------------------------------------------------------------');
  console.log('If candidate state is found, WS-042B should target those');
  console.log('exact object paths rather than performing another broad scan.');
  console.log('If no state is found, inspect the known Socket.IO callbacks');
  console.log('for user/rank/channel events before probing further.');

  console.log('\nTEST COMPLETE');
  console.log(new Date().toISOString());
  console.log('============================================================');

  // Deliberately return the observations without attaching anything
  // to window or changing CyTube state.
  return {
    test: TEST,
    started,
    completed: new Date().toISOString(),
    candidateCount: hits.length,
    candidates: hits
  };
})();
