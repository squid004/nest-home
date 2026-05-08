// ── Configuration ────────────────────────────────────────────────────────────
const USER_LAT      = 40.48;
const USER_LON      = -80.14;
const UNSPLASH_KEY  = 'TUTnYBBWM1DSOpmj_o5yyalXrYU1feP6ipQfFPOUpek';
const RADIUS_NM     = 30;
const PIT_LAT       = 40.4918;
const PIT_LON       = -80.2327;

// ── WMO weather code → { icon, label } ───────────────────────────────────────
const WEATHER_CODES = {
  0:  { icon: '☀️',  iconNight: '🌙',    label: 'Clear' },
  1:  { icon: '🌤️', iconNight: '🌙',    label: 'Mostly Clear' },
  2:  { icon: '⛅',  iconNight: '🌙',   label: 'Partly Cloudy' },
  3:  { icon: '☁️',  label: 'Overcast' },
  45: { icon: '🌫️', label: 'Foggy' },
  48: { icon: '🌫️', label: 'Icy Fog' },
  51: { icon: '🌦️', iconNight: '🌧️', label: 'Light Drizzle' },
  53: { icon: '🌦️', iconNight: '🌧️', label: 'Drizzle' },
  55: { icon: '🌦️', iconNight: '🌧️', label: 'Heavy Drizzle' },
  61: { icon: '🌧️', label: 'Light Rain' },
  63: { icon: '🌧️', label: 'Rain' },
  65: { icon: '🌧️', label: 'Heavy Rain' },
  71: { icon: '🌨️', label: 'Light Snow' },
  73: { icon: '🌨️', label: 'Snow' },
  75: { icon: '❄️',  label: 'Heavy Snow' },
  80: { icon: '🌦️', iconNight: '🌧️', label: 'Showers' },
  81: { icon: '🌧️', label: 'Heavy Showers' },
  95: { icon: '⛈️',  label: 'Thunderstorm' },
  99: { icon: '⛈️',  label: 'Severe Thunderstorm' },
};

// ── State ─────────────────────────────────────────────────────────────────────
const routeCache = {};
let bgCurrent = document.getElementById('bg-current');
let bgNext    = document.getElementById('bg-next');

// ── Clock ─────────────────────────────────────────────────────────────────────
function updateClock() {
  const now  = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('time').textContent = time;
  document.getElementById('date').textContent = date;
}

// ── Weather ───────────────────────────────────────────────────────────────────
async function fetchWeather() {
  try {
    const url = `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${USER_LAT}&longitude=${USER_LON}` +
      `&current=temperature_2m,weathercode` +
      `&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&hourly=precipitation_probability,weathercode` +
      `&temperature_unit=fahrenheit&forecast_days=1&timezone=auto`;
    const res  = await fetch(url);
    const data = await res.json();

    const code   = data.current.weathercode;
    const temp   = Math.round(data.current.temperature_2m);
    const hi     = Math.round(data.daily.temperature_2m_max[0]);
    const lo     = Math.round(data.daily.temperature_2m_min[0]);
    const info      = WEATHER_CODES[code] || { icon: '🌡️', label: 'Unknown' };
    const now       = new Date();
    const isDaytime = now >= new Date(data.daily.sunrise[0]) && now <= new Date(data.daily.sunset[0]);
    const icon      = (!isDaytime && info.iconNight) ? info.iconNight : info.icon;

    document.getElementById('weather-icon').textContent  = icon;
    document.getElementById('weather-temp').textContent  = `${temp}°F`;
    document.getElementById('weather-label').textContent = info.label;
    document.getElementById('weather-hilo').textContent  = `H: ${hi}°  L: ${lo}°`;

    const precipEl = document.getElementById('weather-precip');
    const currentHour = new Date().getHours();
    const probs  = data.hourly.precipitation_probability.slice(currentHour + 1, 24);
    const codes  = data.hourly.weathercode.slice(currentHour + 1, 24);
    const maxProb = Math.max(...probs);
    if (maxProb >= 20) {
      const peakIdx  = probs.indexOf(maxProb);
      const peakCode = codes[peakIdx];
      const isSnow   = [71, 73, 75, 77, 85, 86].includes(peakCode);
      const icon     = isSnow ? '🌨' : '🌧';
      const word     = maxProb >= 60 ? 'likely' : maxProb >= 40 ? 'possible' : 'slight chance of';
      const type     = isSnow ? 'snow' : 'rain';
      precipEl.textContent = `${icon} ${word.charAt(0).toUpperCase() + word.slice(1)} ${type} later · ${maxProb}%`;
    } else {
      precipEl.textContent = '';
    }
  } catch (e) {
    console.error('Weather fetch failed', e);
  }
}

