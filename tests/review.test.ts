// F11: the review step, as rules and as the page's text (docs/sprints/F11.md; docs/BRIEF.md
// §4 Flow B steps 1–2). Typing, clicking and the keyboard are in tests/left-page.test.ts.
import { describe, expect, it } from 'vitest';
import sampleA from '../synthetic/transcripts/sample-a.json';
import sampleB from '../synthetic/transcripts/sample-b.json';
import { curriculum } from '../src/curriculum';
import { countLine, emptyLeft, fixingLine, leftPage, refusalText, reviewHtml, uploadPanel, type LeftState } from '../src/left';
import { byTerm, correctRow, gradeChoices, leaveOut, openTranscript, putBack, reviewRows, reviewedStandings, stillToFix, takenOn, type Transcript } from '../src/review';
import { ReaderError } from '../src/reader';

const decode = (html: string): string => html
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ')
  .replace(/ ([,.;:)])/g, '$1');
type Row = Record<string, unknown>;
const good = (over: Row = {}): Row => ({ term: 'Fall 2025', transfer: false, prefix: 'MGT', number: '321', description: 'Prin of Management', attempted: 3, earned: 3, grade: 'B', points: 9, ...over });
const open = (...rows: unknown[]): Transcript => openTranscript('made-up.pdf', { rows }, curriculum);
const reviewing = (transcript: Transcript, editing: number | null = null): LeftState => ({ ...emptyLeft(), transcript, editing });
const drawn = (transcript: Transcript, editing: number | null = null): string => reviewHtml(reviewing(transcript, editing), curriculum);
/** Each row of the drawn review as its words. */
const rowsOf = (html: string): string[] => html.split('<div role="row" class="row review-row').slice(1).map(one => decode(`<x ${one.split('</section>')[0]}`).trim());
const a = openTranscript('sample-a.pdf', sampleA, curriculum);
const b = openTranscript('sample-b.pdf', sampleB, curriculum);

describe('before a transcript', () => {
  it('offers the PDF as the only way in', () => {
    const page = leftPage(curriculum);
    expect(page).toMatch(/<h1 tabindex="-1">See what I have left<\/h1>/);
    expect(page).toMatch(/<div class="drop" data-drop>[\s\S]*Drag &amp; drop your transcript PDF here[\s\S]*<button type="button" class="btn secondary" data-browse>Browse files /);
    // No field in which a course or a grade could be typed.
    expect(page).not.toMatch(/<input|<textarea|<select|<form|contenteditable/i);
    expect(page).not.toMatch(/data-continue|data-edit/);
  });

  it('shows the privacy sentence with the upload control', () => {
    const sentence = 'Google reads your PDF and may keep it briefly. Your result stays in this browser.';
    expect(uploadPanel()).toMatch(new RegExp(`data-browse>[\\s\\S]*<p class="privacy">[\\s\\S]*${sentence.replace(/\./g, '\\.')}</p>`));
    expect(decode(leftPage(curriculum))).toContain(sentence);
    // The reason a file was not taken is said under the control.
    expect(uploadPanel('not-a-pdf')).toContain('<p class="field-message" data-refusal>That file is not a PDF. Choose the unofficial transcript PDF from the portal.</p>');
    expect(refusalText('unreadable')).toBe('That file could not be opened. Choose it again.');
    expect(refusalText('not-made-up')).toBe('PathCheck can only read its two made-up transcripts for now. Nothing from this file was kept or sent.');
    expect(refusalText('too-large')).toBe('That file is too large to be a transcript. Nothing from it was read.');
    expect(refusalText('unavailable')).toBe('Upload isn’t available right now — try again tomorrow');
    expect(uploadPanel()).toContain('data-refusal></p>');
  });
});

