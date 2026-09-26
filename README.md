# xmp-lint

A linter for XMP sidecar files - the `.xmp` files Lightroom, darktable, and
`exiftool` write next to RAW images to hold metadata the camera didn't
capture: captions, keywords, copyright, GPS, edit history.

Those files accumulate problems nobody notices until it's a problem: a batch
export with no copyright line, a photo of your kid with GPS coordinates still
attached because nobody stripped it before upload, a date field a script
wrote in the wrong format that breaks the next tool in the pipeline. Since
XMP is just XML, these are catchable the same way a code linter catches
missing semicolons - you just need something that reads the file and tells
you which line to look at.

## What it checks (first pass)

- `missing-attribution` - no `dc:rights` or `photoshop:Credit` set.
- `gps-present` - GPS latitude/longitude embedded in the file (informational;
  not everyone wants this stripped, but you should know it's there).
- `invalid-date` - `exif:DateTimeOriginal` doesn't match a recognizable
  timestamp format.
- `oversized-description` - `dc:description` is longer than 500 characters.
- `empty-language-alt` - `dc:title`, `dc:description`, or `dc:rights` has an
  `rdf:Alt` entry with no text for one of its languages.
- `duplicate-language-alt` - the same field has two `rdf:Alt` entries with
  identical text under different languages, which usually means a batch tool
  copied one language into another instead of leaving it untranslated.
- `empty-keyword` - `dc:subject` has an `rdf:li` entry with no text.
- `duplicate-keyword` - `dc:subject` has the same keyword twice (case
  insensitive), which is usually a batch-tagging tool re-adding a keyword
  under different capitalization instead of recognizing it already applies.

More rules belong here over time (orientation sanity, lens/camera sanity
checks). See the roadmap below.

## Usage

Build once:

```
npm install
npm run build
```

Then run it against one or more sidecar files:

```
node dist/cli.js photos/2026-08-14/_DSC0142.xmp
```

It also reads JPEGs directly, pulling the XMP packet out of the file's APP1
segment instead of requiring a sidecar:

```
node dist/cli.js photos/2026-08-14/_DSC0142.jpg
```

```
photos/2026-08-14/_DSC0142.xmp:9: info [gps-present] GPS latitude embedded (37,46.5432N); strip it before publishing if the location shouldn't be public.
photos/2026-08-14/_DSC0142.xmp:1: warning [missing-attribution] no dc:rights or photoshop:Credit found; the file carries no attribution.
photos/2026-08-14/_DSC0142.xmp:14: error [invalid-date] exif:DateTimeOriginal "08/14/2026 3:12pm" doesn't look like a valid timestamp.

3 findings in 1 file
```

For scripting or CI, pass `--json` to get the same findings as structured
data instead of formatted text:

```
node dist/cli.js --json photos/2026-08-14/*.xmp
```

```json
[
  {
    "file": "photos/2026-08-14/_DSC0142.xmp",
    "ruleId": "gps-present",
    "severity": "info",
    "message": "GPS latitude embedded (37,46.5432N); strip it before publishing if the location shouldn't be public.",
    "line": 9
  }
]
```

The process exits `1` if any finding is `error` severity, `2` if no files
were given, and `0` otherwise - so `--json` output is safe to pipe into
`jq` in a CI step that gates on the exit code separately.

## Scope

This reads the common shape of XMP that Lightroom and `exiftool -X` produce:
EXIF fields as attributes on `rdf:Description`, and Dublin Core / Photoshop
fields as either attributes or `rdf:Alt`/`rdf:li` text elements. It is not a
general-purpose XML or RDF parser.

Besides `.xmp` sidecars, it reads the XMP packet embedded in a JPEG's APP1
segment directly - no sidecar needed. A JPEG with no embedded packet at all
is reported as a skip, not an error. TIFF and RAW files (which store the
packet differently, inside a TIFF IFD tag rather than a length-prefixed
marker segment) aren't read yet; that's still on the roadmap, along with a
config file for tuning which rules run, a fixture-based test suite, and a
`--fix` mode for safe auto-fixes like stripping GPS.
