/**
 * Lesson 3 — the first backend.
 * This script lives INSIDE your Google Sheet (Extensions → Apps Script).
 * When someone opens the web app URL, Google calls doGet() and sends back
 * whatever we return. We return the Books sheet as JSON.
 */

const SHEET_NAME = 'Books';

function doGet(e) {
  const books = readBooks();
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, books: books }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Reads every row of the Books sheet and turns it into a book object. */
function readBooks() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No sheet called "' + SHEET_NAME + '"');

  // getValues() gives a 2D array: [ [row1 cells], [row2 cells], ... ]
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];          // first row = column names: id, title, author, ...
  const dataRows = rows.slice(1);   // everything after the header

  return dataRows
    .filter(row => row[0] !== '')   // skip empty rows (no id)
    .map(row => {
      // Build { id: ..., title: ..., ... } using the header names as keys
      const book = {};
      headers.forEach((header, i) => { book[header] = row[i]; });

      // The sheet stores categories as text "A, B" — the website wants an array ['A', 'B']
      book.categories = String(book.categories || '')
        .split(',')
        .map(c => c.trim())
        .filter(c => c !== '');

      // A checkbox cell gives true/false; typed text gives "TRUE"/"yes" — handle both
      book.isTranslation = book.isTranslation === true ||
        ['true', 'yes', '1'].includes(String(book.isTranslation).toLowerCase());

      return book;
    });
}

/** Run this from the editor (▶ Run) to test without the website. Check "Execution log". */
function testReadBooks() {
  Logger.log(JSON.stringify(readBooks(), null, 2));
}


// =====================================================================
// Lesson 4: Google Sign-In
// The website sends us a Google ID token. We NEVER trust it blindly —
// we ask Google if it is real, and check it was made for OUR app.
//
// Script properties (Project Settings ⚙ → Script properties):
//   GOOGLE_CLIENT_ID  = your OAuth client ID (…apps.googleusercontent.com)
//   ADMIN_EMAILS      = your.email@gmail.com   (comma separated for more)
// =====================================================================

/**
 * doPost runs when the website sends a POST request.
 * Body (JSON text): { "action": "me", "idToken": "eyJ..." }
 */
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);

    if (request.action === 'me') {
      const user = verifyUser(request.idToken);   // throws if the token is bad
      return jsonResponse({ ok: true, user: user });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + request.action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Checks the ID token with Google and returns our user record. */
function verifyUser(idToken) {
  if (!idToken) throw new Error('Not signed in');

  // 1. Ask Google: is this token genuine and not expired?
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Invalid or expired sign-in');
  const claims = JSON.parse(res.getContentText());

  // 2. Was it issued for OUR website? (stops tokens from other apps being reused here)
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (claims.aud !== clientId) throw new Error('Token is for a different app');

  // 3. Has Google verified this email address?
  if (claims.email_verified !== 'true') throw new Error('Email not verified');

  // 4. Save / update the user in the Users sheet, then return them
  return saveUser(claims.email.toLowerCase(), claims.name || claims.email, claims.picture || '');
}

/** Adds the user to the Users sheet the first time, updates lastLogin after that. */
function saveUser(email, name, picture) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Users');
  if (!sheet) {                                   // create the sheet on first use
    sheet = ss.insertSheet('Users');
    sheet.appendRow(['email', 'name', 'picture', 'role', 'createdAt', 'lastLogin']);
  }

  const admins = (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .split(',').map(s => s.trim().toLowerCase());
  const now = new Date().toISOString();
  const rows = sheet.getDataRange().getValues();

  // Look for an existing row with this email (row 0 is the header)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === email) {
      const role = admins.includes(email) ? 'admin' : (rows[i][3] || 'user');
      // getRange(row, column, numRows, numColumns) — sheet rows start at 1, so i + 1
      sheet.getRange(i + 1, 2, 1, 5).setValues([[name, picture, role, rows[i][4], now]]);
      return { email: email, name: name, picture: picture, role: role };
    }
  }

  // Not found → new user
  const role = admins.includes(email) ? 'admin' : 'user';
  sheet.appendRow([email, name, picture, role, now, now]);
  return { email: email, name: name, picture: picture, role: role };
}
