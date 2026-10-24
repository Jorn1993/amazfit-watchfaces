/**
 * Sunrise / sunset helpers, based on the weather forecast's "tide" data.
 * Used for the sunrise/sunset complication and for automatic night (red) mode.
 */

/** Fallback night window when no sun data has synced yet: 19:00 - 07:00. */
const FALLBACK_NIGHT_START = 19 * 60;
const FALLBACK_NIGHT_END = 7 * 60;

function forecastOf(weatherSensor) {
  // firmware 4.2 names it getForecast(); the typings (and older levels) getForecastWeather()
  return typeof weatherSensor.getForecast === 'function'
    ? weatherSensor.getForecast() : weatherSensor.getForecastWeather();
}

/** Today's forecast: { high, low, index } (index as the current-weather icons), or null. */
export function todayForecast(weatherSensor) {
  try {
    const f = forecastOf(weatherSensor);
    const d = f && f.forecastData;
    if (!d || !d.count || !d.data || !d.data[0]) return null;
    const { high, low, index } = d.data[0];
    if (high === undefined || low === undefined || (high === 0 && low === 0 && index === 0)) return null;
    return { high, low, index: index || 0 };
  } catch (e) {
    return null;
  }
}

function sunTimes(weatherSensor) {
  try {
    const forecast = forecastOf(weatherSensor);
    const tide = forecast && forecast.tideData;
    if (!tide || !tide.count || !tide.data || !tide.data[0]) return null;
    const { sunrise, sunset } = tide.data[0];
    if (!sunrise || !sunset) return null;
    return {
      rise: sunrise.hour * 60 + sunrise.minute,
      set: sunset.hour * 60 + sunset.minute,
      sunrise,
      sunset,
    };
  } catch (e) {
    return null;
  }
}

/** True between sunset and sunrise (or 19:00-07:00 without data). */
export function isNight(weatherSensor, timeSensor) {
  const now = (timeSensor.hour || 0) * 60 + (timeSensor.minute || 0);
  const t = weatherSensor ? sunTimes(weatherSensor) : null;
  const start = t ? t.set : FALLBACK_NIGHT_START;
  const end = t ? t.rise : FALLBACK_NIGHT_END;
  return now >= start || now < end;
}

/** The next sunrise or sunset: { type, hour, minute } or null. */
export function nextSunEvent(weatherSensor, timeSensor) {
  const t = sunTimes(weatherSensor);
  if (!t) return null;
  const now = (timeSensor.hour || 0) * 60 + (timeSensor.minute || 0);
  const isDay = now >= t.rise && now < t.set;
  const ev = isDay ? t.sunset : t.sunrise;
  return { type: isDay ? 'sunset' : 'sunrise', hour: ev.hour, minute: ev.minute };
}
