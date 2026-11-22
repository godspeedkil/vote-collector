/**
 * Movie Night Ballot: storage script.
 * Lives inside a Google Sheet (Extensions > Apps Script). It stores the poll,
 * saves each vote as a row, and keeps a readable "Results" tab up to date.
 */

// 1. Change this to a password only you know. The host page asks for it.
const ADMIN_PASSWORD = 'change-me';

// 2. Optional: put your email address here to get an email for every vote.
const NOTIFY_EMAIL = '';

const MAX_VOTES_PER_POLL = 500;

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'poll';
  const poll = getPoll_();
  if (action === 'poll') return out_({ ok: true, poll: poll });
  if (action === 'results') {
    if (!poll) return out_({ ok: true, votes: [] });
    if (!poll.showResults) return out_({ ok: false, error: 'hidden' });
    return out_({ ok: true, votes: readVotes_(poll.pollId).map(publicVote_) });
  }
  return out_({ ok: false, error: 'unknown_action' });
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_request' }); }
  if (!body || typeof body !== 'object') return out_({ ok: false, error: 'bad_request' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (body.action === 'vote') return out_(saveVote_(body));
    const denied = checkAdmin_(body.password);
    if (denied) return out_({ ok: false, error: denied });
    if (body.action === 'savePoll') return out_(savePoll_(body));
    if (body.action === 'adminResults') { const p = getPoll_(); return out_({ ok: true, votes: p ? readVotes_(p.pollId) : [] }); }
    if (body.action === 'deleteVote') return out_(deleteVote_(body));
    return out_({ ok: false, error: 'unknown_action' });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- poll ---------- */

function getPoll_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Poll');
  if (!sh || sh.getLastRow() < 1) return null;
  const text = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function (r) { return r[0]; }).join('');
  if (!text) return null;
  try { return JSON.parse(text); } catch (err) { return null; }
}

function savePoll_(body) {
  const src = body.poll || {};
  const old = getPoll_();
  const scale = (Array.isArray(src.scale) ? src.scale : []).map(function (x) { return text_(x, 80); }).filter(String).slice(0, 12);
  const movies = (Array.isArray(src.movies) ? src.movies : []).slice(0, 60).map(function (m) {
    m = m || {};
    return {
      id: /^[a-z0-9]{2,20}$/i.test(String(m.id)) ? String(m.id) : 'm' + Utilities.getUuid().slice(0, 8),
      tmdbId: num_(m.tmdbId), kind: m.kind === 'tv' ? 'tv' : 'movie', seasons: num_(m.seasons), title: text_(m.title, 160), year: num_(m.year), runtime: num_(m.runtime),
      genre: text_(m.genre, 80), director: text_(m.director, 160), cast: text_(m.cast, 240), overview: text_(m.overview, 600),
      poster: /^\/[\w.\-]+$/.test(String(m.poster || '')) ? String(m.poster) : '',
      trailer: /^[\w\-]{6,20}$/.test(String(m.trailer || '')) ? String(m.trailer) : ''
    };
  }).filter(function (m) { return m.title; });
  if (!movies.length || scale.length < 2) return { ok: false, error: 'bad_request' };
  const poll = {
    pollId: (old && !body.newRound) ? old.pollId : 'p' + Utilities.getUuid().slice(0, 8),
    title: text_(src.title, 120) || 'Movie Night Ballot', note: text_(src.note, 500),
    showResults: !!src.showResults, scale: scale, movies: movies
  };
  const json = JSON.stringify(poll);
  if (json.length > 400000) return { ok: false, error: 'too_big' };
  const chunks = [];
  for (let i = 0; i < json.length; i += 40000) chunks.push([json.slice(i, i + 40000)]);
  const sh = sheet_('Poll');
  sh.clearContents();
  sh.getRange(1, 1, chunks.length, 1).setNumberFormat('@').setValues(chunks);
  writeResults_(poll);
  return { ok: true, poll: poll };
}

/* ---------- votes ---------- */

