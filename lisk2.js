'use strict';
/* Note:
I'm only committing this file right now so that you don't need to resolve merge conflicts.
I actually already removed the jquery dependency on my branch, which didn't cause any problems.
parse(libraryCode) is *only* twice as fast as running parseCode(libraryCode) on Firefox, and it's not
producing the exact output yet, but I think it will do better in the long run. Also, just running
the regex took about half the time.
*/
const stackLimit = 1 << 10, loopLimit = 1 << 15, epsilon = 1e-10, // epsilon is the true error term. STATS/ECON KNOWLEDGE
  floatEq = (a, b) => Math.abs(a - b) < epsilon,
  rotl = (x, d) => (x << d) | (x >>> (32 - d)),
  xoroshiro64 = (x, y) => { // gotta need some sort of seeded deterministic random generator
    const f = () => { // especially for drawing applications
      const r = Math.imul(x, 0x9E3779BB) >>> 0, t = x ^ y;
      x = rotl(x, 26) ^ t ^ (t << 9);
      y = rotl(t, 13);
      return r;
    };
    f.float = () => f() * 2.3283064365386963e-10;
    f.seed = (a, b) => {
      x = a;
      y = b;
    };
    return f;
  },
  rand = xoroshiro64(Date.now(), performance.now()),
  stringToken = /"(\\?[^\\"]|\\\\|\\")*"/g, // magic
  token = /('?\(|\)|"(\\?[^\\"]|\\\\|\\")*"|[^()\s"]+)/g, // more magic
  ccss = ["color:white;background-color:red;","color:unset;background-color:unset;","color:yellow"], // console can be colorful! see validate()
  env = Object.create(null);
env['+'] = arr => arr.reduce((a, b) => a + b);
env['-'] = arr => arr.reduce((a, b) => a - b);
env['*'] = arr => arr.reduce((a, b) => a * b);
env['/'] = arr => arr.reduce((a, b) => a / b);
env['='] = arr => {
  const last = arr.pop(); // pop is more efficient than shift
  return arr.every(x => floatEq(last, x));
};
env['=='] = arr => {
  const last = arr.pop();
  return arr.every(x => last >= x && x >= last);
};
env['>'] = arr => {
  const first = arr.shift();
  return arr.every(x => first > x);
};
env['<'] = arr => {
  const first = arr.shift();
  return arr.every(x => first < x);
};
env['>='] = arr => {
  const first = arr.shift();
  return arr.every(x => first > x);
};
env['<='] = arr => {
  const first = arr.shift();
  return arr.every(x => first < x);
};
env.mod = (x, y) => x - Math.floor(x / y) * y;
env.ln = Math.log;
env.log = (x, y = Math.E) => Math.log(x) / Math.log(y);
env.if = (predicate, consequent, alternative) => predicate ? consequent : alternative;
env.quote = x => x;
env.seed = (x = Date.now(), y = 0x5F375A86) => rand.seed(x, y);
env.random = (x = 0, y = 1) => rand.float() * (y - x) + x;
env.randInt = (x = 0xffffffff) => rand() % x;

const time = (fn, args) => { // record function time
  console.time(fn.name);
  const res = fn(args);
  console.timeEnd(fn.name);
  return res;
}, validate = str => { // checks if the lisk code has no obvious syntax errors, returns true if none found and false otherwise.
  str = str.replace(stringToken, s => s.replace(/"/g, '|').replace(/\(/g, '[').replace(/\)/g, ']')); // replace string literals with placeholders
  let openClose = 0, line = 1, column = 1; // line/column number is more helpful than index
  const openPos = [];
  for(let i = 0, l = str.length; i < l; i++) {
    switch(str[i]) {
      case '\n': // newline: increase line and reset column
        ++line;
        column = 0;
        break;
      case '(':
        ++openClose;
        openPos.push([line, column]); // keep track of every ('s position in case they're unmatched.
        break;
      case ')':
        if(--openClose < 0) { // open - close can't be negative
          console.log(`Unmatched %c)%c on line %c${line}%c, column %c${column}%c.`, ccss[0], ccss[1], ccss[2], ccss[1], ccss[2], ccss[1]);
          return false; // %c is a css styling directive in console, which get replaced by the corresponding css rules.
        }
        openPos.pop();
        break;
      case '\'': // can't follow a ' with any whitespace, ), end of script, or another '
        if(str[i + 1] === undefined || /[\s')]/.test(str[i + 1])) {
          console.log(`%c'%c requires a valid operand on line %c${line}%c, column %c${column}%c.`, ccss[0], ccss[1], ccss[2], ccss[1], ccss[2], ccss[1]);
          return false;
        }
        break;
      case '"': // my regex *should* always work, so any leftover " is unmatched... I think...
        console.log(`Unmatched %c"%c on line %c${line}%c, column %c${column}%c.`, ccss[0], ccss[1], ccss[2], ccss[1], ccss[2], ccss[1]);
        return false;
    }
    ++column;
  }
  if(openClose) { // there are still unclosed (, look back at first unmatched
    [line, column] = openPos[openPos.length - openClose];
    console.log(`Unmatched %c(%c on line %c${line}%c, column %c${column}%c.`, ccss[0], ccss[1], ccss[2], ccss[1], ccss[2], ccss[1]);
    return false;
  }
  return true;
}, parse = str => { // This algorithm parses nested lisk expressions WITHOUT USING RECURSION (REEEEE)
  const matches = str.match(token), program = [], path = []; // break down str into tokens; keep everything in an array;
  // path gives the last position in the program where the last insertion happened.
  // it tells you where to insert the next element and how deep into the nested array we are.
  // i.e. if program = [1, [2, [3], 4], 5] and path = [1, 1], the next insertion will go in the same array as 3.
  let quoteDepth = 0, temp = program; // quoteDepth deals with converting '() to (quote ()), only used on lists and not symbols
  // temp keeps up with the current insertion array within program
  for(let i = 0, l = matches.length; i < l; i++) {
    let match = matches[i];
    if(match == '\'(') { // encountering a quoted list
      temp.push(["quote", []]); // push (quote ())
      path.push(temp.length - 1, 1); // update path: new path is the inner ()
      temp = temp[temp.length - 1][1]; // temp is now the ()
      ++quoteDepth; // quoteDepth is nonzero; it now counts when it exits the quoted list
    } else if(match[0] == '\'') { // encountering a symbol
      temp.push(["quote", match.slice(1)]); // just push the quoted symbol
    } else if(match == '(') { // encountering a list
      temp.push([]); // push ()
      path.push(temp.length - 1); // update path: new path is the () that was just pushed
      temp = temp[temp.length - 1]; // temp is now the () to insert into
      if(quoteDepth) // if we're already in quote mode, increase quoteDepth.
        ++quoteDepth; // so that we don't accidently leave quote mode too early
    } else if(match == ')') { // leaving a list
      path.pop(); // remove deepest path
      if(quoteDepth) // if we're in quote mode, rise one level out of it
        if(!--quoteDepth) // if that's the last level (quoteDepth = 0), we've exited quote mode. pop again to leave the (quote) layer.
          path.pop();
      temp = program; // we need to upate temp, because it's no longer at the relevant layer.
      for(let i = 0; i < path.length; i++) // since we can't find its parent list, just find it from program via the path
        temp = temp[path[i]]; // this works regardless of whether we were just exiting quote mode
    } else { // encountering some token.
      if(!isNaN(+match)) // convert numerals to number if possible
        match = +match;
      temp.push(match); // push self-evaluating token
    }
  }
  return program; // there, a nested array.
}, execute = arr => { // for non-nested expressions. This has not been used/tested.
  /*
  arr.forEach((e, i, a) => {
    if(e[0] == '\'')
      a[i] = this[e.slice(1)];
    else if(this[e])
      a[i] = this[e];
  });
  */
  const fn = arr.shift();
  switch(fn) {
    case '//':
      return;
    case '=':
      return Math.abs(arr[0] - arr[1]) < epsilon;
    case '==':
      if(Array.isArray(arr[0]) == Array.isArray(arr[1])) // both arr/both number: ok
        return arr[0] >= arr[1] && arr[1] >= arr[0]; // problem is 1 >= [1] >= 1
      return false;
    case '+':
      return arr.reduce((a, b) => a + b);
    case '-':
      return arr.reduce((a, b) => a - b);
    case '*':
      return arr.reduce((a, b) => a * b);
    case '/':
      return arr.reduce((a, b) => a / b);
    case '>':
      return arr.shift() > Math.max(...arr); // UNTESTED, MIGHT BE BUGGY
    case '<':
      return arr.shift() < Math.min(...arr);
    case '>=':
      return arr.shift() >= Math.max(...arr);
    case '<=':
      return arr.shift() <= Math.min(...arr);
    case 'mod':
      return arr[0] - Math.floor(arr[0] / arr[1]) * arr[1];
    case 'ln':
      return Math.log(arr[0]);
    case 'log': // I like this design better: ln is log, log is log with any base
      return Math.log(arr[1]) / Math.log(arr[0] || Math.E); // (log a b) => log_a (b)
    case 'let':
      this[arr[0]] = arr[1]; // haven't really thought about how to implement variable scope/environment
      return;
    case 'quote':
      return arr;
    case 'if':
      return arr[0] ? arr[1] : arr[2];
    default:
      if(typeof Math[fn] == 'function')
        return Math[fn](...arr);

  }
}, evaluate = arr => {
  if(arr.some(x => Array.isArray(x))) {
    let fn = arr.shift();
    if(this[fn])
      fn = this[fn];
    else
      console.log('Unknown function ' + fn);
    for(let i = 0, l = arr.length; i < l; i++)
      if(this[arr[i]])
        arr[i] = this[arr[i]];
      else if(Array.isArray(arr[i]))
        arr[i] = evaluate(arr[i]);
    return fn.bind(this, arr);
  } else {
    return execute.bind(this, arr);
  }
}, test = () => {
  const strs = [
    '(a \'(0 (1 2)) b) (c d (e) \'f)',
    `(let bound-lines
     (map (! (pair)
             (let p0 (nth pair 0))
             (let p1 (nth pair 1))
             (cline-from-points
              (x-of p0) (y-of p0)
              (x-of p1) (y-of p1)))
          (pair-adjacents
           (append canvas-corners
                   (first canvas-corners)))))`,
    `(def (list-merge a b op)
  (def (merger a b op res)
    (if (= (length a) 0)
      res
      (merger (rest a) (rest b) op
        (concat res (list (op (first a) (first b)))))))
  (merger a b op '()))

(def (pair-adjacents l)
  (def (pairer l n res)
    (if (= n (length l))
      res
      (pairer l (++ n)
              (append res
                      (list (nth l (-- n))
                            (nth l n))))))
  (pairer l 1 '()))`
  ];
  for(let i = 3; i--;)
    console.log(validate(strs[i]));
  for(let i = 3; i--;)
    console.log(parse(strs[i]).toSource());
};
test();
// console.log(time(parse,libraryCode).toSource()); // should parse the standard library in ~8ms