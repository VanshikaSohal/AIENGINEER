from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta
import requests
import csv
from io import StringIO, BytesIO
import xml.etree.ElementTree as ET
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

load_dotenv()

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///weather.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

API_KEY              = os.getenv('API_KEY')
OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5/weather'
FORECAST_BASE_URL    = 'https://api.openweathermap.org/data/2.5/forecast'
GEO_DIRECT_URL       = 'http://api.openweathermap.org/geo/1.0/direct'
GEO_REVERSE_URL      = 'http://api.openweathermap.org/geo/1.0/reverse'
GEO_ZIP_URL          = 'http://api.openweathermap.org/geo/1.0/zip'


# One row per day. start_date/end_date are kept as the original range the user
# requested so exports can group by search session if needed.
class WeatherRecord(db.Model):
    __tablename__ = 'weather_records'

    id           = db.Column(db.Integer,     primary_key=True)
    location     = db.Column(db.String(120), nullable=False)
    date         = db.Column(db.String(10),  nullable=False)
    start_date   = db.Column(db.String(10),  nullable=False)
    end_date     = db.Column(db.String(10),  nullable=False)
    temp         = db.Column(db.Float,       nullable=True)
    feels_like   = db.Column(db.Float,       nullable=True)
    condition    = db.Column(db.String(120), nullable=True)
    humidity     = db.Column(db.Integer,     nullable=True)
    wind_speed   = db.Column(db.Float,       nullable=True)
    icon         = db.Column(db.String(20),  nullable=True)
    weather_data = db.Column(db.JSON,        nullable=True)
    created_at   = db.Column(db.DateTime,    default=datetime.utcnow)
    updated_at   = db.Column(db.DateTime,    default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id':           self.id,
            'location':     self.location,
            'date':         self.date,
            'start_date':   self.start_date,
            'end_date':     self.end_date,
            'temp':         self.temp,
            'feels_like':   self.feels_like,
            'condition':    self.condition,
            'humidity':     self.humidity,
            'wind_speed':   self.wind_speed,
            'icon':         self.icon,
            'weather_data': self.weather_data,
            'created_at':   self.created_at.isoformat(),
            'updated_at':   self.updated_at.isoformat(),
        }


with app.app_context():
    db.create_all()


def validate_date_range(start_str, end_str):
    try:
        start = datetime.strptime(start_str, '%Y-%m-%d')
        end   = datetime.strptime(end_str,   '%Y-%m-%d')
    except ValueError:
        return False, "Invalid date format. Use YYYY-MM-DD"
    if end < start:
        return False, "End date must be >= start date"
    if (end - start).days >= 5:
        return False, "Date range cannot exceed 5 days"
    return True, (start, end)


def fetch_forecast_by_coords(lat, lon):
    resp = requests.get(FORECAST_BASE_URL, params={
        'lat': lat, 'lon': lon, 'appid': API_KEY, 'units': 'metric'
    })
    resp.raise_for_status()
    return resp.json()


def best_forecast_for_date(forecast_list, target_date_str):
    # Prefer the midday slot so the temp represents the full day rather than
    # a late-night reading which skews cold.
    candidates = [f for f in forecast_list if f['dt_txt'].startswith(target_date_str)]
    if not candidates:
        return None
    for c in candidates:
        if c['dt_txt'] == f'{target_date_str} 12:00:00':
            return c
    return candidates[0]


def fetch_current_by_coords(lat, lon):
    resp = requests.get(OPENWEATHER_BASE_URL, params={
        'lat': lat, 'lon': lon, 'appid': API_KEY, 'units': 'metric'
    })
    resp.raise_for_status()
    return resp.json()


def extract_weather_fields(entry):
    if entry is None:
        return dict(temp=None, feels_like=None, condition=None,
                    humidity=None, wind_speed=None, icon=None)
    main         = entry.get('main', {})
    wind         = entry.get('wind', {})
    weather_list = entry.get('weather', [{}])
    return {
        'temp':       main.get('temp'),
        'feels_like': main.get('feels_like'),
        'condition':  weather_list[0].get('description', '') if weather_list else '',
        'humidity':   main.get('humidity'),
        'wind_speed': wind.get('speed'),
        'icon':       weather_list[0].get('icon', '') if weather_list else '',
    }


@app.route('/')
def home():
    return jsonify({'message': 'Weather App Backend Running'}), 200


