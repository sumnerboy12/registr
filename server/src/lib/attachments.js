import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { dataDir } from '../db/index.js';

// Kept out of SQLite (see schema.sql's job_attachments) — one subfolder per
// job, filenames generated so two uploads with the same original name never
// collide.
export const attachmentsDir = path.join(dataDir, 'attachments');

function jobAttachmentDir(jobId) {
  return path.join(attachmentsDir, jobId);
}

export function attachmentFilePath(jobId, filename) {
  return path.join(jobAttachmentDir(jobId), filename);
}

const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = jobAttachmentDir(req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
  },
});

// No content-type whitelist — a jobsite might reasonably attach anything
// from a site photo to a signed PDF to a spreadsheet. Just capped on size.
export const uploadAttachment = multer({ storage, limits: { fileSize: MAX_ATTACHMENT_SIZE } }).single('file');
