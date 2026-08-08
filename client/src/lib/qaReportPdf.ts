import { api } from '../api/client';
import type { Client, Job } from '../types';
import { CHECKLIST_ITEM_STATUS_LABELS, CHECKLIST_STAGES, CHECKLIST_STAGE_LABELS, type ChecklistItemStatus } from '../types';
import { NO_CLIENT_COLOR } from '../lib/colors';

// A4 in points, jsPDF's own default unit for this doc.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
// Footer's own bottom margin — smaller than the page's main MARGIN (which
// still governs the left/right/top edges and the content area's floor).
const FOOTER_MARGIN = 30;
const FOOTER_TEXT_Y = PAGE_HEIGHT - FOOTER_MARGIN;
const FOOTER_LINE_Y = FOOTER_TEXT_Y - 16;
// Bottom of the usable content area — leaves room for the footer's
// separator line and text above it, so body content never overlaps it.
const CONTENT_BOTTOM = FOOTER_LINE_Y - 14;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// jsPDF draws with plain RGB — it can't resolve a CSS custom property like
// index.css's var(--text-dim)/var(--danger), so these mirror those
// variables' actual current values rather than reusing types.ts's
// CSS-var-based CHECKLIST_ITEM_STATUS_COLORS.
const STATUS_COLORS: Record<ChecklistItemStatus, [number, number, number]> = {
  open: hexToRgb('#9aa4bf'),
  in_progress: hexToRgb('#b8860b'),
  done: hexToRgb('#2e7d32'),
  not_done: hexToRgb('#e5484d'),
};

const CONTENT_TYPE_TO_FORMAT: Record<string, 'JPEG' | 'PNG' | 'WEBP'> = {
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WEBP',
};

async function loadImage(url: string): Promise<{ dataUrl: string; width: number; height: number; format: 'JPEG' | 'PNG' | 'WEBP' } | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const format = CONTENT_TYPE_TO_FORMAT[res.headers.get('content-type') ?? ''];
    if (!format) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = dataUrl;
    });
    return { dataUrl, width, height, format };
  } catch {
    return null;
  }
}

