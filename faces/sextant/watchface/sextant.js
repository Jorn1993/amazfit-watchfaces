import * as hmUI from '@zos/ui';
import {
  Time, Battery, Step, Calorie, HeartRate, Distance, Pai, Weather, Stand, FatBurning, BloodOxygen, Stress,
  Sleep, Workout, Barometer, BodyTemperature, Compass,
} from '@zos/sensor';
import {
  getTimeFormat, getDistanceUnit, getTemperatureUnit, getSleepTarget,
  TIME_FORMAT_12, DISTANCE_UNIT_IMPERIAL, TEMPERATURE_UNIT_FAHRENHEIT,
} from '@zos/settings';
import { px } from '@zos/utils';
import { getScene, SCENE_AOD } from '@zos/app';
import * as router from '@zos/router';
import { METRIC_IDS, METRIC_TYPE, METRIC_APP, SENSOR_METRICS, BOUND_METRICS } from '../../../lib/js/metrics';
import { isNight } from '../../../lib/js/sun';
import { textWidth } from '../../../lib/js/format';

// ------------------------------------------------------------------ options
/**
 * Registers the watch face for one generated layout.
 * Layout options used here: L.edit_metrics (the metrics the editable slots offer,
 * default all) and L.fixed_slots ({slot index: metric} slots that aren't editable).
 */
