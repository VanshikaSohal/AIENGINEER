import React, { useState, useEffect } from 'react';

const BACKEND = 'http://localhost:5000';

function App() {
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [records, setRecords] = useState([]);
  const [message, setMessage] = useState('');
  const [current, setCurrent] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [coords, setCoords] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({ location: '', start_date: '', end_date: '' });

  useEffect(() => {
    fetch(`${BACKEND}/api/weather`)
      .then(r => r.json())
      .then(data => setRecords(data))
      .catch(() => setRecords([]));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setCurrent(null);
    setForecast([]);
    try {
      // Save request to backend (stores current weather JSON)
      const res = await fetch(`${BACKEND}/api/weather`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, start_date: startDate, end_date: endDate })
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || 'Error saving record');
      setRecords([saved, ...records]);

      // Fetch forecast from backend
      const fq = await fetch(`${BACKEND}/api/forecast?q=${encodeURIComponent(location)}`);
      const fjson = await fq.json();
      if (!fq.ok) throw new Error(fjson.error || 'Error fetching forecast');

      // Extract current and 5-day
      const list = fjson.list || [];
      // pick one entry per day (prefer 12:00 entries)
      const days = {};
      for (const item of list) {
        const date = item.dt_txt.split(' ')[0];
        if (!days[date]) days[date] = item;
      }
      const five = Object.keys(days).slice(0, 5).map(d => days[d]);

      setCurrent(saved.weather_data);
      setForecast(five);
      if (fjson.city && fjson.city.coord) {
        setCoords(fjson.city.coord);
      }
      setMessage('Fetched weather and forecast');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const useMyLocation = () => {
    setMessage('');
    if (!navigator.geolocation) {
      setMessage('Geolocation not supported by browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      try {
        const fq = await fetch(`${BACKEND}/api/forecast?lat=${lat}&lon=${lon}`);
        const fjson = await fq.json();
        if (!fq.ok) throw new Error(fjson.error || 'Error fetching forecast');
        if (fjson.city && fjson.city.name) setLocation(fjson.city.name);
        setCoords(fjson.city && fjson.city.coord ? fjson.city.coord : { lat, lon });
        setMessage('Location set from GPS');
      } catch (err) {
        setMessage(err.message);
      }
    }, (err) => {
      setMessage('Location permission denied or unavailable');
    });
  };

  const deleteRecord = async (id) => {
    try {
      const res = await fetch(`${BACKEND}/api/weather/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setRecords(records.filter(r => r.id !== id));
      setMessage('Record deleted');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditFields({ location: r.location, start_date: r.start_date, end_date: r.end_date });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFields({ location: '', start_date: '', end_date: '' });
  };

  const submitEdit = async (id) => {
    try {
      const res = await fetch(`${BACKEND}/api/weather/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFields)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setRecords(records.map(r => r.id === id ? data : r));
      cancelEdit();
      setMessage('Record updated');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleExport = (type) => {
    window.open(`${BACKEND}/api/export/${type}`, '_blank');
  };

  return (
    <div className="container">
      <header>
        <h1>PM Accelerator Weather App</h1>
        <p>Vanshika Sohal — Built for the PM Accelerator AI Engineer Intern technical assessment.</p>
        <p>Product Manager Accelerator (PMA) is a product management training and career-accelerator program founded by Dr. Nancy Li.</p>
      </header>

      <main>
        <section className="form">
          <h2>New Weather Request</h2>
          <form onSubmit={handleSubmit}>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City name" required />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            <button type="submit">Fetch & Save</button>
            <button type="button" onClick={useMyLocation} style={{ marginLeft: 8 }}>Use my location</button>
          </form>
          {message && <div className="message">{message}</div>}
        </section>

        <section className="current">
          <h2>Current Weather</h2>
          {current ? (
            <div className="current-card">
              <h3>{current.name}</h3>
              <div className="row">
                <div>
                  <img alt="icon" src={`https://openweathermap.org/img/wn/${current.weather[0].icon}@2x.png`} />
                </div>
                <div>
                  <div><strong>Temp:</strong> {current.main.temp} °C</div>
                  <div><strong>Condition:</strong> {current.weather[0].description}</div>
                  <div><strong>Humidity:</strong> {current.main.humidity}%</div>
                  <div><strong>Wind:</strong> {current.wind.speed} m/s</div>
                </div>
              </div>
              {coords && (
                <div className="map-link">
                  <a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=10/${coords.lat}/${coords.lon}`}>Open in OpenStreetMap</a>
                  <div className="map-embed">
                    <iframe title="osm" src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lon-0.5}%2C${coords.lat-0.5}%2C${coords.lon+0.5}%2C${coords.lat+0.5}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`} style={{ border: 0, width: '100%', height: 300 }} />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>No current weather. Submit a request above.</div>
          )}
        </section>

        <section className="forecast">
          <h2>5-Day Forecast</h2>
          <div className="forecast-grid">
            {forecast.length === 0 && <div>No forecast yet.</div>}
            {forecast.map((f, idx) => (
              <div className="forecast-card" key={idx}>
                <div>{f.dt_txt.split(' ')[0]}</div>
                <img alt="icon" src={`https://openweathermap.org/img/wn/${f.weather[0].icon}@2x.png`} />
                <div>{f.main.temp} °C</div>
                <div>{f.weather[0].description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="exports">
          <h2>Exports</h2>
          <button onClick={() => handleExport('csv')}>Export CSV</button>
          <button onClick={() => handleExport('json')}>Export JSON</button>
        </section>

        <section className="records">
          <h2>Saved Records</h2>
          {records.length === 0 && <div>No records yet.</div>}
          <ul>
            {records.map(r => (
              <li key={r.id}>
                {editingId === r.id ? (
                  <div>
                    <input value={editFields.location} onChange={e => setEditFields({ ...editFields, location: e.target.value })} />
                    <input type="date" value={editFields.start_date} onChange={e => setEditFields({ ...editFields, start_date: e.target.value })} />
                    <input type="date" value={editFields.end_date} onChange={e => setEditFields({ ...editFields, end_date: e.target.value })} />
                    <button onClick={() => submitEdit(r.id)}>Save</button>
                    <button onClick={cancelEdit}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <strong>{r.location}</strong> {r.start_date} → {r.end_date}
                    <button onClick={() => startEdit(r)} style={{ marginLeft: 8 }}>Edit</button>
                    <button onClick={() => deleteRecord(r.id)} style={{ marginLeft: 8 }}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
