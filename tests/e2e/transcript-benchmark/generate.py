"""Generate only fictional integration inputs. No student PDFs are read.

Run with reportlab 4.5.1 and PyMuPDF 1.26.5 in an isolated environment.
The fixed output directory is disposable, outside the repository.
"""
import hashlib
import json
from pathlib import Path

import fitz
from reportlab.pdfgen import canvas
from reportlab.lib.pdfencrypt import StandardEncryption

OUT = Path('/private/tmp/pathcheck-gemini-benchmark-v1')
OUT.mkdir(mode=0o700, exist_ok=True)
FIELDS = ['rawCourseCode', 'rawTitle', 'rawTerm', 'rawAttemptedCredits',
          'rawEarnedCredits', 'rawGrade', 'rawStatus', 'rawInstitution']
HEADERS = ['Course', 'Title', 'Term', 'Attempted', 'Earned', 'Grade', 'Status', 'Institution']
WIDTHS = [71, 149, 98, 60, 52, 43, 85, 170]


def row(code='TEST 101', title='Synthetic Foundations', term='Fall 2025',
        attempted='3', earned='3', grade='B', status='completed', institution='Fixture University'):
    return dict(zip(FIELDS, [code, title, term, attempted, earned, grade, status, institution]))


BASE = [row(), row('TEST 202', 'Synthetic Algorithms', 'Spring 2026', '4', '4', 'A')]
# Explicit ground truth; no values are inferred from a model response or university policy.
CASES = [
    ('01-standard', [BASE], 'rows', False),
    ('02-multipage', [[BASE[0]], [BASE[1]]], 'rows', False),
    ('03-repeated-attempt', [[row(grade='F', earned='0'), row(term='Spring 2026', grade='A')]], 'rows', False),
    ('04-withdrawal', [[row(grade='W', earned='0', status='withdrawn')]], 'rows', False),
    ('05-transfer', [[row('EXT 777', 'External Synthetic Course', institution='Other Fixture College', status='transfer')]], 'rows', False),
    ('06-ambiguous-grade', [[row(grade='A?', earned=None)]], 'rows', False),
    ('07-in-progress', [[row(term='Spring 2027', grade=None, earned='0', status='in_progress')]], 'rows', False),
    ('08-missing-grade', [[row(grade=None)]], 'rows', False),
    ('09-missing-credits', [[row(attempted=None, earned=None)]], 'rows', False),
    ('10-empty-middle-page', [[BASE[0]], [], [BASE[1]]], 'rows', False),
    ('11-reversed-order', [list(reversed(BASE))], 'rows', False),
    ('12-totals-not-courses', [BASE], 'rows', False),
    ('13-earned-before-attempted', [[row(attempted='4', earned='0', grade='F')]], 'rows', False),
    ('14-scanned', [BASE], 'rows', True),
    ('15-empty-record', [[]], 'reject_empty', False),
    ('16-unsupported-document', [[]], 'reject_empty', False),
    ('17-truncated', [BASE], 'reject_pdf', False),
    ('18-encrypted', [BASE], 'reject_pdf', False),
]
manifest = []
for case_id, pages, expectation, scan in CASES:
    path = OUT / f'{case_id}.pdf'
    encryption = StandardEncryption('synthetic-test-only', canPrint=0) if case_id == '18-encrypted' else None
    doc = canvas.Canvas(str(path), pagesize=(850, 612), invariant=1, encrypt=encryption)
    doc.setTitle('SYNTHETIC PathCheck test document - no student data')
    for page_number, rows in enumerate(pages, 1):
        doc.setFont('Helvetica-Bold', 14)
        doc.drawString(28, 576, 'SYNTHETIC ACADEMIC RECORD - NOT A UNIVERSITY TRANSCRIPT')
        doc.setFont('Helvetica', 9)
        doc.drawString(28, 555, f'Fixture {case_id} | Page {page_number} of {len(pages)} | No student identifiers')
        doc.drawString(28, 537, 'Blank cells are unknown. Preserve printed values; do not infer academic rules.')
        order = list(range(8))
        if case_id == '13-earned-before-attempted':
            order[3], order[4] = order[4], order[3]
        x = 28
        doc.setFont('Helvetica-Bold', 8)
        for position, index in enumerate(order):
            doc.drawString(x, 505, HEADERS[index])
            x += WIDTHS[position]
        doc.line(28, 497, 822, 497)
        doc.setFont('Helvetica', 8)
        for index, values in enumerate(rows):
            x = 28
            for position, field_index in enumerate(order):
                value = values[FIELDS[field_index]]
                doc.drawString(x, 477 - index * 30, value or '')
                x += WIDTHS[position]
        if case_id == '12-totals-not-courses':
            doc.drawString(28, 365, 'Semester totals: attempted 7, earned 7. These totals are not course attempts.')
        if case_id == '16-unsupported-document':
            doc.drawString(28, 365, 'Library event schedule. Monday: Book club. Tuesday: Quiet reading. No coursework.')
        doc.showPage()
    doc.save()
    if scan:
        source = fitz.open(path)
        image_doc = fitz.open()
        for page in source:
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image_doc.new_page(width=850, height=612).insert_image(fitz.Rect(0, 0, 850, 612), stream=pix.tobytes('png'))
        image_doc.set_metadata({'title': 'SYNTHETIC scanned fixture - no student data'})
        image_doc.save(str(OUT / 'scan.tmp.pdf'), no_new_id=True)
        source.close()
        image_doc.close()
        (OUT / 'scan.tmp.pdf').replace(path)
    if case_id == '17-truncated':
        path.write_bytes(path.read_bytes()[:200])
    content = path.read_bytes()
    manifest.append({'id': case_id, 'file': path.name, 'sha256': hashlib.sha256(content).hexdigest(),
                     'expected': expectation, 'pages': len(pages), 'rows': [r for p in pages for r in p],
                     'rowPages': [i for i, p in enumerate(pages, 1) for _ in p]})
    if expectation != 'reject_pdf':
        with fitz.open(path) as rendered:
            for page_index, page in enumerate(rendered):
                page.get_pixmap(matrix=fitz.Matrix(1.3, 1.3), alpha=False).save(str(OUT / f'{case_id}-page-{page_index + 1}.png'))
(OUT / 'manifest.json').write_text(json.dumps({'syntheticOnly': True, 'version': 1, 'cases': manifest}, indent=2) + '\n')
print(f'Generated {len(manifest)} synthetic PDF fixtures and independent expected rows in {OUT}')
