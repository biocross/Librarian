/*jshint esversion: 6 */
const { prompt } = require('inquirer');
const chalk = require('chalk');
const os = require('os');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const { configurationKey } = require('./setup.js');
const webConfigurationPath = 'web/_data/config.json';
const buildsDataPath = 'web/_builds/';

const setWebConfiguration = async (preferences, configuration) => {
    try {
        const prefs = await preferences.getItem(configurationKey);
        const webConfigPath = prefs.working_directory + webConfigurationPath;
        const webConfiguration = JSON.parse(fs.readFileSync(webConfigPath, 'utf8'));
        Object.assign(webConfiguration, configuration);
        fs.writeFileSync(webConfigPath, JSON.stringify(webConfiguration));
    } catch (error) {
        console.log(error);
    }
}

const addBuild = async (preferences, build) => {
    try {
        const prefs = await preferences.getItem(configurationKey);
        const webConfigPath = prefs.working_directory + webConfigurationPath;
        const webConfiguration = JSON.parse(fs.readFileSync(webConfigPath, 'utf8'));
        const buildPath = prefs.working_directory + buildsDataPath + build.folderPath + '.md';

        if (!webConfiguration.initialized) {
            await setWebConfiguration(preferences, { "initialized": true })
        }
        const contents = `---\n${yaml.safeDump(build)}---\n`
        fs.writeFileSync(buildPath, contents);
    } catch (error) {
        console.log(error);
    }
}

module.exports = { setWebConfiguration, addBuild };