// Lesson 3: the real books now come from the Google Sheet.
// `let` (not const) because we replace the list after it downloads.
let books = [];

// Sample data, used only when API_URL in config.js is empty (e.g. testing offline).
const sampleBooks = [
  {
    id: 'book1',
    title: 'Book 1',
    author: 'Author 1',
    categories: ['Programming', 'Software Engineering'],
    isTranslation: false,
    language: 'English'
  },
  {
    id: 'book2',
    title: 'Book 2',
    author: 'Author 2',
    categories: ['Fiction'],
    isTranslation: true,
    language: 'Sinhala'
  },
  {
    id: 'book3',
    title: 'Book 3',
    author: 'Author 3',
    categories: ['Security', 'Identity & Access'],
    isTranslation: false,
    language: 'English'
  },
  {
    id: 'book4',
    title: 'Book 4',
    author: 'Author 4',
    categories: ['Biography', 'History'],
    isTranslation: false,
    language: 'Sinhala'
  },
  {
    id: 'book5',
    title: 'Book 5',
    author: 'Author 5',
    categories: ['Self-help'],
    isTranslation: true,
    language: 'Tamil'
  },
  {
    id: 'book6',
    title: 'Book 6',
    author: 'Author 6',
    categories: ['Science'],
    isTranslation: false,
    language: 'English'
  }
];

// ------------------------------------------------------------------
// Lesson 2: make text SAFE before putting it inside HTML.
// '<b>Hi</b>' becomes '&lt;b&gt;Hi&lt;/b&gt;' so the browser shows it as text.
// ------------------------------------------------------------------
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ------------------------------------------------------------------
// Turn ONE book object into a piece of HTML (a "card").
// ------------------------------------------------------------------
function bookCard(book) {
  // Show the label only if this book is a translation, otherwise nothing ('')
  const badge = book.isTranslation ? '<span class="badge">Translation</span>' : '';

  // Lesson 5: my reading status (only when signed in) + average stars
  const status = currentUser ? (myData.status[book.id] || 'to_read') : '';
  const statusLabel = status === 'read' ? '<span class="status read">✓ Read</span>'
    : status === 'reading' ? '<span class="status">Reading</span>' : '';
  const stars = book.ratingCount
    ? `<div class="stars">${starText(book.ratingAvg)} <small>${book.ratingAvg} (${book.ratingCount})</small></div>` : '';

  // Backticks (`) make a template string: ${...} inserts a value.
  // data-id remembers WHICH book this card is, for the click handler.
  return `
    <div class="book" data-id="${escapeHtml(book.id)}">
      ${coverHtml(book, statusLabel)}
      <div class="title">${escapeHtml(book.title)}</div>
      <div class="author">${escapeHtml(book.author)}</div>
      <div class="meta">${escapeHtml(book.language)} · ${escapeHtml(book.categories.join(', '))}</div>
      ${stars}
      ${badge}
    </div>
  `;
}

// Lesson 7: a real picture if we have one, otherwise the coloured box with the title
function coverHtml(book, label) {
  if (book.coverUrl) {
    return `<div class="cover has-image">${label}<img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" loading="lazy"
      referrerpolicy="no-referrer" onerror="this.parentNode.classList.remove('has-image'); this.replaceWith(this.alt)"></div>`;
  }
  return `<div class="cover">${label}${escapeHtml(book.title)}</div>`;
}

