// Extracts the XMP packet embedded directly in a JPEG file's APP1 segment -
// the same metadata Lightroom or exiftool would otherwise write to a .xmp
// sidecar, but carried inside the image instead. Once extracted, the packet
// is just XMP/RDF text and can go straight through the same parseXmp() used
// for sidecar files.
//
// Only the primary XMP packet is read. Packets over ~64KB get split across a
// main segment and one or more GExtendedXMP segments; that extension isn't
// handled here, so very large embedded packets may read as truncated XML.

const XMP_SIGNATURE = 'http://ns.adobe.com/xap/1.0/\0';
const MARKER_SOS = 0xda;
const MARKER_EOI = 0xd9;
const MARKER_APP1 = 0xe1;

function isStandaloneMarker(marker: number): boolean {
  // SOI, EOI, TEM, and the RSTn markers have no length field or payload.
  return marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9);
}

export function extractXmpFromJpeg(buffer: Buffer): string | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('not a JPEG file (missing SOI marker)');
  }

  const signature = Buffer.from(XMP_SIGNATURE, 'ascii');
  let offset = 2;

  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      // Between markers there should only be marker bytes; if that's not
      // what we find, the stream is either corrupt or we've drifted into
      // scan data some other way. Either way, stop rather than guess.
      break;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xff) {
      // Fill byte before the real marker code; keep scanning.
      offset++;
      continue;
    }
    if (marker === MARKER_SOS || marker === MARKER_EOI) break;
    if (isStandaloneMarker(marker)) {
      offset += 2;
      continue;
    }
    if (offset + 3 >= buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    const segmentStart = offset + 4;
    const segmentEnd = offset + 2 + length;
    if (length < 2 || segmentEnd > buffer.length) break;

    if (marker === MARKER_APP1 && segmentEnd - segmentStart >= signature.length) {
      const segment = buffer.subarray(segmentStart, segmentEnd);
      if (segment.subarray(0, signature.length).equals(signature)) {
        return segment.subarray(signature.length).toString('utf8');
      }
    }
    offset = segmentEnd;
  }
  return undefined;
}
