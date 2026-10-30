/**
 * Jasmine's Recipes: backup and sharing receiver.
 * Lives inside the Google Sheet (Extensions > Apps Script). The app sends it two kinds of requests:
 *  - backups: one row per recipe per device in the "Recipes" tab, updated when a recipe is edited
 *  - sharing: a short code for a recipe being sent, kept in the "Shared" tab until the other person opens it
 */

// Type a long random password here, and put the very same one in Vercel as BACKUP_SECRET.
var SECRET = 'PASTE_A_LONG_RANDOM_PASSWORD_HERE';
var TAB_NAME = 'Recipes';
var SHARED_TAB = 'Shared';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET === 'PASTE_A_LONG_RANDOM_PASSWORD_HERE' || data.secret !== SECRET) {
      return reply({ ok: false, error: 'Wrong secret' });
    }
    if (data.action === 'share') return shareRecipe(data);
    if (data.action === 'fetch') return fetchShared(data);
    if (data.action === 'syncIndex') return syncIndex(data);
    if (data.action === 'syncGet') return syncGet(data);
    if (data.action === 'syncPut') return syncPut(data);
    return backupRecipes(data);
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function backupRecipes(data) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(TAB_NAME) || book.insertSheet(TAB_NAME);
  var headers = data.headers;

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  var keyCols = data.keys.map(function (k) { return headers.indexOf(k); });
  var existing = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    : [];
  var rowFor = {};
  existing.forEach(function (row, i) {
    rowFor[keyCols.map(function (c) { return row[c]; }).join('|')] = i + 2;
  });

  var appended = [];
  data.rows.forEach(function (row) {
    var key = keyCols.map(function (c) { return row[c]; }).join('|');
    if (rowFor[key]) {
      sheet.getRange(rowFor[key], 1, 1, headers.length).setValues([row]);
    } else {
      appended.push(row);
    }
  });
  if (appended.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, headers.length).setValues(appended);
  }
  return reply({ ok: true, saved: data.rows.length });
}

function sharedSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHARED_TAB) || book.insertSheet(SHARED_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([['Code', 'Created', 'Recipe (squeezed text)']]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findCode(sheet, code) {
  if (sheet.getLastRow() < 2) return 0;
  var codes = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (codes[i][0] === code) return i + 2;
  }
  return 0;
}

function shareRecipe(data) {
  var sheet = sharedSheet();
  if (findCode(sheet, data.code)) return reply({ ok: false, error: 'taken' });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 3).setValues([[data.code, new Date().toISOString(), data.payload]]);
  return reply({ ok: true });
}

function fetchShared(data) {
  var sheet = sharedSheet();
  var row = findCode(sheet, data.code);
  if (!row) return reply({ ok: false, error: 'not_found' });
  return reply({ ok: true, payload: sheet.getRange(row, 3).getValue() });
}

/**
 * Profiles: each person's recipes, kept so every device they sign in on shows the same box.
 * One row per recipe in the "Profiles" tab: Profile | Recipe ID | Updated at | Deleted | Title | JSON in pieces
 */
var PROFILES_TAB = 'Profiles';
var PROFILE_FIXED = 5; // columns before the JSON pieces
var PROFILE_PIECES = 10;

function profilesSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(PROFILES_TAB) || book.insertSheet(PROFILES_TAB);
  if (sheet.getLastRow() === 0) {
    var head = ['Profile', 'Recipe ID', 'Updated at', 'Deleted', 'Title'];
    for (var i = 1; i <= PROFILE_PIECES; i++) head.push('Data ' + i);
    sheet.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Plain text, so Sheets doesn't turn the timestamps into dates
    sheet.getRange('A:' + String.fromCharCode(64 + head.length)).setNumberFormat('@');
  }
  return sheet;
}

function profileRows(sheet, profile) {
  var rows = [];
  if (sheet.getLastRow() < 2) return rows;
  var top = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < top.length; i++) {
    if (top[i][0] === profile) {
      rows.push({ row: i + 2, id: String(top[i][1]), updatedAt: String(top[i][2]), deleted: top[i][3] === 'yes' || top[i][3] === true });
    }
  }
  return rows;
}

function syncIndex(data) {
  var items = profileRows(profilesSheet(), data.profile).map(function (r) {
    return { id: r.id, updatedAt: r.updatedAt, deleted: r.deleted };
  });
  return reply({ ok: true, items: items });
}

function syncGet(data) {
  var sheet = profilesSheet();
  var want = {};
  data.ids.forEach(function (id) { want[id] = true; });
  var out = [];
  profileRows(sheet, data.profile).forEach(function (r) {
    if (!want[r.id] || r.deleted) return;
    var pieces = sheet.getRange(r.row, PROFILE_FIXED + 1, 1, PROFILE_PIECES).getValues()[0];
    out.push(pieces.join(''));
  });
  return reply({ ok: true, recipes: out });
}

function syncPut(data) {
  var sheet = profilesSheet();
  var rowFor = {};
  profileRows(sheet, data.profile).forEach(function (r) { rowFor[r.id] = r.row; });
  var appended = [];
  data.items.forEach(function (item) {
    var row = [data.profile, item.id, item.updatedAt, item.deleted ? 'yes' : '', item.title || ''];
    var json = item.json || '';
    for (var i = 0; i < PROFILE_PIECES; i++) row.push(json.substr(i * 45000, 45000));
    if (rowFor[item.id]) {
      sheet.getRange(rowFor[item.id], 1, 1, row.length).setValues([row]);
    } else {
      appended.push(row);
    }
  });
  if (appended.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, appended[0].length).setValues(appended);
  }
  return reply({ ok: true, saved: data.items.length });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
