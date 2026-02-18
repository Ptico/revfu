import { Readable } from 'stream';
import crypto from 'crypto';
import path from 'path';

const nameReg = /(\{name\})/g;
const hashReg = /(\{hash\})/g;
const extReg = /(\{ext\})/g;
const urlReg = /^https?::/;

/**
 * Escape special regex characters
 * @private
 */
const reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
function escapeRegExp(string) {
  return string.replace(reRegExpChar, '\\$&');
}

/**
 * Revisioner - Rewrites references and calculates cascading hashes
 *
 * This is where the magic happens:
 * 1. Files are processed in topological order (dependencies first)
 * 2. For each file, rewrite references to already-hashed dependencies
 * 3. Calculate hash of updated content (includes hashed refs)
 * 4. Rename file and apply URL transformations
 *
 * Result: Cascading hashes where a file's hash includes its dependencies' hashes
 */
export class Revisioner {
  /**
   * @param {Array} sortedFiles - Files sorted in topological order
   * @param {Config} config - Configuration object
   */
  constructor(sortedFiles, config) {
    this.files = sortedFiles;
    this.config = config;
    this.processed = new Map(); // Track processed files by original path
  }

  /**
   * Create readable stream of revised files
   * @returns {Readable} Stream of Vinyl files with hashed names
   */
  stream() {
    return Readable.from(this._revise(), { objectMode: true });
  }

  /**
   * Async generator that yields revised files
   * @private
   */
  async *_revise() {
    for (const file of this.files) {
      // Rewrite references if file has dependencies
      if (file.deps && file.deps.length > 0 && file.fileOptions.rewrite) {
        this._rewriteReferences(file);
      }

      // Update contents if text was modified
      if (file.textContent) {
        file.contents = Buffer.from(file.textContent);
        // Clear textContent to free memory
        delete file.textContent;
      }

      // Calculate hash and rename
      this._updatePaths(file);

      // Store for reference by dependents (use originalPath as key since deps reference original paths)
      this.processed.set(file.originalPath, file);

      // Yield the processed file
      yield file;
    }
  }

  /**
   * Rewrite all references to dependencies in file content
   * @private
   */
  _rewriteReferences(file) {
    if (!file.textContent) {
      return;
    }

    for (const dep of file.deps) {
      // Get the processed version of dependency (already hashed)
      // Use originalPath if available (dep may have been mutated), fallback to relative
      const lookupKey = dep.originalPath || dep.relative;
      const processedDep = this.processed.get(lookupKey);

      if (!processedDep) {
        // Dependency not yet processed - should not happen with correct sort
        console.warn(`Warning: Dependency ${dep.relative} not yet processed when processing ${file.relative}`);
        continue;
      }

      // Build regex patterns for this dependency
      const patterns = this._buildReferencePatterns(file, dep, processedDep);

      // Replace references with hashed versions
      for (const pattern of patterns) {
        file.textContent = file.textContent.replace(pattern.regex, pattern.replacement);
      }
    }
  }

  /**
   * Build regex patterns to find and replace references to a dependency
   * @private
   */
  _buildReferencePatterns(file, dep, processedDep) {
    const patterns = [];

    // Use originalPath since dep may have been mutated (it's the same object that was processed earlier)
    const depOrigPath = dep.originalPath || dep.relative;

    // Create a temp object with original path for URL building
    const depOriginal = { ...dep, relative: depOrigPath };

    // Get the URL path for the dependency (with prefix if configured)
    const depOriginalPath = this._getUrlPath(depOriginal, dep.fileOptions);
    const depNewPath = this._getUrlPath(processedDep, processedDep.fileOptions);

    // Calculate relative path from file to dep (using original paths)
    const fileDir = path.dirname(file.relative);
    const relativePath = path.relative(fileDir, depOrigPath);
    const relativeNewPath = path.relative(fileDir, processedDep.relative);

    // Common reference patterns (use original paths to find references)
    const refVariations = [
      depOriginalPath,           // With prefix: /assets/file.js
      depOrigPath,               // Relative to base: file.js
      './' + depOrigPath,        // With ./: ./file.js
      relativePath,              // Relative to current file: ../dir/file.js
      './' + relativePath,       // With ./: ./../dir/file.js
    ];

    // Build patterns for each variation
    for (const refPath of refVariations) {
      const escaped = escapeRegExp(refPath);

      // Match with various quote styles and boundaries
      // Matches: "path", 'path', (path), url(path), etc.
      const regex = new RegExp(
        `(["'(\\s,=])(\\.?\\/?)${escaped}`,
        'g'
      );

      const replacement = (match, boundary, slashes) => {
        // Determine if we should use absolute, base-relative, or file-relative path
        let newPath;

        if (refPath.startsWith('/') || depOriginalPath.startsWith('/')) {
          // Was absolute (starts with /), keep absolute
          newPath = depNewPath;
        } else if (refPath.startsWith('../') || refPath.startsWith('./')) {
          // Was explicitly relative to file (starts with ../ or ./), keep file-relative
          newPath = relativeNewPath;
          if (refPath.startsWith('./')) {
            newPath = './' + newPath;
          }
        } else {
          // Was base-relative (no prefix), keep base-relative
          newPath = processedDep.relative;
        }

        // Preserve slashes if they were there
        const finalSlashes = newPath.startsWith('/') || newPath.startsWith('.') ? '' : slashes;

        return `${boundary}${finalSlashes}${newPath}`;
      };

      patterns.push({ regex, replacement });
    }

    // Handle extensionless references if applicable
    if (this._shouldHandleExtensionless(dep)) {
      patterns.push(...this._buildExtensionlessPatterns(
        file,
        dep,
        processedDep,
        relativePath,
        relativeNewPath
      ));
    }

    return patterns;
  }

