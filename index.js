'use strict';

const util = require('util');
const {RestError} = require('restify-errors');

// Values for error#severity: how to print it inside `sendHttpError`.
// https://github.com/j3k0/ganomede/issues/11
// https://github.com/trentm/node-bunyan#levels
const severity = {
  fatal: 'fatal',  // (60): The service/app is going to stop or become unusable now. An operator should definitely look into this soon.
  error: 'error',  // (50): Fatal for a particular request, but the service/app continues servicing other requests. An operator should look at this soon(ish).
  warn: 'warn',    // (40): A note on something that should probably be looked at by an operator eventually.
  info: 'info',    // (30): Detail on regular operation.
  debug: 'debug',  // (20): Anything else, i.e. too verbose to be included in "info" level.
  trace: 'trace'   // (10): Logging from external libraries used by your app or very detailed application logging.
};

class GanomedeError extends Error {
  constructor (...messageArgs) {
    super();
    this.name = this.constructor.name;
    this.severity = severity.error;

    if (messageArgs.length > 0)
      this.message = util.format.apply(util, messageArgs);

    Error.captureStackTrace(this, this.constructor);
  }
}

// This is for validation errors (like missing `body` or certain parts of it),
// same as base error except it allows to specify custom restCode
// via changing instance's .name (see GanomedeError#toRestError()).
//
// Use like this:
//
//   if (!req.body.userId) {
//     const err = new RequestValidationError('BadUserId', 'Invalid or missing User ID');
//     return sendHttpError(next, err);
//   }
//
//   // will result in http 404 with json body:
//   // { "code": "BadUserId",
//   //   "message": "Invalid or missing User ID" }
class RequestValidationError extends GanomedeError {
  constructor (name, ...messageArgs) {
    super(...messageArgs);
    this.name = name;
    this.statusCode = 400;
    this.severity = severity.info;
  }
}

class InvalidAuthTokenError extends GanomedeError {
  constructor () {
    super('Invalid auth token');
    this.statusCode = 401;
    this.severity = severity.info;
  }
}

class InvalidCredentialsError extends GanomedeError {
  constructor () {
    super('Invalid credentials');
    this.statusCode = 401;
    this.severity = severity.info;
  }
}

const toRestError = (error) => {
  if (!error.statusCode)
    throw new Error(`Please define "statusCode" prop for ${error.constructor.name}`);

  return new RestError({
    restCode: error.name,
    statusCode: error.statusCode,
    message: error.message
  });
};

const captureStack = () => {
  const o = {};
  Error.captureStackTrace(o, captureStack);
  return o.stack;
};

// Kept forgetting `next` part, so let's change this to (next, err).
const sendHttpError = (logger, next, err) => {
  // https://github.com/j3k0/ganomede-boilerplate/issues/10
  // https://github.com/j3k0/ganomede-directory/issues/15
  //
  // With restify errors, which we usually create ourselves,
  // stack points to the right place, but in some cases,
  // we can get error that was created on different event loop tick.
  //
  // Though we rely on lower levels to print those kinds of errors,
  // we still must know the place sendHttpError was called from.
  const stack = {sendHttpErrorStack: captureStack()};

  // When we have an instance of GanomedeError, it means stuff that's defined here, in this file.
  // So those have `statusCode` and convertable to rest errors.
  // In case they don't, we die (because programmers error ("upcast" it) not runtime's).
  const isGanomedeError = err instanceof GanomedeError;
  const error = isGanomedeError ? toRestError(err) : err;

  // We mostly upcast our app-logic errors to GanomedeError,
  // but some things may come up as restify.HttpError
  // (e.g. InternalServerError instance may end up here).
  // So we treat them with "error" severity.
  const level = isGanomedeError ? err.severity : 'error';

  logger[level]({error}, stack);
  next(error);
};

module.exports = {
  GanomedeError,
  RequestValidationError,
  InvalidAuthTokenError,
  InvalidCredentialsError,
  sendHttpError,
  severity
};
