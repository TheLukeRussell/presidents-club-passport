# Builds templates/presidents-club-tracker.xlsx, the empty sheet the passport
# reads: a "Start here" tab with step-by-step instructions, then the Reps and
# Stamps tabs as named tables with dropdowns.
#
#   npm run template                  rebuilds the template
#   npm run template -- --sample OUT  also writes a copy filled with the demo's
#                                     sample data to OUT (keep it out of the
#                                     repo; .gitignore blocks it anyway)
#
# Needs python3 with openpyxl (pip install openpyxl).

import json
import sys
from datetime import date
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'templates' / 'presidents-club-tracker.xlsx'

TEAMS = ['Communications', 'POSB', 'NetSec', 'Cisco', 'Federal']
ACTIVITIES = ['Supplier training', 'Supplier fair', 'Hub course', 'Club Express', 'Quota']
FORMATS = ['In person', 'Virtual']
SUPPLIERS = ['Zebra', 'Honeywell', 'HP Poly', 'HPE Aruba', 'Juniper', 'Extreme Networks', 'Cambium',
             'Datalogic', 'ASSA ABLOY', 'Panasonic', 'Brady', 'Pioneer', 'Cisco']
DATE_FORMAT = 'yyyy-mm-dd'
LAST = 5000  # the dropdowns reach this far down, so they cover the tables as they grow

NAVY = '1F3A68'
FOG = 'F2F2F5'
WHITE = Font(bold=True, color='FFFFFF')
NAVY_FILL = PatternFill('solid', fgColor=NAVY)
FOG_FILL = PatternFill('solid', fgColor=FOG)
WRAP = Alignment(wrap_text=True, vertical='top')
RULE = Border(bottom=Side(style='thin', color='C8C8CC'))


def listed(values):
    return '"' + ','.join(values) + '"'


# ---- The data tabs ----------------------------------------------------------

def header(ws, columns, widths):
    for i, (name, width) in enumerate(zip(columns, widths), start=1):
        cell = ws.cell(row=1, column=i, value=name)
        cell.font = WHITE
        cell.fill = NAVY_FILL
        ws.column_dimensions[cell.column_letter].width = width
    ws.freeze_panes = 'A2'


def table(ws, name, columns, rows):
    last_col = ws.cell(row=1, column=len(columns)).column_letter
    t = Table(displayName=name, ref=f'A1:{last_col}{max(2, len(rows) + 1)}')
    t.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showRowStripes=True)
    ws.add_table(t)


def tip(ws, letter, title, text):
    # A note that pops up when someone clicks a cell in the column. Excel
    # allows one rule per cell, so columns with a dropdown carry it there.
    dv = DataValidation(allow_blank=True, showInputMessage=True, promptTitle=title, prompt=text)
    ws.add_data_validation(dv)
    dv.add(f'{letter}2:{letter}{LAST}')


def pick(ws, letter, values, error_title, error, style='stop', tip_title=None, tip_text=None, formula=None):
    dv = DataValidation(type='list', formula1=formula or listed(values), allow_blank=True,
                        showErrorMessage=True, errorStyle=style, errorTitle=error_title, error=error)
    if tip_text:
        dv.showInputMessage = True
        dv.promptTitle = tip_title
        dv.prompt = tip_text
    ws.add_data_validation(dv)
    dv.add(f'{letter}2:{letter}{LAST}')


def date_column(ws, letter, tip_title, tip_text):
    ws.column_dimensions[letter].number_format = DATE_FORMAT
    dv = DataValidation(type='date', operator='between', formula1='DATE(2000,1,1)', formula2='DATE(2099,12,31)',
                        allow_blank=True, showErrorMessage=True, errorTitle='Not a date',
                        error='Type a date, like 6/17/2027.', showInputMessage=True,
                        promptTitle=tip_title, prompt=tip_text)
    ws.add_data_validation(dv)
    dv.add(f'{letter}2:{letter}{LAST}')


def fill(ws, rows, date_columns):
    for r, values in enumerate(rows, start=2):
        for c, value in enumerate(values, start=1):
            cell = ws.cell(row=r, column=c, value=value)
            if c in date_columns:
                cell.number_format = DATE_FORMAT


def reps_tab(wb, rows):
    ws = wb.create_sheet('Reps')
    columns = ['rep_email', 'rep_name', 'team', 'start_date']
    header(ws, columns, [34, 24, 18, 13])
    fill(ws, rows, {4})
    table(ws, 'Reps', columns, rows)
    tip(ws, 'A', 'Work email', 'It has to match the Stamps tab exactly.')
    tip(ws, 'B', 'Name', 'First and last, the way it should show on the passport.')
    pick(ws, 'C', TEAMS, 'Pick a team', 'Choose Communications, POSB, NetSec, Cisco or Federal from the list.',
         tip_title='Team', tip_text='Pick from the list.')
    date_column(ws, 'D', 'Start date', 'Only if they joined after July 1, 2026. Otherwise leave it blank.')