export function sextantFace(L) {

  const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  // ------------------------------------------------------------------ editor options
  /** Glyph image names for turned corners (see design/assets.py ROT_CHARS). */
  const ROT_CODES = { ',': 'comma', '.': 'dot', '-': 'dash', ':': 'colon', '%': 'pct', '/': 'slash', '°': 'deg' };
  for (let d = 0; d < 10; d++) ROT_CODES[String(d)] = String(d);
  const rotCode = (c) => ROT_CODES[c] || (c >= 'A' && c <= 'Z' ? `cap_${c}` : c);

  /** title: English, or [English, Simplified Chinese, Traditional Chinese]. */
  function editType(type, title, preview, id) {
    const [en, sc, tc] = Array.isArray(title) ? title : [title, title, title];
    return { type, title_en: en, title_sc: sc, title_tc: tc, preview, data: { id } };
  }
  // type numbers follow the full metric list, so a metric keeps its type in every face
  const SLOT_TYPES = METRIC_IDS.map((id) => editType(100001 + METRIC_TYPE[id],
    [L.metrics[id].title, L.metrics[id].title_sc, L.metrics[id].title_tc], `edit/preview_${id}.png`, id))
    .filter((t) => !L.edit_metrics || L.edit_metrics.indexOf(t.data.id) >= 0);
  const FIXED = L.fixed_slots || {};
  /** A tap on a complication opens its app only if it's this short and this still (ms, px). */
  const TAP_MAX_MS = 600;
  const TAP_MAX_MOVE = 24;
  const THEME_TYPES = [
    editType(100101, ['Color', '彩色', '彩色'], 'edit/preview_theme_color.png', 'color'),
    editType(100102, ['Mono', '单色', '單色'], 'edit/preview_theme_mono.png', 'mono'),
    editType(100103, ['Mix', '混合', '混合'], 'edit/preview_theme_mix.png', 'mix'),
    editType(100104, ['Blue', '蓝色', '藍色'], 'edit/preview_theme_blue.png', 'blue'),
    editType(100105, ['Green', '绿色', '綠色'], 'edit/preview_theme_green.png', 'green'),
    editType(100106, ['Purple', '紫色', '紫色'], 'edit/preview_theme_purple.png', 'purple'),
    editType(100107, ['Orange', '橙色', '橙色'], 'edit/preview_theme_orange.png', 'orange'),
    editType(100108, ['Pink', '粉色', '粉色'], 'edit/preview_theme_pink.png', 'pink'),
  ];
  const NIGHT_TYPES = [
    editType(100201, ['Night mode: auto', '夜间模式：自动', '夜間模式：自動'], 'edit/preview_night_auto.png', 'auto'),
    editType(100202, ['Night mode: off', '夜间模式：关', '夜間模式：關'], 'edit/preview_night_off.png', 'off'),
  ];

  function px_(v) {
    return px(v);
  }

  /** Sensor classes by the names lib/js/metrics.js uses. */
  const SENSORS = {
    TIME: Time, BATTERY: Battery, STEP: Step, CALORIE: Calorie, HEART: HeartRate, DISTANCE: Distance,
    PAI: Pai, WEATHER: Weather, STAND: Stand, FAT_BURNING: FatBurning, SPO2: BloodOxygen, STRESS: Stress,
    SLEEP: Sleep, WORKOUT: Workout, BAROMETER: Barometer, BODY_TEMP: BodyTemperature, COMPASS: Compass,
  };

  WatchFace({
    build() {
      this.sensors = {};
      this.widgets = [];
      this.dyn = null;
      this.theme = null;

      this.timeSensor = this.sensor('TIME');
      this.batterySensor = this.sensor('BATTERY');
      this.weatherSensor = this.sensor('WEATHER');

      // Edit-mode backdrop. The firmware hides normal widgets while editing and draws edit
      // previews in creation order, so this must exist before the edit groups.
      this.editBg = hmUI.createWidget(hmUI.widget.IMG, {
        x: 0, y: 0, src: 'edit/bg_color.png', show_level: hmUI.show_level.ONLY_EDIT,
      });
      // fixed (non-editable) slots show their metric's preview in the editor
      Object.keys(FIXED).forEach((i) => {
        const e = L.slots[i].edit;
        hmUI.createWidget(hmUI.widget.IMG, {
          x: px_(e.x), y: px_(Math.round(e.y + (e.h - 88) / 2)), src: `edit/preview_${FIXED[i]}.png`, show_level: hmUI.show_level.ONLY_EDIT,
        });
      });
      this.settings = this.buildEditGroups();
      this.subscribe();
      this.applyTheme(true);

      hmUI.createWidget(hmUI.widget.WIDGET_DELEGATE, {
        resume_call: () => {
          this.compassOn(true);
          this.applyTheme(false);
          this.update();
        },
        pause_call: () => this.compassOn(false),
      });
      this.compassOn(true);
    },

    /** The compass only runs while a slot shows it and the face is on screen. */
    compassOn(on) {
      if (this.settings.slots.indexOf('compass') < 0) return;
      // the always-on screen builds the face too, but never shows the compass
      if (on && this.isAod()) return;
      const c = this.sensor('COMPASS');
      if (!c) return;
      try {
        if (on) c.start();
        else c.stop();
      } catch (e) {
        // not available on this watch
      }
    },

    /** True in the always-on screen's instance of the face. */
    isAod() {
      return typeof getScene === 'function' && getScene() === SCENE_AOD;
    },

    onDestroy() {
      this.compassOn(false);
      this.unsubscribe && this.unsubscribe();
    },

    // ---------------------------------------------------------------- sensors
    sensor(name) {
      if (this.sensors[name] === undefined) {
        try {
          this.sensors[name] = SENSORS[name] ? new SENSORS[name]() : null;
        } catch (e) {
          this.sensors[name] = null;   // e.g. a missing permission
        }
      }
      return this.sensors[name];
    },

    subscribe() {
      const onMinute = () => {
        this.applyTheme(false);
        this.update();
      };
      // at most one refresh a second (the compass and barometer report often)
      let last = 0;
      const onChange = () => {
        // the always-on screen shows only the time, date and battery: the minute tick is enough
        if (this.isAod()) return;
        const t = Date.now();
        if (t - last < 1000) return;
        last = t;
        this.update();
      };
      const subs = [];
      if (this.timeSensor) {
        this.timeSensor.onPerMinute(onMinute);
        subs.push(() => this.timeSensor.offPerMinute && this.timeSensor.offPerMinute(onMinute));
      }

      const watched = new Set(['BATTERY']);
      this.settings.slots.forEach((id) => {
        const def = SENSOR_METRICS[id];
        if (def && ['WEATHER', 'TIME', 'SLEEP', 'WORKOUT', 'BODY_TEMP'].indexOf(def.sensor) < 0) watched.add(def.sensor);
      });
      watched.forEach((name) => {
        const s = this.sensor(name);
        if (!s) return;
        const def = this.settings.slots.map((id) => SENSOR_METRICS[id]).find((d) => d && d.sensor === name);
        // heart rate reports its last measurement; the others report changes
        const [on, off] = def && def.event === 'LAST' ? ['onLastChange', 'offLastChange'] : ['onChange', 'offChange'];
        if (typeof s[on] !== 'function') return;
        s[on](onChange);
        subs.push(() => typeof s[off] === 'function' && s[off](onChange));
      });
      this.unsubscribe = () => subs.forEach((f) => f());
    },

    // ---------------------------------------------------------------- editor
    buildEditGroups() {
      const group = (id, box, types, defaultId, tipsBelow) => {
        const def = types.find((t) => t.data.id === defaultId) || types[0];
        const g = hmUI.createWidget(hmUI.widget.WATCHFACE_EDIT_GROUP, {
          edit_id: id,
          x: px_(box.x),
          y: px_(box.y),
          w: px_(box.w),
          h: px_(box.h),
          select_image: `edit/select_${box.w}x${box.h}.png`,
          un_select_image: `edit/unselect_${box.w}x${box.h}.png`,
          default_type: def.type,
          optional_types: types,
          count: types.length,
          tips_BG: 'edit/tip.png',
          tips_x: px_(box.w / 2 - 75),
          tips_y: px_(tipsBelow ? box.h + 6 : -46),
          tips_width: px_(150),
          tips_margin: px_(6),
        });
        const current = g.getProperty(hmUI.prop.CURRENT_TYPE);
        const chosen = types.find((t) => t.type === current) || def;
        return chosen.data.id;
      };
      const slots = L.slots.map((s, i) => (FIXED[i] ? FIXED[i]
        : group(101 + i, s.edit, SLOT_TYPES, L.default_slots[i], i < 2 || i === 5)));
      const theme = group(120, L.theme_edit, THEME_TYPES, 'color', false);
      const night = group(121, L.night_edit, NIGHT_TYPES, 'auto', false);
      return { slots, theme, night };
    },

    // ---------------------------------------------------------------- theme
    wantedTheme() {
      if (this.settings.night === 'auto' && isNight(this.weatherSensor, this.now())) return 'night';
      return this.settings.theme;
    },

    applyTheme(force) {
      const theme = this.wantedTheme();
      if (!force && theme === this.theme) return;
      this.theme = theme;
      this.widgets.forEach((w) => hmUI.deleteWidget(w));
      this.widgets = [];
      this.render(theme);
      this.update();
    },

    w(type, props) {
      const widget = hmUI.createWidget(type, props);
      this.widgets.push(widget);
      return widget;
    },

    text(box, extra) {
      return this.w(hmUI.widget.TEXT, {
        x: px_(box.x),
        y: px_(box.y),
        w: px_(box.w),
        h: px_(box.h),
        text: '',
        text_size: px_(box.size),
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        font: L.font,
        show_level: hmUI.show_level.ONLY_NORMAL,
        ...extra,
      });
    },

    // ---------------------------------------------------------------- render
    render(theme) {
      const C = L.colors[theme];
      const AOD = hmUI.show_level.ONLY_AOD;
      const dyn = { slots: [] };
      this.dyn = dyn;
      // the condition text under the time only shows when a slot shows the weather
      const hasDesc = this.settings.slots.indexOf('weather') >= 0;
      // the always-on screen builds its own copy of the face, with only the always-on widgets
      const aodCopy = this.isAod();
      if (!aodCopy) this.renderNormal(theme, C, dyn, hasDesc);

      // ------------------------------------------------------------ always-on
      this.w(hmUI.widget.IMG, { x: 0, y: 0, src: C.aod_bg, show_level: AOD });
      this.timeWidgets(`aod/time_${theme}`, L.time, AOD);
      const aodText = (box, color) => this.text(box, { color, show_level: AOD });
      dyn.aodDow = aodText(L.aod.date.dow, C.aod_text);
      dyn.aodDay = aodText(L.aod.date.day, C.aod_text);
      dyn.aodMonth = aodText(L.aod.date.month, C.aod_text);
      this.w(hmUI.widget.IMG, {
        x: px_(L.aod.battery.icon.x), y: px_(L.aod.battery.icon.y), src: `aod/battery_${theme}.png`, show_level: AOD,
      });
      dyn.aodBatteryFill = this.batteryFill(L.aod.battery.fill, C.aod_text, AOD);
      dyn.aodBattery = aodText(L.aod.battery.text, C.aod_text);

      // created last: a widget created later (even an always-on one) would take the taps
      if (!aodCopy) this.renderTaps();
    },

    /** The battery's charge: a rounded bar inside the outline icon, as wide as the level. */
    batteryFill(box, color, showLevel) {
      return this.w(hmUI.widget.FILL_RECT, {
        x: px_(box.x), y: px_(box.y), w: px_(box.w), h: px_(box.h), radius: px_(box.radius), color, show_level: showLevel,
      });
    },

    setBatteryFill(widget, box, level, color) {
      if (!widget) return;
      // whole pixels, rounded, so 100% is the full bar and anything above 0% shows at least 1px
      const w = level <= 0 ? 0 : Math.max(1, Math.round((box.w * Math.min(level, 100)) / 100));
      const key = `${w}/${color}`;
      if (widget.shown === key) return;
      widget.shown = key;
      widget.setProperty(hmUI.prop.VISIBLE, w > 0);
      if (w > 0) widget.setProperty(hmUI.prop.MORE, {
        x: px_(box.x), y: px_(box.y), w: px_(w), h: px_(box.h), radius: px_(w > 2 * box.radius ? box.radius : 0), color,
      });
    },

    /** Everything on the normal (not always-on) screen. */
    renderNormal(theme, C, dyn, hasDesc) {
      const NORMAL = hmUI.show_level.ONLY_NORMAL;
      this.w(hmUI.widget.IMG, { x: 0, y: 0, src: C.bg, show_level: NORMAL });
      this.editBg.setProperty(hmUI.prop.SRC, `edit/bg_${theme}.png`);

      // compass markers not tied to a gauge (none at present) and the section rules
      L.markers.fixed.forEach((m) => {
        this.w(hmUI.widget.IMG, { x: px_(m.x), y: px_(m.y), src: `marker/${theme}/m${m.k}_brass.png`, show_level: NORMAL });
      });
      (L.rules || []).forEach((r) => {
        this.w(hmUI.widget.IMG, { x: px_(r.x), y: px_(r.y), src: `rule/${theme}_${r.src}.png`, show_level: NORMAL });
      });

      // gauges: every tick is its own short ARC_PROGRESS (no overlay mask), so the
      // result does not depend on how the firmware layers arcs and images.
      const g = L.gauge;
      this.settings.slots.forEach((id, i) => {
        const seg = g.segments[i];
        const unit = C.unit[id];
        const ticks = seg.ticks.map((t) => {
          const r = t.r_center;                // ARC_PROGRESS radius is the centre of the stroke
          // whole-degree angles only: the firmware truncates arc angles (see geometry.tick_arc)
          const base = {
            center_x: px_(240), center_y: px_(240), radius: px_(r), line_width: px_(t.len),
            start_angle: t.s, end_angle: t.e, level: 100, corner_flag: 3, show_level: NORMAL,
          };
          const widget = this.w(hmUI.widget.ARC_PROGRESS, { ...base, color: unit.dim });
          return { widget, base, lit: false };
        });
        // the top- and bottom-middle gauges have a marker on the centre line (their 50% point)
        let marker = null;
        if (seg.marker) {
          const m = seg.marker;
          const base = `m${m.k}_brass`;
          marker = {
            widget: this.w(hmUI.widget.IMG, { x: px_(m.x), y: px_(m.y), src: `marker/${theme}/${base}.png`, show_level: NORMAL }),
            k: m.k, base, after: m.after, lit: false,
          };
        }
        dyn.slots.push({ id, ticks, marker, progress: SENSOR_METRICS[id] && L.metrics[id].progress });
      });

      // complications
      this.settings.slots.forEach((id, i) => {
        const box = L.slots[i];
        const slot = dyn.slots[i];
        const bound = BOUND_METRICS[id];
        // turned corners (Twisted Sextant): the firmware turns the icon and the glyph images
        const rot = box.rot;
        const turnIcon = rot && rot.icon && !(bound && bound.levelIcon);
        const iconAt = turnIcon ? {
          x: rot.icon.x, y: rot.icon.y, w: rot.icon.box, h: rot.icon.box, pos_x: rot.icon.pos, pos_y: rot.icon.pos,
          center_x: rot.icon.box / 2, center_y: rot.icon.box / 2, angle: rot.deg,
        } : { x: box.icon.x, y: box.icon.y };
        const iconProps = (src) => {
          const o = { src, show_level: NORMAL };
          Object.keys(iconAt).forEach((k) => { o[k] = k === 'angle' ? iconAt[k] : px_(iconAt[k]); });
          return o;
        };
        slot.iconDir = `icons/${theme === 'mix' ? 'color' : theme}`;
        if (bound && bound.levelIcon) {
          // weather: the firmware picks the current condition's icon (no API level 1 property)
          slot.icon = this.w(hmUI.widget.IMG_LEVEL, {
            x: px_(iconAt.x), y: px_(iconAt.y),
            image_array: L.weather_desc.map((_, k) => `${slot.iconDir}/${bound.levelIcon}_${L.weather_icon_index[k]}.png`),
            image_length: L.weather_desc.length, type: hmUI.data_type.WEATHER_CURRENT, show_level: NORMAL,
          });
        } else {
          slot.icon = this.w(hmUI.widget.IMG, iconProps(`${slot.iconDir}/${id}.png`));
        }
        if (bound && hmUI.data_type[bound.type] !== undefined) {
          this.w(hmUI.widget.TEXT_FONT, {
            x: px_(box.value.x), y: px_(box.value.y), w: px_(box.value.w), h: px_(box.value.h),
            text_size: px_(box.value.size), color: C.colored_values ? C.unit[id].on : C.text, font: L.font,
            align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
            type: hmUI.data_type[bound.type], unit_type: bound.unit, show_level: NORMAL,
          });
        } else if (rot) {
          slot.rot = rot;
          slot.glyphs = [0, 1, 2, 3, 4, 5, 6, 7].map(() => this.w(hmUI.widget.IMG, {
            x: 0, y: 0, w: px_(rot.q), h: px_(rot.q), pos_x: 0, pos_y: 0,
            center_x: px_(rot.q / 2), center_y: px_(rot.q / 2), angle: rot.deg, src: 'rot/blank.png', show_level: NORMAL,
          }));
          if (!SENSOR_METRICS[id]) this.setRotValue(slot, { text: '--' });
        } else {
          slot.value = this.text(box.value, { color: C.colored_values ? C.unit[id].on : C.text });
          slot.unit = this.text({ x: box.cx, y: box.unit.y, w: 40, h: box.unit.h, size: box.unit.size }, {
            color: C.unit[id] ? C.unit[id].on : C.muted, align_h: hmUI.align.LEFT,
          });
          if (!SENSOR_METRICS[id]) slot.value.setProperty(hmUI.prop.TEXT, '--');
        }
      });

      // glances: an "off" image is always shown (Bluetooth: connected icon; others: dim
      // outline); the system shows the active icon on top only while the status is on.
      const statusType = {
        disconnect: hmUI.system_status.DISCONNECT,
        dnd: hmUI.system_status.DISTURB,
        alarm: hmUI.system_status.CLOCK,
        lock: hmUI.system_status.LOCK,
      };
      L.glances.forEach((gl) => {
        if (statusType[gl.name] === undefined) return;
        this.w(hmUI.widget.IMG, {
          x: px_(gl.x), y: px_(gl.y), src: `status/${theme}/${gl.name}_off.png`, show_level: NORMAL,
        });
        this.w(hmUI.widget.IMG_STATUS, {
          x: px_(gl.x), y: px_(gl.y), type: statusType[gl.name], src: `status/${theme}/${gl.name}.png`, show_level: NORMAL,
        });
      });

      // date (left of the time), battery (right)
      dyn.dow = this.text(L.date.dow, { color: C.accent });
      dyn.day = this.text(L.date.day, { color: C.text });
      dyn.month = this.text(L.date.month, { color: C.muted });
      dyn.batteryIcon = this.w(hmUI.widget.IMG, {
        x: px_(L.battery.icon.x), y: px_(L.battery.icon.y), src: `battery/${theme}/high.png`, show_level: NORMAL,
      });
      dyn.batteryFill = this.batteryFill(L.battery.fill, C.battery.high, NORMAL);
      dyn.battery = this.text(L.battery.text, { color: C.text });

      // time
      this.timeWidgets(`time/${theme}`, L.time, NORMAL);
      // condition text: pre-rendered names picked by the firmware (current conditions).
      // Only shown when a slot shows weather: without the temperature it's out of context.
      if (hasDesc) this.w(hmUI.widget.IMG_LEVEL, {
        x: px_(L.desc_img.x), y: px_(L.desc_img.y),
        image_array: L.weather_desc.map((text, i) => text
          ? `desc/${theme}/${L.weather_text_index[i]}.png`
          : 'desc/color/25.png'), image_length: L.weather_desc.length,
        type: hmUI.data_type.WEATHER_CURRENT, show_level: NORMAL,
      });

    },

    /** Tapping a complication opens the matching system app (heart rate, weather, ...). */
    renderTaps() {
      const NORMAL = hmUI.show_level.ONLY_NORMAL;
      this.settings.slots.forEach((id, i) => {
        const app = METRIC_APP[id] && router[`SYSTEM_APP_${METRIC_APP[id]}`];
        if (app === undefined || typeof router.launchApp !== 'function') return;
        const e = L.slots[i].edit;
        const hit = this.w(hmUI.widget.IMG, {
          x: px_(e.x), y: px_(e.y), w: px_(e.w), h: px_(e.h), src: `edit/tap_${e.w}x${e.h}.png`, show_level: NORMAL,
        });
        // a quick tap only: a long press or a swipe that starts here does nothing
        let down = null;
        hit.addEventListener(hmUI.event.CLICK_DOWN, (info) => {
          down = { t: Date.now(), x: info && info.x, y: info && info.y };
        });
        hit.addEventListener(hmUI.event.CLICK_UP, (info) => {
          const d = down;
          down = null;
          if (!d || Date.now() - d.t > TAP_MAX_MS) return;
          if (info && d.x !== undefined && Math.abs(info.x - d.x) + Math.abs(info.y - d.y) > TAP_MAX_MOVE) return;
          try {
            router.launchApp({ appId: app, native: true });
          } catch (err) {
            // this watch doesn't have that app
          }
        });
      });
    },

    timeWidgets(dir, T, level) {
      const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `${dir}/${d}.png`);
      this.w(hmUI.widget.IMG_TIME, {
        hour_zero: 1, hour_startX: px_(T.hour_x), hour_startY: px_(T.y), hour_array: digits,
        hour_space: 0, hour_align: hmUI.align.LEFT, show_level: level,
      });
      this.w(hmUI.widget.IMG, { x: px_(T.colon_x), y: px_(T.y), src: `${dir}/colon.png`, show_level: level });
      this.w(hmUI.widget.IMG_TIME, {
        minute_zero: 1, minute_startX: px_(T.minute_x), minute_startY: px_(T.y), minute_array: digits,
        minute_space: 0, minute_align: hmUI.align.LEFT, show_level: level,
      });
    },

    /** The current time as plain fields (the shape lib/js expects). */
    now() {
      const t = this.timeSensor;
      return {
        hour: t.getHours(), minute: t.getMinutes(), day: t.getDate(), month: t.getMonth(),
        // 1 = Monday ... 7 = Sunday (0 is also taken as Sunday)
        week: ((t.getDay() + 6) % 7) + 1,
        ms: t.getTime(),
      };
    },

    // ---------------------------------------------------------------- updates
    update() {
      const dyn = this.dyn;
      if (!dyn) return;
      const time = this.now();
      const theme = this.theme;
      const C = L.colors[theme];

      // date
      const dow = WEEKDAYS[((time.week || 1) - 1 + 7) % 7];
      const month = MONTHS[((time.month || 1) - 1 + 12) % 12];
      const day = String(time.day || 1);
      // Widget updates can wake the renderer: only write labels when a value changes.
      [[dyn.dow, dyn.aodDow, dow], [dyn.day, dyn.aodDay, day], [dyn.month, dyn.aodMonth, month]].forEach(([a, b, v]) => {
        if (a && a.shown !== v) {
          a.setProperty(hmUI.prop.TEXT, v);
          a.shown = v;
        }
        if (b && b.shown !== v) {
          b.setProperty(hmUI.prop.TEXT, v);
          b.shown = v;
        }
      });

      // Battery measurements change infrequently. Keep the existing event-driven
      // updates, but avoid rewriting the same icon, text and fill on every tick.
      const level = this.batterySensor ? this.batterySensor.getCurrent() || 0 : 0;
      const band = level > 40 ? 'high' : level > 20 ? 'mid' : 'low';
      const batteryText = `${level}%`;
      if (dyn.batteryIcon) {
        if (dyn.batteryIcon.shown !== band) {
          dyn.batteryIcon.setProperty(hmUI.prop.SRC, `battery/${theme}/${band}.png`);
          dyn.batteryIcon.shown = band;
        }
        if (dyn.battery.shown !== batteryText) {
          dyn.battery.setProperty(hmUI.prop.TEXT, batteryText);
          dyn.battery.shown = batteryText;
        }
        this.setBatteryFill(dyn.batteryFill, L.battery.fill, level, L.colors[theme].battery[band]);
      }
      if (dyn.aodBattery.shown !== batteryText) {
        dyn.aodBattery.setProperty(hmUI.prop.TEXT, batteryText);
        dyn.aodBattery.shown = batteryText;
      }
      this.setBatteryFill(dyn.aodBatteryFill, L.aod.battery.fill, level, L.colors[theme].aod_text);

      // complications (the always-on screen shows none)
      if (this.isAod()) return;
      const ctx = {
        time,
        is12h: getTimeFormat() === TIME_FORMAT_12,
        imperial: getDistanceUnit() === DISTANCE_UNIT_IMPERIAL,
        fahrenheit: getTemperatureUnit() === TEMPERATURE_UNIT_FAHRENHEIT,
        sleepTarget: getSleepTarget() || 480,
      };
      dyn.slots.forEach((slot, i) => {
        const def = SENSOR_METRICS[slot.id];
        if (!def) return;
        const sensor = this.sensor(def.sensor);
        let r = { text: '--', progress: null };
        try {
          if (sensor) r = def.read(sensor, ctx);
        } catch (e) {
          // keep the placeholder
        }
        // DEMO_VALUES (mock-ups on the emulator only, never in a release build)
        if (L.demo_values && L.demo_values[slot.id]) r = L.demo_values[slot.id];
        this.setValue(i, slot, r, C);
        if (r.icon && r.icon !== slot.iconShown) {
          slot.iconShown = r.icon;
          slot.icon.setProperty(hmUI.prop.SRC, `${slot.iconDir}/${r.icon}.png`);
        }
        if (slot.progress) this.setTicks(slot, r.progress);
      });
    },

    /** Turned corners: lay the value (and unit) glyph images along the gauge's direction. */
    setRotValue(slot, r) {
      const key = `${r.text}|${r.unit || ''}`;
      if (slot.shown === key) return;          // nothing changed
      slot.shown = key;
      const R = slot.rot;
      const cw = L.char_widths;
      const items = [];
      for (let k = 0; k < r.text.length; k++) items.push({ c: r.text[k], w: cw.value[r.text[k]] || cw.value['0'], u: false });
      if (r.unit) {
        items.push({ c: null, w: cw.unit_gap });
        for (let k = 0; k < r.unit.length; k++) items.push({ c: r.unit[k], w: cw.unit[r.unit[k]] || 0, u: true });
      }
      const total = items.reduce((a, it) => a + it.w, 0);
      let s = -total / 2;
      let n = 0;
      const dir = `rot/${this.theme}/`;
      items.forEach((it) => {
        const mid = s + it.w / 2;
        s += it.w;
        const code = it.u ? `u_${slot.id}_${rotCode(it.c)}` : ROT_CODES[it.c];
        if (!it.c || !code || n >= slot.glyphs.length) return;
        slot.glyphs[n++].setProperty(hmUI.prop.MORE, {
          x: px_(Math.round(R.vx + R.cos * mid - R.q / 2)), y: px_(Math.round(R.vy + R.sin * mid - R.q / 2)),
          w: px_(R.q), h: px_(R.q), pos_x: 0, pos_y: 0, center_x: px_(R.q / 2), center_y: px_(R.q / 2),
          angle: R.deg, src: `${dir}${code}.png`,
        });
      });
      for (; n < slot.glyphs.length; n++) slot.glyphs[n].setProperty(hmUI.prop.SRC, 'rot/blank.png');
    },

    setValue(i, slot, r, C) {
      if (slot.rot) {
        this.setRotValue(slot, r);
        return;
      }
      const key = `${r.text}|${r.unit || ''}`;
      if (slot.shown === key) return;          // nothing changed
      slot.shown = key;
      const box = L.slots[i];
      slot.value.setProperty(hmUI.prop.TEXT, r.text);
      if (!r.unit) {
        slot.unit.setProperty(hmUI.prop.TEXT, '');
        return;
      }
      // centre "value + unit" as one block using the generated advance widths
      const cw = L.char_widths;
      const wv = textWidth(r.text, cw.value);
      const wu = textWidth(r.unit, cw.unit);
      const left = box.cx - (wv + cw.unit_gap + wu) / 2;
      slot.value.setProperty(hmUI.prop.MORE, {
        x: px_(left), y: px_(box.value.y), w: px_(wv + 4), h: px_(box.value.h),
        text: r.text, text_size: px_(box.value.size),
        color: C.colored_values ? C.unit[slot.id].on : C.text, font: L.font,
        align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V,
      });
      slot.unit.setProperty(hmUI.prop.MORE, {
        x: px_(left + wv + cw.unit_gap), y: px_(box.unit.y), w: px_(wu + 6), h: px_(box.unit.h),
        text: r.unit, text_size: px_(box.unit.size), color: C.unit[slot.id].on, font: L.font,
        align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V,
      });
    },

    /** Light the first round(progress * N) ticks in fill order; only changed ticks are touched. */
    setTicks(slot, progress) {
      const n = progress == null ? 0 : Math.max(0, Math.min(slot.ticks.length, Math.round(progress * slot.ticks.length)));
      const unit = L.colors[this.theme].unit[slot.id];
      slot.ticks.forEach((t, k) => {
        const lit = k < n;
        if (lit === t.lit) return;
        t.lit = lit;
        t.widget.setProperty(hmUI.prop.MORE, { ...t.base, color: lit ? unit.on : unit.dim });
      });
      const m = slot.marker;
      if (m) {
        const lit = n > m.after;
        if (lit !== m.lit) {
          m.lit = lit;
          // Preserve the same pixels while sharing identical marker art:
          // Mix uses Color's lit markers; single-hue themes use brass.
          // Mono/night use one uniform lit image for every metric.
          let path = `marker/${this.theme}/${m.base}.png`;
          if (lit && (this.theme === 'color' || this.theme === 'mix')) {
            path = `marker/color/m${m.k}_lit_${slot.id}.png`;
          } else if (lit && (this.theme === 'mono' || this.theme === 'night')) {
            path = `marker/${this.theme}/m${m.k}_lit_steps.png`;
          }
          m.widget.setProperty(hmUI.prop.SRC, path);
        }
      }
    },
  });
}
