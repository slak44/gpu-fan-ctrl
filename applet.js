const Applet = imports.ui.applet;
const Util = imports.misc.util;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const Settings = imports.ui.settings;

// Shim browser console object
const console = {
  log(...args) {
    global.log(args.join(', '));
  },
  error(...args) {
    global.logError(args.join(', '));
  }
};

function readPath(path) {
  const data = readFile(Gio.File.new_for_path(path));
  if (data === null) return 'nil';
  return data.toString();
}

function readFile(file) {
  try {
    const [ok, data] = file.load_contents(null);
    if (data === null) return null;
    return String.fromCharCode.apply(null, data);
  } catch (err) {
    console.error(err.message);
    return null;
  }
}

function writeFile(file, text) {
  try {
    file.replace_contents(text, null, false, Gio.FileCreateFlags.NONE, null);
  } catch (err) {
    console.error(err.message);
  }
}

function convertRange(number, oldRange, newRange) {
  // This is in [0, 1]
  const normalized = (number - oldRange.start) / (oldRange.end - oldRange.start);
  return newRange.start + normalized * (newRange.end - newRange.start);
}

function parsePwmValue(raw) {
  if (raw === null) return NaN;
  return parseInt(raw.toString().trim(), 10);
}

function hwmonPathFor(id) {
  return `/sys/class/hwmon/hwmon${id}/`;
}

const PWM_AUTO = '2';
const PWM_MANUAL = '1';

const HWMON_SETTING = 'hwmonId';

class FanControlApplet extends Applet.TextApplet {
  constructor(metadata, orientation, panelHeight, instanceId) {
    super(orientation, panelHeight, instanceId);
    // Create applet settings
    this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
    this.settings.bindProperty(Settings.BindingDirection.IN, HWMON_SETTING, HWMON_SETTING, this.setPwmData, null);
    // Set hwmon name tooltip
    this.setNameTooltip();
    // Create the menu
    this.menuManager = new PopupMenu.PopupMenuManager(this);
    this.menu = new Applet.AppletPopupMenu(this, orientation);
    this.menuManager.addMenu(this.menu);
    // Fan speed slider label
    this.sliderLabel = new PopupMenu.PopupMenuItem('', {reactive: false});
    this.menu.addMenuItem(this.sliderLabel);
    // Fan speed slider
    this.slider = new PopupMenu.PopupSliderMenuItem(0);
    this.slider.connect('value-changed', (slider, value) => {
      this.pwmValue = Math.round(convertRange(value, {start: 0, end: 1}, this.pwmRange));
      this.update();
    });
    this.slider.connect('drag-end', () => {
      writeFile(this.pwmFile, this.pwmValue.toString());
    });
    this.menu.addMenuItem(this.slider);
    // Set to 50% button
    this.setTo50 = new PopupMenu.PopupIconMenuItem('Set to 50%', 'object-flip-horizontal', 'normal');
    this.setTo50.connect('activate', () => {
      this.pwmValue = Math.round(convertRange(50.0, {start: 0, end: 100}, this.pwmRange)) + 4; // FIXME: offset
      writeFile(this.pwmFile, this.pwmValue.toString());
    });
    this.menu.addMenuItem(this.setTo50);
    // Auto fan control checkbox
    this.setAutoPwm = new PopupMenu.PopupSwitchIconMenuItem('Enable automatic fan control', false, 'changes-prevent', St.IconType.SYMBOLIC);
    this.setAutoPwm.connect('toggled', () => {
      writeFile(this.pwmEnableFile, this.setAutoPwm.state ? PWM_AUTO : PWM_MANUAL);
      this.setTo50.setSensitive(!this.setAutoPwm.state);
      this.slider.setSensitive(!this.setAutoPwm.state);
    });
    this.menu.addMenuItem(this.setAutoPwm);
    // Initial PWM
    this.setPwmData();
  }

  // eslint-disable-next-line camelcase
  on_applet_clicked() {
    this.menu.toggle();
  }

  setNameTooltip() {
    this.set_applet_tooltip(`hwmon name: ${readPath(`${hwmonPathFor(this.hwmonId)}/name`).trim()}`);
  }

  setPwmData() {
    // Get pwm file
    this.pwmFile = Gio.File.new_for_path(`${hwmonPathFor(this.hwmonId)}/pwm1`);
    this.pwmEnableFile = Gio.File.new_for_path(`${hwmonPathFor(this.hwmonId)}/pwm1_enable`);
    this.pwmRange = {
      start: parsePwmValue(readPath(`${hwmonPathFor(this.hwmonId)}/pwm1_min`)),
      end: parsePwmValue(readPath(`${hwmonPathFor(this.hwmonId)}/pwm1_max`))
    };
    this.pwmValue = parsePwmValue(readFile(this.pwmFile));
    // Monitor pwm changes
    this.monitor = this.pwmFile.monitor(0, null);
    this.monitor.connect('changed', (self, file, otherFile, eventType) => {
      this.pwmValue = parsePwmValue(readFile(this.pwmFile));
      this.update();
    });
    this.monitorEnable = this.pwmEnableFile.monitor(0, null);
    this.monitorEnable.connect('changed', () => {
      this.pwmValue = parsePwmValue(readFile(this.pwmFile));
      this.update();
    });
    // Update view
    this.update();
  }

  update() {
    this.setNameTooltip();
    const percent = Math.round(convertRange(this.pwmValue, this.pwmRange, {start: 0, end: 100}));
    const normalized = convertRange(this.pwmValue, this.pwmRange, {start: 0, end: 1});
    this.slider.setValue(isNaN(normalized) ? 0 : normalized);
    this.sliderLabel.setLabel(`Fan Speed: ${percent}%`);
    this.set_applet_label(`GPU Fans: ${percent}%`);
    const enableValue = readFile(this.pwmEnableFile);
    const isAuto = !!enableValue && enableValue.trim() === PWM_AUTO;
    this.setAutoPwm.setToggleState(isAuto);
    this.setTo50.setSensitive(!isAuto);
    this.slider.setSensitive(!isAuto);
  }
}

function main(metadata, orientation, panelHeight, instanceId) {
  return new FanControlApplet(metadata, orientation, panelHeight, instanceId);
}
