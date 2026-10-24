/**
 * Complication definitions.
 *
 * Two kinds of metric:
 *  - "sensor" metrics read an @zos/sensor directly, so the face controls formatting
 *    (thousands separators, units, "--" placeholders) and gauge progress.
 *  - "bound" metrics use the system's data binding (TEXT_FONT / IMG_LEVEL `type`),
 *    for data no sensor exposes at API level 4.2 (floors, current weather, UV,
 *    humidity, air quality).
 */
import { formatThousands, formatDistance, formatClock } from './format';
import { nextSunEvent, todayForecast } from './sun';
import { moonPhase } from './moon';

/** Order here = order in the on-watch editor list (activity, body, training, outdoors, sky). */
export const METRIC_IDS = [
  'steps', 'distance', 'calories', 'floors', 'stand', 'fatburn', 'pai',
  'heart', 'resting', 'spo2', 'stress', 'bodytemp', 'sleep', 'sleepscore',
  'vo2max', 'trainload', 'recovery',
  'weather', 'forecast', 'uvi', 'humidity', 'aqi', 'altitude', 'pressure', 'compass',
  'sun', 'moon',
];

/**
 * Editor type number per metric (100001 + n). These never change, so a slot keeps its
 * metric across updates even when the list above is reordered or grows.
 */
export const METRIC_TYPE = {
  steps: 0, heart: 1, distance: 2, calories: 3, floors: 4, pai: 5, stand: 6, fatburn: 7, spo2: 8,
  stress: 9, uvi: 10, humidity: 11, aqi: 12, sun: 13, weather: 14, resting: 15, sleep: 16,
  sleepscore: 17, bodytemp: 18, vo2max: 19, trainload: 20, recovery: 21, altitude: 22, pressure: 23,
  compass: 24, moon: 25, forecast: 26,
};

/**
 * The system app a tap on each metric opens (names of @zos/router SYSTEM_APP_* constants).
 * Metrics without one don't react to taps.
 */
export const METRIC_APP = {
  steps: 'STATUS', distance: 'STATUS', calories: 'STATUS', floors: 'STATUS', stand: 'STATUS', fatburn: 'STATUS',
  pai: 'PAI', heart: 'HR', resting: 'HR', stress: 'PRESSURE', bodytemp: 'THERMOMETER',
  sleep: 'SLEEP', sleepscore: 'SLEEP', vo2max: 'SPORT_STATUS', trainload: 'SPORT_STATUS', recovery: 'SPORT_STATUS',
  weather: 'WEATHER', forecast: 'WEATHER', uvi: 'WEATHER', humidity: 'WEATHER', aqi: 'WEATHER',
  altitude: 'ALTIMETER', pressure: 'ALTIMETER', compass: 'COMPASS', sun: 'SUN_AND_MOON', moon: 'SUN_AND_MOON',
};

const cToF = (c) => (c * 9) / 5 + 32;
let sleepAsked = -Infinity;
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

