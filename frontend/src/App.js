import { useState, useEffect } from 'react';

const BACKEND = 'http://localhost:5000';

const PLACEHOLDERS = {
  city:   'e.g. London  or  Una',
  zip:    'e.g. 177103  or  90210',
  coords: 'e.g. 32.1234,76.5678',
};

function geoLabel(g) {
  return [g.name, g.state, g.country].filter(Boolean).join(', ');
}

async function fetchWeatherByCoords(lat, lon, cityLabel) {
  const qs    = `lat=${lat}&lon=${lon}`;
  const cRes  = await fetch(`${BACKEND}/api/weather/current?${qs}`);
  const cData = await cRes.json();
  if (!cRes.ok) throw new Error(cData.error || 'Could not fetch weather');

  const fRes  = await fetch(`${BACKEND}/api/forecast?${qs}`);
  const fData = await fRes.json();
  let forecastDays = [];
  if (fRes.ok) {
    const days = {};
    for (const item of (fData.list || [])) {
      const d = item.dt_txt.split(' ')[0];
      if (!days[d]) days[d] = item;
    }
    forecastDays = Object.values(days).slice(0, 5);
  }

  let youtube = null;
  try {
    const label = cityLabel || cData.city_name || '';
    const yRes  = await fetch(`${BACKEND}/api/youtube?location=${encodeURIComponent(label)}`);
    const yData = await yRes.json();
    if (yRes.ok) youtube = yData;
  } catch (_) {}

  return { current: cData, forecast: forecastDays, youtube, coord: { lat, lon }, label: cityLabel || cData.city_name || '' };
}

