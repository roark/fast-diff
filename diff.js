/**
 * This library modifies the diff-patch-match library by Neil Fraser
 * by removing the patch and match functionality and certain advanced
 * options in the diff function. The original license is as follows:
 *
 * ===
 *
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// load dependencies
var isEqual = require('lodash.isequal');

/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;


/**
 * Entry point for finding difference between two texts.
 * Converts given text strings to arrays of code points,
 * then converts resulting diffs back to strings.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @returns {Array} Array of diff tubles. Diffs contain strings.
 */
function diff_start(text1, text2) {
  var text1CodePoints = stringToCodePoints(text1);
  var text2CodePoints = stringToCodePoints(text2);

  var diffs = diff_main(text1CodePoints,text2CodePoints);

  // Convert diffs to strings
  diff_convertToStrings(diffs);

  return diffs;
}

/**
 * Find the differences between two code point arrays.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {Array.<string>} text1 Old array of code points to be diffed.
 * @param {Array.<string>} text2 New array of code points to be diffed.
 * @return {Array} Array of diff tuples. Diffs contain arrays of code points.
 */
function diff_main(text1, text2) {
  // Check for equality (speedup).
  if ( isEqual(text1, text2) ) {
    if ( text1.length > 0 ) {
      return [[DIFF_EQUAL, text1]];
    }
    return [];
  }

  // Trim off common prefix (speedup).
  var commonlength = diff_commonPrefix(text1, text2);
  var commonprefix = text1.slice(0, commonlength);
  text1 = text1.slice(commonlength);
  text2 = text2.slice(commonlength);

  // Trim off common suffix (speedup).
  commonlength = diff_commonSuffix(text1, text2);
  var commonsuffix = text1.slice(text1.length - commonlength);
  text1 = text1.slice(0, text1.length - commonlength);
  text2 = text2.slice(0, text2.length - commonlength);

  // Compute the diff on the middle block.
  var diffs = diff_compute_(text1, text2);

  // Restore the prefix and suffix.
  if (commonprefix.length > 0) {
    diffs.unshift([DIFF_EQUAL, commonprefix]);
  }
  if (commonsuffix.length > 0) {
    diffs.push([DIFF_EQUAL, commonsuffix]);
  }
  diff_cleanupMerge(diffs);

  return diffs;
};


/**
 * Find the differences between two arrays of code points.
 * Assumes that the texts do not have any common prefix or suffix.
 * @param {Array.<string>} text1 Old array of code points to be diffed.
 * @param {Array.<string>} text2 New array of code points to be diffed.
 * @return {Array} Array of diff tuples. Diffs contain arrays of code points.
 */
function diff_compute_(text1, text2) {
  var diffs;

  if ( text1.length === 0 ) {
    // Just add some text (speedup).
    return [[DIFF_INSERT, text2]];
  }

  if ( text2.length === 0 ) {
    // Just delete some text (speedup).
    return [[DIFF_DELETE, text1]];
  }

  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;

  var i = subArrayIndexOf(longtext, shorttext);
  if (i != -1) {
    // Shorter text is inside the longer text (speedup).
    diffs = [[DIFF_INSERT, longtext.slice(0, i)],
             [DIFF_EQUAL, shorttext],
             [DIFF_INSERT, longtext.slice(i + shorttext.length)]];
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;
    }
    return diffs;
  }

  if (shorttext.length == 1) {
    // Single character string.
    // After the previous speedup, the character can't be an equality.
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  }

  // Check to see if the problem can be split in two.
  var hm = diff_halfMatch_(text1, text2);
  if (hm) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0];
    var text1_b = hm[1];
    var text2_a = hm[2];
    var text2_b = hm[3];
    var mid_common = hm[4];
    // Send both pairs off for separate processing.
    var diffs_a = diff_main(text1_a, text2_a);
    var diffs_b = diff_main(text1_b, text2_b);
    // Merge the results.
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
  }

  return diff_bisect_(text1, text2);
};


/**
 * Find the 'middle snake' of a diff, split the problem in two
 * and return the recursively constructed diff.
 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
 * @param {Array.<string>} text1 Old array of code points to be diffed.
 * @param {Array.<string>} text2 New array of code points to be diffed.
 * @return {Array} Array of diff tuples. Diffs contain arrays of code points.
 * @private
 */
