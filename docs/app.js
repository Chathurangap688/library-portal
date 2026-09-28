// Lesson 3: the real books now come from the Google Sheet.
// `let` (not const) because we replace the list after it downloads.
let books = [];
let allCategories = [];   // Lesson 7d: the common category list, sent by the server

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
  const copiesLabel = Number(book.copies) > 1 ? ` · ${Number(book.copies)} copies` : '';   // Lesson 11
  const stars = book.ratingCount
    ? `<div class="stars">${starText(book.ratingAvg)} <small>${book.ratingAvg} (${book.ratingCount})</small></div>` : '';

  // Backticks (`) make a template string: ${...} inserts a value.
  // data-id remembers WHICH book this card is, for the click handler.
  return `
    <div class="book" data-id="${escapeHtml(book.id)}">
      ${coverHtml(book, statusLabel + loanOverlay(book))}
      <div class="title">${escapeHtml(book.title)}</div>
      <div class="author">${escapeHtml(book.author)}</div>
      <div class="meta">${escapeHtml(book.language)} · ${escapeHtml(book.categories.join(', '))}${copiesLabel}</div>
      ${stars}
      ${badge}
    </div>
  `;
}

// Lesson 14: "Unavailable" watermark when every copy is lent out
function loanOverlay(book) {
  const loans = book.loans || [];
  if (!loans.length) return '';
  const copies = Number(book.copies) || 1;
  if (book.available > 0) {                     // some copies out, some still here
    return `<span class="stock-note">${book.available} of ${copies} in stock</span>`;
  }
  const who = loans.map(l => escapeHtml(firstName(l.userName))).join(', ');
  return `<div class="on-loan"><b>UNAVAILABLE</b><small>with ${who}</small></div>`;
}

function firstName(name) { return String(name || '').split(' ')[0]; }

function daysSince(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)); }

function niceDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
  const pickedCategories = selectedFilterCategories();
  const onlyAvailable = document.getElementById('onlyAvailable').checked;   // Lesson 14

  const result = books.filter(book => {
    // 1. Search: exact text (works for Sinhala typing) OR the loose Singlish key
    const matchesSearch = searchText === '' ||
      searchHaystack(book).includes(searchText) ||
      (searchKey !== '' && searchKeyOf(book).includes(searchKey));

    // 2. Language: empty value means "All languages"
    const matchesLanguage = language === '' || book.language === language;

    // 3. Translation checkbox: if not ticked, every book passes
    const matchesTranslation = !onlyTranslations || book.isTranslation;

    // 4. Categories: none ticked = all books; otherwise the book needs at least ONE ticked category
    const matchesCategory = pickedCategories.length === 0 ||
      (book.categories || []).some(c => pickedCategories.includes(c));

    // Keep the book only if ALL three checks pass
    // 5. Lesson 14: "In stock only" hides books whose copies are all lent out
    const matchesStock = !onlyAvailable || book.available === undefined || book.available > 0;

    return matchesSearch && matchesLanguage && matchesTranslation && matchesCategory && matchesStock;
  });

  document.getElementById('count').textContent = `Showing ${result.length} of ${books.length} books`;
  renderBooks(result);
}

// Re-run the filter every time the user changes something
document.getElementById('search').addEventListener('input', applyFilters);   // every key press
document.getElementById('language').addEventListener('change', applyFilters);
document.getElementById('onlyTranslations').addEventListener('change', applyFilters);
document.getElementById('onlyAvailable').addEventListener('change', applyFilters);

// ------------------------------------------------------------------
// Category filter (multi-select dropdown)
// ------------------------------------------------------------------

// Build the options from the categories books REALLY have (with a count),
// so you never pick a category that gives 0 results.
function buildCategoryFilter() {
  const before = selectedFilterCategories();            // keep ticks when we rebuild
  const counts = {};
  books.forEach(b => (b.categories || []).forEach(c => { counts[c] = (counts[c] || 0) + 1; }));
  const names = Object.keys(counts).sort((a, b) => a.localeCompare(b));

  document.getElementById('categoryOptions').innerHTML = names.length
    ? names.map(c => `
      <label class="multi-option">
        <input type="checkbox" value="${escapeHtml(c)}" ${before.includes(c) ? 'checked' : ''}>
        ${escapeHtml(c)} <small>(${counts[c]})</small>
      </label>`).join('')
    : '<small>No categories yet</small>';
  updateCategorySummary();
}

function selectedFilterCategories() {
  return [...document.querySelectorAll('#categoryOptions input:checked')].map(i => i.value);
}

// The text on the closed dropdown: "All categories", "Novel", or "Novel +2"
function updateCategorySummary() {
  const picked = selectedFilterCategories();
  const summary = document.getElementById('categorySummary');
  summary.textContent = picked.length === 0 ? 'All categories'
    : picked.length === 1 ? picked[0] : `${picked[0]} +${picked.length - 1}`;
  summary.classList.toggle('active', picked.length > 0);
}

// One listener for all checkboxes inside the panel (event delegation again)
document.getElementById('categoryOptions').addEventListener('change', () => {
  updateCategorySummary();
  applyFilters();
});

document.getElementById('clearCategories').addEventListener('click', () => {
  document.querySelectorAll('#categoryOptions input:checked').forEach(i => { i.checked = false; });
  updateCategorySummary();
  applyFilters();
});

// Close the dropdown when you click anywhere outside it
document.addEventListener('click', event => {
  const box = document.getElementById('categoryFilter');
  if (box.open && !box.contains(event.target)) box.open = false;
});

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
  return [book.title, book.author, book.titleSinglish, book.authorSinglish, book.translator,
    (book.categories || []).join(' ')].join(' ').toLowerCase();
}

