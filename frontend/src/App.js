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

  return {
    current:  cData,
    forecast: forecastDays,
    youtube,
    coord:    { lat, lon },
    label:    cityLabel || cData.city_name || '',
  };
}

export default function App() {
  const [inputType, setInputType] = useState('city');
  const [location,  setLocation]  = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  const todayStr   = new Date().toISOString().split('T')[0];
  const maxDateStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 4);  // +4 so today→today+4 = 5 days inclusive
    return d.toISOString().split('T')[0];
  })();

  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

  // 5 days inclusive means max difference of 4 days
  const dateRangeError = startDate && endDate && daysBetween(startDate, endDate) > 4
    ? 'Maximum 5 days allowed (forecast API limit)'
    : null;

  const handleEndDateChange = (val) => {
    setEndDate(val > maxDateStr ? maxDateStr : val);
  };

  const [current,      setCurrent]      = useState(null);
  const [forecast,     setForecast]     = useState([]);
  const [coords,       setCoords]       = useState(null);
  const [youtube,      setYoutube]      = useState(null);
  const [displayLabel, setDisplayLabel] = useState('');
  const [message,      setMessage]      = useState('');
  const [loading,      setLoading]      = useState(false);
  const [msgType,      setMsgType]      = useState('error');

  const [geoMatches,    setGeoMatches]    = useState([]);
  const [geoSearchText, setGeoSearchText] = useState('');

  const [records, setRecords] = useState([]);

  useEffect(() => {
    fetch(`${BACKEND}/api/weather`)
      .then(r => r.json())
      .then(d => setRecords(Array.isArray(d) ? d : []))
      .catch(() => setRecords([]));
  }, []);

  const msg = (text, type = 'error') => {
    if (type === 'success') { setMessage(''); return; } // success is silent, just clear any error
    setMessage(text); setMsgType(type);
  };
  const clearGeo = () => { setGeoMatches([]); setGeoSearchText(''); };

  const applyWeather = ({ current: c, forecast: f, youtube: y, coord, label }) => {
    setCurrent(c); setForecast(f); setYoutube(y); setCoords(coord); clearGeo();
    setDisplayLabel(label || c.city_name || '');
    // Auto-fill dates so the save bar is ready to use immediately
    const today = new Date().toISOString().split('T')[0];
    const plus4 = (() => { const d = new Date(); d.setDate(d.getDate() + 4); return d.toISOString().split('T')[0]; })();
    setStartDate(today);
    setEndDate(plus4);
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
          throw new Error('Enter coordinates as lat,lon - e.g. 32.1234,76.5678');
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
          setGeoSearchText(`Results for "${loc}" - pick one:`);
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
        // Multiple matches - let the user pick the exact one
        setGeoMatches(data);
        setGeoSearchText(`"${loc}" matches ${data.length} places - pick one:`);
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
      const isGpsMode = inputType === 'coords';
      const label = isGpsMode
        ? `Near ${[g.name, g.state, g.country].filter(Boolean).join(', ')}`
        : g.name;
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
        // Always use exact lat/lon for weather - pick the most local name (index 0)
        // from reverse geocoding rather than showing a picker which lets user
        // accidentally pick a larger district city.
        const localName = (res.ok && data.length)
          ? [data[0].name, data[0].state, data[0].country].filter(Boolean).join(', ')
          : `${lat},${lon}`;
        const label = `Near ${localName}`;
        setInputType('coords');
        setLocation(`${lat},${lon}`);
        applyWeather({ ...(await fetchWeatherByCoords(lat, lon, label)), label });
      } catch (err) {
        setInputType('coords');
        setLocation(`${lat},${lon}`);
        msg(`Could not resolve location name: ${err.message}`, 'error');
      } finally {
        setLoading(false);
      }
    }, () => msg('Location permission denied'));
  };

  const handleSave = async () => {
    if (!current)               { msg('Look up a location first'); return; }
    if (!startDate || !endDate) { msg('Pick start and end dates before saving'); return; }
    if (!coords)                { msg('No coordinates - re-run the lookup'); return; }
    if (dateRangeError)         { msg(dateRangeError); return; }
    setMessage('');
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
        <h1>WEATHER APP</h1>
        <p className="header-sub">Built by <strong>Vanshika Sohal</strong> for the PM Accelerator AI Engineer Intern Technical Assessment.</p>
        <p className="header-sub">Product Manager Accelerator (PMA) is a product management training and career-accelerator program founded by Dr. Nancy Li.</p>
      </header>

      <main>

        {/* Two-column grid */}
        <div className="two-col">

          {/* Left: lookup form + current weather */}
          <div className="col-left">

            <section>
              <h2>Lookup</h2>
              <div className="card form">
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
                    <button type="button" className="btn btn-secondary" onClick={useMyLocation}>
                      Use my location
                    </button>
                  </div>
                  <button type="submit" className="btn" disabled={loading}>
                    {loading ? 'Loading...' : 'Get Weather'}
                  </button>
                </form>

                {geoMatches.length > 0 && (
                  <div className="geo-picker">
                    <p className="geo-picker-title">{geoSearchText}</p>
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
                    <button className="geo-cancel" onClick={clearGeo}>Cancel</button>
                  </div>
                )}

                {current && (
                  <div className="save-row">
                    <span className="save-label">Save to records:</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                      aria-label="Start date" min={todayStr} max={maxDateStr} />
                    <input type="date" value={endDate} onChange={e => handleEndDateChange(e.target.value)}
                      aria-label="End date" min={startDate || todayStr} max={maxDateStr} />
                    <button onClick={handleSave} className="btn" disabled={!!dateRangeError}>
                      Save Record
                    </button>
                    {dateRangeError && (
                      <span className="date-range-error">{dateRangeError}</span>
                    )}
                  </div>
                )}

                {message && (
                  <div className={`message${msgType === 'success' ? ' success' : ''}`}>{message}</div>
                )}
              </div>
            </section>

            <section>
              <h2>Current Weather</h2>
              {current ? (
                <div className="card current-card">
                  <div className="cw-location">
                    {current.city_name}{current.country ? `, ${current.country}` : ''}
                  </div>
                  <div className="cw-body">
                    {current.icon && (
                      <img className="cw-icon" alt={current.condition}
                           src={`https://openweathermap.org/img/wn/${current.icon}@2x.png`} />
                    )}
                    <div>
                      <div className="cw-temp">{current.temp !== null ? `${current.temp}°C` : '-'}</div>
                      <div className="cw-condition">{current.condition}</div>
                    </div>
                  </div>
                  <div className="cw-stats">
                    <span>Feels like {current.feels_like}°C</span>
                    <span>Humidity {current.humidity}%</span>
                    <span>Wind {current.wind_speed} m/s</span>
                  </div>
                </div>
              ) : (
                <div className="card" style={{ padding: '16px 20px' }}>
                  <p className="empty-state">Enter a location and click "Get Weather".</p>
                </div>
              )}
            </section>

          </div>

          {/* Right: forecast + exports + map */}
          <div className="col-right">

            <section>
              <h2>5-Day Forecast</h2>
              {forecast.length === 0 ? (
                <div className="card" style={{ padding: '16px 20px' }}>
                  <p className="empty-state">No forecast yet.</p>
                </div>
              ) : (
                <div className="forecast-scroll">
                  {forecast.map((f, idx) => (
                    <div className="forecast-card" key={idx}>
                      <div className="fc-date">{f.dt_txt.split(' ')[0]}</div>
                      <img alt={f.weather[0].description}
                           src={`https://openweathermap.org/img/wn/${f.weather[0].icon}@2x.png`} />
                      <div className="fc-temp">{f.main.temp}°C</div>
                      <div className="fc-desc">{f.weather[0].description}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2>Export Records</h2>
              <div className="export-group">
                {[['csv','CSV'],['json','JSON'],['xml','XML'],['markdown','Markdown'],['pdf','PDF']].map(([type, label]) => (
                  <button key={type} className="export-btn" onClick={() => handleExport(type)}>{label}</button>
                ))}
              </div>
            </section>

            {coords && (() => {
              const lat = parseFloat(coords.lat);
              const lon = parseFloat(coords.lon);
              const bbox = `${lon - 0.1},${lat - 0.1},${lon + 0.1},${lat + 0.1}`;
              const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
              return (
                <section>
                  <h2>Map</h2>
                  <div className="map-embed">
                    <iframe title="osm" src={mapSrc} />
                  </div>
                  <a className="map-link-text" target="_blank" rel="noreferrer"
                     href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`}>
                    Open in OpenStreetMap
                  </a>
                </section>
              );
            })()}

          </div>
        </div>

        {/* Full-width sections */}

        <section>
          <h2>Travel Videos</h2>
          {youtube ? (
            <a className="yt-search-btn" href={youtube.search_url} target="_blank" rel="noreferrer">
              Search YouTube for "{youtube.location}" travel &amp; weather videos
            </a>
          ) : (
            <p className="yt-placeholder">Submit a lookup to load travel videos.</p>
          )}
        </section>

        <section>
          <h2>Saved Records</h2>
          {records.length === 0 ? (
            <div className="card" style={{ padding: '16px 20px' }}>
              <p className="empty-state">No records saved yet.</p>
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
                      <td className="tbl-location">{r.location}</td>
                      <td>{r.date}</td>
                      <td><span className="tbl-range">{r.start_date} to {r.end_date}</span></td>
                      <td><span className="tbl-temp">{r.temp != null ? `${r.temp}°C` : 'N/A'}</span></td>
                      <td><span className="tbl-condition">{r.condition || '-'}</span></td>
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
