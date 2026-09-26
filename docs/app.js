// Sample data for Lesson 1. Later this will come from the Google Sheet.
const books = [
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

  // Backticks (`) make a template string: ${...} inserts a value.
  return `
    <div class="book">
      <div class="cover">${escapeHtml(book.title)}</div>
      <div class="title">${escapeHtml(book.title)}</div>
      <div class="author">${escapeHtml(book.author)}</div>
      <div class="meta">${escapeHtml(book.language)} · ${escapeHtml(book.categories.join(', '))}</div>
      ${badge}
    </div>
  `;
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
  const language = document.getElementById('language').value;
  const onlyTranslations = document.getElementById('onlyTranslations').checked;

  const result = books.filter(book => {
    // 1. Search: look in title, author and categories together
    const haystack = (book.title + ' ' + book.author + ' ' + book.categories.join(' ')).toLowerCase();
    const matchesSearch = haystack.includes(searchText);   // '' matches everything

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

// First draw when the page loads
applyFilters();