// The loose key of a book — calculated once, then remembered on the book object
function searchKeyOf(book) {
  if (book._key === undefined) {
    book._key = singlishKey(searchHaystack(book) + ' ' + sinhalaToLatin(book.title) + ' ' + sinhalaToLatin(book.author) +
      ' ' + sinhalaToLatin(book.translator));
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
    buildCategoryFilter();
    count.textContent = 'Using sample data (set API_URL in config.js)';
    applyFilters();
    return;
  }

  count.textContent = 'Loading books…';
  try {
    // Lesson 9: books are private → ask with our session (admins automatically get purchase info)
    const data = await callApi('books');
    books = data.books;                           // 3. store the list
    allCategories = data.categories || [];
    buildCategoryFilter();
    if (isAdmin()) updateLoanBadge();             // Lesson 14
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
let idToken = null;       // the signed "ID card" Google gives us after sign-in (used ONCE, to log in)
let sessionToken = null;  // Lesson 9: OUR token from the server, kept in a cookie for 30 days
let currentUser = null;   // { email, name, picture, role } — confirmed by OUR server
let myData = { status: {}, ratings: {} };   // Lesson 5: my reading status + my ratings

function isAdmin() { return currentUser !== null && currentUser.role === 'admin'; }

// Send a POST to Apps Script. Content-Type text/plain keeps it a "simple"
// request, so the browser does not send an extra CORS "preflight" (Apps Script can't answer those).
// Lesson 13: actions that only READ data are safe to repeat if the network hiccups
// (analyzeCover / webLookup only read and ask the AI — they save nothing, so a retry is harmless)
const SAFE_TO_RETRY = ['me', 'books', 'recommend', 'listUsers', 'checkDuplicates', 'listLoans', 'analyzeCover', 'webLookup'];

async function callApi(action, params = {}) {
  const tries = SAFE_TO_RETRY.includes(action) ? 3 : 1;
  for (let attempt = 1; ; attempt++) {
    try {
      return await callApiOnce(action, params);
    } catch (err) {
      // Only retry "the server could not be reached / Google had a problem" — never a real answer
      if (!err.retryable || attempt >= tries) throw err;
      console.warn(`${action} failed (${err.message}) — retry ${attempt}`);
      await new Promise(resolve => setTimeout(resolve, 1500 * attempt));   // wait 1.5 s, then 3 s
    }
  }
}

async function callApiOnce(action, params) {
  const body = Object.assign({ action: action, sessionToken: sessionToken }, params);
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
  } catch (networkError) {
    // Phone switched networks, weak signal, app was in the background…
    const err = new Error('No connection to the server');
    err.retryable = true;
    throw err;
  }
  // Lesson 8f: read as TEXT first. When Apps Script itself fails (timeout, crash, quota)
  // Google sends an HTML error page instead of our JSON → show its message, not "Unexpected token <"
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const page = new DOMParser().parseFromString(text, 'text/html');   // read the HTML safely
    const message = (page.body ? page.body.textContent : text).replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error('Non-JSON answer from Apps Script:', text);
    const err = new Error('Server problem (' + response.status + '): ' + (message || 'no details') +
      ' — see Apps Script → Executions');
    err.retryable = true;              // usually temporary on Google's side
    throw err;
  }
  if (!data.ok) {
    // Lesson 9: session missing/expired → back to the login screen
    if (data.code === 'AUTH' && action !== 'login') {
      forgetSession();
      showLoginScreen(data.error);
    }
    // Lesson 10: account not (or no longer) active → waiting screen
    if (data.code === 'PENDING' && currentUser) showPendingScreen(currentUser);
    const err = new Error(data.error);
    err.code = data.code;            // Lesson 11: e.g. 'DUPLICATE'
    err.details = data.details;      //            the matching books
    throw err;
  }
  return data;
}

// ------------------------------------------------------------------
// Lesson 9: the session cookie
// A cookie is a small "name=value" text the browser keeps for this site and shares
// between ALL tabs. Max-Age = how many seconds it lives; after that the browser deletes it.
// ------------------------------------------------------------------
const COOKIE = 'lp_session';

function saveSessionCookie(token, expiresAt) {
  const seconds = Math.floor((new Date(expiresAt) - Date.now()) / 1000);
  const secure = location.protocol === 'https:' ? '; Secure' : '';     // Secure = only over https
  // SameSite=Strict: the browser never sends it along with requests started by OTHER websites
  document.cookie = `${COOKIE}=${encodeURIComponent(token)}; Max-Age=${seconds}; Path=/; SameSite=Strict${secure}`;
}

function readSessionCookie() {
  // document.cookie looks like "a=1; lp_session=abc; b=2"
  const found = document.cookie.split('; ').find(c => c.startsWith(COOKIE + '='));
  return found ? decodeURIComponent(found.slice(COOKIE.length + 1)) : null;
}

