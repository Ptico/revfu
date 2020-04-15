const Walker = require('./walker');
const Sorter = require('./sorter');
const Revisioner = require('./revisioner');

function main(dir, options={}) {
  let files = new Walker(dir, options).run();
  let sorted = new Sorter(files, options).run();
  let revisioner = new Revisioner(sorted, options);

  return revisioner.run();
}

module.exports = main;
