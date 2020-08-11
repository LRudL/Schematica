'use strict';
// Lisk v2, where I prematurely optimize literally everything.
const stack = Symbol('stack'), base = Symbol('base'), has = Symbol('has'), get = Symbol('get'), set = Symbol('set'),
  // reason for using symbols is that the entire string namespace is reserved for environment variables.
  // You can't save a variable named [Symbol('stack')].
  _hop = {}.hasOwnProperty, // shorthand for looking up env.has()
  epsilon = 2.3283064365386963e-10, stackLimit = 1024, loopLimit = 32768,
  floatEq = (a, b) => Math.abs(a - b) < epsilon,
  arrayEq = (a, b) => a >= b && b >= a,
  unstringify = x => x.slice(1, -1),
  rotl = (x, d) => x << d | x >>> -d,
  xoroshiro64 = (x, y) => { // deterministic random generator, helpful for drawing. Usage: (seed 777 777) (rand-int 0 10) --> 7
    const f = () => {
      const r = Math.imul(x, 0x9e3779bb) >>> 0, t = x ^ y;
      x = rotl(x, 26) ^ t ^ t << 9;
      y = rotl(t, 13);
      return r;
    };
    f.float = () => f() * epsilon;
    f.seed = (a, b) => {
      x = a;
      y = b;
    };
    return f;
  },
  replaceSymbols = output => { // probably faster to use the actual true/false boolean values while evaluating
    if(output === true) // and convert output to #t/#f/#u after evaluation. Everything should be the same.
      return '#t';
    if(output === false)
      return '#f';
    if(output === undefined)
      return '#u';
    if(Array.isArray(output))
      for(let i = output.length; i--;)
        output[i] = replaceSymbols(output[i]);
    return output;
  },
  decompile = expr => { // like arrayToString(), but can be recompiled
    if(isSelfEvaluating(expr))
      return replaceSymbols(expr);
    if(Array.isArray(expr))
      return '(' + expr.map(decompile).join(' ') + ')';
    return expr.toString();
  },
  time = (fn, ...args) => {
    console.time(fn.name);
    const res = fn(...args);
    console.timeEnd(fn.name);
    return res;
  },
  makeEnv = (baseEnv = null) => Object.create(baseEnv, { // dark magic
    [base]: { value: baseEnv }, // null has no properties, unlike false! false.__proto__ --> Boolean { false }
    [stack]: { value: baseEnv ? baseEnv[stack] + 1 : 0 } // basically, this eliminates the need for env.get(), but I have no idea whether
  }); // that's faster or just useless. It depends on how the browser optimizes the prototype chain.
// [get] actually corresponds to env.getEnv(). env.get(name) is now equivalent to env[name].
// also note that in the original lisk.js, running (let __proto__ 4) fails silently. This would fix the obscure bug.
const proc = Object.create(null), macros = Object.create(null), output = [], rand = xoroshiro64(Date.now(), performance.now());
let globalEnv;
function resetGlobal() {
  globalEnv = makeEnv();
  globalEnv[has] = function(name) { return _hop.call(this, name); };
  globalEnv[get] = function(name) { if(this[has](name)) return this; const b = this[base]; if(b) return b[get](name); return b; };
  globalEnv[set] = function(name, value) { if(this[has](name) || !this[base]) this[name] = value; else this[base][set](name, value); return value; };
  globalEnv[Symbol.toPrimitive] = function(hint) { if(hint == 'number') return this[stack]; return Object.entries(this).join(';'); };
  globalEnv['#t'] = globalEnv['#T'] = true;
  globalEnv['#f'] = globalEnv['#F'] = false;
  globalEnv['#u'] = globalEnv['#U'] = undefined;
  globalEnv.pi = Math.PI;
  globalEnv.e = Math.E;
  globalEnv.tau = Math.PI * 2;
  globalEnv['pi/2'] = Math.PI / 2;
  globalEnv['floating-precision'] = epsilon;
  globalEnv['canvas-width'] = globalEnv['canvas-height'] = globalEnv['canvas-scale'] = 900; // TODO: replace with actual values
}
resetGlobal();