describe('what was read', () => {
  it('lists the rows under their terms', () => {
    expect(byTerm(reviewRows(a, curriculum)).map(group => `${group.term}: ${group.rows.map(row => row.code).join(' ')}`)).toEqual([
      'Fall 2025: ORI 100 ENG 131 BIO 127 BIOL 127 MAT 137 HIS 131',
      'Spr 2026: ENG 132 BIO 128 BIOL 128 CIS 205 CIS 206 ECO 251',
      'Fall 2026: ECO 251 HUM 103 ACT 214 MGT 202 PED 114',
    ]);
    const html = drawn(a);
    expect(html.match(/<h2 id="term-\d" class="term-name">([^<]+)<\/h2>/g)?.map(one => decode(one).trim())).toEqual(['Fall 2025', 'Spr 2026', 'Fall 2026']);
    expect(html.match(/<div class="table" role="table" aria-label="[^"]+">/g)).toHaveLength(3);
    // Each row: the code, the description as printed, the credits, the grade and how it stands.
    expect(rowsOf(html)[0]).toBe('ORI 100 First Year Experience 1 cr A Passed Edit Not on my transcript');
    expect(rowsOf(html)[12]).toBe('ECO 251 Prin of Macroeconomics 3 cr In progress No grade was read. Edit this row if the course already has one. Edit Not on my transcript');
    expect(rowsOf(html)).toHaveLength(17);
    expect(byTerm(reviewRows(b, curriculum)).map(group => group.term)).toEqual(['Transfer Credit', 'Fall 2024', 'Spr 2025', 'Fall 2025']);
    // The page of the review step.
    const page = leftPage(curriculum, reviewing(a));
    expect(page).toMatch(/<h1 tabindex="-1">Check what was read<\/h1>/);
    expect(decode(page)).toContain('This is what PathCheck read from sample-a.pdf. Correct anything that was misread before you continue.');
    expect(page).not.toContain('data-drop');
  });

  it('never shows the lines that are not courses', () => {
    const html = drawn(b);
    expect(b.reading.thrownAway).toBe(13);
    expect(decode(html)).not.toMatch(/GPA|Academic Standing|Good Standing|Transfer Totals/i);
    expect(rowsOf(html)).toHaveLength(16);
  });

  it('says when nothing was read', () => {
    const html = drawn(open());
    expect(decode(html)).toBe(' No courses were read from this transcript. Use another transcript Choosing another transcript forgets your corrections. ');
    expect(html).not.toContain('data-continue');
    // Only totals lines: nothing was read either.
    expect(drawn(open({ term: 'Fall 2025', transfer: false, prefix: '', number: '', description: 'Term GPA 3.00' }))).not.toContain('data-continue');
    expect(() => openTranscript('x.pdf', { nothing: true }, curriculum)).toThrow(ReaderError);
  });

  it('says how each row stands', () => {
    const rows = Object.fromEntries(rowsOf(drawn(b)).map((row, i) => [`${i} ${row.slice(0, 8).trim()}`, row.replace(/ Edit Not on my transcript$/, '')]));
    expect(rows).toEqual({
      // Transfer credit: the credits column of the transcript is empty, and so is this one.
      '0 ENG 131': 'ENG 131 English Comp I T Transfer credit Passed',
      '1 MAT 137': 'MAT 137 Pre-Calc Algebra TR Transfer credit Passed',
      '2 HIS 131': 'HIS 131 World History I AP Transfer credit Passed',
      '3 ORI 100': 'ORI 100 First Year Experience 1 cr A Passed',
      '4 ENG 132': 'ENG 132 English Comp II 3 cr B Passed',
      '5 BIO 127': 'BIO 127 General Biology I 3 cr W Doesn’t count — W',
      '6 BIOL 127': 'BIOL 127 Gen Biology I Lab 1 cr B Passed',
      '7 CIS 205': 'CIS 205 Intro to CIS 3 cr F Doesn’t count — below C',
      '8 BIO 230': 'BIO 230 Human Anatomy 3 cr A Passed Not in the CIS curriculum',
      '9 CIS 205': 'CIS 205 Intro to CIS 3 cr B Passed',
      '10 CIS 206': 'CIS 206 Bus Programming Languages 3 cr I Doesn’t count — I',
      '11 FLS 161': 'FLS 161 Elementary Spanish I 3 cr B Passed',
      '12 MKT 410': 'MKT 410 Marketing Research 3 cr A Passed',
      '13 HUM 103': 'HUM 103 Humanities Afr-Amer Exp 3 cr C Passed',
      '14 CIS 206': 'CIS 206 Bus Programming Languages 3 cr In progress No grade was read. Edit this row if the course already has one.',
      '15 ECO 251': 'ECO 251 Prin of Macroeconomics 3 cr In progress No grade was read. Edit this row if the course already has one.',
    });
    // No number is shown that the transcript does not print: not "0", not "0 cr".
    const transferRows = drawn(b).split('<div role="row" class="row review-row').slice(1, 4);
    for (const row of transferRows) expect(row).toMatch(/<span role="cell" class="cell-cr num"><\/span>/);
    expect(reviewRows(b, curriculum).slice(0, 3).map(row => [row.credits, row.editable?.attempted])).toEqual([['', ''], ['', ''], ['', '']]);
    // Transfer credit that does print its credits shows them.
    expect(rowsOf(drawn(open(good({ transfer: true, grade: 'T', attempted: '3.00', term: 'Transfer Credit' }))))[0]).toBe('MGT 321 Prin of Management 3 cr T Transfer credit Passed Edit Not on my transcript');
    // Figures printed with three decimals, as a real transcript prints them: the row is read, and shows its credits plainly.
    expect(rowsOf(drawn(open(good({ attempted: '3.000', earned: '3.000', points: '9.000' }))))[0]).toMatch(/^MGT 321 Prin of Management 3 cr B /);
    expect(drawn(open(good({ attempted: '3.000', earned: '3.000', points: '9.000' })))).not.toContain('Needs fixing');
    // The two courses that never count, in the owner's words; a D; a grade read with spaces, in small letters.
    const more = rowsOf(drawn(open(good({ prefix: 'CIS', number: '304', grade: 'A' }), good({ prefix: 'CIS', number: '415', grade: 'B' }), good({ grade: 'D' }), good({ grade: ' b ' }))));
    expect(more.map(row => row.replace(/ Edit Not on my transcript$/, ''))).toEqual([
      'CIS 304 Prin of Management 3 cr A Passed CIS 304 isn’t in the current CIS curriculum',
      'CIS 415 Prin of Management 3 cr B Passed CIS 415 isn’t in the current CIS curriculum',
      'MGT 321 Prin of Management 3 cr D Doesn’t count — below C',
      'MGT 321 Prin of Management 3 cr B Passed',
    ]);
  });

  it('never says a row counts', () => {
    for (const transcript of [a, b]) {
      const html = drawn(transcript);
      expect(decode(html)).not.toMatch(/\bcounts\b|counts toward|elective|requirement/i);
      expect(html).not.toMatch(/mark-counts|mark-done|is-counts/);
    }
    // "Doesn't count" is said of a grade, and only of a grade.
    expect(decode(drawn(b)).match(/Doesn’t count — (below C|W|I)/g)).toHaveLength(3);
  });

  it('shows a faulty row and what is wrong with it', () => {
    const transcript = open(
      good(), good({ number: '32' }), good({ grade: 'B+' }), good({ attempted: 'abc' }), good({ transfer: 'yes' }), 'not a row',
      good({ term: '' }), good({ number: '1', grade: 'Z', attempted: -1 }),
    );
    const rows = rowsOf(drawn(transcript));
    expect(rows.slice(1)).toEqual([
      'MGT 32 Prin of Management 3 cr Needs fixing: the course code Edit Not on my transcript',
      'MGT 321 Prin of Management 3 cr Needs fixing: the grade Edit Not on my transcript',
      'MGT 321 Prin of Management abc cr Needs fixing: the credits Edit Not on my transcript',
      'MGT 321 Prin of Management 3 cr Needs fixing: whether it is transfer credit Edit Not on my transcript',
      'MGT 1 Prin of Management -1 cr Needs fixing: the course code, the credits, the grade Edit Not on my transcript',
      'This line could not be read Not on my transcript',
      'MGT 321 Prin of Management 3 cr Needs fixing: the term Edit Not on my transcript',
    ]);
    // A row to fix is marked and tinted like "doesn't count"; a line that is not a row cannot be edited.
    const html = drawn(transcript);
    expect(html.match(/class="row review-row is-no"/g)).toHaveLength(7);
    expect(html.match(/data-edit="\d+"/g)).toHaveLength(7);
    expect(html).not.toContain('data-edit="5"');
    // Rows whose term was not read come under their own heading.
    expect(html.match(/class="term-name">([^<]+)</g)?.map(one => one.replace(/^.*>|<$/g, ''))).toEqual(['Fall 2025', 'Term not read']);
    expect(stillToFix(transcript)).toHaveLength(7);
    expect(fixingLine(transcript)).toBe('7 rows still need fixing. They count nothing until fixed.');
    expect(fixingLine(open(good(), good({ grade: 'B+' })))).toBe('1 row still needs fixing. It counts nothing until fixed.');
    expect(fixingLine(a)).toBe('');
    expect(decode(html)).toContain('7 rows still need fixing. They count nothing until fixed. Continue');
  });

  it('shows printed text as text', () => {
    const odd = '<img src=x onerror=alert(1)> "quoted" & more';
    const html = drawn(open(good({ description: odd, term: '<b>Fall</b> 2025' }), good({ description: 'x'.repeat(5000), grade: 'B+' })));
    expect(html).not.toMatch(/<img|<b>|onerror=alert\(1\)>/);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &quot;quoted&quot; &amp; more');
    expect(html).toContain('<h2 id="term-0" class="term-name">&lt;b&gt;Fall&lt;/b&gt; 2025</h2>');
    expect(html).toContain('aria-label="&lt;b&gt;Fall&lt;/b&gt; 2025"');
    // In an open edit, what was read is put into the fields as text too.
    expect(drawn(open(good({ term: '"><script>x</script>', grade: 'B+' })), 0)).toContain('value="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
  });
});

describe('correcting and leaving out', () => {
  it('checks a corrected row again', () => {
    const transcript = open(good({ grade: 'B+' }), good({ prefix: 'ENG', number: '131' }));
    const fixed = correctRow(transcript, 0, { term: 'Fall 2025', prefix: 'MGT', number: '321', attempted: '3', grade: 'B', transfer: false }, curriculum);
    expect(stillToFix(fixed)).toEqual([]);
    expect(takenOn(fixed).map(row => row.row.code)).toEqual(['MGT 321', 'ENG 131']);
    // The printed description stays; the transcript before the correction is untouched.
    expect(takenOn(fixed)[0]?.description).toBe('Prin of Management');
    expect(stillToFix(transcript)).toHaveLength(1);
    // A correction that is itself faulty is a row to fix, with the new reason.
    const worse = correctRow(transcript, 0, { term: 'Fall 2025', prefix: 'MGT', number: '32', attempted: '3', grade: 'B', transfer: false }, curriculum);
    expect(stillToFix(worse).map(row => row.problems)).toEqual([['code']]);
    // Transfer credit: the grade column is no longer judged.
    const transfer = correctRow(transcript, 0, { term: 'Transfer Credit', prefix: 'MGT', number: '321', attempted: '', grade: 'B+', transfer: true }, curriculum);
    expect(stillToFix(transfer)).toEqual([]);
    // A corrected row carries the named fields and nothing else of the row it replaces.
    const loaded = openTranscript('x.pdf', { rows: [{ ...good({ grade: 'B+' }), ssn: '123-45-6789', student: 'Someone' }] }, curriculum);
    const cleaned = correctRow(loaded, 0, { term: 'Fall 2025', prefix: 'MGT', number: '321', attempted: '3', grade: 'B', transfer: false }, curriculum);
    expect(Object.keys(cleaned.raw[0] as object).sort()).toEqual(['attempted', 'description', 'grade', 'number', 'prefix', 'term', 'transfer']);
    expect(JSON.stringify(cleaned)).not.toMatch(/ssn|123-45|Someone/);
    // A course that is on the transcript twice is told apart by its term in every button's name.
    const twice = drawn(open(good({ term: 'Fall 2024', grade: 'F' }), good({ term: 'Spr 2025' })));
    expect(twice.match(/aria-label="[^"]+"/g)?.filter(label => label.includes('MGT 321'))).toEqual([
      'aria-label="Edit MGT 321, Fall 2024"', 'aria-label="Not on my transcript: MGT 321, Fall 2024"', 'aria-label="Edit MGT 321, Spr 2025"', 'aria-label="Not on my transcript: MGT 321, Spr 2025"',
    ]);
    // A line that is not a row stays one: a correction cannot turn it into a course.
    const junk = open(good(), 'junk', 7);
    for (const line of [1, 2]) expect(correctRow(junk, line, { term: 'Fall 2025', prefix: 'MGT', number: '321', attempted: '3', grade: 'B', transfer: false }, curriculum)).toBe(junk);
    // A description that is not text is what needs fixing, and no field corrects it: saving the row drops it.
    const odd = open(good({ description: 42 }));
    expect(stillToFix(odd).map(row => row.problems)).toEqual([['description']]);
    const mended = correctRow(odd, 0, { term: 'Fall 2025', prefix: 'MGT', number: '321', attempted: '3', grade: 'B', transfer: false }, curriculum);
    expect(stillToFix(mended)).toEqual([]);
    expect(takenOn(mended).map(row => [row.row.code, row.description])).toEqual([['MGT 321', '']]);
    // A line outside the transcript changes nothing.
    for (const line of [-1, 2, 0.5, Number.NaN]) expect(correctRow(transcript, line, { term: '', prefix: '', number: '', attempted: '', grade: '', transfer: false }, curriculum)).toBe(transcript);
    expect(gradeChoices(curriculum.grades)).toEqual([...curriculum.grades.letters, ...curriculum.grades.neverCounting]);
  });

  it('hands on only the rows that passed and were not left out', () => {
    const transcript = open(good(), good({ prefix: 'ENG', number: '131', grade: 'A' }), good({ prefix: 'CIS', number: '300', grade: 'B+' }), 'junk');
    const codes = (one: Transcript): string[] => reviewedStandings(one, curriculum.grades).map(standing => standing.code);
    expect(codes(transcript)).toEqual(['MGT 321', 'ENG 131']);
    expect(countLine(transcript)).toBe('2 rows taken on. 2 left out because they still need fixing.');
    // A row the student says is not on the transcript is neither handed on nor counted as needing fixing.
    const without = leaveOut(leaveOut(transcript, 1), 2);
    expect(codes(without)).toEqual(['MGT 321']);
    expect(stillToFix(without).map(row => row.line)).toEqual([3]);
    expect(countLine(without)).toBe('1 row taken on. 1 left out because it still needs fixing. 2 left out as not on your transcript.');
    expect(codes(putBack(without, 1))).toEqual(['MGT 321', 'ENG 131']);
    expect(countLine(a)).toBe('17 rows taken on.');
    expect(countLine(leaveOut(a, 0))).toBe('16 rows taken on. 1 left out as not on your transcript.');
    // Struck through, with the way back; no "Edit" while it is left out.
    const html = drawn(without);
    expect(html.match(/class="row review-row is-left-out"/g)).toHaveLength(2);
    expect(rowsOf(html)[1]).toBe('ENG 131 Prin of Management 3 cr Not on my transcript Put back');
    expect(html).not.toMatch(/data-edit="[12]"/);
    expect(html).toContain('data-back="1" aria-label="Put back ENG 131, Fall 2025"');
  });

  it('draws the fields of an open edit', () => {
    const html = drawn(open(good(), good({ grade: 'B+', term: 'Spr 2026' })), 1);
    const form = html.match(/<div class="row-edit"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] ?? '';
    expect(form).toContain('role="group" aria-label="Edit MGT 321, Spr 2026" data-editing="1"');
    // Every field has its label; what was read is in it.
    for (const [name, label, value] of [['term', 'Term', 'Spr 2026'], ['prefix', 'Prefix', 'MGT'], ['number', 'Number', '321'], ['attempted', 'Credits', '3']]) {
      expect(form).toContain(`<label for="row-1-${name}">${label}</label>`);
      expect(form).toMatch(new RegExp(`<input id="row-1-${name}" type="text" data-field="${name}" value="${value}"`));
    }
    expect(form).toContain('<label for="row-1-grade">Grade</label>');
    // The grades offered are the curriculum's scale and marks, and "no grade yet"; a grade that is neither stays visible as read.
    expect(form.match(/<option value="([^"]*)"/g)?.map(one => one.slice(15, -1))).toEqual(['', 'A', 'B', 'C', 'D', 'F', 'W', 'I', 'B+']);
    expect(form).toContain('<option value="B+" selected>B+</option>');
    expect(form).toMatch(/<input id="row-1-transfer" type="checkbox" data-field="transfer"> Transfer credit<\/label>/);
    expect(form).toMatch(/data-save="1">Save<\/button>\s*<button type="button" class="btn secondary" data-cancel="1">Cancel<\/button>/);
    // One edit at a time: while it is open no row offers another, and every row can still be left out.
    expect(html.match(/class="row-edit"/g)).toHaveLength(1);
    expect(html).not.toContain('data-edit=');
    expect(html.match(/data-out="\d"/g)).toEqual(['data-out="0"', 'data-out="1"']);
    // The edit is one cell of its row.
    expect(html).toMatch(/<div role="cell" aria-colspan="3" class="row-edit-cell">\s*<div class="row-edit" role="group"/);
    // (as many as each table has columns)
    for (const table of html.split('role="table"').slice(1)) expect(table.match(/role="columnheader"/g)).toHaveLength(3);
    // What is being typed is drawn in place of what was read.
    const typing = reviewHtml({ ...reviewing(open(good()), 0), draft: { term: 'Spr 2026', prefix: 'MGT', number: '4<2', attempted: '', grade: 'D', transfer: true } }, curriculum);
    expect(typing).toContain('data-field="number" value="4&lt;2"');
    expect(typing).toContain('<option value="D" selected>D</option>');
    expect(typing).toMatch(/data-field="transfer" checked>/);
    expect(drawn(open(good({ grade: 'B' })), 0)).toContain('<option value="B" selected>B</option>');
    expect(drawn(open(good({ transfer: true, grade: 'T' })), 0)).toMatch(/data-field="transfer" checked>/);
  });
});
