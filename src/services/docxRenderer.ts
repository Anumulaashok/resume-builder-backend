import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx';
import {
  PreparedResume,
  PreparedSection,
  prepareExportableResume,
  sanitizeText,
} from './exportService';
import {
  extractStructuredItem,
  resolveExportTheme,
  ResolvedExportTheme,
} from './pdfTemplateConfig';

const A4_WIDTH_TWIPS = 11906; // 210mm
const A4_HEIGHT_TWIPS = 16838; // 297mm

function halfPoints(pt: number): number {
  return Math.max(14, Math.round(pt * 2));
}

function twipsFromPt(pt: number): number {
  return Math.max(0, Math.round(pt * 20));
}

function buildSectionHeadingParagraph(
  headingText: string,
  theme: ResolvedExportTheme
): Paragraph {
  const displayTitle =
    theme.headingStyle === 'caps' ? headingText.toUpperCase() : headingText;

  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    spacing: {
      before: twipsFromPt(theme.sectionSpacingPt),
      after: twipsFromPt(4),
    },
    border: {
      bottom: {
        color: theme.accentHex,
        space: 2,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
    children: [
      new TextRun({
        text: displayTitle,
        bold: true,
        font: theme.docxHeadingFont,
        size: halfPoints(theme.baseFontSizePt * 1.18),
        color: theme.headingHex,
      }),
    ],
  });
}

