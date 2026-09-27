/**
 * Lesson 3 — the first backend.
 * This script lives INSIDE your Google Sheet (Extensions → Apps Script).
 * When someone opens the web app URL, Google calls doGet() and sends back
 * whatever we return. We return the Books sheet as JSON.
 */

const SHEET_NAME = 'Books';

function doGet(e) {
  // Lesson 9: the library is private now. Books are only sent to signed-in users (doPost 'books').
  return jsonResponse({ ok: false, error: 'Please sign in', code: 'AUTH' });
}

/** Lesson 9: the book list for a signed-in user (admins also get the purchase details). */
function booksFor(user) {
  const books = user.role === 'admin' ? readBooks() : readBooks().map(hidePrivateFields);
  addRatingsToBooks(books);
  return { ok: true, books: books, categories: BOOK_CATEGORIES };
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

    // Lesson 9: sign in ONCE with the Google ID token → we give back our own session token
    if (request.action === 'login') {
      const user = verifyUser(request.idToken);          // Google says who this is
      const session = createSession(user.email);         // our own 30-day "ticket"
      return jsonResponse({ ok: true, sessionToken: session.token, expiresAt: session.expiresAt,
        user: user, myData: user.status === 'active' ? getMyData(user.email) : null });
    }

    // EVERY other action needs a valid session (throws code 'AUTH' if missing or expired)
    const user = userFromSession(request.sessionToken);

    if (request.action === 'logout') {
      endSession(request.sessionToken);
      return jsonResponse({ ok: true });
    }
    if (request.action === 'me') {                      // allowed for pending users too
      return jsonResponse({ ok: true, user: user,
        myData: user.status === 'active' ? getMyData(user.email) : null });
    }

    // Lesson 10: everything below needs an ACTIVE account
    requireActive(user);

    if (request.action === 'listUsers') {
      requireAdmin(user);
      return jsonResponse({ ok: true, users: listUsers() });
    }
    if (request.action === 'setUserStatus') {
      requireAdmin(user);
      return jsonResponse({ ok: true, result: setUserStatus(user, request.email, request.status) });
    }
    if (request.action === 'deleteUser') {
      requireAdmin(user);
      return jsonResponse({ ok: true, result: deleteUser(user, request.email) });
    }
    if (request.action === 'books') {
      return jsonResponse(booksFor(user));
    }

    if (request.action === 'setStatus') {
      return jsonResponse({ ok: true, result: setStatus(user, request.bookId, request.status) });
    }
    if (request.action === 'rateBook') {
      return jsonResponse({ ok: true, result: rateBook(user, request.bookId, request.rating, request.review) });
    }
    if (request.action === 'recommend') {                 // Lesson 8
      return jsonResponse({ ok: true, recommendations: recommendBooks(user.email, 8) });
    }


    // ---- Lesson 6: admin-only actions ----
    if (request.action === 'adminBooks') {
      requireAdmin(user);
      const books = readBooks();                 // ALL fields, including purchase info
      addRatingsToBooks(books);
      return jsonResponse({ ok: true, books: books, categories: BOOK_CATEGORIES });
    }
    if (request.action === 'saveBook') {
      requireAdmin(user);
      return jsonResponse({ ok: true, book: saveBook(user, request.book, request.imageBase64) });
    }
    if (request.action === 'webLookup') {             // Lesson 7d
      requireAdmin(user);
      return jsonResponse({ ok: true, info: webLookup(request.book, request.imageBase64) });
    }
    if (request.action === 'analyzeCover') {          // Lesson 7
      requireAdmin(user);
      return jsonResponse({ ok: true, draft: analyzeCover(request.imageBase64, request.mimeType) });
    }
    if (request.action === 'deleteBook') {
      requireAdmin(user);
      return jsonResponse({ ok: true, result: deleteBook(request.bookId) });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + request.action });
  } catch (err) {
    // code 'AUTH' tells the browser "show the login screen again"
    return jsonResponse({ ok: false, error: err.message, code: err.code || '' });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Checks the ID token with Google and returns our user record. */
function verifyUser(idToken) {
  if (!idToken) throw authError('Not signed in');

  // 1. Ask Google: is this token genuine and not expired?
  const res = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw authError('Invalid or expired sign-in');
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
  const sheet = getSheet('Users', USER_HEADERS);
  const headers = ensureColumns(sheet, USER_HEADERS);      // adds "status" to old sheets
  const admins = adminEmails();
  const now = new Date().toISOString();
  const rows = readRows(sheet);
  const index = rows.findIndex(r => r.email === email);
  const old = index === -1 ? null : rows[index];

  const user = {
    email: email, name: name, picture: picture,
    role: admins.includes(email) ? 'admin' : ((old && old.role) || 'user'),
    createdAt: old ? old.createdAt : now,
    lastLogin: now,
    // Lesson 10: NEW people wait for an admin. Users who existed before this feature
    // (empty status) stay active, so nobody already using the library gets locked out.
    status: admins.includes(email) ? 'active' : (old ? (old.status || 'active') : 'pending')
  };
  upsertRow(sheet, r => r.email === email, headers.map(h => user[h] === undefined ? '' : user[h]));
  return publicUser(user);
}

// ---------- Lesson 10: user accounts (pending → active) ----------
const USER_HEADERS = ['email', 'name', 'picture', 'role', 'createdAt', 'lastLogin', 'status'];

function adminEmails() {
  return (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAILS') || '')
    .split(',').map(x => x.trim().toLowerCase()).filter(x => x);
}

/** What the browser may know about a user */
function publicUser(u) {
  return { email: u.email, name: u.name, picture: u.picture, role: u.role, status: u.status };
}

/** Adds any missing header columns at the end of row 1. Returns the full header row. */
function ensureColumns(sheet, wanted) {
  const headers = sheet.getDataRange().getValues()[0];
  const missing = wanted.filter(h => !headers.includes(h));
  if (missing.length) sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  return headers.concat(missing);
}

function requireActive(user) {
  if (user.status !== 'active') {
    const err = new Error('Your account is waiting for an admin to activate it.');
    err.code = 'PENDING';
    throw err;
  }
}

function listUsers() {
  return readRows(getSheet('Users', USER_HEADERS)).map(u => ({
    email: u.email, name: u.name, picture: u.picture,
    role: adminEmails().includes(u.email) ? 'admin' : (u.role || 'user'),
    status: adminEmails().includes(u.email) ? 'active' : (u.status || 'active'),
    createdAt: String(u.createdAt).slice(0, 10), lastLogin: String(u.lastLogin).slice(0, 16).replace('T', ' ')
  }));
}

/** Admin: activate / deactivate someone. */
function setUserStatus(admin, email, status) {
  if (!['active', 'pending'].includes(status)) throw new Error('Invalid status');
  guardOtherUser(admin, email);
  const sheet = getSheet('Users', USER_HEADERS);
  const headers = ensureColumns(sheet, USER_HEADERS);
  const row = readRows(sheet).find(r => r.email === email);
  if (!row) throw new Error('User not found');
  row.status = status;
  upsertRow(sheet, r => r.email === email, headers.map(h => row[h] === undefined ? '' : row[h]));
  return { email: email, status: status };
}

/** Admin: remove a user, their sessions, reading history and ratings. */
function deleteUser(admin, email) {
  guardOtherUser(admin, email);
  const mine = r => r.email === email;
  deleteRowsWhere(getSheet('Users', USER_HEADERS), mine);
  deleteRowsWhere(getSheet('Sessions', SESSION_HEADERS), mine);        // signs them out everywhere
  deleteRowsWhere(getSheet('Reading', ['email', 'bookId', 'status', 'updatedAt']), mine);
  deleteRowsWhere(getSheet('Ratings', ['bookId', 'email', 'userName', 'rating', 'review', 'updatedAt']), mine);
  return { email: email };
}

/** Admins cannot lock THEMSELVES out, and ADMIN_EMAILS people are protected. */
function guardOtherUser(admin, email) {
  email = String(email || '').toLowerCase();
  if (!email) throw new Error('No email');
  if (email === admin.email) throw new Error('You cannot change your own account');
  if (adminEmails().includes(email)) throw new Error('This admin is set in ADMIN_EMAILS (Script properties)');
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
  'addedBy', 'addedAt', 'updatedAt',
  'coverUrl', 'coverFileId',                         // Lesson 7
  'titleSinglish', 'authorSinglish',                 // Lesson 7c: for English-keyboard search
  'translator', 'originalTitle', 'originalAuthor',    // Lesson 7d: translations
  'description', 'reviewSummary', 'webSources'];      // Lesson 7d: from the web

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

function saveBook(user, input, imageBase64) {
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
  ['title', 'author', 'titleSinglish', 'authorSinglish', 'language', 'isbn', 'publisher', 'year', 'shelf',
   'translator', 'originalTitle', 'originalAuthor', 'description', 'reviewSummary', 'webSources',
   'purchasedFrom', 'purchaseDate', 'price', 'notes', 'coverUrl'].forEach(f => {
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

  // Lesson 7: a photo was sent → store it in Drive and use it as the cover
  if (imageBase64) {
    const saved = saveCoverToDrive(book.id, imageBase64);
    book.coverFileId = saved.fileId;
    book.coverUrl = saved.url;
  }

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


// =====================================================================
// Lesson 7: photo of a cover → Gemini reads it → form is filled in
//
// Script properties:
//   GEMINI_API_KEY = key from https://aistudio.google.com/apikey
//   GEMINI_MODEL   = (optional) default "gemini-flash-latest"
//   DRIVE_FOLDER_ID is created automatically on the first photo
// =====================================================================

function analyzeCover(imageBase64, mimeType) {
  if (!imageBase64) throw new Error('No image received');

  // 1. Tell the AI exactly what we want. Clear rules = fewer made-up answers.
  const prompt = [
    'This is a photo of a book cover from an office library in Sri Lanka.',
    'Read the text on the cover exactly as printed.',
    'If the title or author is NOT in English letters (Sinhala, Tamil...), also give titleSinglish and',
    'authorSinglish: the same words written in English letters the way Sri Lankans type them in chat',
    '(e.g. "මඩොල් දූව" → "Madol Doowa", "මාර්ටින් වික්‍රමසිංහ" → "Martin Wickramasinghe").',
    'If the title is already in English letters, leave titleSinglish and authorSinglish empty.',
    'language = the language the book is written in (e.g. English, Sinhala, Tamil).',
    'isTranslation = true only if the cover says it is translated (e.g. "translated by", "පරිවර්තනය").',
    'translator = the translator\'s name if printed (often after "පරිවර්තනය" or "translated by"), else empty.',
    'If it is a translation, author = the ORIGINAL author when printed, and originalTitle = the original title if printed.',
    'categories = 1 to 3 items chosen ONLY from this list: ' + BOOK_CATEGORIES.join(', ') + '.',
    'Only give an ISBN if you can SEE it in the photo. Never guess an ISBN.',
    'Use an empty string for anything you cannot read.',
    'confidence = a number from 0 to 1: how sure you are about the title.',
    'coverBox = where the book cover is in the photo, as [ymin, xmin, ymax, xmax]',
    'scaled from 0 to 1000 (0,0 = top-left of the photo). Follow the cover\'s outer edges.'
  ].join('\n');

  // 2. A JSON schema forces Gemini to answer in exactly this shape
  const schema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      author: { type: 'STRING' },
      titleSinglish: { type: 'STRING' },
      authorSinglish: { type: 'STRING' },
      translator: { type: 'STRING' },
      originalTitle: { type: 'STRING' },
      categories: { type: 'ARRAY', items: { type: 'STRING' } },
      language: { type: 'STRING' },
      isTranslation: { type: 'BOOLEAN' },
      isbn: { type: 'STRING' },
      publisher: { type: 'STRING' },
      year: { type: 'STRING' },
      confidence: { type: 'NUMBER' },
      coverBox: { type: 'ARRAY', items: { type: 'NUMBER' } }      // for auto-crop in the browser
    },
    required: ['title', 'author', 'categories', 'language', 'isTranslation', 'confidence']
  };

  const draft = callGemini(prompt, imageBase64, mimeType || 'image/jpeg', schema);

  // 3. Clean up the answer: keep only digits/X in the ISBN
  draft.isbn = String(draft.isbn || '').replace(/[^0-9Xx]/g, '');
  if (draft.isbn.length !== 10 && draft.isbn.length !== 13) draft.isbn = '';

  // 4. Google Books (free, no key needed) can fill gaps + give a nice cover picture
  const extra = googleBooksLookup(draft.isbn, draft.title, draft.author);
  if (extra) {
    ['isbn', 'publisher', 'year'].forEach(f => { if (!draft[f]) draft[f] = extra[f]; });
    draft.coverUrl = extra.coverUrl;
  }
  return draft;
}

/** Calls Gemini with a text prompt + (optional) image and a JSON schema. Returns the parsed JSON. */
function callGemini(prompt, imageBase64, mimeType, schema) {
  const parts = [{ text: prompt }];
  if (imageBase64) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });   // the photo itself
  const body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.1,                         // low = factual, not creative
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };
  return JSON.parse(answerText(geminiRequest(body)));
}

