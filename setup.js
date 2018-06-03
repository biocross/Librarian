const { prompt } = require('inquirer');
const chalk = require('chalk');
const os = require('os');

const home = os.homedir();
const configurationKey = 'librarian_config';

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
    message: 'Do you already have an ngRok token? Press n if you\'re unsure'
  },
  {
    type: 'input',
    name: 'ngrok_token',
    message: 'Please enter your ngRok token:',
    when: (answers) => { return answers.existing_token === true;  }
  },
  {
    type: 'input',
    name: 'working_directory',
    message: 'Where should Librarian store builds & it\'s website? Press enter for default:',
    default: `${home}/librarian/`
  },
  {
    type: 'input',
    name: 'jekyll_port',
    message: 'Which port should the Website Run at? (Default: 5000)',
    default: '5000'
  },
];

const beginSetup = async (storage) => {
  const configuration = await prompt(setupQuestions);
  await storage.setItem(configurationKey, configuration);
  console.log(chalk.green('Using Configuration: '));
  console.log(await storage.getItem(configurationKey));

  console.log(chalk.green('Cloning the Librarian WebServer: '));
  
}

const isSetup = async (storage) => {
  const isSetup = await storage.getItem(configurationKey)
  return isSetup !== undefined;
};

const shouldOverwriteConfiguration = async (storage) => {
  const answer = await prompt(existingConfigurationConfirmation);
  return answer.existing_configuration == true;
};

// Export all methods
module.exports = { beginSetup, isSetup, shouldOverwriteConfiguration, configurationKey };