// Just write (part of) the standard library in JavaScript! No need to parse the SDL every time then.
// Object property lookup is also probably faster than switch cases.
// Also, did I mention how useful the `...` (rest/spread) operator is?
proc['+'] = (...arr) => arr.reduce((a, b) => a + b);
proc['-'] = (...arr) => arr.reduce((a, b) => a - b);
proc['*'] = (...arr) => arr.reduce((a, b) => a * b);
proc['/'] = (...arr) => arr.reduce((a, b) => a / b);
proc['&'] = (...arr) => arr.reduce((a, b) => a & b);
proc['|'] = (...arr) => arr.reduce((a, b) => a | b);
proc['^'] = (...arr) => arr.reduce((a, b) => a ^ b);
proc['~'] = x => ~x;
proc['++'] = x => ++x;
proc['--'] = x => --x;
proc['>'] = (first, ...rest) => rest.every(x => first > x + epsilon); // approx
proc['<'] = (first, ...rest) => rest.every(x => first + epsilon < x);
proc['>='] = (first, ...rest) => rest.every(x => first >= x); // exact
proc['<='] = (first, ...rest) => rest.every(x => first <= x);
proc['='] = (first, ...rest) => rest.every(x => floatEq(first, x)); // approx
proc['=='] = (first, ...rest) => rest.every(x => arrayEq(first, x)); // exact
proc['!='] = (x, y) => !floatEq(x, y);
proc['!=='] = (x, y) => x != y;
proc['<<'] = (x, d) => x << d;
proc['>>'] = (x, d) => x >> d;
proc['<<<'] = rotl;
proc['>>>'] = (x, d) => x >>> d;
proc['%'] = (x, m) => x % m;
proc.ng = x => -x;
proc.ln = Math.log; // ln is log, log is log on any base, defaults to base e
proc.log = (x, y = Math.E) => Math.log(x) / Math.log(y);
proc.mod = (x, y) => x - Math.floor(x / y) * y; // mod implies the modulo operator, not the remainder operator. These are different!
proc.seed = (x = Math.random() * 4294967296 >>> 0, y = Date.now()) => rand.seed(x, y); // call without arguments to seed randomly
proc.random = (x = 0, y = 1) => rand.float() * (y - x) + x; // This way you can have both deterministic and nondeterministic randomness.
proc['rand-int'] = (x = 0, y = 4294967296) => rand() % (y - x) + x;
proc.not = x => !x;
proc.and = proc['&&'] = (...arr) => arr.every(Boolean);
proc.or = proc['||'] = (...arr) => arr.some(Boolean);
proc.xor = proc['^^'] = (...arr) => arr.reduce((a, b) => a != Boolean(b), false);
proc.length = arr => arr.length;
proc.first = proc.car = x => x[0];
proc.rest = proc.cdr = x => x.slice(1);
proc.nth = (arr, x) => arr[x];
proc['set-nth'] = (arr, x, y) => (arr[x] = y, arr);
proc.last = x => x[x.length - 1];
proc.list = (...arr) => arr;
proc.append = (arr, ...elem) => arr.concat(elem);
proc.prepend = (arr, ...elem) => elem.concat(arr);
proc.concat = (first, ...rest) => first.concat(...rest);
proc.slice = (arr, start, end) => arr.slice(start, end);
proc.cons = (elem, arr) => [elem].concat(arr);
proc.reverse = arr => arr.slice().reverse(); // make copy to avoid problems
proc['function?'] = x => typeof x == 'function'; // probably need another case for non-primitive function
proc['number?'] = x => !isNaN(x); // note: isNaN(null) == false; this should otherwise be fine.
proc['integer?'] = Number.isInteger;
proc['list?'] = Array.isArray;
proc['string?'] = x => x[0] == '"' && x[x.length - 1] == '"';
proc['undefined?'] = x => x == '#u' || typeof x == 'undefined';
proc['boolean?'] = x => x == '#f' || x == '#t' || typeof x == 'boolean';
proc.toStr = (x, base = 10) => '"' + x.toString(base) + '"';
proc.toNum = (x, base = 10) => parseFloat(unstringify(x), base);
proc['str-concat'] = (...arr) => '"'.concat(...arr.map(unstringify), '"');
proc['str-of'] = obj => '"' + String(obj) + '"';
proc['str-length'] = str => str.length - 2;
proc['str-slice'] = (str, start, end = str.length - 2) => '"' + str.slice(start + 1, end + 1) + '"';
proc.print = proc.cprint = (...arr) => console.log(...arr); // logging; TODO: hook up to liskOutput
// proc['js-eval'] = x => eval(unstringify(x)); // Danger zone but also kind of unnecessary.
for(const key of Object.getOwnPropertyNames(Math)) { // add all of Math methods that are not already defined
  if(key == 'toSource') continue; // this is a firefox thing... must remove.
  if(typeof Math[key] == 'function' && !proc[key]) // apparently Math has no enumerable properties, so can't use Object.assign
    proc[key] = Math[key]; // e.g. sin, cos, atan2, etc.
}