/** Pulls the answer text out of Gemini's nested response: candidates[0].content.parts[].text */
function answerText(answer) {
  const parts = (answer.candidates && answer.candidates[0] && answer.candidates[0].content &&
    answer.candidates[0].content.parts) || [];
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
  if (!text) throw new Error('The AI returned no answer. Try again.');
  return text;
}

/** Sends ANY request body to Gemini, with retries + a backup model. Returns the full response object. */
function geminiRequest(body, quick) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in Script properties');
  // Lesson 7b: a list of models to try. If the first is busy (503) or out of free quota (429),
  // we try the next one. Each model has its own free quota.
  const models = [props.getProperty('GEMINI_MODEL') || 'gemini-flash-latest', 'gemini-flash-lite-latest'];

  let res = null, code = 0;
  tryModels:
  for (const model of models) {
    const maxAttempts = quick ? 1 : 3;          // quick = no waiting/retries (used by the web lookup)
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-goog-api-key': apiKey },    // the key goes in a header, never in the browser
          payload: JSON.stringify(body),
          muteHttpExceptions: true                  // let US handle errors instead of crashing
        });
      code = res.getResponseCode();
      if (code === 200) break tryModels;            // success → leave BOTH loops
      if (code === 429) break;                      // this model's quota is used up → next model
      if (code !== 503 && code !== 500) break tryModels;   // a real error (bad key…) → stop
      // 503/500 = "busy right now": wait 1 s, 2 s, 4 s ("exponential backoff"), then retry
      if (attempt < maxAttempts) Utilities.sleep(1000 * Math.pow(2, attempt - 1));
    }
  }

  // Friendly messages for the user; details go to the Apps Script log (Executions)
  if (code !== 200) console.error('Gemini ' + code + ': ' + res.getContentText().slice(0, 500));
  if (code === 429) throw new Error('AI free limit reached for today. Try again later, or type the details.');
  if (code === 503 || code === 500) throw new Error('The AI is very busy right now. Wait a minute and tap "Read cover" again.');
  if (code === 400 || code === 403) {
    let reason = '';
    try { reason = JSON.parse(res.getContentText()).error.message; } catch (e) { /* not JSON */ }
    throw new Error('The AI rejected the request: ' + (reason || 'check GEMINI_API_KEY').slice(0, 200));
  }
  if (code !== 200) throw new Error('AI error ' + code + '. See Executions log in Apps Script.');

  return JSON.parse(res.getContentText());
}