function buildSectionParagraphs(
  section: PreparedSection,
  theme: ResolvedExportTheme,
  rightTabStopPos: number
): Paragraph[] {
  const paragraphs: Paragraph[] = [
    buildSectionHeadingParagraph(section.title || section.atsHeading, theme),
  ];

  const bodySize = halfPoints(theme.baseFontSizePt);
  const metaSize = halfPoints(theme.baseFontSizePt * 0.92);
  const lineSpacing = Math.round(240 * theme.lineHeight);

  if (section.textContent) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: twipsFromPt(theme.itemSpacingPt), line: lineSpacing },
        children: [
          new TextRun({
            text: section.textContent,
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.textHex,
          }),
        ],
      })
    );
    return paragraphs;
  }

  if (section.kind === 'skills') {
    const hasGroups = section.items.some((it) => it.keywords.length > 0);
    if (!hasGroups) {
      const labels = section.items
        .map((it) => {
          const name = sanitizeText(
            it.raw.name ?? it.raw.category ?? it.raw.title,
            120
          );
          const level =
            typeof it.raw.level === 'string'
              ? sanitizeText(it.raw.level, 40)
              : '';
          if (!name) return '';
          return level ? `${name} (${level})` : name;
        })
        .filter(Boolean);

      if (labels.length > 0) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: twipsFromPt(theme.itemSpacingPt), line: lineSpacing },
            children: [
              new TextRun({
                text: labels.join(', '),
                font: theme.docxBodyFont,
                size: bodySize,
                color: theme.textHex,
              }),
            ],
          })
        );
      }
      return paragraphs;
    }

    for (const it of section.items) {
      const groupName = sanitizeText(
        it.raw.name ?? it.raw.category ?? it.raw.title,
        120
      );
      const level =
        typeof it.raw.level === 'string' ? sanitizeText(it.raw.level, 40) : '';
      const runs: TextRun[] = [];
      if (groupName && it.keywords.length > 0) {
        runs.push(
          new TextRun({
            text: `${groupName}: `,
            bold: true,
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.headingHex,
          }),
          new TextRun({
            text: it.keywords.join(', '),
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.textHex,
          })
        );
      } else if (it.keywords.length > 0) {
        runs.push(
          new TextRun({
            text: it.keywords.join(', '),
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.textHex,
          })
        );
      } else if (groupName) {
        runs.push(
          new TextRun({
            text: level ? `${groupName} (${level})` : groupName,
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.textHex,
          })
        );
      }
      if (runs.length > 0) {
        paragraphs.push(
          new Paragraph({
            spacing: { after: twipsFromPt(4), line: lineSpacing },
            children: runs,
          })
        );
      }
    }
    return paragraphs;
  }

  section.items.forEach((rawItem, idx) => {
    const structured = extractStructuredItem(section, rawItem);
    const isLast = idx === section.items.length - 1;
    const afterItemTwips = isLast ? twipsFromPt(4) : twipsFromPt(theme.itemSpacingPt);

    // Item Heading / Title + Subtitle + Right-Aligned Date
    if (structured.title || structured.dateRange) {
      const headerChildren: TextRun[] = [];
      if (structured.title) {
        headerChildren.push(
          new TextRun({
            text: structured.title,
            bold: true,
            font: theme.docxHeadingFont,
            size: halfPoints(theme.baseFontSizePt * 1.05),
            color: theme.headingHex,
          })
        );
      }
      if (structured.subtitle) {
        headerChildren.push(
          new TextRun({
            text: structured.title
              ? ` | ${structured.subtitle}`
              : structured.subtitle,
            bold: false,
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.primaryHex,
          })
        );
      }
      if (structured.dateRange) {
        headerChildren.push(
          new TextRun({
            text: structured.title ? `\t${structured.dateRange}` : structured.dateRange,
            font: theme.docxBodyFont,
            size: metaSize,
            color: '475569',
          })
        );
      }

      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          keepNext: Boolean(
            structured.description ||
              structured.bullets.length > 0 ||
              structured.links.length > 0
          ),
          tabStops: [
            {
              type: TabStopType.RIGHT,
              position: rightTabStopPos,
            },
          ],
          spacing: { before: idx === 0 ? 40 : 80, after: 30, line: lineSpacing },
          children: headerChildren,
        })
      );
    }

    // Metadata + Verified External Hyperlinks line
    const metaTokens = [structured.location, ...structured.metaExtras].filter(Boolean);
    if (metaTokens.length > 0 || structured.links.length > 0) {
      const metaChildren: Array<TextRun | ExternalHyperlink> = [];
      metaTokens.forEach((tok, tokIdx) => {
        if (tokIdx > 0) {
          metaChildren.push(
            new TextRun({
              text: ' | ',
              font: theme.docxBodyFont,
              size: metaSize,
              color: '64748b',
            })
          );
        }
        metaChildren.push(
          new TextRun({
            text: tok,
            italics: true,
            font: theme.docxBodyFont,
            size: metaSize,
            color: '475569',
          })
        );
      });

      structured.links.forEach((lnk, lnkIdx) => {
        if (metaTokens.length > 0 || lnkIdx > 0) {
          metaChildren.push(
            new TextRun({
              text: ' | ',
              font: theme.docxBodyFont,
              size: metaSize,
              color: '64748b',
            })
          );
        }
        metaChildren.push(
          new ExternalHyperlink({
            link: lnk.href,
            children: [
              new TextRun({
                text: lnk.label,
                style: 'Hyperlink',
                font: theme.docxBodyFont,
                size: metaSize,
                color: theme.accentHex,
                underline: {},
              }),
            ],
          })
        );
      });

      paragraphs.push(
        new Paragraph({
          spacing: { after: 40, line: lineSpacing },
          children: metaChildren,
        })
      );
    }

    if (structured.description) {
      paragraphs.push(
        new Paragraph({
          spacing: {
            after:
              structured.bullets.length > 0 || structured.keywords.length > 0
                ? 40
                : afterItemTwips,
            line: lineSpacing,
          },
          children: [
            new TextRun({
              text: structured.description,
              font: theme.docxBodyFont,
              size: bodySize,
              color: theme.textHex,
            }),
          ],
        })
      );
    }

    structured.bullets.forEach((bulletText, bIdx) => {
      const isLastBullet =
        bIdx === structured.bullets.length - 1 && structured.keywords.length === 0;
      paragraphs.push(
        new Paragraph({
          numbering: {
            reference: 'resume-bullets',
            level: 0,
          },
          spacing: {
            after: isLastBullet ? afterItemTwips : 30,
            line: lineSpacing,
          },
          children: [
            new TextRun({
              text: bulletText,
              font: theme.docxBodyFont,
              size: bodySize,
              color: theme.textHex,
            }),
          ],
        })
      );
    });

    if (structured.keywords.length > 0) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: afterItemTwips, line: lineSpacing },
          children: [
            new TextRun({
              text: `${structured.keywordsLabel}: `,
              bold: true,
              font: theme.docxBodyFont,
              size: metaSize,
              color: theme.headingHex,
            }),
            new TextRun({
              text: structured.keywords.join(', '),
              font: theme.docxBodyFont,
              size: metaSize,
              color: theme.textHex,
            }),
          ],
        })
      );
    }
  });

  return paragraphs;
}

