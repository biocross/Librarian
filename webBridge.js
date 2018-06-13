const { prompt } = require('inquirer');
const chalk = require('chalk');
const os = require('os');
const fs = require('fs-extra');
const home = os.homedir();
const { configurationKey } = require('./setup.js');
const webConfigurationPath = 'web/_data/config.json';
const buildsPath = 'web/_data/builds.json';

const setWebConfiguration = async (preferences, configuration) => {
    try {
        const prefs = await preferences.getItem(configurationKey);
        const webConfigPath = prefs.working_directory + webConfigurationPath;
        const webConfiguration = JSON.parse(fs.readFileSync(webConfigPath, 'utf8'));
        Object.assign(webConfiguration, configuration);
        console.log(webConfiguration);
        fs.writeFileSync(webConfigPath, JSON.stringify(webConfiguration));
    } catch (error) {
        console.log(error);
    }
}

const addBuild = async (preferences, build) => {
    try {
        const prefs = await preferences.getItem(configurationKey);
        const buildsPath = prefs.working_directory + buildsPath;
        const builds = JSON.parse(fs.readFileSync(buildsPath, 'utf8'));
        builds.push(build);
        console.log(builds);
        fs.writeFileSync(buildsPath, JSON.stringify(builds));
    } catch (error) {
        console.log(error);
    }
}

module.exports = { setWebConfiguration, addBuild };