function forgetSession() {
  sessionToken = null;
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/; SameSite=Strict`;   // Max-Age=0 → delete now
}

// Which screen is visible: 'startup' | 'login' | 'app'
function showScreen(name) {
  document.getElementById('pendingScreen').hidden = name !== 'pending';
  document.getElementById('startupScreen').hidden = name !== 'startup';
  document.getElementById('loginScreen').hidden = name !== 'login';
  document.getElementById('app').hidden = name !== 'app';
}

function showLoginScreen(message) {
  currentUser = null;
  myData = { status: {}, ratings: {} };
  books = [];
  document.getElementById('grid').innerHTML = '';              // leave nothing behind
  document.getElementById('recommendRow').innerHTML = '';
  document.getElementById('recommendSection').hidden = true;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  document.getElementById('loginStatus').textContent = message || '';
  showScreen('login');
  initGoogleSignIn();
}

// After a successful login OR a still-valid saved session
async function startApp(data) {
  currentUser = data.user;
  // Lesson 10: signed in but not activated yet → only the waiting screen
  if (currentUser.status !== 'active') { showPendingScreen(currentUser); return; }
  myData = data.myData || { status: {}, ratings: {} };
  showUser();
  showScreen('app');
  await loadBooks();
  loadRecommendations();          // Lesson 8 (no await)
  if (isAdmin()) refreshPendingBadge();   // Lesson 10
  if (isAdmin()) updateLoanBadge();       // Lesson 14
}

// ------------------------------------------------------------------
// Lesson 10: waiting screen + admin "Users" panel
// ------------------------------------------------------------------
function showPendingScreen(user) {
  books = [];
  document.getElementById('grid').innerHTML = '';
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  document.getElementById('pendingName').textContent = (user.name || '').split(' ')[0];
  document.getElementById('pendingEmail').textContent = 'Signed in as ' + user.email;
  document.getElementById('pendingPicture').src = user.picture || '';
  showScreen('pending');
}

// "Refresh" = simply reload the page: startup() asks the server again with the saved cookie
document.getElementById('pendingRefresh').addEventListener('click', () => location.reload());
document.getElementById('pendingSignOut').addEventListener('click', () => signOut());

const usersDialog = document.getElementById('usersDialog');
let userList = [];

document.getElementById('usersButton').addEventListener('click', () => {
  usersDialog.showModal();
  loadUsers();
});
usersDialog.querySelector('.close-users').addEventListener('click', () => usersDialog.close());

async function loadUsers() {
  const status = document.getElementById('usersStatus');
  status.textContent = 'Loading…';
  try {
    userList = (await callApi('listUsers')).users;
    // Waiting people first, then by name
    userList.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) ||
      String(a.name).localeCompare(String(b.name)));
    const waiting = userList.filter(u => u.status === 'pending').length;
    status.textContent = `${userList.length} user(s)` + (waiting ? ` · ${waiting} waiting for activation` : '');
    renderUsers();
    setPendingBadge(waiting);
    rememberActiveUsers(userList);
  } catch (err) {
    status.textContent = err.message;
  }
}

function renderUsers() {
  document.getElementById('usersList').innerHTML = userList.map(u => {
    const me = u.email === currentUser.email;
    return `
      <div class="user-row ${u.status}">
        <img src="${escapeHtml(u.picture || '')}" alt="" referrerpolicy="no-referrer">
        <div class="user-info">
          <b>${escapeHtml(u.name || u.email)}</b>
          ${u.role === 'admin' ? '<span class="role">Admin</span>' : ''}
          <span class="pill ${u.status}">${u.status === 'active' ? 'Active' : 'Waiting'}</span><br>
          <small>${escapeHtml(u.email)} · joined ${escapeHtml(u.createdAt)} · last seen ${escapeHtml(u.lastLogin)}</small>
        </div>
        <div class="user-actions" data-email="${escapeHtml(u.email)}">
          ${me ? '<small>(you)</small>' : `
            ${u.status === 'active'
              ? '<button type="button" data-do="pending">Deactivate</button>'
              : '<button type="button" data-do="active" class="primary">Activate</button>'}
            <button type="button" data-do="delete" class="danger">Delete</button>`}
        </div>
      </div>`;
  }).join('') || '<p>No users yet.</p>';
}

// One listener for all Activate / Deactivate / Delete buttons (event delegation)
document.getElementById('usersList').addEventListener('click', async event => {
  const button = event.target.closest('button[data-do]');
  if (!button) return;
  const email = button.closest('.user-actions').dataset.email;
  const what = button.dataset.do;
  if (what === 'delete' &&
      !confirm(`Delete ${email}? Their ratings and reading history are deleted too. They can sign in again later (as a new, waiting user).`)) return;
  button.disabled = true;
  try {
    if (what === 'delete') await callApi('deleteUser', { email: email });
    else await callApi('setUserStatus', { email: email, status: what });
    await loadUsers();
  } catch (err) {
    alert(err.message);
    button.disabled = false;
  }
});

async function refreshPendingBadge() {
  try {
    const users = (await callApi('listUsers')).users;
    setPendingBadge(users.filter(u => u.status === 'pending').length);
    rememberActiveUsers(users);                     // Lesson 14: for the "Lend to…" list
  } catch (e) { /* not important */ }
}

// Lesson 14: people a book can be lent to (active accounts, sorted by name)
let activeUsers = [];
function rememberActiveUsers(users) {
  activeUsers = users.filter(u => u.status === 'active')
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function setPendingBadge(count) {
  const badge = document.getElementById('pendingBadge');
  badge.textContent = count;
  badge.hidden = count === 0;
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
  try { console.log('ID token claims (unverified):', decodeJwtPayload(idToken)); } catch (e) { /* debug only */ }

  const status = document.getElementById('loginStatus');
  status.textContent = 'Signing in…';
  try {
    // Lesson 9: trade the Google ID token (1 hour) for OUR session token (30 days)
    const data = await callApi('login', { idToken: idToken });
    idToken = null;                         // not needed any more
    sessionToken = data.sessionToken;
    saveSessionCookie(data.sessionToken, data.expiresAt);
    status.textContent = '';
    await startApp(data);
  } catch (err) {
    idToken = null;
    status.textContent = 'Sign-in failed: ' + err.message;
  }
}

function showUser() {
  const signedIn = currentUser !== null;
  document.getElementById('userBox').hidden = !signedIn;
  if (signedIn) {
    document.getElementById('userPicture').src = currentUser.picture;
    document.getElementById('userName').textContent = currentUser.name;   // textContent = always safe
    document.getElementById('userRole').textContent = currentUser.role === 'admin' ? 'Admin' : '';
  }
  // Lesson 6: only admins see the Add button (just convenience — the SERVER enforces it)
  document.getElementById('addBookButton').hidden = !isAdmin();
  document.getElementById('usersButton').hidden = !isAdmin();     // Lesson 10
  document.getElementById('loansButton').hidden = !isAdmin();     // Lesson 14
}

async function signOut() {
  try { await callApi('logout'); } catch (e) { /* already ended — fine */ }
  forgetSession();                          // delete the cookie in THIS browser (all tabs)
  if (window.google && google.accounts) google.accounts.id.disableAutoSelect();   // no auto sign-in
  showLoginScreen('You are signed out.');
}

function initGoogleSignIn() {
  if (!GOOGLE_CLIENT_ID || !API_URL) return;   // not configured yet
  if (initGoogleSignIn.done) { google.accounts.id.prompt(); return; }   // already set up

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
  google.accounts.id.renderButton(document.getElementById('loginButton'),
    { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with' });
  google.accounts.id.prompt();      // shows the "One Tap" popup
  initGoogleSignIn.done = true;     // functions are objects → we can hang a flag on them
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
    ${translationInfo(book)}
    ${availabilityHtml(book)}
    ${book.description ? `<p class="desc">${escapeHtml(book.description)}</p>` : ''}
    ${book.reviewSummary ? `<p class="desc"><b>What readers say:</b> ${escapeHtml(book.reviewSummary)}</p>` : ''}
    ${sourcesHtml(book.webSources)}
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
      loadRecommendations();  // Lesson 8: my history changed → new suggestions
    } catch (err) { alert(err.message); }
    return;
  }

  const starBtn = event.target.closest('[data-star]');
  if (starBtn) { chosenRating = Number(starBtn.dataset.star); paintStars(); return; }

  // Lesson 6: admin buttons inside the popup
  if (event.target.id === 'editBook') { dialog.close(); openEditor(openBookId); return; }

  // Lesson 14: lend / return from the book popup
  if (event.target.id === 'lendButton') {
    const email = document.getElementById('lendTo').value;
    if (!email) { alert('Choose who takes the book'); return; }
    await runLoanAction(event.target, 'lendBook', { bookId: openBookId, email: email });
    return;
  }
  const returnBtn = event.target.closest('[data-return]');
  if (returnBtn) {
    await runLoanAction(returnBtn, 'returnBook', { loanId: returnBtn.dataset.return });
    return;
  }
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
      loadRecommendations();  // Lesson 8
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
        ${row('Shelf', book.shelf)}${row('Copies', book.copies > 1 ? String(book.copies) : '')}${row('Bought from', book.purchasedFrom)}
        ${row('Purchase date', String(book.purchaseDate || '').slice(0, 10))}${row('Price', book.price)}
        ${row('Notes', book.notes)}${row('Added by', book.addedBy)}
      </table>
      ${lendingHtml(book)}
      <button type="button" id="editBook">Edit</button>
      <button type="button" id="deleteBook" class="danger">Delete</button>
    </div>`;
}