def stamps_tab(wb, rows):
    ws = wb.create_sheet('Stamps')
    columns = ['rep_email', 'activity', 'event', 'supplier', 'date', 'format', 'location']
    header(ws, columns, [34, 19, 36, 18, 13, 12, 16])
    fill(ws, rows, {5})
    table(ws, 'Stamps', columns, rows)
    pick(ws, 'A', None, 'Not on the Reps tab', 'This email isn’t on the Reps tab yet. Add them there too, or the stamp won’t count.',
         style='warning', formula='INDIRECT("Reps[rep_email]")',
         tip_title='Work email', tip_text='Same as on the Reps tab.')
    pick(ws, 'B', ACTIVITIES, 'Pick an activity',
         'Choose Supplier training, Supplier fair, Hub course, Club Express or Quota from the list.',
         tip_title='What they did', tip_text='Pick from the list. See Start here for what goes with each.')
    tip(ws, 'C', 'Event name', 'The same name for everyone at the same event. Copy and paste the row; don’t drag it.')
    pick(ws, 'D', SUPPLIERS, 'New supplier?', 'This supplier isn’t on the list. Keep it if it’s a new one.',
         style='information', tip_title='Supplier', tip_text='Supplier trainings and Hub courses only.')
    date_column(ws, 'E', 'Date', 'The day it happened. For a Hub course, the day they finished.')
    pick(ws, 'F', FORMATS, 'In person or virtual', 'Choose In person or Virtual, or leave it blank.',
         tip_title='In person or virtual', tip_text='Supplier trainings only. Leave it blank for everything else.')
    tip(ws, 'G', 'City', 'Where it was. Leave it blank for online.')


# ---- Start here -------------------------------------------------------------

# Seven columns, sized for the "what to type" table in step 2. Prose sits in
# cells merged across all of them.
WIDTHS = [32, 18, 30, 16, 16, 11, 14]


