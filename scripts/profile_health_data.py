"""Profile downloaded public research data; emit metadata, never patient rows."""
from collections import Counter
import csv
from datetime import datetime
import io
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/healthcare'
OUT = ROOT / 'research/healthcare'


def csv_profile(stream, dates, categories):
    reader = csv.DictReader(stream)
    counts = {k: Counter() for k in categories}
    ranges = {k: set() for k in dates}
    missing = Counter()
    rows = 0
    malformed = 0
    for row in reader:
        rows += 1
        malformed += int(None in row or any(v is None for v in row.values()))
        for k, v in row.items():
            if v is None or v == '':
                missing[str(k)] += 1
        for k in categories:
            counts[k][row.get(k, '')] += 1
        for k, fmt in dates.items():
            value = row.get(k, '')
            if value:
                ranges[k].add(datetime.strptime(value, fmt).date().isoformat())
    return {'rows': rows, 'columns': reader.fieldnames, 'malformed_rows': malformed,
            'empty_cells_by_column': dict(missing),
            'categories': {k: dict(v) for k, v in counts.items()},
            'dates': {k: {'min': min(v), 'max': max(v), 'distinct': len(v)}
                      for k, v in ranges.items() if v}}


def main():
    result = {}
    with (RAW / 'cer_appointments.bin').open(encoding='utf-8-sig', newline='') as f:
        result['cer_appointments'] = csv_profile(
            f, {'appointment_date': '%d/%m/%Y'}, ['no_show', 'specialty', 'appointment_year'])
    with (RAW / 'nhs_national.bin').open(encoding='utf-8-sig', newline='') as f:
        result['nhs_national'] = csv_profile(
            f, {'APPOINTMENT_MONTH': '%b%Y'}, ['APPT_STATUS', 'HCP_TYPE', 'APPT_MODE'])
    for source in ['nhs_daily', 'nhs_regional']:
        with zipfile.ZipFile(RAW / (source + '.bin')) as z:
            members = [{'name': i.filename, 'bytes': i.file_size} for i in z.infolist()]
            # Verify two full members rather than expanding the >1GB daily archive.
            profiles = {}
            for member in members[:2]:
                with z.open(member['name']) as raw:
                    date_key, fmt = ('Appointment_Date', '%d%b%Y') if source == 'nhs_daily' else ('APPOINTMENT_MONTH', '%b%Y')
                    profiles[member['name']] = csv_profile(
                        io.TextIOWrapper(raw, encoding='utf-8-sig', newline=''),
                        {date_key: fmt}, ['APPT_STATUS', 'HCP_TYPE', 'TIME_BETWEEN_BOOK_AND_APPT'])
            result[source] = {'archive_members': members, 'profiled_members': profiles,
                              'coverage': 'First two complete CSV members only; remaining members not row-profiled.'}
    data = json.loads((RAW / 'vdh_records.json').read_text(encoding='utf-8'))['result']
    records = data['records']
    district = [r for r in records if r['Health District'] == 'New River']
    def vdh_summary(rows):
        dates = sorted({r['Week Ending Date'] for r in rows})
        return {'rows': len(rows), 'first_week': dates[0] if dates else None,
                'last_week': dates[-1] if dates else None, 'distinct_weeks': len(dates),
                'facilities': dict(Counter(r['Facility Type'] for r in rows)),
                'suppressed_cells': sum(v == '*' for r in rows for v in r.values()),
                'report_dates': sorted({r['Report Date'] for r in rows})}
    result['vdh_respiratory'] = {
        'api_reported_total': data['total'], 'complete_download': len(records) == data['total'],
        'columns': [f['id'] for f in data['fields']], 'all': vdh_summary(records),
        'district_labels': sorted({r['Health District'] for r in records}),
        'new_river': vdh_summary(district)}
    npi = json.loads((RAW / 'npi_blacksburg.json').read_text(encoding='utf-8'))
    result['npi_blacksburg'] = {'query_limit': 20, 'returned': npi['result_count'],
                              'fields': sorted(npi['results'][0]),
                              'is_complete_directory': False}
    weather = json.loads((RAW / 'nasa_weather.json').read_text(encoding='utf-8'))
    result['nasa_weather'] = {'header': weather['header'], 'parameters': weather['parameters'],
        'values_per_parameter': {k: len(v) for k, v in weather['properties']['parameter'].items()},
        'missing_values': sum(value == weather['header']['fill_value']
                              for p in weather['properties']['parameter'].values() for value in p.values())}
    (OUT / 'data_profiles.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print('Saved research/healthcare/data_profiles.json')
    print('CER rows:', result['cer_appointments']['rows'])
    print('NHS national aggregate rows:', result['nhs_national']['rows'])
    print('VDH rows:', len(records), 'New River rows:', len(district))


if __name__ == '__main__':
    main()