// Lesson 14: shown to everybody in the book popup
function availabilityHtml(book) {
  const loans = book.loans || [];
  const copies = Number(book.copies) || 1;
  if (!loans.length) return `<p class="stock in">✅ In stock${copies > 1 ? ` · ${copies} copies` : ''}</p>`;
  const lines = loans.map(l => {
    const mine = l.mine === true;                  // the server tells us which loans are ours
    return `${mine ? '<b>You</b> have' : escapeHtml(l.userName) + ' has'} it since ${escapeHtml(niceDate(l.since))} (${daysSince(l.since)} days)`;
  });
  return `<p class="stock ${book.available > 0 ? 'in' : 'out'}">
    ${book.available > 0 ? `✅ ${book.available} of ${copies} in stock` : '📕 Unavailable'}<br>
    <small>${lines.join('<br>')}</small></p>`;
}

// Lesson 14: admin — lend to a user / mark as returned
function lendingHtml(book) {
  const loans = book.loans || [];
  const outNow = loans.map(l => `
    <div class="loan-line">
      📕 ${escapeHtml(l.userName)} · ${daysSince(l.since)} days
      <button type="button" data-return="${escapeHtml(l.loanId)}">✓ Returned</button>
    </div>`).join('');
  const holders = loans.map(l => l.email);
  const choices = activeUsers.filter(u => !holders.includes(u.email))
    .map(u => `<option value="${escapeHtml(u.email)}">${escapeHtml(u.name || u.email)}</option>`).join('');
  const lendRow = book.available > 0 ? `
    <div class="lend-row">
      <select id="lendTo"><option value="">Lend to…</option>${choices}</select>
      <button type="button" id="lendButton" class="primary">Lend</button>
    </div>` : '<p><small>All copies are lent out.</small></p>';
  return `<div class="lending"><b>Lending</b>${outNow}${lendRow}</div>`;
}

