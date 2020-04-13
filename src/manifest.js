const Vinyl = require('vinyl');

function simpleMapper(entries) {
  return entries.reduce((result, entry) => {
    result[entry.original.path] = entry.reved.path;
    return result;
  }, {});
}

function fullMapper(entries) {
  return entries;
}

function rails4Mapper(entries) {
  let files = {};

  entries.map((entry) => {
    result[entry.reved.path] = {
      logical_path: entry.original.path,
      mtime: entry.mtime,
      size: entry.size,
      digest: entry.digest
    };
  });

  return {
    files: files,
    assets: simpleMapper(entries)
  }
}

const MAPPERS = {
  'simple': simpleMapper,
  'full':   fullMapper,
  'rails4': rails4Mapper
};

class Manifest {
  constructor(options={}) {
    this.entries = [];
    this.path = options.path || 'manifest.json';
    this.mapper = typeof(options.format) === 'function' ? options.format : MAPPERS[options.format || 'simple'];
    this.dumper = options.dumper || JSON;
  }

  add(file) {
    this.entries.push({
      original: {
        name: file.originalName,
        path: file.originalPath
      },
      reved: {
        name: file.basename,
        path: file.relative,
        url: file.url
      },
      digest: file.hash,
      size: file.contents.byteLength,
      mtime: file.stat ? file.stat.mtime : Date.now()
    });
  }

  compile() {
    let object = this.mapper(this.entries);

    return new Vinyl({
      path: this.path,
      contents: Buffer.from(this.dumper.stringify(object))
    });
  }
}

Manifest.mappers = MAPPERS;

module.exports = Manifest;
