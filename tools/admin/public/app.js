// --- Tab Switching ---
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// --- Wild Photo Upload ---
const dropzone = document.getElementById('wild-dropzone');
const wildFile = document.getElementById('wild-file');
const wildPreview = document.getElementById('wild-preview');
const wildPreviewImg = document.getElementById('wild-preview-img');
const wildPreviewInfo = document.getElementById('wild-preview-info');
const wildUploadBtn = document.getElementById('wild-upload-btn');
const wildResult = document.getElementById('wild-result');

let selectedWildFile = null;

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) showWildPreview(e.dataTransfer.files[0]);
});

wildFile.addEventListener('change', () => {
  if (wildFile.files[0]) showWildPreview(wildFile.files[0]);
});

function showWildPreview(file) {
  selectedWildFile = file;
  const url = URL.createObjectURL(file);
  wildPreviewImg.src = url;
  wildPreviewInfo.textContent = `${file.name} — ${(file.size / 1024).toFixed(0)}KB`;
  wildPreview.hidden = false;
  wildUploadBtn.hidden = false;
  wildResult.hidden = true;
}

wildUploadBtn.addEventListener('click', async () => {
  if (!selectedWildFile) return;
  wildUploadBtn.disabled = true;
  wildUploadBtn.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('image', selectedWildFile);

  try {
    const resp = await fetch('/api/wild/upload', { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.success) {
      wildResult.className = 'result success';
      wildResult.innerHTML = `Saved as <strong>${data.filename}</strong> (${data.size})`;
    } else {
      wildResult.className = 'result error';
      wildResult.textContent = data.error;
    }
  } catch (err) {
    wildResult.className = 'result error';
    wildResult.textContent = err.message;
  }

  wildResult.hidden = false;
  wildUploadBtn.disabled = false;
  wildUploadBtn.textContent = 'Upload & Optimize';
});

// --- Showcase Photo Upload ---
const showcaseDropzone = document.getElementById('showcase-dropzone');
const showcaseFile = document.getElementById('showcase-file');
const showcasePreview = document.getElementById('showcase-preview');
const showcasePreviewImg = document.getElementById('showcase-preview-img');
const showcasePreviewInfo = document.getElementById('showcase-preview-info');
const showcaseUploadBtn = document.getElementById('showcase-upload-btn');
const showcaseResult = document.getElementById('showcase-result');

let selectedShowcaseFile = null;

showcaseDropzone.addEventListener('dragover', e => { e.preventDefault(); showcaseDropzone.classList.add('dragover'); });
showcaseDropzone.addEventListener('dragleave', () => showcaseDropzone.classList.remove('dragover'));
showcaseDropzone.addEventListener('drop', e => {
  e.preventDefault();
  showcaseDropzone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) showShowcasePreview(e.dataTransfer.files[0]);
});

showcaseFile.addEventListener('change', () => {
  if (showcaseFile.files[0]) showShowcasePreview(showcaseFile.files[0]);
});

function showShowcasePreview(file) {
  selectedShowcaseFile = file;
  const url = URL.createObjectURL(file);
  showcasePreviewImg.src = url;
  showcasePreviewInfo.textContent = `${file.name} — ${(file.size / 1024).toFixed(0)}KB`;
  showcasePreview.hidden = false;
  showcaseUploadBtn.hidden = false;
  showcaseResult.hidden = true;
}

