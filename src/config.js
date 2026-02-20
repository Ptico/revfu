import micromatch from 'micromatch';

/**
 * Smart defaults for reference detection patterns
 */
const REFERENCE_PATTERNS = {
  'import': /import\s+.*?from\s+['"]([^'"]+)['"]/g,
  'require': /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  'dynamic-import': /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  'url': /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/g,
  'src': /src\s*=\s*['"]([^'"]+)['"]/g,
  'href': /href\s*=\s*['"]([^'"]+)['"]/g,
  'srcset': /srcset\s*=\s*['"]([^'"]+)['"]/g,
  'data-src': /data-src\s*=\s*['"]([^'"]+)['"]/g,
  'xlink:href': /xlink:href\s*=\s*['"]([^'"]+)['"]/g,
};

/**
 * Default reference detection by file extension
 */
const DEFAULT_DETECT = {
  // JavaScript/TypeScript
  '.js': ['import', 'require', 'dynamic-import', 'extensionless'],
  '.mjs': ['import', 'dynamic-import'],
  '.cjs': ['require'],
  '.ts': ['import', 'require', 'extensionless'],
  '.jsx': ['import', 'require', 'extensionless'],
  '.tsx': ['import', 'require', 'extensionless'],

  // Stylesheets
  '.css': ['url', 'import'],
  '.scss': ['url', 'import'],
  '.sass': ['url', 'import'],
  '.less': ['url', 'import'],

  // HTML/Templates
  '.html': ['src', 'href', 'srcset', 'data-src'],
  '.htm': ['src', 'href', 'srcset'],
  '.svg': ['href', 'xlink:href'],
};

/**
 * Default extensionless boundaries (for require without .js extension)
 */
const DEFAULT_EXTENSIONLESS = {
  '.js': { before: ['"', "'"], after: ['"', "'"] },
  '.ts': { before: ['"', "'"], after: ['"', "'"] },
  '.jsx': { before: ['"', "'"], after: ['"', "'"] },
  '.tsx': { before: ['"', "'"], after: ['"', "'"] },
};

/**
 * Configuration class - normalizes, validates, and optimizes user config
 *
 * @typedef {Object} WalkerOptions
 * @property {string[]} [include=['**\/*']] - Glob patterns to include
 * @property {string[]} [exclude=[]] - Glob patterns to exclude
 * @property {boolean} [dot=false] - Include dotfiles
 * @property {boolean} [followSymlinks=false] - Follow symbolic links
 * @property {number} [concurrency=10] - Max concurrent file reads
 * @property {boolean} [ignoreErrors=false] - Continue on permission errors
 *
 * @typedef {Object} HashOptions
 * @property {string} [algorithm='sha256'] - Hash algorithm (any Node crypto algorithm)
 * @property {number} [length=8] - Hash truncation length
 * @property {string} [format='{name}-{hash}.{ext}'] - Filename template
 *
 * @typedef {Object} UrlOptions
 * @property {string} [prefix] - Path prefix for references (e.g., '/assets')
 * @property {string} [base] - Base URL for absolute URLs (e.g., 'https://cdn.com')
 * @property {Function} [transform] - Custom transform function
 *
 * @typedef {Object} Rule
 * @property {string|string[]} match - Glob pattern(s) to match files
 * @property {HashOptions} [hash] - Override hash options
 * @property {UrlOptions} [url] - Override URL options
 * @property {boolean} [rename] - Whether to rename this file
 * @property {boolean} [rewrite] - Whether to rewrite references in this file
 *
 * @typedef {Object} ReferenceOptions
 * @property {Object<string, string[]>} [detect] - Detection patterns by extension
 * @property {Array} [custom] - Custom regex patterns
 * @property {Object} [extensionless] - Boundaries for extensionless detection
 *
 * @typedef {Object} ManifestOptions
 * @property {string} [path='assets.json'] - Manifest file path
 * @property {string|Function} [format='simple'] - Format: 'simple' | 'full' | 'rails4' | function
 * @property {boolean} [stream=true] - Include manifest in output stream
 * @property {boolean} [absolutePaths=false] - Use absolute paths in manifest
 *
 * @typedef {Object} RevfuOptions
 * @property {WalkerOptions} [walker] - File discovery options
 * @property {HashOptions} [hash] - Hashing options
 * @property {UrlOptions} [url] - URL transformation options
 * @property {Rule[]} [rules] - File-specific rules
 * @property {ReferenceOptions} [references] - Reference detection options
 * @property {ManifestOptions} [manifest] - Manifest options
 */
export class Config {
  /**
   * @param {string} cwd - Working directory
   * @param {RevfuOptions} [options={}] - User configuration
   */
  constructor(cwd, options = {}) {
    this.cwd = cwd;

    // Normalize all options
    this.walker = this._normalizeWalker(options.walker);
    this.hash = this._normalizeHash(options.hash);
    this.url = this._normalizeUrl(options.url);
    this.rules = this._normalizeRules(options.rules);
    this.references = this._normalizeReferences(options.references);
    this.manifest = this._normalizeManifest(options.manifest);

    // Pre-compile matchers and patterns for performance
    this._compileRules();

    // Use lazy compilation for reference patterns (only compile when needed)
    this._patternCache = new Map();
  }

  /**
   * Normalize walker options with defaults
   * @private
   */
  _normalizeWalker(walker = {}) {
    return {
      include: walker.include || ['**/*'],
      exclude: walker.exclude || [],
      dot: walker.dot ?? false,
      followSymlinks: walker.followSymlinks ?? false,
      concurrency: walker.concurrency ?? 10,
      ignoreErrors: walker.ignoreErrors ?? false,
    };
  }

