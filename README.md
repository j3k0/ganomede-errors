# ganomede-errors

Ganomede's extended restify errors

The way to distinguish our app's logic-level errors from others.
(Like `socket hang up` vs `user already exists`.)

## Basic Usage

The idea is to create error classes like `UserNotFoundError extends GanomedeError`,
define appropriate `statusCode` and `message` on it with optional params,
and return those from lower-level places.

``` js
//
// Database.js
//

class Db {
  getDocument (id, callback) {
    this.redis.get(id, (err, reply) => {
      // Propagate "fundamental" errors.
      if (err)
        return callback(err);

      // Wrap app-level errors into more meaningful objects.
      if (reply === null)
        return callback(new Db.DocumentNotFoundError({id}));

      callback(null, reply);
    });
  }
}

Db.DocumentNotFoundError = class DocumentNotFoundError extends GanomedeError {
  constructor (query) {
    super('No documents matching `%j`', query);
    this.severity = 'info';
    this.statusCode = 404;
  }
};
```

In app-code, make use of more meaningful errors and act accordingly.

``` js
//
// app.js
//

app.get('/users/:id', (req, res) => {
  db.getDocument(`users:${req.params.id}`, (err, user) => {
    if (err instanceof Db.DocumentNotFoundError) {
      // This will:
      //   - call `logger[err.severity]` with approprite message;
      //   - call `next(toRestError(err))`.
      //
      // Resulting in HTTP response will have appropriate status code (`err.statusCode`)
      // and contain JSON body:
      //
      // { // `error.name` (default is `error.constructor.name`)
      //   "restCode": "DocumentNotFoundError",
      //
      //   // `error.statusCode`,
      //   "statusCode": 404,
      //
      //   // `error.message`
      //   "message": "No documents matching `{\"id\": \"users:4\"}`"
      // }
      return sendHttpError(logger, next, err);
    }
    else if (err) {
      // Same as above, except log level is "error"
      // and `next` will receive restify.InternalServerError instance
      // (which `next` already knows how to upcast to `RestError`).
      return sendHttpError(logger, next, new restify.InternalServerError());
    }

    res.json(user);
  });
});
```

It can also be sometimes useful to have more granular error classes.

``` js
//
// Orm.js
//

const findUser = (userId, callback) => {
  new Db().getDocument(userId, (err, json) => {
    if (err instanceof Db.DocumentNotFoundError) {
      // here we now what missing document means
      // (and DB knows how to distinguish missing document errors
      // from, say, "cannot connect to hostname")
      return callback(new UserNotFoundError(userId));
    }
    else if (err)
      return callback(err);

    callback(null, json);
  });
};
```

## Included Errors

Some situations are quite common, so error classes for them with
appropriate severity levels, status codes and names are already included.

Class Name (as exported) | HTTP Status | Rest Code | Message | Severity
-------------------------|-------------|-----------|---------|---------
`InvalidAuthTokenError` | 401 | `'InvalidAuthTokenError'` | Invalid auth token | `severity.info`
`InvalidCredentialsError` | 401 | `'InvalidCredentialsError'` | Invalid credentials | `severity.info`
`RequestValidationError` | 400 | First argument passed to constructor | Rest of constructor arguments | severity.info

``` js
if (!req.params.token)
  return sendHttpError(logger, next, new InvalidAuthTokenError());

if (req.headers['Authorization'] !== 'Bearer 0xdeadbeef')
  return sendHttpError(logger, next, new InvalidCredentialsError());

if (typeof req.body.message !== 'string')
  return sendHttpError(logger, next, new RequestValidationError(
    'BadMessage',
    'Message must be a string, got `%s`', typeof req.body.message
  ));
```
