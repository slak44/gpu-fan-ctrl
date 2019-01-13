const Applet = imports.ui.applet;
const Util = imports.misc.util;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Gio = imports.gi.Gio;

const console = {
  log(...args) {
    global.log(args.join(', '));
  },
  error(...args) {
    global.logError(args.join(', '));
  }
};

function readPath(path) {
  return readFile(Gio.File.new_for_path(path)).toString();
}

function readFile(file) {
  try {
    const [ok, data] = file.load_contents(null);
    return data;
  } catch (err) {
    console.error(err.message);
    return null;
  }
}

function writeFile(file, text) {
  try {
    file.replace_contents(text, null, false, 0, null);
  } catch (err) {
    console.error(err.message);
  }
}

function convertRange(number, oldRange, newRange) {
  // This is in [0, 1]
  const normalized = (number - oldRange.start) / (oldRange.end - oldRange.start);
  return newRange.start + normalized * (newRange.end - newRange.start);
}

const hwmonDirPath = '/sys/class/hwmon/hwmon2/';
const namePath = `${hwmonDirPath}/name`;
const pwmPath = `${hwmonDirPath}/pwm1`;

class FanControlApplet extends Applet.TextApplet {
  constructor(orientation, panelHeight, instanceId) {
    super(orientation, panelHeight, instanceId);
    this.set_applet_tooltip(`hwmon name: ${readPath(namePath).trim()}`);
    // Make the menu
    this.menuManager = new PopupMenu.PopupMenuManager(this);
    this.menu = new Applet.AppletPopupMenu(this, orientation);
    this.menuManager.addMenu(this.menu);
    this.slider = new PopupMenu.PopupSliderMenuItem(0);
    this.slider.connect('value-changed', (slider, value) => {
      this.pwmValue = Math.round(convertRange(value, {start: 0, end: 1}, {start: 0, end: 255}));
    });
    this.slider.connect('drag-end', () => {
      writeFile(this.pwmFile, this.pwmValue.toString());
    });
    this.menu.addMenuItem(this.slider);
    // Get pwm file and update views
    this.pwmFile = Gio.File.new_for_path(pwmPath);
    this.update();
    // Monitor pwm changes
    this.monitor = this.pwmFile.monitor(0, null);
    this.monitor.connect('changed', (self, file, otherFile, eventType) => this.update());
  }

  // eslint-disable-next-line camelcase
  on_applet_clicked() {
    this.menu.toggle();
  }

  update() {
    this.pwmValue = parseInt(readFile(this.pwmFile).toString().trim(), 10);
    this.slider.setValue(convertRange(this.pwmValue, {start: 0, end: 255}, {start: 0, end: 1}));
    const percent = Math.round(convertRange(this.pwmValue, {start: 0, end: 255}, {start: 0, end: 100}));
    this.set_applet_label(`GPU Fans: ${percent}%`);
  }
}

function main(metadata, orientation, panelHeight, instanceId) {
  return new FanControlApplet(orientation, panelHeight, instanceId);
}
