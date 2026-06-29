# PM Accelerator Weather App

Full-stack weather app (frontend + backend) built for the PM Accelerator AI Engineer Intern technical assessment.

**Tech stack:**
- Backend: Flask, Flask-SQLAlchemy, SQLite
- Frontend: React (Create React App style, plain JS + CSS)

**What it does:**
- Input a location (city) or use GPS to fetch current weather and a 5-day forecast via OpenWeather.
- Store weather requests in SQLite (CRUD API).
- Export stored records as CSV or JSON.
- OpenStreetMap integration: view location on OSM and embedded map.

**Quick start (backend)**

1. Ensure Python 3.8+ is available.
2. Install dependencies (global install is supported; virtual environments are optional):

```bash
cd backend
python -m pip install -r requirements.txt
```

3. Create or update `backend/.env` with your OpenWeather API key:

```text
API_KEY=YOUR_OPENWEATHER_API_KEY
```

4. Run the backend:

```bash
python app.py
```

The backend runs on `http://localhost:5000` by default.

**Quick start (frontend)**

1. Node/npm is required to run the frontend. If Node is not installed on your machine, install it from https://nodejs.org/.
2. From the project root:

```bash
cd frontend
npm install
npm start
```

The frontend runs on `http://localhost:3000` by default and communicates with the backend at `http://localhost:5000`.

**API endpoints**
- `GET /api/test-weather` — test current weather for London
- `POST /api/weather` — create a weather record (JSON body: `location`, `start_date`, `end_date`)
- `GET /api/weather` — list stored records
- `GET /api/weather/<id>` — get one record
- `PUT /api/weather/<id>` — update a record (JSON body can include `location`, `start_date`, `end_date`)
- `DELETE /api/weather/<id>` — delete a record
- `GET /api/forecast?q=city` or `GET /api/forecast?lat=..&lon=..` — get 5-day forecast
- `GET /api/export/csv` — download CSV of records
- `GET /api/export/json` — download JSON of records

**Demo recording checklist (short script)**
1. Start the backend: `python backend/app.py`.
2. Start the frontend: `npm start` (in `frontend/`).
3. In the app UI, enter a city (e.g., "London"), pick a date range (same day or up to 5 days), click "Fetch & Save".
4. Show current weather card and 5-day forecast.
5. Click the OpenStreetMap link or scroll to the embedded map.
6. Show the saved record in the list, then Edit and Delete it.
7. Click Export → CSV and Export → JSON to demonstrate downloads.
8. Mention the project author: Vanshika Sohal and the PM Accelerator blurb.

**Troubleshooting / notes**
- If the frontend shows CORS errors, ensure the backend is running and `Flask-CORS` is installed (already included).
- If OpenWeather requests return 401, check `backend/.env` and the `API_KEY` value.
- If Node/npm is not installed, the frontend will not run; the repo includes a minimal frontend scaffold in `frontend/` that you can start after installing Node.

If you'd like, I can add a small script to record a demo automatically or prepare a short GIF—tell me which format you prefer.