showcaseUploadBtn.addEventListener('click', async () => {
  if (!selectedShowcaseFile) return;
  showcaseUploadBtn.disabled = true;
  showcaseUploadBtn.textContent = 'Uploading...';

  const formData = new FormData();
  formData.append('image', selectedShowcaseFile);

  try {
    const resp = await fetch('/api/showcase/upload', { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.success) {
      showcaseResult.className = 'result success';
      showcaseResult.innerHTML = `Saved as <strong>${data.filename}</strong> (${data.size})`;
    } else {
      showcaseResult.className = 'result error';
      showcaseResult.textContent = data.error;
    }
  } catch (err) {
    showcaseResult.className = 'result error';
    showcaseResult.textContent = err.message;
  }

  showcaseResult.hidden = false;
  showcaseUploadBtn.disabled = false;
  showcaseUploadBtn.textContent = 'Upload & Optimize';
});

// --- News Post ---
const newsTitle = document.getElementById('news-title');
const newsSlug = document.getElementById('news-slug');
const newsDate = document.getElementById('news-date');
const newsForm = document.getElementById('news-form');
const newsResult = document.getElementById('news-result');

// Auto-set today's date
newsDate.value = new Date().toISOString().split('T')[0];

// Auto-generate slug from title
newsTitle.addEventListener('input', () => {
  newsSlug.value = newsTitle.value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
});

newsForm.addEventListener('submit', async e => {
  e.preventDefault();
  const formData = new FormData(newsForm);
  const submitBtn = newsForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publishing...';

  try {
    const resp = await fetch('/api/news/publish', { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.success) {
      newsResult.className = 'result success';
      newsResult.innerHTML = `Published! View at <strong>${data.path}</strong> (restart dev server to see it)`;
    } else {
      newsResult.className = 'result error';
      newsResult.textContent = data.error;
    }
  } catch (err) {
    newsResult.className = 'result error';
    newsResult.textContent = err.message;
  }

  newsResult.hidden = false;
  submitBtn.disabled = false;
  submitBtn.textContent = 'Publish';
});

// --- Credits ---
const creditsList = document.getElementById('credits-list');
const creditModal = document.getElementById('credit-modal');
const creditForm = document.getElementById('credit-form');
const modalTitle = document.getElementById('modal-title');
const addCreditBtn = document.getElementById('add-credit-btn');
const cancelCreditBtn = document.getElementById('cancel-credit-btn');
const creditsSearch = document.getElementById('credits-search');
const syncCreditsBtn = document.getElementById('sync-credits-btn');
const syncResult = document.getElementById('sync-result');

let allCredits = [];

// Bech32 decoding for npub -> hex conversion
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(str) {
  str = str.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) return null;

  const hrp = str.slice(0, pos);
  const dataStr = str.slice(pos + 1);

  const data = [];
  for (const c of dataStr) {
    const idx = BECH32_CHARSET.indexOf(c);
    if (idx === -1) return null;
    data.push(idx);
  }

  // Remove checksum (last 6 characters)
  const values = data.slice(0, -6);

  // Convert 5-bit values to 8-bit bytes
  let acc = 0;
  let bits = 0;
  const bytes = [];
  for (const v of values) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }

  return { hrp, bytes };
}

