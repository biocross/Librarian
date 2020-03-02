/*jshint esversion: 9 */
const { prompt } = require('inquirer');
const chalk = require('chalk');
const os = require('os');
const log = console.log;
const fs = require('fs-extra');
const git = require('simple-git/promise');
const home = os.homedir();
const { spawn } = require('child_process');
const { sendEvent, LibrarianEvents } = require('./analytics.js');

const configurationKey = 'librarian_config';
const librarianWebRepo = 'https://github.com/biocross/Librarian-Web.git';

const existingConfigurationConfirmation = [
  {
    type: 'confirm',
    name: 'existing_configuration',
    message: 'Librarian has already been configured on this system. Do you want to reconfigure?',
    default: false
  }
];

const setupQuestions = [
  {
    type: 'input',
    name: 'working_directory',
    message: 'Where should Librarian store builds & it\'s website? Press enter for default:',
    default: `${home}/librarian/`
  },
  {
    type: 'input',
    name: 'local_ip',
    message: 'What is the local IP Librarian Website should be running at? (Enter for autodetected default)',
    default: os.networkInterfaces().en0.find(elm => elm.family === 'IPv4').address
  },
  {
    type: 'confirm',
    name: 'assets_web',
    message: 'Should Librarian\'s web interface be accessible over the internet?'
  },
  {
    type: 'input',
    name: 'jekyll_port',
    message: 'Which port should the Librarian Website run at? (Default: 5000)',
    default: '5000'
  },
  {
    type: 'input',
    name: 'assets_port',
    message: 'Which port should the Librarian Assets Server run at? (Default: 5001)',
    default: '5001',
    when: (answers) => { return answers.assets_web === false; }
  },
  {
    type: 'confirm',
    name: 'existing_token',
    message: 'Do you want to you use a custom ngrok token? [This is required if you want to password protect Librarian\'s web interface]\n\n Press n if you\'re unsure (Know More: github.com/biocross/Librarian/wiki/Custom-ngrok-Tokens) ',
    default: false
  },
  {
    type: 'input',
    name: 'ngrok_token',
    message: 'Please enter your ngRok token:',
    when: (answers) => { return answers.existing_token === true; }
  },
  {
    type: 'confirm',
    name: 'private_web',
    message: 'Do you want Librarian\'s Website to be password protected (when accessed over the internet)?',
    default: false,
    when: (answers) => { return answers.existing_token === true; }
  },
  {
    type: 'input',
    name: 'web_username',
    message: 'Please enter the username for the web interface:',
    when: (answers) => { return answers.existing_token === true && answers.private_web === true; }
  },
  {
    type: 'input',
    name: 'web_password',
    message: 'Please enter the password for the web interface:',
    when: (answers) => { return answers.existing_token === true && answers.private_web === true; }
  },
  {
    type: 'confirm',
    name: 'enable_s3',
    message: 'Do you want to enable s3 storage?',
    default: false,
  },
  {
    type: 'input',
    name: 's3_region',
    message: 'S3 REGION:',
    default: '',
    when: (answers) => { return answers.enable_s3 === true; }
  },
  {
    type: 'input',
    name: 's3_key',
    message: 'S3 SECRET ID:',
    default: '',
    when: (answers) => { return answers.enable_s3 === true; }
  },
  {
    type: 'input',
    name: 's3_secret',
    message: 'S3 SECRET KEY:',
    default: '',
    when: (answers) => { return answers.enable_s3 === true; }
  },
  {
    type: 'input',
    name: 's3_bucket',
    message: 'S3 BUCKET:',
    default: '',
    when: (answers) => { return answers.enable_s3 === true; }
  },

];

const beginSetup = async (preferences) => {
  sendEvent(LibrarianEvents.SetupStarted);
  const configuration = await prompt(setupQuestions);

  if (configuration.local_ip.indexOf('http') === -1) {
    configuration.local_ip = 'http://' + configuration.local_ip + ':' + configuration.jekyll_port;
    configuration.assets_web = !configuration.assets_web;
  }

  console.log(chalk.green('\nUsing Configuration: \n'));
  console.log(configuration);

  console.log(chalk.green('\nCloning the Librarian WebServer...'));
  const localPath = `${configuration.working_directory}/web`;
  const assetServerPath = `${configuration.working_directory}/asset_server`;
  await git(configuration.working_directory).clone(librarianWebRepo, localPath, ['--depth', 1]);
  console.log(chalk.green('Cloning Complete!'));

  if (configuration.assets_web) {
    console.log(chalk.green('\nCloning the Librarian Assets Server...'));
    await git(configuration.working_directory).clone(librarianWebRepo, assetServerPath, ['--depth', 1, '-b', 'asset_server']);
    console.log(chalk.green('Cloning Complete!'));
  }

  console.log(chalk.green('\nInstalling required ruby gems...'));
  const bundler = spawn('bundle install --path ./localgems', {
    shell: true,
    cwd: localPath
  });

  bundler.stdout.on('data', (data) => {
    if (String(data).indexOf('Bundle complete') > -1) {
      if (configuration.assets_web) {
        const assets_bundler = spawn('bundle install --path ./localgems', {
          shell: true,
          cwd: assetServerPath
        });
        assets_bundler.stdout.on('data', (data) => {
          if (String(data).indexOf('Bundle complete') > -1) {
            log(chalk.green('Installation Complete!'));
            log(chalk.bold('\nAll set! Run Librarian using: ') + chalk.yellow.bold('librarian start'));
          }
          if (String(data).toLowerCase().indexOf('error') > -1) {
            sendEvent(LibrarianEvents.SetupError);
            log(String(data));
          }
        });
      } else {
        sendEvent(LibrarianEvents.SetupComplete);
        log(chalk.green('Installation Complete!'));
        log(chalk.bold('\nAll set! Run Librarian using: ') + chalk.yellow.bold('librarian start'));
      }
    }
    if (String(data).toLowerCase().indexOf('error') > -1) {
      log(String(data));
    }
  });

  bundler.on('exit', function (code, signal) {
    if(code != 0) { sendEvent(LibrarianEvents.SetupError); }
    if (code == 127) {
      fatalError('Librarian requires bundler to work. Please install bundler by running ' + chalk.bold.yellow('gem install bundler') + ' and run librarian setup again.');
    }
  });

  await preferences.setItem(configurationKey, configuration);
};

const purgeExistingInstallation = async (preferences) => {
  const prefs = await preferences.getItem(configurationKey);
  console.log("Purging the Existing Installation at: " + prefs.working_directory);
  await fs.emptyDir(prefs.working_directory);
  await fs.removeSync(prefs.working_directory);
  console.log("Purge Complete!\n");
};

const isSetup = async (preferences) => {
  const isSetup = await preferences.getItem(configurationKey);
  return isSetup !== undefined;
};

const shouldOverwriteConfiguration = async () => {
  const answer = await prompt(existingConfigurationConfirmation);
  return answer.existing_configuration == true;
};

const fatalError = (message) => {
  log(chalk.red.bold('🚨 Error: ' + message + ' 🚨'));
  process.exit(1);
};

module.exports = { beginSetup, isSetup, shouldOverwriteConfiguration, purgeExistingInstallation, configurationKey };