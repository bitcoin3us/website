import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const WILD_DIR = path.join(ROOT, 'public', 'images', 'wild');
const SHOWCASE_DIR = path.join(ROOT, 'public', 'images', 'showcase');
const NEWS_DIR = path.join(ROOT, 'src', 'content', 'news');
const CREDITS_FILE = path.join(os.homedir(), '.lightningpiggy', 'credits.json');
const CREDITS_EXPORT_FILE = path.join(ROOT, 'src', 'data', 'credits.json');
const PARTNERS_FILE = path.join(os.homedir(), '.lightningpiggy', 'partners.json');
const PARTNERS_EXPORT_FILE = path.join(ROOT, 'src', 'data', 'partners.json');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/branding', express.static(path.join(ROOT, 'public', 'images', 'branding')));
app.use(express.json());

// --- Wild Photo Endpoints ---

app.get('/api/wild/next-number', (req, res) => {
  const files = fs.readdirSync(WILD_DIR).filter(f => /^wild-\d+\.\w+$/.test(f));
  const numbers = files.map(f => parseInt(f.match(/wild-(\d+)/)[1], 10));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  res.json({ next, padded: String(next).padStart(3, '0') });
});

app.post('/api/wild/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    // Get next number
    const files = fs.readdirSync(WILD_DIR).filter(f => /^wild-\d+\.\w+$/.test(f));
    const numbers = files.map(f => parseInt(f.match(/wild-(\d+)/)[1], 10));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    const filename = `wild-${String(next).padStart(3, '0')}.jpeg`;
    const outputPath = path.join(WILD_DIR, filename);

    // Optimize image
    await sharp(req.file.buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    const stats = fs.statSync(outputPath);
    res.json({
      success: true,
      filename,
      size: `${Math.round(stats.size / 1024)}KB`,
      path: `/images/wild/${filename}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Showcase Photo Endpoints ---

app.post('/api/showcase/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const files = fs.readdirSync(SHOWCASE_DIR).filter(f => /^showcase-\d+\.\w+$/.test(f));
    const numbers = files.map(f => parseInt(f.match(/showcase-(\d+)/)[1], 10));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    const filename = `showcase-${String(next).padStart(3, '0')}.jpeg`;
    const outputPath = path.join(SHOWCASE_DIR, filename);

    await sharp(req.file.buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    const stats = fs.statSync(outputPath);
    res.json({
      success: true,
      filename,
      size: `${Math.round(stats.size / 1024)}KB`,
      path: `/images/showcase/${filename}`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- News Post Endpoints ---

app.post('/api/news/publish', upload.single('heroImage'), async (req, res) => {
  try {
    const { title, slug, description, pubDate, tags, content } = req.body;

    if (!title || !slug || !content) {
      return res.status(400).json({ error: 'Title, slug, and content are required' });
    }

    const postDir = path.join(NEWS_DIR, slug);
    if (fs.existsSync(postDir)) {
      return res.status(400).json({ error: `News post "${slug}" already exists` });
    }

    fs.mkdirSync(postDir, { recursive: true });

    // Process hero image if provided
    let heroFilename = '';
    if (req.file) {
      heroFilename = `hero.jpeg`;
      await sharp(req.file.buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(path.join(postDir, heroFilename));
    }

    // Build frontmatter
    const tagsList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    let frontmatter = `---\ntitle: "${title}"\nslug: ${slug}\n`;
    if (description) frontmatter += `description: "${description}"\n`;
    frontmatter += `pubDate: ${pubDate || new Date().toISOString().split('T')[0]}\n`;
    if (heroFilename) frontmatter += `heroImage: './${heroFilename}'\n`;
    if (tagsList.length) frontmatter += `tags: [${tagsList.map(t => `"${t}"`).join(', ')}]\n`;
    frontmatter += `---\n\n`;

    fs.writeFileSync(path.join(postDir, 'index.md'), frontmatter + content);

    res.json({ success: true, slug, path: `/news/${slug}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Nostr Profile Lookup ---

app.get('/api/nostr/profile/:hex', async (req, res) => {
  const hex = req.params.hex;
  if (!hex || hex.length !== 64) {
    return res.status(400).json({ error: 'Invalid hex pubkey' });
  }

  try {
    const profile = await fetchNostrProfile(hex);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function fetchNostrProfile(hex) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('wss://cache2.primal.net/v1');
    const subId = crypto.randomUUID().slice(0, 8);
    let profile = null;
    let timeout;

    ws.on('open', () => {
      // Request user profile metadata
      ws.send(JSON.stringify(['REQ', subId, { cache: ['user_profile', { pubkey: hex }] }]));
      timeout = setTimeout(() => {
        ws.close();
        resolve({ picture: '', name: '', about: '' });
      }, 5000);
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg[0] === 'EVENT' && msg[1] === subId && msg[2]?.kind === 0) {
          const content = JSON.parse(msg[2].content);
          profile = {
            picture: content.picture || '',
            name: content.name || content.display_name || '',
            about: content.about || '',
          };
        }
        if (msg[0] === 'EOSE') {
          clearTimeout(timeout);
          ws.close();
          resolve(profile || { picture: '', name: '', about: '' });
        }
      } catch (e) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      if (!profile) resolve({ picture: '', name: '', about: '' });
    });
  });
}

// --- Credits Endpoints ---

function loadCredits() {
  try {
    if (!fs.existsSync(CREDITS_FILE)) {
      const dir = path.dirname(CREDITS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CREDITS_FILE, JSON.stringify({ credits: [], schema_version: 1 }, null, 2));
    }
    return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf-8'));
  } catch (err) {
    return { credits: [], schema_version: 1 };
  }
}

function saveCredits(data) {
  const dir = path.dirname(CREDITS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(data, null, 2));
}

// Get all credits
app.get('/api/credits', (req, res) => {
  const data = loadCredits();
  res.json(data.credits);
});

// Add a new credit
app.post('/api/credits', (req, res) => {
  try {
    const data = loadCredits();
    const credit = {
      id: crypto.randomUUID(),
      name: req.body.name || '',
      email: req.body.email || '',
      role: req.body.role || '',
      lightningAddress: req.body.lightningAddress || '',
      nostrNpub: req.body.nostrNpub || '',
      nostrHex: req.body.nostrHex || '',
      nostrProfilePic: req.body.nostrProfilePic || '',
      xProfileUrl: req.body.xProfileUrl || '',
      xProfilePic: req.body.xProfilePic || '',
      websiteUrl: req.body.websiteUrl || '',
      notes: req.body.notes || '',
      showOnWebsite: req.body.showOnWebsite ?? false,
      websiteSection: req.body.websiteSection || '',
      isBitcoinKid: req.body.isBitcoinKid ?? false,
      dateAdded: req.body.dateAdded || new Date().toISOString().split('T')[0],
    };
    data.credits.push(credit);
    saveCredits(data);
    res.json({ success: true, credit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a credit
app.put('/api/credits/:id', (req, res) => {
  try {
    const data = loadCredits();
    const index = data.credits.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Credit not found' });
    }
    data.credits[index] = {
      ...data.credits[index],
      name: req.body.name ?? data.credits[index].name,
      email: req.body.email ?? data.credits[index].email,
      role: req.body.role ?? data.credits[index].role,
      lightningAddress: req.body.lightningAddress ?? data.credits[index].lightningAddress,
      nostrNpub: req.body.nostrNpub ?? data.credits[index].nostrNpub,
      nostrHex: req.body.nostrHex ?? data.credits[index].nostrHex,
      nostrProfilePic: req.body.nostrProfilePic ?? data.credits[index].nostrProfilePic,
      xProfileUrl: req.body.xProfileUrl ?? data.credits[index].xProfileUrl,
      xProfilePic: req.body.xProfilePic ?? data.credits[index].xProfilePic,
      websiteUrl: req.body.websiteUrl ?? data.credits[index].websiteUrl ?? '',
      notes: req.body.notes ?? data.credits[index].notes,
      showOnWebsite: req.body.showOnWebsite ?? data.credits[index].showOnWebsite ?? false,
      websiteSection: req.body.websiteSection ?? data.credits[index].websiteSection ?? '',
      isBitcoinKid: req.body.isBitcoinKid ?? data.credits[index].isBitcoinKid ?? false,
    };
    saveCredits(data);
    res.json({ success: true, credit: data.credits[index] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a credit
app.delete('/api/credits/:id', (req, res) => {
  try {
    const data = loadCredits();
    const index = data.credits.findIndex(c => c.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Credit not found' });
    }
    const deleted = data.credits.splice(index, 1)[0];
    saveCredits(data);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync credits to website (export only showOnWebsite: true entries)
app.post('/api/credits/sync', (req, res) => {
  try {
    const data = loadCredits();
    const sections = req.body.sections || ['Core Team', 'Contributor', 'Special Thanks'];

    // Filter credits that should appear on website and are in enabled sections
    const websiteCredits = data.credits.filter(c =>
      c.showOnWebsite && sections.includes(c.websiteSection)
    );

    // Helper to build credit object with link priority
    const buildCreditObj = (c, includeContribution = true, includeNote = false) => {
      const nostrUrl = c.nostrNpub ? `https://njump.me/${c.nostrNpub}` : '';
      const xUrl = c.xProfileUrl || '';
      const websiteUrl = c.websiteUrl || '';

      // Priority: websiteUrl > nostrUrl > xUrl
      const primaryUrl = websiteUrl || nostrUrl || xUrl;

      const obj = {
        name: c.name,
        url: primaryUrl,
        avatar: c.nostrProfilePic || c.xProfilePic || '',
        isBitcoinKid: c.isBitcoinKid || false,
        // Always include nostrUrl and xUrl for social icons
        nostrUrl: nostrUrl,
        xUrl: xUrl,
      };

      if (includeContribution) {
        obj.contribution = c.notes || '';
      }
      if (includeNote) {
        obj.note = c.notes || '';
      }

      return obj;
    };

    // Group by section
    const grouped = {
      coreTeam: websiteCredits
        .filter(c => c.websiteSection === 'Core Team')
        .map(c => buildCreditObj(c, true, false)),
      contributors: websiteCredits
        .filter(c => c.websiteSection === 'Contributor')
        .map(c => buildCreditObj(c, true, false)),
      specialThanks: websiteCredits
        .filter(c => c.websiteSection === 'Special Thanks')
        .map(c => buildCreditObj(c, false, true)),
    };

    // Ensure data directory exists
    const exportDir = path.dirname(CREDITS_EXPORT_FILE);
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    // Write to website data file
    fs.writeFileSync(CREDITS_EXPORT_FILE, JSON.stringify(grouped, null, 2));

    res.json({
      success: true,
      exported: {
        coreTeam: grouped.coreTeam.length,
        contributors: grouped.contributors.length,
        specialThanks: grouped.specialThanks.length,
      },
      path: 'src/data/credits.json',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Partners Endpoints ---

function loadPartners() {
  try {
    if (!fs.existsSync(PARTNERS_FILE)) {
      const dir = path.dirname(PARTNERS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(PARTNERS_FILE, JSON.stringify({ partners: [], schema_version: 1 }, null, 2));
    }
    return JSON.parse(fs.readFileSync(PARTNERS_FILE, 'utf-8'));
  } catch (err) {
    return { partners: [], schema_version: 1 };
  }
}

function savePartners(data) {
  const dir = path.dirname(PARTNERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PARTNERS_FILE, JSON.stringify(data, null, 2));
}

// Get all partners
app.get('/api/partners', (req, res) => {
  const data = loadPartners();
  res.json(data.partners);
});

// Add a new partner
app.post('/api/partners', (req, res) => {
  try {
    const data = loadPartners();
    const partner = {
      id: crypto.randomUUID(),
      name: req.body.name || '',
      description: req.body.description || '',
      websiteUrl: req.body.websiteUrl || '',
      logoUrl: req.body.logoUrl || '',
      nostrNpub: req.body.nostrNpub || '',
      nostrProfilePic: req.body.nostrProfilePic || '',
      xProfileUrl: req.body.xProfileUrl || '',
      xProfilePic: req.body.xProfilePic || '',
      section: req.body.section || '',
      showOnWebsite: req.body.showOnWebsite ?? false,
      dateAdded: req.body.dateAdded || new Date().toISOString().split('T')[0],
    };
    data.partners.push(partner);
    savePartners(data);
    res.json({ success: true, partner });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a partner
app.put('/api/partners/:id', (req, res) => {
  try {
    const data = loadPartners();
    const index = data.partners.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    data.partners[index] = {
      ...data.partners[index],
      name: req.body.name ?? data.partners[index].name,
      description: req.body.description ?? data.partners[index].description,
      websiteUrl: req.body.websiteUrl ?? data.partners[index].websiteUrl,
      logoUrl: req.body.logoUrl ?? data.partners[index].logoUrl,
      nostrNpub: req.body.nostrNpub ?? data.partners[index].nostrNpub,
      nostrProfilePic: req.body.nostrProfilePic ?? data.partners[index].nostrProfilePic,
      xProfileUrl: req.body.xProfileUrl ?? data.partners[index].xProfileUrl,
      xProfilePic: req.body.xProfilePic ?? data.partners[index].xProfilePic,
      section: req.body.section ?? data.partners[index].section,
      showOnWebsite: req.body.showOnWebsite ?? data.partners[index].showOnWebsite,
    };
    savePartners(data);
    res.json({ success: true, partner: data.partners[index] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a partner
app.delete('/api/partners/:id', (req, res) => {
  try {
    const data = loadPartners();
    const index = data.partners.findIndex(p => p.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    const deleted = data.partners.splice(index, 1)[0];
    savePartners(data);
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync partners to website
app.post('/api/partners/sync', (req, res) => {
  try {
    const data = loadPartners();

    // Filter partners that should appear on website
    const websitePartners = data.partners.filter(p => p.showOnWebsite);

    // Helper to build partner object
    const buildPartnerObj = (p) => {
      const nostrUrl = p.nostrNpub ? `https://njump.me/${p.nostrNpub}` : '';
      const xUrl = p.xProfileUrl || '';
      const websiteUrl = p.websiteUrl || '';
      const primaryUrl = websiteUrl || nostrUrl || xUrl;

      return {
        name: p.name,
        description: p.description || '',
        url: primaryUrl,
        logo: p.logoUrl || p.nostrProfilePic || p.xProfilePic || '',
        nostrUrl: websiteUrl && nostrUrl ? nostrUrl : '',
        xUrl: websiteUrl && xUrl ? xUrl : '',
      };
    };

    // Group by section
    const grouped = {
      educationPartners: websitePartners
        .filter(p => p.section === 'Education Partners')
        .map(buildPartnerObj),
      technologyPartners: websitePartners
        .filter(p => p.section === 'Technology Partners')
        .map(buildPartnerObj),
      appearances: websitePartners
        .filter(p => p.section === 'Appearances')
        .map(buildPartnerObj),
      inTheNews: websitePartners
        .filter(p => p.section === 'In the News')
        .map(buildPartnerObj),
    };

    // Ensure data directory exists
    const exportDir = path.dirname(PARTNERS_EXPORT_FILE);
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    // Write to website data file
    fs.writeFileSync(PARTNERS_EXPORT_FILE, JSON.stringify(grouped, null, 2));

    res.json({
      success: true,
      exported: {
        educationPartners: grouped.educationPartners.length,
        technologyPartners: grouped.technologyPartners.length,
        appearances: grouped.appearances.length,
        inTheNews: grouped.inTheNews.length,
      },
      path: 'src/data/partners.json',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Start Server ---

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n  🐷 LightningPiggy Admin`);
  console.log(`  ➜  http://localhost:${PORT}\n`);
  console.log(`  Project root: ${ROOT}`);
  console.log(`  Wild photos:  ${WILD_DIR}`);
  console.log(`  News posts:   ${NEWS_DIR}`);
  console.log(`  Credits:      ${CREDITS_FILE}`);
  console.log(`  Partners:     ${PARTNERS_FILE}`);
  console.log(`  Export to:    ${CREDITS_EXPORT_FILE}`);
  console.log(`  Partners to:  ${PARTNERS_EXPORT_FILE}\n`);
});
