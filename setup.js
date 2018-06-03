const { prompt } = require('inquirer');

const setup = [
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
    default: '~/librarian/'
  }
];

const beginSetup = () => {
  prompt(setup).then(answers => console.log(answers));
};

const isSetup = () => {
  console("Is Setup?");
};

// Export all methods
module.exports = { beginSetup, isSetup };