class Macro {
  constructor(name, inputFormat, outputFormat) {
    this.name = name;
    this.inputFormat = inputFormat;
    this.outputFormat = outputFormat;
  }
  static BindingFinder(template, input) {
    let bindings = {};
    for (let i = 0, l = template.length; i < l; ++i) {
      if (Array.isArray(template[i])) {
        Object.assign(bindings, Macro.BindingFinder(template[i], input[i]));
        // ^ merges any bindings found in the sub-array into the bindings object
      } else if (typeof template[i] == "string" && template[i][0] == "#") {
        // note: # is a special character used to indicate a "slot" for an input in a macro definition
        if (template[i].slice(-2) == "..") { // <-- It's not that bad now
          // and the award for worst special-case syntax in the world goes to ...
          bindings[template[i]] = input.slice(i);
          return bindings;
        } else {
          bindings[template[i]] = input[i];
        }
      }
    }
    return bindings;
  }
  static BindingReplacer(bindings, template) { // how was expr even used
    let expanded = [];
    for (const t of template)
      if (Array.isArray(t))
        expanded.push(Macro.BindingReplacer(bindings, t));
      else if (typeof t == "string" && bindings[t] != undefined)
        expanded.push(bindings[t]);
      else
        expanded.push(t);
    return expanded;
  }
  expand(expr) {
    let bindings = Macro.BindingFinder(this.inputFormat, expr);
    return Macro.BindingReplacer(bindings, this.outputFormat); // don't pass an argument if it's not used
  }
  /*
  toString() {
    return this.name + ` = ${decompile(this.inputFormat)} => ${decompile(this.outputFormat)}`;
  }
  */
}

