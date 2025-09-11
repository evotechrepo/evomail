// mailer.js (ESM)
import nodemailer from 'nodemailer';
import fs from 'fs';

import { ImapFlow } from 'imapflow';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';



function bool(v, def=false){
  if (v === undefined || v === null || v === '') return def;
  return /^(1|true|yes|on)$/i.test(String(v));
}

// unified TLS builder for SMTP + IMAP
export function buildTls(host){
  const allowSelf =
    bool(process.env.IMAP_ALLOW_SELF_SIGNED, false) ||
    bool(process.env.SMTP_ALLOW_SELF_SIGNED, false);

  const caPref = process.env.IMAP_CA_PEM || process.env.SMTP_CA_PEM; // path OR inline PEM

  const tls = {
    minVersion: 'TLSv1.2',
    servername: host,               // SNI
    rejectUnauthorized: !allowSelf
  };

  if (caPref) {
    if (caPref.trim().startsWith('-----BEGIN CERTIFICATE-----')) {
      tls.ca = caPref;                  // inline PEM in env
    } else if (fs.existsSync(caPref)) {
      tls.ca = fs.readFileSync(caPref); // file path
    }
  }
  return tls;
}


// call this after each sendMail() batch
export async function saveToGmailSent({ from, to, cc, bcc, subject, html, text, attachments }) {
  // build a distinct Message-ID when requested
  const makeDistinct = (process.env.SENT_DISTINCT === '1');
  const fromAddr = (String(from || '').match(/<([^>]+)>/) || [])[1] || String(from || '').trim();
  const domain = (fromAddr.match(/@([^>]+)$/) || [])[1] || (process.env.MSGID_DOMAIN || 'evotechservice.com');
  const distinctMsgId = `<sentcopy.${Date.now()}.${Math.random().toString(16).slice(2)}@${domain}>`;

  const mc = new MailComposer({
    from, to, cc, bcc, subject, html, text, attachments,
    ...(makeDistinct ? { messageId: distinctMsgId } : {})
  });

  const raw = await mc.compile().build();

  const host = process.env.IMAP_HOST || 'imap.gmail.com';
  const port = Number(process.env.IMAP_PORT || 993);
  const user = process.env.IMAP_USER || process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS || process.env.SMTP_PASS;

  const client = new ImapFlow({
    host, port, secure: true,
    auth: { user, pass },
    tls: buildTls(host) // your unified TLS helper
  });

  await client.connect();
  try {
    const sentBox = process.env.IMAP_SENT || '[Gmail]/Sent Mail';
    await client.append(sentBox, raw); // no flags/date needed
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getTransport(){
  const mode = (process.env.SMTP_MODE || 'gmail_app').toLowerCase();
  let host, port, secure, auth, requireTLS;

  if (mode === 'gmail_relay') {
    // Google SMTP Relay (set up in Admin Console)
    host = process.env.SMTP_HOST || 'smtp-relay.gmail.com';
    port = Number(process.env.SMTP_PORT || 587);
    secure = false;                 // 587 uses STARTTLS
    requireTLS = true;
    auth = undefined;               // if your IP is whitelisted; otherwise set user/pass
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
    }
  } else {
    // Default: Gmail SMTP with App Password
    host = process.env.SMTP_HOST || 'smtp.gmail.com';
    port = Number(process.env.SMTP_PORT || 465);
    secure = (port === 465);
    requireTLS = !secure;           // on 587, force STARTTLS
    auth = (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined;
  }

  //console.log('[mailer] SMTP config -> host:', host, 'port:', port, 'secure:', secure, 'mode:', mode);

  const tx = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS,
    auth,
    tls: buildTls(host),
    connectionTimeout: Number(process.env.SMTP_CONN_TIMEOUT || 15000),
    greetingTimeout:   Number(process.env.SMTP_GREET_TIMEOUT || 15000),
    socketTimeout:     Number(process.env.SMTP_SOCKET_TIMEOUT || 20000),
  });

  // verify gives fast feedback in dev; it’s OK to keep in prod too
  await tx.verify();
  return tx;
}