/** Looks a book up on Google Books by ISBN, or by title + author. Returns null if not found. */
function googleBooksLookup(isbn, title, author) {
  let q = isbn ? 'isbn:' + isbn : (title ? 'intitle:' + title + (author ? ' inauthor:' + author : '') : '');
  if (!q) return null;
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/books/v1/volumes?maxResults=1&q=' +
      encodeURIComponent(q), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const item = (JSON.parse(res.getContentText()).items || [])[0];
    if (!item) return null;
    const v = item.volumeInfo;
    const ids = v.industryIdentifiers || [];
    const isbn13 = ids.find(i => i.type === 'ISBN_13') || ids.find(i => i.type === 'ISBN_10') || {};
    return {
      isbn: isbn13.identifier || '',
      publisher: v.publisher || '',
      year: String(v.publishedDate || '').slice(0, 4),
      coverUrl: ((v.imageLinks && v.imageLinks.thumbnail) || '').replace('http://', 'https://')
    };
  } catch (err) {
    return null;          // Google Books is a "nice to have": never fail the whole request
  }
}

/** Saves the photo as a JPEG in a Drive folder, shared "anyone with the link can view". */
function saveCoverToDrive(bookId, imageBase64) {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty('DRIVE_FOLDER_ID');
  if (!folderId) {
    folderId = DriveApp.createFolder('Library Portal - Covers').getId();
    props.setProperty('DRIVE_FOLDER_ID', folderId);
  }
  // base64 text → bytes → a "blob" (file content) → a file in Drive
  const blob = Utilities.newBlob(Utilities.base64Decode(imageBase64), 'image/jpeg', bookId + '.jpg');
  const file = DriveApp.getFolderById(folderId).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { fileId: file.getId(), url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w600' };
}

/** Run this once from the editor to check your Gemini key works (no image). */
function testGemini() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const model = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-flash-latest';
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': apiKey },
    payload: JSON.stringify({ contents: [{ parts: [{ text: 'Say hello in Sinhala' }] }] }),
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText().slice(0, 500));
}