function diff_bisect_(text1, text2) {
  // Cache the text lengths to prevent multiple calls.
  var text1_length = text1.length;
  var text2_length = text2.length;
  var max_d = Math.ceil((text1_length + text2_length) / 2);
  var v_offset = max_d;
  var v_length = 2 * max_d;
  var v1 = new Array(v_length);
  var v2 = new Array(v_length);
  // Setting all elements to -1 is faster in Chrome & Firefox than mixing
  // integers and undefined.
  for (var x = 0; x < v_length; x++) {
    v1[x] = -1;
    v2[x] = -1;
  }
  v1[v_offset + 1] = 0;
  v2[v_offset + 1] = 0;
  var delta = text1_length - text2_length;
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (delta % 2 != 0);
  // Offsets for start and end of k loop.
  // Prevents mapping of space beyond the grid.
  var k1start = 0;
  var k1end = 0;
  var k2start = 0;
  var k2end = 0;
  for (var d = 0; d < max_d; d++) {
    // Walk the front path one step.
    for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      var k1_offset = v_offset + k1;
      var x1;
      if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
        x1 = v1[k1_offset + 1];
      } else {
        x1 = v1[k1_offset - 1] + 1;
      }
      var y1 = x1 - k1;
      while (x1 < text1_length && y1 < text2_length &&
             text1[x1] == text2[y1]) {
        x1++;
        y1++;
      }
      v1[k1_offset] = x1;
      if (x1 > text1_length) {
        // Ran off the right of the graph.
        k1end += 2;
      } else if (y1 > text2_length) {
        // Ran off the bottom of the graph.
        k1start += 2;
      } else if (front) {
        var k2_offset = v_offset + delta - k1;
        if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
          // Mirror x2 onto top-left coordinate system.
          var x2 = text1_length - v2[k2_offset];
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }

    // Walk the reverse path one step.
    for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      var k2_offset = v_offset + k2;
      var x2;
      if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
        x2 = v2[k2_offset + 1];
      } else {
        x2 = v2[k2_offset - 1] + 1;
      }
      var y2 = x2 - k2;
      while (x2 < text1_length && y2 < text2_length &&
             text1[text1_length - x2 - 1] ==
             text2[text2_length - y2 - 1]) {
        x2++;
        y2++;
      }
      v2[k2_offset] = x2;
      if (x2 > text1_length) {
        // Ran off the left of the graph.
        k2end += 2;
      } else if (y2 > text2_length) {
        // Ran off the top of the graph.
        k2start += 2;
      } else if (!front) {
        var k1_offset = v_offset + delta - k2;
        if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
          var x1 = v1[k1_offset];
          var y1 = v_offset + x1 - k1_offset;
          // Mirror x2 onto top-left coordinate system.
          x2 = text1_length - x2;
          if (x1 >= x2) {
            // Overlap detected.
            return diff_bisectSplit_(text1, text2, x1, y1);
          }
        }
      }
    }
  }
  // Diff took too long and hit the deadline or
  // number of diffs equals number of characters, no commonality at all.
  return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
};


/**
 * Given the location of the 'middle snake', split the diff in two parts
 * and recurse.
 * @param {Array.<string>} text1 Old array of code points to be diffed.
 * @param {Array.<string>} text2 New array of code points to be diffed.
 * @param {number} x Index of split point in text1.
 * @param {number} y Index of split point in text2.
 * @return {Array} Array of diff tuples. Diffs contain arrays of code points.
 */
function diff_bisectSplit_(text1, text2, x, y) {
  var text1a = text1.slice(0, x);
  var text2a = text2.slice(0, y);
  var text1b = text1.slice(x);
  var text2b = text2.slice(y);

  // Compute both diffs serially.
  var diffs = diff_main(text1a, text2a);
  var diffsb = diff_main(text1b, text2b);

  return diffs.concat(diffsb);
};


/**
 * Determine the common prefix of two arrays of code points.
 * @param {Array.<string>} text1 First array of code points.
 * @param {Array.<string>} text2 Second array of code points.
 * @return {number} The number of code points common to the start of each
 *     array.
 */
function diff_commonPrefix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1[0] != text2[0]) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if ( isEqual( text1.slice(pointerstart, pointermid),
         text2.slice(pointerstart, pointermid) ) ) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine the common suffix of two arrays of code points.
 * @param {Array.<string>} text1 First array of code points.
 * @param {Array.<string>} text2 Second array of code points.
 * @return {number} The number of code points common to the end of each array.
 */
