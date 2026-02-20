import Vinyl from 'vinyl';

/**
 * Manifest formatters
 */

/**
 * Simple format: { "original.js": "hashed.js" }
 * @param {Array} entries - Manifest entries
 * @returns {Object} Simple key-value mapping
 */
function simpleMapper(entries) {
  return entries.reduce((result, entry) => {
    result[entry.original.path] = entry.reved.path;
    return result;
  }, {});
}

/**
 * Full format: Complete entry objects with all metadata
 * @param {Array} entries - Manifest entries
 * @returns {Array} Full entry objects
 */
function fullMapper(entries) {
  return entries.map(entry => ({
    original: entry.original,
    reved: entry.reved,
    digest: entry.digest,
    size: entry.size,
    mtime: entry.mtime
  }));
}

/**
 * Rails 4 Sprockets format
 * @param {Array} entries - Manifest entries
 * @returns {Object} Rails 4 manifest format
 */
function rails4Mapper(entries) {
  const files = {};
  const assets = {};

  entries.forEach((entry) => {
    // Files section: hashed path -> metadata
    files[entry.reved.path] = {
      logical_path: entry.original.path,
      mtime: entry.mtime,
      size: entry.size,
      digest: entry.digest
    };

    // Assets section: logical path -> hashed path
    assets[entry.original.path] = entry.reved.path;
  });

  return {
    files: files,
    assets: assets
  };
}

/**
 * Available manifest formatters
 */
export const MAPPERS = {
  'simple': simpleMapper,
  'full': fullMapper,
  'rails4': rails4Mapper
};

/**
 * Manifest - Generates manifest file with asset mappings
 *
 * Tracks original -> hashed file mappings for use in production
 * Supports multiple output formats (simple, full, rails4, custom)
 */
export class Manifest {
  /**
   * @param {Object} options - Manifest configuration
   * @param {string} [options.path='assets.json'] - Output path for manifest
   * @param {string|Function} [options.format='simple'] - Format: 'simple' | 'full' | 'rails4' | function
   * @param {Object} [options.dumper=JSON] - Object with stringify method
   * @param {boolean} [options.absolutePaths=false] - Use absolute paths in manifest
   */
  constructor(options = {}) {
    this.entries = [];
    this.path = options.path || 'assets.json';
    this.absolutePaths = options.absolutePaths ?? false;

    // Determine mapper function
    if (typeof options.format === 'function') {
      this.mapper = options.format;
    } else {
      const formatName = options.format || 'simple';
      this.mapper = MAPPERS[formatName];

      if (!this.mapper) {
        throw new Error(`Unknown manifest format: ${formatName}. Available: ${Object.keys(MAPPERS).join(', ')}`);
      }
    }

    // Dumper for serialization (default: JSON)
    this.dumper = options.dumper || JSON;

    if (!this.dumper.stringify) {
      throw new Error('Manifest dumper must have a stringify method');
    }
  }

  /**
   * Add a file to the manifest
   * @param {Object} file - Vinyl file object
   */
  add(file) {
    // Build paths based on absolutePaths setting
    const originalPath = this.absolutePaths
      ? file.revOrigPath || file.path
      : file.originalPath || file.relative;

    const revedPath = this.absolutePaths
      ? file.path
      : file.relative;

    this.entries.push({
      original: {
        name: file.originalName || file.basename,
        path: originalPath
      },
      reved: {
        name: file.basename,
        path: revedPath,
        url: file.url || revedPath
      },
      digest: file.hash,
      size: file.contents ? file.contents.byteLength : 0,
      mtime: file.stat && file.stat.mtime ? file.stat.mtime.toISOString() : new Date().toISOString()
    });
  }

  /**
   * Compile manifest to Vinyl file
   * @returns {Vinyl} Vinyl file containing manifest JSON
   */
  compile() {
    const object = this.mapper(this.entries);
    const contents = this.dumper.stringify(object, null, 2); // Pretty print with 2 spaces

    return new Vinyl({
      path: this.path,
      contents: Buffer.from(contents)
    });
  }

  /**
   * Get manifest as plain object (without Vinyl wrapper)
   * @returns {Object} Manifest data
   */
  toObject() {
    return this.mapper(this.entries);
  }

  /**
   * Get manifest as JSON string
   * @returns {string} JSON string
   */
  toJSON() {
    return this.dumper.stringify(this.mapper(this.entries), null, 2);
  }

  /**
   * Get number of entries
   * @returns {number} Entry count
   */
  get length() {
    return this.entries.length;
  }
}

/**
 * Factory function to create a manifest
 * @param {Object} options - Manifest options
 * @returns {Manifest} Manifest instance
 */
export function createManifest(options) {
  return new Manifest(options);
}

export default Manifest;
