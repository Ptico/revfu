const path = require('path');
const expect = require('chai').expect;

const File = require('../../src/file');
const Sorter = require('../../src/sorter');

const cwd = '/var/www/afterpack';

function createFile(name, content, isBinary=false) {
  return new File({
    cwd: cwd,
    path: path.join(cwd, name),
    contents: Buffer.from(content),
    isBinary: isBinary,
    revOptions: {
      format: '{name}-{hash}.{ext}',
      hashType: 'sha256',
      hashLength: 8,
    },
    extOptions: {
      '.js': [['"', "'"], ['"', "'"]]
    }
  });
}

const fileA = createFile('index.js', 'require("app");let style = "/css/main.css";');
const fileB = createFile('app.js', "import model from 'js/model.js';");
const fileC = createFile('js/model.js', 'let app = {};console.log(app);');
const fileD = createFile('css/main.css', 'body { background: url("images/icon.svg#circle"); }\n.arrow {background: url(images/arrow.png);}')
const fileE = createFile('images/icon.svg', '');
const fileF = createFile('css/other.css', 'button { background: url( /images/button.jpg ); }');
const fileG = createFile('images/button.jpg', '', true);
const fileH = createFile('images/arrow.png', '', true);

describe('Sorter', function() {
  it('should order files by references', function() {
    let files = [fileA, fileB, fileC, fileD, fileE, fileF, fileG, fileH];
    let refs = new Sorter(files).run().map(f => f.relative);

    expect(refs).to.have.ordered.members([
      'js/model.js',
      'app.js',
      'images/icon.svg',
      'images/arrow.png',
      'css/main.css',
      'index.js',
      'images/button.jpg',
      'css/other.css'
    ]);
  });
});
