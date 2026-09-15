// Minimal reader for the subset of XMP that Lightroom and exiftool actually
// write: a single rdf:Description with EXIF fields as attributes, plus a
// handful of Dublin Core / Photoshop fields as either attributes or
// rdf:Alt/rdf:li elements. This is not a general XML parser and doesn't try
// to be one - it just needs to find known fields and the line they're on.

export interface XmpField {
  value: string;
  line: number;
}

// One <rdf:li xml:lang="..."> entry inside an rdf:Alt language-alternative
// block. Lightroom writes these for dc:title, dc:description, and dc:rights
// even when there's only ever one language in practice.
export interface AltEntry {
  lang: string;
  value: string;
  line: number;
}

// Tags that use the rdf:Alt language-alternative shape and are worth
// checking for empty or duplicated entries.
const ALT_TAGS = ['dc:title', 'dc:description', 'dc:rights'];

export interface XmpData {
  gpsLatitude?: XmpField;
  gpsLongitude?: XmpField;
  dateTimeOriginal?: XmpField;
  rights?: XmpField;
  credit?: XmpField;
  description?: XmpField;
  alts: Record<string, AltEntry[]>;
}

function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function findAttr(content: string, name: string): XmpField | undefined {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`).exec(content);
  if (!match) return undefined;
  return { value: match[1], line: lineAt(content, match.index) };
}

// Handles both `<tag><rdf:Alt><rdf:li ...>text</rdf:li></rdf:Alt></tag>`
// (the normal Lightroom shape for language-alternative fields) and a plain
// `<tag>text</tag>` fallback some tools write instead.
function findElementText(content: string, tag: string): XmpField | undefined {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(content);
  if (!block) return undefined;

  const innerStart = block.index + block[0].indexOf(block[1]);
  const li = /<rdf:li[^>]*>([^<]*)<\/rdf:li>/.exec(block[1]);
  if (li) {
    return { value: li[1].trim(), line: lineAt(content, innerStart + li.index) };
  }

  const trimmed = block[1].trim();
  if (trimmed && !trimmed.startsWith('<')) {
    return { value: trimmed, line: lineAt(content, innerStart) };
  }
  return undefined;
}

// Collects every rdf:li entry inside a tag's rdf:Alt block, e.g.
// <dc:title><rdf:Alt><rdf:li xml:lang="x-default">A</rdf:li></rdf:Alt></dc:title>.
// Fields written as plain `<tag>text</tag>` (no rdf:Alt) have nothing to
// compare against each other, so they yield no entries.
function findElementAlts(content: string, tag: string): AltEntry[] {
  const block = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(content);
  if (!block) return [];

  const altBlock = /<rdf:Alt>([\s\S]*?)<\/rdf:Alt>/.exec(block[1]);
  if (!altBlock) return [];

  const tagInnerStart = block.index + block[0].indexOf(block[1]);
  const altInnerStart = tagInnerStart + altBlock.index + altBlock[0].indexOf(altBlock[1]);

  const entries: AltEntry[] = [];
  const liRegex = /<rdf:li([^>]*)>([^<]*)<\/rdf:li>/g;
  let li: RegExpExecArray | null;
  while ((li = liRegex.exec(altBlock[1]))) {
    const langMatch = /xml:lang\s*=\s*"([^"]*)"/.exec(li[1]);
    entries.push({
      lang: langMatch ? langMatch[1] : 'x-default',
      value: li[2].trim(),
      line: lineAt(content, altInnerStart + li.index),
    });
  }
  return entries;
}

export function parseXmp(content: string): XmpData {
  const alts: Record<string, AltEntry[]> = {};
  for (const tag of ALT_TAGS) {
    alts[tag] = findElementAlts(content, tag);
  }

  return {
    gpsLatitude: findAttr(content, 'exif:GPSLatitude'),
    gpsLongitude: findAttr(content, 'exif:GPSLongitude'),
    dateTimeOriginal: findAttr(content, 'exif:DateTimeOriginal'),
    rights: findElementText(content, 'dc:rights'),
    credit: findAttr(content, 'photoshop:Credit') ?? findElementText(content, 'photoshop:Credit'),
    description: findElementText(content, 'dc:description'),
    alts,
  };
}
