const path = require('path'),
      ReadableStream = require('stream').Readable,
      crypto = require('crypto'),
      minimatch = require('minimatch'),
      Manifest = require('./manifest');

const nameReg = /(\{name\})/g,
      hashReg = /(\{hash\})/g,
      extReg  = /(\{ext\})/g,
      urlReg  = /^https?::/;
/**
 * Default options
 */
const DEFAULTS = Object.freeze({
  format: '{name}-{hash}.{ext}',
  hashType: 'sha256',
  hashLength: 8,
  customRules: {},
  manifest: {}
});

class Revisioner {
  constructor(files, options) {
    options = { ...DEFAULTS, ...options };

    this.files = files;
    this.stream = new ReadableStream({ objectMode: true});

    this.manifest = new Manifest(options.manifest);
    this.skipManifest = options.manifest.dontStream;

    this.customRules = options.customRules;
  }

  run() {
    this.renameAll();

    if (!this.skipManifest) this.stream.push(this.manifest.compile());

    this.stream.push(null);

    return this.stream;
  }

  renameAll() {
    this.files.forEach(file => {
      // Rewrite references before calculating the checksum
      if (file.deps.length > 0) {
        file.deps.forEach(dep => {
          this.rewriteReferences(file, dep);
        });
      }

      if (file.textContent) file.contents = Buffer.from(file.textContent);

      this.updatePaths(file);

      this.manifest.add(file);
      this.stream.push(file);
    });
  }

  // Rewrite references inside the file contents
  rewriteReferences(file, dep) {
    if (file.revOptions.dontRewrite) return;

    // Find and replace references with extensions
    file.textContent = file.textContent.replace(dep.replaceRegExpMain, (match, pre, slash) => {
      let url = dep.url;

      if (url.startsWith('/') || urlReg.test(url) || !slash) slash = '';

      return `${pre}${slash}${url}`;
    });

    // Find and replace references without extensions
    if (dep.isExtensionless) {
      file.textContent = file.textContent.replace(dep.replaceRegExpBound, (match, b1, slash, waste, b2) => {
        if (!slash) slash = '';
        return `${b1}${slash}${dep.url.slice(0, -(dep.extname.length))}${b2}`;
      });
    }
  }

  // Calculate hash, rename file and apply path transformations
  updatePaths(file) {
    let options = file.revOptions;

    if (options.dontRename) return;

    // Create hash anyway, so it can be available in manifest
    let hash = crypto.createHash(options.hashType);
    hash.update(file.contents);
    file.hash = hash.digest('hex');

    // Build name from pattern
    let filename = options.format
      .replace(nameReg, file.stem)
      .replace(hashReg, file.hash.slice(0, options.hashLength || 8))
      .replace(extReg,  file.extname.slice(1, file.extname.length));

    // Save original values for manifest
    file.originalName = file.basename;
    file.originalPath = file.relative;
    file.revOrigPath = file.path; // Compatibility with https://github.com/nib-health-funds/gulp-rev-delete-original

    file.basename = filename;

    // Apply path transformations
    let newPath = file.urlPath;

    if (typeof(options.transformPath) === 'function') newPath = options.transformPath(file, options); // TODO: Decide if we should apply prefix when transform given
    if (options.baseUrl) {
      let url = new URL(options.baseUrl);
      url.pathname = newPath;
      newPath = url.toString();
    }

    file.url = newPath;
  }
}

module.exports = Revisioner;
