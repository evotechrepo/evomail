// src/services/mail_path.js
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

export function normalize_image_attachment(image_path) {
  if (!image_path) return { attachment: null, public_url: null };

  // If a full URL was stored, don't use it for attachment (avoid HTTP fetch)
  if (/^https?:\/\//i.test(image_path)) {
    return { attachment: null, public_url: image_path };
  }

  const uploadRoot = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

  // image_path like "/uploads/abc.jpg" or "uploads/abc.jpg"
  const rel = String(image_path).replace(/^\/+/, '');
  const underUploads = rel.startsWith('uploads/') ? rel.slice('uploads/'.length) : rel;
  const fsPath = path.join(uploadRoot, underUploads);

  let attachment = null;
  if (fs.existsSync(fsPath)) {
    const filename = path.basename(fsPath);
    const contentType = mime.lookup(filename) || 'application/octet-stream';
    attachment = { filename, path: fsPath, contentType };
  }

  // For clickable links in the HTML (optional)
  const public_url = publicBase ? `${publicBase}/uploads/${underUploads}` : null;

  return { attachment, public_url };
}


/* OLD FAILED IN PROD
// src/services/mail_path.js (ESM)
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

export function normalize_image_attachment(image_path) {
  if (!image_path) return { attachment: null, public_url: null };

  // Fully-qualified URL
  if (/^https?:\/\//i.test(image_path)) {
    const filename = path.basename(new URL(image_path).pathname) || 'mail-image';
    return {
      attachment: { filename, path: image_path, contentType: mime.lookup(filename) || 'application/octet-stream' },
      public_url: image_path
    };
  }

  // Web path (starts with "/"), e.g. "/uploads/abc.png"
  if (image_path.startsWith('/')) {
    // If your DB stores "/uploads/..." but your public path is "/evotechmail/server/uploads/..."
    const public_base = process.env.PUBLIC_BASE_URL || '';           // e.g. http://192.168.1.50/evotechmail/server
    const upload_root = process.env.UPLOAD_ROOT || '';               // e.g. E:\dev\XAMPP\htdocs\evotechmail\server

    // Build public URL: PUBLIC_BASE_URL + original image_path ("/uploads/..")
    const public_url = public_base ? `${public_base}${image_path}` : null;

    // Build filesystem path: UPLOAD_ROOT + original image_path
    let fs_path = upload_root ? path.join(upload_root, image_path) : null; // -> E:\...\server\uploads\abc.png
    if (fs_path && !fs.existsSync(fs_path)) fs_path = null;

    const filename = path.basename(image_path) || 'mail-image';
    const contentType = mime.lookup(filename) || 'application/octet-stream';

    if (fs_path) {
      return { attachment: { filename, path: fs_path, contentType }, public_url };
    }
    if (public_url) {
      // Let Nodemailer fetch via HTTP if the file isn’t visible on disk path
      return { attachment: { filename, path: public_url, contentType }, public_url };
    }
    return { attachment: { filename, path: image_path, contentType }, public_url: null };
  }

  // Absolute filesystem path
  const filename = path.basename(image_path) || 'mail-image';
  return {
    attachment: { filename, path: image_path, contentType: mime.lookup(filename) || 'application/octet-stream' },
    public_url: null
  };
}
*/
