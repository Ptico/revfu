const fs = require('fs'),
      path = require('path'),
      File = require('./file'),
      micromatch = require('micromatch'),
      isBinaryFileSync = require('isbinaryfile').isBinaryFileSync;

/**
 * Default options
 */
const DEFAULTS = Object.freeze({
  dot: false,
  exclude: [],
  binaryExt: ['.png', '.jpg'],
  extensionless: { // TODO: allow adding extension with default boundaries
    '.js': [['"', "'"], ['"', "'"]]
  },
  dontRename: [],
  dontRewrite: [],
  revision: {},
  overrides: {}
});

const REVISION_DEFAULTS = {
  format: '{name}-{hash}.{ext}',
  hashType: 'sha256',
  hashLength: 8,
};

/**
 * Walk through working directory, get list of files
 * and wrap them in [Vinyl](https://github.com/gulpjs/vinyl) virtual files
 * TODO: make it async
 */
class Walker {
  constructor(cwd, options={}) {
    options = { ...DEFAULTS, ...options };

    // Search options
    this.cwd = cwd;
    this.exclude = options.exclude;
    this.dot = options.dot;

    // File options
    this.binaryExt = options.binaryExt;
    this.extensionless = options.extensionless;

    // Revision options
    this.revOptions = { ...REVISION_DEFAULTS, ...options.revision };
    this.overrides = options.overrides;

    options.dontRewrite.forEach(pattern => {
      if (!this.overrides[pattern]) this.overrides[pattern] = {};
      this.overrides[pattern].dontRewrite = true;
    });

    options.dontRename.forEach(pattern => {
      if (!this.overrides[pattern]) this.overrides[pattern] = {};
      this.overrides[pattern].dontRename = true;
    });

    this.files = [];
  }

  run() {
    this.readDir(this.cwd);
    return this.files;
  }

  readDir(dir) {
    fs.readdirSync(dir).forEach(f => {
      f = path.join(dir, f);

      if (!this.skip(f)) {
        let stat = fs.statSync(f);

        if (stat.isDirectory()) {
          this.readDir(f);
        } else {
          let file = new File({
            base: this.cwd,
            path: f,
            stat: stat,
            contents: fs.readFileSync(f),
            revOptions: this.revOptions,
            overrides: this.overrides,
            extOptions: this.extensionless
          });

          this.setIsBinary(file);

          this.files.push(file);
        }
      }
    });
  }

  skip(file) {
    let basename = path.basename(file);
    if (!this.dot && basename.startsWith('.')) return true;

    let relative = path.relative(this.cwd, file);

    return this.exclude.some(pattern => {
      return micromatch.isMatch(relative, pattern);
    });
  }

  /**
   * Mark file as binary to avoid unnecessary search for references
   * To avoid isbinaryfile calls for every file we look for it's extension first
   * also isbinaryfile package have false negative sometimes
   */
  setIsBinary(file) {
    if (this.binaryExt.includes(file.extname)) {
      file.isBinary = true;
    } else if (isBinaryFileSync(file.contents)) {
      file.isBinary = true;
    } else {
      file.isBinary = false;
    }
  }
}

module.exports = Walker;
