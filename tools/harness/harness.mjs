#!/usr/bin/env node
/**
 * Offline test harness: runs watchface/index.js against stubbed Zepp OS modules
 * (@zos/ui, @zos/sensor, @zos/settings, @zos/utils and the WatchFace global), then
 * dumps the live widget tree as JSON.
 *
 * It catches runtime errors and missing assets without a watch, and its output
 * drives tools/preview.py, which renders README screenshots from the real code.
 *
 *   node tools/harness/harness.mjs faces/<face> faces/<face>/scenarios/day.json > widgets.json
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FACE = path.resolve(REPO, process.argv[2]);
const ASSETS = path.join(FACE, 'assets/common.r');
const scenario = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));

const enumOf = (names) => Object.fromEntries(names.map((n, i) => [n, i + 1]));
const WIDGET = enumOf(['IMG', 'TEXT', 'TEXT_FONT', 'FILL_RECT', 'ARC_PROGRESS', 'IMG_TIME', 'IMG_STATUS', 'IMG_LEVEL', 'WATCHFACE_EDIT_GROUP', 'WIDGET_DELEGATE', 'GROUP']);
const WIDGET_NAME = Object.fromEntries(Object.entries(WIDGET).map(([k, v]) => [v, k]));
const PROP = enumOf(['TEXT', 'SRC', 'VISIBLE', 'MORE', 'CURRENT_TYPE', 'COLOR', 'ANGLE']);
const DATA_TYPES = ['STEP', 'CAL', 'HEART', 'DISTANCE', 'FLOOR', 'STAND', 'FAT_BURNING', 'SPO2', 'STRESS', 'UVI',
  'HUMIDITY', 'AQI', 'PAI_WEEKLY', 'WEATHER_CURRENT', 'BATTERY'];

const widgets = [];
const errors = [];
let editCounter = 0;

function makeWidget(type, props) {
  const w = { id: widgets.length, type: WIDGET_NAME[type], props: { ...props }, alive: true, visible: true };
  widgets.push(w);
  for (const key of ['src']) checkAsset(w.props[key], w);
  for (const key of ['hour_array', 'minute_array', 'image_array']) (w.props[key] || []).forEach((p) => checkAsset(p, w));
  for (const key of ['select_image', 'un_select_image', 'tips_BG']) checkAsset(w.props[key], w);
  (w.props.optional_types || []).forEach((t) => checkAsset(t.preview, w));
  if (w.props.font) checkAsset(w.props.font, w);
  return {
    setProperty(prop, value) {
      if (prop === PROP.TEXT) w.props.text = value;
      else if (prop === PROP.SRC) { w.props.src = value; checkAsset(value, w); }
      else if (prop === PROP.VISIBLE) w.visible = !!value;
      else if (prop === PROP.MORE) Object.assign(w.props, value);
      else if (prop === PROP.COLOR) w.props.color = value;
      else if (prop === PROP.ANGLE) w.props.angle = value;
      else errors.push(`unknown setProperty ${prop}`);
    },
    addEventListener(ev, fn) { w.listeners = (w.listeners || 0) + 1; },
    getProperty(prop) {
      if (prop === PROP.CURRENT_TYPE) {
        const pick = (scenario.edit || [])[editCounter++];
        const types = w.props.optional_types;
        const t = types.find((x) => x.data.id === pick) || types.find((x) => x.type === w.props.default_type);
        return t.type;
      }
      return undefined;
    },
    _w: w,
  };
}

function checkAsset(rel, w) {
  if (!rel) return;
  if (!fs.existsSync(path.join(ASSETS, rel))) errors.push(`missing asset "${rel}" (widget ${w.type} #${w.id})`);
}

const S = scenario.sensors || {};
const listeners = [];
// @zos/sensor: one class per sensor, reading the scenario's API-level-1-shaped data
function sensorClass(name, methods) {
  return class {
    constructor() {
      const data = S[name] || {};
      Object.entries(methods(data)).forEach(([k, f]) => { this[k] = f; });
      ['onChange', 'onLastChange', 'onPerMinute'].forEach((ev) => {
        this[ev] = (fn) => listeners.push({ name, ev, fn });
      });
      ['offChange', 'offLastChange', 'offPerMinute'].forEach((ev) => { this[ev] = () => {}; });
    }
  };
}
const progress = (d) => ({ getCurrent: () => d.current || 0, getTarget: () => d.target || 0 });
const sensorModule = {
  Time: sensorClass('TIME', (d) => ({
    getHours: () => d.hour || 0, getMinutes: () => d.minute || 0, getDate: () => d.day || 1,
    getMonth: () => d.month || 1, getDay: () => d.week || 1,
    getTime: () => Date.UTC(2026, (d.month || 1) - 1, d.day || 1, d.hour || 0, d.minute || 0),
  })),
  Battery: sensorClass('BATTERY', (d) => ({ getCurrent: () => d.current || 0 })),
  Step: sensorClass('STEP', progress),
  Calorie: sensorClass('CALORIE', progress),
  HeartRate: sensorClass('HEART', (d) => ({ getLast: () => d.last || 0, getCurrent: () => d.last || 0, getResting: () => d.resting || 0 })),
  Distance: sensorClass('DISTANCE', (d) => ({ getCurrent: () => d.current || 0 })),
  Pai: sensorClass('PAI', (d) => ({ getTotal: () => d.totalpai || 0, getToday: () => 0 })),
  Stand: sensorClass('STAND', progress),
  FatBurning: sensorClass('FAT_BURNING', progress),
  BloodOxygen: sensorClass('SPO2', (d) => ({ getCurrent: () => ({ value: d.value || 0 }) })),
  Stress: sensorClass('STRESS', (d) => ({ getCurrent: () => ({ value: d.value || 0 }) })),
  Sleep: sensorClass('SLEEP', (d) => ({ updateInfo: () => {}, getInfo: () => ({ totalTime: d.total || 0, score: d.score || 0 }) })),
  Workout: sensorClass('WORKOUT', (d) => ({ getStatus: () => ({ vo2Max: d.vo2max || 0, trainingLoad: d.load || 0, fullRecoveryTime: d.recovery || 0 }) })),
  Barometer: sensorClass('BAROMETER', (d) => ({ getAltitude: () => d.altitude, getAirPressure: () => d.pressure || 0 })),
  BodyTemperature: sensorClass('BODY_TEMP', (d) => ({ getCurrent: () => ({ current: d.current || 0 }) })),
  Compass: sensorClass('COMPASS', (d) => ({ start() {}, stop() {}, getDirectionAngle: () => (d.angle === undefined ? 'INVALID' : d.angle) })),
  Weather: sensorClass('WEATHER', (d) => ({ getForecast: () => d.forecast || { tideData: { count: 0, data: [] } } })),
};

let watchface = null;
const zos = {
  ui: {
    widget: WIDGET,
    prop: PROP,
    align: enumOf(['TOP', 'BOTTOM', 'LEFT', 'RIGHT', 'CENTER_H', 'CENTER_V']),
    show_level: { ONLY_NORMAL: 1, ONLY_AOD: 2, ONLY_EDIT: 4 },
    system_status: enumOf(['DISCONNECT', 'DISTURB', 'CLOCK', 'LOCK']),
    data_type: enumOf(DATA_TYPES),
    event: enumOf(['CLICK_DOWN', 'CLICK_UP', 'MOVE']),
    createWidget: makeWidget,
    deleteWidget(handle) { handle._w.alive = false; },
  },
  sensor: sensorModule,
  settings: {
    TIME_FORMAT_12: 0, TIME_FORMAT_24: 1, DISTANCE_UNIT_METRIC: 0, DISTANCE_UNIT_IMPERIAL: 1,
    TEMPERATURE_UNIT_CENTIGRADE: 0, TEMPERATURE_UNIT_FAHRENHEIT: 1,
    getTemperatureUnit: () => (scenario.imperial ? 1 : 0),
    getSleepTarget: () => 480,
    getTimeFormat: () => (scenario.is12h ? 0 : 1),
    getDistanceUnit: () => (scenario.imperial ? 1 : 0),
  },
  utils: { px: (v) => v },
  app: { getScene: () => (scenario.aod ? 2 : 1), SCENE_AOD: 2 },   // scenario.aod: the always-on copy
  router: {
    launchApp: () => {},
    ...Object.fromEntries(['STATUS', 'HR', 'WEATHER', 'PAI', 'PRESSURE', 'THERMOMETER', 'SLEEP', 'SPORT_STATUS', 'ALTIMETER',
      'COMPASS', 'SUN_AND_MOON'].map((n, i) => [`SYSTEM_APP_${n}`, i + 1])),
  },
};
const context = {
  console,
  WatchFace: (def) => { watchface = def; },
  __zos: zos,
};
context.globalThis = context;

// resolve `import ... from '@zos/<name>'` to the stubs above
const zosPlugin = {
  name: 'zos',
  setup(b) {
    b.onResolve({ filter: /^@zos\// }, (args) => ({ path: args.path.slice(5), namespace: 'zos' }));
    b.onLoad({ filter: /.*/, namespace: 'zos' }, (args) => ({ contents: `module.exports = globalThis.__zos[${JSON.stringify(args.path)}];`, loader: 'js' }));
  },
};
const out = await build({
  entryPoints: [path.join(FACE, 'watchface/index.js')],
  bundle: true, format: 'iife', write: false, target: 'es2019', logLevel: 'silent', plugins: [zosPlugin],
});
vm.createContext(context);
vm.runInContext(out.outputFiles[0].text, context, { filename: 'watchface.js' });
if (!watchface) throw new Error('WatchFace() was never called');
watchface.build();
// simulate a later minute tick so theme switching + updates run again
for (const l of listeners.filter((x) => x.name === 'TIME' && x.ev === 'onPerMinute')) l.fn();

const dataTypeName = Object.fromEntries(Object.entries(zos.ui.data_type).map(([k, v]) => [v, k]));
const live = widgets.filter((w) => w.alive && w.type !== 'WIDGET_DELEGATE').map((w) => ({
  ...w, props: { ...w.props, type: w.props.type && w.type !== 'WATCHFACE_EDIT_GROUP' ? dataTypeName[w.props.type] : w.props.type },
}));
process.stdout.write(JSON.stringify({ errors, widgets: live }, null, 1));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
