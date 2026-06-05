// WEATHER UTILS
export const WMO_ICONS: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  56: '🌧️', 57: '🌧️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  66: '🌧️', 67: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️',
  77: '🌨️',
  80: '🌦️', 81: '🌧️', 82: '⛈️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️',
};

export const wmoIcon = (code: number) => WMO_ICONS[code] || '·';

export async function fetchWeather(lat: number, lon: number) {
  if (lat == null || lon == null) throw new Error('Missing coordinates');
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    forecast_days: '4',
    timezone: 'auto',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Weather fetch failed (${resp.status})`);
  const data = await resp.json();
  if (!data.hourly || !Array.isArray(data.hourly.time)) {
    throw new Error('Unexpected weather response');
  }
  const hours = data.hourly.time.map((t: string, i: number) => ({
    time: new Date(t),
    temp: data.hourly.temperature_2m[i],
    precip: data.hourly.precipitation_probability[i] ?? 0,
    code: data.hourly.weather_code[i] ?? 0,
  }));
  return { hours, fetchedAt: new Date(), tz: data.timezone };
}

export async function reverseGeocode(lat: number, lon: number) {
  try {
    return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  } catch {
    return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }
}