// =====================================================================
// Lesson 7d: categories list + web lookup (Gemini with Google Search)
// =====================================================================

// ONE list, used by the AI prompts AND sent to the browser for the category picker.
const BOOK_CATEGORIES = [
  'Novel', 'Short Stories', 'Poetry', 'Classic', 'Children', 'Young Adult',
  'Mystery & Thriller', 'Romance', 'Science Fiction & Fantasy', 'Historical Fiction',
  'Biography & Memoir', 'History', 'Religion & Philosophy', 'Buddhism', 'Politics & Society',
  'Psychology', 'Self-help', 'Health & Wellness', 'Business & Management', 'Economics & Finance',
  'Science', 'Technology', 'Programming', 'Software Engineering', 'Security', 'Data & AI',
  'Education & Reference', 'Language & Linguistics', 'Travel', 'Art & Photography', 'Cooking',
  'Comics'
];

/**
 * Lesson 7d + 8b: find extra information about a book. Tries 3 sources, best first:
 *   1. Gemini + Google Search ("grounding")  → mode 'web'
 *   2. Gemini's own knowledge (no search)    → mode 'ai'   (if 1 fails or finds nothing)
 *   3. Google Books API                       → fills any gaps (free, very reliable for ISBN books)
 * input = what we already know: { title, author, titleSinglish, authorSinglish, translator, language, isbn }
 */
