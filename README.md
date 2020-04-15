## Installation

`npm install revfu`

To use outside Gulp (see [Usage with Gulp](#usage-with-gulp) ) you may also need a [Vinyl](https://github.com/gulpjs/vinyl) adapter, most likely ([but not limited to](#upload-to-CDN)):

`npm install vinyl-fs`

## Usage

**Warning:** this is a very early prototype and API may change significantly

```js
const revfu = require('revfu'),
      path  = require('path'),
      vfs   = require('vinyl-fs');

let workingDir = path.join(__dirname, 'static');

revfu(workingDir).pipe(vfs.dest(workingDir));
```

Example with [options](#options):

```js
revfu(workingDir, {
  exclude: ['uploads/**', 'robots.txt'],
  dontRename: ['bootstrap-4.4.1.{js,css}'],
  dontRewrite: ['bootstrap-4.4.1.js'],
  revision: {
    format: '{hash}-{name}.{ext}',
    hashType: 'sha384',
    hashLength: 10,
    prefix: '/assets',
    baseUrl: 'https://cdn.com/'
  },
  overrides: {
    '**/*.json': {
      prefix: '/data',
      hashType: 'sha1'
    }
  },
  manifest: {
    format: 'rails4',
    absolutePaths: true
  }
}).pipe(vfs.dest('public/'));
```

## Usage with Gulp

[Gulp](https://gulpjs.com) is not only a task runner, but also a good example of modular ecosystem based on well defined abstractions. This tool returns a Readable Vinyl stream therefore is compatible with gulp plugins and Vinyl adapters (see [Upload to CDN](#upload-to-CDN) and [Remove original files](#remove-original-files) for example).

```js
function rev() {
  return revfu(workingDir).pipe(gulp.dest(workingDir));
}

exports.rev = rev;
```

## Options

### `exclude`

Type: `Array`

Default: `[]`

Example: `['uploads/**', 'robots.txt']`

Exclude files from search and processing. Takes an array of glob patterns accepted by [minimatch](https://github.com/isaacs/minimatch)

### `dot`

Type: `Boolean`

Default: `false`

By default, we exclude any file and directory starting with dot (`.git` for example). Turning this on may cause some unexpected results, so use with caution

### `binaryExt`

Type: `Array`

Default: `['.png', '.jpg']`

List of file extensions which automatically marks as binary. This allows us to avoid false negative binary detection, so we will not search and replace inside binary files

### `extensionless`

Type: `Map`

Default: `'.js': [['"', "'"], ['"', "'"]]`

Example: `'.css: [['css!.'], ['"', '"']]` - will match and replace `css!.styles/app.css"`

Some file types may be referenced without extension, for example js files might be required by some nodejs shim `require "application"`. To avoid false positive search, we only replace strings surrounded by boundaries

### `dontRename`

Type: `Array`

Default: `[]`

Array of glob patterns which should not be renamed

### `dontRewrite`

Type: `Array`

Default: `[]`

Array of glob patterns. Files matched with this patterns will be kept untouched (references to other files will not be rewritten)

### `revision`

#### `revision.format`

Type: `String`

Default: `'{name}-{hash}.{ext}'`

Format of revisioned filename

#### `revision.hashType`

Type: `String`

Default: `'sha256'`

Any algorithm name accepted by nodejs `crypto.createHash`

#### `revision.hashLength`

Type: `Number`

Default: `8`

The number of first `n` symbols of hash hex representation applied to filename

#### `revision.transformPath`

Type: `Function`

Default: `undefined`

Funtion which takes a virtual file representation (see [Vinyl](https://github.com/gulpjs/vinyl) and `src/file.js`) and returns `String` transformed path. Useful for custom path transformations

#### `revision.prefix`

Type: `String`

Default: `undefined`

Path prefix. Useful for cases, when working dir is a subdir inside one, configured to serve static files. For example, if static files serves from `public/` dir, but working dir is `public/assets`, this option set to `/assets` adds an ability to find and replace `/assets/**` references

#### `revision.baseUrl`

Type: `URL|String`

Default: `undefined`

Convert references to URLs. Useful with CDN (See [Upload to CDN](#upload-to-CDN)).

### `overrides`

Type: `Map`

Default: `{}`

Example: `'**/*.js': { prefix: '/javascripts' }`

Override `revision.*` options for particular glob pattern

### `manifest`

#### `manifest.path`

Type: `String`

Default: `assets.json`

Path to manifest file

#### `manifest.format`

Type: `String|Function`

Default: `'simple'`

Format of manifest file. There is some predefined formats: `simple`, `full`, `rails4`

Also, can take function. Docs TBD

#### `manifest.dumper`

Type: `Object`

Default: `JSON`

Any object which responds to `.stringify` method and returns serialized string

#### `manifest.dontStream`

Type: `Boolean`

Default: `false`

Do not include manifest file in main stream

## Remove original files

By default, original files remains untouched except the case, when destination folder is the same as source and file is in `revision.dontRename` option but not in `revision.dontRewrite` and had references to other files.

To remove original files, you can use [gulp-rev-delete-original](https://github.com/nib-health-funds/gulp-rev-delete-original) plugin:

```js
// ...
const revDel = require('gulp-rev-delete-original');

revfu(workingDir).pipe(revDel()).pipe(vfs.dest('public/'));
```

## Upload to CDN

TBD

## License

[MIT License](https://opensource.org/licenses/MIT)