const strToken = /"(\\?[^\\"]|\\[\\"])*"/g, specialToken = /["'\(\)]/g,
  token = /('?\(|\)|"(\\?[^\\"]|\\[\\"])*"|:|[^()\s":]+)/g,
validate = str => {
  str = str.replace(strToken, s => s.replace(specialToken, '_'));
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
        if(--openClose < 0)
          throw new SyntaxError(`Unmatched ) on line ${line}, column ${column}`);
        openPos.pop();
        break;
      case '\'':
        if(str[i + 1] === undefined || /[\s)]/.test(str[i + 1]))
          throw new SyntaxError(`' requires a valid operand on line ${line}, column ${column}`);
        break;
      case '"':
        throw new SyntaxError(`Unmatched " on line ${line}, column ${column}`);
    }
    ++column;
  }
  if(openClose) {
    [line, column] = openPos[openClose - 1];
    throw new SyntaxError(`${openClose} unmatched (, last one on line ${line}, column ${column}`);
  }
  return true;
}, JIT = (str, env = globalEnv, options = 4) => {
  try {
    validate(str);
  } catch(err) {
    console.warn(err);
    return false;
  }
  if(!options) // validate only, do not parse
    return true;
  const matches = str.match(token);
  if(!matches)
    return;
  let temp = ['begin'], result;
  for(let match of matches) {
  if(match == '\'(') {
      const parent = temp;
      temp = [];
      temp.parent = parent;
      parent.push(["quote", temp]); // takes advantage that (quote ()) doesn't care about any arguments after the first
    } else if(match[0] == '\'')
      temp.push(["quote", match.slice(1)]);
    else if(match == '(') {
      const parent = temp;
      temp = [];
      temp.parent = parent;
      parent.push(temp);
    } else if(match == ')')
      temp = temp.parent;
    else {
      if(!isNaN(+match))
        match = +match;
      else if(match == 'lambda')
        match = '!';
      temp.push(match);
    }
    if(options < 4)
      continue;
    if(!temp.parent) {
      let part;
      try {
        part = temp.pop();
        result = evaluate(part, env);
      } catch(err) {
        console.warn(err, decompile(part));
      }
    }
  }
  if(options == 1) // parse only, do not run
    return decompile(expr);
  if(options == 3)
    result = evaluate(expr, env);
  return replaceSymbols(result);
},
isSelfEvaluating = expr => expr === undefined || expr == '#u' || typeof expr == 'number' || expr[0] == '"' || typeof expr == 'boolean',
listEval = (exprs, env, i = 0) => {
  const l = exprs.length - 1;
  for(; i < l; ++i)
    evaluate(exprs[i], env);
  return evaluate(exprs[l], env);
};
function evaluate(expr, env) {
  if(env > stackLimit) // '>' converts env to env[stack] via env[Symbol.toPrimitive]('number')
    throw new InternalError(`too much recursion; expr = ${decompile(expr)}, env = ` + env);
  if(typeof expr != 'object') {
    if(isSelfEvaluating(expr))
      return expr;
    if(proc[expr])
      return proc[expr];
    //if(expr == 'eval')
      //return arr => evaluate(arr, env);
    if(env[has](expr) || env[expr] !== undefined)
      return env[expr];
    console.warn(new ReferenceError(expr + ' is not defined;'));
    return;
  }
  //if(Array.isArray(expr)) {
    let fn = expr[0];
    switch(fn) {
      case 'eval':
        return evaluate(evaluate(expr[1], env), env);
      case 'quote':
        return expr[1];
      case 'let':
        var value = evaluate(expr[2], env);
        if(env[expr[1]] !== undefined) // Overwriting a variable with a local variable is common practice.
          console.warn(`Redeclaration of ${expr[1]} from ${env[expr[1]]} to ` + value); // Doing so shields the base variable from unwanted side effects.
        return env[expr[1]] = evaluate(expr[2], env);
      case 'set':
        if(env[has](expr[1]) || env[expr[1]] !== undefined) // sets the variable at the correct environment frame, not overwriting.
          return env[set](expr[1], evaluate(expr[2], env));
        throw new ReferenceError(expr[1] + ' is uninitialized; env = ' + env); // is this necessary though?
      case 'if':
        return evaluate(evaluate(expr[1], env) ? expr[2] : expr[3], env);
      case 'cond':
        for(let i = 1, l = expr.length; i < l; ++i)
          if(evaluate(expr[i][0], env))
            return listEval(expr[i], env, 1);
      case 'for':
        var newEnv = makeEnv(env), count = 0, value, // problem with let/const in switch statements. var avoids this.
          i = expr[1], endExpr = expr[3], nextExpr = expr[4];
        newEnv[i] = evaluate(expr[2], env);
        while(evaluate(endExpr, newEnv)) {
          value = listEval(expr, newEnv, 5);
          newEnv[i] = evaluate(nextExpr, newEnv);
          if(++count > loopLimit)
            throw new InternalError(`too much looping; expr = ${decompile(expr)}, env = ` + env);
        }
        return value;
      case 'for-each':
        var i = expr[1], list = evaluate(expr[2], env), value;
        for(const item of list) {
          const newEnv = makeEnv(env);
          newEnv[i] = item;
          value = listEval(expr, newEnv, 3);
        }
        return value;
      case 'begin':
        return listEval(expr, env, 1);
      case '!':
      case 'lambda':
        let argNames = expr[1];
        if(!Array.isArray(argNames))
          argNames = [argNames];
        var newEnv = makeEnv(env);
        for(const name of argNames)
          newEnv[name] = undefined;
        return function lambda(args, appEnv) {
          const evalledArgs = [];
          for(let i = 0, l = args.length; i < l; ++i) {
            const arg = args[i];
            let val;
            if(Array.isArray(arg) && arg[1] == ':')
              newEnv[arg[0]] = val = evaluate(arg[2], appEnv);
            else
              newEnv[argNames[i]] = val = evaluate(arg, appEnv);
            evalledArgs.push(val);
          }
          newEnv._arguments = evalledArgs;
          const retVal = listEval(expr.slice(2), newEnv);
          // delete newEnv._arguments;
          return retVal;
        };
      case 'def': // (def (fn x y) (* x y))
        return evaluate(['let', expr[1][0], ['!', expr[1].slice(1), ...expr.slice(2)]], env);
      case 'map': // (map op list) -> new-list
        var newEnv = makeEnv(env);
        const op = expr[1], arr = evaluate(expr[2], env);
        if(!Array.isArray(arr))
          throw new TypeError(arr + ' is not a list');
        return arr.map(e => evaluate([op, e], newEnv));
      case 'draw': // TODO: hook up to lisk draw
      case 'draw-text':
      case 'draw-tex':
        return;
      case 'macro':
        //console.log(expr);
        macros[expr[1][0]] = new Macro(expr[1][0], expr[1], expr[2]);
      case '//':
        return;
      case 'debug':
        return console.log(expr, env);
      default:
        if(macros[fn]) {
          //return evaluate(macros[fn].expand(expr), env);
          console.log(decompile(expr));
          let expanded = macros[fn].expand(expr);
          console.log(fn, decompile(expanded));
          let result = evaluate(expanded, env);
          console.log('result', result);
          //console.log('recompile', decompile(evaluate(result, makeEnv(env))));
          return result;
        }
    //}
    if(typeof fn != 'function')
      fn = evaluate(fn, env);
    if(typeof fn != 'function')
      throw new TypeError(fn + ` is not a function; expr = ${decompile(expr)}, env = ` + env);
    if(fn.name == 'lambda')
      return fn(expr.slice(1), env);
    return fn(...expr.slice(1).map(x => evaluate(x, env)));
  }
};

