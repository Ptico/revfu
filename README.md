# Revfu

> Asset revision builder with **dependency-aware cascading hashes**

[![npm version](https://img.shields.io/npm/v/revfu.svg)](https://www.npmjs.com/package/revfu)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

Revfu builds a dependency graph across your assets, topologically sorts them, rewrites references, and calculates cascading hashes. This provides **deterministic, content-based asset versioning** where a file's hash reflects both its content AND all its dependencies.

## Why another revision builder?

Traditional asset hashers calculate hashes independently:
```
index.html → hash(index.html) → index-abc123.html  ❌ Doesn't change when style.css changes
style.css  → hash(style.css)  → style-def456.css
```

**Revfu calculates cascading hashes:**
```
1. style.css  → hash(style.css)           → style-def456.css
2. index.html → rewrite refs to style-def456.css
              → hash(updated content)     → index-abc789.html  ✅ Hash includes dependency
```

When `style.css` changes, `index.html`'s hash **also changes** because it references the new hash. This provides **true cache invalidation** across your entire dependency tree.

## 📦 Installation

```bash
npm install revfu
```

**Requirements:**
- Node.js 18 or higher
- ESM modules support
- gulp or vinyl-fs

## 📖 Usage

### Basic Example

```js
import revfu from 'revfu';
import { dest } from 'vinyl-fs';

return revfu('static/')
  .pipe(dest('public/'));

```

### Advanced Configuration

```js
export function rev() {
  return revfu('src/assets/', {
    // File discovery
    walker: {
      exclude: ['uploads/**', '*.tmp'],
      concurrency: 20  // Parallel file reads
    },

    // Hash configuration
    hash: {
      algorithm: 'sha384',
      length: 16,
      format: '{name}-{hash}.{ext}'
    },

    // URL transformation
    url: {
      prefix: '/assets',
      base: 'https://cdn.example.com'
    },

    // File-specific rules
    rules: [
      {
        match: '**/*.json',
        hash: { algorithm: 'sha1', length: 16 },
        url: { prefix: '/data' }
      },
      {
        match: 'vendor/**',
        rename: false,  // Keep original names
        rewrite: false  // Don't process contents
      }
    ],

    // Reference detection
    references: {
      detect: {
        '.js': ['import', 'require', 'dynamic-import'],
        '.css': ['url', 'import']
      },
      custom: [
        {
          pattern: /data-src=["']([^"']+)["']/g,
          extensions: ['.html']
        }
      ]
    },

    // Manifest
    manifest: {
      format: 'rails4',
      path: 'assets-manifest.json'
    }
  })
  .pipe(gulp.dest('dist/assets/'));
}
```

### With Gulp Plugins

```js
import revfu from 'revfu';
import revDel from 'gulp-rev-delete-original';
import awspublish from 'gulp-awspublish';

export function deploy() {
  const publisher = awspublish.create({
    region: 'us-east-1',
    params: { Bucket: 'my-bucket' }
  });

  return revfu('src/assets/', {
    url: { base: 'https://cdn.example.com' }
  })
  .pipe(revDel())           // Delete original files
  .pipe(awspublish.gzip())  // Gzip assets
  .pipe(publisher.publish()) // Upload to S3
  .pipe(awspublish.reporter());
}
```

[More examples](EXAMPLES.md)

## Configuration

### Walker Options

Control file discovery:

```js
walker: {
  include: ['**/*'],              // Glob patterns to include
  exclude: ['node_modules/**'],   // Glob patterns to exclude
  dot: false,                     // Include dotfiles
  followSymlinks: false,          // Follow symbolic links
  concurrency: 10,                // Parallel file reads
  ignoreErrors: false             // Continue on errors
}
```

### Hash Options

Configure hashing behavior:

```js
hash: {
  algorithm: 'sha256',            // Any Node.js crypto algorithm
  length: 8,                      // Hash length in filename
  format: '{name}-{hash}.{ext}'   // Filename template
}
```

Available format placeholders:
- `{name}` - Original filename without extension
- `{hash}` - Calculated hash (truncated to `length`)
- `{ext}` - File extension

### URL Options

Transform file paths and URLs:

```js
url: {
  prefix: '/assets',              // Add prefix to paths
  base: 'https://cdn.example.com', // Convert to absolute URLs
  transform: (file) => {          // Custom transformation
    return `/custom/${file.hash}/${file.basename}`;
  }
}
```

### Rules

Apply different settings to specific files:

```js
rules: [
  {
    match: '**/*.json',           // Glob pattern(s)
    hash: { algorithm: 'sha1' },  // Override hash options
    url: { prefix: '/data' }      // Override URL options
  },
  {
    match: 'vendor/legacy/**',
    rename: false,                // Don't rename these files
    rewrite: false                // Don't process their contents
  }
]
```

### Reference Detection

Customize how references are detected:

```js
references: {
  // Built-in patterns by file type
  detect: {
    '.js': ['import', 'require', 'dynamic-import', 'extensionless'],
    '.css': ['url', 'import'],
    '.html': ['src', 'href', 'srcset', 'data-src']
  },

  // Custom patterns
  custom: [
    {
      pattern: /loadImage\(['"]([^'"]+)['"]\)/g,
      extensions: ['.js', '.jsx']
    }
  ],

  // Extensionless reference boundaries
  extensionless: {
    '.js': { before: ['"', "'"], after: ['"', "'"] }
  }
}
```

**Built-in detectors:**
- `import` - ES6 import statements
- `require` - CommonJS require()
- `dynamic-import` - Dynamic import()
- `url` - CSS url()
- `src`, `href`, `srcset`, `data-src` - HTML attributes
- `extensionless` - References without file extensions

**Smart defaults** are provided for:
- JavaScript (.js, .mjs, .cjs, .jsx, .tsx)
- CSS (.css, .scss, .sass, .less)
- HTML (.html, .htm)
- SVG (.svg)

### Manifest Options

Configure manifest generation:

```js
manifest: {
  path: 'assets.json',            // Manifest filename
  format: 'simple',               // Format type
  stream: true,                   // Include in output stream
  absolutePaths: false            // Use absolute paths
}
```

**Built-in formats:**

**`simple`** (default) - Clean key-value mapping:
```json
{
  "app.js": "app-abc123.js",
  "style.css": "style-def456.css"
}
```

**`full`** - Complete metadata:
```json
[{
  "original": { "name": "app.js", "path": "app.js" },
  "reved": { "name": "app-abc123.js", "path": "app-abc123.js", "url": "..." },
  "digest": "abc123...",
  "size": 15420,
  "mtime": "2025-02-18T10:30:00.000Z"
}]
```

**`rails4`** - Rails Sprockets compatible:
```json
{
  "files": {
    "app-abc123.js": {
      "logical_path": "app.js",
      "mtime": "2025-02-18T10:30:00.000Z",
      "size": 15420,
      "digest": "abc123..."
    }
  },
  "assets": {
    "app.js": "app-abc123.js"
  }
}
```

**Custom format:**
```js
manifest: {
  format: (entries) => {
    return {
      version: '1.0',
      files: entries.map(e => ({
        from: e.original.path,
        to: e.reved.url,
        hash: e.digest
      }))
    };
  }
}
```

## Gulp Integration

Revfu returns a Vinyl stream, making it fully compatible with the Gulp ecosystem:

```js
import gulp from 'gulp';
import revfu from 'revfu';
import revDel from 'gulp-rev-delete-original';
import { deleteAsync } from 'del';

// Clean build directory
export async function clean() {
  await deleteAsync(['dist/**']);
}

// Revision assets
export function rev() {
  return revfu('src/assets/')
    .pipe(revDel())
    .pipe(gulp.dest('dist/assets/'));
}

// Watch for changes
export function watch() {
  gulp.watch('src/assets/**/*', rev);
}

// Complete build
export const build = gulp.series(clean, rev);
export default build;
```

## Features

### Smart Reference Detection
Automatically detects references in 13+ file types:
- JavaScript (imports, requires, dynamic imports)
- CSS (url(), @import)
- HTML (src, href, srcset, data-*)
- SVG (href, xlink:href)
- Plus custom patterns!

### Dependency Graph
Builds a complete dependency graph and topologically sorts files using Kahn's algorithm (O(V+E), optimal).

### Circular Dependency Detection
Detects circular dependencies and provides clear error messages showing which files are involved.

### Multiple Manifest Formats
Supports simple, full, rails4, and custom formats out of the box.

## Migration from v0.x

Revfu v1.0 is a complete rewrite with breaking changes:

**Changed:**
- ESM modules only (no CommonJS)
- Node.js 18+ required (was 10+)
- New configuration structure (cleaner, grouped)
- Uses `glob` library (replaces `vinyl-fs` for walking)

**Migration guide:**

**Before (v0.x):**
```js
const revfu = require('revfu');

revfu(dir, {
  exclude: ['uploads/**'],
  dontRename: ['vendor/**'],
  dontRewrite: ['vendor/**'],
  revision: {
    hashType: 'sha256',
    hashLength: 8,
    prefix: '/assets'
  }
})
```

**After (v1.0):**
```js
import revfu from 'revfu';

revfu(dir, {
  walker: {
    exclude: ['uploads/**']
  },
  hash: {
    algorithm: 'sha256',
    length: 8
  },
  url: {
    prefix: '/assets'
  },
  rules: [
    {
      match: 'vendor/**',
      rename: false,
      rewrite: false
    }
  ]
})
```

## Advanced API

Access internal components for custom workflows:

```js
import {
  Config,
  Walker,
  Parser,
  Sorter,
  Revisioner,
  Manifest,
  MAPPERS
} from 'revfu';

// Create config
const config = new Config('/assets', { /* options */ });

// Use components individually
const walker = new Walker(config);
const parser = new Parser(config);
const sorter = new Sorter(files);
const revisioner = new Revisioner(sortedFiles, config);
const manifest = new Manifest(config.manifest);

// Get graph statistics
const stats = sorter.getStats();
console.log(`Max depth: ${stats.maxDepth}`);
console.log(`Total dependencies: ${stats.totalDependencies}`);
```

## Troubleshooting

### References not being detected

If references aren't being detected:
1. Check the file extension is in the `references.detect` config
2. Add a custom pattern if using non-standard syntax
3. Verify the reference path is relative (not an external URL or npm package)

### Performance issues

For large projects:
1. Increase `walker.concurrency` (default: 10)
2. Add more patterns to `walker.exclude`
3. Use `rules` to mark binary files as `rewrite: false`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT License](https://opensource.org/licenses/MIT)