// ★★★☆☆ for a number like 3.4 (rounded to the nearest star)
function starText(value) {
  const full = Math.round(value);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ------------------------------------------------------------------
// Draw a LIST of books into the page.
// ------------------------------------------------------------------
function renderBooks(list) {
  const grid = document.getElementById('grid');   // find <div id="grid">

  if (list.length === 0) {
    grid.innerHTML = '<p>No books found.</p>';
    return;
  }

  // map: book -> HTML string, join: glue all strings into one
  grid.innerHTML = list.map(bookCard).join('');
}

// ------------------------------------------------------------------
// Lesson 2: read the controls, keep only the matching books, draw them.
// ------------------------------------------------------------------
function applyFilters() {
  const searchText = document.getElementById('search').value.trim().toLowerCase();
  const searchKey = singlishKey(searchText);         // Lesson 7c: spelling-tolerant version
  const language = document.getElementById('language').value;
  const onlyTranslations = document.getElementById('onlyTranslations').checked;

  const result = books.filter(book => {
    // 1. Search: exact text (works for Sinhala typing) OR the loose Singlish key
    const matchesSearch = searchText === '' ||
      searchHaystack(book).includes(searchText) ||
      (searchKey !== '' && searchKeyOf(book).includes(searchKey));

    // 2. Language: empty value means "All languages"
    const matchesLanguage = language === '' || book.language === language;

    // 3. Translation checkbox: if not ticked, every book passes
    const matchesTranslation = !onlyTranslations || book.isTranslation;

    // Keep the book only if ALL three checks pass
    return matchesSearch && matchesLanguage && matchesTranslation;
  });

  document.getElementById('count').textContent = `Showing ${result.length} of ${books.length} books`;
  renderBooks(result);
}

// Re-run the filter every time the user changes something
document.getElementById('search').addEventListener('input', applyFilters);   // every key press
document.getElementById('language').addEventListener('change', applyFilters);
document.getElementById('onlyTranslations').addEventListener('change', applyFilters);

// ------------------------------------------------------------------
// Lesson 7c: Singlish search
// Someone without a Sinhala keyboard types "horowpothane" and should still find
// "හොරොව්පොතානේ". Two tricks:
//   1. transliterate Sinhala letters → English letters automatically (works for EVERY book)
//      plus the titleSinglish/authorSinglish the AI (or you) saved
//   2. compare a loose "key" so different spellings match: thaa/ta, w/v, ee/e ...
// ------------------------------------------------------------------

// All the text we search in, for one book (lower case)
function searchHaystack(book) {
  return [book.title, book.author, book.titleSinglish, book.authorSinglish,
    (book.categories || []).join(' ')].join(' ').toLowerCase();
}

// The loose key of a book — calculated once, then remembered on the book object
function searchKeyOf(book) {
  if (book._key === undefined) {
    book._key = singlishKey(searchHaystack(book) + ' ' + sinhalaToLatin(book.title) + ' ' + sinhalaToLatin(book.author));
  }
  return book._key;
}

/**
 * Make spelling differences disappear, so these all give the same key:
 *   "Horowpothane" "horowupothaane" "Horovpotane"  → "horowpotane"
 */
function singlishKey(text) {
  return String(text || '').toLowerCase()
    .replace(/th/g, 't').replace(/dh/g, 'd').replace(/kh/g, 'k').replace(/gh/g, 'g')
    .replace(/ph/g, 'p').replace(/bh/g, 'b').replace(/sh/g, 's').replace(/ch/g, 'c')
    .replace(/v/g, 'w')
    .replace(/[^a-z0-9]/g, '')        // drop spaces, dots, Sinhala letters...
    .replace(/(.)\1+/g, '$1');         // "aa" → "a", "ee" → "e", "kk" → "k"
}

// ---- Sinhala → Latin letters (simple, rule-based) ----
// Each consonant carries an "a" sound (ක = ka). A vowel sign REPLACES that "a"
// (කි = ki), and the hal mark ් removes it (ක් = k).
const SI_CONSONANTS = {
  'ක': 'k', 'ඛ': 'kh', 'ග': 'g', 'ඝ': 'gh', 'ඞ': 'ng', 'ඟ': 'ng', 'ච': 'ch', 'ඡ': 'chh',
  'ජ': 'j', 'ඣ': 'jh', 'ඤ': 'ny', 'ඥ': 'gn', 'ට': 't', 'ඨ': 'th', 'ඩ': 'd', 'ඪ': 'dh',
  'ණ': 'n', 'ඬ': 'nd', 'ත': 'th', 'ථ': 'th', 'ද': 'd', 'ධ': 'dh', 'න': 'n', 'ඳ': 'nd',
  'ප': 'p', 'ඵ': 'ph', 'බ': 'b', 'භ': 'bh', 'ම': 'm', 'ඹ': 'mb', 'ය': 'y', 'ර': 'r',
  'ල': 'l', 'ව': 'w', 'ශ': 'sh', 'ෂ': 'sh', 'ස': 's', 'හ': 'h', 'ළ': 'l', 'ෆ': 'f'
};
const SI_VOWELS = {
  'අ': 'a', 'ආ': 'aa', 'ඇ': 'ae', 'ඈ': 'aae', 'ඉ': 'i', 'ඊ': 'ii', 'උ': 'u', 'ඌ': 'uu',
  'ඍ': 'ru', 'එ': 'e', 'ඒ': 'ee', 'ඓ': 'ai', 'ඔ': 'o', 'ඕ': 'oo', 'ඖ': 'au'
};
const SI_SIGNS = {
  'ා': 'aa', 'ැ': 'ae', 'ෑ': 'aae', 'ි': 'i', 'ී': 'ii', 'ු': 'u', 'ූ': 'uu', 'ෘ': 'ru',
  'ෙ': 'e', 'ේ': 'ee', 'ෛ': 'ai', 'ො': 'o', 'ෝ': 'oo', 'ෞ': 'au', 'ෲ': 'ruu'
};

function sinhalaToLatin(text) {
  const chars = [...String(text || '').normalize('NFC')];   // NFC joins "ෙ + ා" into "ො"
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i], next = chars[i + 1];
    if (SI_CONSONANTS[ch]) {
      out += SI_CONSONANTS[ch];
      if (next === '්') { i++; }                          // hal mark: no vowel
      else if (SI_SIGNS[next]) { out += SI_SIGNS[next]; i++; }
      else if (next === '\u200d') { /* joiner in ක්‍ර etc. — ignore */ }
      else { out += 'a'; }                               // default "a" sound
    } else if (SI_VOWELS[ch]) {
      out += SI_VOWELS[ch];
    } else if (ch === 'ං') {
      out += 'n';
    } else if (ch === '\u200d' || ch === '්') {
      // ignore
    } else {
      out += ch;                                         // spaces, English letters, numbers
    }
  }
  return out;
}

