const program = require('commander');
const ngrok = require('ngrok');
const chalk = require('chalk');
const preferences = require('node-persist');
const os = require('os');
const git = require('simple-git');
const ipa = require('ipa-metadata2');
const { spawn } = require('child_process');
const { beginSetup, isSetup, shouldOverwriteConfiguration, configurationKey } = require('./setup.js');
const log = console.log;
const home = os.homedir();
const storageOptions = {
  dir: `${home}/librarian/configuration`,
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  forgiveParseErrors: true
};

program
  .version('1.0.0')
  .description('Easily Host your iOS test builds onsite, cause local is best!');

program
  .command('setup')
  .alias('s')
  .description('Setup Librarian to Run on your machine')
  .action(async () => {
    printHeader('Welcome to Librarian!');
    await preferences.init(storageOptions);

    if(await isSetup(preferences)) {
      if(await shouldOverwriteConfiguration(preferences)) {
        await beginSetup(preferences);
      }
    } else {
      await beginSetup(preferences);
    }
    
    log(chalk.cyan.bold('\n\nAll set! Run Librarian using: ') + chalk.yellow.bold('librarian start'));
  });

program
  .command('start')
  .alias('st')
  .description('Start the Librarian Server')
  .action(async () => {
    await preferences.init(storageOptions);

    if(!await isSetup(preferences)) {
      fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin')
    }

    printHeader('Starting Librarian...');

    const prefs = await preferences.getItem(configurationKey);
    const webPath = prefs.working_directory + 'web';
    const webPort = prefs.jekyll_port;
    const webCommand = `jekyll serve --livereload --port ${webPort}`;

    // Start the Jekyll Web Server
    const jekyll = spawn(webCommand, {
      shell: true,
      cwd: webPath
    });

    jekyll.stdout.on('data', (data) => {
      if (data.indexOf('Server address:') > -1) {
        log(chalk.blue('Jekyll Server Started'));
      }
    });

    jekyll.on('exit', function (code, signal) {
      fatalError('The Jekyll Server has quit unexpectedly. Librarian is now exiting.');
    });

    // Start the ngrok tunnel to the webserver
    const tunnelURL = await ngrok.connect({ addr: webPort, bind_tls: true });

    if (tunnelURL == undefined || tunnelURL === '') {
      fatalError('Failed to start the ngrok tunnel.')
    }

    log(chalk.blue("\nLibrarian is up at:\n"));
    log(chalk.yellow.bold(tunnelURL));
  });


program
  .command('submit <pathToIPA> [releaseNotes]')
  .alias('a')
  .description('Submit a build to librarian')
  .action(async (pathToIPA, releaseNotes) => {

    // Check if file is accessible.

    ipa(pathToIPA, function(error, data){
      console.log(data.metadata);
    });
    
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