// Open the form: empty for a new book, filled in for an existing one
function openEditor(bookId) {
  form.reset();                                  // clear every field
  const book = bookId ? books.find(b => String(b.id) === String(bookId)) : null;
  document.getElementById('formTitle').textContent = book ? 'Edit book' : 'Add a book';

  if (book) {
    // form.elements.title = the <input name="title">
    ['id', 'title', 'author', 'titleSinglish', 'authorSinglish', 'language', 'isbn', 'publisher', 'year', 'shelf',
     'purchasedFrom', 'price', 'notes', 'coverUrl',
     'translator', 'originalTitle', 'originalAuthor', 'description', 'reviewSummary', 'webSources', 'copies'].forEach(name => {
      form.elements[name].value = book[name] || '';
    });
    renderCategoryChips(book.categories || []);
    form.elements.isTranslation.checked = book.isTranslation === true;
    form.elements.purchaseDate.value = String(book.purchaseDate || '').slice(0, 10);   // date input wants yyyy-mm-dd
  } else {
    form.elements.id.value = '';
    form.elements.coverUrl.value = '';
    renderCategoryChips([]);
  }
  showTranslationFields();
  document.getElementById('webStatus').textContent = '';
  document.getElementById('webResults').hidden = true;
  hideDuplicates();                                // Lesson 11
  cancelAutoSave();                                // Lesson 12
  if (!form.elements.copies.value) form.elements.copies.value = 1;
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
    categories: selectedCategories(),
    translator: f.translator.value,
    originalTitle: f.originalTitle.value,
    originalAuthor: f.originalAuthor.value,
    description: f.description.value,
    reviewSummary: f.reviewSummary.value,
    webSources: f.webSources.value,
    copies: Number(f.copies.value) || 1,
    allowDuplicate: allowDuplicate,           // Lesson 11: true after "It's a different book" 
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
    if (savingAutomatically) {
      showToast(`✅ Saved "${data.book.title}"`, data.book.id);   // Lesson 12: no popup, just a note
    } else {
      openBook(data.book.id);               // show the saved book
    }
  } catch (err) {
    savingAutomatically = false;
    if (err.code === 'DUPLICATE') showDuplicates(err.details || []);   // the server caught a duplicate
    else alert('Could not save: ' + err.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save';
    savingAutomatically = false;
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
  document.getElementById('cameraInput').value = '';
  document.getElementById('galleryInput').value = '';
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

// Camera and Gallery both end up here
async function onPhotoPicked(event) {
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
}
document.getElementById('cameraInput').addEventListener('change', onPhotoPicked);
document.getElementById('galleryInput').addEventListener('change', onPhotoPicked);

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
 * A photo taken in a dim private uses only part of 0–255 (e.g. 30–200).
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

    // Lesson 8e + 11 + 12: web check → duplicate check → (maybe) save by itself
    autoFlow(data.draft.confidence || 0);   // no await: the admin can already look at the form
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
  if ((draft.categories || []).length) renderCategoryChips(draft.categories);
  set('translator', draft.translator);
  set('originalTitle', draft.originalTitle);
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
  showTranslationFields();
}

// ------------------------------------------------------------------
// Lesson 7d: translation fields, category chips, web lookup
// ------------------------------------------------------------------

// "Translated by X · Original: Y by Z" line for the book popup
function translationInfo(book) {
  if (!book.isTranslation) return '';
  const parts = [];
  if (book.translator) parts.push('Translated by <b>' + escapeHtml(book.translator) + '</b>');
  if (book.originalTitle || book.originalAuthor) {
    parts.push('Original: <i>' + escapeHtml(book.originalTitle || '?') + '</i>' +
      (book.originalAuthor ? ' by ' + escapeHtml(book.originalAuthor) : ''));
  }
  return parts.length ? `<p class="meta">${parts.join(' · ')}</p>` : '';
}

// webSources is saved as JSON text: [{title, url}, ...]
function sourcesHtml(webSources) {
  let list = [];
  try { list = JSON.parse(webSources || '[]'); } catch (e) { return ''; }
  // Only allow http(s) links — a "javascript:" URL in an href would run code when clicked
  list = list.filter(s => /^https?:\/\//.test(s.url));
  if (!list.length) return '';
  return `<p class="sources"><small>Sources: ${list.map(s =>
    `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a>`).join(' · ')}</small></p>`;
}

function showTranslationFields() {
  document.getElementById('translationFields').hidden = !form.elements.isTranslation.checked;
}
form.elements.isTranslation.addEventListener('change', showTranslationFields);

// Draw one checkbox "chip" per category; tick the ones in `selected`.
// A book's own category that is not in the common list is added too (so it is not lost).
function renderCategoryChips(selected) {
  const names = [...allCategories];
  selected.forEach(c => { if (!names.includes(c)) names.push(c); });
  document.getElementById('categoryChips').innerHTML = names.map(c => `
    <label class="chip-option">
      <input type="checkbox" value="${escapeHtml(c)}" ${selected.includes(c) ? 'checked' : ''}>
      <span>${escapeHtml(c)}</span>
    </label>`).join('');
}

function selectedCategories() {
  return [...document.querySelectorAll('#categoryChips input:checked')].map(i => i.value);
}

document.getElementById('addCategory').addEventListener('click', () => {
  const input = document.getElementById('customCategory');
  const name = input.value.trim();
  if (!name) return;
  renderCategoryChips([...selectedCategories(), name]);   // redraw with the new one ticked
  input.value = '';
});

// Ask the server to look the book up, then SHOW the results so the admin can choose what to use
let webInfo = null;

// Which result fields go into which form field, and their labels
const WEB_FIELDS = [
  ['title', '✏️ Title (corrected)'], ['author', '✏️ Author (corrected)'],
  ['titleSinglish', '✏️ Title in English letters'], ['authorSinglish', '✏️ Author in English letters'],
  ['description', 'Description'], ['reviewSummary', 'What readers say'],
  ['translator', 'Translator'], ['originalTitle', 'Original title'], ['originalAuthor', 'Original author'],
  ['publisher', 'Publisher'], ['year', 'Year']
];

// Remember the last chosen language on this device (localStorage = small key/value store in the browser)
try {
  const saved = localStorage.getItem('webLanguage');
  if (saved) document.getElementById('webLanguage').value = saved;
} catch (e) { /* storage blocked → keep the default */ }

/**
 * Look the book up on the web. Used by the button AND automatically after "Read cover".
 *   auto = true → apply the safe (pre-ticked) results straight away, show the rest for review
 */
async function runWebLookup(auto) {
  const f = form.elements;
  const status = document.getElementById('webStatus');
  const button = document.getElementById('webButton');
  const box = document.getElementById('webResults');
  if (!f.title.value.trim()) { status.textContent = 'Enter the title first'; return; }

  button.disabled = true;
  box.hidden = true;
  status.textContent = (auto ? 'Checking the web automatically… ' : 'Searching… ') + '(10–40 seconds)';
  try {
    const known = {};
    ['title', 'author', 'titleSinglish', 'authorSinglish', 'translator', 'language', 'isbn', 'publisher']
      .forEach(k => { known[k] = f[k].value; });
    known.isTranslation = f.isTranslation.checked;     // tells the AI which edition we have
    known.answerLanguage = document.getElementById('webLanguage').value;   // Lesson 8d
    try { localStorage.setItem('webLanguage', known.answerLanguage); } catch (e) { /* private mode */ }

    // Lesson 8e: send the small cover photo too, so the AI can compare it with the web spelling
    const data = await callApi('webLookup', { book: known, imageBase64: photo ? photo.base64 : null });
    const info = data.info;
    // Defensive: never assume the server sent what we expect
    if (!info || typeof info !== 'object') {
      console.error('webLookup answer without "info":', data);
      throw new Error('The server sent no search result. Deploy the latest Code.gs as a New version.');
    }
    info.categories = Array.isArray(info.categories) ? info.categories : [];
    info.sources = Array.isArray(info.sources) ? info.sources : [];
    webInfo = info;

    if (!info.found) {
      status.textContent = 'Nothing found on the web for this book. ' + (info.notes || []).join(' ');
      return;
    }
    // Corrections from the server have their own names → copy them onto the normal field names
    ['Title', 'Author', 'TitleSinglish', 'AuthorSinglish'].forEach(k => {
      const value = info['corrected' + k];
      const field = k.charAt(0).toLowerCase() + k.slice(1);            // "TitleSinglish" → "titleSinglish"
      if (value && value.trim() && value.trim() !== f[field].value.trim()) info[field] = value.trim();
    });

    const from = { web: 'the web', ai: 'AI knowledge (not a web search — double-check!)', googlebooks: 'Google Books' }[info.mode];
    status.textContent = 'Found via ' + from + '.';
    showWebResults(info);
    if (auto && !box.hidden) applyWebResults(true);   // auto: apply the ticked rows right away
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
  } finally {
    button.disabled = false;
  }
}

document.getElementById('webButton').addEventListener('click', () => runWebLookup(false));


// One row per found value. Ticked by default only when that form field is EMPTY,
// so while editing you never overwrite something by accident — but you can choose to.
function showWebResults(info) {
  const f = form.elements;
  const rows = WEB_FIELDS
    .filter(([key]) => info[key] && String(info[key]).trim())
    .map(([key, label]) => {
      const current = f[key].value.trim();
      const same = current === String(info[key]).trim();
      if (same) return '';
      // Pre-tick only empty fields — and nothing at all when it came from AI memory (less reliable)
      const isCorrection = ['title', 'author', 'titleSinglish', 'authorSinglish'].includes(key);
      const tick = info.mode !== 'ai' && (!current || (isCorrection && info.mode === 'web'));
      const note = isCorrection && current ? ` <small>(was: ${escapeHtml(current)})</small>`
        : current ? ' <small>(replaces current)</small>' : '';
      return `
        <label class="web-row">
          <input type="checkbox" data-key="${key}" ${tick ? 'checked' : ''}>
          <span><b>${label}</b>${note}<br>${escapeHtml(info[key])}</span>
        </label>`;
    }).join('');

  const cats = (info.categories || []).filter(c => !selectedCategories().includes(c));
  const catRow = cats.length ? `
    <label class="web-row">
      <input type="checkbox" data-key="categories" checked>
      <span><b>Add categories</b><br>${escapeHtml(cats.join(', '))}</span>
    </label>` : '';

  const box = document.getElementById('webResults');
  if (!rows && !catRow) {
    box.hidden = true;
    document.getElementById('webStatus').textContent += ' Nothing new — the form already has this.';
    return;
  }
  box.innerHTML = rows + catRow + `
    ${sourcesHtml(JSON.stringify(info.sources || []))}
    <div class="web-actions">
      <button type="button" id="applyWeb">Apply selected</button>
      <button type="button" id="closeWeb">Dismiss</button>
    </div>`;
  box.hidden = false;
}

document.getElementById('webResults').addEventListener('click', event => {
  if (event.target.id === 'closeWeb') { document.getElementById('webResults').hidden = true; return; }
  if (event.target.id === 'applyWeb') applyWebResults(false);
});

// Copy the TICKED rows into the form. auto = called without a click (after reading the cover).
function applyWebResults(auto) {
  const box = document.getElementById('webResults');
  const f = form.elements;
  const applied = [];
  const oldTitle = f.title.value;                     // remember, to show "old → new"
  box.querySelectorAll('input:checked').forEach(cb => {
    const key = cb.dataset.key;
    cb.closest('.web-row').remove();                  // applied → remove its row
    if (key === 'categories') {
      renderCategoryChips([...selectedCategories(), ...webInfo.categories]);
      applied.push('categories');
      return;
    }
    f[key].value = webInfo[key];
    f[key].classList.remove('ai-filled'); void f[key].offsetWidth; f[key].classList.add('ai-filled');
    applied.push(key);
    if (['translator', 'originalTitle', 'originalAuthor'].includes(key)) {
      f.isTranslation.checked = true;       // translation info found → it IS a translation
      showTranslationFields();
    }
  });
  if ((webInfo.sources || []).length) f.webSources.value = JSON.stringify(webInfo.sources);

  // Keep the box open only if there are unticked rows left for the admin to decide
  const left = box.querySelectorAll('.web-row').length;
  box.hidden = left === 0;
  const status = document.getElementById('webStatus');
  if (applied.includes('title')) checkDuplicatesNow();   // title changed → check again
  if (applied.includes('title')) status.textContent = `✏️ Title corrected: "${oldTitle}" → "${f.title.value}". `;
  else status.textContent = '';
  status.textContent += applied.length
    ? `${auto ? 'Auto-filled' : 'Applied'}: ${applied.length} field(s).` + (left ? ' More suggestions below.' : '') + ' Check, then Save.'
    : 'Nothing applied automatically — see the suggestions below.';
}



// ------------------------------------------------------------------
// Lesson 8: "Recommended for you" row
// ------------------------------------------------------------------
async function loadRecommendations() {
  const section = document.getElementById('recommendSection');
  if (!currentUser) { section.hidden = true; return; }
  try {
    const data = await callApi('recommend');
    // The server sends only { bookId, score, reason } → look up the full book here
    const items = data.recommendations
      .map(r => ({ book: books.find(b => String(b.id) === r.bookId), reason: r.reason }))
      .filter(item => item.book);                  // skip if the book is not in our list
    section.hidden = items.length === 0;
    document.getElementById('recommendRow').innerHTML =
      items.map(item => bookCard(item.book)).join('');    // reuse the Lesson 1 card…
    // …and add the reason under each card
    document.querySelectorAll('#recommendRow .book').forEach((card, i) => {
      const p = document.createElement('p');
      p.className = 'reason';
      p.textContent = items[i].reason;           // textContent → safe, no escaping needed
      card.appendChild(p);
    });
  } catch (err) {
    console.error('Recommendations failed:', err);
    section.hidden = true;                         // a "nice to have" — never break the page
  }
}

// Clicking a recommended card opens the same popup as the grid
document.getElementById('recommendRow').addEventListener('click', event => {
  const card = event.target.closest('.book');
  if (card) openBook(card.dataset.id);
});

// ------------------------------------------------------------------
// Lesson 9: what happens when the page opens (or reloads, or opens in a new tab)
// ------------------------------------------------------------------
async function startup() {
  if (!API_URL) {                          // no backend: sample data, no login
    showScreen('app');
    loadBooks();
    return;
  }
  sessionToken = readSessionCookie();
  if (!sessionToken) { showLoginScreen(); return; }   // never signed in on this browser

  try {
    showStartup('Loading…');
    const data = await callApi('me');      // is the saved session still valid? (retries by itself)
    await startApp(data);                  // yes → straight in, no login needed
  } catch (err) {
    // Lesson 13: ONLY an 'AUTH' answer means "log in again" — callApi already handled that.
    // Anything else (no signal, Google hiccup) must NOT throw away a good session:
    // keep the cookie and offer "Try again".
    if (err.code === 'AUTH' || err.code === 'PENDING') return;
    showStartup('Could not reach the library: ' + err.message, true);
  }
}

// The startup screen: a message, and optionally a "Try again" button
function showStartup(message, withRetry) {
  const box = document.getElementById('startupScreen');
  box.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = message;
  box.append(p);
  if (withRetry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'retry-button';
    button.textContent = '↻ Try again';
    button.onclick = startup;
    box.append(button);
  }
  showScreen('startup');
}

// Coming back to the tab after a while (phone unlocked, app switched back):
// quietly check the session instead of failing on the next click.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUser && sessionToken) {
    callApi('me').catch(() => { /* callApi shows the login screen only for a real AUTH answer */ });
  }
});

