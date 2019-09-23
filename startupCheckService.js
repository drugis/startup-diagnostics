'use strict';
const _ = require('lodash');
const fs = require('fs');
const https = require('https');
const httpStatus = require('http-status-codes');
const amqp = require('amqplib/callback_api');

module.exports = function(db) {
  const checksByApplication = {
    MCDA: [checkDBConnection, checkPataviConnection],
    GeMTC: [checkDBConnection, checkPataviConnection],
    Patavi: [checkDBConnection, checkCertificates, checkRabbit]
  };

  function getChecks(appName) {
    return checksByApplication[appName];
  }

  function checkRabbit(callback) {
    amqp.connect('amqp://' + process.env.PATAVI_BROKER_HOST, function(error) {
      var startupErrors = [];
      if (error) {
        startupErrors.push('AMQP connection to Rabbit unsuccessful. <i>' + error + '</i>.<br> Please make sure the Rabbit is running and the environment variables are set correctly.');
      }
      callback(null, startupErrors);
    });
  }

  function checkCertificates(callback) {
    var certificateErrors = getServerCertificateErrors();
    callback(null, certificateErrors);
  }

  function getServerCertificateErrors() {
    var errors = [];
    if (!fs.existsSync('ssl/server-key.pem')) {
      errors.push('Patavi server key not found. Please make sure it is accessible at the specified location.');
    }
    if (!fs.existsSync('ssl/server-crt.pem')) {
      errors.push('Patavi server certificate not found. Please make sure it is accessible at the specified location.');
    }
    if (!fs.existsSync('ssl/ca-crt.pem')) {
      errors.push('Patavi certificate authority not found. Please make sure it is accessible at the specified location.');
    }
    return errors;
  }

  function checkDBConnection(callback) {
    db.query('SELECT version() AS postgresql_version',
      [],
      _.partial(dbCheckCallback, callback));
  }

  function dbCheckCallback(callback, error) {
    var startupErrors = [];
    if (error) {
      startupErrors.push('Connection to database unsuccessful. <i>' + error + '</i>.<br> Please make sure the database is running and the environment variables are set correctly.');
    } else {
      console.log('Connection to database successful');
    }
    callback(null, startupErrors);
  }

  function checkPataviConnection(callback) {
    var certificateErrors = getCertificateErrors();
    if (!certificateErrors.length) {
      console.log('All certificates found');
      checkPataviServerConnection(callback, certificateErrors);
    } else {
      callback(null, certificateErrors);
    }
  }

  function checkPataviServerConnection(callback, errors) {
    var httpsOptions = getHttpsOptions();
    var postRequest = https.request(httpsOptions, _.partial(pataviRequestCallback, callback, errors));
    postRequest.on('error', _.partial(pataviRequestErrorCallback, callback, errors));
    postRequest.end();
  }

  function pataviRequestErrorCallback(callback, errors, error) {
    errors.push('Connection to Patavi unsuccessful: <i>' + error + '</i>.<br> Please make sure the Patavi server is running and the environment variables are set correctly.');
    callback(null, errors);
  }

  function pataviRequestCallback(callback, errors, result) {
    if (result.statusCode === httpStatus.OK) {
      console.log('Connection to Patavi server successful');
      callback(null, errors);
    } else {
      errors.push('Connection to Patavi successful but received incorrect status code: <i>' + result.statusCode + '</i>.');
      callback(null, errors);
    }
  }

  function getCertificateErrors() {
    var errors = [];
    if (!fs.existsSync(process.env.PATAVI_CLIENT_KEY)) {
      errors.push('Patavi client key not found. Please make sure it is accessible at the specified location.');
    }
    if (!fs.existsSync(process.env.PATAVI_CLIENT_CRT)) {
      errors.push('Patavi client certificate not found. Please make sure it is accessible at the specified location.');
    }
    if (!fs.existsSync(process.env.PATAVI_CA)) {
      errors.push('Patavi certificate authority not found. Please make sure it is accessible at the specified location.');
    }
    return errors;
  }

  function getHttpsOptions() {
    return {
      hostname: process.env.PATAVI_HOST,
      port: process.env.PATAVI_PORT,
      key: fs.readFileSync(process.env.PATAVI_CLIENT_KEY),
      cert: fs.readFileSync(process.env.PATAVI_CLIENT_CRT),
      ca: fs.readFileSync(process.env.PATAVI_CA)
    };
  }

  return {
    checkDBConnection: checkDBConnection,
    checkPataviConnection: checkPataviConnection,
    getChecks: getChecks
  };
};