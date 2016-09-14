/**
 * This sanity test compares fast-diff-astral to googlediff.
 * However, it cannot test surrogate pairs, as googlediff does
 * not handle them correctly itself.
 *
 * Therefore it is used purely to check the sanity of diffing with
 * regard to text in the basic multilingual plane.
 */
var isEqual = require('lodash.isequal');
var googlediff = require('googlediff');
var seedrandom = require('seedrandom');
var diff = require('../diff.js');

googlediff = new googlediff();

var ITERATIONS = 10000;
var ALPHABET = 'GATTACA';
var LENGTH = 100;

var seed = Math.floor(Math.random() * 10000);
var random = seedrandom(seed);

console.log('Running computing ' + ITERATIONS + ' diffs with seed ' + seed + '...');

console.log('Generating strings...');
var strings = [];
for(var i = 0; i <= ITERATIONS; ++i) {
  var chars = [];
  for(var l = 0; l < LENGTH; ++l) {
    var letter = ALPHABET.substr(Math.floor(random() * ALPHABET.length), 1);
    chars.push(letter);
  }
  strings.push(chars.join(''));
}

console.log('Running tests...');
for(var i = 0; i < ITERATIONS; ++i) {
  // console.log('\nIteration: ', i);
  // console.log('Diff String A: ', strings[i]);
  // console.log('Diff String B: ', strings[i+1]);
  var result = diff(strings[i], strings[i+1]);
  var expected = googlediff.diff_main(strings[i], strings[i+1]);
  // console.log('Diff Result: ', result);
  // console.log('Diff Expected: ', expected);

  if (!isEqual(result, expected)) {
    console.log('Expected', expected);
    console.log('Result', result);
    throw new Error('Diff produced difference results.');
  }
}

console.log("Success!");
