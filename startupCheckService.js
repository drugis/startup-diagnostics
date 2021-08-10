'use strict';
const _ = require('lodash');
const httpStatus = require('http-status-codes');
const amqp = require('amqplib/callback_api');
const axios = require('axios');

module.exports = function (db, logger) {
  const checksByApplication = {
    MCDA: [checkDBConnection, checkPataviConnection],
    GeMTC: [checkDBConnection, checkPataviConnection],
    Patavi: [checkDBConnection, checkRabbit]
  };

  function getChecks(appName) {
    return checksByApplication[appName];
  }

  function checkDBConnection(callback) {
    db.query(
      'SELECT version() AS postgresql_version',
      [],
      _.partial(dbCheckCallback, callback)
    );
  }

  function dbCheckCallback(callback, error) {
    var startupErrors = [];
    if (error) {
      startupErrors.push(
        'Connection to database unsuccessful. <i>' +
          error +
          '</i>.<br> Please make sure the database is running and the environment variables are set correctly.'
      );
    } else {
      logger.info('Connection to database successful');
    }
    callback(null, startupErrors);
  }

  function checkPataviConnection(callback) {
    const apiKey = process.env.PATAVI_API_KEY;
    if (apiKey) {
      logger.info('API key found');
      return checkPataviServerConnection(callback);
    } else {
      callback(null, ['Patavi API key not found']);
    }
  }

  function checkPataviServerConnection(callback) {
    const config = {
      headers: {
        'X-API-KEY': process.env.PATAVI_API_KEY
      }
    };
    const pataviUrl = getPataviUrl();
    logger.debug('connecting to patavi at: ' + pataviUrl);
    return axios
      .get(pataviUrl, config)
      .then(_.partial(pataviRequestCallback, callback))
      .catch(_.partial(pataviRequestErrorCallback, callback));
  }

  function getPataviUrl() {
    const protocol = process.env.SECURE_TRAFFIC === 'true' ? 'https' : 'http';
    const portBlock = process.env.PATAVI_PORT
      ? `:${process.env.PATAVI_PORT}`
      : '';
    return `${protocol}://${process.env.PATAVI_HOST}${portBlock}`;
  }

  function pataviRequestCallback(callback, result) {
    if (result.status === httpStatus.StatusCodes.OK) {
      logger.info('Connection to Patavi server successful');
      callback(null, []);
    } else {
      callback(null, [
        'Connection to Patavi successful but received incorrect status code: <i>' +
          result.status +
          '</i>.'
      ]);
    }
  }

  function pataviRequestErrorCallback(callback, result) {
    callback(null, [
      'Connection to Patavi unsuccessful: <i>' +
        result.message +
        '</i>.<br> Please make sure the Patavi server is running and the environment variables are set correctly.'
    ]);
  }

  function checkRabbit(callback) {
    amqp.connect('amqp://' + process.env.PATAVI_BROKER_HOST, function (error) {
      var startupErrors = [];
      if (error) {
        startupErrors.push(
          'AMQP connection to Rabbit unsuccessful. <i>' +
            error +
            '</i>.<br> Please make sure the Rabbit is running and the environment variables are set correctly.'
        );
      } else {
        logger.info('Connection to Rabbit successful');
      }
      callback(null, startupErrors);
    });
  }

  return {
    checkDBConnection: checkDBConnection,
    checkPataviConnection: checkPataviConnection,
    getChecks: getChecks,
    checkRabbit: checkRabbit
  };
};
