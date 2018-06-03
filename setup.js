const { prompt } = require('inquirer');
const storage = require('node-persist');

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
    default: '~/librarian/'
  },
  {
    type: 'input',
    name: 'jekyll_port',
    message: 'Which port should the Website Run at? (Default: 5000)',
    default: '5000'
  },
];

const beginSetup = async () => {
  const answers = await prompt(setupQuestions);
  
  await storage.init( /* options ... */ );
  await storage.setItem('name','yourname')
  console.log(await storage.getItem('name'));

}

const isSetup = () => {
  console("Is Setup?");
};

// Export all methods
module.exports = { beginSetup, isSetup };