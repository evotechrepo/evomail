// services/mailer-util.js
import { randomUUID } from 'crypto';
import { getTransport, saveToGmailSent } from './mailer.js';
import { logEmailAttempt } from './notifications.js';

const LOGO_CID = 'evo-logo';
const haveLogo = false;   // set true if you bundle a logo file
const logoPath = null;    // path to your logo file

export async function sendSystemMail({
  to, cc, bcc, subject, html, text, context, createUser='web',
  attachments // ← NEW: allow caller to pass attachments (array or single object)
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const batchId = randomUUID();
  const attemptNo = 1;

  const tx = await getTransport();
  const normList = v => Array.isArray(v)
    ? v
    : (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : []);

  const toList  = normList(to);
  const ccList  = normList(cc);
  const bccList = normList(bcc);

  // Prepare attachments
  const baseAttachments = haveLogo ? [{
    filename: 'evo.png',
    path: logoPath,
    cid: LOGO_CID,
    contentType: 'image/png',
    contentDisposition: 'inline'
  }] : [];

  // Normalize caller attachments
  const extraAttachments = Array.isArray(attachments)
    ? attachments.filter(Boolean)
    : (attachments ? [attachments] : []);

  // Merge
  const allAttachments = [...baseAttachments, ...extraAttachments];

  // Replace logo references with cid
  let htmlwithcid = String(html || '');
  htmlwithcid = htmlwithcid.split('assets/evo.png').join(`cid:${LOGO_CID}`);

  const bodyToStore = htmlwithcid || text || '';

  // BCC batching support
  const maxBcc = Number(process.env.BCC_BATCH || 85);
  const batches = bccList.length
    ? Array.from({ length: Math.ceil(bccList.length / maxBcc) }, (_, i) => bccList.slice(i * maxBcc, (i + 1) * maxBcc))
    : [null];

  for (const batch of batches) {
    const began = Date.now();
    let info = null;
    let imapInfo = null;
    let status = 'SUCCESS';
    let errMsg = null;

    try {
      info = await tx.sendMail({
        from,
        to: toList.length ? toList : undefined,
        cc: ccList.length ? ccList : undefined,
        bcc: batch || undefined,
        subject,
        html: htmlwithcid,
        text,
        attachments: allAttachments.length ? allAttachments : undefined
      });

      if (process.env.SAVE_TO_SENT === '1') {
        try {
          await saveToGmailSent({
            from,
            to: toList, cc: ccList, bcc: batch || undefined,
            subject, html: htmlwithcid, text,
            attachments: allAttachments.length ? allAttachments : undefined
          });
          imapInfo = { appended: true, folder: process.env.IMAP_SENT || '[Gmail]/Sent Mail' };
        } catch (e) {
          imapInfo = { appended: false, error: e?.message || String(e), code: e?.code || null };
          console.warn('IMAP append failed:', e?.code || e?.message || e);
        }
      }

    } catch (e) {
      status = 'FAILED';
      errMsg = e?.message || String(e);
      info = info || { accepted: [], rejected: [], response: e?.response };
    }

    const durationMs = Date.now() - began;

    await logEmailAttempt({
      batchId, attemptNo, from, subject,
      toList, ccList, bccBatch: batch || [],
      body: bodyToStore,
      attachmentsCount: allAttachments.length,   // ← log actual count
      provider: process.env.SMTP_MODE || 'gmail',
      host: tx.options?.host || 'smtp.gmail.com',
      port: tx.options?.port || Number(process.env.SMTP_PORT || 465),
      authUser: process.env.SMTP_USER,
      messageId: info?.messageId || null,
      durationMs,
      smtpAccepted: info?.accepted || [],
      smtpRejected: info?.rejected || [],
      smtpResponse: info?.response || (errMsg ? `ERROR: ${errMsg}` : null),
      imapInfo,
      status,
      context,
      createUser
    });

    if (status === 'FAILED') {
      throw new Error(`SMTP failed: ${errMsg}`);
    }
  }

  return { ok:true, batchId };
}
