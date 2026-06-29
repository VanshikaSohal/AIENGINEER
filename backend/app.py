from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
import os
from datetime import datetime, timedelta
import requests
import csv
import json
from io import StringIO

load_dotenv()

app = Flask(__name__)
CORS(app)

# SQLite database configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///weather.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

API_KEY = os.getenv('API_KEY')
OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5/weather'
FORECAST_BASE_URL = 'https://api.openweathermap.org/data/2.5/forecast'


@app.route('/api/forecast')
def get_forecast():
    """Fetch 5-day forecast from OpenWeather for a given city (q) or coords"""
    q = request.args.get('q')
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    params = {
        'appid': API_KEY,
        'units': 'metric'
    }
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


# SQLAlchemy Model: WeatherRecord
class WeatherRecord(db.Model):
    __tablename__ = 'weather_records'
    
    id = db.Column(db.Integer, primary_key=True)
    location = db.Column(db.String(120), nullable=False)
    start_date = db.Column(db.String(10), nullable=False)
    end_date = db.Column(db.String(10), nullable=False)
    weather_data = db.Column(db.JSON, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'location': self.location,
            'start_date': self.start_date,
            'end_date': self.end_date,
            'weather_data': self.weather_data,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }

# Create tables
with app.app_context():
    db.create_all()

def validate_date_range(start_date_str, end_date_str):
    """Validate date range: both valid dates, end >= start"""
    try:
        start = datetime.strptime(start_date_str, '%Y-%m-%d')
        end = datetime.strptime(end_date_str, '%Y-%m-%d')
    except ValueError:
        return False, "Invalid date format. Use YYYY-MM-DD"
    
    if end < start:
        return False, "End date must be >= start date"
    
    if (end - start).days > 5:
        return False, "Date range cannot exceed 5 days"
    
    return True, "Valid"

def validate_location(city):
    """Validate location exists by calling OpenWeather API"""
    try:
        response = requests.get(OPENWEATHER_BASE_URL, params={
            'q': city,
            'appid': API_KEY,
            'units': 'metric'
        })
        if response.status_code == 404:
            return False, "City not found"
        response.raise_for_status()
        return True, response.json()
    except requests.exceptions.RequestException as e:
        return False, f"API error: {str(e)}"

@app.route('/')
def home():
    return jsonify({'message': 'Weather App Backend Running'}), 200

@app.route('/api/test-weather')
def test_weather():
    """Test route: fetch weather for hardcoded city"""
    city = 'London'
    try:
        response = requests.get(OPENWEATHER_BASE_URL, params={
            'q': city,
            'appid': API_KEY,
            'units': 'metric'
        })
        response.raise_for_status()
        return jsonify(response.json()), 200
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/weather', methods=['POST'])
def create_weather_record():
    """CREATE: Submit location + date range -> validate -> fetch weather -> store"""
    data = request.get_json()
    
    if not data or 'location' not in data or 'start_date' not in data or 'end_date' not in data:
        return jsonify({'error': 'Missing location, start_date, or end_date'}), 400
    
    location = data['location'].strip()
    start_date = data['start_date'].strip()
    end_date = data['end_date'].strip()
    
    valid, msg = validate_date_range(start_date, end_date)
    if not valid:
        return jsonify({'error': msg}), 400
    
    valid, result = validate_location(location)
    if not valid:
        return jsonify({'error': result}), 400
    
    weather_data = result
    
    try:
        record = WeatherRecord(
            location=location,
            start_date=start_date,
            end_date=end_date,
            weather_data=weather_data
        )
        db.session.add(record)
        db.session.commit()
        return jsonify(record.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/weather', methods=['GET'])
def read_all_weather():
    """READ: Get all stored weather records"""
    records = WeatherRecord.query.all()
    return jsonify([record.to_dict() for record in records]), 200

@app.route('/api/weather/<int:record_id>', methods=['GET'])
def read_weather_by_id(record_id):
    """READ: Get one record by ID"""
    record = WeatherRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Record not found'}), 404
    return jsonify(record.to_dict()), 200

@app.route('/api/weather/<int:record_id>', methods=['PUT'])
def update_weather_record(record_id):
    """UPDATE: Edit location/date range -> re-validate -> re-fetch -> update DB"""
    record = WeatherRecord.query.get(record_id)
    if not record:
        return jsonify({'error': 'Record not found'}), 404
    
    data = request.get_json()
    
    location = data.get('location', record.location).strip()
    start_date = data.get('start_date', record.start_date).strip()
    end_date = data.get('end_date', record.end_date).strip()
    
    valid, msg = validate_date_range(start_date, end_date)
    if not valid:
        return jsonify({'error': msg}), 400
    
    valid, result = validate_location(location)
    if not valid:
        return jsonify({'error': result}), 400
    
    try:
        record.location = location
        record.start_date = start_date
        record.end_date = end_date
        record.weather_data = result
        db.session.commit()
        return jsonify(record.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@app.route('/api/weather/<int:record_id>', methods=['DELETE'])
def delete_weather_record(record_id):
    """DELETE: Remove a record by ID"""
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

@app.route('/api/export/csv', methods=['GET'])
def export_csv():
    """Export all records as CSV"""
    records = WeatherRecord.query.all()
    if not records:
        return jsonify({'error': 'No records to export'}), 404
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Location', 'Start Date', 'End Date', 'Created At', 'Updated At'])
    for record in records:
        writer.writerow([record.id, record.location, record.start_date, record.end_date, record.created_at, record.updated_at])
    
    return output.getvalue(), 200, {'Content-Disposition': 'attachment; filename=weather_records.csv', 'Content-Type': 'text/csv'}

@app.route('/api/export/json', methods=['GET'])
def export_json():
    """Export all records as JSON"""
    records = WeatherRecord.query.all()
    if not records:
        return jsonify({'error': 'No records to export'}), 404
    
    return jsonify([record.to_dict() for record in records]), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)
