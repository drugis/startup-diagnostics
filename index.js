'use strict';
const async = require('async');
const _ = require('lodash');

module.exports = function(db, logger, appName) {
  const startupCheckService = require('./startupCheckService')(db, logger);

  function runStartupDiagnostics(callback) {
    var checks = startupCheckService.getChecks(appName);
    async.parallel(checks, function(error, results) {
      if (error) {
        results.push('Could not execute diagnostics, unknown error: ' + error);
      }
      asyncCallback(callback, results);
    });
  }

  function asyncCallback(callback, results) {
    const errors = createErrorArray(results);
    logErrors(errors);
    if (errors.length) {
      callback(createErrorBody(errors));
    } else {
      callback();
    }
  }

  function logErrors(errors) {
    _.forEach(errors, function(message) {
      logger.error(message);
    });
  }

  function createErrorArray(results) {
    return _(results)
      .flatten()
      .compact()
      .value();
  }

  function createErrorBody(errors) {
    var errorPageHead = '<h3>' + appName + ' could not be started. The following errors occured:</h3>';
    return _.reduce(errors, function(accum, error) {
      return accum.concat('<div style="padding: 10px">' + error + '</div>');
    }, errorPageHead);
  }

  return {
    runStartupDiagnostics: runStartupDiagnostics
  };
};
