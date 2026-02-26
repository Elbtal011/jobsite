const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { pool } = require('../db');
const { appState } = require('../state');
const { validateCsrf } = require('../middleware/csrf');
const { getJobs, getJobBySlug } = require('../jobs');
const { sendContactNotification } = require('../utils/mailer');

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Zu viele Anfragen. Bitte später erneut versuchen.',
});

const navItems = [
  { href: '/index.php', label: 'Startseite' },
  { href: '/Unternehmen', label: 'Unternehmen' },
  { href: '/Fachgebiete', label: 'Fachgebiete' },
  { href: '/Bewerbung', label: 'Karriere & Stellen' },
  { href: '/Kontakt', label: 'Kontakt / Kundendienst' },
];

function buildFormPayload(body = {}) {
  const payload = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === '_csrf' || key === 'website') {
      continue;
    }
    payload[key] = typeof value === 'string' ? value.trim() : value;
  }
  return payload;
}

function renderPage(res, view, pageData = {}) {
  res.render(view, {
    navItems,
    pageData,
  });
}

router.get('/', (req, res) => {
  renderPage(res, 'pages/home', { currentPath: '/index.php' });
});

router.get('/index.php', (req, res) => {
  renderPage(res, 'pages/home', { currentPath: '/index.php' });
});

router.get('/Unternehmen', (req, res) => {
  renderPage(res, 'pages/unternehmen', { currentPath: '/Unternehmen' });
});

router.get('/Fachgebiete', (req, res) => {
  renderPage(res, 'pages/fachgebiete', { currentPath: '/Fachgebiete' });
});

router.get('/Bewerbung', async (req, res) => {
  const jobs = await getJobs();
  renderPage(res, 'pages/bewerbung', { currentPath: '/Bewerbung', jobs });
});

router.get('/Bewerbung/:slug', async (req, res) => {
  const job = await getJobBySlug(req.params.slug);
  if (!job) {
    return res.status(404).render('pages/404', { pageData: { currentPath: req.path } });
  }
  return renderPage(res, 'pages/bewerbung-detail', { currentPath: '/Bewerbung', job });
});

router.get('/Kontakt', (req, res) => {
  renderPage(res, 'pages/kontakt', { currentPath: '/Kontakt' });
});

router.get('/Datenschutz', (req, res) => {
  renderPage(res, 'pages/datenschutz', { currentPath: '/Datenschutz' });
});

router.get('/Impressum', (req, res) => {
  renderPage(res, 'pages/impressum', { currentPath: '/Impressum' });
});

router.post('/api/leads/contact', submitLimiter, validateCsrf, async (req, res) => {
  if (!appState.dbAvailable) {
    return res.status(503).send('Datenbank aktuell nicht verfügbar. Bitte später erneut versuchen.');
  }

  const { full_name, name, email, phone, subject, message, source_page, website } = req.body;

  if (website) {
    return res.redirect('/Kontakt?ok=1');
  }

  const contactName = (full_name || name || '').trim();
  const contactEmail = (email || '').trim().toLowerCase();
  const contactPhone = (phone || '').trim();
  const mergedMessage = [subject ? `Betreff: ${subject.trim()}` : '', message ? message.trim() : '']
    .filter(Boolean)
    .join('\n\n');

  if (!contactName || !contactEmail || !mergedMessage) {
    return res.status(400).send('Bitte alle Pflichtfelder ausfüllen.');
  }

  const formPayload = buildFormPayload(req.body);
  await pool.query(
    `INSERT INTO leads (type, full_name, email, phone, message, source_page, form_payload)
     VALUES ('contact', $1, $2, $3, $4, $5, $6)`,
    [contactName, contactEmail, contactPhone || null, mergedMessage, source_page || '/Kontakt', formPayload]
  );

  try {
    await sendContactNotification({
      name: contactName,
      email: contactEmail,
      phone: contactPhone || '',
      subject: subject ? subject.trim() : '',
      message: mergedMessage,
      sourcePage: source_page || '/Kontakt',
    });
  } catch (mailError) {
    console.error('Kontakt-E-Mail konnte nicht gesendet werden:', mailError.message);
  }

  return res.redirect('/Kontakt?ok=1');
});

