let eq = (a, b) => a == b;

/*let arrayEq = function(ra, rb) {
  let isA = Array.isArray(ra);
  let isB = Array.isArray(rb);
  if (isA !== isB) return false; // one is array and the other isn't
  if (isA === false && isB === false) return eq(ra, rb); // to handle non-arrays and also the recursive step
  if (ra.length !== ra.length) return false;
  for (let i = 0; i < ra.length; i++) {
    if (!arrayEq(ra[i], rb[i])) return false;
  }
  return true;
}*/ // -> arrayEq now included in the lisk.js file

let tests =
/* note: the current format is that elements in the tests list are categories of tests,
and within each category each element is a an array of [expr, equalityTestFunc, whatExprShouldEvalTo].
The reason for including equalityTestFunc was because array equality handling could not be done with
the simple == operator. I now realise that arrayEq would also work perfectly fine for non-arrays, but, as they say,
premature optimisation is the root of all evil.*/
[
  [
    "string parsing",
    ['"strings"', eq, '"strings"'],
    ['"do spaces work?"', eq, '"do spaces work?"'],
    ['"\'(what if) a string contains : special characters\\""', eq, '"\'(what if) a string contains : special characters\\""']
  ],
  [
    "quotation",
    ["(quote a)", eq, "a"],
    ["'a", eq, "a"],
    ["(quote (1 2 3))", arrayEq, [1, 2, 3]],
    ["'(1 2 3)", arrayEq, [1, 2, 3]],
    ["(quote (a b (1 2 c)))", arrayEq, ["a", "b", [1, 2, "c"]]]
  ],
  [
    "variables",
    ["(let var 3) var", eq, 3],
    ["(let var \"an example string\")", eq, "\"an example string\""],
    ["(let var 3) (set var 4) var", eq, 4]
  ],
  [
    "primitives",
    ["(if #t 0 1)", eq, 0],
    ["(if #f 0 1)", eq, 1],
    ["(let var #t) (if var 0 1)", eq, 0],
    ["(if #f 0 (begin (print 3) #t))", eq, "#t"],
    ["(begin 0 1 '(1 2) 3)", eq, 3],
    ["((lambda (x) x) 3)", eq, 3],
    ["((lambda (x y) y) \"asdf\" \"qwer\")", eq, '"qwer"'],
    ["(((! () (! (x y z) y))) 1 2 3)", eq, 2]
  ],
  [
    "logic",
    ["(or #t #t #f)", eq, "#t"],
    ["(or #f #f #f)", eq, "#f"],
    ["(and #t #t #t #t #f)", eq, "#f"],
    ["(and #t #t #t)", eq, "#t"],
    ["(not #t)", eq, "#f"],
    ["(not #f)", eq, "#t"]
  ],
  [
    "math",
    ["3", eq, 3],
    ["3.0", eq, 3.0],
    ["(= 3 3)", eq, "#t"],
    ["(= 3 42)", eq, "#f"],
    ["(= 42 42.0)", eq, "#t"],
    ["(= -1 -1.0)", eq, "#t"],
    ["(== '(1 3 2 (6 5 7 1) 8) (quote (1 3 2 (6 5 7 1) 8)))", eq, "#t"],
    ["(== '(1 3 2 (5 4 6) 8) '(1 3 2 (5 4 6) 7))", eq, "#f"],
    ["(== + -)", eq, "#t"], // problematic if you compare objects/functions
    ["(+ 3 -3)", eq, 0],
    ["(+ 1 1 20 5 5 10)", eq, 42],
    ["(* 1 2 3)", eq, 6],
    ["(/ 3 3 3)", eq, 1/3],
    ["(- 4 1 1)", eq, 2],
    ["(+ (* 4 2) 3 (- 5 1))", eq, 15],
    ["(number? 3)", eq, "#t"],
    ["(number? \"bob\")", eq, "#f"],
    ["(integer? 3.1)", eq, "#f"],
    ["(integer? 3)", eq, "#t"],
    ["(integer? (round 3.4))", eq, "#t"],
    ["(floor 3.3)", eq, 3],
    ["(ceil 3.3)", eq, 4],
    ["(> 4 1 5 2)", eq, "#f"],
    ["(> 4 -1 -152)", eq, "#t"],
    ["(< 4 4.000000000000001 4.000000000000002)", eq, "#f"],
    ["(< 4 5 7)", eq, "#t"],
    ["(< 0 0)", eq, "#f"],
    ["(> 0 0)", eq, "#f"],
    ["(mod 82 9)", eq, 1],
    ["(sin 0)", eq, 0],
    ["(cos 0)", eq, 1],
    ["(pow 2 9)", eq, 512],
    ["(and (< 0 (random)) (> 1 (random)))", eq, "#t"],
    ["(min 4 1 3)", eq, 1],
    ["(max 4 1 3)", eq, 4]
  ],
  [
    "lists",
    ["(list? '(1 2 3))", eq, "#t"],
    ["(list? 4)", eq, "#f"],
    ["(list 1 2 \"argh\" 3)", arrayEq, [1, 2, "\"argh\"", 3]],
    ["(length (list 1 2 3))", eq, 3],
    ["(nth (list 1 2 3) 1)", eq, 2],
    ["(let l '(1 2 3)) (set-nth l 0 5) (nth l 0)", eq, 5],
    ["(car '(1 2 3))", eq, 1],
    ["(car '((1 2) 3 4))", arrayEq, [1, 2]],
    ["(cdr '(1))", arrayEq, []],
    ["(first '(1 2 3))", eq, 1],
    ["(first '(((1 1) 2) 3 4))", arrayEq, [[1, 1], 2]],
    ["(rest '(1 2 3))", arrayEq, [2, 3]],
    ["(concat '(1 2 3) '(4 5 6))", arrayEq, [1, 2, 3, 4, 5, 6]],
    ["(concat '((1)) '(2))", arrayEq, [[1], 2]],
    ["(slice '(1 2 3 4) 1 2)", arrayEq, [2]],
    ["(slice '(0 1 2 3 4 5) 3)", arrayEq, [3, 4, 5]]
  ],
  [
    "strings",
    ["(string? \"asdf\")", eq, "#t"],
    ["(string? 3)", eq, "#f"],
    ['(str-concat "abc" "def")', eq, "\"abcdef\""],
    ['(str-slice "abc" 0 1)', eq, "\"a\""],
    ['(str-slice "abc" 1)', eq, "\"bc\""]
  ],
  [
    "functions",
    // tests of basic function-related functions:
    ["(function? +)", eq, "#t"],
    ["(function? '(1 2 3))", eq, "#f"],
    ["(function? (lambda (x) x))", eq, "#t"],
    // various tortured tests of different function techiques:
    ["(let f (! (x) (! (y) (* x y)))) ((f 3) 2)", eq, 6],
    ["(let f (! (x) (if x 1 0))) (let g (! (y) (set y (f y)) y)) (g #t)", eq, 1],
    ["(let f (! (a b) b)) (f (b: 42) (a: 43))", eq, 42],
    ["(let f (! (x y z) (list x y z))) (f (z: 3) (x: 42))", arrayEq, [42, "#u", 3]],
    ["(let d (! (x) (* 2 x))) (let f (! (g x) (g x))) (f d 3)", eq, 6]
  ]
]

function performTests() {
  function testCategory(category) {
    let catName = category[0];
    for (let i = 1; i < category.length; i++) {
      let expr = category[i][0];
      let equalityTestFunc = category[i][1];
      let expectedResult = category[i][2];
      let result = JIT(expr, new Environment(false));
      if (!equalityTestFunc(expectedResult, result)) {
        resultsArray.push({"category": catName,
                           "expression": expr,
                           "expected": expectedResult,
                           "received": result});
      }
    }
  }

  let numberOfTests = -tests.length;
  for(let i = tests.length; i--;)
    numberOfTests += tests[i].length;

  let resultsArray = [];
  tests.forEach(testCategory);
  if (resultsArray.length == 0) {
    console.log("Lisk implementation successfully validated with " + numberOfTests + " tests");
    return true;
  } else {
    console.log(resultsArray.length + "/" + numberOfTests + " tests failed. Details:");
    console.log(resultsArray);
    return false;
  }
}
