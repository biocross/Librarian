const program = require('commander');
const ngrok = require('ngrok');
const chalk = require('chalk');
const preferences = require('node-persist');
const os = require('os');
const fs = require('fs-extra');
const git = require('simple-git');
const ipa = require('ipa-metadata2');
const plist = require('plist');
const { spawn } = require('child_process');
const { beginSetup, isSetup, shouldOverwriteConfiguration, purgeExistingInstallation, configurationKey } = require('./setup.js');
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

    if (await isSetup(preferences)) {
      if (await shouldOverwriteConfiguration()) {
        await purgeExistingInstallation(preferences);
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

    if (!await isSetup(preferences)) {
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

    configuration.currentURL = tunnelURL;
    await storage.setItem(configurationKey, configuration);

    log(chalk.blue("\nLibrarian is up at:\n"));
    log(chalk.yellow.bold(tunnelURL));
  });


program
  .command('submit <pathToIPA> [releaseNotes]')
  .alias('a')
  .description('Submit a build to librarian')
  .action(async (pathToIPA, releaseNotes) => {

    // Check if file is accessible.

    const prefs = await preferences.getItem(configurationKey);

    ipa(pathToIPA, function (error, data) {

      // if(error) {
      //   fatalError("Failed to parse the given IPA file with error: " + error);
      // }

      const bundleIndentifier = data.metadata.CFBundleIdentifier;
      const appName = data.metadata.CFBundleDisplayName;
      const version = data.metadata.CFBundleShortVersionString;
      const build = data.metadata.CFBundleVersion;

      if (bundleIndentifier === undefined || appName === undefined || version === undefined || build === undefined) {
        fatalError("The selected IPA is missing critical information.");
      }

      let folderName = Date.now();

      log(folderName + " " +  bundleIndentifier + " " + appName + " " + version + " " + build);

      let plist = plist.parse(fs.readFileSync('/Users/sids/Downloads/plistProxy/public/man_copy.plist', 'utf8'));
      plist.items[0].metadata["bundle-version"] = version;
      plist.items[0].metadata["bundle-identifier"] = bundleIndentifier;
      plist.items[0].metadata["title"] = appName;
      plist.items[0].assets[0].url = prefs.tunnelURL + 'b/' + folderName + '/manifest.plist';

      log(plist);
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