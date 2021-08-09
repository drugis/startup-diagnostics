'use strict';
const sinon = require('sinon');
const chai = require('chai');
const spies = require('chai-spies');
const amqp = require('amqplib/callback_api');
const axios = require('axios');

chai.use(spies);
const expect = chai.expect;

const dbStub = {
  query: () => {}
};

const logger = {
  info: () => {},
  error: () => {}
};

const startupCheckService = require('../startupCheckService', {})(
  dbStub,
  logger
);

describe('the startup check service', () => {
  describe('getChecks', () => {
    var dbConnectionCheck = 'checkDBConnection';
    var pataviConnectionCheck = 'checkPataviConnection';
    var rabbitConnectionCheck = 'checkRabbit';

    it('should return the correct checks for MCDA', () => {
      var result = startupCheckService.getChecks('MCDA');
      expect(result[0].name).to.equal(dbConnectionCheck);
      expect(result[1].name).to.equal(pataviConnectionCheck);
    });

    it('should return the correct checks for GeMTC', () => {
      var result = startupCheckService.getChecks('GeMTC');
      expect(result[0].name).to.equal(dbConnectionCheck);
      expect(result[1].name).to.equal(pataviConnectionCheck);
    });

    it('should return the correct checks for Patavi', () => {
      var result = startupCheckService.getChecks('Patavi');
      expect(result[0].name).to.equal(dbConnectionCheck);
      expect(result[1].name).to.equal(rabbitConnectionCheck);
    });
  });

  describe('checkDBConnection', () => {
    var query;

    beforeEach(() => {
      query = sinon.stub(dbStub, 'query');
    });

    afterEach(() => {
      query.restore();
    });

    it('should call the callback with an empty array if there are no errors', () => {
      var callback = chai.spy();
      query.onCall(0).yields(null);
      startupCheckService.checkDBConnection(callback);
      expect(callback).to.have.been.called.with(null, []);
    });

    it('should call the callback with an array containting error messages, if there are any', () => {
      var dbError = 'db error';
      var expectedErrorMessage =
        'Connection to database unsuccessful. <i>' +
        dbError +
        '</i>.<br> Please make sure the database is running and the environment variables are set correctly.';
      var callback = chai.spy();
      query.onCall(0).yields('db error');
      startupCheckService.checkDBConnection(callback);
      expect(callback).to.have.been.called.with(null, [expectedErrorMessage]);
    });
  });

  describe('checkPataviConnection', () => {
    let axiosGet;

    beforeEach(() => {
      axiosGet = sinon.stub(axios, 'get');
    });

    afterEach(() => {
      axiosGet.restore();
    });

    it('should call the callback with an empty array if there are no errors', () => {
      const oldEnv = process.env;
      process.env = {...process.env, PATAVI_API_KEY: 'testkey'};
      const callback = chai.spy();
      const result = {
        status: 200
      };
      const promise = Promise.resolve(result);
      axiosGet.onCall(0).returns(promise);

      const checkPromise = startupCheckService.checkPataviConnection(callback);
      return checkPromise.then(() => {
        process.env = oldEnv;
        expect(callback).to.have.been.called.with(null, []);
      });
    });

    it('should call the callback with an error, if the api key can not be found', () => {
      var callback = chai.spy();

      startupCheckService.checkPataviConnection(callback);

      var expectedError = 'Patavi API key not found';
      expect(callback).to.have.been.called.with(null, [expectedError]);
    });

    it('should call the callback with a patavi connection error', () => {
      const oldEnv = process.env;
      process.env = {...process.env, PATAVI_API_KEY: 'testkey'};

      var callback = chai.spy();
      var error = {
        message: 'post request error'
      };
      var getRequest = Promise.reject(error);
      axiosGet.onCall(0).returns(getRequest);

      const resultPromise = startupCheckService.checkPataviConnection(callback);

      const expectedError =
        'Connection to Patavi unsuccessful: <i>' +
        error.message +
        '</i>.<br> Please make sure the Patavi server is running and the environment variables are set correctly.';

      return resultPromise.then(() => {
        process.env = oldEnv;
        expect(callback).to.have.been.called.with(null, [expectedError]);
      });
    });
  });

  describe('checkRabbit', () => {
    var connect;

    beforeEach(() => {
      connect = sinon.stub(amqp, 'connect');
    });

    afterEach(() => {
      connect.restore();
    });

    it('should call the callback with an empty array if patavi can connect with the rabbit', () => {
      var callback = chai.spy();
      connect.onCall(0).yields(null);

      startupCheckService.checkRabbit(callback);
      expect(callback).to.have.been.called.with(null, []);
    });

    it('should call the callback with an error if patavi cant connect with the rabbit', () => {
      var callback = chai.spy();
      const error = 'rabbit error';
      connect.onCall(0).yields(error);

      startupCheckService.checkRabbit(callback);
      const expectedError =
        'AMQP connection to Rabbit unsuccessful. <i>' +
        error +
        '</i>.<br> Please make sure the Rabbit is running and the environment variables are set correctly.';
      expect(callback).to.have.been.called.with(null, [expectedError]);
    });
  });
});
