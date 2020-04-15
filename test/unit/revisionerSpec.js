const path = require('path');
const expect = require('chai').expect;

const File = require('../../src/file');
const Revisioner = require('../../src/revisioner');

const cwd = '/var/www/afterpack';

function createFile(name, content, deps=[], isBinary=false) {
  let file = new File({
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

  file.textContent = content;
  file.deps = deps;

  return file;
}

function createFiles() {
  let fileA = createFile('js/model.js', 'let app = {};console.log(app);');
  let fileB = createFile('app.js', "import model from 'js/model.js';", [fileA]);
  let fileC = createFile('images/icon.svg', '');
  let fileD = createFile('images/arrow.png', '', [], true);
  let fileE = createFile('css/main.css', 'body { background: url("images/icon.svg#circle"); }\n.arrow {background: url(images/arrow.png);}', [fileC, fileD])
  let fileF = createFile('index.js', 'require("app");let style = "/css/main.css";', [fileB, fileE]);
  let fileG = createFile('images/button.jpg', '', [], true);
  let fileH = createFile('css/other.css', 'button { background: url( /images/button.jpg ); }', [fileG]);

  return [fileA, fileB, fileC, fileD, fileE, fileF, fileG, fileH];
}


describe('Revisioner', function() {
  describe('without options', function() {
    it('should rename paths', function() {
      let files = createFiles();
      new Revisioner(files).run();
      let result = files.map(f => f.relative);

      expect(result).to.have.members([
        'js/model-323a29ea.js',
        'app-7ffafa19.js',
        'images/icon-e3b0c442.svg',
        'images/arrow-e3b0c442.png',
        'css/main-d078a0b3.css',
        'index-f93fccf3.js',
        'images/button-e3b0c442.jpg',
        'css/other-a7014a01.css'
      ]);
    });

    it('should change the hash of a file if dependency changed', function() {
      let files = createFiles(),
          content = 'console.log("this file was changed");';

      files[0].textContent = content;
      files[0].contents = Buffer.from(content);

      new Revisioner(files).run();
      let result = files.map(f => f.relative);

      expect(result).to.have.members([
        'js/model-d9c426d7.js', // this one changed
        'app-c5d90fc4.js', // this depends on js/model.js
        'images/icon-e3b0c442.svg',
        'images/arrow-e3b0c442.png',
        'css/main-d078a0b3.css',
        'index-dd1e7632.js', // this depends on app.js and js/model.js
        'images/button-e3b0c442.jpg',
        'css/other-a7014a01.css'
      ]);
    });

    it('should rewrite references', function() {
      let files = createFiles();
      new Revisioner(files).run();
      let result = files.map(f => f.contents.toString());

      expect(result).to.include.members([
        'let app = {};console.log(app);',
        "import model from 'js/model-323a29ea.js';",
        'body { background: url("images/icon-e3b0c442.svg#circle"); }\n.arrow {background: url(images/arrow-e3b0c442.png);}',
        'require("app-7ffafa19");let style = "/css/main-d078a0b3.css";',
        'button { background: url( /images/button-e3b0c442.jpg ); }'
      ]);
    });
  });

});
