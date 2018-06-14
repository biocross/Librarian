const { prompt } = require('inquirer');
const chalk = require('chalk');
const os = require('os');
const fs = require('fs-extra');
const git = require('simple-git');
const home = os.homedir();
const configurationKey = 'librarian_config';
const librarianWebRepo = 'https://github.com/biocross/Librarian-Template.git';

const existingConfigurationConfirmation = [
  {
    type: 'confirm',
    name: 'existing_configuration',
    message: 'Librarian has already been configured on this system. Do you want to reconfigure?'
  }
];

const setupQuestions = [
  {
    type: 'confirm',
    name: 'existing_token',
    message: 'Do you already have an ngRok token? Press n if you\'re unsure',
    default: false
  },
  {
    type: 'input',
    name: 'ngrok_token',
    message: 'Please enter your ngRok token:',
    when: (answers) => { return answers.existing_token === true; }
  },
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
  }
];

const beginSetup = async (preferences) => {
  const configuration = await prompt(setupQuestions);

  if(configuration.local_ip.indexOf('http') == -1) {
    configuration.local_ip = 'http://' + configuration.local_ip;
  }
  
  console.log(chalk.green('Using Configuration: '));
  console.log(configuration);

  console.log(chalk.green('Cloning the Librarian WebServer: '));
  const localPath = `${configuration.working_directory}/web`
  const cloned = await git(configuration.working_directory).clone(librarianWebRepo, localPath);
  console.log(chalk.green('Cloning Complete!'));

  await preferences.setItem(configurationKey, configuration);
}

const purgeExistingInstallation = async (preferences) => {
  const prefs = await preferences.getItem(configurationKey)
  console.log("Purging the Exsiting Installation at: " + prefs.working_directory);
  await fs.emptyDir(prefs.working_directory);
  console.log("Purge Complete!");
}

const isSetup = async (preferences) => {
  const isSetup = await preferences.getItem(configurationKey)
  return isSetup !== undefined;
};

const shouldOverwriteConfiguration = async () => {
  const answer = await prompt(existingConfigurationConfirmation);
  return answer.existing_configuration == true;
};

module.exports = { beginSetup, isSetup, shouldOverwriteConfiguration, purgeExistingInstallation, configurationKey };