#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseXmp } from './xmp.js';
import { extractXmpFromJpeg } from './jpeg.js';
import { rules, type Finding } from './rules.js';

interface FileResult {
  file: string;
  findings: Finding[];
  readError?: string;
  skipped?: string;
}

function lintFile(path: string): FileResult {
  let raw: Buffer;
  try {
    raw = readFileSync(path);
  } catch (err) {
    return { file: path, findings: [], readError: (err as Error).message };
  }

  let content: string;
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xd8) {
    let xmp: string | undefined;
    try {
      xmp = extractXmpFromJpeg(raw);
    } catch (err) {
      return { file: path, findings: [], readError: (err as Error).message };
    }
    if (!xmp) {
      return { file: path, findings: [], skipped: 'no XMP metadata packet found embedded in this JPEG' };
    }
    content = xmp;
  } else {
    content = raw.toString('utf8');
  }

  const data = parseXmp(content);
  const findings = rules.flatMap((rule) => rule(data)).sort((a, b) => a.line - b.line);
  return { file: path, findings };
}

function printHuman(results: FileResult[]): boolean {
  let total = 0;
  let hasError = false;

  for (const result of results) {
    if (result.readError) {
      hasError = true;
      console.log(`${result.file}: ${result.readError}`);
      continue;
    }
    if (result.skipped) {
      console.log(`${result.file}: ${result.skipped}`);
      continue;
    }
    for (const finding of result.findings) {
      total++;
      if (finding.severity === 'error') hasError = true;
      console.log(`${result.file}:${finding.line}: ${finding.severity} [${finding.ruleId}] ${finding.message}`);
    }
  }

  if (total === 0 && !hasError) {
    console.log('no findings');
  } else {
    console.log(`\n${total} finding${total === 1 ? '' : 's'} in ${results.length} file${results.length === 1 ? '' : 's'}`);
  }
  return hasError;
}

function printJson(results: FileResult[]): boolean {
  const flat = results.flatMap((result) => {
    if (result.readError) {
      return [{ file: result.file, ruleId: 'read-error', severity: 'error', message: result.readError, line: 0 }];
    }
    if (result.skipped) {
      return [{ file: result.file, ruleId: 'no-embedded-xmp', severity: 'info', message: result.skipped, line: 0 }];
    }
    return result.findings.map((finding) => ({ file: result.file, ...finding }));
  });
  console.log(JSON.stringify(flat, null, 2));
  return flat.some((f) => f.severity === 'error');
}

function main(): void {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const files = args.filter((arg) => arg !== '--json');

  if (files.length === 0) {
    console.error('usage: xmp-lint [--json] <file.xmp> [more files...]');
    process.exitCode = 2;
    return;
  }

  const results = files.map(lintFile);
  const hasError = jsonMode ? printJson(results) : printHuman(results);
  if (hasError) process.exitCode = 1;
}

main();
