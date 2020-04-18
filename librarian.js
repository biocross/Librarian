#!/usr/bin/env node
/*jshint esversion: 8 */
const program = require('commander');
const ngrok = require('ngrok');
const chalk = require('chalk');
const path = require('path');
const preferences = require('node-persist');
const os = require('os');
const fs = require('fs-extra');
const plist = require('plist');
const qrcode = require('qrcode-terminal');
const AWS = require('aws-sdk');
const log = console.log;
const home = os.homedir();
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
const gitP = require('simple-git/promise');
const git = gitP();
const { Extract } = require('app-metadata');
const { spawn } = require('child_process');
const { isEmpty } = require('lodash');
const { sendEvent, LibrarianEvents } = require('./analytics.js');
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
const noUpdateConfiguration = {
    "update": {
        "available": false,
        "notes": ""
    }
};
// AWS.config.update({region: 'REGION'});


program
    .version(pkg.version)
    .description('Librarian is a local server for your iOS & Android builds, cause local is best!');

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
            fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin');
        }

        sendEvent(LibrarianEvents.ServerStarted);

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

        web.stderr.on('data', (data) => {
            log('Error:');
            log(String(data));
        });

        web.on('exit', function (code, signal) {
            if(code !== 0) { sendEvent(LibrarianEvents.ServerError); }
            if(code === 1) { fatalError("Do you have another instance of Librarian running?"); }
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

            asset_server.stderr.on('data', (data) => {
                log('Error:');
                log(String(data));
            });

            asset_server.on('exit', function (code, signal) {
                if(code === 1) { fatalError("Do you have another instance of Librarian running?"); }
                if(code !== 0) { sendEvent(LibrarianEvents.ServerError); }
                fatalError('The Assets Server has quit unexpectedly. Librarian is now exiting.');
            });
        }

        // Start the ngrok tunnel to the webserver
        let tunnelURL;

        try {
            const port = prefs.assets_web ? prefs.assets_port : prefs.jekyll_port;
            let options = { addr: port, region: 'ap' };

            if (prefs.ngrok_token && prefs.ngrok_token !== "") {
                options.authtoken = prefs.ngrok_token;
            }

            if (prefs.private_web) {
                options.auth = `${prefs.web_username}:${prefs.web_password}`;
            }

            tunnelURL = await ngrok.connect(options);

        } catch (error) {
            sendEvent(LibrarianEvents.ServerError);
            log(JSON.stringify(error));
            fatalError("\nFailed to start the ngrok tunnel.\nPlease make sure your ngRok token is valid.");
        }

        if (tunnelURL === undefined || tunnelURL === '') {
            fatalError('Failed to start the ngrok tunnel.');
        }

        prefs.currentURL = tunnelURL;

        const currentIP = os.networkInterfaces().en0.find(elm => elm.family === 'IPv4').address;
        // const currentIP = "127.0.0.1";// os.networkInterfaces().en0.find(elm => elm.family === 'IPv4').address;
        if (currentIP !== prefs.local_ip) {
            prefs.local_ip = 'http://' + currentIP + ':' + prefs.jekyll_port;
        }

        await preferences.setItem(configurationKey, prefs);

        let webConfiguration = {
            "webBaseURL": prefs.currentURL,
            "localBaseURL": prefs.local_ip
        };
        await setWebConfiguration(preferences, webConfiguration);

        const webURL = prefs.assets_web ? prefs.local_ip : tunnelURL;

        log('\nLibrarian is up at: ');
        log(chalk.yellow.bold(webURL));

        log('\nScan the QR code to jump to Librarian\'s web interface:');
        qrcode.generate(webURL);

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

        sendEvent(LibrarianEvents.BuildSubmitted);

        await preferences.init(storageOptions);

        if (!await isSetup(preferences)) {
            fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin');
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

        if (platform === "ios") {
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
                editablePlist.items[0].metadata.title = appName;
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
        buildInfo.public = !!options.public;
        buildInfo.platform = platform;

        await addBuild(preferences, buildInfo);
        printHeader("Build Added Successfully!");
        await checkForUpdate(preferences);
        process.exit(0);
    });

/**
 * prerequisites :
 *  1. Aws secret key and secret id with s3 (iam read and write access.)
 *  2. Either self provided s3 bucket name.( or the iam access should have permission to create bucket. --> not doing this for now.)
 *  3. We can then provide a flag for delete file if required.
 */

const uploadFile = async (s3Client, filePath, bucketName) => {
    try{
        // Read content from the file
        const fileContent = fs.readFileSync(filePath);
        let fileName = path.basename(filePath);

        // Setting up S3 upload parameters
        const params = {
            Bucket: bucketName,
            Key: fileName, // File name you want to save as in S3
            Body: fileContent,
            Acl : "public-read"
        };

        // Uploading files to the bucket
        let data = await s3Client.upload(params).promise();
        log(`File uploaded successfully. ${data.Location}`);
        return data.Location;
    } catch (e) {
        throw e;
    }
};

program
    .command('submitS3 <pathToFile>')
    .alias('a')
    .option('-b, --branch <branch>', 'The branch the build is from')
    .option('-n, --notes <notes>', 'Release Notes for the build')
    .option('-d, --delete_apk <delete_apk>', 'Release Notes for the build')
    .option('-p, --public', 'Allow the build to be downloaded via the Internet using Librarian\'s HTTPS Tunnel')
    .description('Submit a build to librarian')
    .action(async (pathToFile, options) => {

        sendEvent(LibrarianEvents.BuildSubmitted);

        await preferences.init(storageOptions);

        if (!await isSetup(preferences)) {
            fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin');
        }

        const prefs = await preferences.getItem(configurationKey);

        if (prefs.currentURL === undefined) {
            fatalError("Please start the librarian server with " + chalk.yellow('librarian start') + " before trying to submit a build");
        }

        if (!fs.existsSync(pathToFile)) {
            fatalError('Couldn\'t find or access the file in the given path: ' + pathToFile);
        }

        if (isEmpty(prefs.s3_key) || isEmpty(prefs.s3_bucket) || isEmpty(prefs.s3_secret)) {
            fatalError("Please setup librarian for s3 properly before using this command");
        }

        // s3 upload.
        const s3 = new AWS.S3({region: prefs.s3_region, accessKeyId: prefs.s3_key, secretAccessKey: prefs.s3_secret, apiVersion: '2006-03-01'});
        let fileUploadResult;
        try{fileUploadResult = await uploadFile(s3, pathToFile, prefs.s3_bucket);}
        catch (e) {log("fatal error in uploading the file to s3");fatalError(e);}

        const metadata = await Extract.run(pathToFile);
        const bundleIdentifier = metadata.uniqueIdentifier;
        const version = metadata.version;
        const build = metadata.buildVersion;
        const platform = metadata.deviceFamily.indexOf("Android") > -1 ? "android" : "ios";
        let buildInfo;

        if (platform === "ios") {
            const appName = metadata.displayName;

            if (bundleIdentifier === undefined || appName === undefined || version === undefined || build === undefined) {
                fatalError("The IPA is missing critical information.");
            }

            const buildTime = new Date();
            const folderName = buildTime.getTime();
            const templatePath = prefs.working_directory + 'web/templates/manifest.plist';
            const localManifestPath = prefs.working_directory + (prefs.assets_web ? 'asset_server' : 'web') + '/assets/b/' + folderName + '/local/manifest.plist';
            const webManifestPath = prefs.working_directory + 'web/assets/b/' + folderName + '/web/manifest.plist';

            try {
                fs.copySync(templatePath, localManifestPath);
                const manifest = fs.readFileSync(localManifestPath, 'utf8');
                let editablePlist = plist.parse(manifest);
                editablePlist.items[0].metadata["bundle-version"] = version;
                editablePlist.items[0].metadata["bundle-identifier"] = bundleIdentifier;
                editablePlist.items[0].metadata.title = appName;
                editablePlist.items[0].assets[0].url = fileUploadResult;
                fs.writeFileSync(localManifestPath, JEYLL_FRONT_MATTER_CHARACTER + plist.build(editablePlist));
                if (options.public && !prefs.assets_web) {
                    fs.copySync(templatePath, webManifestPath);
                    editablePlist.items[0].assets[0].url = fileUploadResult;
                    fs.writeFileSync(webManifestPath, JEYLL_FRONT_MATTER_CHARACTER + plist.build(editablePlist));
                }
            } catch (error) {
                fatalError(error);
            }
            // s3_url --> new variable for pointing the resource path available in s3.
            buildInfo = {
                "version": version,
                "buildNumber": build,
                "bundle": bundleIdentifier,
                "folderPath": folderName,
                "s3_url":fileUploadResult,
                "date": buildTime.toISOString()
            };
        } else {
            const appName = metadata.originalFileName;
            const buildTime = new Date();
            const folderName = buildTime.getTime();
            const apkPath = fileUploadResult;

            if (bundleIdentifier === undefined || appName === undefined || version === undefined || build === undefined) {
                fatalError("The APK is missing critical information.");
            }

            // s3_url --> new variable for pointing the resource path available in s3.
            buildInfo = {
                "version": version,
                "buildNumber": build,
                "bundle": bundleIdentifier,
                "folderPath": folderName,
                "fileName": appName,
                "s3_url":fileUploadResult,
                "date": buildTime.toISOString()
            };
        }

        buildInfo.notes = options.notes ? options.notes : "";
        buildInfo.branch = options.branch ? options.branch : "";
        buildInfo.public = !!options.public;
        buildInfo.platform = platform;
        await addBuild(preferences, buildInfo);
        printHeader("Build Added Successfully!");
        await checkForUpdate(preferences);
        if(options.delete_apk.toString() === "1") {fs.unlink(pathToFile, ()=>{})}
        process.exit(0);
    });

program
    .command('update')
    .description('Update Librarian to be the latest and greatest!')
    .action(async () => {
        printHeader('Updating Librarian...');
        await preferences.init(storageOptions);

        if (!await isSetup(preferences)) {
            fatalError('Librarian has not been setup yet! Run ' + chalk.yellow('librarian setup') + ' to begin');
        }

        const configuration = await preferences.getItem(configurationKey);

        const localPath = `${configuration.working_directory}web`;
        const assetServerPath = `${configuration.working_directory}/asset_server`;

        try {
            await updateServer(localPath);
            if (configuration.assets_web) {
                await updateServer(assetServerPath);
            }

            await setWebConfiguration(preferences, noUpdateConfiguration);

            log(chalk.bold("Update Complete!"));
            log(chalk.bold('\nAll set! Run Librarian using: ') + chalk.yellow.bold('librarian start'));
        } catch (error) {
            log(error);
            log("Failed to update");
        }
    });

const updateServer = async (path) => {
    return new Promise(async (resolve, reject) => {
        git.cwd(path).then(() => git.add('./*')).then(() => git.commit(`Snapshot before Librarian Update at ${new Date()}`)).then(() => {
            console.log(`Updating Librarian Web Server at ${path}...`);
            git.pull((err, update) => {
                if (update && update.summary.changes) {
                    console.log(update.summary.changes);
                }
            }).then(async () => {
                try {
                    console.log(`Updating bundle for ${path}`);
                    await installBundle(path);
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            });
        });
    });
};

const installBundle = async (path) => {
    return new Promise(async (resolve, reject) => {
        const bundler = spawn('bundle install --path ./localgems', {
            shell: true,
            cwd: path
        });

        bundler.stdout.on('data', (data) => {
            if (String(data).toLowerCase().indexOf('error') > -1) {
                log(String(data));
            }
        });

        bundler.on('exit', function (code, signal) {
            if (code === 0) {
                log(chalk.green('Bundle Installation Complete!'));
                resolve(true);
                return;
            }

            if (code == 127) {
                console.log('Librarian requires bundler to work. Please install bundler by running ' + chalk.bold.yellow('gem install bundler') + ' and run librarian setup again.');
                reject(false);
            } else {
                reject(false);
            }
        });
    });
};

const checkForUpdate = async (preferences) => {
    const notifier = updateNotifier({ pkg });
    notifier.notify();
    if (notifier.update) {
        const configuration = {
            "update": {
                "available": true,
                "notes": `An Update to Librarian is available! The new version is ${notifier.update.latest} (You have ${notifier.update.current})`
            }
        };
        await setWebConfiguration(preferences, configuration);
    } else {
        await setWebConfiguration(preferences, noUpdateConfiguration);
    }
};

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
    log("\nExiting...");
    await preferences.init(storageOptions);
    const prefs = await preferences.getItem(configurationKey);
    prefs.currentURL = undefined;
    await preferences.setItem(configurationKey, prefs);
    printHeader("Thanks for using Librarian!");
    process.exit(0);
});