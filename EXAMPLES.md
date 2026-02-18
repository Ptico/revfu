# Revfu Examples

## Table of Contents
- [Basic Usage](#basic-usage)
- [Configuration Examples](#configuration-examples)
- [Gulp Integration](#gulp-integration)
- [Advanced Scenarios](#advanced-scenarios)
- [Real-World Examples](#real-world-examples)

## Basic Usage

### Simplest Example
```js
import revfu from 'revfu';
import gulp from 'gulp';

export function rev() {
  return revfu('static/')
    .pipe(gulp.dest('public/'));
}
```

### With Exclusions
```js
export function rev() {
  return revfu('static/', {
    walker: {
      exclude: ['uploads/**', '*.tmp']
    }
  }).pipe(gulp.dest('public/'));
}
```

## Configuration Examples

### Custom Hash Algorithm
```js
revfu('static/', {
  hash: {
    algorithm: 'sha384',
    length: 16,
    format: '{hash}.{ext}'  // Hash-only filename
  }
}).pipe(gulp.dest('public/'));
```

### CDN Configuration
```js
revfu('static/', {
  url: {
    prefix: '/assets',
    base: 'https://cdn.example.com'
  },
  manifest: {
    format: 'full',
    absolutePaths: true
  }
}).pipe(gulp.dest('public/'));
```

### File-Specific Rules
```js
revfu('static/', {
  rules: [
    // JSON files get SHA-1 hashes
    {
      match: '**/*.json',
      hash: { algorithm: 'sha1', length: 16 },
      url: { prefix: '/data' }
    },
    // Vendor files don't get renamed
    {
      match: 'vendor/**',
      rename: false
    },
    // Config files don't get processed
    {
      match: 'config/**',
      rename: false,
      rewrite: false
    }
  ]
}).pipe(gulp.dest('public/'));
```

### Custom Reference Detection
```js
revfu('static/', {
  references: {
    // Add custom patterns
    custom: [
      {
        pattern: /data-image=["']([^"']+)["']/g,
        extensions: ['.html', '.jsx']
      },
      {
        pattern: /loadImage\(['"]([^'"]+)['"]\)/g,
        extensions: ['.js']
      }
    ],
    // Override defaults
    detect: {
      '.js': ['import', 'require'],  // Only these patterns
      '.html': ['src', 'href', 'srcset', 'data-src']
    }
  }
}).pipe(gulp.dest('public/'));
```

## Gulp Integration

### Basic Gulp Task
```js
import gulp from 'gulp';
import revfu from 'revfu';

export function rev() {
  return revfu('src/assets/')
    .pipe(gulp.dest('dist/assets/'));
}

export function watch() {
  gulp.watch('src/assets/**/*', rev);
}
```

### With gulp-rev-delete-original
```js
import revDel from 'gulp-rev-delete-original';

export function rev() {
  return revfu('src/assets/')
    .pipe(revDel())  // Delete original files
    .pipe(gulp.dest('dist/assets/'));
}
```

### With AWS S3 Publishing
```js
import awspublish from 'gulp-awspublish';

export function deploy() {
  const publisher = awspublish.create({
    region: 'us-east-1',
    params: { Bucket: 'my-bucket' }
  });

  return revfu('src/assets/', {
    url: {
      base: 'https://d111111abcdef8.cloudfront.net'
    }
  })
  .pipe(awspublish.gzip())
  .pipe(publisher.publish())
  .pipe(awspublish.reporter());
}
```

### Complete Build Pipeline
```js
import gulp from 'gulp';
import revfu from 'revfu';
import revDel from 'gulp-rev-delete-original';
import { deleteAsync } from 'del';

export async function clean() {
  await deleteAsync(['dist/**']);
}

export function rev() {
  return revfu('src/assets/', {
    walker: {
      exclude: ['**/*.map', 'vendor/legacy/**']
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
        match: '**/*.{woff,woff2,ttf,eot}',
        rewrite: false  // Don't search for refs in fonts
      }
    ],
    manifest: {
      path: 'asset-manifest.json',
      format: 'rails4'
    }
  })
  .pipe(revDel())
  .pipe(gulp.dest('dist/assets/'));
}

export const build = gulp.series(clean, rev);
export default build;
```

## Advanced Scenarios

### Rails Asset Pipeline Integration
```js
revfu('app/assets/', {
  hash: {
    algorithm: 'sha256',
    length: 64,
    format: '{name}-{hash}.{ext}'
  },
  manifest: {
    path: 'public/assets/.sprockets-manifest.json',
    format: 'rails4',
    absolutePaths: true
  }
}).pipe(gulp.dest('public/assets/'));
```

### Multi-Environment Build
```js
const envConfig = {
  development: {
    url: { prefix: '/assets' },
    hash: { length: 8 }
  },
  staging: {
    url: {
      prefix: '/assets',
      base: 'https://staging-cdn.example.com'
    },
    hash: { length: 12 }
  },
  production: {
    url: {
      prefix: '/assets',
      base: 'https://cdn.example.com'
    },
    hash: { algorithm: 'sha384', length: 16 }
  }
};

export function rev() {
  const env = process.env.NODE_ENV || 'development';
  const config = envConfig[env];

  return revfu('src/assets/', config)
    .pipe(gulp.dest(`dist/${env}/assets/`));
}
```

### Progressive Web App (PWA)
```js
revfu('src/', {
  walker: {
    include: ['**/*'],
    exclude: ['service-worker.js', 'manifest.json']
  },
  hash: {
    algorithm: 'sha256',
    length: 16
  },
  manifest: {
    path: 'precache-manifest.json',
    format: (files) => {
      // Custom format for service worker
      return files.map(file => ({
        url: file.url,
        revision: file.hash
      }));
    }
  }
}).pipe(gulp.dest('dist/'));
```

### Source Map Handling
```js
revfu('src/assets/', {
  walker: {
    include: ['**/*.{js,css,js.map,css.map}']
  },
  references: {
    custom: [
      // Detect sourceMappingURL in JS/CSS
      {
        pattern: /sourceMappingURL=([^\s]+)/g,
        extensions: ['.js', '.css']
      }
    ]
  }
}).pipe(gulp.dest('dist/assets/'));
```

## Real-World Examples

### Static Site Generator Integration
```js
// After Jekyll/Hugo build, revision all assets
export function revAssets() {
  return revfu('_site/assets/', {
    walker: {
      exclude: ['**/*.xml', '**/*.json']
    },
    url: {
      prefix: '/assets'
    }
  })
  .pipe(gulp.dest('_site/assets/'));
}

// Then update HTML files with new asset paths
export function updateHTML() {
  const manifest = JSON.parse(
    fs.readFileSync('_site/assets/assets.json', 'utf8')
  );

  return gulp.src('_site/**/*.html')
    .pipe(replace(Object.keys(manifest), (match) => manifest[match]))
    .pipe(gulp.dest('_site/'));
}

export const build = gulp.series(jekyll, revAssets, updateHTML);
```

### React/Webpack Build
```js
// After webpack build, revision public assets
export function revPublic() {
  return revfu('build/', {
    walker: {
      include: ['static/**/*', 'images/**/*', 'fonts/**/*'],
      exclude: ['**/*.map']
    },
    rules: [
      {
        match: '**/*.html',
        rewrite: true,  // Update asset references in HTML
        rename: false    // Don't rename HTML files
      }
    ],
    manifest: {
      path: 'asset-manifest.json',
      format: (files) => {
        // Merge with webpack manifest
        const webpackManifest = require('./build/asset-manifest.json');
        const revManifest = {};
        files.forEach(f => {
          revManifest[f.originalPath] = f.url;
        });
        return { ...webpackManifest, ...revManifest };
      }
    }
  })
  .pipe(gulp.dest('build/'));
}
```

### Monorepo with Multiple Apps
```js
const apps = ['admin', 'dashboard', 'marketing'];

export function revAll() {
  return Promise.all(
    apps.map(app => {
      return new Promise((resolve) => {
        revfu(`packages/${app}/dist/`, {
          url: {
            prefix: `/${app}/assets`
          },
          manifest: {
            path: `${app}-manifest.json`
          }
        })
        .pipe(gulp.dest(`packages/${app}/dist/`))
        .on('end', resolve);
      });
    })
  );
}
```

### With Custom Transform
```js
revfu('src/assets/', {
  url: {
    prefix: '/assets',
    transform: (file) => {
      // Custom logic: organize by type
      const type = path.extname(file.basename).slice(1);
      return `/${type}/${file.basename}`;
    }
  }
}).pipe(gulp.dest('dist/'));

// Result:
// bg.png → /png/bg-abc123.png
// style.css → /css/style-def456.css
```

### Handling Legacy Assets
```js
revfu('src/', {
  walker: {
    include: ['**/*']
  },
  rules: [
    // Modern assets: SHA-256 with long hash
    {
      match: ['src/**/*.{js,css}', '!src/legacy/**'],
      hash: { algorithm: 'sha256', length: 16 }
    },
    // Legacy assets: MD5 for compatibility
    {
      match: 'src/legacy/**',
      hash: { algorithm: 'md5', length: 8 },
      url: { prefix: '/legacy' }
    },
    // Don't process vendor files at all
    {
      match: 'vendor/**',
      rename: false,
      rewrite: false
    }
  ]
}).pipe(gulp.dest('dist/'));
```

### Debug Mode with Statistics
```js
import { Sorter } from 'revfu/src/sorter.js';

export function revWithStats() {
  const files = [];

  return revfu('src/assets/')
    .on('data', (file) => {
      files.push(file);
    })
    .on('end', () => {
      // Calculate and display stats
      const sorter = new Sorter(files);
      const stats = sorter.getStats();

      console.log('Revision Statistics:');
      console.log(`  Total files: ${stats.totalFiles}`);
      console.log(`  Files with deps: ${stats.filesWithDependencies}`);
      console.log(`  Total deps: ${stats.totalDependencies}`);
      console.log(`  Max depth: ${stats.maxDepth}`);
      console.log(`  Avg deps/file: ${stats.averageDependencies.toFixed(2)}`);
    })
    .pipe(gulp.dest('dist/assets/'));
}
```

## Tips and Best Practices

### 1. Exclude Unnecessary Files Early
```js
walker: {
  exclude: [
    'node_modules/**',
    '**/*.map',
    '**/*.md',
    '**/README',
    '**/.DS_Store'
  ]
}
```

### 2. Use Rules for Different Asset Types
```js
rules: [
  // Fast SHA-1 for images (content rarely changes)
  {
    match: '**/*.{png,jpg,jpeg,gif,webp}',
    hash: { algorithm: 'sha1', length: 8 }
  },
  // Strong SHA-384 for critical files
  {
    match: '**/*.{js,css}',
    hash: { algorithm: 'sha384', length: 16 }
  }
]
```

### 3. Organize Output by Manifest Format
```js
// For Rails:
manifest: { format: 'rails4' }

// For simple key-value:
manifest: { format: 'simple' }

// For detailed metadata:
manifest: { format: 'full' }

// Custom:
manifest: {
  format: (files) => {
    return files.reduce((acc, file) => {
      acc[file.originalPath] = {
        url: file.url,
        hash: file.hash,
        size: file.stat.size
      };
      return acc;
    }, {});
  }
}
```

### 4. Handle Errors Gracefully
```js
export function rev() {
  return revfu('src/assets/', {
    walker: { ignoreErrors: true }
  })
  .on('error', (err) => {
    console.error('Revision failed:', err.message);
    process.exit(1);
  })
  .pipe(gulp.dest('dist/assets/'));
}
```

### 5. Test Configuration First
```js
// Dry run - process but don't write
export function revTest() {
  let count = 0;

  return revfu('src/assets/')
    .on('data', (file) => {
      count++;
      console.log(`${file.originalPath} → ${file.relative}`);
    })
    .on('end', () => {
      console.log(`Total files processed: ${count}`);
    });
}
```