// ------------------------------------------------------------------
// Lesson 3: download the books from the Google Sheet (via Apps Script).
// `async` lets us use `await` = "wait for this to finish, then continue".
// ------------------------------------------------------------------
async function loadBooks() {
  const count = document.getElementById('count');

  if (!API_URL) {                       // no backend yet → use sample data
    books = sampleBooks;
    count.textContent = 'Using sample data (set API_URL in config.js)';
    applyFilters();
    return;
  }

  count.textContent = 'Loading books…';
  try {
    let data;
    if (isAdmin()) {
      data = await callApi('adminBooks');           // Lesson 6: admins get purchase details too
    } else {
      const response = await fetch(API_URL);        // 1. ask the server
      data = await response.json();                 // 2. read the answer as JSON
    }
    if (!data.ok) throw new Error(data.error || 'Server error');
    books = data.books;                           // 3. store the list
    applyFilters();                               // 4. draw it
  } catch (err) {
    // Network down, wrong URL, script error… show it instead of a blank page
    count.textContent = 'Could not load books: ' + err.message;
    console.error(err);
  }
}

// ------------------------------------------------------------------
// Lesson 4: Google Sign-In
// ------------------------------------------------------------------
let idToken = null;       // the signed "ID card" Google gives us after sign-in
let currentUser = null;   // { email, name, picture, role } — confirmed by OUR server
let myData = { status: {}, ratings: {} };   // Lesson 5: my reading status + my ratings

function isAdmin() { return currentUser !== null && currentUser.role === 'admin'; }

// Send a POST to Apps Script. Content-Type text/plain keeps it a "simple"
// request, so the browser does not send an extra CORS "preflight" (Apps Script can't answer those).
async function callApi(action, params = {}) {
  const body = Object.assign({ action: action, idToken: idToken }, params);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data;
}

// Only for LEARNING: peek inside a JWT. This does NOT prove it is real —
// anyone can make a fake one. The server checks it properly.
function decodeJwtPayload(token) {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(part))));
}

// Google calls this after the user picks their account
async function handleCredential(response) {
  idToken = response.credential;
  console.log('ID token claims (unverified):', decodeJwtPayload(idToken));

  try {
    const data = await callApi('me');       // server verifies + saves the user
    currentUser = data.user;
    myData = data.myData;                   // Lesson 5
    showUser();
    if (isAdmin()) await loadBooks();       // Lesson 6: reload with admin-only fields
    applyFilters();                         // redraw cards with my status labels
  } catch (err) {
    idToken = null;
    alert('Sign-in failed: ' + err.message);
  }
}

