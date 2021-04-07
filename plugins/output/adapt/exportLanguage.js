// external
const archiver = require('archiver');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');
const {exec} = require('child_process');

// internal
const configuration = require('../../../lib/configuration');
const Constants = require('../../../lib/outputmanager').Constants;
const logger = require('../../../lib/logger');
const usermanager = require('../../../lib/usermanager');

const FRAMEWORK_ROOT_DIR = path.join(configuration.tempDir, configuration.getConfig('masterTenantID'), Constants.Folders.Framework);
let COURSE_DIR;
let EXPORT_DIR;
let TENANT_ID;
let COURSE_ID;

function exportLanguage(pCourseId, request, response, next) {
  self = this;
  const currentUser = usermanager.getCurrentUser();

  TENANT_ID = currentUser.tenant._id;
  COURSE_ID = pCourseId;
  COURSE_DIR = path.join(FRAMEWORK_ROOT_DIR, Constants.Folders.AllCourses, TENANT_ID, COURSE_ID);
  EXPORT_DIR = path.join(configuration.tempDir, configuration.getConfig('masterTenantID'), Constants.Folders.Exports, currentUser._id);
  COURSE_LANGUAGE_DIR = path.join(EXPORT_DIR, "languagefiles");

  async.auto({
    ensureExportDir: ensureExportDir,
    generateLatestBuild: ['ensureExportDir', generateLatestBuild],
    copyFrameworkFiles: ['generateLatestBuild', copyFrameworkFiles],
    copyCourseFiles: ['generateLatestBuild', copyCourseFiles],
    generateLanguageFile: ['generateLatestBuild', generateLanguageFile],
  }, async.apply(zipExport, next));
}

// creates the EXPORT_DIR if it isn't there
function ensureExportDir(exportDirEnsured) {
  fs.ensureDir(EXPORT_DIR, exportDirEnsured);
}

function generateLatestBuild(results, courseBuilt) {
  self.publish(COURSE_ID, Constants.Modes.Export, null, null, courseBuilt);
}

/**
* Copy functions
*/

// copies relevant files in adapt_framework
function copyFrameworkFiles(results, filesCopied) {
  self.generateIncludesForCourse(COURSE_ID, function(error, includes) {
    if(error) {
      return filesCopied(error);
    }
    const includesRE = new RegExp(includes.map(i => `\/${i}(\/|$)`).join('|'));
    const excludesRE = new RegExp(/\.git\b|\.DS_Store|\/node_modules|\/courses\b|\/course\b(?!\.)|\/exports\b/);
    const pluginsRE = new RegExp('\/components\/|\/extensions\/|\/menu\/|\/theme\/');

    fs.copy(FRAMEWORK_ROOT_DIR, EXPORT_DIR, {
      filter: function(filePath) {
        const posixFilePath = filePath.replace(/\\/g, '/');
        const isIncluded = posixFilePath.search(includesRE) > -1;
        const isExcluded = posixFilePath.search(excludesRE) > -1;
        const isPlugin = posixFilePath.search(pluginsRE) > -1;
        // exclude any matches to excludesRE
        if(isExcluded) return false;
        // exclude any plugins not in includes
        else if(isPlugin) return isIncluded;
        // include everything else
        else return true;
      }
    }, filesCopied);
  });
}

// copies everything in the course folder
function copyCourseFiles(results, filesCopied) {
  const source = path.join(COURSE_DIR, Constants.Folders.Build, Constants.Folders.Course);
  const dest = path.join(EXPORT_DIR, Constants.Folders.Source, Constants.Folders.Course);
  fs.ensureDir(dest, function(error) {
    if (error) {
      return filesCopied(error);
    }
    fs.copy(source, dest, filesCopied);
  });
}

function generateLanguageFile(results, filesCopied) { 
    //after that install npm packages and run export language commands
  child = exec('npm i && grunt translate:export --format=csv', {cwd: path.join(EXPORT_DIR)}, (error, stdout, stderr) => {
    if (error) {
      return filesCopied(error);
    }
  });
  child.on('exit', filesCopied);
};

function zipExport(next, error, results) {
  const archive = archiver('zip');
  const output = fs.createWriteStream(EXPORT_DIR +  '.zip');
  archive.pipe(output);
  archive.glob('**/*', { cwd: path.join(COURSE_LANGUAGE_DIR) });
  // archive.glob('**/*', { cwd: path.join(EXPORT_DIR) });
  archive.finalize();
  output.on('close', async.apply(cleanUpExport, next));
  archive.on('error', async.apply(cleanUpExport, next));
  archive.on('warning', error => logger.log('warn', error));
}

// remove the EXPORT_DIR, if there is one
function cleanUpExport(next, exportError) {
  fs.remove(EXPORT_DIR, function(removeError) {
    const error = exportError || removeError;
    if(error) logger.log('error', error);
    next(error);
  });
}

module.exports = exportLanguage;