router.post('/api/leads/application', submitLimiter, validateCsrf, async (req, res) => {
  if (!appState.dbAvailable) {
    return res.status(503).send('Datenbank aktuell nicht verfügbar. Bitte später erneut versuchen.');
  }

  const {
    full_name,
    name,
    first_name,
    last_name,
    email,
    email_address,
    phone,
    mobile,
    mobilnummer,
    birth_date,
    dob,
    message,
    address,
    zip,
    city,
    country,
    nationality,
    password1,
    password2,
    source_page,
    website,
  } = req.body;

  if (website) {
    const redirectTarget =
      typeof source_page === 'string' && source_page.startsWith('/') ? source_page.trim() : '/Bewerbung';
    return res.redirect(`${redirectTarget}${redirectTarget.includes('?') ? '&' : '?'}ok=1`);
  }

  const applicantName =
    (full_name && full_name.trim()) ||
    (name && name.trim()) ||
    [first_name, last_name].filter(Boolean).join(' ').trim();
  const applicantEmail = (email || email_address || '').trim().toLowerCase();
  const applicantPhone = (phone || mobile || mobilnummer || '').trim();
  const applicantBirthDate = birth_date || dob;

  if ((password1 || password2) && password1 !== password2) {
    return res.status(400).send('Passwörter stimmen nicht überein.');
  }

  if (!applicantName || !applicantEmail || !applicantBirthDate) {
    return res.status(400).send('Bitte alle Pflichtfelder ausfüllen.');
  }

  const details = [];
  if (address) details.push(`Anschrift: ${address.trim()}`);
  if (zip) details.push(`Postleitzahl: ${zip.trim()}`);
  if (city) details.push(`Stadt / Ort: ${city.trim()}`);
  if (country || nationality) details.push(`Staatsangehörigkeit: ${(country || nationality).trim()}`);
  const mergedMessage = [message?.trim() || '', details.length ? details.join('\n') : ''].filter(Boolean).join('\n\n');

  const formPayload = buildFormPayload(req.body);
  await pool.query(
    `INSERT INTO leads (type, full_name, email, phone, message, birth_date, source_page, form_payload)
     VALUES ('application', $1, $2, $3, $4, $5, $6, $7)`,
    [
      applicantName,
      applicantEmail,
      applicantPhone || null,
      mergedMessage || null,
      applicantBirthDate,
      source_page || '/Bewerbung',
      formPayload,
    ]
  );

  const redirectTarget = typeof source_page === 'string' && source_page.startsWith('/') ? source_page.trim() : '/Bewerbung';
  return res.redirect(`${redirectTarget}${redirectTarget.includes('?') ? '&' : '?'}ok=1`);
});

router.post('/api/leads/newsletter', submitLimiter, validateCsrf, async (req, res) => {
  if (!appState.dbAvailable) {
    return res.status(503).send('Datenbank aktuell nicht verfügbar. Bitte später erneut versuchen.');
  }

  const { newsletter_mail, source_page, website } = req.body;
  if (website) {
    return res.redirect((source_page || '/index.php') + '?ok=1');
  }

  const email = (newsletter_mail || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).send('Bitte E-Mail-Adresse angeben.');
  }

  const formPayload = buildFormPayload(req.body);
  await pool.query(
    `INSERT INTO leads (type, full_name, email, message, source_page, form_payload)
     VALUES ('contact', $1, $2, $3, $4, $5)`,
    ['Newsletter Anmeldung', email, 'Newsletter Anmeldung über Footer-Formular', source_page || '/index.php', formPayload]
  );

  return res.redirect((source_page || '/index.php') + '?ok=1');
});

module.exports = { publicRouter: router, navItems };