function showUser() {
  const signedIn = currentUser !== null;
  document.getElementById('signInButton').hidden = signedIn;
  document.getElementById('userBox').hidden = !signedIn;
  if (signedIn) {
    document.getElementById('userPicture').src = currentUser.picture;
    document.getElementById('userName').textContent = currentUser.name;   // textContent = always safe
    document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Admin' : '';
  }
  // Lesson 6: only admins see the Add button (just convenience — the SERVER enforces it)
  document.getElementById('addBookButton').hidden = !isAdmin();
}

function signOut() {
  idToken = null;
  currentUser = null;
  myData = { status: {}, ratings: {} };
  google.accounts.id.disableAutoSelect();   // don't auto sign-in again on next visit
  showUser();
  applyFilters();
}

function initGoogleSignIn() {
  if (!GOOGLE_CLIENT_ID || !API_URL) return;   // not configured yet

  // The Google script loads separately — wait until it is ready
  if (!window.google || !google.accounts) {
    setTimeout(initGoogleSignIn, 100);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential,     // our function above
    auto_select: true               // returning users are signed in automatically
  });
  google.accounts.id.renderButton(document.getElementById('signInButton'),
    { theme: 'outline', size: 'medium', shape: 'pill' });
  google.accounts.id.prompt();      // shows the "One Tap" popup
}

document.getElementById('signOutButton').addEventListener('click', signOut);

// ------------------------------------------------------------------
// Lesson 5: book detail popup, reading status and ratings
// ------------------------------------------------------------------
const dialog = document.getElementById('bookDialog');
let openBookId = null;
let chosenRating = 0;

// ONE listener on the grid handles clicks on ANY card ("event delegation").
// Cards are re-created on every search, so listeners on each card would be lost.
document.getElementById('grid').addEventListener('click', event => {
  const card = event.target.closest('.book');    // the card that was clicked (or null)
  if (card) openBook(card.dataset.id);            // data-id="..." → dataset.id
});

