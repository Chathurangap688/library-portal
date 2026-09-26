/**
 * Lesson 3 — the first backend.
 * This script lives INSIDE your Google Sheet (Extensions → Apps Script).
 * When someone opens the web app URL, Google calls doGet() and sends back
 * whatever we return. We return the Books sheet as JSON.
 */

const SHEET_NAME = 'Books';

function doGet(e) {
  const books = readBooks().map(hidePrivateFields);   // Lesson 6: public = no purchase info
  addRatingsToBooks(books);            // Lesson 5: average stars + public reviews
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

      // Lesson 6: a date typed by hand in the Sheet arrives as a Date object → "yyyy-MM-dd"
      Object.keys(book).forEach(key => {
        if (book[key] instanceof Date) {
          book[key] = Utilities.formatDate(book[key], Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
      });

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

    // Lesson 5: EVERY action needs a signed-in user, so verify first.
    const user = verifyUser(request.idToken);   // throws if the token is bad

    if (request.action === 'me') {
      return jsonResponse({ ok: true, user: user, myData: getMyData(user.email) });
    }
    if (request.action === 'setStatus') {
      return jsonResponse({ ok: true, result: setStatus(user, request.bookId, request.status) });
    }
    if (request.action === 'rateBook') {
      return jsonResponse({ ok: true, result: rateBook(user, request.bookId, request.rating, request.review) });
    }


    // ---- Lesson 6: admin-only actions ----
    if (request.action === 'adminBooks') {
      requireAdmin(user);
      const books = readBooks();                 // ALL fields, including purchase info
      addRatingsToBooks(books);
      return jsonResponse({ ok: true, books: books });
    }
    if (request.action === 'saveBook') {
      requireAdmin(user);
      return jsonResponse({ ok: true, book: saveBook(user, request.book) });
    }
    if (request.action === 'deleteBook') {
      requireAdmin(user);
      return jsonResponse({ ok: true, result: deleteBook(request.bookId) });
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


// =====================================================================
// Lesson 5: reading status + ratings
//   Reading sheet: email | bookId | status | updatedAt
//     (no row = "to_read", the default — we only store reading / read)
//   Ratings sheet: bookId | email | userName | rating | review | updatedAt
// =====================================================================

const STATUSES = ['to_read', 'reading', 'read'];

/** Returns the sheet, creating it with a header row if it does not exist yet. */
function getSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

/** Turns a sheet into an array of objects using the header row (like readBooks). */
function readRows(sheet) {
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

/**
 * Update the first row where matches(row) is true, or add a new one.
 * LockService = only one request at a time may run this. Without it, two people
 * saving at the same moment could both "not find" a row and create duplicates.
 */
function upsertRow(sheet, matches, newValues) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);                  // wait up to 10 s for our turn
  try {
    const rows = readRows(sheet);
    const index = rows.findIndex(matches);
    // +2: one for the header row, one because sheet rows start at 1.
    // Not found → the first empty row after the data.
    const rowNumber = index === -1 ? rows.length + 2 : index + 2;
    const range = sheet.getRange(rowNumber, 1, 1, newValues.length);
    // Lesson 6: '@' = "plain text". Stops Sheets from turning "2026-09-01" into a date
    // (and shifting it by the time zone) or dropping the leading 0 of an ISBN.
    range.setNumberFormat('@');
    range.setValues([newValues]);
  } finally {
    lock.releaseLock();                  // ALWAYS give the lock back, even after an error
  }
}

function deleteRowsWhere(sheet, matches) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rows = readRows(sheet);
    // Delete from the bottom up, so earlier row numbers do not shift
    for (let i = rows.length - 1; i >= 0; i--) {
      if (matches(rows[i])) sheet.deleteRow(i + 2);
    }
  } finally {
    lock.releaseLock();
  }
}

function requireBook(bookId) {
  const exists = readBooks().some(b => String(b.id) === String(bookId));
  if (!exists) throw new Error('Book not found: ' + bookId);
}

function setStatus(user, bookId, status) {
  if (!STATUSES.includes(status)) throw new Error('Invalid status');
  requireBook(bookId);
  const sheet = getSheet('Reading', ['email', 'bookId', 'status', 'updatedAt']);
  const mine = row => row.email === user.email && String(row.bookId) === String(bookId);

  if (status === 'to_read') {
    deleteRowsWhere(sheet, mine);        // back to the default → remove the row
  } else {
    upsertRow(sheet, mine, [user.email, bookId, status, new Date().toISOString()]);
  }
  return { bookId: bookId, status: status };
}

function rateBook(user, bookId, rating, review) {
  rating = Number(rating);
  // Never trust the browser: someone can send rating 1000 with DevTools
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Rating must be 1 to 5');
  review = String(review || '').trim().slice(0, 1000);   // limit length
  requireBook(bookId);

  const sheet = getSheet('Ratings', ['bookId', 'email', 'userName', 'rating', 'review', 'updatedAt']);
  const mine = row => row.email === user.email && String(row.bookId) === String(bookId);
  upsertRow(sheet, mine, [bookId, user.email, user.name, rating, review, new Date().toISOString()]);
  return { bookId: bookId, rating: rating, review: review };
}

/** Everything about ME: { status: {bookId: 'read'}, ratings: {bookId: {rating, review}} } */
function getMyData(email) {
  const status = {};
  readRows(getSheet('Reading', ['email', 'bookId', 'status', 'updatedAt']))
    .filter(r => r.email === email)
    .forEach(r => { status[r.bookId] = r.status; });

  const ratings = {};
  readRows(getSheet('Ratings', ['bookId', 'email', 'userName', 'rating', 'review', 'updatedAt']))
    .filter(r => r.email === email)
    .forEach(r => { ratings[r.bookId] = { rating: Number(r.rating), review: r.review }; });

  return { status: status, ratings: ratings };
}

/** Adds ratingAvg, ratingCount and public reviews to each book. Emails are NOT sent. */
function addRatingsToBooks(books) {
  const ratings = readRows(getSheet('Ratings', ['bookId', 'email', 'userName', 'rating', 'review', 'updatedAt']));
  books.forEach(book => {
    const mine = ratings.filter(r => String(r.bookId) === String(book.id));
    const sum = mine.reduce((total, r) => total + Number(r.rating), 0);
    book.ratingCount = mine.length;
    book.ratingAvg = mine.length ? Math.round(sum / mine.length * 10) / 10 : 0;   // one decimal
    book.reviews = mine.map(r => ({
      userName: r.userName,
      rating: Number(r.rating),
      review: r.review,
      date: String(r.updatedAt).slice(0, 10)
    }));
  });
}


// =====================================================================
// Lesson 6: admins add / edit / delete books
// =====================================================================

// Every column the Books sheet may have. Missing columns are added automatically.
const BOOK_FIELDS = ['id', 'title', 'author', 'categories', 'isTranslation', 'language',
  'isbn', 'publisher', 'year', 'shelf',
  'purchasedFrom', 'purchaseDate', 'price', 'notes',
  'addedBy', 'addedAt', 'updatedAt'];

// Only admins see these (removed from the public doGet answer)
const PRIVATE_FIELDS = ['purchasedFrom', 'purchaseDate', 'price', 'notes', 'addedBy'];

function hidePrivateFields(book) {
  const copy = Object.assign({}, book);
  PRIVATE_FIELDS.forEach(f => delete copy[f]);
  return copy;
}

/** The server-side guard. Hiding the button in the browser is NOT security — this is. */
function requireAdmin(user) {
  if (user.role !== 'admin') throw new Error('Only admins can do this');
}

/** Adds any BOOK_FIELDS columns that the sheet does not have yet. Returns the header row. */
function ensureBookColumns(sheet) {
  const headers = sheet.getDataRange().getValues()[0];
  const missing = BOOK_FIELDS.filter(f => !headers.includes(f));
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return headers.concat(missing);
}

function saveBook(user, input) {
  if (!input) throw new Error('No book data');
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Title is required');

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const headers = ensureBookColumns(sheet);
  const now = new Date().toISOString();
  const isNew = !input.id;

  // Start from the existing row (so columns the form does not know about are kept)
  const existing = isNew ? {} : readRows(sheet).find(r => String(r.id) === String(input.id));
  if (!isNew && !existing) throw new Error('Book not found');

  const book = Object.assign({}, existing);
  // Copy ONLY known, editable fields from the browser (never trust extra keys)
  ['title', 'author', 'language', 'isbn', 'publisher', 'year', 'shelf',
   'purchasedFrom', 'purchaseDate', 'price', 'notes'].forEach(f => {
    book[f] = String(input[f] || '').trim().slice(0, 2000);
  });
  book.title = title;
  book.categories = (Array.isArray(input.categories) ? input.categories : String(input.categories || '').split(','))
    .map(c => String(c).trim()).filter(c => c).join(', ');     // sheet stores "A, B"
  book.isTranslation = input.isTranslation === true;

  // System fields: set by the SERVER, not the browser
  if (isNew) {
    book.id = 'b' + Utilities.getUuid().slice(0, 8);   // random short id, e.g. b3f9a12c
    book.addedBy = user.email;
    book.addedAt = now;
  }
  book.updatedAt = now;

  // Put values in the same order as the sheet columns
  const values = headers.map(h => book[h] === undefined ? '' : book[h]);
  upsertRow(sheet, r => String(r.id) === String(book.id), values);
  return book;
}

function deleteBook(bookId) {
  requireBook(bookId);
  const same = r => String(r.bookId) === String(bookId);
  deleteRowsWhere(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME), r => String(r.id) === String(bookId));
  // Also remove its reading status + ratings, so no "orphan" rows are left behind
  deleteRowsWhere(getSheet('Reading', ['email', 'bookId', 'status', 'updatedAt']), same);
  deleteRowsWhere(getSheet('Ratings', ['bookId', 'email', 'userName', 'rating', 'review', 'updatedAt']), same);
  return { bookId: bookId };
}
