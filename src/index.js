const Walker = require('./walker');
const Sorter = require('./sorter');
const Revisioner = require('./revisioner');

function main(dir, options={}) {
  let files = new Walker(dir, options.src).run();
  let sorted = new Sorter(files).run();
  let revisioner = new Revisioner(sorted, options.revision, options.manifest);

  return revisioner.run();
}

module.exports = main;