function webLookup(input, imageBase64) {
  if (!input || !String(input.title || '').trim()) throw new Error('Enter at least a title first');

  // Lesson 8d: which language should the description be written in?
  const allowed = ['Sinhala', 'English', 'Tamil'];
  const lang = allowed.includes(input.answerLanguage) ? input.answerLanguage : 'English';   // allow-list again
  const answerIn = {
    Sinhala: 'in natural Sinhala (සිංහල, Unicode Sinhala script — not Singlish)',
    Tamil: 'in natural Tamil (தமிழ் script)',
    English: 'in English'
  }[lang];
  const known = ['title', 'author', 'titleSinglish', 'authorSinglish', 'translator', 'language', 'isbn', 'publisher']
    .filter(k => input[k]).map(k => k + ': ' + String(input[k]).slice(0, 200)).join('\n');
  const translationHint = input.isTranslation
    ? 'Our copy IS a translation into ' + (input.language || 'another language') + '.'
    : 'Our copy is NOT marked as a translation: it is probably the original ' + (input.language || '') +
      ' edition. Then leave translator, originalTitle, originalAuthor and originalLanguage EMPTY ' +
      '(do not describe some other translated edition).';

  const prompt = [
    'Find information about this book.',
    translationHint,
    known,
    '',
    'Answer with ONLY a JSON object (no other text, no citation marks) with these keys:',
    '  found: true only if you are confident it is THIS book (same title and author)',
    '  description: 2-4 neutral sentences ' + answerIn + ' about what the book is about',
    '  reviewSummary: 1-2 sentences ' + answerIn + ' on what readers or critics say (empty if unknown)',
    'Write description and reviewSummary ' + answerIn + ' even if the sources are in another language.',
    'Keep names of people and books exactly as they are usually written in that language.',
    '  originalTitle, originalAuthor, originalLanguage: only if it is a translation',
    '  translator, publisher, year, pageCount',
    '  categories: 1-3 items ONLY from: ' + BOOK_CATEGORIES.join(', '),
    'Use empty strings for anything you do not know. Never invent facts.',
    '',
    // Lesson 8e: fix OCR mistakes in the title/author
    'IMPORTANT: title and author above were read by an AI from a photo and may have spelling mistakes',
    '(common in Sinhala: similar letters like ව/ච, ද/ඳ, missing ් or ා). If the sources' +
      (imageBase64 ? ' and the attached cover photo' : '') + ' show the CORRECT spelling for THIS book, give:',
    '  correctedTitle, correctedAuthor: the correct spelling, in the SAME script as printed on the cover',
    '  correctedTitleSinglish, correctedAuthorSinglish: the same in English letters, as Sri Lankans type them',
    'Leave the corrected fields EMPTY if the reading was already right or if you are not sure.'
  ].join('\n');

  // The photo helps the AI decide between the web spelling and what is really printed
  const photoPart = imageBase64 ? [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }] : [];

  let info = null, mode = 'none', sources = [];
  const notes = [];
  // Lesson 8f: time every step → shows up in Apps Script "Executions", so slow parts are easy to find
  const started = Date.now();
  const step = name => console.log(name + ' after ' + Math.round((Date.now() - started) / 1000) + ' s');

  // ---- 1. Search the web ourselves (free), then let Gemini read ONLY those pages ----
  // Gemini's built-in Google Search has no free quota on many keys, so we do the search:
  //   Tavily (if TAVILY_API_KEY is set) → otherwise Wikipedia (English + Sinhala, no key needed)
  // This pattern is called RAG: "Retrieval-Augmented Generation" — find text, then ask the AI about it.
  let pages = [];
  try {
    pages = searchTheWeb(input);
    step('search found ' + pages.length + ' page(s)');
  } catch (err) {
    console.warn('Search failed: ' + err.message);
    notes.push('Search unavailable (' + err.message + ')');
  }

  if (pages.length) {
    try {
      const context = pages.map((p, i) =>
        'SOURCE ' + (i + 1) + ': ' + p.title + ' (' + p.url + ')\n' + p.content.slice(0, 3000)).join('\n\n');
      const answer = geminiRequest({
        contents: [{ parts: [{ text: prompt +
          '\n\nUse ONLY the sources below (and the photo). If they are about a different book, set found to false.\n\n' +
          context }].concat(photoPart) }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      }, true);
      step('AI read the pages');
      const fromWeb = parseJsonLoose(answerText(answer));
      if (fromWeb.found) {
        info = fromWeb;
        mode = 'web';
        sources = pages.map(p => ({ title: p.title, url: p.url }));
      }
    } catch (err) {
      console.warn('Reading search results failed: ' + err.message);
      notes.push('AI could not read the results (' + err.message + ')');
    }
  }

  // ---- 2. no search: the model's own knowledge ----
  if ((!info || !info.found) && Date.now() - started < 60000) {   // skip if we already took > 1 minute
    try {
      const answer = geminiRequest({
        contents: [{ parts: [{ text: prompt }].concat(photoPart) }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      }, true);
      step('AI knowledge');
      const fromAi = parseJsonLoose(answerText(answer));
      if (fromAi.found) { info = fromAi; mode = 'ai'; sources = []; }
    } catch (err) {
      console.warn('AI knowledge lookup failed: ' + err.message);
      notes.push('AI unavailable (' + err.message + ')');
    }
  }

  info = info && info.found ? info : { found: false };

  // ---- 3. Google Books fills the gaps ----
  const gb = googleBooksDetails(input.isbn, input.title, input.author || input.authorSinglish);
  if (gb) {
    ['description', 'publisher', 'year', 'pageCount'].forEach(k => { if (!info[k]) info[k] = gb[k]; });
    if (gb.link) sources.push({ title: 'Google Books', url: gb.link });
    if (!info.found) { info.found = true; mode = 'googlebooks'; }
  }

  // The AI sometimes answers "categories": "Novel" (text) instead of ["Novel"] → normalise
  if (typeof info.categories === 'string') info.categories = info.categories.split(',');
  info.categories = (Array.isArray(info.categories) ? info.categories : [])
    .map(c => String(c).trim()).filter(c => BOOK_CATEGORIES.includes(c));
  info.sources = sources;
  info.mode = mode;
  info.notes = notes;
  return info;
}

/** JSON.parse that survives ```json fences, extra text and [1]-style citation marks. */
function parseJsonLoose(text) {
  const citation = /\s*\[\d+(,\s*\d+)*\]/g;          // web answers add [1] or [2, 3] after sentences
  const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!jsonText) throw new Error('The AI did not answer with JSON');
  let obj;
  try { obj = JSON.parse(jsonText); }
  catch (e) {
    try { obj = JSON.parse(jsonText.replace(citation, '')); }
    catch (e2) { throw new Error('Could not understand the AI answer'); }
  }
  // Sometimes the answer is a LIST [ {...} ] or has extra nesting → take the first object
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== 'object') throw new Error('Could not understand the AI answer');
  // Remove citation marks inside the text values too
  Object.keys(obj).forEach(k => {
    if (typeof obj[k] === 'string') obj[k] = obj[k].replace(citation, '').trim();
  });
  return obj;
}