function openBook(bookId) {
  const book = books.find(b => String(b.id) === String(bookId));
  if (!book) return;
  openBookId = book.id;
  const mine = myData.ratings[book.id] || { rating: 0, review: '' };
  chosenRating = mine.rating;
  const status = myData.status[book.id] || 'to_read';

  // Status buttons + rating form only for signed-in users
  const userSection = currentUser ? `
    <div class="status-buttons">
      ${['to_read', 'reading', 'read'].map(s => `
        <button type="button" data-status="${s}" class="${s === status ? 'active' : ''}">
          ${{ to_read: 'To read', reading: 'Reading', read: 'Read' }[s]}
        </button>`).join('')}
    </div>
    <div class="rate-box">
      <b>Your rating</b> <small>(everyone can see it, with your name)</small>
      <div class="star-picker">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}">★</button>`).join('')}
      </div>
      <textarea id="reviewText" rows="2" placeholder="Short review (optional)">${escapeHtml(mine.review)}</textarea>
      <button type="button" id="saveRating">Save rating</button>
    </div>` : '<p><i>Sign in to mark this book as read and rate it.</i></p>';

  const reviews = (book.reviews || []).map(r => `
    <li><b>${escapeHtml(r.userName)}</b> ${starText(r.rating)} <small>${escapeHtml(r.date)}</small>
      ${r.review ? `<p>${escapeHtml(r.review)}</p>` : ''}</li>`).join('');

  document.getElementById('bookDetail').innerHTML = `
    <h2>${escapeHtml(book.title)}</h2>
    <p class="author">by ${escapeHtml(book.author)}</p>
    <p class="meta">${escapeHtml(book.language)} · ${escapeHtml(book.categories.join(', '))}
      ${book.isTranslation ? ' · Translation' : ''}</p>
    <p class="stars">${book.ratingCount ? `${starText(book.ratingAvg)} ${book.ratingAvg} from ${book.ratingCount} rating(s)` : 'No ratings yet'}</p>
    ${userSection}
    <h3>Reviews</h3>
    ${reviews ? `<ul class="reviews">${reviews}</ul>` : '<p><small>No reviews yet.</small></p>'}
    ${isAdmin() ? adminDetails(book) : ''}
  `;
  paintStars();
  dialog.showModal();     // <dialog> gives us a popup with a dark backdrop for free
}

function paintStars() {
  document.querySelectorAll('[data-star]').forEach(btn => {
    btn.classList.toggle('on', Number(btn.dataset.star) <= chosenRating);
  });
}

// Clicks inside the popup — again ONE listener, then check what was clicked
dialog.addEventListener('click', async event => {
  if (event.target === dialog || event.target.id === 'closeDialog') { dialog.close(); return; }

  const statusBtn = event.target.closest('[data-status]');
  if (statusBtn) {
    const newStatus = statusBtn.dataset.status;
    try {
      await callApi('setStatus', { bookId: openBookId, status: newStatus });
      if (newStatus === 'to_read') delete myData.status[openBookId];
      else myData.status[openBookId] = newStatus;
      openBook(openBookId);   // redraw popup (highlights the new button)
      applyFilters();         // redraw cards (status label)
    } catch (err) { alert(err.message); }
    return;
  }

  const starBtn = event.target.closest('[data-star]');
  if (starBtn) { chosenRating = Number(starBtn.dataset.star); paintStars(); return; }

  // Lesson 6: admin buttons inside the popup
  if (event.target.id === 'editBook') { dialog.close(); openEditor(openBookId); return; }
  if (event.target.id === 'deleteBook') { deleteBookConfirmed(openBookId); return; }

  if (event.target.id === 'saveRating') {
    if (!chosenRating) { alert('Pick 1 to 5 stars first'); return; }
    event.target.disabled = true;
    event.target.textContent = 'Saving…';
    try {
      const review = document.getElementById('reviewText').value;
      await callApi('rateBook', { bookId: openBookId, rating: chosenRating, review: review });
      myData.ratings[openBookId] = { rating: chosenRating, review: review };
      await loadBooks();      // reload so the average and review list include mine
      openBook(openBookId);
    } catch (err) {
      alert(err.message);
      event.target.disabled = false;
      event.target.textContent = 'Save rating';
    }
  }
});

// ------------------------------------------------------------------
// Lesson 6: admin — add, edit, delete books
// ------------------------------------------------------------------
const editDialog = document.getElementById('editDialog');
const form = document.getElementById('bookForm');

// Extra info + buttons at the bottom of the book popup (admins only)
function adminDetails(book) {
  const row = (label, value) => value ? `<tr><th>${label}</th><td>${escapeHtml(value)}</td></tr>` : '';
  return `
    <div class="admin-box">
      <h3>Admin</h3>
      <table>
        ${row('ISBN', book.isbn)}${row('Publisher', book.publisher)}${row('Year', book.year)}
        ${row('Shelf', book.shelf)}${row('Bought from', book.purchasedFrom)}
        ${row('Purchase date', String(book.purchaseDate || '').slice(0, 10))}${row('Price', book.price)}
        ${row('Notes', book.notes)}${row('Added by', book.addedBy)}
      </table>
      <button type="button" id="editBook">Edit</button>
      <button type="button" id="deleteBook" class="danger">Delete</button>
    </div>`;
}

// Open the form: empty for a new book, filled in for an existing one
function openEditor(bookId) {
  form.reset();                                  // clear every field
  const book = bookId ? books.find(b => String(b.id) === String(bookId)) : null;
  document.getElementById('formTitle').textContent = book ? 'Edit book' : 'Add a book';

  if (book) {
    // form.elements.title = the <input name="title">
    ['id', 'title', 'author', 'titleSinglish', 'authorSinglish', 'language', 'isbn', 'publisher', 'year', 'shelf',
     'purchasedFrom', 'price', 'notes', 'coverUrl'].forEach(name => {
      form.elements[name].value = book[name] || '';
    });
    form.elements.categories.value = (book.categories || []).join(', ');
    form.elements.isTranslation.checked = book.isTranslation === true;
    form.elements.purchaseDate.value = String(book.purchaseDate || '').slice(0, 10);   // date input wants yyyy-mm-dd
  } else {
    form.elements.id.value = '';
    form.elements.coverUrl.value = '';
  }
  resetPhoto(book ? book.coverUrl : '');     // Lesson 7
  editDialog.showModal();
  form.elements.title.focus();
}

// Submitting the form (Save button or Enter key)
form.addEventListener('submit', async event => {
  event.preventDefault();          // stop the browser's default: reloading the page!

  const f = form.elements;
  const book = {
    id: f.id.value,
    title: f.title.value,
    author: f.author.value,
    titleSinglish: f.titleSinglish.value,
    authorSinglish: f.authorSinglish.value,
    categories: f.categories.value.split(',').map(c => c.trim()).filter(c => c),
    language: f.language.value,
    isTranslation: f.isTranslation.checked,
    isbn: f.isbn.value, publisher: f.publisher.value, year: f.year.value, shelf: f.shelf.value,
    purchasedFrom: f.purchasedFrom.value, purchaseDate: f.purchaseDate.value,
    price: f.price.value, notes: f.notes.value,
    coverUrl: f.coverUrl.value
  };

  const saveButton = document.getElementById('saveBook');
  saveButton.disabled = true;               // prevent double-clicks = duplicate books
  saveButton.textContent = 'Saving…';
  try {
    // Lesson 7: send the photo too (if one was taken) — the server stores it in Drive
    const data = await callApi('saveBook', { book: book, imageBase64: cleanCover ? cleanCover.base64 : null });
    editDialog.close();
    await loadBooks();
    openBook(data.book.id);                 // show the saved book
  } catch (err) {
    alert('Could not save: ' + err.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save';
  }
});

async function deleteBookConfirmed(bookId) {
  const book = books.find(b => String(b.id) === String(bookId));
  if (!confirm(`Delete "${book.title}"? Its ratings and reading history will be deleted too.`)) return;
  try {
    await callApi('deleteBook', { bookId: bookId });
    dialog.close();
    await loadBooks();
  } catch (err) {
    alert('Could not delete: ' + err.message);
  }
}

document.getElementById('addBookButton').addEventListener('click', () => openEditor(null));
document.getElementById('cancelEdit').addEventListener('click', () => editDialog.close());

// ------------------------------------------------------------------
// Lesson 7: take a photo → shrink it → send to the server → AI fills the form
// ------------------------------------------------------------------
let photo = null;     // { base64, mimeType } small copy sent to the AI
let originalImage = null;   // the full photo (kept in memory) — we crop from this, not the small copy
let cleanCover = null;      // { base64 } the cropped + resized + polished cover → saved to Drive

function resetPhoto(existingCoverUrl) {
  photo = null;
  originalImage = null;
  cleanCover = null;
  document.getElementById('photoInput').value = '';
  const preview = document.getElementById('photoPreview');
  preview.hidden = !existingCoverUrl;
  preview.src = existingCoverUrl || '';
  document.getElementById('photoHint').hidden = !!existingCoverUrl;
  document.getElementById('analyzeButton').disabled = true;
  document.getElementById('aiStatus').textContent = '';
}

// Phone photos are 3–10 MB. We draw them onto a small <canvas> and export a
// ~150 KB JPEG: faster upload, fits Apps Script limits, and enough for the AI to read.
function shrinkImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);   // "data:image/jpeg;base64,/9j/4AAQ..."
      URL.revokeObjectURL(img.src);
      resolve({ dataUrl: dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);                       // a temporary local URL for the file
  });
}

document.getElementById('photoInput').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    originalImage = await loadImage(file);
    const small = await shrinkImage(file, 1024);
    photo = { base64: small.base64, mimeType: small.mimeType };
    cleanCover = polishCover(originalImage, null);    // no AI yet → resize + polish the whole photo
    const preview = document.getElementById('photoPreview');
    preview.src = small.dataUrl;
    preview.hidden = false;
    document.getElementById('photoHint').hidden = true;
    document.getElementById('analyzeButton').disabled = false;
    document.getElementById('aiStatus').textContent =
      `Photo ready (${Math.round(small.base64.length * 0.75 / 1024)} KB)`;
  } catch (err) {
    alert(err.message);
  }
});

// Load a File into an <img> element (full size) and wait until it is ready
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Crop → resize → polish. Returns { base64 } of a JPEG ready for Drive.
 *   box = [ymin, xmin, ymax, xmax] from the AI, 0–1000 scale (or null = whole photo)
 */
function polishCover(img, box) {
  // ---- 1. CROP: turn the 0–1000 box into pixels, with a little margin ----
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (Array.isArray(box) && box.length === 4) {
    const [ymin, xmin, ymax, xmax] = box;
    const valid = ymax > ymin && xmax > xmin && (ymax - ymin) > 150 && (xmax - xmin) > 150;  // ignore silly boxes
    if (valid) {
      const pad = 10;                                          // 1% margin so edges are not cut off
      sx = Math.max(0, (xmin - pad) / 1000 * img.naturalWidth);
      sy = Math.max(0, (ymin - pad) / 1000 * img.naturalHeight);
      sw = Math.min(img.naturalWidth, (xmax + pad) / 1000 * img.naturalWidth) - sx;
      sh = Math.min(img.naturalHeight, (ymax + pad) / 1000 * img.naturalHeight) - sy;
    }
  }

  // ---- 2. RESIZE: longest side 900 px (sharp on screen, ~100 KB) ----
  const scale = Math.min(1, 900 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // drawImage(source, cut x, y, w, h,  paste x, y, w, h) = crop and resize in one step
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // ---- 3. POLISH: auto-levels + a little more colour ----
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  autoLevels(imageData.data);
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { base64: dataUrl.split(',')[1] };
}

/**
 * pixels = [R,G,B,A, R,G,B,A, ...] (0–255).
 * A photo taken in a dim office uses only part of 0–255 (e.g. 30–200).
 * We look at the BRIGHTNESS of all pixels, find the darkest and brightest 0.5 %,
 * and stretch that range to 0–255 → better contrast.
 * The same stretch is used for R, G and B, so the cover's real colours are kept.
 * Limits (max 40 at the dark end, min 215 at the bright end) stop it over-doing a
 * cover that is really dark or really light.
 */
function autoLevels(pixels) {
  const histogram = new Array(256).fill(0);        // how many pixels have each brightness
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    histogram[brightness]++;
  }
  const cut = (pixels.length / 4) * 0.005;
  let sum = 0, lo = 0, hi = 255;
  while (lo < 255 && (sum += histogram[lo]) < cut) lo++;
  sum = 0;
  while (hi > 0 && (sum += histogram[hi]) < cut) hi--;
  lo = Math.min(lo, 40);                            // gentle: never stretch more than this
  hi = Math.max(hi, 215);

  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      pixels[i + c] = (pixels[i + c] - lo) * 255 / (hi - lo);   // canvas clamps to 0–255 for us
    }
    // small saturation boost: push each colour 8 % away from the grey value
    const grey = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    for (let c = 0; c < 3; c++) pixels[i + c] = grey + (pixels[i + c] - grey) * 1.08;
  }
}

document.getElementById('analyzeButton').addEventListener('click', async () => {
  if (!photo) return;
  const button = document.getElementById('analyzeButton');
  const status = document.getElementById('aiStatus');
  button.disabled = true;
  status.textContent = 'Reading the cover… (5–15 seconds)';
  try {
    const data = await callApi('analyzeCover', { imageBase64: photo.base64, mimeType: photo.mimeType });
    fillFormFromAi(data.draft);

    // The AI also told us WHERE the cover is → crop to it
    cleanCover = polishCover(originalImage, data.draft.coverBox);
    document.getElementById('photoPreview').src = 'data:image/jpeg;base64,' + cleanCover.base64;
    const pct = Math.round((data.draft.confidence || 0) * 100);
    status.textContent = `Filled by AI (confidence ${pct}%). Please check before saving.`;
  } catch (err) {
    status.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

// Put the AI's answer into the form. The admin still reviews and clicks Save.
function fillFormFromAi(draft) {
  const f = form.elements;
  const set = (name, value) => {
    if (value === undefined || value === null || value === '') return;
    f[name].value = value;
    f[name].classList.remove('ai-filled'); void f[name].offsetWidth;   // restart the highlight animation
    f[name].classList.add('ai-filled');
  };
  set('title', draft.title);
  set('author', draft.author);
  set('titleSinglish', draft.titleSinglish);
  set('authorSinglish', draft.authorSinglish);
  set('categories', (draft.categories || []).join(', '));
  set('isbn', draft.isbn);
  set('publisher', draft.publisher);
  set('year', draft.year);
  set('coverUrl', draft.coverUrl);
  if (draft.language) {
    // If the AI says e.g. "French", add it to the dropdown first
    const select = f.language;
    if (![...select.options].some(o => o.value === draft.language)) select.add(new Option(draft.language));
    set('language', draft.language);
  }
  f.isTranslation.checked = draft.isTranslation === true;
}

// First load when the page opens
loadBooks();
initGoogleSignIn();
