const program = require('commander');
const ngrok = require('ngrok');
const chalk = require('chalk');
const storage = require('node-persist');
const os = require('os');
const { spawn } = require('child_process');
const { beginSetup, isSetup } = require('./setup.js');

const log = console.log;
const jekyllCommand = 'jekyll serve --livereload';
const home = os.homedir();
const storageOptions = {
  dir: `${home}/librarian/`,
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  forgiveParseErrors: true
};

await storage.init(storageOptions);
log("DB OK");

program
  .version('1.0.0')
  .description('Easily Host your iOS test builds onsite, cause local is best!');

program
  .command('setup')
  .alias('s')
  .description('Setup Librarian to Run on your machine')
  .action(() => {
    printHeader('Welcome to Librarian!');
    beginSetup();
  });

program
  .command('start')
  .alias('st')
  .description('Start the Librarian Server')
  .action(() => {

    printHeader('Starting Librarian...');

    const jekyll = spawn(jekyllCommand, {
      shell: true,
      cwd: `${home}/Desktop/BuildKeeper/`
    });

    jekyll.stdout.on('data', (data) => {
      if (data.indexOf('Server address:') > -1) {
        log(chalk.blue('Jekyll Server Started'));
      }
    });

    jekyll.on('exit', function (code, signal) {
      fatalError('The Jekyll Server has quit unexpectedly. Librarian is now exiting.');
    });

    ngrok.connect({
      addr: 4000,
      bind_tls: true
    }).then((url) => {

      if (url == undefined || url === '') {
        fatalError('Failed to start the ngrok tunnel.')
      }

      log(chalk.blue("\nLibrarian is up at:\n"));
      log(chalk.yellow.bold(url));
    });
  });


program
  .command('submit')
  .alias('a')
  .description('Submit a build to librarian')
  .action(name => {
    console.log("Starting Build Submission!")
  });

const printHeader = (message) => {
  log('---------------------');
  log(chalk.black.bgCyan.bold(message));
  log('---------------------');
};

const fatalError = (message) => {
  log(chalk.white.bgRed.bold('🚨🚨🚨 Error: ' + message + ' 🚨🚨🚨'));
  process.exit(1);
};

program.parse(process.argv);