  /**
   * Build patterns for extensionless references (e.g., require('./module'))
   * @private
   */
  _buildExtensionlessPatterns(file, dep, processedDep, relativePath, relativeNewPath) {
    const patterns = [];
    const boundaries = this.config.references.extensionless[dep.extname];

    if (!boundaries) {
      return patterns;
    }

    const { before, after } = boundaries;

    // Remove extension from paths
    const pathWithoutExt = relativePath.replace(new RegExp(`\\${dep.extname}$`), '');
    const newPathWithoutExt = relativeNewPath.replace(new RegExp(`\\${processedDep.extname}$`), '');

    // Build boundaries pattern
    const beforePattern = before.map(escapeRegExp).join('|');
    const afterPattern = after.map(escapeRegExp).join('|');
    const pathPattern = escapeRegExp(pathWithoutExt);

    const regex = new RegExp(
      `(${beforePattern})(\\.?\\/?)(${pathPattern})(${afterPattern})`,
      'g'
    );

    const replacement = (match, beforeBound, slashes, pathMatch, afterBound) => {
      return `${beforeBound}${slashes}${newPathWithoutExt}${afterBound}`;
    };

    patterns.push({ regex, replacement });

    return patterns;
  }

  /**
   * Get URL path for a file with prefix
   * @private
   */
  _getUrlPath(file, options) {
    if (options.url.prefix) {
      return path.posix.join(options.url.prefix, file.relative);
    }
    return file.relative;
  }

  /**
   * Check if file should have extensionless patterns handled
   * @private
   */
  _shouldHandleExtensionless(file) {
    const patterns = this.config.getPatternsForFile(file);
    return patterns.some(p => p.type === 'extensionless');
  }

  /**
   * Calculate hash and update file paths
   * @private
   */
  _updatePaths(file) {
    const options = file.fileOptions;

    // Always calculate hash (even if not renaming, useful for manifest)
    const hash = crypto.createHash(options.hash.algorithm);
    hash.update(file.contents);
    file.hash = hash.digest('hex');

    // Store original values for manifest
    file.originalPath = file.relative;
    file.originalName = file.basename;

    // Check if file should be renamed
    if (!options.rename) {
      // Keep original name but still set URL
      file.url = this._buildUrl(file, options);
      return;
    }

    // Build new filename from template
    const filename = options.hash.format
      .replace(nameReg, file.stem)
      .replace(hashReg, file.hash.slice(0, options.hash.length))
      .replace(extReg, file.extname.slice(1));

    file.basename = filename;

    // Build URL
    file.url = this._buildUrl(file, options);

    // Compatibility with gulp-rev-delete-original
    file.revOrigPath = path.join(file.base, file.originalPath);
  }

  /**
   * Build URL for file with transformations
   * @private
   */
  _buildUrl(file, options) {
    let url = this._getUrlPath(file, options);

    // Apply custom transform if provided
    if (typeof options.url.transform === 'function') {
      url = options.url.transform(file, options);
    }

    // Apply base URL if provided
    if (options.url.base) {
      try {
        const baseUrl = new URL(options.url.base);
        baseUrl.pathname = path.posix.join(baseUrl.pathname, url);
        url = baseUrl.toString();
      } catch (error) {
        console.warn(`Invalid base URL: ${options.url.base}`);
      }
    }

    return url;
  }
}

/**
 * Factory function to create a revisioner stream
 *
 * @param {Array} sortedFiles - Files sorted in topological order
 * @param {Config} config - Configuration object
 * @returns {Readable} Stream of revised files
 */
export function createRevisioner(sortedFiles, config) {
  const revisioner = new Revisioner(sortedFiles, config);
  return revisioner.stream();
}

export default Revisioner;