// ------------------------------------------------------------------
// Lesson 11: "already in the library?" warning
// ------------------------------------------------------------------
let allowDuplicate = false;

// Ask the server BEFORE saving (right after the AI read the cover)
async function checkDuplicatesNow() {
  const f = form.elements;
  if (f.id.value || !f.title.value.trim()) return;       // only for NEW books
  try {
    const book = {};
    ['title', 'author', 'titleSinglish', 'authorSinglish', 'isbn'].forEach(k => { book[k] = f[k].value; });
    const { duplicates } = await callApi('checkDuplicates', { book: book });
    if (duplicates.length) showDuplicates(duplicates); else hideDuplicates();
    return duplicates.length > 0;
  } catch (err) {
    console.warn('Duplicate check failed:', err);   // never block adding a book
    return false;
  }
}

function showDuplicates(list) {
  const box = document.getElementById('dupWarning');
  box.innerHTML = `
    <b>⚠️ This book may already be in the library:</b>
    ${list.map(d => `
      <div class="dup-row">
        ${d.coverUrl ? `<img src="${escapeHtml(d.coverUrl)}" alt="" referrerpolicy="no-referrer">` : '<div class="dup-nocover">📕</div>'}
        <div>
          <b>${escapeHtml(d.title)}</b><br>
          <small>${escapeHtml(d.author || '')} · ${d.copies} ${d.copies === 1 ? 'copy' : 'copies'}${d.shelf ? ' · ' + escapeHtml(d.shelf) : ''}</small>
        </div>
        <div class="dup-actions">
          <button type="button" data-dup="copy" data-id="${escapeHtml(d.id)}" class="primary">+1 copy</button>
          <button type="button" data-dup="open" data-id="${escapeHtml(d.id)}">Open</button>
        </div>
      </div>`).join('')}
    <button type="button" data-dup="different" class="link">No — it's a different book (e.g. another edition)</button>`;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideDuplicates() {
  allowDuplicate = false;
  document.getElementById('dupWarning').hidden = true;
}

document.getElementById('dupWarning').addEventListener('click', async event => {
  const button = event.target.closest('button[data-dup]');
  if (!button) return;
  const id = button.dataset.id;

  if (button.dataset.dup === 'different') {       // admin decides: save as a separate book
    allowDuplicate = true;
    document.getElementById('dupWarning').hidden = true;
    document.getElementById('webStatus').textContent = 'OK — it will be saved as a separate book.';
    return;
  }
  if (button.dataset.dup === 'open') {            // look at the existing book instead
    editDialog.close();
    openBook(id);
    return;
  }
  // "+1 copy": same book, one more on the shelf → no new record, no new photo
  button.disabled = true;
  try {
    const { book } = await callApi('addCopy', { bookId: id });
    editDialog.close();
    await loadBooks();
    openBook(book.id);
    alert(`Added: "${book.title}" now has ${book.copies} copies.`);
  } catch (err) {
    alert(err.message);
    button.disabled = false;
  }
});

// ------------------------------------------------------------------
// Lesson 12: save automatically after the AI + web checks
// Only when it is SAFE: a NEW book, a title, no duplicate warning, and the AI was fairly sure.
// A 5-second countdown gives the admin a last chance to stop it.
// ------------------------------------------------------------------
let savingAutomatically = false;
let autoSaveTimer = null;

// Remember the checkbox on this device
try {
  const saved = localStorage.getItem('autoSave');
  if (saved !== null) document.getElementById('autoSaveToggle').checked = saved === 'yes';
} catch (e) { /* ignore */ }
document.getElementById('autoSaveToggle').addEventListener('change', event => {
  try { localStorage.setItem('autoSave', event.target.checked ? 'yes' : 'no'); } catch (e) { /* ignore */ }
  if (!event.target.checked) cancelAutoSave();
});

async function autoFlow(confidence) {
  const f = form.elements;
  await runWebLookup(true);                       // 1. details + title correction (waits until done)
  const isDuplicate = await checkDuplicatesNow(); // 2. already in the library?

  // 3. decide
  const status = document.getElementById('webStatus');
  if (!editDialog.open || f.id.value) return;                       // closed, or editing an old book
  if (!document.getElementById('autoSaveToggle').checked) return;   // admin switched it off
  if (isDuplicate) { status.textContent += ' Not saved automatically: please choose above.'; return; }
  if (!f.title.value.trim()) return;
  if (confidence < 0.6) {
    status.textContent += ` Not saved automatically: the AI was only ${Math.round(confidence * 100)}% sure — please check.`;
    return;
  }
  startAutoSaveCountdown(5);
}

function startAutoSaveCountdown(seconds) {
  cancelAutoSave();
  const bar = document.getElementById('autoSaveBar');
  const text = document.getElementById('autoSaveText');
  let left = seconds;
  bar.hidden = false;
  text.textContent = `💾 Saving automatically in ${left}…`;
  // setInterval runs the function every 1000 ms until clearInterval stops it
  autoSaveTimer = setInterval(() => {
    left--;
    if (left > 0) { text.textContent = `💾 Saving automatically in ${left}…`; return; }
    cancelAutoSave();
    savingAutomatically = true;
    form.requestSubmit();          // = pressing Save: runs the same submit handler, incl. `required` checks
  }, 1000);
}

function cancelAutoSave() {
  if (autoSaveTimer) clearInterval(autoSaveTimer);
  autoSaveTimer = null;
  document.getElementById('autoSaveBar').hidden = true;
}

document.getElementById('autoSaveCancel').addEventListener('click', () => {
  cancelAutoSave();
  document.getElementById('webStatus').textContent = 'Auto-save cancelled. Check the fields, then click Save.';
});
// Typing in the form means the admin is changing something → stop the countdown
form.addEventListener('input', cancelAutoSave);
editDialog.addEventListener('close', cancelAutoSave);

// A small message at the bottom of the screen that disappears by itself
function showToast(message, bookId) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = '';
  toast.append(message);                                   // append(text) = safe, like textContent
  if (bookId) {
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open';
    open.onclick = () => { toast.classList.remove('show'); openBook(bookId); };
    toast.append(' ', open);
  }
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 6000);
}