// Fetches everything the report needs (non-internal checklist items and
// their image-only attachments — internal items are left out entirely, not
// shown or counted, since this is customer-facing) and builds the PDF
// natively with jsPDF's own drawing/text APIs — no html2canvas/DOM
// rendering step, so there's no giant-screenshot-sliced-across-pages
// artifacting, page breaks land cleanly between items, and a consistent
// footer can be stamped onto every page afterwards.
export async function downloadQaReportPdf(job: Job, client: Client | undefined) {
  const items = (await api.getJobChecklist(job.id)).filter((i) => !i.internal);
  const withAttachments = items.filter((i) => i.attachment_count > 0);
  const entries = await Promise.all(
    withAttachments.map(async (i) => {
      const attachments = await api.getChecklistItemAttachments(job.id, i.id);
      return [i.id, attachments.filter((a) => a.content_type.startsWith('image/'))] as const;
    })
  );
  const imagesByItem = Object.fromEntries(entries.filter(([, imgs]) => imgs.length > 0)) as Record<
    number,
    Awaited<ReturnType<typeof api.getChecklistItemAttachments>>
  >;

  const { default: jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > CONTENT_BOTTOM) {
      pdf.addPage();
      y = MARGIN;
    }
  };

  // fixedWidth lets every status pill in the list share one width (sized to
  // the longest status label — see statusPillWidth below) so item names
  // start at the same x regardless of which status a given row has, rather
  // than each pill hugging its own text and risking the name overlapping a
  // wide one like "In Progress".
  const drawPill = (
    text: string,
    x: number,
    color: [number, number, number],
    opts: { textColor?: [number, number, number]; fixedWidth?: number } = {}
  ) => {
    const { textColor = [255, 255, 255], fixedWidth } = opts;
    const height = 15;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    const label = text.toUpperCase();
    const textWidth = pdf.getTextWidth(label);
    const width = fixedWidth ?? textWidth + 16;
    pdf.setFillColor(...color);
    pdf.roundedRect(x, y, width, height, height / 2, height / 2, 'F');
    pdf.setTextColor(...textColor);
    pdf.text(label, x + (width - textWidth) / 2, y + height / 2 + 3);
    pdf.setTextColor(20, 20, 20);
    pdf.setFont('helvetica', 'normal');
    return width;
  };

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(20, 20, 20);
  pdf.text(`QA Report — ${job.name}`, MARGIN, y);
  y += 13;

  // Subline: client pill · code · site address
  const clientLabel = client?.name ?? job.client_name ?? 'No client';
  const clientColor = hexToRgb(client?.color ?? NO_CLIENT_COLOR);
  const pillWidth = drawPill(clientLabel, MARGIN, clientColor);
  pdf.setFontSize(11);
  pdf.setTextColor(90, 90, 90);
  let sublineText = job.code;
  if (job.site_address) sublineText += `  ·  ${job.site_address}`;
  pdf.text(sublineText, MARGIN + pillWidth + 10, y + 11);
  y += 42;

  if (items.length === 0) {
    pdf.setFontSize(12);
    pdf.setTextColor(90, 90, 90);
    pdf.text('No checklist items.', MARGIN, y);
  }

  // One shared width for every status pill (sized to the longest label,
  // "In Progress") so item names all start at the same x regardless of
  // status, and never overlap a pill whose own text happened to be wider.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  const statusPillWidth = Math.max(...Object.values(CHECKLIST_ITEM_STATUS_LABELS).map((l) => pdf.getTextWidth(l.toUpperCase()))) + 16;
  const itemLabelX = MARGIN + statusPillWidth + 10;

  for (const stage of CHECKLIST_STAGES) {
    const stageItems = items.filter((i) => i.stage === stage).sort((a, b) => a.sequence - b.sequence);
    if (stageItems.length === 0) continue;

    ensureSpace(28);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(20, 20, 20);
    pdf.text(CHECKLIST_STAGE_LABELS[stage], MARGIN, y);
    y += 4;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(MARGIN, y, MARGIN + CONTENT_WIDTH, y);
    y += 15;

    for (const item of stageItems) {
      const statusLabel = CHECKLIST_ITEM_STATUS_LABELS[item.status];
      pdf.setFontSize(10);
      const labelLines = pdf.splitTextToSize(item.label, CONTENT_WIDTH - (statusPillWidth + 10));
      const noteLines = item.notes ? pdf.splitTextToSize(item.notes, CONTENT_WIDTH - 12) : [];
      const images = imagesByItem[item.id] ?? [];

      // A page break can still land between an item's label and its notes/
      // images if the whole thing doesn't fit even on a fresh page — that's
      // fine (matches how any long document paginates); this just avoids
      // splitting when it *would* otherwise fit on one page.
      ensureSpace(Math.max(15, labelLines.length * 13) + 6);

      const rowTop = y;
      drawPill(statusLabel, MARGIN, STATUS_COLORS[item.status], { fixedWidth: statusPillWidth });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(20, 20, 20);
      labelLines.forEach((line: string, i: number) => {
        pdf.text(line, itemLabelX, rowTop + 11 + i * 13);
      });
      // y here becomes the *baseline* for whatever's drawn next (pdf.text
      // positions by baseline, not top) — a small gap looks right for
      // shape-to-shape spacing but a text line's own ascent (~8pt at 10pt)
      // eats into it, which is what put the first note line's glyphs up
      // inside the pill/label row above.
      y = rowTop + Math.max(15, labelLines.length * 13) + 16;

      if (noteLines.length > 0) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(60, 60, 60);
        for (const line of noteLines) {
          ensureSpace(13);
          pdf.text(line, MARGIN + 4, y);
          y += 13;
        }
      }

      if (images.length > 0) {
        const maxSize = 130;
        const gap = 8;
        let x = MARGIN;
        let rowHeight = 0;
        ensureSpace(maxSize);
        for (const attachment of images) {
          const loaded = await loadImage(`/api/v1/jobs/${job.id}/checklist/${item.id}/attachments/${attachment.id}`);
          if (!loaded) continue;
          const scale = Math.min(maxSize / loaded.width, maxSize / loaded.height, 1);
          const w = loaded.width * scale;
          const h = loaded.height * scale;
          if (x + w > MARGIN + CONTENT_WIDTH) {
            x = MARGIN;
            y += rowHeight + gap;
            rowHeight = 0;
            ensureSpace(maxSize);
          }
          pdf.addImage(loaded.dataUrl, loaded.format, x, y, w, h);
          x += w + gap;
          rowHeight = Math.max(rowHeight, h);
        }
        y += rowHeight + 8;
      }

      y += 6;
    }
    y += 12;
  }

  // Footer, stamped on every page once the content (and so the final page
  // count) is settled — not doable inline while paginating, since jsPDF
  // only knows how many pages exist after the fact.
  const generatedAt = new Date().toLocaleString();
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(220, 220, 220);
    pdf.line(MARGIN, FOOTER_LINE_Y, PAGE_WIDTH - MARGIN, FOOTER_LINE_Y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Generated ${generatedAt}`, MARGIN, FOOTER_TEXT_Y);
    pdf.text('Wayman Roofing', PAGE_WIDTH / 2, FOOTER_TEXT_Y, { align: 'center' });
    pdf.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_TEXT_Y, { align: 'right' });
  }

  pdf.save(`QA Report - ${job.code} - ${job.name}.pdf`);
}
