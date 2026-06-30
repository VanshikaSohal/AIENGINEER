# PM Accelerator Weather App

Built by **Vanshika Sohal** for the PM Accelerator AI Engineer Intern Technical Assessment.

**Product Manager Accelerator (PMA)** is a product management training and 
career-accelerator program founded by Dr. Nancy Li. PMA helps aspiring and 
early-career product managers break into the field through mentorship, 
real-world projects, and a strong professional community.

## Tech Stack

- **Frontend:** React.js
- **Backend:** Flask (Python)
- **Database:** SQLite via Flask-SQLAlchemy
- **APIs:** OpenWeatherMap (weather + geocoding), OpenStreetMap (maps)
- **Exports:** CSV, JSON, XML, Markdown, PDF (reportlab)

## Features

### Frontend (Tech Assessment 1)
- Search weather by City Name, ZIP/Postal Code, or GPS Coordinates
- Auto-detect current location via browser Geolocation API
- Location disambiguation — if a city exists in multiple countries, 
  user gets a selection list
- Current weather display with icons, temperature, humidity, wind
- 5-day forecast in responsive card layout
- Interactive OpenStreetMap embed with location pin
- YouTube travel videos search link for any location
- Fully responsive — works on desktop, tablet, and mobile

### Backend (Tech Assessment 2)
- RESTful API built with Flask
- Full CRUD on weather records:
  - **Create** — save location + date range, stores per-day forecast data
  - **Read** — view all saved records
  - **Update** — edit saved records with re-validation
  - **Delete** — remove any record
- Location validation via OpenWeatherMap Geocoding API
- Date range validation (format, logical order, within forecast window)
- Data export in 5 formats: CSV, JSON, XML, Markdown, PDF

## Note on YouTube Integration

YouTube embedded video playback requires a Google Cloud API key with 
billing enabled. To avoid mandatory billing setup, this app implements 
YouTube integration via a direct search URL — clicking the button opens 
a YouTube search for travel and weather videos of the selected location 
in a new tab. Full embedded video support can be added by supplying a 
`YOUTUBE_API_KEY` in the `.env` file.

## How to Run

### Prerequisites
- Python 3.10+ (recommend using conda or venv)
- Node.js 18+

### Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Runs on `http://localhost:5000`

### Frontend
```bash
cd frontend
npm install
npm start
```
Runs on `http://localhost:3000`

### Environment Variables
Create a `.env` file in the `backend/` folder:
API_KEY=your_openweathermap_api_key
YOUTUBE_API_KEY=your_youtube_api_key_optional

## Project Structure
AIENGINEER/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   └── package.json
└── README.md