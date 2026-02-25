require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const session = require('express-session');
const { initDb } = require('./initDb');
const { ensureCsrfToken } = require('./middleware/csrf');
const { publicRouter } = require('./routes/public');
const { adminRouter } = require('./routes/admin');
const { chatRouter } = require('./routes/chat');
const { accountRouter } = require('./routes/account');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change_me')) {
  throw new Error('SESSION_SECRET must be set to a strong value in production.');
}

if (isProd && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) {
  throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be configured in production.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    name: 'ha.sid',
    secret: process.env.SESSION_SECRET || 'change_me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);
app.use(ensureCsrfToken);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  res.locals.query = req.query;
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', chatRouter);
app.use('/', accountRouter);
app.use('/', publicRouter);
app.use('/admin666', adminRouter);
app.get('/admin', (_req, res) => {
  res.redirect('/admin666/login');
});

app.use((req, res) => {
  res.status(404).render('pages/404', { pageData: { currentPath: req.path } });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send('Ein Fehler ist aufgetreten.');
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Startup fehlgeschlagen:', err);
  process.exit(1);
});