  /**
   * Normalize hash options with defaults
   * @private
   */
  _normalizeHash(hash = {}) {
    return {
      algorithm: hash.algorithm || 'sha256',
      length: hash.length ?? 8,
      format: hash.format || '{name}-{hash}.{ext}',
    };
  }

  /**
   * Normalize URL options with defaults
   * @private
   */
  _normalizeUrl(url = {}) {
    return {
      prefix: url.prefix || null,
      base: url.base || null,
      transform: url.transform || null,
    };
  }

  /**
   * Normalize rules array
   * @private
   */
  _normalizeRules(rules = []) {
    if (!Array.isArray(rules)) {
      throw new TypeError('rules must be an array');
    }

    return rules.map(rule => {
      if (!rule.match) {
        throw new Error('Each rule must have a "match" pattern');
      }

      return {
        match: Array.isArray(rule.match) ? rule.match : [rule.match],
        hash: rule.hash ? this._normalizeHash(rule.hash) : null,
        url: rule.url ? this._normalizeUrl(rule.url) : null,
        rename: rule.rename ?? null,
        rewrite: rule.rewrite ?? null,
      };
    });
  }

  /**
   * Normalize reference detection options with smart defaults
   * @private
   */
  _normalizeReferences(references = {}) {
    const detect = { ...DEFAULT_DETECT, ...(references.detect || {}) };
    const extensionless = { ...DEFAULT_EXTENSIONLESS, ...(references.extensionless || {}) };
    const custom = references.custom || [];

    return { detect, extensionless, custom };
  }

  /**
   * Normalize manifest options
   * @private
   */
  _normalizeManifest(manifest = {}) {
    return {
      path: manifest.path || 'assets.json',
      format: manifest.format || 'simple',
      stream: manifest.stream ?? true,
      absolutePaths: manifest.absolutePaths ?? false,
    };
  }

  /**
   * Pre-compile micromatch matchers for all rules
   * @private
   */
  _compileRules() {
    this.rulesCompiled = this.rules.map(rule => ({
      ...rule,
      matchers: rule.match.map(pattern => micromatch.matcher(pattern)),
    }));
  }

  /**
   * Compile reference patterns for a specific extension (lazy)
   * @private
   */
  _compileForExtension(ext) {
    const detectors = this.references.detect[ext] || [];

    // Escape regex chars for extensionless pattern
    const reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
    const escapeRegExp = (str) => str.replace(reRegExpChar, '\\$&');

    const patterns = detectors.map(name => {
      if (name === 'extensionless') {
        const boundaries = this.references.extensionless[ext];
        if (!boundaries) return null;

        // Pre-compile extensionless regex
        const beforeChars = boundaries.before.map(escapeRegExp).join('');
        const afterChars = boundaries.after.map(escapeRegExp).join('');

        return {
          type: 'extensionless',
          regex: new RegExp(`[${beforeChars}](\\.?\\/[^${afterChars}]*?)[${afterChars}]`, 'g'),
          boundaries,
        };
      }
      return {
        type: name,
        regex: REFERENCE_PATTERNS[name],
      };
    }).filter(p => p && (p.regex || p.boundaries)); // Only include valid patterns

    // Add custom patterns for this extension
    for (const custom of this.references.custom) {
      if (!custom.pattern || !custom.extensions) {
        throw new Error('Custom reference patterns must have "pattern" and "extensions" properties');
      }

      if (custom.extensions.includes(ext)) {
        patterns.push({
          type: 'custom',
          regex: custom.pattern,
        });
      }
    }

    return patterns;
  }

  /**
   * Get effective options for a specific file
   * Applies rules in order and returns merged options
   *
   * @param {Object} file - Vinyl file object
   * @returns {Object} Merged options for this file
   */
  getOptionsForFile(file) {
    const options = {
      hash: { ...this.hash },
      url: { ...this.url },
      rename: true,
      rewrite: true,
    };

    // Apply matching rules in order
    for (const rule of this.rulesCompiled) {
      const matches = rule.matchers.some(matcher => matcher(file.relative));

      if (matches) {
        if (rule.hash) {
          Object.assign(options.hash, rule.hash);
        }
        if (rule.url) {
          Object.assign(options.url, rule.url);
        }
        if (rule.rename !== null) {
          options.rename = rule.rename;
        }
        if (rule.rewrite !== null) {
          options.rewrite = rule.rewrite;
        }
      }
    }

    return options;
  }

  /**
   * Get reference detection patterns for a file (lazy compilation)
   *
   * @param {Object} file - Vinyl file object
   * @returns {Array} Array of pattern objects
   */
  getPatternsForFile(file) {
    const ext = file.extname;

    // Check cache first
    if (!this._patternCache.has(ext)) {
      // Compile patterns for this extension on first use
      this._patternCache.set(ext, this._compileForExtension(ext));
    }

    return this._patternCache.get(ext);
  }

  /**
   * Get glob options for the walker
   *
   * @returns {Object} Options for glob library
   */
  getGlobOptions() {
    return {
      cwd: this.cwd,
      dot: this.walker.dot,
      followSymbolicLinks: this.walker.followSymlinks,
      ignore: this.walker.exclude,
      withFileTypes: false, // We'll handle our own file objects
      nodir: true, // Skip directories
    };
  }
}

export default Config;