@app.route('/api/test-weather')
def test_weather():
    try:
        resp = requests.get(OPENWEATHER_BASE_URL, params={
            'q': 'London', 'appid': API_KEY, 'units': 'metric'
        })
        resp.raise_for_status()
        return jsonify(resp.json()), 200
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/forecast')
def get_forecast():
    q   = request.args.get('q')
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    params = {'appid': API_KEY, 'units': 'metric'}
    if q:
        params['q'] = q
    elif lat and lon:
        params['lat'] = lat
        params['lon'] = lon
    else:
        return jsonify({'error': 'Provide q or lat and lon'}), 400
    try:
        resp = requests.get(FORECAST_BASE_URL, params=params)
        resp.raise_for_status()
        return jsonify(resp.json()), 200
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/weather/current')
def get_current_weather():
    q        = request.args.get('q',   '').strip()
    zip_code = request.args.get('zip', '').strip()
    lat      = request.args.get('lat', '').strip()
    lon      = request.args.get('lon', '').strip()

    params = {'appid': API_KEY, 'units': 'metric'}
    if q:
        params['q'] = q
    elif zip_code:
        params['zip'] = zip_code
    elif lat and lon:
        params['lat'] = lat
        params['lon'] = lon
    else:
        return jsonify({'error': 'Provide q, zip, or lat+lon'}), 400

    try:
        resp = requests.get(OPENWEATHER_BASE_URL, params=params)
        if resp.status_code == 404:
            return jsonify({'error': 'Location not found'}), 404
        resp.raise_for_status()
        data = resp.json()
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502

    fields = extract_weather_fields(data)
    return jsonify({
        'city_name': data.get('name', ''),
        'country':   data.get('sys', {}).get('country', ''),
        'coord':     data.get('coord', {}),
        **fields,
    }), 200


@app.route('/api/weather', methods=['POST'])
def create_weather_records():
    body = request.get_json()
    if not body:
        return jsonify({'error': 'JSON body required'}), 400

    missing = [k for k in ('location', 'lat', 'lon', 'start_date', 'end_date') if k not in body]
    if missing:
        return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

    location   = str(body['location']).strip()
    lat        = body['lat']
    lon        = body['lon']
    start_date = str(body['start_date']).strip()
    end_date   = str(body['end_date']).strip()

    valid, result = validate_date_range(start_date, end_date)
    if not valid:
        return jsonify({'error': result}), 400
    start_dt, end_dt = result

    try:
        forecast_json = fetch_forecast_by_coords(lat, lon)
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Forecast API error: {str(e)}'}), 502

    forecast_list = forecast_json.get('list', [])
    today_str     = datetime.utcnow().strftime('%Y-%m-%d')
    saved_records = []

    try:
        day = start_dt
        while day <= end_dt:
            date_str = day.strftime('%Y-%m-%d')
            entry    = best_forecast_for_date(forecast_list, date_str)

            # Forecast API only covers the next ~5 days from the current 3-hour block.
            # If today has no forecast slot yet (early request or late UTC day),
            # fall back to the live current-weather endpoint so temp is never None.
            if entry is None and date_str == today_str:
                try:
                    entry = fetch_current_by_coords(lat, lon)
                except requests.exceptions.RequestException:
                    pass

            fields = extract_weather_fields(entry)

            record = WeatherRecord(
                location   = location,
                date       = date_str,
                start_date = start_date,
                end_date   = end_date,
                temp       = fields['temp'],
                feels_like = fields['feels_like'],
                condition  = fields['condition'],
                humidity   = fields['humidity'],
                wind_speed = fields['wind_speed'],
                icon       = fields['icon'],
                weather_data = entry,
            )
            db.session.add(record)
            db.session.flush()
            saved_records.append(record.to_dict())
            day += timedelta(days=1)

        db.session.commit()
        return jsonify(saved_records), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error: {str(e)}'}), 500


@app.route('/api/weather', methods=['GET'])
def read_all_weather():
    records = WeatherRecord.query.order_by(WeatherRecord.date).all()
    return jsonify([r.to_dict() for r in records]), 200


@app.route('/api/weather/<int:record_id>', methods=['GET'])
def read_weather_by_id(record_id):
    record = WeatherRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Record not found'}), 404
    return jsonify(record.to_dict()), 200


