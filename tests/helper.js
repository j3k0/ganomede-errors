'use strict';

const util = require('util');
const td = require('testdouble');
const {assert, expect} = require('chai');

const debugInspect = (what) => util.inspect(what, {depth: null, maxArrayLength: null});

td.print = (what) => {
  const message = td.explain(what).description;
  console.log('%s', message); // eslint-disable-line no-console
};

td.assert = (double) => {
  const explain = td.explain(double);

  const isTestDouble = () => assert(
    explain.isTestDouble,
    `${debugInspect(double)} is not a test double`
  );

  const callCount = (expected) => {
    isTestDouble(double);
    assert.equal(explain.callCount, expected, `Unexpected call count\n${explain.description}\n`);
  };

  return {
    isTestDouble,
    callCount
  };
};

global.__ganomede_test = true;
global.td = td;
global.assert = assert;
global.expect = expect;

afterEach(() => td.reset());