/**
 * Generates an editable, single-column ATS-friendly OpenXML (.docx) document
 * with native Word heading styles, native bullet lists, and verified external hyperlinks.
 */
export async function renderResumeDocxDocument(
  rawResume: Record<string, any>
): Promise<Buffer> {
  const prepared: PreparedResume = prepareExportableResume(rawResume);
  const theme = resolveExportTheme(rawResume);

  const marginTwips = theme.pageMarginTwips;
  const contentWidthTwips = Math.max(
    4000,
    A4_WIDTH_TWIPS - marginTwips * 2 || TabStopPosition.MAX
  );

  const children: Paragraph[] = [];
  const lineSpacing = Math.round(240 * theme.lineHeight);
  const bodySize = halfPoints(theme.baseFontSizePt);
  const metaSize = halfPoints(theme.baseFontSizePt * 0.94);

  const displayName = prepared.basics.name || prepared.title;
  const centerHeader =
    theme.templateId === 'modern' ||
    theme.templateId === 'classic' ||
    theme.templateId === 'elegant' ||
    theme.templateId === 'academic';

  if (displayName) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: centerHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: prepared.basics.label ? 30 : 60 },
        children: [
          new TextRun({
            text: displayName,
            bold: true,
            font: theme.docxHeadingFont,
            size: halfPoints(theme.baseFontSizePt * 2.1),
            color: theme.headingHex,
          }),
        ],
      })
    );
  }

  if (prepared.basics.label) {
    children.push(
      new Paragraph({
        alignment: centerHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: prepared.basics.label,
            font: theme.docxBodyFont,
            size: halfPoints(theme.baseFontSizePt * 1.15),
            color: theme.accentHex,
          }),
        ],
      })
    );
  }

  // Contact row (privacy-filtered & SSRF-sanitized via prepareExportableResume)
  const contactChildren: Array<TextRun | ExternalHyperlink> = [];
  const appendSep = () => {
    if (contactChildren.length > 0) {
      contactChildren.push(
        new TextRun({
          text: '  •  ',
          font: theme.docxBodyFont,
          size: metaSize,
          color: '64748b',
        })
      );
    }
  };

  if (prepared.basics.email) {
    appendSep();
    contactChildren.push(
      new TextRun({
        text: prepared.basics.email,
        font: theme.docxBodyFont,
        size: metaSize,
        color: theme.textHex,
      })
    );
  }
  if (prepared.basics.phone) {
    appendSep();
    contactChildren.push(
      new TextRun({
        text: prepared.basics.phone,
        font: theme.docxBodyFont,
        size: metaSize,
        color: theme.textHex,
      })
    );
  }
  if (prepared.basics.formattedLocation) {
    appendSep();
    contactChildren.push(
      new TextRun({
        text: prepared.basics.formattedLocation,
        font: theme.docxBodyFont,
        size: metaSize,
        color: theme.textHex,
      })
    );
  }
  for (const link of prepared.basics.links) {
    appendSep();
    contactChildren.push(
      new ExternalHyperlink({
        link: link.href,
        children: [
          new TextRun({
            text: link.label || link.href,
            style: 'Hyperlink',
            font: theme.docxBodyFont,
            size: metaSize,
            color: theme.accentHex,
            underline: {},
          }),
        ],
      })
    );
  }

  if (contactChildren.length > 0) {
    children.push(
      new Paragraph({
        alignment: centerHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 120, line: lineSpacing },
        children: contactChildren,
      })
    );
  }

  if (prepared.basics.summary) {
    children.push(
      buildSectionHeadingParagraph('Professional Summary', theme),
      new Paragraph({
        spacing: { after: twipsFromPt(theme.itemSpacingPt), line: lineSpacing },
        children: [
          new TextRun({
            text: prepared.basics.summary,
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.textHex,
          }),
        ],
      })
    );
  }

  for (const section of prepared.sections) {
    children.push(...buildSectionParagraphs(section, theme, contentWidthTwips));
  }

  const doc = new Document({
    creator: 'Resume Builder',
    title: prepared.title,
    description: `${displayName || prepared.title} Resume`,
    numbering: {
      config: [
        {
          reference: 'resume-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 360, hanging: 180 },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: {
            font: theme.docxBodyFont,
            size: bodySize,
            color: theme.textHex,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: A4_WIDTH_TWIPS,
              height: A4_HEIGHT_TWIPS,
            },
            margin: {
              top: marginTwips,
              right: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
            },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