/** Google Books: description + details + a link. null if not found. */
function googleBooksDetails(isbn, title, author) {
  isbn = String(isbn || '').replace(/[^0-9Xx]/g, '');
  const q = isbn ? 'isbn:' + isbn : (title ? 'intitle:' + title + (author ? ' inauthor:' + author : '') : '');
  if (!q) return null;
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/books/v1/volumes?maxResults=1&q=' +
      encodeURIComponent(q), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const item = (JSON.parse(res.getContentText()).items || [])[0];
    if (!item) return null;
    const v = item.volumeInfo;
    return {
      description: String(v.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
      publisher: v.publisher || '',
      year: String(v.publishedDate || '').slice(0, 4),
      pageCount: v.pageCount ? String(v.pageCount) : '',
      link: String(v.infoLink || '').replace('http://', 'https://')
    };
  } catch (err) {
    return null;
  }
}

/** Run from the editor to test the web lookup and read the result in the log. */
function testWebLookup() {
  Logger.log(JSON.stringify(webLookup({ title: 'Madol Doova', author: 'Martin Wickramasinghe' }), null, 2));
}


// =====================================================================
// Lesson 8: Recommendations
//
// Three ideas, added together into one score per unread book:
//   1. CONTENT  — "more like what you liked": same author, translator, category, language
//   2. PEOPLE   — "readers who liked what you liked also liked this" (collaborative filtering)
//   3. POPULAR  — well-rated by everyone (also the answer for brand-new users)
// Runs on the SERVER because only the server may see everyone's reading history.
// =====================================================================

function recommendBooks(myEmail, howMany) {
  const books = readBooks();
  addRatingsToBooks(books);
  const byId = {};
  books.forEach(b => { byId[String(b.id)] = b; });

  const reading = readRows(getSheet('Reading', ['email', 'bookId', 'status', 'updatedAt']));
  const ratings = readRows(getSheet('Ratings', ['bookId', 'email', 'userName', 'rating', 'review', 'updatedAt']));

  // ---- How much does EACH user like EACH book?  likes[email][bookId] = number ----
  // rating 5 → +2, 4 → +1, 3 → 0, 2 → -1, 1 → -2.  "Read" without a rating → +1, "Reading" → +0.5
  const likes = {};
  const like = (email, bookId, value) => {
    likes[email] = likes[email] || {};
    likes[email][String(bookId)] = value;
  };
  reading.forEach(r => like(r.email, r.bookId, r.status === 'read' ? 1 : 0.5));
  ratings.forEach(r => like(r.email, r.bookId, Number(r.rating) - 3));    // a rating overrides status

  const mine = likes[myEmail] || {};
  const seen = id => mine[id] !== undefined;          // already read / reading / rated → skip
  const likedIds = Object.keys(mine).filter(id => mine[id] > 0 && byId[id]);

  // ---- 1. CONTENT: build my "taste profile" from the books I liked ----
  const taste = {};                                    // e.g. { 'cat:Novel': 3, 'author:gunasekara': 2 }
  const add = (key, w) => { if (key) taste[key] = (taste[key] || 0) + w; };
  Object.keys(mine).forEach(id => {
    const b = byId[id];
    if (!b) return;
    const w = mine[id];                                // disliked books push their features DOWN
    featuresOf(b).forEach(f => add(f, w));
  });

  // ---- 2. PEOPLE: who likes the same books as me? ----
  const similarity = {};                               // similarity[otherEmail] = how alike we are
  Object.keys(likes).forEach(other => {
    if (other === myEmail) return;
    let score = 0;
    likedIds.forEach(id => { if (likes[other][id] > 0) score += 1; });
    if (score > 0) similarity[other] = score;
  });

  // ---- Score every book I have not seen ----
  const results = [];
  books.forEach(b => {
    const id = String(b.id);
    if (seen(id)) return;

    let content = 0, bestFeature = null, bestWeight = 0;
    featuresOf(b).forEach(f => {
      const w = (taste[f] || 0) * featureWeight(f);
      content += w;
      if (w > bestWeight) { bestWeight = w; bestFeature = f; }
    });

    let people = 0, fans = 0;
    Object.keys(similarity).forEach(other => {
      if (likes[other][id] > 0) { people += similarity[other] * likes[other][id]; fans++; }
    });

    // "Bayesian average": a book with ONE 5-star rating should not beat one with twenty 4.5s.
    // Pretend every book starts with 3 votes of 3.5 stars.
    const popular = ((b.ratingAvg * b.ratingCount) + 3.5 * 3) / (b.ratingCount + 3) - 3.5;

    const score = content + 1.5 * people + 0.8 * popular;
    if (score <= 0 && likedIds.length > 0) return;     // nothing in common with my taste

    results.push({ bookId: id, score: Math.round(score * 100) / 100,
      reason: reasonText(bestFeature, fans, b, likedIds.length === 0) });
  });

  results.sort((a, b) => b.score - a.score);           // highest score first
  return results.slice(0, howMany);
}

