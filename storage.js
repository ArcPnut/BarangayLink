require('dotenv').config();
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'uploads';
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };
const TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };

// Vercel rejects request bodies over 4.5 MB, so files are limited to 4 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED[file.mimetype]) {
      return cb(new Error('Only JPG, PNG or PDF files are allowed.'));
    }
    cb(null, true);
  }
});

let client;
function bucket() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client.storage.from(BUCKET);
}

// stores a file and returns its key, for example "ids/3f2a....jpg"
async function saveFile(folder, file) {
  const key = folder + '/' + crypto.randomUUID() + ALLOWED[file.mimetype];
  const { error } = await bucket().upload(key, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) throw new Error('Could not store the file: ' + error.message);
  return key;
}

async function removeFile(key) {
  if (!key) return;
  const { error } = await bucket().remove([key]);
  if (error) console.error('Could not remove file:', error.message);
}

// sends a stored file to the browser
async function sendStoredFile(res, key) {
  if (!key) return res.status(404).send('No file.');
  const { data, error } = await bucket().download(key);
  if (error || !data) return res.status(404).send('File not found.');
  const ext = key.slice(key.lastIndexOf('.')).toLowerCase();
  res.set('Content-Type', TYPES[ext] || 'application/octet-stream');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(await data.arrayBuffer()));
}

module.exports = { upload, saveFile, removeFile, sendStoredFile };