function saveVote_(body) {
  const poll = getPoll_();
  if (!poll || body.pollId !== poll.pollId) return { ok: false, error: 'poll_changed' };
  const key = String(body.voterKey || '');
  if (!/^[a-z0-9]{8,32}$/.test(key)) return { ok: false, error: 'bad_request' };
  const name = text_(body.name, 60);
  const answers = {};
  const given = (body.answers && typeof body.answers === 'object') ? body.answers : {};
  poll.movies.forEach(function (m) { if (poll.scale.indexOf(given[m.id]) >= 0) answers[m.id] = given[m.id]; });
  if (!name || !Object.keys(answers).length) return { ok: false, error: 'bad_request' };

  const sh = votesSheet_();
  const rows = sh.getDataRange().getValues();
  let rowIndex = -1, count = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] !== poll.pollId) continue;
    count++;
    if (rows[i][2] === key) rowIndex = i + 1;
  }
  if (rowIndex < 0 && count >= MAX_VOTES_PER_POLL) return { ok: false, error: 'full' };
  const row = [new Date().toISOString(), poll.pollId, key, safe_(name), safe_(text_(body.comment, 600)), JSON.stringify(answers)];
  if (rowIndex > 0) sh.getRange(rowIndex, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
  writeResults_(poll);

  if (NOTIFY_EMAIL) {
    try {
      const lines = poll.movies.map(function (m) { return m.title + ': ' + (answers[m.id] || '-'); });
      MailApp.sendEmail(NOTIFY_EMAIL, 'Movie ballot: ' + name + (rowIndex > 0 ? ' updated their vote' : ' voted'),
        poll.title + '\n\n' + lines.join('\n') + (body.comment ? '\n\nComment: ' + text_(body.comment, 600) : ''));
    } catch (err) { /* a failed email must not lose the vote */ }
  }
  return { ok: true };
}

function deleteVote_(body) {
  const poll = getPoll_();
  if (!poll) return { ok: false, error: 'bad_request' };
  const sh = votesSheet_();
  const rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (rows[i][1] === poll.pollId && rows[i][2] === String(body.voterKey || '')) sh.deleteRow(i + 1);
  }
  writeResults_(poll);
  return { ok: true, votes: readVotes_(poll.pollId) };
}

function readVotes_(pollId) {
  const rows = votesSheet_().getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] !== pollId) continue;
    let answers = {};
    try { answers = JSON.parse(rows[i][5]) || {}; } catch (err) {}
    out.push({ at: String(rows[i][0]), voterKey: String(rows[i][2]), name: unsafe_(rows[i][3]), comment: unsafe_(rows[i][4]), answers: answers });
  }
  return out;
}

function publicVote_(v) { return { name: v.name, comment: v.comment, answers: v.answers }; }

// A readable tab for the current round: one row per person, one column per film.
function writeResults_(poll) {
  const votes = readVotes_(poll.pollId);
  const sh = sheet_('Results');
  sh.clearContents();
  const header = ['Name'].concat(poll.movies.map(function (m) { return safe_(m.title + (m.year ? ' (' + m.year + ')' : '')); }), ['Comment', 'Submitted']);
  const rows = votes.map(function (v) {
    return [safe_(v.name)].concat(poll.movies.map(function (m) { return safe_(v.answers[m.id] || ''); }), [safe_(v.comment), v.at]);
  });
  sh.getRange(1, 1, rows.length + 1, header.length).setNumberFormat('@').setValues([header].concat(rows));
  sh.setFrozenRows(1);
}

/* ---------- helpers ---------- */

function checkAdmin_(password) {
  if (ADMIN_PASSWORD === 'change-me' || !ADMIN_PASSWORD) return 'set_password';
  return password === ADMIN_PASSWORD ? '' : 'bad_password';
}
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function votesSheet_() {
  const sh = sheet_('Votes');
  if (sh.getLastRow() === 0) sh.appendRow(['Submitted', 'Poll', 'Voter', 'Name', 'Comment', 'Answers']);
  return sh;
}
function text_(x, max) { return (typeof x === 'string' || typeof x === 'number') ? String(x).trim().slice(0, max) : ''; }
function num_(x) { const n = parseInt(x, 10); return isFinite(n) && n > 0 ? n : null; }
// Stops a name such as "=IMPORTXML(...)" from being run as a formula in the sheet.
function safe_(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function unsafe_(s) { s = String(s == null ? '' : s); return /^'[=+\-@]/.test(s) ? s.slice(1) : s; }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
