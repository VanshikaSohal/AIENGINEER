# PM Accelerator Weather App

Built by **Vanshika Sohal** for the PM Accelerator AI Engineer Intern Technical Assessment.

> **Product Manager Accelerator (PMA)** is a product management training and career-accelerator program founded by Dr. Nancy Li. PMA helps aspiring and early-career product managers break into the field through mentorship, real-world projects, and a strong professional community. Learn more at [LinkedIn](https://www.linkedin.com/company/product-manager-accelerator/).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js |
| Backend | Flask (Python) |
| Database | SQLite via Flask-SQLAlchemy |
| Weather & Geocoding | OpenWeatherMap API |
| Maps | OpenStreetMap (no billing required) |
| PDF Export | ReportLab |

---

## What This App Does

A full-stack weather application where users can search weather by city name, ZIP code, or GPS coordinates, save records to a database, and export data in multiple formats.

---

## Features

### Tech Assessment 1 — Frontend (React)
- Search weather by **City Name**, **ZIP/Postal Code**, or **GPS Coordinates**
- **"Use my location"** button — auto-detects via browser Geolocation API with hyperlocal reverse geocoding (returns exact town, not just district)
- **Location disambiguation** — if a city name matches multiple countries, user sees a selection list before weather loads
- Current weather card — temperature, feels like, humidity, wind speed, condition icon
- **5-day forecast** in responsive horizontal card layout
- Interactive **OpenStreetMap embed** with location pin
- **YouTube travel videos** search link for any searched location
- Fully responsive — desktop, tablet, and mobile layouts

### Tech Assessment 2 — Backend (Flask)
- RESTful API with clean endpoint structure
- **Full CRUD** on weather records:
  - **Create** — enter location + date range (max 5 days), fetches per-day forecast and saves each day as a separate row
  - **Read** — view all saved records in a sortable table
  - **Delete** — remove any record instantly
- Location validation via OpenWeatherMap Geocoding API before saving
- Date range validation — rejects invalid formats, past dates, and ranges exceeding 5 days
- **Data export in 5 formats:** CSV, JSON, XML, Markdown, PDF

---

## Note on YouTube Integration

YouTube embedded video playback requires a Google Cloud API key with mandatory billing enabled. To avoid this, the app implements YouTube integration via a direct search URL — clicking the button opens a YouTube search for travel and weather videos of the selected location in a new tab. Full embedded playback can be enabled by adding a `YOUTUBE_API_KEY` to the `.env` file.

---

## How to Run

### Prerequisites
- Python 3.10+ (conda recommended)
- Node.js 18+

### 1. Clone the repo
```bash
git clone https://github.com/VanshikaSohal/AIENGINEER.git
cd AIENGINEER
```

### 2. Backend setup
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Runs on `http://localhost:5000`

### 3. Frontend setup
```bash
cd frontend
npm install
npm start
```
Runs on `http://localhost:3000`

> Run both simultaneously in separate terminals.

### 4. Environment Variables
Create a `.env` file inside the `backend/` folder:
```
API_KEY=your_openweathermap_api_key
YOUTUBE_API_KEY=your_youtube_api_key_optional
```
Get a free OpenWeatherMap key at [openweathermap.org/api](https://openweathermap.org/api)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/weather/current` | Fetch current weather (city/zip/coords) |
| GET | `/api/forecast` | 5-day forecast |
| GET | `/api/geocode` | Location search with disambiguation |
| GET | `/api/youtube` | YouTube search URL for location |
| POST | `/api/weather` | Save weather record to DB |
| GET | `/api/weather` | Read all saved records |
| DELETE | `/api/weather/<id>` | Delete a record |
| GET | `/api/export/csv` | Export as CSV |
| GET | `/api/export/json` | Export as JSON |
| GET | `/api/export/xml` | Export as XML |
| GET | `/api/export/markdown` | Export as Markdown |
| GET | `/api/export/pdf` | Export as PDF |

---

## Project Structure

```
AIENGINEER/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   ├── weather.db          # auto-created on first run
│   └── .env                # not committed to git
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css
│   │   └── index.js
│   └── package.json
└── README.md
```

---

## Assessment Completed
**Full Stack (Tech Assessment 1 + 2)** — highest priority submission track.