/*jshint esversion: 6 */
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
const { setWebConfiguration, addBuild } = require('./webBridge.js');
const log = console.log;
const home = os.homedir();
const storageOptions = {
  dir: `${home}/librarian/configuration`,
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  forgiveParseErrors: true
};
const JEYLL_FRONT_MATTER_CHARACTER = "---\n---\n\n";

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
    const webCommand = `JEKYLL_ENV=production jekyll serve --port ${webPort}`;

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

    let webConfiguration = {
      "webBaseURL": prefs.currentURL,
      "localBaseURL": prefs.local_ip
    };
    await setWebConfiguration(preferences, webConfiguration);
  });


program
  .command('submit <pathToIPA> [branch] [releaseNotes]')
  .alias('a')
  .description('Submit a build to librarian')
  .action(async (pathToIPA, branch, releaseNotes) => {

    // Check if file is accessible.

    await preferences.init(storageOptions);

    if (!await isSetup(preferences)) {
      fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin')
    }

    const prefs = await preferences.getItem(configurationKey);

    if (prefs.currentURL === undefined) {
      fatalError("Please start the librarian server with " + chalk.yellow('librarian start') + " before trying to submit a build");
    }

    ipa(pathToIPA, async function (error, data) {

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

      const buildTime = new Date();
      const folderName = buildTime.getTime();
      const templatePath = prefs.working_directory + 'web/templates/manifest.plist';
      const localManifestPath = prefs.working_directory + 'web/assets/b/' + folderName + '/local/manifest.plist';
      const webManifestPath = prefs.working_directory + 'web/assets/b/' + folderName + '/web/manifest.plist';
      const ipaPath = prefs.working_directory + 'web/assets/b/' + folderName + '/' + appName + '.ipa';

      try {
        fs.copySync(templatePath, localManifestPath);
        fs.copySync(templatePath, webManifestPath);
        fs.copySync(pathToIPA, ipaPath);

        let manifest = fs.readFileSync(localManifestPath, 'utf8');
        let editablePlist = plist.parse(manifest);
        editablePlist.items[0].metadata["bundle-version"] = version;
        editablePlist.items[0].metadata["bundle-identifier"] = bundleIndentifier;
        editablePlist.items[0].metadata["title"] = appName;
        editablePlist.items[0].assets[0].url = '{{site.data.config.localBaseURL}}/assets/b/' + folderName + '/' + appName + '.ipa';
        fs.writeFileSync(localManifestPath, JEYLL_FRONT_MATTER_CHARACTER + plist.build(editablePlist));
        editablePlist.items[0].assets[0].url = '{{site.data.config.webBaseURL}}/assets/b/' + folderName + '/' + appName + '.ipa';
        fs.writeFileSync(webManifestPath, JEYLL_FRONT_MATTER_CHARACTER + plist.build(editablePlist));
      } catch (error) {
        fatalError(error);
      }

      let buildInfo = {
        "version": version,
        "buildNumber": bundleIndentifier,
        "folderPath": folderName,
        "date": buildTime.toISOString()
      };

      if (releaseNotes) {
        buildInfo.releaseNotes = releaseNotes;
      }

      if (branch) {
        buildInfo.branch = branch;
      }

      await addBuild(preferences, buildInfo);
      
      process.exit(0);
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