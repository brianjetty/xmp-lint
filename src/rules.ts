import type { AltEntry, XmpData } from './xmp.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  ruleId: string;
  severity: Severity;
  message: string;
  line: number;
}

export type Rule = (data: XmpData) => Finding[];

const ISO_LIKE_DATE = /^\d{4}[:-]\d{2}[:-]\d{2}[ T]\d{2}:\d{2}:\d{2}/;
const MAX_DESCRIPTION_LENGTH = 500;

function missingAttribution(data: XmpData): Finding[] {
  if (data.rights || data.credit) return [];
  return [
    {
      ruleId: 'missing-attribution',
      severity: 'warning',
      message: 'no dc:rights or photoshop:Credit found; the file carries no attribution.',
      line: 1,
    },
  ];
}

function gpsPresent(data: XmpData): Finding[] {
  const findings: Finding[] = [];
  for (const [label, field] of [
    ['latitude', data.gpsLatitude],
    ['longitude', data.gpsLongitude],
  ] as const) {
    if (!field) continue;
    findings.push({
      ruleId: 'gps-present',
      severity: 'info',
      message: `GPS ${label} embedded (${field.value}); strip it before publishing if the location shouldn't be public.`,
      line: field.line,
    });
  }
  return findings;
}

function invalidDate(data: XmpData): Finding[] {
  if (!data.dateTimeOriginal) return [];
  if (ISO_LIKE_DATE.test(data.dateTimeOriginal.value)) return [];
  return [
    {
      ruleId: 'invalid-date',
      severity: 'error',
      message: `exif:DateTimeOriginal "${data.dateTimeOriginal.value}" doesn't look like a valid timestamp.`,
      line: data.dateTimeOriginal.line,
    },
  ];
}

function oversizedDescription(data: XmpData): Finding[] {
  if (!data.description) return [];
  if (data.description.value.length <= MAX_DESCRIPTION_LENGTH) return [];
  return [
    {
      ruleId: 'oversized-description',
      severity: 'warning',
      message: `dc:description is ${data.description.value.length} characters; consider trimming it below ${MAX_DESCRIPTION_LENGTH}.`,
      line: data.description.line,
    },
  ];
}

function languageAltHygiene(data: XmpData): Finding[] {
  const findings: Finding[] = [];
  for (const [tag, entries] of Object.entries(data.alts)) {
    const seen = new Map<string, AltEntry>();
    for (const entry of entries) {
      if (!entry.value) {
        findings.push({
          ruleId: 'empty-language-alt',
          severity: 'warning',
          message: `${tag} has an empty rdf:Alt entry for language "${entry.lang}".`,
          line: entry.line,
        });
        continue;
      }
      const existing = seen.get(entry.value);
      if (existing) {
        findings.push({
          ruleId: 'duplicate-language-alt',
          severity: 'info',
          message: `${tag} repeats the same text for "${existing.lang}" and "${entry.lang}"; rdf:Alt is meant to hold a distinct version per language.`,
          line: entry.line,
        });
      } else {
        seen.set(entry.value, entry);
      }
    }
  }
  return findings;
}

export const rules: Rule[] = [
  missingAttribution,
  gpsPresent,
  invalidDate,
  oversizedDescription,
  languageAltHygiene,
];
