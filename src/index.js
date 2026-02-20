import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { Config } from './config.js';
import { Walker } from './walker.js';
import { Parser } from './parser.js';
import { Sorter } from './sorter.js';
import { Revisioner } from './revisioner.js';
import { Manifest } from './manifest.js';

/**
 * Revfu - Asset revision builder with cascading hashes
 *
 * Main entry point that orchestrates the entire pipeline:
 * 1. Walker: Discover files
 * 2. Parser: Detect references and build dependency graph
 * 3. Sorter: Topologically sort files by dependencies
 * 4. Revisioner: Rewrite references and calculate cascading hashes
 * 5. Manifest: Generate manifest file (optional)
 *
 * @param {string} dir - Working directory containing assets
 * @param {Object} [options={}] - Configuration options
 * @returns {NodeJS.ReadableStream} Stream of Vinyl files (gulp-compatible)
 *
 * @example
 * import revfu from 'revfu';
 * import gulp from 'gulp';
 *
 * revfu('static/')
 *   .pipe(gulp.dest('public/'));
 *
 * @example
 * // With configuration
 * revfu('static/', {
 *   walker: { exclude: ['uploads/**'] },
 *   hash: { algorithm: 'sha384', length: 16 },
 *   url: { prefix: '/assets', base: 'https://cdn.com' },
 *   manifest: { format: 'rails4' }
 * })
 * .pipe(gulp.dest('public/'));
 */
export default function revfu(dir, options = {}) {
  // Create configuration
  const config = new Config(dir, options);

  // Create output stream
  const output = new PassThrough({ objectMode: true });

  // Run the pipeline asynchronously
  runPipeline(config, output).catch(error => {
    output.destroy(error);
  });

  return output;
}

/**
 * Run the complete revision pipeline
 * @private
 */
async function runPipeline(config, output) {
  try {
    // Step 1: Walk and discover files
    const walker = new Walker(config);
    const walkerStream = walker.stream();

    // Step 2: Parse references and buffer files
    const parser = new Parser(config);
    const files = [];

    // Collect all files from parser
    for await (const file of walkerStream.pipe(parser)) {
      files.push(file);
    }

    // Step 3: Topological sort
    const sorter = new Sorter(files);
    let sortedFiles;

    try {
      sortedFiles = sorter.sort();
    } catch (error) {
      // Add helpful context for circular dependency errors
      if (error.message.includes('Circular dependency')) {
        const cycles = sorter.detectCycles();
        error.message += `\nFiles in cycle: ${cycles.join(', ')}`;
      }
      throw error;
    }

    // Step 4: Revision files (rewrite references and hash)
    const manifest = new Manifest(config.manifest);
    const revisioner = new Revisioner(sortedFiles, config);
    const revisionerStream = revisioner.stream();

    // Process and emit revisioned files
    for await (const file of revisionerStream) {
      // Add to manifest
      manifest.add(file);

      // Emit file to output stream
      output.write(file);
    }

    // Step 5: Emit manifest file if configured
    if (config.manifest.stream) {
      const manifestFile = manifest.compile();
      output.write(manifestFile);
    }

    // Signal completion
    output.end();

  } catch (error) {
    // Emit error and close stream
    output.destroy(error);
  }
}

/**
 * Advanced API: Get access to internal components
 * Useful for debugging, testing, or custom workflows
 */
export { Config } from './config.js';
export { Walker, createWalker } from './walker.js';
export { Parser, createParser } from './parser.js';
export { Sorter, sortFiles } from './sorter.js';
export { Revisioner, createRevisioner } from './revisioner.js';
export { Manifest, MAPPERS, createManifest } from './manifest.js';

/**
 * Version information
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export const version = pkg.version;

// Attach version to default export for convenience
revfu.version = version;
