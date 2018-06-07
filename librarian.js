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
        await preferences.init(storageOptions);
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

    prefs.currentURL = tunnelURL;
    await preferences.setItem(configurationKey, prefs);

    log(chalk.blue("\nLibrarian is up at:\n"));
    log(chalk.yellow.bold(tunnelURL));
  });


program
  .command('submit <pathToIPA> [releaseNotes]')
  .alias('a')
  .description('Submit a build to librarian')
  .action(async (pathToIPA, releaseNotes) => {

    // Check if file is accessible.

    await preferences.init(storageOptions);

    if (!await isSetup(preferences)) {
      fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin')
    }

    const prefs = await preferences.getItem(configurationKey);

    if (prefs.currentURL === undefined) {
      fatalError("Please start the librarian server with " + chalk.yellow('librarian start') + " before trying to submit a build");
    }

    ipa(pathToIPA, function (error, data) {

      // if(error) {
      //   fatalError("Failed to parse the given IPA file with error: " + error);
      // }

      const bundleIndentifier = data.metadata.CFBundleIdentifier;
      const appName = data.metadata.CFBundleDisplayName;
      const version = data.metadata.CFBundleShortVersionString;
      const build = data.metadata.CFBundleVersion;

      if (bundleIndentifier === undefined || appName === undefined || version === undefined || build === undefined) {
        fatalError("The IPA is missing critical information.");
      }

      let folderName = Date.now();
      let templatePath = prefs.working_directory + 'web/templates/manifest.plist';
      let finalTemplatePath = prefs.working_directory + 'web/assets/b/' + folderName + '/manifest.plist';
      let ipaPath = prefs.working_directory + 'web/assets/b/' + folderName + '/' + appName + '.ipa';

      try {
        fs.copySync(templatePath, finalTemplatePath);
        fs.copySync(pathToIPA, ipaPath);
        let plistFile = fs.readFileSync(finalTemplatePath, 'utf8');

        if (plistFile === undefined) {
          fatalError("Failed to modify the plist file just created.");
        }

        let editablePlist = plist.parse(plistFile);
        editablePlist.items[0].metadata["bundle-version"] = version;
        editablePlist.items[0].metadata["bundle-identifier"] = bundleIndentifier;
        editablePlist.items[0].metadata["title"] = appName;
        editablePlist.items[0].assets[0].url = '{{site.data.config.webBaseURL}}/assets/b/' + folderName + '/' + appName + '.ipa';
        fs.writeFileSync(finalTemplatePath, "---\n---\n\n" + plist.build(editablePlist));
      } catch (error) {
        fatalError(error);
      }


    });

  });

const printHeader = (message) => {
  log('---------------------');
  log(chalk.black.bgCyan.bold(message));
  log('---------------------');
};

const fatalError = (message) => {
  log(chalk.white.bold('🚨🚨🚨 Error: ' + message + ' 🚨🚨🚨'));
  process.exit(1);
};

program.parse(process.argv);