function diff_commonSuffix(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 ||
      text1[text1.length - 1] != text2[text2.length - 1]) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if ( isEqual( text1.slice(text1.length - pointermid, text1.length - pointerend),
         text2.slice(text2.length - pointermid, text2.length - pointerend) ) ) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * This speedup can produce non-minimal diffs.
 * @param {Array.<string>} text1 First array of code points.
 * @param {Array.<string>} text2 Second array of code points.
 * @return {Array.<Array>.<string>} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 */
function diff_halfMatch_(text1, text2) {
  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
    return null;  // Pointless.
  }

  /**
   * Does a substring of shorttext exist within longtext such that the substring
   * is at least half the length of longtext?
   * Closure, but does not reference any external variables.
   * @param {Array.<string>} longtext Longer code point array.
   * @param {Array.<string>} shorttext Shorter code point array.
   * @param {number} i Start index of quarter length substring within longtext.
   * @return {Array.<Array>.<string>} Five element Array, containing the prefix of
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
   *     of shorttext and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI_(longtext, shorttext, i) {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longtext.slice(i, i + Math.floor(longtext.length / 4));
    var j = -1;
    var best_common = [];
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
    while ((j = subArrayIndexOf(shorttext, seed, j + 1)) != -1) {
      var prefixLength = diff_commonPrefix(longtext.slice(i),
                                           shorttext.slice(j));
      var suffixLength = diff_commonSuffix(longtext.slice(0, i),
                                           shorttext.slice(0, j));
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shorttext.slice(j - suffixLength, j).concat(
            shorttext.slice(j, j + prefixLength) );
        best_longtext_a = longtext.slice(0, i - suffixLength);
        best_longtext_b = longtext.slice(i + prefixLength);
        best_shorttext_a = shorttext.slice(0, j - suffixLength);
        best_shorttext_b = shorttext.slice(j + prefixLength);
      }
    }
    if (best_common.length * 2 >= longtext.length) {
      return [best_longtext_a, best_longtext_b,
              best_shorttext_a, best_shorttext_b, best_common];
    } else {
      return null;
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 4));
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI_(longtext, shorttext,
                             Math.ceil(longtext.length / 2));
  var hm;
  if (!hm1 && !hm2) {
    return null;
  } else if (!hm2) {
    hm = hm1;
  } else if (!hm1) {
    hm = hm2;
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b;
  if (text1.length > text2.length) {
    text1_a = hm[0];
    text1_b = hm[1];
    text2_a = hm[2];
    text2_b = hm[3];
  } else {
    text2_a = hm[0];
    text2_b = hm[1];
    text1_a = hm[2];
    text1_b = hm[3];
  }
  var mid_common = hm[4];
  return [text1_a, text1_b, text2_a, text2_b, mid_common];
};


/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {Array} diffs Array of diff tuples. Diffs contain arrays of code points.
 */
function diff_cleanupMerge(diffs) {
  diffs.push([DIFF_EQUAL, [] ]);  // Add a dummy entry at the end.
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = [];
  var text_insert = [];
  var commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert = text_insert.concat( diffs[pointer][1] );
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete = text_delete.concat( diffs[pointer][1] );
        pointer++;
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            // Factor out any common prefixies.
            commonlength = diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] =
                    diffs[pointer - count_delete - count_insert - 1][1].concat(
                    text_insert.slice(0, commonlength) );
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL,
                                    text_insert.slice(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.slice(commonlength);
              text_delete = text_delete.slice(commonlength);
            }
            // Factor out any common suffixies.
            commonlength = diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.slice(text_insert.length -
                  commonlength).concat( diffs[pointer][1] );
              text_insert = text_insert.slice(0, text_insert.length -
                  commonlength);
              text_delete = text_delete.slice(0, text_delete.length -
                  commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          if (count_delete === 0) {
            diffs.splice(pointer - count_insert,
                count_delete + count_insert, [DIFF_INSERT, text_insert]);
          } else if (count_insert === 0) {
            diffs.splice(pointer - count_delete,
                count_delete + count_insert, [DIFF_DELETE, text_delete]);
          } else {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete],
                [DIFF_INSERT, text_insert]);
          }
          pointer = pointer - count_delete - count_insert +
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] = diffs[pointer - 1][1].concat( diffs[pointer][1] );
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = [];
        text_insert = [];
        break;
    }
  }
  if (diffs[diffs.length - 1][1].length === 0) {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if ( isEqual( diffs[pointer][1].slice(diffs[pointer][1].length -
          diffs[pointer - 1][1].length), diffs[pointer - 1][1] ) ) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1].concat(
            diffs[pointer][1].slice(0, diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length) );
        diffs[pointer + 1][1] = diffs[pointer - 1][1].concat( diffs[pointer + 1][1] );
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if ( isEqual (diffs[pointer][1].slice(0, diffs[pointer + 1][1].length),
          diffs[pointer + 1][1] ) ) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] = diffs[pointer - 1][1].concat( diffs[pointer + 1][1] );
        diffs[pointer][1] =
            diffs[pointer][1].slice(diffs[pointer + 1][1].length).concat(
            diffs[pointer + 1][1] );
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    diff_cleanupMerge(diffs);
  }
};