const tests = [
  ['let', '(let x 42) (* x x)', 1764], // expected output for the first 4 tests are produced by lisk.js le()
  ['lambda/if/scope', '(let f (! (x y) (let r2 (+ (* x x) (* y y))) (sqrt r2))) (let dist (f 3 4)) (if (= r2 25) "wrong" dist)', 5],
  ['def', '(def (f x) (if (= (mod x 2) 1) (+ 1 (* 3 x)) (/ x 2))) (f 27)', 82],
  ['named args', '(def (expmod base power modulus) (mod (pow base power) modulus)) (expmod (power: 7) (modulus: 19) (base: 5))', 16],
  ['prng', '(seed 123 456) (random) (floor (random 0 65536))', 9661], // probably useful
  ['type', '(and (function? (! x x)) (number? -0.0e+1) (integer? 0xf) (string? "\\\" )\'") (boolean? #t) (list? \'(1 (2 3) 4)))', '#t'],
  ['constant', '(let e 1) e', 1],
  ['for', '(let k 0) (for i 0 (< i 10) (++ i) (set k (+ k i))) k', 45],
  ['recursion', '(def (factorial x) (if (== x 1) x (* x (factorial (- x 1))))) (factorial 5)', 120],
  ['list/composite', '(let f (! x (* x 3))) (def (g x) (+ x 1)) (def (composite fn-list) (if (= (length fn-list) 1) (car fn-list)\
    (! x ((car fn-list) ((composite (cdr fn-list)) x))))) ((composite (list f g f g)) 2)', 30],
  ['string', '(str-concat "(]:\\" \'\\\\\\"\\ " ")[:\\" ")', '\"(]:\\\" \'\\\\\\\"\\ )[:\\\" \"'],
  ['math', '(= 0 (cos (asin (- 13 (max 4 8 (min 12 16 20))))))', '#t'],
  //['quote', '(let foo \'x) (let bar \'\' x) (let baz \' \' \'x) (list foo bar baz)', ['x', ['quote', 'x'], ['quote', ['quote', 'x']]]],
  ['quote2', '(== \'(1 3 2 (6 5 7 1) 8) (quote (1 3 2 (6 5 7 1) 8)))', '#t'],
  ['map', '(map (! x (* x 2)) \'(1 2 3))', [2, 4, 6]],
  ['fn', '(let ans ((if #f + *) 3 2)) ans', 6]
], test = () => {
  for(const t of tests) {
    const r = JIT(t[1], makeEnv(globalEnv));
    console.log(t[0], r, t[2], arrayEq(r, t[2]));
  }
}
test();
/*
const groupexpr = `(def (caar l) (car (car l)))
(def (cadr l) (car (cdr l)))
(def (cdar l) (cdr (car l)))
(def (cddr l) (cdr (cdr l)))

(def (group-expr-maker val)
  (if (list? val)
    (list (list '= '--arg-- (list 'quote (car val)))
          (list 'if (list '= (car val) #u)
                (cadr val)
                (car val)))
    (list (list '= '--arg-- (list 'quote val)) val)))

(// (def (map op l)
  (def (mapper l op result-l)
    (if (= (length l) 0)
      result-l
      (mapper (rest l) op (append result-l (op (first l))))))
  (mapper l op '())))

(def (strip-cdrs lst)
  (map (! li (if (list? li)
            (car li) li))
       lst))
(macro (group #name #vals..)
  (eval (list 'def (concat (list '#name) (strip-cdrs '#vals..))
          (list '! (list '--arg--)
                (concat (list 'cond)
                        (map group-expr-maker '#vals..))))))
(group stroke-style (width 1) (color "black") (style "solid"))`;
JIT(groupexpr, globalEnv);
debugger;
const expanded = macros.group.expand(JIT('(group stroke-style (width 1) (color "black") (style "solid"))'), globalEnv, 2);
console.log(decompile(expanded))
console.log('(eval (list (quote def) (concat (list (quote stroke-style)) (strip-cdrs (quote ((width 1) (color "black")\
(style "solid"))))) (list (quote !) (list (quote --arg--)) (concat (list (quote cond)) (map group-expr-maker (quote ((width 1)\
(color "black") (style "solid"))))))))')
const out = evaluate(expanded[1], globalEnv);
*/