function npubToHex(npub) {
  if (!npub || !npub.startsWith('npub1')) return '';
  const decoded = bech32Decode(npub);
  if (!decoded || decoded.hrp !== 'npub') return '';
  return decoded.bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Extract X username from profile URL
function extractXUsername(url) {
  if (!url) return '';
  // Match twitter.com/username or x.com/username
  const match = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
  return match ? match[1] : '';
}

async function loadCredits() {
  try {
    const resp = await fetch('/api/credits');
    allCredits = await resp.json();
    renderCredits(allCredits);
  } catch (err) {
    creditsList.innerHTML = `<p class="error">Failed to load credits: ${err.message}</p>`;
  }
}

function renderCreditCard(c) {
  return `
    <div class="credit-card" data-id="${c.id}">
      <div class="credit-avatar">
        ${c.nostrProfilePic || c.xProfilePic
          ? `<img src="${c.nostrProfilePic || c.xProfilePic}" alt="${c.name}" onerror="this.style.display='none'">`
          : `<span>${(c.name || '?')[0].toUpperCase()}</span>`
        }
      </div>
      <div class="credit-info">
        <div class="credit-name">
          ${c.isBitcoinKid ? '<span class="bitcoin-kid-star">⭐</span>' : ''}
          ${c.name || 'Unnamed'}
        </div>
        <div class="credit-role">${c.notes || ''}</div>
        <div class="credit-details">
          ${c.email ? `<span title="Email">${c.email}</span>` : ''}
          ${c.lightningAddress ? `<span title="Lightning">⚡ ${c.lightningAddress}</span>` : ''}
        </div>
        <div class="credit-links">
          ${c.nostrNpub ? `<a href="https://njump.me/${c.nostrNpub}" target="_blank" title="Nostr">Nostr</a>` : ''}
          ${c.xProfileUrl ? `<a href="${c.xProfileUrl}" target="_blank" title="X">X</a>` : ''}
          ${c.websiteUrl ? `<a href="${c.websiteUrl}" target="_blank" title="Website">Web</a>` : ''}
        </div>
      </div>
      <div class="credit-actions">
        <button class="btn-icon edit-credit" title="Edit">✏️</button>
        <button class="btn-icon delete-credit" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

function renderCredits(credits) {
  if (credits.length === 0) {
    creditsList.innerHTML = '<p class="empty">No credits yet. Click "Add Credit" to create one.</p>';
    return;
  }

  // Group credits by section
  const coreTeam = credits.filter(c => c.websiteSection === 'Core Team');
  const contributors = credits.filter(c => c.websiteSection === 'Contributor');
  const specialThanks = credits.filter(c => c.websiteSection === 'Special Thanks');
  const other = credits.filter(c => !c.websiteSection || !['Core Team', 'Contributor', 'Special Thanks'].includes(c.websiteSection));

  let html = '';

  if (coreTeam.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Core Team <span class="credits-section-count">(${coreTeam.length})</span></h3>
        <div class="credits-section-list">${coreTeam.map(renderCreditCard).join('')}</div>
      </div>
    `;
  }

  if (contributors.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Contributors <span class="credits-section-count">(${contributors.length})</span></h3>
        <div class="credits-section-list">${contributors.map(renderCreditCard).join('')}</div>
      </div>
    `;
  }

  if (specialThanks.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Special Thanks <span class="credits-section-count">(${specialThanks.length})</span></h3>
        <div class="credits-section-list">${specialThanks.map(renderCreditCard).join('')}</div>
      </div>
    `;
  }

  if (other.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Not Assigned <span class="credits-section-count">(${other.length})</span></h3>
        <div class="credits-section-list">${other.map(renderCreditCard).join('')}</div>
      </div>
    `;
  }

  creditsList.innerHTML = html;

  // Attach event listeners
  creditsList.querySelectorAll('.edit-credit').forEach(btn => {
    btn.addEventListener('click', () => editCredit(btn.closest('.credit-card').dataset.id));
  });
  creditsList.querySelectorAll('.delete-credit').forEach(btn => {
    btn.addEventListener('click', () => deleteCredit(btn.closest('.credit-card').dataset.id));
  });
}

function openModal(credit = null) {
  modalTitle.textContent = credit ? 'Edit Credit' : 'Add Credit';
  document.getElementById('credit-id').value = credit?.id || '';
  document.getElementById('credit-name').value = credit?.name || '';
  document.getElementById('credit-nostr-npub').value = credit?.nostrNpub || '';
  // Auto-calculate hex from npub when opening modal
  const npubValue = credit?.nostrNpub || '';
  const hex = npubValue ? npubToHex(npubValue) : '';
  document.getElementById('credit-nostr-hex').value = hex;
  // Use stored pic or fetch from Primal
  if (credit?.nostrProfilePic) {
    document.getElementById('credit-nostr-pic').value = credit.nostrProfilePic;
  } else if (hex) {
    document.getElementById('credit-nostr-pic').value = 'Loading...';
    fetch(`/api/nostr/profile/${hex}`)
      .then(r => r.json())
      .then(p => { document.getElementById('credit-nostr-pic').value = p.picture || ''; })
      .catch(() => { document.getElementById('credit-nostr-pic').value = ''; });
  } else {
    document.getElementById('credit-nostr-pic').value = '';
  }
  document.getElementById('credit-x-url').value = credit?.xProfileUrl || '';
  // Use stored pic or auto-generate from X URL
  if (credit?.xProfilePic) {
    document.getElementById('credit-x-pic').value = credit.xProfilePic;
  } else if (credit?.xProfileUrl) {
    const username = extractXUsername(credit.xProfileUrl);
    document.getElementById('credit-x-pic').value = username ? `https://unavatar.io/twitter/${username}` : '';
  } else {
    document.getElementById('credit-x-pic').value = '';
  }
  document.getElementById('credit-website-url').value = credit?.websiteUrl || '';
  document.getElementById('credit-notes').value = credit?.notes || '';
  document.getElementById('credit-show-on-website').checked = credit?.showOnWebsite || false;
  document.getElementById('credit-website-section').value = credit?.websiteSection || '';
  document.getElementById('credit-bitcoin-kid').checked = credit?.isBitcoinKid || false;
  creditModal.hidden = false;
}