/**
 * Converts diffs array contents from arrays of code points to strings.
 * @param {Array} diffs Array of diff tuples. Diffs should contain arrays of code points.
 */
function diff_convertToStrings(diffs) {
  var diffsLen = diffs.length;
  for (var i = 0; i < diffsLen; i++) {
    diffs[i][1] = codePointsToString( diffs[i][1] );
  }
}


/**
 * Converts a string to an array of code points.
 * @param {string} string String to be converted to code points.
 * @returns {Array.<string>} Array of code points that make up string.
 */
function stringToCodePoints(string) {
  var index = 0;
  var length = string.length;
  var output = [];
  for (; index < length - 1; ++index) {
    var charCode = string.charCodeAt(index);
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      charCode = string.charCodeAt(index + 1);
      if (charCode >= 0xDC00 && charCode <= 0xDFFF) {
        output.push(string.slice(index, index + 2));
        ++index;
        continue;
      }
    }
    output.push(string.charAt(index));
  }
  if (index < string.length){
    output.push(string.charAt(index));
  }
  return output;
}


/**
 * Converts an array of code points to a string.
 * @param {Array.<string>} codePoints Array of code points.
 * @returns {string} String built from given code points.
 */
function codePointsToString(codePoints) {
  return codePoints.join('');
}


/**
 * Finds the index of a sub array inside the main array. Mimics the behavior
 * of String.indexOf.
 * @param {Array} mainArray Array to be searched through.
 * @param {Array} subArray Array to search for.
 * @param {integer} startIndex Index of where to begin search.
 * @returns {integer} Index of sub array in main array. -1 for not found.
 */
function subArrayIndexOf(mainArray, subArray, startIndex) {
  var mainArrayIndex = startIndex || 0;

  // handle empty sub array, mimic String.indexOf behavior
  if (subArray.length === 0) {
    return Math.min(mainArrayIndex, mainArray.length);
  }

  // handle non possible cases
  if ( (mainArrayIndex + subArray.length) > mainArray.length) {
    return -1;
  }

  // handle single value sub array
  if (subArray.length === 1) {
    return mainArray.indexOf(subArray[0], mainArrayIndex);
  }


  // handle multi value sub array
  var firstSubVal = subArray[0];
  var startPoints = [];
  var startPoint;

  do {
    startPoint = mainArray.indexOf(firstSubVal, mainArrayIndex);
    if (startPoint >= 0) {
      startPoints.push(startPoint);
    }
    mainArrayIndex = startPoint + 1;
  } while (startPoint >= 0)

  // check all start points
  var startPointsLen = startPoints.length;
  for (var pointIndex=0; pointIndex < startPointsLen; pointIndex++){
    mainArrayIndex = startPoints[pointIndex];
    // check if rest of sub array matches
    for (var subArrayIndex=1; subArrayIndex < subArray.length; subArrayIndex++) {
      // if values don't match, break, check next start point
      if (subArray[subArrayIndex] !== mainArray[mainArrayIndex+subArrayIndex]) {
        break;
      }
      // if reached here and checked all sub array elements, found
      if (subArrayIndex === subArray.length-1) {
        return mainArrayIndex;
      }
    }
  }

  // if reached this point, not found
  return -1;
}


var diff = diff_start;
diff.INSERT = DIFF_INSERT;
diff.DELETE = DIFF_DELETE;
diff.EQUAL = DIFF_EQUAL;


module.exports = diff;
