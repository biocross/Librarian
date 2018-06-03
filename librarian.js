const program = require('commander');
const ngrok = require('ngrok');
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
    printWithDivider('Starting Librarian...');


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

      console.log("Server is up at: ")
      console.info(url);
    });
  });


program
  .command('submit')
  .alias('a')
  .description('Submit a build to librarian')
  .action(name => {
    console.log("Starting Build Submission!")
  });

const printWithDivider = (message) => {
  console.log('---------------------');
  console.info(message);
  console.log('---------------------');
};

const fatalError = (message) => {
  console.log('---------------------');
  console.error('Fatal Error:' + message);
  console.log('---------------------');
};

program.parse(process.argv);