/** The "features" of a book, as short text keys. */
function featuresOf(book) {
  const list = [];
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u0D80-\u0DFF]+/g, '');
  (book.categories || []).forEach(c => list.push('cat:' + c));
  if (book.author) list.push('author:' + norm(book.author));
  if (book.translator) list.push('translator:' + norm(book.translator));
  if (book.language) list.push('lang:' + book.language);
  return list;
}

/** Same author matters more than same language. */
function featureWeight(feature) {
  if (feature.startsWith('author:')) return 2;
  if (feature.startsWith('translator:')) return 1.5;
  if (feature.startsWith('cat:')) return 1;
  return 0.3;                                          // language
}

/** A short human explanation — people trust recommendations more when they know WHY. */
function reasonText(feature, fans, book, newUser) {
  if (newUser) return book.ratingCount ? 'Popular in the library' : 'New in the library';
  if (fans >= 2) return fans + ' readers with your taste liked this';
  if (feature && feature.startsWith('author:')) return 'More by ' + book.author;
  if (feature && feature.startsWith('translator:')) return 'Also translated by ' + book.translator;
  if (fans === 1) return 'A reader with your taste liked this';
  if (feature && feature.startsWith('cat:')) return 'Because you like ' + feature.slice(4);
  return 'Popular in the library';
}


// =====================================================================
// Lesson 8c: free web search — Tavily (1,000 free searches / month) or Wikipedia (free, no key)
// Each returns a list of pages: [{ title, url, content }]
// =====================================================================

function searchTheWeb(input) {
  const tavilyKey = PropertiesService.getScriptProperties().getProperty('TAVILY_API_KEY');
  const query = [input.title, input.author, input.titleSinglish, 'book'].filter(Boolean).join(' ');
  if (tavilyKey) {
    try {
      const pages = tavilySearch(query, tavilyKey);
      // Lesson 8e: also add similar titles from Google Books → helps fix a mis-read title
      if (pages.length) return pages.concat(googleBooksCandidates(input));
    } catch (err) {
      console.warn(err.message + ' → trying Wikipedia instead');   // bad key / monthly limit used up
    }
  }
  // Wikipedia: try English with the Singlish/English title, and Sinhala with the Sinhala title
  const results = [];
  const enTitle = input.titleSinglish || input.title;
  results.push(...wikipediaSearch('en', enTitle + ' ' + (input.authorSinglish || input.author || '')));
  results.push(...googleBooksCandidates(input));
  if (/[\u0D80-\u0DFF]/.test(input.title)) results.push(...wikipediaSearch('si', input.title));
  return results;
}

/** https://tavily.com — sign up for a free key, no credit card. */
function tavilySearch(query, apiKey) {
  const res = UrlFetchApp.fetch('https://api.tavily.com/search', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({ query: query, search_depth: 'basic', max_results: 5 }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Tavily ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 150));
  }
  return (JSON.parse(res.getContentText()).results || [])
    .filter(r => r.url && r.content)
    .map(r => ({ title: r.title || r.url, url: r.url, content: r.content }));
}

/** Wikipedia search → the intro text of the best 2 matching articles. Free, no key. */
function wikipediaSearch(lang, query) {
  const base = 'https://' + lang + '.wikipedia.org/w/api.php?format=json&action=query';
  const search = UrlFetchApp.fetch(base + '&list=search&srlimit=2&srsearch=' + encodeURIComponent(query),
    { muteHttpExceptions: true });
  if (search.getResponseCode() !== 200) return [];
  const hits = (JSON.parse(search.getContentText()).query || {}).search || [];
  if (!hits.length) return [];

  // prop=extracts&exintro&explaintext = "give me the first section as plain text"
  const titles = hits.map(h => h.title).join('|');
  const pagesRes = UrlFetchApp.fetch(base + '&prop=extracts&exintro=1&explaintext=1&titles=' +
    encodeURIComponent(titles), { muteHttpExceptions: true });
  if (pagesRes.getResponseCode() !== 200) return [];
  const pages = (JSON.parse(pagesRes.getContentText()).query || {}).pages || {};
  return Object.keys(pages).map(id => pages[id]).filter(p => p.extract).map(p => ({
    title: p.title + ' — Wikipedia',
    url: 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')),
    content: p.extract
  }));
}

