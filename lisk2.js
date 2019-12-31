'use strict';
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
  time = (fn, args) => { // record function time
    console.time(fn.name);
    const res = fn(args);
    console.timeEnd(fn.name);
    return res;
  },
  createErrorObj = console.log.bind(console), // polyfill...
  stringToken = /"(\\?[^\\"]|\\\\|\\")*"/g, // magic
  token = /('?\(|\)|"(\\?[^\\"]|\\\\|\\")*"|:|[^()\s":]+)/g, // more magic
  // ccss = ["color:white;background-color:red;","color:unset;background-color:unset;","color:yellow"], // console can be colorful! see validate()
  env = Object.create(null); // empty prototype chain
// This is the global environment variable. All SDL functions should eventually be implemented here rather than parsed every time through lisk.
// The prototype of env is null, which has no properties. This means env.toString and similar Object properties do not exist on env.
// Stack count and loop count are not implemented yet. Instead of putting it in env I think they need their own global variables.
// To create a new environment based on env, do Object.create(env). All old properties are inherited from env, but new additions will not affect env.
// I have no clue how to implement macros using this approach. Also, recursive functions don't work.
env['#f'] = env['#F'] = false; // booleans and undefined
env['#t'] = env['#T'] = true;
env['#u'] = env['#U'] = undefined;
env.pi = Math.PI; // constants
env.e = Math.E;
env.tau = Math.PI * 2;
env['pi/2'] = Math.PI / 2;
env['canvas-width'] = 960;
env['canvas-height'] = 973;
env['canvas-scale'] = 960;
env['+'] = (...arr) => arr.reduce((a, b) => a + b); // arithmetic
env['-'] = (...arr) => arr.reduce((a, b) => a - b);
env['*'] = (...arr) => arr.reduce((a, b) => a * b);
env['/'] = (...arr) => arr.reduce((a, b) => a / b);
env['='] = (...arr) => { // approximate equality
  const last = arr.pop(); // pop is more efficient than shift
  return arr.every(x => floatEq(last, x));
};
env['=='] = (...arr) => { // true equality
  const last = arr.pop(); // screw what people say; prematurely ignoring premature optimization is the root of all evil.
  return arr.every(x => last >= x && x >= last);
};
env['>'] = (...arr) => { // inequalities
  const first = arr.shift();
  return arr.every(x => first > x);
};
env['<'] = (...arr) => {
  const first = arr.shift();
  return arr.every(x => first < x);
};
env['>='] = (...arr) => {
  const first = arr.shift();
  return arr.every(x => first >= x);
};
env['<='] = (...arr) => {
  const first = arr.shift();
  return arr.every(x => first <= x);
};
env['//'] = () => undefined; // comment
env.eval = function _eval(arr) { // eval is part of environment, just like any other normal function.
  // The value of `this` changes based on what called eval. If a subenvironment calls eval, this points to that specific subenvironment.
  // This makes it suitable to store local variables.
  //debugger;
  if(!Array.isArray(arr)) // if not evaluating an expression
    return this.get(arr); // hopefully arr is self-evaluating.
  let fn = arr.shift(); // get function name, also remove it from arr. Now arr[0] is the first argument in fn.
  if(fn === undefined) // if the array is somehow empty... what do we do here?
    return; // ahhh panic
  if(Array.isArray(fn)) // if fn itself is a list - evaluate until it's not...
    fn = this.eval(fn); // might not be the best way
  if(fn == '!' || fn == 'lambda') { // defining a lambda (the hard part)
    if(Array.isArray(arr[0])) // if first argument is an array
      return this.lambda(arr.shift(), arr); // pass (args, body) into this.lambda
    return this.lambda([arr.shift()], arr); // otherwise just make it an array anyway
  }
  if(fn == 'if') // evaluate predicate, then evaluate consequent or alternative
    return this.eval(this.eval(arr[0]) ? arr[1] : arr[2]);
  if(fn == 'def') // def is just syntactic sugar for lambda; arr[0].shift() gets the function name and make arr[0] an array of argument names.
    return this[arr[0].shift()] = this.lambda(arr.shift(), arr); // arr.shift() returns arr[0] and make arr an array of function body expressions.
  if(fn == 'quote')
    return arr[0];
  for(let i = 0, l = arr.length; i < l; ++i) { // evaluate any nested expressions
    const arg = arr[i];
    if(Array.isArray(arg) && arg[1] != ':') // unless it appears to be a named argument
      arr[i] = Object.create(this).eval(arg); // Object.create(this) so that whatever happens won't affect `this`
    else if(this[arg] !== undefined) // if arg is a defined variable, return it.
      arr[i] = this[arg];
  }
  if(typeof this[fn] == 'function') // if fn is a defined function in `this`, call it.
    return this[fn](...arr);
  else if(typeof fn == 'function') // if fn is already a function, apply it in the context of `this`
    return fn.apply(this, arr);
  return fn; // what is this?? (probably wrong and buggy)
};
env.lambda = function _lambda(args, body) { // here we go!
  const subEnv = Object.create(this); // subenvironment
  for(let i = args.length; i--;)
    subEnv[args[i]] = undefined; // extend subEnv with undefined (TODO: maybe add option for default arg value?)
  return function(...arr) { // returns a function that takes multiple args
    for(let i = 0, l = Math.min(arr.length, args.length); i < l; ++i) { // for each arg in arr (supplied args), excluding those out of range
      const arg = arr[i];
      if(Array.isArray(arg) && arg[1] == ':' && args.indexOf(arg[0]) >= 0) // if arg is a named argument
        subEnv[arg[0]] = arg[2]; // fill in value of subEnv[arg[0]]
      else // The spec isn't very clear about what to do when mixing named and unnamed arguments. Hopefully no one ever does that.
        subEnv[args[i]] = arg; // fill in value of next arg
    }
    let result;
    for(const expr of body) // execute expr in order
      result = subEnv.eval(expr);
    return result;
  };
};
env.ln = Math.log;
env.log = (x, y = Math.E) => Math.log(x) / Math.log(y); // my personal preference
env.mod = (x, y) => x - Math.floor(x / y) * y; // also my personal preference; remainder and modulo are two different things.
/*
env.if = function _if(predicate, consequent, alternative) { // this isn't being used.
  return this.eval(this.eval(predicate) ? consequent : ealternative);
};
*/
// env.random = (x = 0, y = 1) => Math.random() * (y - x) + x; // you need some control over the randomness. Math.random doesn't give you any.
// env.randInt = (x = 0xffffffff) => (Math.random() * 4294967296 >>> 0) % x;
env.seed = (x = Math.random() * 4294967296 >>> 0, y = 0x5F375A86) => rand.seed(x, y); // call without arguments to seed randomly
env.random = (x = 0, y = 1) => rand.float() * (y - x) + x; // This way you can have both deterministic and nondeterministic randomness.
env.randInt = (x = 0xffffffff) => rand() % x;
env.get = function _get(x) { // get primitive value (this is probably the wrong way to do it too)
  if(typeof x == 'number' || typeof x == 'function' || (x[0] == '"' && x[x.length - 1] == '"'))
    return x;
  return this[x]; // <-- problems
};
env.let = function _let(x, y) { // sets variable; hopefully x isn't a list or something
  if(this[x] !== undefined)
    console.log(`${x} is already defined as ${this[x]} in the current scope; set is preferred for redefining a variable.`);
  return this[x] = this.eval(y);
};
env.set = function _set(x, y) { // function declaration is required because we need to use the correct `this`
  if(this[x] === undefined)
    console.log(x + ' is undefined in the current scope; let is preferred for defining a variable for the first time.');
  return this[x] = this.eval(y);
};
/* // defined in env.eval
env.def = function _def(fnarg, ...expr) {
  let name = fnarg.shift();
  if(Array.isArray(name))
    name = evaluate(name, this);
  return this[name] = this.lambda(fnarg, ...expr);
};
*/
env.not = x => !x; // logic functions
env.and = (...arr) => arr.every(x => x); // arr.every and arr.some actually follows the rules that and() -> true and or() -> false
env.or = (...arr) => arr.some(x => x);
env.xor = (...arr) => arr.reduce((a, b) => a != b, false); // It's kind of amazing that this just works with any number of arguments
env.print = (...arr) => console.log(...arr); // logging; TODO: hook up to liskOutput
env.length = arr => arr.length; // array functions
env.first = env.car = x => x[0];
env.rest = env.cdr = x => x.slice(1);
env.last = x => x[x.length - 1];
env.append = (arr, ...elem) => arr.concat(elem); // does not change arr
env.prepend = (arr, ...elem) => elem.concat(arr);
env.map = function _map(op, arr) { return arr.map(this.eval(op)); }; // problems; arr could contain defined variables and op might not take care of it.
env.filter = function _filter(op, arr) { return arr.filter(this.eval(op)); }; // TODO: go through for loop and get values first
env['list-merge'] = function _list_merge(arr1, arr2, op) { // Untested
  const l = Math.min(arr1.length, arr2.length), arr = new Array(l);
  for(let i = 0; i < l; ++i) {
    if(this[arr1[i]])
      arr1[i] = this[arr1[i]];
    if(this[arr2[i]])
      arr2[i] = this[arr2[i]];
    arr[i] = this.eval(op).apply(this, arr1[i], arr2[i]);
  }
  return arr;
};
env.concat = (...arr) => [].concat(...arr); // correct way to use concat; no need for [].reduce here.
env.reverse = arr => arr.slice().reverse(); // make copy to avoid problems
env['function?'] = (...arr) => arr.every(x => typeof x == 'function'); // type checking functions
env['number?'] = (...arr) => arr.every(x => typeof x == 'number');
env['list?'] = (...arr) => arr.every(x => Array.isArray(x));
env['string?'] = (...arr) => arr.every(x => { stringToken.lastIndex = 0; return stringToken.exec(x)[0] == x; });
env['undefined?'] = (...arr) => arr.every(x => x == '#u' || typeof x == 'undefined');
env['boolean?'] = (...arr) => arr.every(x => x == '#f' || x == '#t' || typeof x == 'boolean');
for(const key of Object.getOwnPropertyNames(Math)) { // add all of Math methods that are not already defined
  if(key == 'toSource') continue; // this is a firefox thing... must remove.
  if(typeof Math[key] == 'function' && env[key] === undefined)
    env[key] = Math[key]; // e.g. sin, cos, atan2, etc.
}

const validate = str => {
  str = str.replace(stringToken, s => s.replace(/"/g, '|').replace(/\(/g, '[').replace(/\)/g, ']'));
  let openClose = 0, line = 1, column = 1;
  const openPos = [];
  for(let i = 0, l = str.length; i < l; ++i) {
    switch(str[i]) {
      case '\n':
        ++line;
        column = 0;
        break;
      case '(':
        ++openClose;
        openPos.push([line, column]);
        break;
      case ')':
        if(--openClose < 0) {
          createErrorObj('Syntax Error:', `Unmatched <span style="color:#fff">)</span> on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
          return false;
        }
        openPos.pop();
        break;
      case '\'':
        if(str[i + 1] === undefined || /[\s')]/.test(str[i + 1])) {
          createErrorObj('Syntax Error:', `<span style="color:#fff">'</span> requires a valid operand on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
          return false;
        }
        break;
      case '"':
        createErrorObj('Syntax Error:', `Unmatched <span style="color:#fff">"</span> on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
        return false;
    }
    ++column;
  }
  if(openClose) {
    [line, column] = openPos[openClose - 1];
    createErrorObj('Syntax Error:', `${openClose} unmatched <span style="color:#fff">(</span>, last one on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
    return false;
  }
  return true;
}, parseCode = str => {
  const matches = str.match(token), program = [], path = [];
  if(matches == null) return program;
  let quoteDepth = 0, temp = program;
  for(let i = 0, l = matches.length; i < l; ++i) {
    let match = matches[i];
    if(match == '\'(') {
      temp.push(["quote", []]);
      path.push(temp.length - 1, 1);
      temp = temp[temp.length - 1][1];
      ++quoteDepth;
    } else if(match[0] == '\'')
      temp.push(["quote", match.slice(1)]);
    else if(match == '(') {
      temp.push([]);
      path.push(temp.length - 1);
      temp = temp[temp.length - 1];
      if(quoteDepth)
        ++quoteDepth;
    } else if(match == ')') {
      path.pop();
      if(quoteDepth)
        if(!--quoteDepth)
          path.pop();
      temp = program;
      for(let i = 0, l = path.length; i < l; ++i)
        temp = temp[path[i]];
    } else {
      if(!isNaN(+match))
        match = +match;
      temp.push(match);
    }
  }
  return program;
}, run = code => {
  if(!validate(code)) return;
  const program = parseCode(code), subEnv = Object.create(env); // avoid changing original env
  let result;
  for(const expr of program) // evaluate each expression in program in order, return value of the last
    result = subEnv.eval(expr);
  return result;
}, test = () => {
  const tests = [
    ['let', '(let x 42) (* x x)', 1764], // expected output for the first 4 tests are produced by lisk.js le()
    ['lambda/if/scope', '(let f (! (x y) (let r2 (+ (* x x) (* y y))) (sqrt r2))) (let dist (f 3 4)) (if (= r2 25) "wrong" dist)', 5],
    ['def', '(def (f x) (if (= (mod x 2) 1) (+ 1 (* 3 x)) (/ x 2))) (f 27)', 82],
    ['named args', '(def (expmod base power modulus) (mod (pow base power) modulus)) (expmod (power: 7) (modulus: 19) (base: 5))', 16],
    ['prng', '(seed 123 456) (random) (floor (random 0 65536))', 9661], // probably useful
    ['type', '(and (function? (! x x)) (number? -0) (string? "\\\" )\'") (boolean? #t) (list? \'(1 (2 3) 4)))', true], // probably works
    ['recursion', '(def (factorial x) (if (== x 1) x (* x (factorial (- x 1))))) (factorial 4)', 24] // <-- problems
    //['list/composite', '(def (f x) (* x 3)) (def (g x) (+ x 1)) (def (composite fns) (if (= (length fns) 1) (car fns) ((car fns) (composite (cdr fns)))))', undefined] // <-- future problems
  ];
  for(const t of tests) {
    const r = run(t[1]);
    console.log(t[0], r, t[2], r == t[2]);
  }
}
test();