// ── Planes ────────────────────────────────────────────────────────────────────
function distNm(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingTo(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function isOnApproach(a) {
  if (a.lat == null || a.lon == null) return false;
  // Must be east of PIT — planes west of the airport can't be flying over the user
  if (a.lon < PIT_LON) return false;
  const distFromPit = distNm(PIT_LAT, PIT_LON, a.lat, a.lon);
  if (distFromPit > 40) return false;
  const alt = typeof a.alt_baro === 'number' ? a.alt_baro : null;
  if (!alt || alt < 500) return false;
  // Must be at or below the 3° glideslope altitude (+ 4,000 ft buffer for intercept)
  if (alt > distFromPit * 318 + 4000) return false;
  // Track must point roughly toward PIT (within 35°)
  if (a.track != null) {
    const bearing = bearingTo(a.lat, a.lon, PIT_LAT, PIT_LON);
    const diff = Math.abs(((a.track - bearing) + 540) % 360 - 180);
    if (diff > 35) return false;
  }
  return true;
}

function renderPlane(plane) {
  document.getElementById('plane-callsign').textContent = '';
  document.getElementById('plane-airline').textContent  = plane.airline  || '';
  document.getElementById('plane-aircraft').textContent = plane.aircraft || '';

  const route = (plane.origin && plane.destination)
    ? `${plane.origin}  →  ${plane.destination}`
    : '';
  document.getElementById('plane-route').textContent = route;

  const altFt  = plane.alt_ft != null
    ? Math.round(plane.alt_ft).toLocaleString() + ' ft'
    : '';
  const spdMph = plane.speed_mph != null
    ? Math.round(plane.speed_mph) + ' mph'
    : '';
  document.getElementById('plane-stats').textContent = [altFt, spdMph].filter(Boolean).join('  ·  ');
}

function renderClearSkies() {
  document.getElementById('plane-callsign').textContent = 'Clear skies';
  document.getElementById('plane-airline').textContent  = '';
  document.getElementById('plane-aircraft').textContent = '';
  document.getElementById('plane-route').textContent    = '';
  document.getElementById('plane-stats').textContent    = '';
}

async function fetchRoute(callsign) {
  if (!callsign) return { origin: '', destination: '' };
  if (routeCache[callsign]) return routeCache[callsign];
  try {
    const res  = await fetch(`https://api.adsbdb.com/v0/callsign/${callsign}`);
    if (!res.ok) {
      routeCache[callsign] = { origin: '', destination: '' };
      return { origin: '', destination: '' };
    }
    const data = await res.json();
    const r    = data?.response?.flightroute;
    const result = r
      ? { origin: r.origin?.iata_code || '', destination: r.destination?.iata_code || '' }
      : { origin: '', destination: '' };
    routeCache[callsign] = result;
    return result;
  } catch (e) {
    routeCache[callsign] = { origin: '', destination: '' };
    return { origin: '', destination: '' };
  }
}

async function fetchPlanes() {
  try {
    const url  = `https://adsb-proxy.jeremy-s-hardy-4.workers.dev/?lat=${USER_LAT}&lon=${USER_LON}&dist=${RADIUS_NM}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!data.aircraft || data.aircraft.length === 0) { renderClearSkies(); return; }

    // Airborne candidates sorted by distance from user, top 15
    const candidates = data.aircraft
      .filter(a => typeof a.alt_baro === 'number' && a.alt_baro > 0)
      .sort((a, b) => (a.dst || 9999) - (b.dst || 9999))
      .slice(0, 15);

    if (candidates.length === 0) { renderClearSkies(); return; }

    // Fetch routes in parallel for all candidates
    const withRoutes = await Promise.all(
      candidates.map(async a => ({ a, route: await fetchRoute((a.flight || '').trim()) }))
    );

    // Accept: confirmed PIT destination east of airport, or geometry says on approach
    const match = withRoutes.find(({ a, route }) =>
      (route.destination === 'PIT' && a.lon != null && a.lon > PIT_LON) || isOnApproach(a)
    );

    if (!match) { renderClearSkies(); return; }

    const { a, route } = match;
    const callsign  = (a.flight || '').trim();
    const airline   = a.ownOp || '';
    const aircraft  = a.desc  || a.t  || '';
    const alt_ft    = typeof a.alt_geom === 'number' ? a.alt_geom
                    : typeof a.alt_baro === 'number' ? a.alt_baro
                    : null;
    const speed_mph = typeof a.gs === 'number' ? Math.round(a.gs * 1.15078) : null;

    renderPlane({ callsign, airline, aircraft, alt_ft, speed_mph, ...route });
  } catch (e) {
    console.error('Plane fetch failed', e);
  }
}

// ── Background photos ─────────────────────────────────────────────────────────
async function fetchNextBackground() {
  try {
    const url = `https://api.unsplash.com/photos/random?orientation=landscape&topics=nature&query=landscape+scenery&client_id=${UNSPLASH_KEY}`;
    const res  = await fetch(url);
    const data = await res.json();
    return data.urls.regular;
  } catch (e) {
    console.error('Unsplash fetch failed', e);
    return null;
  }
}

async function rotateBackground() {
  const url = await fetchNextBackground();
  if (!url) return;

  bgNext.style.backgroundImage = `url(${url})`;
  bgNext.style.opacity = '1';

  setTimeout(() => {
    bgCurrent.style.backgroundImage = bgNext.style.backgroundImage;
    bgNext.style.opacity = '0';
  }, 2000);
}

updateClock();
setInterval(updateClock, 1000);

fetchWeather();
setInterval(fetchWeather, 10 * 60 * 1000);

fetchPlanes();
setInterval(fetchPlanes, 60 * 1000);

rotateBackground();
setInterval(rotateBackground, 15 * 60 * 1000);
