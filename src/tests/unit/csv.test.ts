// csv.test.ts — CSV formula-injection escaping (AC-05).
import { describe, it, expect } from 'vitest';
import { escapeCsvCell, toCsv } from '../../common/utils/csv';

describe('escapeCsvCell', () => {
  it('neutralises formula-trigger prefixes', () => {
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
  });
  it('quotes cells containing commas/quotes/newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""');
  });
  it('leaves plain values untouched', () => {
    expect(escapeCsvCell('Ramesh')).toBe('Ramesh');
    expect(escapeCsvCell(500)).toBe('500');
    expect(escapeCsvCell(null)).toBe('');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF and escapes each cell', () => {
    const csv = toCsv([
      ['name', 'note'],
      ['A', '=1+1'],
    ]);
    expect(csv).toBe("name,note\r\nA,'=1+1");
  });
});
