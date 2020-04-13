const fs = require('fs'),
      path = require('path'),
      File = require('./file'),
      minimatch = require('minimatch'),
      isBinaryFileSync = require('isbinaryfile').isBinaryFileSync;

/**
 * Default options
 */
const DEFAULTS = Object.freeze({
  dot: false,
  excludes: [],
  binaryExt: ['.png', '.jpg'],
  extensionless: { // TODO: allow adding extension with default boundaries
    '.js': [['"', "'"], ['"', "'"]]
  }
});

/**
 * Walk through working directory, get list of files
 * and wrap them in [Vinyl](https://github.com/gulpjs/vinyl) virtual files
 * TODO: make it async
 */
class Walker {
  constructor(cwd, options={}) {
    options = Object.assign({}, DEFAULTS, options);

    this.cwd = cwd;
    this.excludes = options.excludes;
    this.dot = options.dot;
    this.binaryExt = options.binaryExt;
    this.extensionless = options.extensionless;

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

    return this.excludes.some(pattern => {
      return minimatch(relative, pattern);
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
