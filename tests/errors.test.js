'use strict';

const {RestError} = require('restify-errors');
const bunyan = require('bunyan');
const errors = require('../index');

describe('errors', () => {
  it('.severity contains valid bunyan levels', () => {
    Object.keys(errors.severity).every(name => {
      const level = errors.severity[name];
      const logger = bunyan.createLogger({name: 'test logger'});
      expect(logger).to.have.property(level);
      expect(logger[level]).to.be.instanceof(Function);
    });
  });

  describe('sendHttpError()', () => {
    it('converts GanomedeError instances to restify.RestError', () => {
      errors.sendHttpError(
        {info: () => {}},
        (e) => expect(e).to.be.instanceof(RestError),
        new errors.InvalidCredentialsError()
      );
    });

    it('captures stack traces on errors', (done) => {
      // Say we have database module.
      const db = {
        doWork (cb) {
          process.nextTick(cb, new Error('FakeDatabaseError'));
        }
      };

      // Logger should know from where sendHttpError was called.
      // (We extract sendHttpError so it appears without "Object." in stack trace.)
      const logger = td.object('testdouble-logger', ['error']);
      const {sendHttpError} = errors;

      td.when(logger.error(td.matchers.isA(Object), td.matchers.isA(Object)))
        .thenDo(({error}, {sendHttpErrorStack}) => {
          // Even though it is not in original error,
          // we still know where to look (file, line, function name).
          const [firstFrame, secondFrame] = sendHttpErrorStack
            .split('\n')
            .filter(line => line.startsWith('    at'))
            .map(frame => frame.trim());

          expect(error.stack).to.not.include('at sendHttpError');
          expect(error.stack).to.not.include('i_should_be_in_stack');
          expect(firstFrame).to.match(/^at sendHttpError/);
          expect(secondFrame).to.match(/^at i_should_be_in_stack/);
        });

      // Which is called from middleware. In case of error, sendHttpError is invoked.
      const middleware = (next) => {
        db.doWork((err) => {
          (function i_should_be_in_stack () {
            sendHttpError(logger, next, err);
          }());
        });
      };

      // next() must receive original error,
      // and logger.error() must be called.
      middleware((err) => {
        expect(err).to.be.instanceof(Error);
        expect(err.message).to.equal('FakeDatabaseError');
        td.assert(logger.error).callCount(1);
        done();
      });
    });
  });
});
