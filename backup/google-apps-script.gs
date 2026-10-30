/**
 * Jasmine's Recipes: backup receiver.
 * Lives inside the Google Sheet (Extensions > Apps Script). The app sends it recipes and it writes one row per
 * recipe per device, updating the row when a recipe is edited.
 */

// Type a long random password here, and put the very same one in Vercel as BACKUP_SECRET.
var SECRET = 'PASTE_A_LONG_RANDOM_PASSWORD_HERE';
var TAB_NAME = 'Recipes';

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET === 'PASTE_A_LONG_RANDOM_PASSWORD_HERE' || data.secret !== SECRET) {
      return reply({ ok: false, error: 'Wrong secret' });
    }

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
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
