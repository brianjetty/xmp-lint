// Minimal reader for the subset of XMP that Lightroom and exiftool actually
// write: a single rdf:Description with EXIF fields as attributes, plus a
// handful of Dublin Core / Photoshop fields as either attributes or
// rdf:Alt/rdf:li elements. This is not a general XML parser and doesn't try
// to be one - it just needs to find known fields and the line they're on.

export interface XmpField {
  value: string;
  line: number;
}

export interface XmpData {
  gpsLatitude?: XmpField;
  gpsLongitude?: XmpField;
  dateTimeOriginal?: XmpField;
  rights?: XmpField;
  credit?: XmpField;
  description?: XmpField;
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

export function parseXmp(content: string): XmpData {
  return {
    gpsLatitude: findAttr(content, 'exif:GPSLatitude'),
    gpsLongitude: findAttr(content, 'exif:GPSLongitude'),
    dateTimeOriginal: findAttr(content, 'exif:DateTimeOriginal'),
    rights: findElementText(content, 'dc:rights'),
    credit: findAttr(content, 'photoshop:Credit') ?? findElementText(content, 'photoshop:Credit'),
    description: findElementText(content, 'dc:description'),
  };
}
