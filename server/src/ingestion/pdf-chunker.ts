const MAX_CHUNK_CHARS = 1000;
const MAX_HEADING_CHARS = 60;
const documentDatePattern = /Last updated (\d{4}-\d{2}-\d{2})/;

export type PdfChunk = {
  page_number: number;
  chunk_index: number;
  heading: string | null;
  content: string;
};

export type ChunkedPdf = {
  title: string | null;
  documentDate: string | null;
  chunks: PdfChunk[];
};

type Section = { heading: string | null; body: string[] };

// Heuristic: the supplied policies use short, unpunctuated lines as section headings.
// A following lowercase line means this line is a wrapped sentence, not a heading.
function isHeading(line: string, nextLine: string | undefined): boolean {
  if (nextLine !== undefined && /^\p{Ll}/u.test(nextLine)) return false;
  return line.length <= MAX_HEADING_CHARS && !/[.:;,]$/.test(line);
}

function splitByLength(text: string): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (current && current.length + sentence.length + 1 > MAX_CHUNK_CHARS) {
      pieces.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

export function chunkPdfPages(pageTexts: readonly string[]): ChunkedPdf {
  let title: string | null = null;
  let documentDate: string | null = null;
  const chunks: PdfChunk[] = [];

  pageTexts.forEach((pageText, pageIndex) => {
    const lines = pageText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (pageIndex === 0 && lines[0]) title = lines.shift() ?? null;

    const sections: Section[] = [];
    for (const [index, line] of lines.entries()) {
      const dateMatch = documentDatePattern.exec(line);
      if (dateMatch) {
        documentDate ??= dateMatch[1] ?? null;
        continue;
      }
      if (isHeading(line, lines[index + 1])) {
        sections.push({ heading: line, body: [] });
      } else {
        const section = sections[sections.length - 1];
        if (section) section.body.push(line);
        else sections.push({ heading: null, body: [line] });
      }
    }

    for (const section of sections) {
      if (section.body.length === 0) continue;
      const prefix = [title, section.heading].filter(Boolean).join(" - ");
      for (const piece of splitByLength(section.body.join(" "))) {
        chunks.push({
          page_number: pageIndex + 1,
          chunk_index: chunks.length,
          heading: section.heading,
          content: prefix ? `${prefix}\n${piece}` : piece,
        });
      }
    }
  });

  return { title, documentDate, chunks };
}
