import { Transform } from 'stream';
import path from 'path';

/**
 * Parser Transform stream
 * Detects references between files and builds dependency graph
 *
 * The Parser:
 * 1. Receives Vinyl files from Walker
 * 2. For each file, detects references to other files
 * 3. Builds dependency edges (file -> [dependencies])
 * 4. Buffers all files (needed for graph construction)
 * 5. Passes files + dependency graph to Sorter
 */
export class Parser extends Transform {
  /**
   * @param {Config} config - Configuration object
   */
  constructor(config) {
    super({ objectMode: true });

    this.config = config;
    this.files = [];
    this.filesByPath = new Map(); // Fast lookup by path
    this.resolveCache = new Map(); // Cache for resolved references
  }

  /**
   * Transform implementation - buffer files and parse
   * @private
   */
  _transform(file, encoding, callback) {
    try {
      // Store file for dependency resolution
      this.files.push(file);
      this.filesByPath.set(file.relative, file);

      // Initialize dependency tracking
      file.deps = [];

      // Get file-specific options
      file.fileOptions = this.config.getOptionsForFile(file);

      // Parse references if file should be searched
      if (this._shouldParse(file)) {
        this._parseReferences(file);
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Flush implementation - resolve dependencies and emit files
   * @private
   */
  _flush(callback) {
    try {
      // Now that we have all files, resolve dependency references
      this._resolveDependencies();

      // Emit all files with dependency information
      for (const file of this.files) {
        this.push(file);
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Determine if file should be parsed for references
   * @private
   */
  _shouldParse(file) {
    // Skip binary files
    if (file.isBinary) {
      return false;
    }

    // Skip if file options say don't rewrite
    if (!file.fileOptions.rewrite) {
      return false;
    }

    // Skip if no patterns defined for this extension
    const patterns = this.config.getPatternsForFile(file);
    if (!patterns || patterns.length === 0) {
      return false;
    }

    return true;
  }

  /**
   * Parse references in a file
   * Stores potential references (will be resolved later)
   * @private
   */
  _parseReferences(file) {
    // Convert buffer to text for searching
    file.textContent = file.contents.toString();

    // Get detection patterns for this file type
    const patterns = this.config.getPatternsForFile(file);

    // Store found references (unresolved paths)
    file.foundReferences = new Set();

    for (const pattern of patterns) {
      this._parseWithRegex(file, pattern);
    }
  }

  /**
   * Parse references using regex pattern
   * @private
   */
  _parseWithRegex(file, pattern) {
    if (!pattern.regex) return;

    // Reset regex state
    pattern.regex.lastIndex = 0;

    let match;
    while ((match = pattern.regex.exec(file.textContent)) !== null) {
      // The captured group (index 1) should be the path
      const refPath = match[1];

      if (refPath && this._isLocalReference(refPath)) {
        file.foundReferences.add(refPath);

        // For extensionless patterns, also add version with extension
        if (pattern.type === 'extensionless') {
          file.foundReferences.add(refPath + file.extname);
        }
      }
    }
  }

  /**
   * Check if reference is to a local file (not external URL)
   * @private
   */
  _isLocalReference(refPath) {
    // Skip URLs and protocol-relative URLs
    if (/^(https?:)?\/\//.test(refPath)) {
      return false;
    }

    // Skip data URIs and other protocols
    if (/^\w+:/.test(refPath)) {
      return false;
    }

    return true;
  }

  /**
   * Resolve found references to actual files
   * @private
   */
  _resolveDependencies() {
    for (const file of this.files) {
      if (!file.foundReferences || file.foundReferences.size === 0) {
        continue;
      }

      // Use Set to track already added dependencies (avoid duplicates)
      const addedDeps = new Set();

      // Resolve each reference to an actual file
      for (const refPath of file.foundReferences) {
        const resolvedFile = this._resolveReference(file, refPath);

        if (resolvedFile && !addedDeps.has(resolvedFile.relative)) {
          file.deps.push(resolvedFile);
          addedDeps.add(resolvedFile.relative);
        }
      }
    }
  }

  /**
   * Resolve a reference path to an actual file
   * @private
   */
  _resolveReference(fromFile, refPath) {
    // Check cache first
    const cacheKey = `${fromFile.relative}:${refPath}`;
    if (this.resolveCache.has(cacheKey)) {
      return this.resolveCache.get(cacheKey);
    }

    // Handle prefix if configured
    let refNormalized = refPath;
    const prefix = this.config.url.prefix;
    if (prefix && refPath.startsWith(prefix)) {
      refNormalized = refPath.slice(prefix.length);
      if (refNormalized.startsWith('/')) {
        refNormalized = refNormalized.slice(1);
      }
    }

    // Resolve relative to source file
    const fromDir = path.dirname(fromFile.relative);
    const resolved = path.normalize(path.join(fromDir, refNormalized));

    // Try to find the file
    let targetFile = this.filesByPath.get(resolved)
      || this._tryResolveVariations(resolved);

    // For base-relative paths (e.g. "images/logo.png"), also try as-is
    if (!targetFile && !refNormalized.startsWith('.')) {
      targetFile = this.filesByPath.get(refNormalized)
        || this._tryResolveVariations(refNormalized);
    }

    // Cache result (even if null)
    this.resolveCache.set(cacheKey, targetFile);

    return targetFile;
  }

  /**
   * Try common path variations to find the file
   * @private
   */
  _tryResolveVariations(refPath) {
    const variations = [
      refPath + '.js',
      refPath + '.jsx',
      refPath + '.ts',
      refPath + '.tsx',
      refPath + '.css',
      refPath + '.scss',
      refPath + '.sass',
      refPath + '.less',
      refPath + '/index.js',
      refPath + '/index.jsx',
      refPath + '/index.ts',
      refPath + '/index.tsx',
    ];

    for (const variation of variations) {
      const file = this.filesByPath.get(variation);
      if (file) {
        return file;
      }
    }

    return null;
  }
}

/**
 * Factory function to create a parser stream
 *
 * @param {Config} config - Configuration object
 * @returns {Transform} Parser transform stream
 */
export function createParser(config) {
  return new Parser(config);
}

export default Parser;
