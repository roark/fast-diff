# Fast Diff Astral

This is an updated version of Jason Chen's excellent [Fast-Diff](https://github.com/jhchen/fast-diff) library. It is expanded upon to handle surrogate pairs in the UTF-16 astral plane.

Fast-Diff itself is a simplified import of the excellent [diff-match-patch](https://code.google.com/p/google-diff-match-patch/) library by [Neil Fraser](https://neil.fraser.name/) into the Node.js environment. The match and patch parts are removed, as well as all the extra diff options. What remains is incredibly fast diffing between two strings.

 The diff function is an implementation of ["An O(ND) Difference Algorithm and its Variations" (Myers, 1986)](http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.4.6927&rep=rep1&type=pdf) with the suggested divide and conquer strategy along with several [optimizations](http://neil.fraser.name/news/2007/10/09/) Neil added.

```js
var diff = require('fast-diff-astral');

var good = 'Good dog 🐶';
var bad = 'Bad dog 🐯';

var result = diff(good, bad);
//   [ [ -1, 'Goo' ],
//     [ 1, 'Ba' ],
//     [ 0, 'd dog ' ],
//     [ -1, '🐶' ],
//     [ 1, '🐯' ] ]

// For convenience
diff.INSERT === 1;
diff.EQUAL === 0;
diff.DELETE === -1;
```