// ------------------------------------------------------------------
// Lesson 14: lending — shared helper + the admin "On loan" list
// ------------------------------------------------------------------
const OVERDUE_DAYS = 14;        // after this many days the book is shown in red

// Run lend/return, then refresh everything that shows availability
async function runLoanAction(button, action, params) {
  button.disabled = true;
  try {
    await callApi(action, params);
    await loadBooks();                          // cards + watermark
    if (dialog.open && openBookId) openBook(openBookId);   // popup
    if (loansDialog.open) loadLoans();          // the On-loan list
    updateLoanBadge();
    showToast(action === 'lendBook' ? '📕 Lent out' : '✅ Marked as returned');
  } catch (err) {
    alert(err.message);
    button.disabled = false;
  }
}

// The badge on the button = number of books out right now (from the loaded book list)
function updateLoanBadge() {
  const out = books.reduce((sum, b) => sum + (b.loans || []).length, 0);
  const late = books.reduce((sum, b) => sum + (b.loans || []).filter(l => daysSince(l.since) > OVERDUE_DAYS).length, 0);
  const badge = document.getElementById('loanBadge');
  badge.textContent = out;
  badge.hidden = out === 0;
  badge.classList.toggle('late', late > 0);
}

const loansDialog = document.getElementById('loansDialog');
document.getElementById('loansButton').addEventListener('click', () => { loansDialog.showModal(); loadLoans(); });
loansDialog.querySelector('.close-loans').addEventListener('click', () => loansDialog.close());

