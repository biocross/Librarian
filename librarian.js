const program = require('commander');
const ngrok = require('ngrok');
const chalk = require('chalk');
const storage = require('node-persist');
const os = require('os');
const { spawn } = require('child_process');
const { beginSetup, isSetup } = require('./setup.js');

const log = console.log;
const jekyllCommand = 'jekyll serve --livereload';

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

    let home = os.homedir();

    const jekyll = spawn(jekyllCommand, {
      shell: true,
      cwd: `${home}/Desktop/BuildKeeper/`
    });

    jekyll.stdout.on('data', (data) => {
      if (data.indexOf('Server address:') > -1) {
        log('Jekyll Server Started');
      }
    });

    ngrok.connect({
      addr: 4000,
      bind_tls: true
    }).then((url) => {

      if (url == undefined || url === '') {
        fatalError('Failed to start the ngrok tunnel.')
      }

      log("Server is up at: ")
      log(url);
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
  log(chalk.black.bgRed.bold('🚨🚨🚨 Error: ' + message + ' 🚨🚨🚨'));
  process.exit(1);
};

function getUserHome() {
  return process.env.HOME || process.env.USERPROFILE;
}

program.parse(process.argv);