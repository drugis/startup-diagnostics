'use strict';
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const chai = require('chai');
const spies = require('chai-spies');

chai.use(spies);
const expect = chai.expect;

const dbStub = {};
const appName = 'appName';
const startupCheckServiceStub = {
  getChecks: chai.spy(),
};

const startupDiagnosticsService = proxyquire(
  '../index', {
  './startupCheckService': () => { return startupCheckServiceStub; }
})(dbStub, appName);

describe('the startup diagnostics (index)', () => {
  describe('runStartupDiagnostics', () => {
    var getChecks;
    var checkFunction = sinon.stub();
    const errorHeader = '<h3>' + appName + ' could not be started. The following errors occured:</h3>';
    const divStart = '<div style="padding: 10px">';
    const divEnd = '</div>';
    const checkError = 'error during a check';

    beforeEach(() => {
      getChecks = sinon.stub(startupCheckServiceStub, 'getChecks');
      getChecks.onCall(0).returns([checkFunction]);
    });

    afterEach(() => {
      getChecks.restore();
    });

    it('should call the callback without errors', (done) => {
      checkFunction.onCall(0).yields(null, []);
      var callback = function(errors) {
        expect(errors).to.equal(undefined);
        done();
      };

      startupDiagnosticsService.runStartupDiagnostics(callback);
    });

    it('should call the callback with a patavi connection error', (done) => {
      checkFunction.onCall(0).yields(null, [checkError]);
      var expectedError = errorHeader + divStart + checkError + divEnd;
      var callback = function(errors) {
        expect(errors).to.equal(expectedError);
        done();
      };

      startupDiagnosticsService.runStartupDiagnostics(callback);
    });

    it('should call the callback with an error if the parallel execution goes wrong', (done) => {
      var error = 'parallel error';
      checkFunction.onCall(0).yields(null, []);
      var expectedError = errorHeader +
        divStart + 'Could not execute diagnostics, unknown error: ' + error + divEnd;
      var callback = function(errors) {
        expect(errors).to.equal(expectedError);
        done();
      };

      startupDiagnosticsService.runStartupDiagnostics(callback);
    });
  });

});
