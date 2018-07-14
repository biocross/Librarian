#!/usr/bin/env node
/*jshint esversion: 6 */
const program = require('commander');
const ngrok = require('ngrok');
const chalk = require('chalk');
const preferences = require('node-persist');
const os = require('os');
const fs = require('fs-extra');
const plist = require('plist');
const qrcode = require('qrcode-terminal');
const log = console.log;
const home = os.homedir();
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
const { Extract } = require('app-metadata');
const { spawn } = require('child_process');
const { beginSetup, isSetup, shouldOverwriteConfiguration, purgeExistingInstallation, configurationKey } = require('./setup.js');
const { setWebConfiguration, addBuild } = require('./webBridge.js');
const storageOptions = {
  dir: `${home}/librarian/configuration`,
  stringify: JSON.stringify,
  parse: JSON.parse,
  encoding: 'utf8',
  forgiveParseErrors: true
};
const JEYLL_FRONT_MATTER_CHARACTER = "---\n---\n\n";

program
  .version(pkg.version)
  .description('Librarian is a local server for your iOS & Android builds, cause local is best!')

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

    await checkForUpdate(preferences);
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
    const webCommand = `JEKYLL_ENV=production bundle exec jekyll serve --port ${webPort}`;

    // Start the Jekyll Web Server
    const web = spawn(webCommand, {
      shell: true,
      cwd: webPath
    });

    web.stdout.on('data', (data) => {
      if (String(data).indexOf('Server address:') > -1) {
        log('Jekyll Server Started');
      }
      if (String(data).toLowerCase().indexOf('error') > -1) {
        log(String(data));
      }
    });

    web.on('exit', function (code, signal) {
      fatalError('The Jekyll Server has quit unexpectedly. Librarian is now exiting.');
    });

    if (prefs.assets_web) {
      const assetsPath = prefs.working_directory + 'asset_server';
      const assetsPort = prefs.assets_port;
      const webCommand = `JEKYLL_ENV=production bundle exec jekyll serve --port ${assetsPort}`;

      const asset_server = spawn(webCommand, {
        shell: true,
        cwd: assetsPath
      });

      asset_server.stdout.on('data', (data) => {
        if (String(data).indexOf('Server address:') > -1) {
          log('Assets Server Started');
        }
        if (String(data).toLowerCase().indexOf('error') > -1) {
          log(String(data));
        }
      });

      asset_server.on('exit', function (code, signal) {
        fatalError('The Assets Server has quit unexpectedly. Librarian is now exiting.');
      });
    }

    // Start the ngrok tunnel to the webserver
    let tunnelURL;

    try {
      const port = prefs.private_web ? prefs.assets_port : prefs.jekyll_port;
      let options = { addr: port, region: 'ap' };

      if (prefs.ngrok_token && prefs.ngrok_token !== "") {
        options.authtoken = prefs.ngrok_token;
      }

      if (prefs.private_web) {
        options.auth = `${prefs.web_username}:${prefs.web_password}`
      }

      tunnelURL = await ngrok.connect(options);

    } catch (error) {
      log(JSON.stringify(error));
      fatalError("\nFailed to start the ngrok tunnel.\nPlease make sure your ngRok token is valid.");
    }

    if (tunnelURL == undefined || tunnelURL === '') {
      fatalError('Failed to start the ngrok tunnel.')
    }

    prefs.currentURL = tunnelURL;
    await preferences.setItem(configurationKey, prefs);

    log('\nLibrarian is up at: ');
    log(chalk.yellow.bold(tunnelURL));

    let webConfiguration = {
      "webBaseURL": prefs.currentURL,
      "localBaseURL": prefs.local_ip
    };
    await setWebConfiguration(preferences, webConfiguration);

    log('\nScan the QR code to jump to Librarian\'s web interface:');
    qrcode.generate(tunnelURL);

    await checkForUpdate(preferences);
  });