@app.route('/api/weather/<int:record_id>', methods=['PUT'])
def update_weather_record(record_id):
    record = WeatherRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Record not found'}), 404

    body       = request.get_json() or {}
    location   = body.get('location',   record.location).strip()
    date       = body.get('date',       record.date).strip()
    start_date = body.get('start_date', record.start_date).strip()
    end_date   = body.get('end_date',   record.end_date).strip()
    lat        = body.get('lat')
    lon        = body.get('lon')

    if lat and lon:
        try:
            forecast_json = fetch_forecast_by_coords(lat, lon)
            entry  = best_forecast_for_date(forecast_json.get('list', []), date)
            fields = extract_weather_fields(entry)
            record.temp         = fields['temp']
            record.feels_like   = fields['feels_like']
            record.condition    = fields['condition']
            record.humidity     = fields['humidity']
            record.wind_speed   = fields['wind_speed']
            record.icon         = fields['icon']
            record.weather_data = entry
        except Exception as e:
            return jsonify({'error': f'Forecast fetch failed: {str(e)}'}), 502

    record.location   = location
    record.date       = date
    record.start_date = start_date
    record.end_date   = end_date

    try:
        db.session.commit()
        return jsonify(record.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error: {str(e)}'}), 500


@app.route('/api/weather/<int:record_id>', methods=['DELETE'])
def delete_weather_record(record_id):
    record = WeatherRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Record not found'}), 404
    try:
        db.session.delete(record)
        db.session.commit()
        return jsonify({'message': 'Record deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error: {str(e)}'}), 500


@app.route('/api/geocode')
def geocode():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': 'Provide q parameter'}), 400
    try:
        resp = requests.get(GEO_DIRECT_URL, params={'q': q, 'limit': 5, 'appid': API_KEY})
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502
    return jsonify([{
        'name':    i.get('name', ''),
        'state':   i.get('state', ''),
        'country': i.get('country', ''),
        'lat':     i.get('lat'),
        'lon':     i.get('lon'),
    } for i in resp.json()]), 200


@app.route('/api/geocode/zip')
def geocode_zip():
    zip_code = request.args.get('zip', '').strip()
    if not zip_code:
        return jsonify({'error': 'Provide zip parameter'}), 400

    # 6-digit all-numeric codes are treated as Indian postal codes
    lookup  = f'{zip_code},IN' if (zip_code.isdigit() and len(zip_code) == 6) else zip_code
    results = []

    try:
        resp = requests.get(GEO_ZIP_URL, params={'zip': lookup, 'appid': API_KEY})
        if resp.status_code == 200:
            d = resp.json()
            results = [{'name': d.get('name', zip_code), 'state': '',
                        'country': d.get('country', ''),
                        'lat': d.get('lat'), 'lon': d.get('lon')}]
    except requests.exceptions.RequestException:
        pass

    # Fall back to text search so international codes still resolve
    if not results:
        try:
            resp2 = requests.get(GEO_DIRECT_URL, params={'q': zip_code, 'limit': 5, 'appid': API_KEY})
            if resp2.status_code == 200:
                results = [{'name': i.get('name', ''), 'state': i.get('state', ''),
                            'country': i.get('country', ''),
                            'lat': i.get('lat'), 'lon': i.get('lon')}
                           for i in resp2.json()]
        except requests.exceptions.RequestException:
            pass

    if not results:
        return jsonify({'error': 'Postal code not found'}), 404
    return jsonify(results), 200


@app.route('/api/geocode/reverse')
def geocode_reverse():
    lat = request.args.get('lat', '').strip()
    lon = request.args.get('lon', '').strip()
    if not lat or not lon:
        return jsonify({'error': 'Provide lat and lon'}), 400
    try:
        resp = requests.get(GEO_REVERSE_URL, params={'lat': lat, 'lon': lon, 'limit': 5, 'appid': API_KEY})
        resp.raise_for_status()
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 502
    return jsonify([{
        'name':    i.get('name', ''),
        'state':   i.get('state', ''),
        'country': i.get('country', ''),
        'lat':     i.get('lat'),
        'lon':     i.get('lon'),
    } for i in resp.json()]), 200


@app.route('/api/youtube')
def youtube_links():
    location = request.args.get('location', '').strip()
    if not location:
        return jsonify({'error': 'Provide a location parameter'}), 400
    tq = requests.utils.quote(f'{location} travel')
    wq = requests.utils.quote(f'{location} weather')
    gq = requests.utils.quote(f'{location} travel guide')
    return jsonify({
        'location':   location,
        'search_url': f'https://www.youtube.com/results?search_query={tq}+weather',
        'embeds': [
            {'title': f'{location} — Travel',       'src': f'https://www.youtube-nocookie.com/embed?listType=search&list={tq}'},
            {'title': f'{location} — Weather',      'src': f'https://www.youtube-nocookie.com/embed?listType=search&list={wq}'},
            {'title': f'{location} — Travel Guide', 'src': f'https://www.youtube-nocookie.com/embed?listType=search&list={gq}'},
        ],
    }), 200


EXPORT_HEADERS = [
    'Location', 'Date', 'Start Date', 'End Date',
    'Temp (°C)', 'Feels Like (°C)', 'Condition',
    'Humidity (%)', 'Wind Speed (m/s)', 'Created At',
]


def record_to_export_row(r):
    return [
        r.location,
        r.date,
        r.start_date,
        r.end_date,
        str(r.temp)       if r.temp       is not None else 'N/A',
        str(r.feels_like) if r.feels_like is not None else 'N/A',
        r.condition       or 'N/A',
        str(r.humidity)   if r.humidity   is not None else 'N/A',
        str(r.wind_speed) if r.wind_speed is not None else 'N/A',
        r.created_at.strftime('%Y-%m-%d %H:%M'),
    ]


@app.route('/api/export/csv')
def export_csv():
    records = WeatherRecord.query.order_by(WeatherRecord.date).all()
    if not records:
        return jsonify({'error': 'No records to export'}), 404

    out = StringIO()
    # sep= hint tells Excel which delimiter to use when opening the file directly
    out.write('sep=,\r\n')
    w = csv.writer(out, quoting=csv.QUOTE_ALL)  # quote every field so commas in values never break columns
    w.writerow(EXPORT_HEADERS)
    for r in records:
        w.writerow(record_to_export_row(r))

    return out.getvalue(), 200, {
        'Content-Disposition': 'attachment; filename=weather_records.csv',
        'Content-Type': 'text/csv; charset=utf-8',
    }


@app.route('/api/export/json')
def export_json():
    records = WeatherRecord.query.order_by(WeatherRecord.date).all()
    if not records:
        return jsonify({'error': 'No records to export'}), 404
    return jsonify([dict(zip(EXPORT_HEADERS, record_to_export_row(r))) for r in records]), 200


@app.route('/api/export/xml')
def export_xml():
    records = WeatherRecord.query.order_by(WeatherRecord.date).all()
    if not records:
        return jsonify({'error': 'No records to export'}), 404
    TAG_MAP = {
        'Location': 'location', 'Date': 'date',
        'Start Date': 'start_date', 'End Date': 'end_date',
        'Temp (°C)': 'temp_c', 'Feels Like (°C)': 'feels_like_c',
        'Condition': 'condition', 'Humidity (%)': 'humidity_pct',
        'Wind Speed (m/s)': 'wind_speed_ms', 'Created At': 'created_at',
    }
    root = ET.Element('weather_records')
    for r in records:
        rec_el = ET.SubElement(root, 'record')
        for h, v in zip(EXPORT_HEADERS, record_to_export_row(r)):
            ET.SubElement(rec_el, TAG_MAP[h]).text = v
    tree = ET.ElementTree(root)
    ET.indent(tree, space='  ')
    buf = BytesIO()
    tree.write(buf, encoding='utf-8', xml_declaration=True)
    return Response(buf.getvalue(), 200, mimetype='application/xml',
                    headers={'Content-Disposition': 'attachment; filename=weather_records.xml'})


@app.route('/api/export/markdown')
def export_markdown():
    records = WeatherRecord.query.order_by(WeatherRecord.date).all()
    if not records:
        return jsonify({'error': 'No records to export'}), 404
    lines = [
        '# Weather Records Export',
        '',
        f'_Exported at {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")} UTC_',
        '',
        '| ' + ' | '.join(EXPORT_HEADERS) + ' |',
        '| ' + ' | '.join(['---'] * len(EXPORT_HEADERS)) + ' |',
    ]
    for r in records:
        lines.append('| ' + ' | '.join(record_to_export_row(r)) + ' |')
    return Response('\n'.join(lines) + '\n', 200, mimetype='text/markdown',
                    headers={'Content-Disposition': 'attachment; filename=weather_records.md'})


@app.route('/api/export/pdf')
def export_pdf():
    records = WeatherRecord.query.order_by(WeatherRecord.date).all()
    if not records:
        return jsonify({'error': 'No records to export'}), 404
    from reportlab.lib.pagesizes import landscape
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(letter),
                            leftMargin=20, rightMargin=20, topMargin=28, bottomMargin=20)
    styles = getSampleStyleSheet()
    elements = [
        Paragraph('Weather Records Export', styles['Title']),
        Paragraph(f'Generated: {datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")} UTC', styles['Normal']),
        Spacer(1, 10),
    ]
    rows       = [EXPORT_HEADERS] + [record_to_export_row(r) for r in records]
    col_widths = [80, 58, 54, 54, 44, 52, 90, 52, 68, 78]
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND',     (0, 0), (-1, 0),  colors.HexColor('#2c3e50')),
        ('TEXTCOLOR',      (0, 0), (-1, 0),  colors.white),
        ('FONTNAME',       (0, 0), (-1, 0),  'Helvetica-Bold'),
        ('FONTSIZE',       (0, 0), (-1, 0),  7),
        ('ALIGN',          (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE',       (0, 1), (-1, -1), 7),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f2f2f2')]),
        ('GRID',           (0, 0), (-1, -1), 0.4, colors.HexColor('#cccccc')),
        ('TOPPADDING',     (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING',  (0, 0), (-1, -1), 3),
    ]))
    elements.append(table)
    doc.build(elements)
    return Response(buf.getvalue(), 200, mimetype='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename=weather_records.pdf'})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
