// ── Configuration ────────────────────────────────────────────────────────────
const USER_LAT      = 40.48;
const USER_LON      = -80.14;
const UNSPLASH_KEY  = 'TUTnYBBWM1DSOpmj_o5yyalXrYU1feP6ipQfFPOUpek';
const RADIUS_NM     = 250;       // nautical miles radius (wide for testing)

// ── WMO weather code → { icon, label } ───────────────────────────────────────
const WEATHER_CODES = {
  0:  { icon: '☀️',  label: 'Clear' },
  1:  { icon: '🌤️', label: 'Mostly Clear' },
  2:  { icon: '⛅',  label: 'Partly Cloudy' },
  3:  { icon: '☁️',  label: 'Overcast' },
  45: { icon: '🌫️', label: 'Foggy' },
  48: { icon: '🌫️', label: 'Icy Fog' },
  51: { icon: '🌦️', label: 'Light Drizzle' },
  53: { icon: '🌦️', label: 'Drizzle' },
  55: { icon: '🌦️', label: 'Heavy Drizzle' },
  61: { icon: '🌧️', label: 'Light Rain' },
  63: { icon: '🌧️', label: 'Rain' },
  65: { icon: '🌧️', label: 'Heavy Rain' },
  71: { icon: '🌨️', label: 'Light Snow' },
  73: { icon: '🌨️', label: 'Snow' },
  75: { icon: '❄️',  label: 'Heavy Snow' },
  80: { icon: '🌦️', label: 'Showers' },
  81: { icon: '🌧️', label: 'Heavy Showers' },
  95: { icon: '⛈️',  label: 'Thunderstorm' },
  99: { icon: '⛈️',  label: 'Severe Thunderstorm' },
};

// ── State ─────────────────────────────────────────────────────────────────────
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
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&hourly=precipitation_probability,weathercode` +
      `&temperature_unit=fahrenheit&forecast_days=1&timezone=auto`;
    const res  = await fetch(url);
    const data = await res.json();

    const code   = data.current.weathercode;
    const temp   = Math.round(data.current.temperature_2m);
    const hi     = Math.round(data.daily.temperature_2m_max[0]);
    const lo     = Math.round(data.daily.temperature_2m_min[0]);
    const info   = WEATHER_CODES[code] || { icon: '🌡️', label: 'Unknown' };

    document.getElementById('weather-icon').textContent  = info.icon;
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
function renderPlane(plane) {
  document.getElementById('plane-callsign').textContent = plane.callsign || '—';
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

async function fetchPlanes() {
  try {
    const url  = `https://opendata.adsb.fi/api/v2/lat/${USER_LAT}/lon/${USER_LON}/dist/${RADIUS_NM}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (!data.ac || data.ac.length === 0) { renderClearSkies(); return; }

    // Filter out aircraft on the ground, sort by distance
    const airborne = data.ac
      .filter(a => typeof a.alt_baro === 'number' && a.alt_baro > 0)
      .sort((a, b) => (a.dst || 9999) - (b.dst || 9999));

    if (airborne.length === 0) { renderClearSkies(); return; }

    const a        = airborne[0];
    const callsign = (a.flight || '').trim();
    const airline  = a.ownOp || '';
    const aircraft = a.desc  || a.t  || '';
    const alt_ft   = typeof a.alt_geom === 'number' ? a.alt_geom
                   : typeof a.alt_baro === 'number' ? a.alt_baro
                   : null;
    const speed_mph = typeof a.gs === 'number' ? Math.round(a.gs * 1.15078) : null;

    renderPlane({ callsign, airline, aircraft, alt_ft, speed_mph });
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

// ── Cast SDK init ─────────────────────────────────────────────────────────────
let loopsStarted = false;

function startAllLoops() {
  if (loopsStarted) return;
  loopsStarted = true;

  updateClock();
  setInterval(updateClock, 1000);

  fetchWeather();
  setInterval(fetchWeather, 10 * 60 * 1000);

  fetchPlanes();
  setInterval(fetchPlanes, 60 * 1000);

  rotateBackground();
  setInterval(rotateBackground, 15 * 60 * 1000);
}

window['__onGCastApiAvailable'] = function (isAvailable) {
  if (!isAvailable) {
    startAllLoops();
    return;
  }
  const context = cast.framework.CastReceiverContext.getInstance();
  context.addEventListener(
    cast.framework.system.EventType.READY,
    () => startAllLoops()
  );
  const options = new cast.framework.CastReceiverOptions();
  options.disableIdleTimeout = true;
  context.start(options);
};

// Fallback: if Cast SDK hasn't started loops within 3s, start anyway (direct browser preview)
setTimeout(() => {
  if (!loopsStarted) startAllLoops();
}, 3000);
