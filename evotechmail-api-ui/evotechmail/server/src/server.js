// server/src/server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'path';

import authRouter from './services/auth.js';
import scanRouter from './services/scan.js';
import evomailRouter from './services/routes-evomail.js';
import { requireAuth } from './middleware/requireAuth.js';
import reportsRouter from './services/reports.js';
import adminRouter from './services/admin.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import driveRouter from './services/drive.js';


const app = express();

app.set('trust proxy', 1); // so secure cookies & redirects behave correctly
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// session for Google OAuth tokens (use a store in prod)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

// If UI is same origin through Apache, cors is optional; if not, enable with credentials:
// app.use(cors({ origin: true, credentials: true }));
//app.use(cors());
app.use(cors({ origin: true, credentials: true }));


// UTF-8 middleware for common text types
app.use((req, res, next) => {
  const setType = res.type.bind(res);
  res.type = (t) => setType(`${t}; charset=utf-8`);
  next();
});

// Health (bare) — covers proxies that strip the prefix
app.get('/health', (_req, res) => res.json({ ok:true }));
// Health (prefixed) — covers direct calls and non‑stripping proxies
app.get('/evotechmail/api/health', (_req, res) => res.json({ ok:true }));


// Replace your current /me routes with this:
// User (uses requireAuth so the user is complete)
app.get('/evotechmail/api/me', requireAuth, (req, res) => {
  const { display_name, role_cd, email } = req.user;
  res.json({ signedIn: true, display_name, role_cd, email });
});

app.get('/me', requireAuth, (req, res) => {
  const { display_name, role_cd, email } = req.user;
  res.json({ signedIn: true, display_name, role_cd, email });
});


// auth
app.use('/evotechmail/api/auth', authRouter);
app.use('/auth'                , authRouter); // handles stripped proxies

// protected API
app.use('/evotechmail/api', requireAuth, evomailRouter);
app.use('/'               , requireAuth, evomailRouter);  // handles stripped proxies

//Scan
app.use('/evotechmail/api/scan', requireAuth, scanRouter);
app.use('/scan'                , requireAuth, scanRouter);

//Reports
app.use('/evotechmail/api/reports', requireAuth, requireAdmin, reportsRouter);
app.use('/reports'                , requireAuth, requireAdmin, reportsRouter);

//Admin
app.use('/evotechmail/api/admin', requireAuth, requireAdmin, adminRouter);
app.use('/admin'                , requireAuth, requireAdmin, adminRouter);

//Uploads
const uploadDir = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
app.use('/uploads', requireAuth, express.static(uploadDir));

const publicDir = path.resolve(process.cwd(), 'public');
app.use('/evotechmail', requireAuth, express.static(publicDir));


// Javascript - server.js
app.use('/evotechmail/js', express.static(path.resolve(process.cwd(), 'public/js')));


// Pages (HTML). Adjust sendFile paths to actual files.
app.get('/evotechmail/admin',  requireAuth, requireAdmin, (req, res) => res.sendFile(path.resolve(process.cwd(), 'public/admin.html')));
//app.get('/admin',  requireAuth, requireAdmin, (req, res) => res.sendFile(path.resolve(process.cwd(), 'public/admin.html')));

app.get('/evotechmail/reports', requireAuth, requireAdmin, (req, res) => res.sendFile(path.resolve(process.cwd(), 'public/reporting.html')));
//app.get('/reports', requireAuth, requireAdmin, (req, res) => res.sendFile(path.resolve(process.cwd(), 'public/reporting.html')));

app.get('/evotechmail/email-utility', requireAuth, requireAdmin, (req, res) => res.sendFile(path.resolve(process.cwd(), 'public/mail.html')));
//app.get('/email-utility', requireAuth, requireAdmin, (req, res) => res.sendFile(path.resolve(process.cwd(), 'public/mail.html')));


// --- Google Drive routes (mounted under API + unprefixed for stripped proxies)
app.use('/evotechmail/api/drive', driveRouter);
app.use('/drive', driveRouter);

const PORT = Number(process.env.PORT || 3000);
//1 - //'127.0.0.1';   changed to 0.0.0.0 so I can access from other network devices
//2 - in powershell as an admin -> netsh advfirewall firewall add rule name="Node.js 3000" dir=in action=allow protocol=TCP localport=3000
const HOST = process.env.HOST || '0.0.0.0';  
app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});
