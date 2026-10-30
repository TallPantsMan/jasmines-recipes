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
  // A recipe with a cover photo is longer than one cell holds, so it is kept in up to three pieces
  var p = String(data.payload);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 5).setValues([[data.code, new Date().toISOString(), p.substr(0, 45000), p.substr(45000, 45000), p.substr(90000, 45000)]]);
  return reply({ ok: true });
}

function fetchShared(data) {
  var sheet = sharedSheet();
  var row = findCode(sheet, data.code);
  if (!row) return reply({ ok: false, error: 'not_found' });
  return reply({ ok: true, payload: sheet.getRange(row, 3, 1, 3).getValues()[0].join('') });
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

/**
 * Tidy-up helpers. Run these by hand from the editor (pick the name in the dropdown, then Run).
 * dedupeProfiles: if the same recipe is listed twice for one person, keeps the most recently edited copy.
 * formatAll: makes the tabs easy to read (colours, column widths, technical columns tucked away, sorted).
 */
function dedupeProfiles() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = profilesSheet();
    if (sheet.getLastRow() < 2) return;
    var top = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
    var newest = {};
    top.forEach(function (r, i) {
      var key = r[0] + '|' + r[1];
      if (!newest[key] || String(r[2]) > String(top[newest[key] - 2][2])) newest[key] = i + 2;
    });
    var drop = [];
    top.forEach(function (r, i) {
      var key = r[0] + '|' + r[1];
      if (newest[key] !== i + 2 || r[1] === 'zz-sync-test') drop.push(i + 2);
    });
    drop.sort(function (a, b) { return b - a; }).forEach(function (row) { sheet.deleteRow(row); });
    Logger.log('Removed ' + drop.length + ' rows');
  } finally {
    lock.releaseLock();
  }
}

function styleSheet(sheet, widths, hiddenCols) {
  var maxRows = sheet.getMaxRows();
  var maxCols = sheet.getMaxColumns();
  var all = sheet.getRange(1, 1, maxRows, maxCols);
  all.setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sheet.getBandings().forEach(function (b) { b.remove(); });
  sheet.getRange(1, 1, maxRows, widths.length).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor('#FF5B26').setFirstRowColor('#FFFFFF').setSecondRowColor('#FFF4EE');
  sheet.getRange(1, 1, 1, widths.length).setFontColor('#FFFFFF').setFontWeight('bold').setFontSize(11);
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);
  widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  (hiddenCols || []).forEach(function (c) { sheet.hideColumns(c); });
}

function formatAll() {
  var book = SpreadsheetApp.getActiveSpreadsheet();

  // Profiles: one row per recipe per person. The JSON pieces (F:O) and the id are tucked away.
  var prof = profilesSheet();
  if (prof.getLastRow() > 2) {
    prof.getRange(2, 1, prof.getLastRow() - 1, prof.getLastColumn())
      .sort([{ column: 1, ascending: true }, { column: 4, ascending: true }, { column: 5, ascending: true }]);
  }
  styleSheet(prof, [90, 120, 170, 70, 300, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80], [2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  prof.setTabColor('#FF5B26');
  prof.getRange(1, 3, prof.getMaxRows(), 1).setFontColor('#6E6457');
  prof.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$D2="yes"')
      .setFontColor('#B5ADA1').setStrikethrough(true).setRanges([prof.getRange(2, 1, prof.getMaxRows() - 1, 5)]).build()
  ]);

  // Recipes: the backup copy from each device. Device ID, recipe id and the raw JSON are hidden.
  var rec = book.getSheetByName(TAB_NAME);
  if (rec) {
    var widths = [150, 90, 170, 130, 240, 90, 150, 200, 70, 70, 70, 140, 140, 70, 80, 60, 300, 300, 300, 200, 150, 150, 120];
    styleSheet(rec, widths, [2, 4, 23]);
    rec.setTabColor('#8A8072');
  }

  // Shared: short codes for recipes being sent. The squeezed text is tucked away.
  var shared = sharedSheet();
  shared.getRange(1, 1, 1, 5).setValues([['Code', 'Created', 'Recipe (squeezed text)', 'Part 2', 'Part 3']]);
  styleSheet(shared, [110, 180, 120, 80, 80], [3, 4, 5]);
  shared.setTabColor('#C9BFAF');

  // Tab order: Profiles first
  book.setActiveSheet(prof);
  book.moveActiveSheet(1);
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
