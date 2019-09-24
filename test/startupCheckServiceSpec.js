'use strict';
const sinon = require('sinon');
const chai = require('chai');
const spies = require('chai-spies');
const fs = require('fs');
const https = require('https');
const amqp = require('amqplib/callback_api');

chai.use(spies);
const expect = chai.expect;

const dbStub = {
  query: () => { }
};

const logger = {
  info: () => {},
  error: () => {}
};

const startupCheckService = require(
  '../startupCheckService', {})(dbStub, logger);

describe('the startup check service', () => {
  describe('getChecks', () => {
    var dbConnectionCheck = 'checkDBConnection';
    var pataviConnectionCheck = 'checkPataviConnection';
    var pataviCertificatesCheck = 'checkPataviServerCertificates';
    var rabbitConnectionCheck = 'checkRabbit';

    it('should return the correct checks for MCDA', ()=> {
      var result = startupCheckService.getChecks('MCDA');
      expect(result[0].name).to.equal(dbConnectionCheck);
      expect(result[1].name).to.equal(pataviConnectionCheck);
    });

    it('should return the correct checks for GeMTC', ()=> {
      var result = startupCheckService.getChecks('GeMTC');
      expect(result[0].name).to.equal(dbConnectionCheck);
      expect(result[1].name).to.equal(pataviConnectionCheck);
    });

    it('should return the correct checks for Patavi', ()=> {
      var result = startupCheckService.getChecks('Patavi');
      expect(result[0].name).to.equal(dbConnectionCheck);
      expect(result[1].name).to.equal(pataviCertificatesCheck);
      expect(result[2].name).to.equal(rabbitConnectionCheck);
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
      var expectedErrorMessage = 'Connection to database unsuccessful. <i>' + dbError + '</i>.<br> Please make sure the database is running and the environment variables are set correctly.';
      var callback = chai.spy();
      query.onCall(0).yields('db error');
      startupCheckService.checkDBConnection(callback);
      expect(callback).to.have.been.called.with(null, [expectedErrorMessage]);
    });
  });

  describe('checkPataviConnection', () => {
    var existsSync;
    var readFileSync;
    var httpsRequest;

    beforeEach(() => {
      existsSync = sinon.stub(fs, 'existsSync');
      readFileSync = sinon.stub(fs, 'readFileSync');
      httpsRequest = sinon.stub(https, 'request');
    });

    afterEach(() => {
      existsSync.restore();
      readFileSync.restore();
      httpsRequest.restore();
    });

    it('should call the callback with an empty array if there are no errors', () => {
      var callback = chai.spy();
      var result = {
        statusCode: 200
      };
      var postRequest = {
        on: () => { },
        end: () => { }
      };
      existsSync.returns(true);
      readFileSync.returns(true);
      httpsRequest.onCall(0).yields(result).onCall(0).returns(postRequest);

      startupCheckService.checkPataviConnection(callback);
      expect(callback).to.have.been.called.with(null, []);
    });

    it('should call the callback with certificate errors, if the certificates can not be found', () => {
      var callback = chai.spy();
      existsSync.returns(false);

      startupCheckService.checkPataviConnection(callback);

      var expectedError1 = 'Patavi client key not found. Please make sure it is accessible at the specified location: ' + process.env.PATAVI_CLIENT_KEY;
      var expectedError2 = 'Patavi client certificate not found. Please make sure it is accessible at the specified location: ' + process.env.PATAVI_CLIENT_CRT;
      expect(callback).to.have.been.called.with(null, [expectedError1, expectedError2]);
    });

    it('should call the callback with a patavi connection error', () => {
      var callback = chai.spy();
      var error = 'post request error';
      var postRequest = {
        on: (event, postRequestCallback) => {
          postRequestCallback(error);
        },
        end: () => { }
      };
      existsSync.returns(true);
      readFileSync.returns(true);
      httpsRequest.onCall(0).returns(postRequest);

      startupCheckService.checkPataviConnection(callback);

      var expectedError = 'Connection to Patavi unsuccessful: <i>' + error + '</i>.<br> Please make sure the Patavi server is running and the environment variables are set correctly.';
      expect(callback).to.have.been.called.with(null, [expectedError]);
    });

    it('should call the callback with an unexpected status code error', () => {
      var callback = chai.spy();
      var result = {
        statusCode: 201
      };
      var postRequest = {
        on: () => { },
        end: () => { }
      };
      existsSync.returns(true);
      readFileSync.returns(true);
      httpsRequest.onCall(0).yields(result).onCall(0).returns(postRequest);

      startupCheckService.checkPataviConnection(callback);

      var expectedError = 'Connection to Patavi successful but received incorrect status code: <i>' + result.statusCode + '</i>.';
      expect(callback).to.have.been.called.with(null, [expectedError]);
    });
  });

  describe('checkCertificates', () => {
    var existsSync;
    var httpsRequest;

    beforeEach(() => {
      existsSync = sinon.stub(fs, 'existsSync');
      httpsRequest = sinon.stub(https, 'request');
    });

    afterEach(() => {
      existsSync.restore();
      httpsRequest.restore();
    });

    it('should call the callback with an empty array if there are no errors', () => {
      var callback = chai.spy();
      existsSync.returns(true);

      startupCheckService.checkPataviServerCertificates(callback);
      expect(callback).to.have.been.called.with(null, []);
    });

    it('should call the callback with certificate errors', () => {
      var callback = chai.spy();
      existsSync.returns(false);

      startupCheckService.checkPataviServerCertificates(callback);

      var expectedError1 = 'Patavi server key not found. Please make sure it is accessible at the specified location: "ssl/server-key.pem"';
      var expectedError2 = 'Patavi server certificate not found. Please make sure it is accessible at the specified location: "ssl/server-crt.pem"';
      var expectedError3 = 'Patavi certificate authority not found. Please make sure it is accessible at the specified location: "ssl/ca-crt.pem"';
      expect(callback).to.have.been.called.with(null, [expectedError1, expectedError2, expectedError3]);
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
      const expectedError = 'AMQP connection to Rabbit unsuccessful. <i>' + error + '</i>.<br> Please make sure the Rabbit is running and the environment variables are set correctly.';
      expect(callback).to.have.been.called.with(null, [expectedError]);
    });
  });

});