function closeModal() {
  creditModal.hidden = true;
  creditForm.reset();
}

function editCredit(id) {
  const credit = allCredits.find(c => c.id === id);
  if (credit) openModal(credit);
}

async function deleteCredit(id) {
  const credit = allCredits.find(c => c.id === id);
  if (!confirm(`Delete credit "${credit?.name || 'Unnamed'}"?`)) return;

  try {
    await fetch(`/api/credits/${id}`, { method: 'DELETE' });
    loadCredits();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

addCreditBtn.addEventListener('click', () => openModal());
cancelCreditBtn.addEventListener('click', closeModal);
creditModal.addEventListener('click', e => {
  if (e.target === creditModal) closeModal();
});

creditForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('credit-id').value;
  const data = {
    name: document.getElementById('credit-name').value,
    nostrNpub: document.getElementById('credit-nostr-npub').value,
    nostrHex: document.getElementById('credit-nostr-hex').value,
    nostrProfilePic: document.getElementById('credit-nostr-pic').value,
    xProfileUrl: document.getElementById('credit-x-url').value,
    xProfilePic: document.getElementById('credit-x-pic').value,
    websiteUrl: document.getElementById('credit-website-url').value,
    notes: document.getElementById('credit-notes').value,
    showOnWebsite: document.getElementById('credit-show-on-website').checked,
    websiteSection: document.getElementById('credit-website-section').value,
    isBitcoinKid: document.getElementById('credit-bitcoin-kid').checked,
  };

  try {
    if (id) {
      await fetch(`/api/credits/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    closeModal();
    loadCredits();
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
});

creditsSearch.addEventListener('input', () => {
  const query = creditsSearch.value.toLowerCase();
  const filtered = allCredits.filter(c =>
    (c.name || '').toLowerCase().includes(query) ||
    (c.email || '').toLowerCase().includes(query) ||
    (c.role || '').toLowerCase().includes(query) ||
    (c.notes || '').toLowerCase().includes(query)
  );
  renderCredits(filtered);
});

// Sync credits to website
syncCreditsBtn.addEventListener('click', async () => {
  syncCreditsBtn.disabled = true;
  syncCreditsBtn.textContent = 'Syncing...';

  // Always sync all sections
  const sections = ['Core Team', 'Contributor', 'Special Thanks'];

  try {
    const resp = await fetch('/api/credits/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sections }),
    });
    const data = await resp.json();

    if (data.success) {
      syncResult.className = 'result success';
      syncResult.innerHTML = `Synced to <strong>${data.path}</strong>: ${data.exported.coreTeam} Core Team, ${data.exported.contributors} Contributors, ${data.exported.specialThanks} Special Thanks`;
    } else {
      syncResult.className = 'result error';
      syncResult.textContent = data.error;
    }
  } catch (err) {
    syncResult.className = 'result error';
    syncResult.textContent = err.message;
  }

  syncResult.hidden = false;
  syncCreditsBtn.disabled = false;
  syncCreditsBtn.textContent = 'Sync to Website';
});

// Load credits when tab is clicked
document.querySelector('[data-tab="credits"]').addEventListener('click', loadCredits);

// Auto-calculate nostr hex and fetch profile picture from Primal
document.getElementById('credit-nostr-npub').addEventListener('input', async e => {
  const npub = e.target.value.trim();
  const hexField = document.getElementById('credit-nostr-hex');
  const picField = document.getElementById('credit-nostr-pic');
  const hex = npubToHex(npub);
  hexField.value = hex;

  // Fetch profile picture from Primal via our API
  if (hex) {
    picField.value = 'Loading...';
    try {
      const resp = await fetch(`/api/nostr/profile/${hex}`);
      const profile = await resp.json();
      picField.value = profile.picture || '';
    } catch (err) {
      picField.value = '';
    }
  } else {
    picField.value = '';
  }
});

// Copy hex to clipboard
document.getElementById('copy-hex-btn').addEventListener('click', async () => {
  const hexField = document.getElementById('credit-nostr-hex');
  const copyBtn = document.getElementById('copy-hex-btn');
  if (!hexField.value) return;

  try {
    await navigator.clipboard.writeText(hexField.value);
    copyBtn.textContent = '✓';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = '📋';
      copyBtn.classList.remove('copied');
    }, 1500);
  } catch (err) {
    hexField.select();
    document.execCommand('copy');
  }
});

// Auto-populate X profile picture from X profile URL
document.getElementById('credit-x-url').addEventListener('input', e => {
  const url = e.target.value.trim();
  const picField = document.getElementById('credit-x-pic');
  const username = extractXUsername(url);

  if (username) {
    picField.value = `https://unavatar.io/twitter/${username}`;
  } else {
    picField.value = '';
  }
});

// Copy X profile pic URL to clipboard
document.getElementById('copy-x-pic-btn').addEventListener('click', async () => {
  const picField = document.getElementById('credit-x-pic');
  const copyBtn = document.getElementById('copy-x-pic-btn');
  if (!picField.value) return;

  try {
    await navigator.clipboard.writeText(picField.value);
    copyBtn.textContent = '✓';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = '📋';
      copyBtn.classList.remove('copied');
    }, 1500);
  } catch (err) {
    picField.select();
    document.execCommand('copy');
  }
});

