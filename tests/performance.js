/**
 * This sanity test compares fast-diff-astral to googlediff.
 * However, it cannot test surrogate pairs, as googlediff does
 * not handle them correctly itself.
 *
 * Therefore it is used purely to check the sanity of diffing with
 * regard to text in the basic multilingual plane.
 */
var isEqual = require('lodash.isequal');
var seedrandom = require('seedrandom');
var fastDiff = require('fast-diff');
var fastDiffAstral = require('../diff.js');

var ITERATIONS = [10, 100];
var LENGTHS = [10, 100, 1000, 10000];
var ALPHABET = 'GATTACA';


ITERATIONS.forEach(function(iterationCount){
  LENGTHS.forEach(function(length){

    var seed = Math.floor(Math.random() * 10000);

    console.log('\nComputing ' + iterationCount + ' diffs, string length ' + length + ', with seed ' + seed + '...');
    console.log('Generating strings...');
    var strings = generateRandomStrings(seed, length, iterationCount);

    console.log('Running tests...');
    var fastDiffResults = testFastDiff(strings);
    var fastDiffAstralResults = testFastDiffAstral(strings);

    // ensure results match
    if (!isEqual(fastDiffResults, fastDiffAstralResults)) {
      console.log('fast-diff results:', expected);
      console.log('fast-diff-astral results:', result);
      throw new Error('Diff produced different results.');
    }
    else {
      console.log('Diff produced same results.')
    }

  })
})
console.log("Success!");


function generateRandomStrings(seed, length, count) {
  var strings = [];
  var random = seedrandom(seed);
  for(var i = 0; i <= count; ++i) {
    var chars = [];
    for(var l = 0; l < length; ++l) {
      var letter = ALPHABET.substr(Math.floor(random() * ALPHABET.length), 1);
      chars.push(letter);
    }
    strings.push(chars.join(''));
  }
  return strings;
}


function testFastDiff(strings) {
  console.time('fast-diff');
  var results = [];
  var stringsCount = strings.length;
  for (var i=0; i < stringsCount-1; i++) {
    results.push( fastDiff(strings[i], strings[i+1]) )
  }
  console.timeEnd('fast-diff');
  return results;
}


function testFastDiffAstral(strings) {
  console.time('fast-diff-astral');
  var results = [];
  var stringsCount = strings.length;
  for (var i=0; i < stringsCount-1; i++) {
    results.push( fastDiffAstral(strings[i], strings[i+1]) )
  }
  console.timeEnd('fast-diff-astral');
  return results;
}