async function loadLoans() {
  const status = document.getElementById('loansStatus');
  status.textContent = 'Loading…';
  try {
    const { loans } = await callApi('listLoans');
    const late = loans.filter(l => l.days > OVERDUE_DAYS).length;
    status.textContent = loans.length
      ? `${loans.length} book(s) out` + (late ? ` · ${late} kept longer than ${OVERDUE_DAYS} days` : '')
      : 'Every book is in stock. 🎉';
    document.getElementById('loansList').innerHTML = loans.map(l => {
      const level = l.days > OVERDUE_DAYS * 2 ? 'very-late' : l.days > OVERDUE_DAYS ? 'late' : 'ok';
      // mailto: opens the admin's email app with a ready-made reminder
      const subject = encodeURIComponent('Please return "' + l.title + '"');
      const bodyText = encodeURIComponent(`Hi ${firstName(l.userName)},\n\nYou borrowed "${l.title}" from the my library ` +
        `on ${niceDate(l.since)} (${l.days} days ago). Please return it when you can.\n\nThank you!`);
      return `
        <div class="loan-row ${level}">
          ${l.coverUrl ? `<img src="${escapeHtml(l.coverUrl)}" alt="" referrerpolicy="no-referrer">` : '<div class="dup-nocover">📕</div>'}
          <div>
            <b>${escapeHtml(l.title)}</b><br>
            <small>${escapeHtml(l.userName)} · since ${escapeHtml(niceDate(l.since))}${l.shelf ? ' · ' + escapeHtml(l.shelf) : ''}</small>
          </div>
          <div class="days ${level}">${l.days}<small>days</small></div>
          <div class="loan-actions">
            <a href="mailto:${encodeURIComponent(l.email)}?subject=${subject}&body=${bodyText}">✉️ Remind</a>
            <button type="button" data-return="${escapeHtml(l.loanId)}">✓ Returned</button>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    status.textContent = err.message;
  }
}

document.getElementById('loansList').addEventListener('click', event => {
  const button = event.target.closest('[data-return]');
  if (button) runLoanAction(button, 'returnBook', { loanId: button.dataset.return });
});

// ------------------------------------------------------------------
// Lesson 15: automatic update check
// The deploy workflow writes the SAME version into this file and into version.json.
// If version.json on the server is newer than the code running here → reload.
// ------------------------------------------------------------------
const APP_VERSION = '__VERSION__';

async function checkForUpdate() {
  if (APP_VERSION.startsWith('__')) return;          // running locally (not stamped) → skip
  try {
    // cache: 'no-store' + a changing ?t= → always ask GitHub, never the browser cache
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    const { version } = await res.json();
    if (!version || version === APP_VERSION) return;
    // Already tried this exact version (GitHub's servers may need a minute) → don't loop
    if (new URLSearchParams(location.search).get('v') === version) return;

    // Don't throw away someone's half-filled form — ask instead
    if (document.querySelector('dialog[open]')) {
      showToast('🔄 A new version of the library is ready — close this window to update.');
      return;
    }
    // Open the page with ?v=<new version>: a NEW address, so even index.html comes fresh
    location.replace(location.pathname + '?v=' + encodeURIComponent(version) + location.hash);
  } catch (err) {
    /* offline or no version.json — just keep going */
  }
}

// When: at start, every time you come back to the tab, and every 30 minutes
checkForUpdate();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
setInterval(checkForUpdate, 30 * 60 * 1000);
document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', checkForUpdate));

startup();