// --- Partners / Friends & Family ---
const partnersList = document.getElementById('partners-list');
const partnerModal = document.getElementById('partner-modal');
const partnerForm = document.getElementById('partner-form');
const partnerModalTitle = document.getElementById('partner-modal-title');
const addPartnerBtn = document.getElementById('add-partner-btn');
const cancelPartnerBtn = document.getElementById('cancel-partner-btn');
const partnersSearch = document.getElementById('partners-search');
const syncPartnersBtn = document.getElementById('sync-partners-btn');
const partnersSyncResult = document.getElementById('partners-sync-result');

let allPartners = [];

async function loadPartners() {
  try {
    const resp = await fetch('/api/partners');
    allPartners = await resp.json();
    renderPartners(allPartners);
  } catch (err) {
    partnersList.innerHTML = `<p class="error">Failed to load partners: ${err.message}</p>`;
  }
}

function renderPartnerCard(p) {
  return `
    <div class="credit-card" data-id="${p.id}">
      <div class="credit-avatar">
        ${p.logoUrl || p.nostrProfilePic || p.xProfilePic
          ? `<img src="${p.logoUrl || p.nostrProfilePic || p.xProfilePic}" alt="${p.name}" onerror="this.style.display='none'">`
          : `<span>${(p.name || '?')[0].toUpperCase()}</span>`
        }
      </div>
      <div class="credit-info">
        <div class="credit-name">${p.name || 'Unnamed'}</div>
        <div class="credit-role">${p.description || ''}</div>
        <div class="credit-links">
          ${p.websiteUrl ? `<a href="${p.websiteUrl}" target="_blank" title="Website">Web</a>` : ''}
          ${p.nostrNpub ? `<a href="https://njump.me/${p.nostrNpub}" target="_blank" title="Nostr">Nostr</a>` : ''}
          ${p.xProfileUrl ? `<a href="${p.xProfileUrl}" target="_blank" title="X">X</a>` : ''}
        </div>
      </div>
      <div class="credit-actions">
        <button class="btn-icon edit-partner" title="Edit">✏️</button>
        <button class="btn-icon delete-partner" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

function renderPartners(partners) {
  if (partners.length === 0) {
    partnersList.innerHTML = '<p class="empty">No partners yet. Click "Add Partner" to create one.</p>';
    return;
  }

  // Group partners by section
  const educationPartners = partners.filter(p => p.section === 'Education Partners');
  const technologyPartners = partners.filter(p => p.section === 'Technology Partners');
  const appearances = partners.filter(p => p.section === 'Appearances');
  const inTheNews = partners.filter(p => p.section === 'In the News');
  const other = partners.filter(p => !p.section || !['Education Partners', 'Technology Partners', 'Appearances', 'In the News'].includes(p.section));

  let html = '';

  if (educationPartners.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Education Partners <span class="credits-section-count">(${educationPartners.length})</span></h3>
        <div class="credits-section-list">${educationPartners.map(renderPartnerCard).join('')}</div>
      </div>
    `;
  }

  if (technologyPartners.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Technology Partners <span class="credits-section-count">(${technologyPartners.length})</span></h3>
        <div class="credits-section-list">${technologyPartners.map(renderPartnerCard).join('')}</div>
      </div>
    `;
  }

  if (appearances.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Appearances <span class="credits-section-count">(${appearances.length})</span></h3>
        <div class="credits-section-list">${appearances.map(renderPartnerCard).join('')}</div>
      </div>
    `;
  }

  if (inTheNews.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">In the News <span class="credits-section-count">(${inTheNews.length})</span></h3>
        <div class="credits-section-list">${inTheNews.map(renderPartnerCard).join('')}</div>
      </div>
    `;
  }

  if (other.length > 0) {
    html += `
      <div class="credits-section">
        <h3 class="credits-section-title">Not Assigned <span class="credits-section-count">(${other.length})</span></h3>
        <div class="credits-section-list">${other.map(renderPartnerCard).join('')}</div>
      </div>
    `;
  }

  partnersList.innerHTML = html;

  // Attach event listeners
  partnersList.querySelectorAll('.edit-partner').forEach(btn => {
    btn.addEventListener('click', () => editPartner(btn.closest('.credit-card').dataset.id));
  });
  partnersList.querySelectorAll('.delete-partner').forEach(btn => {
    btn.addEventListener('click', () => deletePartner(btn.closest('.credit-card').dataset.id));
  });
}

function openPartnerModal(partner = null) {
  partnerModalTitle.textContent = partner ? 'Edit Partner' : 'Add Partner';
  document.getElementById('partner-id').value = partner?.id || '';
  document.getElementById('partner-name').value = partner?.name || '';
  document.getElementById('partner-description').value = partner?.description || '';
  document.getElementById('partner-website-url').value = partner?.websiteUrl || '';
  document.getElementById('partner-logo-url').value = partner?.logoUrl || '';
  document.getElementById('partner-nostr-npub').value = partner?.nostrNpub || '';
  document.getElementById('partner-nostr-pic').value = partner?.nostrProfilePic || '';
  document.getElementById('partner-x-url').value = partner?.xProfileUrl || '';
  // Auto-generate X pic from URL
  if (partner?.xProfilePic) {
    document.getElementById('partner-x-pic').value = partner.xProfilePic;
  } else if (partner?.xProfileUrl) {
    const username = extractXUsername(partner.xProfileUrl);
    document.getElementById('partner-x-pic').value = username ? `https://unavatar.io/twitter/${username}` : '';
  } else {
    document.getElementById('partner-x-pic').value = '';
  }
  document.getElementById('partner-show-on-website').checked = partner?.showOnWebsite || false;
  document.getElementById('partner-section').value = partner?.section || '';
  partnerModal.hidden = false;
}

