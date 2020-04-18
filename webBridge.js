/*jshint esversion: 8 */
const { configurationKey } = require('./setup.js');
const fs = require('fs-extra');
const yaml = require('js-yaml');
const webConfigurationPath = 'web/_data/config.json';
const assetServerConfigurationPath = 'asset_server/_data/config.json';
const buildsDataPath = 'web/_builds/';

const setWebConfiguration = async (preferences, configuration) => {
    try {
        const prefs = await preferences.getItem(configurationKey);
        const webConfigPath = prefs.working_directory + webConfigurationPath;
        const webConfiguration = JSON.parse(fs.readFileSync(webConfigPath, 'utf8'));
        Object.assign(webConfiguration, configuration);
        fs.writeFileSync(webConfigPath, JSON.stringify(webConfiguration));
        if (prefs.assets_web) {
            const assetServerConfigPath = prefs.working_directory + assetServerConfigurationPath;
            fs.copySync(webConfigPath, assetServerConfigPath);
        }
    } catch (error) {
        console.log(error);
    }
};

const addBuild = async (preferences, build) => {
    try {
        const prefs = await preferences.getItem(configurationKey);
        const webConfigPath = prefs.working_directory + webConfigurationPath;
        const webConfiguration = JSON.parse(fs.readFileSync(webConfigPath, 'utf8'));
        const buildPath = prefs.working_directory + buildsDataPath + build.folderPath + '.md';
        const contents = `---\nlayout: build\n${yaml.safeDump(build)}---\n`;
        fs.writeFileSync(buildPath, contents);

        if (!webConfiguration.initialized) {
            await setWebConfiguration(preferences, { "initialized": true });
        }
    } catch (error) {
        console.log(error);
    }
};

module.exports = { setWebConfiguration, addBuild };