const program = require('commander');
const ngrok = require('ngrok');
const chalk = require('chalk');
const log = console.log;
const { spawn } = require('child_process');
const { beginSetup, isSetup } = require('./setup.js');

program
  .version('1.0.0')
  .description('Easily Host your iOS test builds onsite, cause local is best!');

program
  .command('setup')
  .alias('s')
  .description('Setup Librarian to Run on your machine')
  .action(() => {
    printWithDivider('Welcome to Librarian!');
    beginSetup();
  });

program
  .command('start')
  .alias('st')
  .description('Start the Librarian Server')
  .action(() => {
    
    printHeader('Starting Librarian...');

    const child = spawn('jekyll serve', {
      shell: true,
      cwd: '/Users/sids/Desktop/BuildKeeper/'
    });

    child.stdout.on('data', (data) => {
      if (data.indexOf('Server address:') > -1) {
        console.log(`Jekyll${data}`);
      }
    });

    // ps aux |grep jekyll |awk '{print $2}' | xargs kill -9

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

program.parse(process.argv);