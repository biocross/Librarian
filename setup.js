/*jshint esversion: 6 */
const { prompt } = require('inquirer');
const chalk = require('chalk');
const os = require('os');
const log = console.log;
const fs = require('fs-extra');
const git = require('simple-git/promise');
const home = os.homedir();
const { spawn } = require('child_process');

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
    default: os.networkInterfaces().en0.find(elm => elm.family == 'IPv4').address
  },
  {
    type: 'input',
    name: 'jekyll_port',
    message: 'Which port should the Librarian Website run at? (Default: 5000)',
    default: '5000'
  },
  {
    type: 'confirm',
    name: 'existing_token',
    message: 'Do you want to you use a custom ngrok token? Press n if you\'re unsure (Why: github.com/biocross/Librarian/wiki/Custom-ngrok-Tokens)',
    default: false
  },
  {
    type: 'input',
    name: 'ngrok_token',
    message: 'Please enter your ngRok token:',
    when: (answers) => { return answers.existing_token === true; }
  }
];

const beginSetup = async (preferences) => {
  const configuration = await prompt(setupQuestions);

  if (configuration.local_ip.indexOf('http') == -1) {
    configuration.local_ip = 'http://' + configuration.local_ip + ':' + configuration.jekyll_port;
  }

  console.log(chalk.green('\nUsing Configuration: \n'));
  console.log(configuration);

  console.log(chalk.green('\nCloning the Librarian WebServer...'));
  const localPath = `${configuration.working_directory}/web`;
  await git(configuration.working_directory).clone(librarianWebRepo, localPath, ['--depth', 1]);
  console.log(chalk.green('Cloning Complete!'));

  console.log(chalk.green('\nInstalling required ruby gems...'));
  const bundler = spawn('bundle install --path ./localgems', {
    shell: true,
    cwd: localPath
  });

  bundler.stdout.on('data', (data) => {
    if (String(data).indexOf('Bundle complete') > -1) {
      log(chalk.green('Installation Complete!'));
      log(chalk.bold('\nAll set! Run Librarian using: ') + chalk.yellow.bold('librarian start'));
    }
    if (String(data).toLowerCase().indexOf('error') > -1) {
      log(String(data));
    }
  });

  bundler.on('exit', function (code, signal) {
    if (code == 127) {
      fatalError('Librarian requires bundler to work. Please install bundler by running ' + chalk.bold.yellow('gem install bundler') + ' and run librarian setup again.')
    }
  });

  await preferences.setItem(configurationKey, configuration);
}

const purgeExistingInstallation = async (preferences) => {
  const prefs = await preferences.getItem(configurationKey);
  console.log("Purging the Existing Installation at: " + prefs.working_directory);
  await fs.emptyDir(prefs.working_directory);
  console.log("Purge Complete!\n");
}

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