/** Run from the editor: shows what the free search finds (no AI involved). */
function testSearch() {
  Logger.log(JSON.stringify(searchTheWeb({ title: 'මඩොල් දූව', titleSinglish: 'Madol Doova',
    authorSinglish: 'Martin Wickramasinghe' }).map(p => [p.title, p.url, p.content.slice(0, 120)]), null, 2));
}


/**
 * Lesson 8e: up to 5 similar books from Google Books (free, no key) as ONE "page" of text.
 * Searching by author + a rough title still finds the right book even when the title
 * was read wrongly, and then the AI can pick the correct spelling from this list.
 */
function googleBooksCandidates(input) {
  const q = [input.title, input.author].filter(Boolean).join(' ') ||
    [input.titleSinglish, input.authorSinglish].filter(Boolean).join(' ');
  if (!q) return [];
  try {
    const res = UrlFetchApp.fetch('https://www.googleapis.com/books/v1/volumes?maxResults=5&q=' +
      encodeURIComponent(q), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];
    const items = JSON.parse(res.getContentText()).items || [];
    if (!items.length) return [];
    const lines = items.map(it => {
      const v = it.volumeInfo;
      return '- "' + v.title + (v.subtitle ? ': ' + v.subtitle : '') + '" by ' + (v.authors || ['?']).join(', ') +
        (v.publishedDate ? ' (' + String(v.publishedDate).slice(0, 4) + ')' : '');
    });
    return [{
      title: 'Google Books search',
      url: 'https://www.google.com/books?q=' + encodeURIComponent(q),
      content: 'Books with similar titles/authors:\n' + lines.join('\n')
    }];
  } catch (err) {
    return [];
  }
}


// =====================================================================
// Lesson 9: private site + "stay signed in" sessions
//
// Google ID tokens expire after about 1 hour. So after checking the Google token ONCE,
// we create our OWN random session token (valid 30 days) and give it to the browser,
// which keeps it in a cookie. Every request sends it; we look it up here.
//   Sessions sheet: tokenHash | email | createdAt | expiresAt
// We store only a SHA-256 HASH of the token (like a password): someone who can read
// the Sheet still cannot use the sessions.
// =====================================================================

const SESSION_DAYS = 30;
const SESSION_HEADERS = ['tokenHash', 'email', 'createdAt', 'expiresAt'];

function authError(message) {
  const err = new Error(message);
  err.code = 'AUTH';
  return err;
}

function sha256(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');   // bytes → hex text
}

function createSession(email) {
  const token = Utilities.getUuid() + Utilities.getUuid();   // ~244 random bits → impossible to guess
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  const sheet = getSheet('Sessions', SESSION_HEADERS);
  deleteRowsWhere(sheet, r => String(r.expiresAt) < now.toISOString());   // tidy up old sessions
  upsertRow(sheet, () => false, [sha256(token), email, now.toISOString(), expiresAt]);   // always a new row
  return { token: token, expiresAt: expiresAt };
}

/** Session token → the user. Uses CacheService so most requests do not read the Sheet. */
function userFromSession(token) {
  if (!token) throw authError('Please sign in');
  const hash = sha256(token);
  const cache = CacheService.getScriptCache();
  let email = cache.get('s_' + hash);

  if (!email) {
    const row = readRows(getSheet('Sessions', SESSION_HEADERS)).find(r => r.tokenHash === hash);
    if (!row) throw authError('Your session has ended. Please sign in again.');
    if (String(row.expiresAt) < new Date().toISOString()) throw authError('Your session expired. Please sign in again.');
    email = row.email;
    cache.put('s_' + hash, email, 6 * 3600);            // remember for 6 hours (the maximum)
  }

  // Read the user fresh from the Users sheet → a role change (admin/user) works immediately
  const users = readRows(getSheet('Users', USER_HEADERS));
  const u = users.find(r => r.email === email);
  if (!u) throw authError('Your account was removed. Please sign in again.');
  const isAdminEmail = adminEmails().includes(u.email);
  return { email: u.email, name: u.name, picture: u.picture,
    role: isAdminEmail ? 'admin' : (u.role || 'user'),
    status: isAdminEmail ? 'active' : (u.status || 'active') };
}

function endSession(token) {
  if (!token) return;
  const hash = sha256(token);
  CacheService.getScriptCache().remove('s_' + hash);
  deleteRowsWhere(getSheet('Sessions', SESSION_HEADERS), r => r.tokenHash === hash);
}
