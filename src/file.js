const path = require('path'),
      micromatch = require('micromatch'),
      Vinyl = require('vinyl');

const reRegExpChar = /[\\^$.*+?()[\]{}|]/g; // Taken from lodash. (c) lodash team and contributors, MIT license
function escapeRegExp(string) {
  return string.replace(reRegExpChar, '\\$&');
}

const PATH_PRE = ['"', "'", '^', ',', '=', '\\(', '\\s'];

const PROPS = {
  extOptions: true,
  revOptions: true,
  overrides: true,
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

    let revOptions = { ...options.revOptions };

   /**
    * Build per-file options
    * Available options:
    * - prefix
    * - baseUrl
    * - transformPath
    * - dontRename
    * - dontRewrite,
    * - format
    * - hashType
    * - hashLength
    */
    Object.keys(options.overrides || {}).forEach(pattern => {
      if (micromatch.isMatch(this.relative, pattern)) options = Object.assign(revOptions, options.overrides[pattern]);
    });

    this.revOptions = revOptions;

    this.buildRegexps(boundaries);
  }

  get urlPath() {
    if (this.revOptions.prefix) {
      return path.join(this.revOptions.prefix, this.relative);
    } else {
      return this.relative;
    }
  }

  addDep(depPath) {
    this.deps.push(depPath);
  }

  buildRegexps(boundaries) {
    let searchPath = this.urlPath;

    this.searchRegExpMain = new RegExp(`[${PATH_PRE.join('')}]\/?${escapeRegExp(searchPath)}`);
    this.replaceRegExpMain = new RegExp(`(${PATH_PRE.join('|')})(\/)?(${escapeRegExp(searchPath)})`, 'g');

    if (this.isExtensionless) {
      let boundsLeft  = boundaries[0].map(s => escapeRegExp(s)),
          boundsRight = boundaries[1].map(s => escapeRegExp(s));

      searchPath = escapeRegExp(searchPath.slice(0, -(this.extname.length)));

      this.searchRegExpBound  = new RegExp(`[${boundsLeft.join('')}]\/?${searchPath}[${boundsRight.join('')}]`);
      this.replaceRegExpBound = new RegExp(`(${boundsLeft.join('|')})(\/)?(${searchPath})(${boundsRight.join('|')})`, 'g');
    }
  }

  static isCustomProp(name) {
    return super.isCustomProp(name) && !PROPS[name];
  }
}

module.exports = File;
