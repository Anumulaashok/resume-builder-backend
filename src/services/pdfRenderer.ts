import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFArray,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFPage,
  PDFString,
  rgb,
} from 'pdf-lib';
import {
  PreparedResume,
  PreparedSection,
  prepareExportableResume,
  sanitizeText,
} from './exportService';
import {
  extractStructuredItem,
  FontFamilyCategory,
  ResolvedExportTheme,
  resolveExportTheme,
  RgbColor,
} from './pdfTemplateConfig';

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;

interface FontAssetBundle {
  sansRegular: Uint8Array;
  sansBold: Uint8Array;
  serifRegular: Uint8Array;
  serifBold: Uint8Array;
  monoRegular: Uint8Array;
  monoBold: Uint8Array;
}

interface EmbeddedFontSet {
  sans: { regular: PDFFont; bold: PDFFont; charSet: Set<number> };
  serif: { regular: PDFFont; bold: PDFFont; charSet: Set<number> };
  mono: { regular: PDFFont; bold: PDFFont; charSet: Set<number> };
}

let cachedFontAssets: FontAssetBundle | null = null;

function resolveFontAssetPath(filename: string): string {
  const candidates = [
    path.resolve(__dirname, '../assets/fonts', filename),
    path.resolve(__dirname, '../../src/assets/fonts', filename),
    path.resolve(process.cwd(), 'dist/assets/fonts', filename),
    path.resolve(process.cwd(), 'src/assets/fonts', filename),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Bundled Unicode font asset not found: ${filename}`);
}

function loadFontAssets(): FontAssetBundle {
  if (cachedFontAssets) {
    return cachedFontAssets;
  }
  cachedFontAssets = {
    sansRegular: fs.readFileSync(resolveFontAssetPath('DejaVuSans.ttf')),
    sansBold: fs.readFileSync(resolveFontAssetPath('DejaVuSans-Bold.ttf')),
    serifRegular: fs.readFileSync(resolveFontAssetPath('DejaVuSerif.ttf')),
    serifBold: fs.readFileSync(resolveFontAssetPath('DejaVuSerif-Bold.ttf')),
    monoRegular: fs.readFileSync(resolveFontAssetPath('DejaVuSansMono.ttf')),
    monoBold: fs.readFileSync(resolveFontAssetPath('DejaVuSansMono-Bold.ttf')),
  };
  return cachedFontAssets;
}

async function embedThemeFonts(
  pdfDoc: PDFDocument,
  theme: ResolvedExportTheme
): Promise<EmbeddedFontSet> {
  pdfDoc.registerFontkit(fontkit);
  const assets = loadFontAssets();

  const needed = new Set<FontFamilyCategory>([
    theme.headingFontCategory,
    theme.bodyFontCategory,
  ]);
  if (theme.templateId === 'developer') {
    needed.add('mono');
  }

  const sansPair = {
    regular: await pdfDoc.embedFont(assets.sansRegular, { subset: true }),
    bold: await pdfDoc.embedFont(assets.sansBold, { subset: true }),
    charSet: new Set<number>(),
  };
  sansPair.charSet = new Set<number>(sansPair.regular.getCharacterSet());

  const serifPair = needed.has('serif')
    ? {
        regular: await pdfDoc.embedFont(assets.serifRegular, { subset: true }),
        bold: await pdfDoc.embedFont(assets.serifBold, { subset: true }),
        charSet: new Set<number>(),
      }
    : sansPair;
  if (serifPair !== sansPair) {
    serifPair.charSet = new Set<number>(serifPair.regular.getCharacterSet());
  }

  const monoPair = needed.has('mono')
    ? {
        regular: await pdfDoc.embedFont(assets.monoRegular, { subset: true }),
        bold: await pdfDoc.embedFont(assets.monoBold, { subset: true }),
        charSet: new Set<number>(),
      }
    : sansPair;
  if (monoPair !== sansPair) {
    monoPair.charSet = new Set<number>(monoPair.regular.getCharacterSet());
  }

  return {
    sans: sansPair,
    serif: serifPair,
    mono: monoPair,
  };
}

function sanitizeForFont(text: string, charSet: Set<number>): string {
  if (!text) return '';
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (cp === 0x09 || cp === 0x20) {
      out += ' ';
      continue;
    }
    if (cp < 0x20) continue;
    if (charSet.has(cp)) {
      out += ch;
    } else if (cp === 0x2022 || cp === 0x25cf) {
      out += charSet.has(0x2022) ? '•' : '-';
    } else if (cp === 0x2013 || cp === 0x2014) {
      out += '-';
    }
  }
  return out;
}

function measureWidth(
  font: PDFFont,
  charSet: Set<number>,
  rawText: string,
  size: number
): number {
  const safe = sanitizeForFont(rawText, charSet);
  if (!safe) return 0;
  return font.widthOfTextAtSize(safe, size);
}

function breakLongToken(
  token: string,
  font: PDFFont,
  charSet: Set<number>,
  size: number,
  maxWidth: number
): string[] {
  const safe = sanitizeForFont(token, charSet);
  if (!safe) return [];
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return [safe];

  const chunks: string[] = [];
  let current = '';
  for (const ch of safe) {
    const candidate = current + ch;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapTextLines(
  rawText: string,
  font: PDFFont,
  charSet: Set<number>,
  size: number,
  maxWidth: number
): string[] {
  const safeText = sanitizeForFont(rawText, charSet);
  if (!safeText.trim()) return [];

  const paragraphs = safeText.split(/\r?\n/);
  const lines: string[] = [];
  const safeMaxWidth = Math.max(40, maxWidth);

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= safeMaxWidth) {
        currentLine = candidate;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }
        if (font.widthOfTextAtSize(word, size) <= safeMaxWidth) {
          currentLine = word;
        } else {
          const broken = breakLongToken(word, font, charSet, size, safeMaxWidth);
          for (let i = 0; i < broken.length - 1; i += 1) {
            lines.push(broken[i]);
          }
          currentLine = broken[broken.length - 1] || '';
        }
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

function addPdfExternalLinkAnnotation(
  pdfDoc: PDFDocument,
  page: PDFPage,
  rect: { x: number; y: number; width: number; height: number },
  href: string
): void {
  if (!href || rect.width <= 0 || rect.height <= 0) return;

  const linkAnnot = pdfDoc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0],
    A: {
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of(href),
    },
  });
  const linkRef = pdfDoc.context.register(linkAnnot);

  const existingAnnots = page.node.lookup(PDFName.of('Annots'));
  if (existingAnnots instanceof PDFArray) {
    existingAnnots.push(linkRef);
  } else {
    const arr = pdfDoc.context.obj([linkRef]);
    page.node.set(PDFName.of('Annots'), arr);
  }
}

interface ColumnCursor {
  pageIndex: number;
  x: number;
  width: number;
  topY: number;
  bottomY: number;
  cursorY: number;
  onDarkSidebar: boolean;
}

interface PdfLayoutContext {
  pdfDoc: PDFDocument;
  pages: PDFPage[];
  theme: ResolvedExportTheme;
  fonts: EmbeddedFontSet;
  drawPageDecorations: (page: PDFPage, pageIndex: number) => void;
}

function getPage(ctx: PdfLayoutContext, index: number): PDFPage {
  while (ctx.pages.length <= index) {
    const newPage = ctx.pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const newIdx = ctx.pages.length;
    ctx.pages.push(newPage);
    ctx.drawPageDecorations(newPage, newIdx);
  }
  return ctx.pages[index];
}

function ensureVerticalSpace(
  ctx: PdfLayoutContext,
  col: ColumnCursor,
  neededHeight: number
): PDFPage {
  if (col.cursorY - neededHeight < col.bottomY) {
    col.pageIndex += 1;
    const nextPage = getPage(ctx, col.pageIndex);
    col.cursorY = A4_HEIGHT_PT - ctx.theme.pageMarginPt;
    return nextPage;
  }
  return getPage(ctx, col.pageIndex);
}

function toPdfRgb(c: RgbColor) {
  return rgb(c.r, c.g, c.b);
}

function drawSectionHeading(
  ctx: PdfLayoutContext,
  col: ColumnCursor,
  rawTitle: string
): void {
  const { theme, fonts } = ctx;
  const headingPair = fonts[theme.headingFontCategory];
  const fontSize = Number((theme.baseFontSizePt * 1.12).toFixed(2));
  const lineH = fontSize * 1.3;
  const style = theme.headingStyle;
  const titleText =
    style === 'caps' || style === 'pill' || style === 'side-label'
      ? rawTitle.toUpperCase()
      : rawTitle;
  const safeTitle = sanitizeForFont(titleText, headingPair.charSet);
  if (!safeTitle) return;

  // Ensure space for heading + at least 2 lines of upcoming content to prevent orphaned headings
  const page = ensureVerticalSpace(ctx, col, lineH + theme.baseFontSizePt * 2.8);

  const headingColor = col.onDarkSidebar ? rgb(1, 1, 1) : toPdfRgb(theme.headingRgb);
  const accentColor = col.onDarkSidebar
    ? rgb(0.92, 0.95, 1)
    : toPdfRgb(theme.accentRgb);

  if (style === 'pill' && !col.onDarkSidebar) {
    const textW = headingPair.bold.widthOfTextAtSize(safeTitle, fontSize * 0.88);
    const pillPadX = 7;
    const pillH = fontSize * 1.35;
    const pillW = Math.min(col.width, textW + pillPadX * 2);
    const pillY = col.cursorY - pillH + 2;
    page.drawRectangle({
      x: col.x,
      y: pillY,
      width: pillW,
      height: pillH,
      color: rgb(
        theme.accentRgb.r * 0.12 + 0.88,
        theme.accentRgb.g * 0.12 + 0.88,
        theme.accentRgb.b * 0.12 + 0.88
      ),
      borderColor: accentColor,
      borderWidth: 0.6,
    });
    page.drawText(safeTitle, {
      x: col.x + pillPadX,
      y: pillY + (pillH - fontSize * 0.88) / 2 + 1,
      size: fontSize * 0.88,
      font: headingPair.bold,
      color: toPdfRgb(theme.accentRgb),
    });
    col.cursorY -= pillH + 6;
    return;
  }

  if (style === 'bar') {
    const barW = 3;
    const barH = fontSize * 1.05;
    page.drawRectangle({
      x: col.x,
      y: col.cursorY - barH + 1.5,
      width: barW,
      height: barH,
      color: accentColor,
    });
    page.drawText(safeTitle, {
      x: col.x + barW + 6,
      y: col.cursorY - fontSize + 1,
      size: fontSize,
      font: headingPair.bold,
      color: headingColor,
    });
    col.cursorY -= lineH + 4;
    return;
  }

  // 'underline', 'caps', or 'side-label'
  const lines = wrapTextLines(
    safeTitle,
    headingPair.bold,
    headingPair.charSet,
    fontSize,
    col.width
  );
  for (const ln of lines) {
    const p = ensureVerticalSpace(ctx, col, lineH);
    p.drawText(ln, {
      x: col.x,
      y: col.cursorY - fontSize + 1,
      size: fontSize,
      font: headingPair.bold,
      color: headingColor,
    });
    col.cursorY -= lineH;
  }

  if (style === 'underline' || style === 'side-label') {
    const currentPage = getPage(ctx, col.pageIndex);
    currentPage.drawLine({
      start: { x: col.x, y: col.cursorY + 2 },
      end: { x: col.x + col.width, y: col.cursorY + 2 },
      thickness: col.onDarkSidebar ? 0.6 : 0.9,
      color: accentColor,
      opacity: col.onDarkSidebar ? 0.55 : 0.85,
    });
    col.cursorY -= 5;
  } else {
    col.cursorY -= 2;
  }
}

function drawParagraphLines(
  ctx: PdfLayoutContext,
  col: ColumnCursor,
  rawText: string,
  options: {
    font: PDFFont;
    charSet: Set<number>;
    size: number;
    color: ReturnType<typeof rgb>;
    indentX?: number;
    bulletPrefix?: string;
    afterSpacing?: number;
  }
): void {
  const indent = options.indentX || 0;
  const availWidth = Math.max(40, col.width - indent);
  const lines = wrapTextLines(
    rawText,
    options.font,
    options.charSet,
    options.size,
    availWidth
  );
  if (lines.length === 0) return;

  const lineStep = options.size * ctx.theme.lineHeight;

  lines.forEach((line, idx) => {
    const page = ensureVerticalSpace(ctx, col, lineStep);
    const baselineY = col.cursorY - options.size;
    if (idx === 0 && options.bulletPrefix) {
      const safeBullet = sanitizeForFont(options.bulletPrefix, options.charSet);
      if (safeBullet) {
        page.drawText(safeBullet, {
          x: col.x + Math.max(0, indent - 10),
          y: baselineY,
          size: options.size,
          font: options.font,
          color: options.color,
        });
      }
    }
    page.drawText(line, {
      x: col.x + indent,
      y: baselineY,
      size: options.size,
      font: options.font,
      color: options.color,
    });
    col.cursorY -= lineStep;
  });

  if (options.afterSpacing) {
    col.cursorY -= options.afterSpacing;
  }
}

function drawInlineFlowWithLinks(
  ctx: PdfLayoutContext,
  col: ColumnCursor,
  segments: Array<{
    text: string;
    href?: string;
    bold?: boolean;
    color?: ReturnType<typeof rgb>;
  }>,
  size: number,
  centered = false
): void {
  const bodyPair = ctx.fonts[ctx.theme.bodyFontCategory];
  const lineStep = size * ctx.theme.lineHeight;
  const sepText = '  •  ';
  const sepW = measureWidth(bodyPair.regular, bodyPair.charSet, sepText, size);

  type PlacedToken = {
    text: string;
    width: number;
    href?: string;
    bold?: boolean;
    color: ReturnType<typeof rgb>;
  };

  const rows: PlacedToken[][] = [];
  let currentRow: PlacedToken[] = [];
  let currentWidth = 0;

  const defaultColor = col.onDarkSidebar
    ? rgb(0.95, 0.97, 1)
    : toPdfRgb(ctx.theme.textRgb);
  const linkColor = col.onDarkSidebar
    ? rgb(1, 1, 1)
    : toPdfRgb(ctx.theme.accentRgb);

  for (const seg of segments) {
    const font = seg.bold ? bodyPair.bold : bodyPair.regular;
    const safe = sanitizeForFont(seg.text, bodyPair.charSet);
    if (!safe) continue;

    // Fit or break long URL/token
    const subTokens =
      font.widthOfTextAtSize(safe, size) > col.width
        ? breakLongToken(safe, font, bodyPair.charSet, size, col.width)
        : [safe];

    subTokens.forEach((sub, subIdx) => {
      const tokW = font.widthOfTextAtSize(sub, size);
      const needsSep = currentRow.length > 0 && subIdx === 0;
      const addedW = (needsSep ? sepW : 0) + tokW;

      if (currentRow.length > 0 && currentWidth + addedW > col.width) {
        rows.push(currentRow);
        currentRow = [];
        currentWidth = 0;
      }

      if (currentRow.length > 0 && subIdx === 0) {
        currentRow.push({
          text: sepText,
          width: sepW,
          color: col.onDarkSidebar ? rgb(0.82, 0.88, 0.98) : rgb(0.45, 0.5, 0.58),
        });
        currentWidth += sepW;
      }

      currentRow.push({
        text: sub,
        width: tokW,
        href: seg.href,
        bold: seg.bold,
        color: seg.color || (seg.href ? linkColor : defaultColor),
      });
      currentWidth += tokW;
    });
  }

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  for (const row of rows) {
    const page = ensureVerticalSpace(ctx, col, lineStep);
    const totalW = row.reduce((acc, t) => acc + t.width, 0);
    let drawX = centered
      ? col.x + Math.max(0, (col.width - totalW) / 2)
      : col.x;
    const baselineY = col.cursorY - size;

    for (const tok of row) {
      const font = tok.bold ? bodyPair.bold : bodyPair.regular;
      page.drawText(tok.text, {
        x: drawX,
        y: baselineY,
        size,
        font,
        color: tok.color,
      });
      if (tok.href) {
        page.drawLine({
          start: { x: drawX, y: baselineY - 1.2 },
          end: { x: drawX + tok.width, y: baselineY - 1.2 },
          thickness: 0.5,
          color: tok.color,
          opacity: 0.75,
        });
        addPdfExternalLinkAnnotation(
          ctx.pdfDoc,
          page,
          {
            x: drawX,
            y: baselineY - 2,
            width: tok.width,
            height: size + 3,
          },
          tok.href
        );
      }
      drawX += tok.width;
    }

    col.cursorY -= lineStep;
  }
}

function drawSkillsSection(
  ctx: PdfLayoutContext,
  col: ColumnCursor,
  section: PreparedSection
): void {
  const { theme, fonts } = ctx;
  const bodyPair = fonts[theme.bodyFontCategory];
  const bodySize = theme.baseFontSizePt;
  const textColor = col.onDarkSidebar
    ? rgb(0.95, 0.97, 1)
    : toPdfRgb(theme.textRgb);
  const headingColor = col.onDarkSidebar
    ? rgb(1, 1, 1)
    : toPdfRgb(theme.headingRgb);
  const accentColor = col.onDarkSidebar
    ? rgb(1, 1, 1)
    : toPdfRgb(theme.accentRgb);

  const hasGroups = section.items.some((it) => it.keywords.length > 0);

  if (!hasGroups && (theme.skillStyle === 'bars' || theme.skillStyle === 'dots')) {
    const lineStep = bodySize * theme.lineHeight + 3;
    for (const it of section.items) {
      const structured = extractStructuredItem(section, it);
      const name = sanitizeForFont(structured.title, bodyPair.charSet);
      if (!name) continue;
      const page = ensureVerticalSpace(ctx, col, lineStep);
      const baselineY = col.cursorY - bodySize;

      page.drawText(name, {
        x: col.x,
        y: baselineY,
        size: bodySize,
        font: bodyPair.regular,
        color: textColor,
      });

      const score = structured.skillScore ?? 0.8;
      if (theme.skillStyle === 'bars') {
        const barW = Math.min(72, col.width * 0.34);
        const barX = col.x + col.width - barW;
        const barY = baselineY + 2;
        page.drawRectangle({
          x: barX,
          y: barY,
          width: barW,
          height: 4,
          color: col.onDarkSidebar ? rgb(0.85, 0.9, 1) : rgb(0.88, 0.91, 0.95),
          opacity: col.onDarkSidebar ? 0.3 : 1,
        });
        page.drawRectangle({
          x: barX,
          y: barY,
          width: barW * score,
          height: 4,
          color: accentColor,
        });
      } else {
        const filled = Math.round(score * 5);
        for (let d = 0; d < 5; d += 1) {
          const cx = col.x + col.width - (5 - d) * 8 + 4;
          const cy = baselineY + 3.5;
          page.drawCircle({
            x: cx,
            y: cy,
            size: 2.3,
            color:
              d < filled
                ? accentColor
                : col.onDarkSidebar
                ? rgb(0.85, 0.9, 1)
                : rgb(0.82, 0.86, 0.92),
            opacity: d < filled ? 1 : 0.4,
          });
        }
      }
      col.cursorY -= lineStep;
    }
    return;
  }

  if (!hasGroups && theme.skillStyle === 'chips') {
    const labels = section.items
      .map((it) => {
        const name = sanitizeText(it.raw.name ?? it.raw.category ?? it.raw.title, 120);
        const level =
          typeof it.raw.level === 'string' ? sanitizeText(it.raw.level, 40) : '';
        if (!name) return '';
        return level ? `${name} (${level})` : name;
      })
      .filter(Boolean);

    const chipFontSize = Number((bodySize * 0.92).toFixed(2));
    const chipPadX = 5.5;
    const chipH = chipFontSize * 1.45;
    const gapX = 4.5;
    const gapY = 4.5;

    let cursorX = col.x;
    let page = ensureVerticalSpace(ctx, col, chipH + gapY);

    for (const label of labels) {
      const safe = sanitizeForFont(label, bodyPair.charSet);
      if (!safe) continue;
      const textW = Math.min(
        col.width - chipPadX * 2,
        bodyPair.regular.widthOfTextAtSize(safe, chipFontSize)
      );
      const chipW = textW + chipPadX * 2;
      if (cursorX > col.x && cursorX + chipW > col.x + col.width) {
        col.cursorY -= chipH + gapY;
        page = ensureVerticalSpace(ctx, col, chipH + gapY);
        cursorX = col.x;
      }
      const displayChip =
        bodyPair.regular.widthOfTextAtSize(safe, chipFontSize) > col.width - chipPadX * 2
          ? breakLongToken(safe, bodyPair.regular, bodyPair.charSet, chipFontSize, col.width - chipPadX * 2)[0]
          : safe;

      const chipBottom = col.cursorY - chipH;
      page.drawRectangle({
        x: cursorX,
        y: chipBottom,
        width: chipW,
        height: chipH,
        color: col.onDarkSidebar ? rgb(1, 1, 1) : rgb(0.95, 0.96, 0.98),
        opacity: col.onDarkSidebar ? 0.16 : 1,
        borderColor: col.onDarkSidebar ? rgb(1, 1, 1) : rgb(0.84, 0.87, 0.92),
        borderWidth: 0.5,
      });
      page.drawText(displayChip, {
        x: cursorX + chipPadX,
        y: chipBottom + (chipH - chipFontSize) / 2 + 1,
        size: chipFontSize,
        font: bodyPair.regular,
        color: textColor,
      });
      cursorX += chipW + gapX;
    }
    if (labels.length > 0) {
      col.cursorY -= chipH + 2;
    }
    return;
  }

  if (!hasGroups) {
    const labels = section.items
      .map((it) => {
        const name = sanitizeText(it.raw.name ?? it.raw.category ?? it.raw.title, 120);
        const level =
          typeof it.raw.level === 'string' ? sanitizeText(it.raw.level, 40) : '';
        if (!name) return '';
        return level ? `${name} (${level})` : name;
      })
      .filter(Boolean);

    if (labels.length > 0) {
      drawParagraphLines(ctx, col, labels.join(', '), {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: bodySize,
        color: textColor,
      });
    }
    return;
  }

  // Grouped skills (e.g., Backend: Node.js, PostgreSQL)
  for (const it of section.items) {
    const groupName = sanitizeText(
      it.raw.name ?? it.raw.category ?? it.raw.title,
      120
    );
    const level =
      typeof it.raw.level === 'string' ? sanitizeText(it.raw.level, 40) : '';
    if (it.keywords.length > 0 && groupName) {
      const prefix = sanitizeForFont(`${groupName}: `, bodyPair.charSet);
      const rest = sanitizeForFont(it.keywords.join(', '), bodyPair.charSet);
      const prefixW = bodyPair.bold.widthOfTextAtSize(prefix, bodySize);
      const lineStep = bodySize * theme.lineHeight;

      if (prefixW < col.width * 0.55) {
        const firstAvail = col.width - prefixW;
        const wrapped = wrapTextLines(
          rest,
          bodyPair.regular,
          bodyPair.charSet,
          bodySize,
          firstAvail
        );
        if (wrapped.length === 1) {
          const page = ensureVerticalSpace(ctx, col, lineStep);
          const baselineY = col.cursorY - bodySize;
          page.drawText(prefix, {
            x: col.x,
            y: baselineY,
            size: bodySize,
            font: bodyPair.bold,
            color: headingColor,
          });
          page.drawText(wrapped[0], {
            x: col.x + prefixW,
            y: baselineY,
            size: bodySize,
            font: bodyPair.regular,
            color: textColor,
          });
          col.cursorY -= lineStep + 2;
          continue;
        }
      }

      drawParagraphLines(ctx, col, groupName, {
        font: bodyPair.bold,
        charSet: bodyPair.charSet,
        size: bodySize,
        color: headingColor,
      });
      drawParagraphLines(ctx, col, it.keywords.join(', '), {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: bodySize,
        color: textColor,
        afterSpacing: 3,
      });
    } else if (it.keywords.length > 0) {
      drawParagraphLines(ctx, col, it.keywords.join(', '), {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: bodySize,
        color: textColor,
        afterSpacing: 3,
      });
    } else if (groupName) {
      drawParagraphLines(
        ctx,
        col,
        level ? `${groupName} (${level})` : groupName,
        {
          font: bodyPair.regular,
          charSet: bodyPair.charSet,
          size: bodySize,
          color: textColor,
          afterSpacing: 2,
        }
      );
    }
  }
}

function drawSection(
  ctx: PdfLayoutContext,
  col: ColumnCursor,
  section: PreparedSection
): void {
  const { theme, fonts } = ctx;
  const headingPair = fonts[theme.headingFontCategory];
  const bodyPair = fonts[theme.bodyFontCategory];
  const bodySize = theme.baseFontSizePt;
  const metaSize = Number((bodySize * 0.9).toFixed(2));
  const textColor = col.onDarkSidebar
    ? rgb(0.94, 0.97, 1)
    : toPdfRgb(theme.textRgb);
  const headingColor = col.onDarkSidebar
    ? rgb(1, 1, 1)
    : toPdfRgb(theme.headingRgb);
  const metaColor = col.onDarkSidebar
    ? rgb(0.84, 0.9, 0.99)
    : rgb(0.38, 0.44, 0.52);

  drawSectionHeading(ctx, col, section.title || section.atsHeading);

  if (section.textContent) {
    drawParagraphLines(ctx, col, section.textContent, {
      font: bodyPair.regular,
      charSet: bodyPair.charSet,
      size: bodySize,
      color: textColor,
    });
    col.cursorY -= theme.sectionSpacingPt;
    return;
  }

  if (section.kind === 'skills') {
    drawSkillsSection(ctx, col, section);
    col.cursorY -= theme.sectionSpacingPt;
    return;
  }

  section.items.forEach((rawItem, idx) => {
    const structured = extractStructuredItem(section, rawItem);
    const isLast = idx === section.items.length - 1;
    const titleSize = Number((bodySize * 1.05).toFixed(2));
    const titleLineStep = titleSize * theme.lineHeight;

    const headlineParts = [structured.title, structured.subtitle].filter(Boolean);
    const headlineText = headlineParts.join(' — ');
    const safeDate = sanitizeForFont(structured.dateRange, bodyPair.charSet);

    if (headlineText || safeDate) {
      const dateW = safeDate
        ? bodyPair.regular.widthOfTextAtSize(safeDate, metaSize) + 10
        : 0;
      const canFitRightDate = safeDate && dateW < col.width * 0.42 && !col.onDarkSidebar;
      const titleMaxW = canFitRightDate ? col.width - dateW : col.width;
      const titleLines = headlineText
        ? wrapTextLines(
            headlineText,
            headingPair.bold,
            headingPair.charSet,
            titleSize,
            titleMaxW
          )
        : [];

      if (titleLines.length > 0) {
        titleLines.forEach((tLine, tIdx) => {
          const p = ensureVerticalSpace(ctx, col, titleLineStep);
          const baselineY = col.cursorY - titleSize;
          p.drawText(tLine, {
            x: col.x,
            y: baselineY,
            size: titleSize,
            font: headingPair.bold,
            color: headingColor,
          });
          if (tIdx === 0 && canFitRightDate) {
            p.drawText(safeDate, {
              x: col.x + col.width - (dateW - 10),
              y: baselineY + 0.5,
              size: metaSize,
              font:
                theme.templateId === 'developer'
                  ? fonts.mono.regular
                  : bodyPair.regular,
              color: metaColor,
            });
          }
          col.cursorY -= titleLineStep;
        });
        if (safeDate && !canFitRightDate) {
          drawParagraphLines(ctx, col, safeDate, {
            font: bodyPair.regular,
            charSet: bodyPair.charSet,
            size: metaSize,
            color: metaColor,
          });
        }
      } else if (safeDate) {
        drawParagraphLines(ctx, col, safeDate, {
          font: bodyPair.regular,
          charSet: bodyPair.charSet,
          size: metaSize,
          color: metaColor,
        });
      }
    }

    // Location, GPA/authors/contact, and clickable verified external links
    const metaSegments: Array<{
      text: string;
      href?: string;
      color?: ReturnType<typeof rgb>;
    }> = [];
    if (structured.location) {
      metaSegments.push({ text: structured.location, color: metaColor });
    }
    for (const ex of structured.metaExtras) {
      metaSegments.push({ text: ex, color: metaColor });
    }
    for (const lnk of structured.links) {
      metaSegments.push({ text: lnk.label, href: lnk.href });
    }
    if (metaSegments.length > 0) {
      drawInlineFlowWithLinks(ctx, col, metaSegments, metaSize, false);
    }

    if (structured.description) {
      drawParagraphLines(ctx, col, structured.description, {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: bodySize,
        color: textColor,
        afterSpacing: structured.bullets.length > 0 ? 2 : 0,
      });
    }

    for (const bullet of structured.bullets) {
      drawParagraphLines(ctx, col, bullet, {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: bodySize,
        color: textColor,
        indentX: 11,
        bulletPrefix: '•',
        afterSpacing: 1.5,
      });
    }

    if (structured.keywords.length > 0) {
      const kwFont =
        theme.templateId === 'developer' ? fonts.mono : bodyPair;
      drawParagraphLines(
        ctx,
        col,
        `${structured.keywordsLabel}: ${structured.keywords.join(', ')}`,
        {
          font: kwFont.regular,
          charSet: kwFont.charSet,
          size: metaSize,
          color: metaColor,
        }
      );
    }

    if (!isLast) {
      col.cursorY -= theme.itemSpacingPt;
    }
  });

  col.cursorY -= theme.sectionSpacingPt;
}

function drawTopBannerHeader(
  ctx: PdfLayoutContext,
  prepared: PreparedResume,
  includeContacts: boolean
): number {
  const { theme, fonts } = ctx;
  const page = getPage(ctx, 0);
  const headingPair = fonts[theme.headingFontCategory];
  const bodyPair = fonts[theme.bodyFontCategory];
  const margin = theme.pageMarginPt;
  const fullWidth = A4_WIDTH_PT - margin * 2;

  const displayName = prepared.basics.name || prepared.title;
  const nameSize = Number((theme.baseFontSizePt * 2.15).toFixed(2));
  const labelSize = Number((theme.baseFontSizePt * 1.12).toFixed(2));
  const contactSize = Number((theme.baseFontSizePt * 0.9).toFixed(2));

  const contactSegments: Array<{ text: string; href?: string }> = [];
  if (includeContacts) {
    if (prepared.basics.email) contactSegments.push({ text: prepared.basics.email });
    if (prepared.basics.phone) contactSegments.push({ text: prepared.basics.phone });
    if (prepared.basics.formattedLocation) {
      contactSegments.push({ text: prepared.basics.formattedLocation });
    }
    for (const link of prepared.basics.links) {
      contactSegments.push({ text: link.label || link.href, href: link.href });
    }
  }

  // Bold Header template: full-bleed colored accent band with white typography
  if (theme.templateId === 'bold-header') {
    const bandPadTop = 22;
    const bandPadBottom = 18;
    const textX = margin;
    const textW = fullWidth;

    const nameLines = displayName
      ? wrapTextLines(displayName, headingPair.bold, headingPair.charSet, nameSize, textW)
      : [];
    const labelLines = prepared.basics.label
      ? wrapTextLines(
          prepared.basics.label,
          bodyPair.regular,
          bodyPair.charSet,
          labelSize,
          textW
        )
      : [];

    const estContactRows = contactSegments.length > 0 ? 2 : 0;
    const contentH =
      nameLines.length * (nameSize * 1.2) +
      (labelLines.length > 0 ? labelLines.length * (labelSize * 1.3) + 3 : 0) +
      (estContactRows > 0 ? estContactRows * (contactSize * 1.35) + 4 : 0);
    const bandH = Math.max(76, bandPadTop + contentH + bandPadBottom);

    page.drawRectangle({
      x: 0,
      y: A4_HEIGHT_PT - bandH,
      width: A4_WIDTH_PT,
      height: bandH,
      color: toPdfRgb(theme.accentRgb),
    });

    const headerCol: ColumnCursor = {
      pageIndex: 0,
      x: textX,
      width: textW,
      topY: A4_HEIGHT_PT - bandPadTop,
      bottomY: 40,
      cursorY: A4_HEIGHT_PT - bandPadTop,
      onDarkSidebar: true,
    };

    if (displayName) {
      drawParagraphLines(ctx, headerCol, displayName, {
        font: headingPair.bold,
        charSet: headingPair.charSet,
        size: nameSize,
        color: rgb(1, 1, 1),
        afterSpacing: 2,
      });
    }
    if (prepared.basics.label) {
      drawParagraphLines(ctx, headerCol, prepared.basics.label, {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: labelSize,
        color: rgb(0.95, 0.96, 0.99),
        afterSpacing: 4,
      });
    }
    if (contactSegments.length > 0) {
      drawInlineFlowWithLinks(ctx, headerCol, contactSegments, contactSize, false);
    }

    return Math.min(A4_HEIGHT_PT - bandH - 18, headerCol.cursorY - 16);
  }

  // Startup template: two-tone primary top band + light contact bar with accent border
  if (theme.templateId === 'startup') {
    const bandPadY = 20;
    const nameLines = displayName
      ? wrapTextLines(displayName, headingPair.bold, headingPair.charSet, nameSize, fullWidth)
      : [];
    const labelLines = prepared.basics.label
      ? wrapTextLines(
          prepared.basics.label.toUpperCase(),
          bodyPair.bold,
          bodyPair.charSet,
          labelSize * 0.86,
          fullWidth
        )
      : [];
    const darkBandH =
      bandPadY * 2 +
      nameLines.length * (nameSize * 1.2) +
      (labelLines.length > 0 ? labelLines.length * (labelSize * 1.15) + 4 : 0);

    page.drawRectangle({
      x: 0,
      y: A4_HEIGHT_PT - darkBandH,
      width: A4_WIDTH_PT,
      height: darkBandH,
      color: toPdfRgb(theme.primaryRgb),
    });

    const darkCol: ColumnCursor = {
      pageIndex: 0,
      x: margin,
      width: fullWidth,
      topY: A4_HEIGHT_PT - bandPadY,
      bottomY: 40,
      cursorY: A4_HEIGHT_PT - bandPadY,
      onDarkSidebar: true,
    };
    if (displayName) {
      drawParagraphLines(ctx, darkCol, displayName, {
        font: headingPair.bold,
        charSet: headingPair.charSet,
        size: nameSize,
        color: rgb(1, 1, 1),
        afterSpacing: 3,
      });
    }
    if (prepared.basics.label) {
      drawParagraphLines(ctx, darkCol, prepared.basics.label.toUpperCase(), {
        font: bodyPair.bold,
        charSet: bodyPair.charSet,
        size: labelSize * 0.86,
        color: rgb(0.9, 0.93, 0.98),
      });
    }

    let nextY = A4_HEIGHT_PT - darkBandH;
    if (contactSegments.length > 0) {
      const contactBarTop = nextY;
      const contactCol: ColumnCursor = {
        pageIndex: 0,
        x: margin,
        width: fullWidth,
        topY: contactBarTop - 8,
        bottomY: 40,
        cursorY: contactBarTop - 8,
        onDarkSidebar: false,
      };
      // Draw subtle background strip
      page.drawRectangle({
        x: 0,
        y: contactBarTop - 30,
        width: A4_WIDTH_PT,
        height: 30,
        color: rgb(0.95, 0.96, 0.98),
      });
      drawInlineFlowWithLinks(ctx, contactCol, contactSegments, contactSize, false);
      const barBottom = Math.min(contactBarTop - 28, contactCol.cursorY - 6);
      page.drawLine({
        start: { x: 0, y: barBottom },
        end: { x: A4_WIDTH_PT, y: barBottom },
        thickness: 2,
        color: toPdfRgb(theme.accentRgb),
      });
      nextY = barBottom;
    }

    return nextY - 16;
  }

  // Standard / centered / executive single-column or split-column header
  const centered =
    theme.templateId === 'modern' ||
    theme.templateId === 'classic' ||
    theme.templateId === 'elegant' ||
    theme.templateId === 'academic';

  const headerCol: ColumnCursor = {
    pageIndex: 0,
    x: theme.templateId === 'executive' ? margin + 10 : margin,
    width: theme.templateId === 'executive' ? fullWidth - 10 : fullWidth,
    topY: A4_HEIGHT_PT - margin,
    bottomY: margin,
    cursorY: A4_HEIGHT_PT - margin,
    onDarkSidebar: false,
  };
  const headerStartY = headerCol.cursorY;

  if (displayName) {
    const safeNameLines = wrapTextLines(
      displayName,
      headingPair.bold,
      headingPair.charSet,
      nameSize,
      headerCol.width
    );
    for (const ln of safeNameLines) {
      const p = ensureVerticalSpace(ctx, headerCol, nameSize * 1.2);
      const w = headingPair.bold.widthOfTextAtSize(ln, nameSize);
      p.drawText(ln, {
        x: centered ? headerCol.x + Math.max(0, (headerCol.width - w) / 2) : headerCol.x,
        y: headerCol.cursorY - nameSize,
        size: nameSize,
        font: headingPair.bold,
        color: toPdfRgb(theme.headingRgb),
      });
      headerCol.cursorY -= nameSize * 1.2;
    }
  }

  if (prepared.basics.label) {
    const safeLabelLines = wrapTextLines(
      prepared.basics.label,
      bodyPair.regular,
      bodyPair.charSet,
      labelSize,
      headerCol.width
    );
    for (const ln of safeLabelLines) {
      const p = ensureVerticalSpace(ctx, headerCol, labelSize * 1.3);
      const w = bodyPair.regular.widthOfTextAtSize(ln, labelSize);
      p.drawText(ln, {
        x: centered ? headerCol.x + Math.max(0, (headerCol.width - w) / 2) : headerCol.x,
        y: headerCol.cursorY - labelSize,
        size: labelSize,
        font: bodyPair.regular,
        color: toPdfRgb(theme.accentRgb),
      });
      headerCol.cursorY -= labelSize * 1.3;
    }
  }

  if (contactSegments.length > 0) {
    headerCol.cursorY -= 2;
    drawInlineFlowWithLinks(ctx, headerCol, contactSegments, contactSize, centered);
  }

  if (theme.templateId === 'executive') {
    page.drawRectangle({
      x: margin,
      y: headerCol.cursorY - 2,
      width: 3.5,
      height: Math.max(18, headerStartY - headerCol.cursorY),
      color: toPdfRgb(theme.accentRgb),
    });
  }

  headerCol.cursorY -= 6;
  page.drawLine({
    start: { x: margin, y: headerCol.cursorY },
    end: { x: A4_WIDTH_PT - margin, y: headerCol.cursorY },
    thickness: 0.9,
    color: toPdfRgb(theme.accentRgb),
    opacity: 0.75,
  });

  return headerCol.cursorY - theme.sectionSpacingPt;
}

/**
 * Renders a multi-page vector PDF in pure JavaScript using `pdf-lib` and `@pdf-lib/fontkit`,
 * embedding Unicode TrueType fonts, mapping all 17 template layout families & theme tokens,
 * preserving logical ATS reading order, and attaching verified `/URI` link annotations.
 */
export async function renderResumePdfDocument(
  rawResume: Record<string, any>
): Promise<Buffer> {
  const prepared = prepareExportableResume(rawResume);
  const theme = resolveExportTheme(rawResume);

  const pdfDoc = await PDFDocument.create();
  const displayName = prepared.basics.name || prepared.title;
  pdfDoc.setTitle(prepared.title);
  if (displayName) {
    pdfDoc.setAuthor(displayName);
  }
  pdfDoc.setCreator('Resume Builder');
  pdfDoc.setProducer('Resume Builder Vector PDF Engine');

  const fonts = await embedThemeFonts(pdfDoc, theme);
  const margin = theme.pageMarginPt;

  const drawPageDecorations = (page: PDFPage, pageIndex: number) => {
    if (theme.layout === 'sidebar-left') {
      const sbWidth = Number((A4_WIDTH_PT * theme.sidebarRatio).toFixed(2));
      if (theme.templateId === 'accent-sidebar') {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: sbWidth,
          height: A4_HEIGHT_PT,
          color: toPdfRgb(theme.accentRgb),
        });
      } else {
        page.drawRectangle({
          x: 0,
          y: 0,
          width: sbWidth,
          height: A4_HEIGHT_PT,
          color: rgb(0.973, 0.98, 0.988),
        });
        page.drawLine({
          start: { x: sbWidth, y: 0 },
          end: { x: sbWidth, y: A4_HEIGHT_PT },
          thickness: 0.75,
          color: rgb(0.88, 0.91, 0.94),
        });
      }
    } else if (theme.layout === 'sidebar-right' && theme.templateId === 'startup') {
      const sbWidth = Number((A4_WIDTH_PT * theme.sidebarRatio).toFixed(2));
      const topLimit = pageIndex === 0 ? A4_HEIGHT_PT - 90 : A4_HEIGHT_PT;
      page.drawRectangle({
        x: A4_WIDTH_PT - sbWidth,
        y: 0,
        width: sbWidth,
        height: topLimit,
        color: rgb(0.973, 0.98, 0.988),
      });
      page.drawLine({
        start: { x: A4_WIDTH_PT - sbWidth, y: 0 },
        end: { x: A4_WIDTH_PT - sbWidth, y: topLimit },
        thickness: 0.75,
        color: rgb(0.88, 0.91, 0.94),
      });
    }
  };

  const ctx: PdfLayoutContext = {
    pdfDoc,
    pages: [],
    theme,
    fonts,
    drawPageDecorations,
  };

  // Ensure Page 0 exists with background decorations
  getPage(ctx, 0);

  const bodyPair = fonts[theme.bodyFontCategory];
  const headingPair = fonts[theme.headingFontCategory];

  if (theme.layout === 'sidebar-left') {
    const sbWidth = Number((A4_WIDTH_PT * theme.sidebarRatio).toFixed(2));
    const colPad = Math.min(margin, 28);
    const mainX = sbWidth + colPad;
    const mainW = A4_WIDTH_PT - mainX - colPad;
    const sbX = colPad * 0.85;
    const sbContentW = sbWidth - colPad * 1.7;
    const isAccentDark = theme.templateId === 'accent-sidebar';

    const mainSections = prepared.sections.filter(
      (s) => !theme.sidebarKinds.has(s.kind)
    );
    const sidebarSections = prepared.sections.filter((s) =>
      theme.sidebarKinds.has(s.kind)
    );

    // Logical reading order: 1) Main column header (name, label, summary) + main sections
    const mainCol: ColumnCursor = {
      pageIndex: 0,
      x: mainX,
      width: mainW,
      topY: A4_HEIGHT_PT - margin,
      bottomY: margin,
      cursorY: A4_HEIGHT_PT - margin,
      onDarkSidebar: false,
    };

    const nameSize = Number((theme.baseFontSizePt * 2.05).toFixed(2));
    const labelSize = Number((theme.baseFontSizePt * 1.1).toFixed(2));
    if (displayName) {
      drawParagraphLines(ctx, mainCol, displayName, {
        font: headingPair.bold,
        charSet: headingPair.charSet,
        size: nameSize,
        color: toPdfRgb(theme.headingRgb),
        afterSpacing: 2,
      });
    }
    if (prepared.basics.label) {
      drawParagraphLines(ctx, mainCol, prepared.basics.label, {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: labelSize,
        color: toPdfRgb(theme.accentRgb),
        afterSpacing: 6,
      });
    }
    getPage(ctx, 0).drawLine({
      start: { x: mainX, y: mainCol.cursorY },
      end: { x: mainX + mainW, y: mainCol.cursorY },
      thickness: 1.1,
      color: toPdfRgb(theme.accentRgb),
    });
    mainCol.cursorY -= theme.sectionSpacingPt;

    if (prepared.basics.summary) {
      drawSectionHeading(ctx, mainCol, 'Summary');
      drawParagraphLines(ctx, mainCol, prepared.basics.summary, {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: theme.baseFontSizePt,
        color: toPdfRgb(theme.textRgb),
      });
      mainCol.cursorY -= theme.sectionSpacingPt;
    }

    for (const sec of mainSections) {
      drawSection(ctx, mainCol, sec);
    }

    // 2) Sidebar column (contact + sidebar sections) drawn contiguously
    const sbCol: ColumnCursor = {
      pageIndex: 0,
      x: sbX,
      width: sbContentW,
      topY: A4_HEIGHT_PT - margin,
      bottomY: margin,
      cursorY: A4_HEIGHT_PT - margin,
      onDarkSidebar: isAccentDark,
    };

    const contactSegs: Array<{ text: string; href?: string }> = [];
    if (prepared.basics.email) contactSegs.push({ text: prepared.basics.email });
    if (prepared.basics.phone) contactSegs.push({ text: prepared.basics.phone });
    if (prepared.basics.formattedLocation) {
      contactSegs.push({ text: prepared.basics.formattedLocation });
    }
    for (const link of prepared.basics.links) {
      contactSegs.push({ text: link.label || link.href, href: link.href });
    }

    if (contactSegs.length > 0) {
      drawSectionHeading(ctx, sbCol, 'Contact');
      const cSize = Number((theme.baseFontSizePt * 0.88).toFixed(2));
      for (const seg of contactSegs) {
        drawInlineFlowWithLinks(ctx, sbCol, [seg], cSize, false);
      }
      sbCol.cursorY -= theme.sectionSpacingPt;
    }

    for (const sec of sidebarSections) {
      drawSection(ctx, sbCol, sec);
    }
  } else if (theme.layout === 'sidebar-right' || theme.layout === 'two-column') {
    const contentStartY = drawTopBannerHeader(ctx, prepared, true);
    const gap = 18;
    const totalW = A4_WIDTH_PT - margin * 2;
    const rightW = Number(((totalW - gap) * theme.sidebarRatio).toFixed(2));
    const leftW = totalW - gap - rightW;

    let bodyStartY = contentStartY;

    // For Editorial Grid (two-column), full-width summary sits above the 2-column split
    if (theme.layout === 'two-column' && prepared.basics.summary) {
      const summaryCol: ColumnCursor = {
        pageIndex: 0,
        x: margin,
        width: totalW,
        topY: contentStartY,
        bottomY: margin,
        cursorY: contentStartY,
        onDarkSidebar: false,
      };
      drawSectionHeading(ctx, summaryCol, 'Summary');
      drawParagraphLines(ctx, summaryCol, prepared.basics.summary, {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: theme.baseFontSizePt,
        color: toPdfRgb(theme.textRgb),
      });
      bodyStartY = summaryCol.cursorY - theme.sectionSpacingPt;
    }

    const primarySections = prepared.sections.filter(
      (s) => !theme.sidebarKinds.has(s.kind)
    );
    const secondarySections = prepared.sections.filter((s) =>
      theme.sidebarKinds.has(s.kind)
    );

    // If all sections happen to fall in one side, render full-width cleanly
    if (primarySections.length === 0 || secondarySections.length === 0) {
      const singleCol: ColumnCursor = {
        pageIndex: 0,
        x: margin,
        width: totalW,
        topY: bodyStartY,
        bottomY: margin,
        cursorY: bodyStartY,
        onDarkSidebar: false,
      };
      if (theme.layout !== 'two-column' && prepared.basics.summary) {
        drawSectionHeading(ctx, singleCol, 'Summary');
        drawParagraphLines(ctx, singleCol, prepared.basics.summary, {
          font: bodyPair.regular,
          charSet: bodyPair.charSet,
          size: theme.baseFontSizePt,
          color: toPdfRgb(theme.textRgb),
        });
        singleCol.cursorY -= theme.sectionSpacingPt;
      }
      for (const sec of prepared.sections) {
        drawSection(ctx, singleCol, sec);
      }
    } else {
      const leftCol: ColumnCursor = {
        pageIndex: 0,
        x: margin,
        width: leftW,
        topY: bodyStartY,
        bottomY: margin,
        cursorY: bodyStartY,
        onDarkSidebar: false,
      };

      if (theme.layout !== 'two-column' && prepared.basics.summary) {
        drawSectionHeading(ctx, leftCol, 'Summary');
        drawParagraphLines(ctx, leftCol, prepared.basics.summary, {
          font: bodyPair.regular,
          charSet: bodyPair.charSet,
          size: theme.baseFontSizePt,
          color: toPdfRgb(theme.textRgb),
        });
        leftCol.cursorY -= theme.sectionSpacingPt;
      }

      for (const sec of primarySections) {
        drawSection(ctx, leftCol, sec);
      }

      const rightCol: ColumnCursor = {
        pageIndex: 0,
        x: margin + leftW + gap,
        width: rightW,
        topY: bodyStartY,
        bottomY: margin,
        cursorY: bodyStartY,
        onDarkSidebar: false,
      };

      for (const sec of secondarySections) {
        drawSection(ctx, rightCol, sec);
      }
    }
  } else {
    // Single-column layout family
    const contentStartY = drawTopBannerHeader(ctx, prepared, true);
    const singleCol: ColumnCursor = {
      pageIndex: 0,
      x: margin,
      width: A4_WIDTH_PT - margin * 2,
      topY: contentStartY,
      bottomY: margin,
      cursorY: contentStartY,
      onDarkSidebar: false,
    };

    if (prepared.basics.summary) {
      drawSectionHeading(ctx, singleCol, 'Professional Summary');
      drawParagraphLines(ctx, singleCol, prepared.basics.summary, {
        font: bodyPair.regular,
        charSet: bodyPair.charSet,
        size: theme.baseFontSizePt,
        color: toPdfRgb(theme.textRgb),
      });
      singleCol.cursorY -= theme.sectionSpacingPt;
    }

    for (const sec of prepared.sections) {
      drawSection(ctx, singleCol, sec);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