export default function App() {
  const [inputType, setInputType] = useState('city');
  const [location,  setLocation]  = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  // today + 5 days is the furthest OWM forecast reaches
  const todayStr   = new Date().toISOString().split('T')[0];
  const maxDateStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 5);
    return d.toISOString().split('T')[0];
  })();

  const handleEndDateChange = (val) => {
    if (val > maxDateStr) {
      setEndDate(maxDateStr);
      msg('Date range capped to 5-day forecast window', 'success');
    } else {
      setEndDate(val);
    }
  };

  const [current,  setCurrent]  = useState(null);
  const [forecast, setForecast] = useState([]);
  const [coords,   setCoords]   = useState(null);
  const [youtube,  setYoutube]  = useState(null);
  const [displayLabel, setDisplayLabel] = useState(''); // human-readable name for saves
  const [message,  setMessage]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [msgType,  setMsgType]  = useState('error');

  const [geoMatches,    setGeoMatches]    = useState([]);
  const [geoSearchText, setGeoSearchText] = useState('');

  const [records,  setRecords]  = useState([]);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/weather`)
      .then(r => r.json())
      .then(d => setRecords(Array.isArray(d) ? d : []))
      .catch(() => setRecords([]));
  }, []);

  const msg      = (text, type = 'error') => { setMessage(text); setMsgType(type); };
  const clearGeo = () => { setGeoMatches([]); setGeoSearchText(''); };

  const applyWeather = ({ current: c, forecast: f, youtube: y, coord, label }) => {
    setCurrent(c); setForecast(f); setYoutube(y); setCoords(coord); clearGeo();
    // label is the human-readable name to save in DB. Fall back to OWM city name.
    setDisplayLabel(label || c.city_name || '');
    msg('Weather loaded. Pick dates and click "Save Record" to store.', 'success');
  };

  const handleLookup = async (e) => {
    e.preventDefault();
    const loc = location.trim();
    if (!loc) { msg('Enter a location first'); return; }
    setMessage(''); setCurrent(null); setForecast([]); setYoutube(null); clearGeo(); setLoading(true);

    try {
      if (inputType === 'coords') {
        const parts = loc.split(',').map(s => s.trim());
        if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1]))
          throw new Error('Enter coordinates as lat,lon — e.g. 32.1234,76.5678');
        applyWeather(await fetchWeatherByCoords(parts[0], parts[1], ''));
        return;
      }

      if (inputType === 'zip') {
        const res  = await fetch(`${BACKEND}/api/geocode/zip?zip=${encodeURIComponent(loc)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Postal code not found');
        if (data.length === 1) {
          applyWeather(await fetchWeatherByCoords(data[0].lat, data[0].lon, data[0].name));
        } else {
          setGeoMatches(data);
          setGeoSearchText(`Results for "${loc}" — pick one:`);
        }
        return;
      }

      const res  = await fetch(`${BACKEND}/api/geocode?q=${encodeURIComponent(loc)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'City not found');
      if (!data.length) throw new Error('No locations found. Check spelling.');

      if (data.length === 1) {
        applyWeather(await fetchWeatherByCoords(data[0].lat, data[0].lon, data[0].name));
      } else {
        // Multiple matches — let the user pick the exact one
        setGeoMatches(data);
        setGeoSearchText(`"${loc}" matches ${data.length} places — pick one:`);
      }
    } catch (err) {
      msg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGeoSelect = async (g) => {
    setLoading(true); setMessage('');
    try {
      // For GPS-triggered selections keep coordinates as the input so the
      // display label is the human name but the API call uses exact lat/lon.
      const isGpsMode = inputType === 'coords';
      const label = isGpsMode
        ? `Near ${[g.name, g.state, g.country].filter(Boolean).join(', ')}`
        : g.name;
      // Don't switch input type for GPS — keep coords so Save sends lat/lon
      if (!isGpsMode) { setInputType('city'); setLocation(g.name); }
      applyWeather({ ...(await fetchWeatherByCoords(g.lat, g.lon, label)), label });
    } catch (err) {
      msg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const useMyLocation = () => {
    setMessage('');
    if (!navigator.geolocation) { msg('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(6));
      const lon = parseFloat(pos.coords.longitude.toFixed(6));
      setLoading(true);
      try {
        const res  = await fetch(`${BACKEND}/api/geocode/reverse?lat=${lat}&lon=${lon}`);
        const data = await res.json();
        if (res.ok && data.length) {
          // Show picker so user can confirm the exact village/town.
          // Store lat/lon in input so Save uses coordinates, not city string.
          setGeoMatches(data);
          setGeoSearchText(`GPS resolved to ${data.length} nearby place(s) — confirm:`);
          setInputType('coords');
          setLocation(`${lat},${lon}`);
        } else {
          setInputType('coords');
          setLocation(`${lat},${lon}`);
          msg('Coordinates filled — click Get Weather.', 'success');
        }
      } catch (_) {
        setInputType('coords');
        setLocation(`${lat},${lon}`);
        msg('Coordinates filled — click Get Weather.', 'success');
      } finally {
        setLoading(false);
      }
    }, () => msg('Location permission denied'));
  };

  const handleSave = async () => {
    if (!current)               { msg('Look up a location first'); return; }
    if (!startDate || !endDate) { msg('Pick start and end dates before saving'); return; }
    if (!coords)                { msg('No coordinates — re-run the lookup'); return; }
    setMessage('');
    // Use the human-readable label set at lookup time, not OWM's city_name which
    // may resolve to a distant big city rather than the exact village.
    const saveLocation = displayLabel || current.city_name || location.trim();
    try {
      const res  = await fetch(`${BACKEND}/api/weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location:   saveLocation,
          lat:        coords.lat,
          lon:        coords.lon,
          start_date: startDate,
          end_date:   endDate,
        }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || 'Error saving');
      setRecords(prev => [...saved, ...prev]);
      msg(`Saved ${saved.length} day${saved.length !== 1 ? 's' : ''} for ${saveLocation}`, 'success');
    } catch (err) {
      msg(err.message);
    }
  };

  const deleteRecord = async (id) => {
    try {
      const res = await fetch(`${BACKEND}/api/weather/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setRecords(records.filter(r => r.id !== id));
      msg('Record deleted', 'success');
    } catch (err) {
      msg(err.message);
    }
  };

  const handleExport = (type) => window.open(`${BACKEND}/api/export/${type}`, '_blank');

  return (
    <div className="container">

      <header>
        <h1>☁ PM Accelerator Weather App</h1>
        <p>Vanshika Sohal — Built for the PM Accelerator AI Engineer Intern technical assessment.</p>
        <p>Product Manager Accelerator (PMA) is a training &amp; career-accelerator program founded by Dr. Nancy Li.</p>
      </header>

      <main>

        <section className="form glass">
          <h2>Weather Lookup</h2>
          <form onSubmit={handleLookup}>
            <div className="input-type-row">
              <label htmlFor="inputType">Search by:</label>
              <select id="inputType" value={inputType}
                onChange={e => { setInputType(e.target.value); setLocation(''); clearGeo(); }}>
                <option value="city">City Name</option>
                <option value="zip">Zip / Postal Code</option>
                <option value="coords">GPS Coordinates (lat,lon)</option>
              </select>
            </div>
            <div className="location-row">
              <input
                value={location}
                onChange={e => { setLocation(e.target.value); clearGeo(); }}
                placeholder={PLACEHOLDERS[inputType]}
                required
              />
              <button type="button" className="gps-btn" onClick={useMyLocation}>
                📍 Use my location
              </button>
            </div>
            <button type="submit" className="btn-grad primary-btn" disabled={loading}>
              {loading ? '⏳ Loading…' : '🔍 Get Weather'}
            </button>
          </form>

          {geoMatches.length > 0 && (
            <div className="geo-picker">
              <p className="geo-picker-title">📍 {geoSearchText}</p>
              <ul className="geo-list">
                {geoMatches.map((g, i) => (
                  <li key={i}>
                    <button className="geo-item" onClick={() => handleGeoSelect(g)} disabled={loading}>
                      <span className="geo-name">{geoLabel(g)}</span>
                      <span className="geo-coords">({g.lat?.toFixed(4)}, {g.lon?.toFixed(4)})</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button className="geo-cancel" onClick={clearGeo}>✕ Cancel</button>
            </div>
          )}

          {current && (
            <div className="save-row">
              <span className="save-label">💾 Save to records:</span>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} aria-label="Start date"
                min={todayStr} max={maxDateStr} />
              <input type="date" value={endDate}   onChange={e => handleEndDateChange(e.target.value)} aria-label="End date"
                min={startDate || todayStr} max={maxDateStr} />
              <button onClick={handleSave} className="save-btn">Save Record</button>
            </div>
          )}

          {message && (
            <div className={`message${msgType === 'success' ? ' success' : ''}`}>{message}</div>
          )}
        </section>

        <section className="current">
          <h2>Current Weather</h2>
          {current ? (
            <div className="current-card glass">
              <h3>📍 {current.city_name}{current.country ? `, ${current.country}` : ''}</h3>
              <div className="current-main">
                <div className="current-icon">
                  {current.icon && (
                    <img alt={current.condition} src={`https://openweathermap.org/img/wn/${current.icon}@2x.png`} />
                  )}
                </div>
                <div>
                  <div className="current-temp">{current.temp !== null ? `${current.temp}°` : '—'}</div>
                  <div className="current-condition">{current.condition}</div>
                </div>
                <div className="current-details">
                  <span className="detail-chip">🌡 Feels like <span>{current.feels_like}°C</span></span>
                  <span className="detail-chip">💧 Humidity <span>{current.humidity}%</span></span>
                  <span className="detail-chip">💨 Wind <span>{current.wind_speed} m/s</span></span>
                </div>
              </div>
              {coords && (
                <div className="map-link">
                  <a target="_blank" rel="noreferrer"
                     href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=12/${coords.lat}/${coords.lon}`}>
                    🗺 Open in OpenStreetMap ↗
                  </a>
                  <div className="map-embed">
                    <iframe
                      title="osm"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon-0.5}%2C${coords.lat-0.5}%2C${coords.lon+0.5}%2C${coords.lat+0.5}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass" style={{ padding: '20px 24px' }}>
              <p className="empty-state">Enter a location above and click "Get Weather".</p>
            </div>
          )}
        </section>

        <section className="forecast">
          <h2>5-Day Forecast</h2>
          {forecast.length === 0 ? (
            <div className="glass" style={{ padding: '20px 24px' }}>
              <p className="empty-state">No forecast yet.</p>
            </div>
          ) : (
            <div className="forecast-scroll">
              {forecast.map((f, idx) => (
                <div className="forecast-card" key={idx}>
                  <div className="fc-date">{f.dt_txt.split(' ')[0]}</div>
                  <img alt={f.weather[0].description} src={`https://openweathermap.org/img/wn/${f.weather[0].icon}@2x.png`} />
                  <div className="fc-temp">{f.main.temp}°</div>
                  <div className="fc-desc">{f.weather[0].description}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="youtube">
          <h2>Travel Videos</h2>
          {youtube ? (
            <a className="yt-search-btn" href={youtube.search_url} target="_blank" rel="noreferrer">
              🎬 Search YouTube for &ldquo;{youtube.location}&rdquo; travel &amp; weather videos
            </a>
          ) : (
            <p className="yt-placeholder">Submit a lookup to load travel videos.</p>
          )}
        </section>

        <section className="exports">
          <h2>Export Records</h2>
          <div className="export-group">
            {[['csv','📄 CSV'],['json','🗂 JSON'],['xml','📋 XML'],['markdown','📝 Markdown'],['pdf','📑 PDF']].map(([type, label]) => (
              <button key={type} className="export-btn" onClick={() => handleExport(type)}>{label}</button>
            ))}
          </div>
        </section>

        <section className="records">
          <h2>Saved Records</h2>
          {records.length === 0 ? (
            <div className="glass" style={{ padding: '20px 24px' }}>
              <p className="empty-state">No records saved yet. Look up weather and click "Save Record".</p>
            </div>
          ) : (
            <div className="records-table-wrap">
              <table className="records-table">
                <thead>
                  <tr>
                    <th>Location</th><th>Date</th><th>Range</th>
                    <th>Temp</th><th>Condition</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id}>
                      <td><strong>{r.location}</strong></td>
                      <td>{r.date}</td>
                      <td><span className="tbl-range">{r.start_date} → {r.end_date}</span></td>
                      <td><span className="tbl-temp">{r.temp != null ? `${r.temp}°C` : 'N/A'}</span></td>
                      <td><span className="tbl-condition">{r.condition || '—'}</span></td>
                      <td>
                        <button className="tbl-btn del" onClick={() => deleteRecord(r.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
