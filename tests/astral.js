var expect = require('chai').expect;
var diff = require('../diff.js');

describe('Fast Diff Astral', function() {

  it('BMP Text - Simple 1', function(){
    var text1 = "A";
    var text2 = "B";
    var results = diff(text1,text2);
    var expected = [ [ -1, 'A' ], [ 1, 'B' ] ];
    expect( results ).to.deep.equal( expected );
  });

  it('Astral Plane Text - Simple 1', function(){
    var text1 = "🐤";
    var text2 = "🐧";
    var results = diff(text1,text2);
    var expected = [ [ -1, '🐤' ], [ 1, '🐧' ] ];
    expect( results ).to.deep.equal( expected );
  });

  it('Astral Plane Text - Simple 2', function(){
    var text1 = 'Good dog 🐶';
    var text2 = 'Bad dog 🐯';
    var results = diff(text1,text2);
    var expected = [ [ -1, 'Goo' ],
                     [ 1, 'Ba' ],
                     [ 0, 'd dog ' ],
                     [ -1, '🐶' ],
                     [ 1, '🐯' ] ];
    expect( results ).to.deep.equal( expected );
  });

});