class Page:
    def __init__(self, ws):
        self.ws = ws
        self.row = 1
        for i, width in enumerate(WIDTHS, start=1):
            ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = width
        ws.sheet_view.showGridLines = False

    def _height(self, text, width, size):
        # Excel won't grow a merged row to fit wrapped text, so set it.
        lines = sum(max(1, -(-len(part) // int(width * 1.05))) for part in text.split('\n'))
        self.ws.row_dimensions[self.row].height = max(16, lines * 15.5) * size / 11 + 4

    def text(self, value, bold=False, size=11, italic=False, color=None):
        cell = self.ws.cell(row=self.row, column=1, value=value)
        cell.font = Font(bold=bold, size=size, italic=italic, color=color)
        cell.alignment = WRAP
        self.ws.merge_cells(start_row=self.row, start_column=1, end_row=self.row, end_column=len(WIDTHS))
        self._height(value, sum(WIDTHS), size)
        self.row += 1

    def band(self, value):
        # A navy bar that starts each step.
        for c in range(1, len(WIDTHS) + 1):
            self.ws.cell(row=self.row, column=c).fill = NAVY_FILL
        cell = self.ws.cell(row=self.row, column=1, value=value)
        cell.font = Font(bold=True, size=13, color='FFFFFF')
        cell.alignment = Alignment(vertical='center')
        self.ws.merge_cells(start_row=self.row, start_column=1, end_row=self.row, end_column=len(WIDTHS))
        self.ws.row_dimensions[self.row].height = 24
        self.row += 1

    def pair(self, label, value):
        a = self.ws.cell(row=self.row, column=1, value=label)
        a.font = Font(bold=True)
        a.alignment = WRAP
        b = self.ws.cell(row=self.row, column=2, value=value)
        b.alignment = WRAP
        self.ws.merge_cells(start_row=self.row, start_column=2, end_row=self.row, end_column=len(WIDTHS))
        self._height(value, sum(WIDTHS[1:]), 11)
        self.row += 1

    def grid(self, rows, head=False, dates=()):
        for values in rows:
            longest = 1
            for c, value in enumerate(values, start=1):
                cell = self.ws.cell(row=self.row, column=c, value=value)
                cell.alignment = WRAP
                cell.border = RULE
                if c in dates and isinstance(value, date):
                    cell.number_format = DATE_FORMAT
                if head:
                    cell.font = Font(bold=True)
                    cell.fill = FOG_FILL
                elif c == 1:
                    cell.font = Font(bold=True)
                elif value == '(leave blank)':
                    cell.font = Font(italic=True, color='6B6C70')
                if isinstance(value, str):
                    longest = max(longest, -(-len(value) // int(WIDTHS[c - 1] * 1.05)))
            self.ws.row_dimensions[self.row].height = longest * 15.5 + 4
            self.row += 1

    def gap(self):
        self.row += 1


def start_here(wb):
    ws = wb.active
    ws.title = 'Start here'
    p = Page(ws)
    BLANK = '(leave blank)'

    p.text('President’s Club tracker', bold=True, size=18)
    p.text('This sheet feeds the President’s Club Passport. Add a row whenever a rep does something that counts, '
           'and their passport and the Standings pick it up.')
    p.text('It takes about five minutes to learn. Read this page once, then use the Reps and Stamps tabs. '
           'Use Excel, on the desktop or online: Google Sheets and Numbers lose the dropdowns.', italic=True)
    p.gap()

    p.text('Three rules', bold=True, size=13)
    p.text('1.  Don’t rename the tabs or change the headers in row 1. The passport finds them by name.')
    p.text('2.  Start in row 2 of each tab and keep going down. The table grows on its own.')
    p.text('3.  Only add what actually happened. Not events coming up, and not ones someone was invited to but skipped.')
    p.gap()

    p.band('Step 1.  Add every rep (Reps tab)')
    p.text('One row per person in the program. Do it once at the start, then again only when someone joins.')
    p.pair('rep_email', 'Their work email. Stamps are matched to the rep by this, so it has to be spelled the same on both tabs.')
    p.pair('rep_name', 'First and last name, the way it should show on their passport.')
    p.pair('team', 'Pick from the list: Communications, POSB, NetSec, Cisco or Federal.')
    p.pair('start_date', 'Only for someone who joined after the program started on July 1, 2026, like a new hire. '
                         'Leave it blank for everyone else. Don’t log anything from before their start date.')
    p.gap()

    p.band('Step 2.  Add a row each time someone earns a stamp (Stamps tab)')
    p.text('Pick the rep’s email from the dropdown in the first column. Then find what happened below and fill in the '
           'rest of the row the same way. “Like …” is an example; words in quotes are typed exactly.')
    p.grid([['What happened', 'activity', 'event', 'supplier', 'date', 'format', 'location']], head=True)
    p.grid([
        ['Went to a supplier training in person', 'Supplier training', 'The training’s name, like Zebra solutions workshop', 'The supplier, like Zebra', 'The day', 'In person', 'The city, like Greenville'],
        ['Joined a supplier training online', 'Supplier training', 'The training’s name, like Zebra partner training', 'The supplier, like Zebra', 'The day', 'Virtual', BLANK],
        ['Went to a supplier fair', 'Supplier fair', 'The fair’s name, like Fall Supplier Fair', BLANK, 'The day', BLANK, 'The city, or “Online”'],
        ['Finished a course on the Hub', 'Hub course', 'The course’s title, like Meraki fundamentals', 'The supplier, like Cisco', 'The day they finished', BLANK, BLANK],
        ['Went to Club Express', 'Club Express', '“Club Express Fall” or “Club Express Spring”', BLANK, 'The day', BLANK, 'The city'],
        ['Hit their sales growth quota', 'Quota', '“Sales growth quota”', BLANK, 'The day results came in', BLANK, BLANK],
    ])
    p.gap()
    p.pair('A whole room?', 'Fill in one row, then copy it and paste it once for each person (Ctrl+C, then Ctrl+V; Cmd on a Mac), '
                            'and change only the email. Don’t drag the corner of the cell down: Excel adds a day to the date on every row. '
                            'The same event name and date for everyone is how the passport knows they were at the same event.')
    p.pair('Quota', 'Results come in at the end of June. Add one Quota row for each rep who hit it, and leave everyone else off.')
    p.pair('Not sure?', 'Leave it out and ask. A missing row is easy to add later; a wrong one gives someone a stamp they didn’t earn.')
    p.pair('Someone leaves', 'Leave their rows where they are, and ask before deleting anything.')
    p.pair('Your own notes', 'Add a column at the far right if you like. The passport ignores it.')
    p.gap()

    p.band('Step 3.  Check before you save')
    p.text('☐  Every email on the Stamps tab is also on the Reps tab, spelled the same. (Stamps warns you when it isn’t.)')
    p.text('☐  Everyone at the same event has the same event name and the same date.')
    p.text('☐  Every supplier training says In person or Virtual. A blank one counts as virtual.')
    p.text('☐  Dates are real dates. Type them like 9/23/2026, and Excel shows them as 2026-09-23. If one sits on the left of its cell, it’s text, so type it again.')
    p.text('☐  Nothing is in there that hasn’t happened yet.')
    p.gap()

    p.band('Step 4.  Save it in the shared folder')
    p.text('Save it where your team keeps it, under the same file name. That’s the copy the passport reads. '
           'Reading it straight from there is still being set up, so for now the demo shows sample data.')
    p.gap()

    p.band('What counts toward President’s Club')
    p.text('A rep qualifies once they’ve met all five. Stamps past a minimum still count toward their total on the Standings.')
    p.pair('Supplier trainings', '4 in person. Virtual ones earn a stamp too, but don’t count toward the 4.')
    p.pair('Supplier fairs', '2')
    p.pair('Hub courses', '2 supplier courses finished on the Hub')
    p.pair('Club Express', 'Both events, Fall and Spring')
    p.pair('Sales growth quota', 'Hit it. That one is the gold seal.')
    p.gap()

    p.band('Every column, explained')
    p.pair('rep_email', 'The rep’s work email, the same on both tabs. On Stamps, pick it from the dropdown.')
    p.pair('activity', 'Supplier training, Supplier fair, Hub course, Club Express or Quota. Pick from the list.')
    p.pair('event', 'The event’s name, the same for everyone who was there. For quota, type Sales growth quota.')
    p.pair('supplier', 'Supplier trainings and Hub courses only. Pick from the list, or type a new one. Leave it blank for the rest.')
    p.pair('date', 'The day they attended, the day they finished the Hub course, or the day quota results came in.')
    p.pair('format', 'Supplier trainings only: In person or Virtual.')
    p.pair('location', 'The city, like Greenville, when there is one. Leave it blank for online trainings and Hub courses.')
    p.gap()

    p.text('Made-up examples', bold=True, size=13)
    p.text('This is what a few filled-in rows look like. Don’t copy them into the real tabs.', italic=True)
    p.text('On the Reps tab', bold=True)
    p.grid([['rep_email', 'rep_name', 'team', 'start_date']], head=True)
    p.grid([
        ['sam.sample@example.com', 'Sam Sample', 'POSB', None],
        ['pat.placeholder@example.com', 'Pat Placeholder', 'Federal', date(2027, 3, 2)],
    ], dates=(4,))
    p.gap()
    p.text('On the Stamps tab', bold=True)
    p.grid([['rep_email', 'activity', 'event', 'supplier', 'date', 'format', 'location']], head=True)
    p.grid([
        ['sam.sample@example.com', 'Supplier training', 'Zebra solutions workshop', 'Zebra', date(2026, 9, 23), 'In person', 'Greenville'],
        ['sam.sample@example.com', 'Supplier training', 'Cisco partner training', 'Cisco', date(2027, 2, 10), 'Virtual', None],
        ['sam.sample@example.com', 'Supplier fair', 'Fall Supplier Fair', None, date(2026, 9, 10), None, 'Atlanta'],
        ['sam.sample@example.com', 'Hub course', 'Meraki fundamentals', 'Cisco', date(2026, 11, 2), None, None],
        ['sam.sample@example.com', 'Quota', 'Sales growth quota', None, date(2027, 6, 30), None, None],
        ['pat.placeholder@example.com', 'Club Express', 'Club Express Spring', None, date(2027, 6, 17), None, 'Greenville'],
    ], dates=(5,))

    # Prints on one page width, portrait.
    ws.page_setup.orientation = 'portrait'
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


# ---- Build ------------------------------------------------------------------

def sample_rows():
    data = json.loads((ROOT / 'public' / 'data' / 'passport.json').read_text())
    act = {'training': 'Supplier training', 'fair': 'Supplier fair', 'hub': 'Hub course', 'club': 'Club Express', 'quota': 'Quota'}
    fmt = {'in person': 'In person', 'virtual': 'Virtual', '': None}
    day = lambda s: date.fromisoformat(s) if s else None
    reps = [(r['rep_email'], r['rep_name'], r['team'], day(r['start_date'])) for r in data['reps']]
    stamps = [(s['rep_email'], act[s['activity']], s['event'], s['supplier'] or None, day(s['date']), fmt[s['format']], s['location'] or None)
              for s in data['stamps']]
    return reps, stamps


def build(path, reps=(), stamps=()):
    wb = Workbook()
    wb.properties.creator = 'Luke Russell'
    wb.properties.lastModifiedBy = 'Luke Russell'
    wb.properties.title = 'President’s Club tracker'
    start_here(wb)
    reps_tab(wb, list(reps))
    stamps_tab(wb, list(stamps))
    wb.active = 0  # opens on Start here
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    print(f'Wrote {path}')


build(OUT)
if '--sample' in sys.argv:
    target = Path(sys.argv[sys.argv.index('--sample') + 1]).resolve()
    build(target, *sample_rows())