program
  .command('submit <pathToFile>')
  .alias('a')
  .option('-b, --branch <branch>', 'The branch the build is from')
  .option('-n, --notes <notes>', 'Release Notes for the build')
  .option('-p, --public', 'Allow the build to be downloaded via the Internet using Librarian\'s HTTPS Tunnel')
  .description('Submit a build to librarian')
  .action(async (pathToFile, options) => {

    await preferences.init(storageOptions);

    if (!await isSetup(preferences)) {
      fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin')
    }

    const prefs = await preferences.getItem(configurationKey);

    if (prefs.currentURL === undefined) {
      fatalError("Please start the librarian server with " + chalk.yellow('librarian start') + " before trying to submit a build");
    }

    if (!fs.existsSync(pathToFile)) {
      fatalError('Couldn\'t find or access the file in the given path: ' + pathToFile);
    }

    const metadata = await Extract.run(pathToFile);
    const bundleIdentifier = metadata.uniqueIdentifier;
    const version = metadata.version;
    const build = metadata.buildVersion;
    const platform = metadata.deviceFamily.indexOf("Android") > -1 ? "android" : "ios";
    let buildInfo;

    if (platform == "ios") {
      const appName = metadata.displayName;

      if (bundleIdentifier === undefined || appName === undefined || version === undefined || build === undefined) {
        fatalError("The IPA is missing critical information.");
      }

      const buildTime = new Date();
      const folderName = buildTime.getTime();
      const templatePath = prefs.working_directory + 'web/templates/manifest.plist';
      const localManifestPath = prefs.working_directory + (prefs.assets_web ? 'asset_server' : 'web') + '/assets/b/' + folderName + '/local/manifest.plist';
      const webManifestPath = prefs.working_directory + 'web/assets/b/' + folderName + '/web/manifest.plist';
      const ipaPath = prefs.working_directory + 'web/assets/b/' + folderName + '/' + appName + '.ipa';

      try {
        fs.copySync(templatePath, localManifestPath);
        fs.copySync(pathToFile, ipaPath);
        const manifest = fs.readFileSync(localManifestPath, 'utf8');
        let editablePlist = plist.parse(manifest);
        editablePlist.items[0].metadata["bundle-version"] = version;
        editablePlist.items[0].metadata["bundle-identifier"] = bundleIdentifier;
        editablePlist.items[0].metadata["title"] = appName;
        editablePlist.items[0].assets[0].url = '{{site.data.config.localBaseURL}}/assets/b/' + folderName + '/' + appName + '.ipa';
        fs.writeFileSync(localManifestPath, JEYLL_FRONT_MATTER_CHARACTER + plist.build(editablePlist));
        if (options.public && !prefs.assets_web) {
          fs.copySync(templatePath, webManifestPath);
          editablePlist.items[0].assets[0].url = '{{site.data.config.webBaseURL}}/assets/b/' + folderName + '/' + appName + '.ipa';
          fs.writeFileSync(webManifestPath, JEYLL_FRONT_MATTER_CHARACTER + plist.build(editablePlist));
        }
      } catch (error) {
        fatalError(error);
      }

      buildInfo = {
        "version": version,
        "buildNumber": build,
        "bundle": bundleIdentifier,
        "folderPath": folderName,
        "date": buildTime.toISOString()
      };
    } else {
      const appName = metadata.originalFileName;
      const buildTime = new Date();
      const folderName = buildTime.getTime();
      const apkPath = prefs.working_directory + 'web/assets/b/' + folderName + '/' + appName;

      if (bundleIdentifier === undefined || appName === undefined || version === undefined || build === undefined) {
        fatalError("The APK is missing critical information.");
      }

      try {
        fs.copySync(pathToFile, apkPath);
      } catch (error) {
        fatalError(error);
      }

      buildInfo = {
        "version": version,
        "buildNumber": build,
        "bundle": bundleIdentifier,
        "folderPath": folderName,
        "fileName": appName,
        "date": buildTime.toISOString()
      };
    }

    buildInfo.notes = options.notes ? options.notes : "";
    buildInfo.branch = options.branch ? options.branch : "";
    buildInfo.public = options.public ? true : false;
    buildInfo.platform = platform;

    await addBuild(preferences, buildInfo);
    printHeader("Build Added Successfully!")
    await checkForUpdate(preferences);
    process.exit(0);
  });

const checkForUpdate = async (preferences) => {
  const notifier = updateNotifier({ pkg });
  notifier.notify();
  if (notifier.update) {
    const configuration = {
      "update": {
        "available": true,
        "notes": `An Update to Librarian is available! The new version is ${notifier.update.latest} (You have ${notifier.update.current})`
      }
    }
    await setWebConfiguration(preferences, configuration);
  } else {
    const configuration = {
      "update": {
        "available": false,
        "notes": ""
      }
    }
    await setWebConfiguration(preferences, configuration);
  }
}

const printHeader = (message) => {
  log('---------------------');
  log(chalk.black.bgCyan.bold(message));
  log('---------------------');
};

const fatalError = (message) => {
  log(chalk.red.bold('🚨 Error: ' + message + ' 🚨'));
  process.exit(1);
};

program.parse(process.argv);

process.on('SIGINT', async function () {
  log("\nExiting...")
  await preferences.init(storageOptions);
  const prefs = await preferences.getItem(configurationKey);
  prefs.currentURL = undefined;
  await preferences.setItem(configurationKey, prefs);
  printHeader("Thanks for using Librarian!");
  process.exit(0);
});