export const SENSOR_METRICS = {
  steps: {
    sensor: 'STEP',
    read(s) {
      const current = s.getCurrent() || 0;
      const target = s.getTarget() || 8000;
      return { text: formatThousands(current), progress: current / target };
    },
  },
  heart: {
    sensor: 'HEART',
    event: 'LAST',
    read(s) {
      const last = s.getLast() || 0;
      return { text: last > 0 ? String(last) : '--', progress: null };
    },
  },
  distance: {
    sensor: 'DISTANCE',
    read(s, ctx) {
      const { text, unit } = formatDistance(s.getCurrent() || 0, ctx.imperial);
      return { text, unit, progress: null };
    },
  },
  calories: {
    sensor: 'CALORIE',
    read(s) {
      const current = s.getCurrent() || 0;
      const target = s.getTarget() || 300;
      return { text: formatThousands(current), progress: current / target };
    },
  },
  pai: {
    sensor: 'PAI',
    read(s) {
      const total = s.getTotal() || 0;
      return { text: String(total), progress: total / 100 };
    },
  },
  stand: {
    sensor: 'STAND',
    read(s) {
      const current = s.getCurrent() || 0;
      const target = s.getTarget() || 12;
      return { text: String(current), progress: current / target };
    },
  },
  fatburn: {
    sensor: 'FAT_BURNING',
    read(s) {
      const current = s.getCurrent() || 0;
      const target = s.getTarget() || 30;
      return { text: String(current), progress: current / target };
    },
  },
  spo2: {
    sensor: 'SPO2',
    read(s) {
      const r = s.getCurrent();
      const v = r && r.value;
      return { text: v > 0 ? `${v}%` : '--', progress: null };
    },
  },
  stress: {
    sensor: 'STRESS',
    read(s) {
      const r = s.getCurrent();
      const v = r && r.value;
      return { text: v > 0 ? String(v) : '--', progress: null };
    },
  },
  resting: {
    sensor: 'HEART',
    read(s) {
      const v = num(s.getResting());
      return { text: v > 0 ? String(v) : '--', progress: null };
    },
  },
  bodytemp: {
    sensor: 'BODY_TEMP',
    read(s, ctx) {
      const r = s.getCurrent();
      const c = r && r.current;
      if (!(c > 0)) return { text: '--', progress: null };
      // the degree sign is part of the value, as in the weather temperature
      return { text: `${(ctx.fahrenheit ? cToF(c) : c).toFixed(1)}°`, progress: null };
    },
  },
  sleep: {
    sensor: 'SLEEP',
    read(s, ctx) {
      // the system refreshes sleep data every 30 minutes; ask for a refresh at most every 10
      const t = ctx.time.ms || 0;
      if (typeof s.updateInfo === 'function' && !(t - sleepAsked < 600000 && t >= sleepAsked)) {
        sleepAsked = t;
        s.updateInfo();
      }
      const info = s.getInfo();
      const total = num(info && info.totalTime);
      if (!total) return { text: '--', progress: null };
      const m = total % 60;
      return { text: `${Math.floor(total / 60)}:${m < 10 ? '0' : ''}${m}`, progress: total / (ctx.sleepTarget || 480) };
    },
  },
  sleepscore: {
    sensor: 'SLEEP',
    read(s) {
      const info = s.getInfo();
      const v = num(info && info.score);
      return { text: v > 0 ? String(v) : '--', progress: v / 100 };
    },
  },
  vo2max: {
    sensor: 'WORKOUT',
    read(s) {
      const st = s.getStatus();
      const v = Math.round(num(st && st.vo2Max));
      return { text: v > 0 ? String(v) : '--', progress: null };
    },
  },
  trainload: {
    sensor: 'WORKOUT',
    read(s) {
      const st = s.getStatus();
      const v = Math.round(num(st && st.trainingLoad));
      return { text: st ? String(v) : '--', progress: null };
    },
  },
  recovery: {
    sensor: 'WORKOUT',
    read(s) {
      const st = s.getStatus();
      if (!st) return { text: '--', progress: null };
      return { text: String(Math.round(num(st.fullRecoveryTime))), unit: 'h', progress: null };
    },
  },
  altitude: {
    sensor: 'BAROMETER',
    read(s, ctx) {
      const m = s.getAltitude();
      if (typeof m !== 'number' || !isFinite(m)) return { text: '--', progress: null };
      const v = Math.round(ctx.imperial ? m * 3.28084 : m);
      return { text: v < 0 ? `-${formatThousands(-v)}` : formatThousands(v), unit: ctx.imperial ? 'ft' : 'm', progress: null };
    },
  },
  pressure: {
    sensor: 'BAROMETER',
    read(s) {
      const v = Math.round(num(s.getAirPressure()));
      return v > 0 ? { text: String(v), unit: 'hPa', progress: null } : { text: '--', progress: null };
    },
  },
  compass: {
    sensor: 'COMPASS',
    event: 'COMPASS',
    read(s) {
      const a = s.getDirectionAngle();
      if (typeof a !== 'number' || !isFinite(a)) return { text: '--', progress: null };
      const deg = ((Math.round(a) % 360) + 360) % 360;
      // the cardinal point is drawn like a unit (small, in the metric's colour), so
      // "312° NW" fits a corner as well as "99,999" does
      return { text: `${deg}°`, unit: POINTS[Math.round(deg / 45) % 8], progress: null };
    },
  },
  moon: {
    sensor: 'TIME',
    read(s, ctx) {
      const p = moonPhase(ctx.time.ms);
      return { text: `${p.lit}%`, progress: null, icon: `moon_${p.index}` };
    },
  },
  forecast: {
    sensor: 'WEATHER',
    read(s, ctx) {
      const f = todayForecast(s);
      if (!f) return { text: '--', progress: null, icon: 'forecast' };
      const t = (c) => Math.round(ctx.fahrenheit ? cToF(c) : c);
      return { text: `${t(f.high)}/${t(f.low)}°`, progress: null, icon: `weather_${f.index}` };
    },
  },
  sun: {
    sensor: 'WEATHER',
    read(s, ctx) {
      const ev = nextSunEvent(s, ctx.time);
      if (!ev) return { text: '--:--', progress: null, icon: 'sun' };
      return {
        text: formatClock(ev.hour, ev.minute, ctx.is12h),
        progress: null,
        icon: ev.type === 'sunrise' ? 'sunrise' : 'sun',
      };
    },
  },
};

/** Metrics drawn by the system (no sensor exposes them). `type` is the data_type key. */
export const BOUND_METRICS = {
  floors: { type: 'FLOOR', unit: 0, progress: true },
  uvi: { type: 'UVI', unit: 0, progress: false },
  humidity: { type: 'HUMIDITY', unit: 1, progress: false },
  // current temperature; the icon is an IMG_LEVEL of condition icons bound to the same data
  weather: { type: 'WEATHER_CURRENT', unit: 1, progress: false, levelIcon: 'weather' },
  aqi: { type: 'AQI', unit: 0, progress: false },
};
