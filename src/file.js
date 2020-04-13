const Vinyl = require('vinyl');

const reRegExpChar = /[\\^$.*+?()[\]{}|]/g; // Taken from lodash. (c) lodash team and contributors, MIT license
function escapeRegExp(string) {
  return string.replace(reRegExpChar, '\\$&');
}

const PATH_PRE = ['"', "'", '^', ',', '=', '\\(', '\\s'];

const PROPS = {
  extOptions: true,
  isExtensionless: true,
  deps: true,
  searchRegExp: true,
  replaceRegExp: true
}

class File extends Vinyl {
  constructor(options) {
    super(options);

    let boundaries = options.extOptions[this.extname];

    this.deps = [];
    this.isExtensionless = Array.isArray(boundaries);

    this.buildRegexps(boundaries);
  }

  addDep(depPath) {
    this.deps.push(depPath);
  }

  buildRegexps(boundaries) {
    this.searchRegExpMain = new RegExp(`[${PATH_PRE.join('')}]\/?${escapeRegExp(this.relative)}`);
    this.replaceRegExpMain = new RegExp(`(${PATH_PRE.join('|')})(\/)?(${escapeRegExp(this.relative)})`, 'g');

    if (this.isExtensionless) {
      let boundsLeft  = boundaries[0].map(s => escapeRegExp(s)),
          boundsRight = boundaries[1].map(s => escapeRegExp(s)),
          searchPath  = escapeRegExp(this.relative.slice(0, -(this.extname.length)));

      this.searchRegExpBound  = new RegExp(`[${boundsLeft.join('')}]\/?${searchPath}[${boundsRight.join('')}]`);
      this.replaceRegExpBound = new RegExp(`(${boundsLeft.join('|')})(\/)?(${searchPath})(${boundsRight.join('|')})`, 'g');
    }
  }

  static isCustomProp(name) {
    return super.isCustomProp(name) && !PROPS[name];
  }
}

module.exports = File;