function closePartnerModal() {
  partnerModal.hidden = true;
  partnerForm.reset();
}

function editPartner(id) {
  const partner = allPartners.find(p => p.id === id);
  if (partner) openPartnerModal(partner);
}

async function deletePartner(id) {
  const partner = allPartners.find(p => p.id === id);
  if (!confirm(`Delete partner "${partner?.name || 'Unnamed'}"?`)) return;

  try {
    await fetch(`/api/partners/${id}`, { method: 'DELETE' });
    loadPartners();
  } catch (err) {
    alert('Failed to delete: ' + err.message);
  }
}

addPartnerBtn.addEventListener('click', () => openPartnerModal());
cancelPartnerBtn.addEventListener('click', closePartnerModal);
partnerModal.addEventListener('click', e => {
  if (e.target === partnerModal) closePartnerModal();
});

partnerForm.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('partner-id').value;
  const data = {
    name: document.getElementById('partner-name').value,
    description: document.getElementById('partner-description').value,
    websiteUrl: document.getElementById('partner-website-url').value,
    logoUrl: document.getElementById('partner-logo-url').value,
    nostrNpub: document.getElementById('partner-nostr-npub').value,
    nostrProfilePic: document.getElementById('partner-nostr-pic').value,
    xProfileUrl: document.getElementById('partner-x-url').value,
    xProfilePic: document.getElementById('partner-x-pic').value,
    showOnWebsite: document.getElementById('partner-show-on-website').checked,
    section: document.getElementById('partner-section').value,
  };

  try {
    if (id) {
      await fetch(`/api/partners/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    closePartnerModal();
    loadPartners();
  } catch (err) {
    alert('Failed to save: ' + err.message);
  }
});

partnersSearch.addEventListener('input', () => {
  const query = partnersSearch.value.toLowerCase();
  const filtered = allPartners.filter(p =>
    (p.name || '').toLowerCase().includes(query) ||
    (p.description || '').toLowerCase().includes(query)
  );
  renderPartners(filtered);
});

// Sync partners to website
syncPartnersBtn.addEventListener('click', async () => {
  syncPartnersBtn.disabled = true;
  syncPartnersBtn.textContent = 'Syncing...';

  try {
    const resp = await fetch('/api/partners/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await resp.json();

    if (data.success) {
      partnersSyncResult.className = 'result success';
      partnersSyncResult.innerHTML = `Synced to <strong>${data.path}</strong>: ${data.exported.educationPartners} Education, ${data.exported.technologyPartners} Technology, ${data.exported.appearances} Appearances, ${data.exported.inTheNews} News`;
    } else {
      partnersSyncResult.className = 'result error';
      partnersSyncResult.textContent = data.error;
    }
  } catch (err) {
    partnersSyncResult.className = 'result error';
    partnersSyncResult.textContent = err.message;
  }

  partnersSyncResult.hidden = false;
  syncPartnersBtn.disabled = false;
  syncPartnersBtn.textContent = 'Sync to Website';
});

// Load partners when tab is clicked
document.querySelector('[data-tab="partners"]').addEventListener('click', loadPartners);

// Auto-populate X profile picture from X URL for partners
document.getElementById('partner-x-url').addEventListener('input', e => {
  const url = e.target.value.trim();
  const picField = document.getElementById('partner-x-pic');
  const username = extractXUsername(url);

  if (username) {
    picField.value = `https://unavatar.io/twitter/${username}`;
  } else {
    picField.value = '';
  }
});

// Auto-fetch Nostr profile pic for partners
document.getElementById('partner-nostr-npub').addEventListener('input', async e => {
  const npub = e.target.value.trim();
  const picField = document.getElementById('partner-nostr-pic');
  const hex = npubToHex(npub);

  if (hex) {
    picField.value = 'Loading...';
    try {
      const resp = await fetch(`/api/nostr/profile/${hex}`);
      const profile = await resp.json();
      picField.value = profile.picture || '';
    } catch (err) {
      picField.value = '';
    }
  } else {
    picField.value = '';
  }
});
