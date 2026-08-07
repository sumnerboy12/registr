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

// Same pattern, one level deeper — a checklist item's own attachments (see
// schema.sql's job_checklist_item_attachments), keyed by job id (folder
// grouping, matches the rest of the job's attachments on disk) and item id.
function checklistItemAttachmentDir(jobId, itemId) {
  return path.join(jobAttachmentDir(jobId), 'checklist', String(itemId));
}

export function checklistItemAttachmentFilePath(jobId, itemId, filename) {
  return path.join(checklistItemAttachmentDir(jobId, itemId), filename);
}

const checklistItemStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = checklistItemAttachmentDir(req.params.id, req.params.itemId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
  },
});

export const uploadChecklistItemAttachment = multer({
  storage: checklistItemStorage,
  limits: { fileSize: MAX_ATTACHMENT_SIZE },
}).single('file');
