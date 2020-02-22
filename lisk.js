let liskOutput = [];
// ^array of output objects (in specified format).
/* Lisk drawing and printing functions send output commands here, assuming that
   the environment in which Lisk runs features code for handling them.
   Documentation for what Lisk outputs should be somewhere (probably).
*/
// (note: also possible to print directly to Javascript console with the cprint function)

let macros = {};

const stackLimit = 1 << 10; // limit number of recursive function calls before code running halts
/* ^ this allows the Lisk evaluator to notify the user of a stack overflow,
rather than only having a JS error appear in the browser's console
*/
const loopLimit = 1 << 15;

const floatingPrecision = 1e-10;

//let evals = 0;

function liskEval(expr, env) {
  //++evals;
  // expr should be a (possibly nested) array, of the type produced by parseCode
  // (if you want to eval a string, use parseCode first, or the "le" function at the defined bottom of this file)
  // expr should be a single statement
  // (if you want to eval a program consisting of many statements, use liskListEval, or just use le directly)
  if (env.stackLevel > stackLimit) {
    console.log("Stack limit (" + stackLimit + ") exceeded when evaluating expression:\n", expr);
    createErrorObj("Execution exceeded stack limit (" + stackLimit + ")", "Expression: " + expr);
    return "#u"; // #u is the undefined value (compare #t and #f for true and false respectively)
  }
  if (typeof expr != "object") { // arrays are objects, so this is a test for whether expr is an array (=list)
    if (isSelfEvaluating(expr))
      return expr;
    if (getPrimitiveProcedure(expr))
      return makeProcedure(false, expr, env);
    let varVal = env.get(expr);
    if (varVal === false) {
      createErrorObj("Unknown variable", "The \"variable\" in question: " + expr);
    }
    return varVal;
  }
  let key = expr[0]; // expression is a list
  if (key == "quote") {
    return expr[1];
  }
  if (key == "let") {
    let value = liskEval(expr[2], env);
    defineVariable(expr[1], value, env);
    return value;
  }
  if (key == "set") {
    let value = liskEval(expr[2], env);
    setVariable(expr[1], value, env);
    return value;
  }
  if (key == "if") {
    let predicate = expr[1];
    let consequent = expr[2];
    let alternative = expr[3];
    let truthValue = isTrue(liskEval(predicate, env));
    if (truthValue) {
      return liskEval(consequent, env);
    }
    if (alternative == undefined) return "#u";
    return liskEval(alternative, env);
  }
  if (key == "cond") {
    // let condExprs = expr.slice(1); // this seems unnecessary; just begin at i = 1?
    for (let i = 1, l = expr.length; i < l; ++i) {
      // let predicate = expr[i][0];
      // let consequent = expr[i].slice(1);
      if (isTrue(liskEval(expr[i][0], env))) {
        return liskListEval(expr[i], env, 1);
      }
    }
    return "#u"; // return undefined value if no matching cond expression
  }
  if (key == "begin") {
    return liskListEval(expr, env, 1); // evaluates all expressions in the list and then returns the last
  }
  if (key == "for") {
    let loopVar = expr[1];
    let i = liskEval(expr[2], env);
    let nextExpr = expr[4];
    let endExpr = expr[3];
    // let loopExprs = expr.slice(5);
    let newEnv = new Environment(env);
    let count = 0;
    defineVariable(loopVar, i, newEnv);
    let val = "#u";
    while (liskEval(endExpr, newEnv) == "#t") {
      val = liskListEval(expr, newEnv, 5);
      let nextLoopVarValue = liskEval(nextExpr, newEnv);
      setVariable(loopVar, nextLoopVarValue, newEnv);
      i = nextLoopVarValue;
      if (++count > loopLimit) {
        createErrorObj("Your for-loop looped too much:", output2String(expr));
        return "#u";
      }
    }
    return val;
  }
  if (key == "for-each") {
    let loopVar = expr[1];
    let list = liskEval(expr[2], env);
    // let loopExprs = expr.slice(3);
    let val = "#u";
    for (const item of list) {
      let newEnv = new Environment(env);
      defineVariable(loopVar, item, newEnv);
      val = liskListEval(expr, newEnv, 3);
    }
    return val;
  }
  if (key == "!") {
    let parameters = expr[1];
    if (Array.isArray(parameters)) {
      return makeProcedure(parameters, expr.slice(2), env);
    }
    return makeProcedure([parameters], expr.slice(2), env);
    // the !-based syntax for lambda is implemented by replacing "!" with "lambda" during the parsing phase (not here) MOVED IT AGAIN
  }
  if (key == "//") return "#u"; // <-- used for commenting; for instance: (// a sample comment)
  if (key == "macro") {
    macros[expr[1][0]] = new Macro(expr[1][0], expr[1], expr[2]);
    return "#u";
  }
  if (macros[key] !== undefined) {
    // ^ ... then an expression starting with key has previously been defined as some macro
    return liskEval(macros[key].expand(expr), env);
  }
  /* if none of the previous cases apply, we assume that key is a procedure,
  and apply it to the arguments in the rest of the list */
  let procedure;
  if (!isProcedure(key)) {
    procedure = liskEval(key, env);
  } else procedure = key; // <-- currently this would only happen when a for-loop is being evaluated
  if (!isProcedure(procedure)) {
    createErrorObj("Non-procedure object treated as procedure", "This is not a procedure in the current scope: " + output2String(key));
  }
  if (procedure[1].parameters === false) {
    // ^ this implies that it's a primitive procedure
    /* This is because of implementation details: primitive procedure parameters
       are not declared separately anywhere, but for defined procedures parameters
       must of course be defined, and are included in the procedure object when the
       procedure is defined (see makeProcedure)
    */
    return applyPrimitiveProcedure(procedure[1].body, expr.slice(1).map(e => liskEval(e, env)), env);
  }
  let newEnv = envWithArgs(procedure[1].parameters, expr.slice(1), procedure[1].environment, env);
  return liskListEval(procedure[1].body, newEnv);
    /* Note difference between newEnv (the environment used when executing the procedure body)
       and env (the current environment, and in which the arguments to the function are evaluated). */
    /* Arguments cannot be evaluated at this point, because named arguments are implemented and
       the differentiation between named vs unnamed arguments is done in the envWithArgs function.
       Thus env is passed to envWithArgs to allow for argument evaluation, in addition to the procedure's
       environment (which is stored because it allows for closures).*/
}

function makeProcedure(parameters, body, environment) {
  //let id = parameters == false ? "primitive" : "function";
  return [parameters ? "function" : "primitive", {
    parameters: parameters,
    body: body,
    environment: environment
  }]
}

function isProcedure(proc) {
  // not used by the interpreter (EDIT: NEVER MIND IT IS NOW)
  // (only used to enable the built-in "function?" function for identifying functions)
  return Array.isArray(proc) && (proc[0] == 'primitive' || proc[0] == 'function');
}
/*
function applyProcedure(proc, env) {
  return liskListEval(proc[1].body, env);
}
*/
function applyPrimitiveProcedure(proc, argVals, env) {
  return getPrimitiveProcedure(proc, env)(...argVals);
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
    for (const t of template) {
      if (Array.isArray(t)) {
        expanded.push(Macro.BindingReplacer(bindings, t));
      } else if (typeof t == "string" && bindings[t] != undefined) {
        expanded.push(bindings[t]);
      } else {
        expanded.push(t);
      }
    }
    return expanded;
  }
  expand(expr) {
    let bindings = Macro.BindingFinder(this.inputFormat, expr);
    return Macro.BindingReplacer(bindings, this.outputFormat); // don't pass an argument if it's not used
  }
}

class Environment {
  constructor(parentEnvironment) {
    this.vars = {};
    this.base = parentEnvironment;
    this.stackLevel = parentEnvironment.stackLevel + 1 || 0;
  }
  check(name) { // does a variable exist IN THE CURRENT FRAME?
    return this.vars[name] !== undefined;
  }
  getEnv(name) { // find a variable (if it exists) in any frame; if so, return its environment frame
    if (this.check(name)) return this;
    if (this.base) return this.base.getEnv(name);
    return false;
  }
  get(name) { // return the value of a variable if it exists, or false otherwise
    // this.getEnv is recursive; don't make it run twice.
    const envVar = this.getEnv(name);
    return envVar ? envVar.vars[name] : false;
  }
  add(name, val) { // add variable to CURRENT FRAME
    this.vars[name] = val;
  }
  set(name, val) { // changes the value of a variable (wherever in the environment it may be)
    if (this.check(name))
      this.add(name, val);
    else {
      const env = this.get(name);
      if(env)
        env.add(name, val);
      else
        this.add(name, val);
    }
  }
}

function defineVariable(name, value, env) {
  if (env.check(name)) {
    createWarnObj("Previous variable definition overriden with new variable of the same name; variable '" + name + "' has been reset from '" + env.vars[name] + "' to '" + output2String(value) + "'. Use 'set' instead of 'let' when modifying existing variables to avoid warnings.");
  }
  env.add(name, value);
}

function setVariable(name, value, env) {
  let e = env.getEnv(name);
  if (e) {
    e.vars[name] = value;
  } else {
    createErrorObj("Cannot set value of variable that has not been defined (use 'let' to define).", "Attempted to set the non-existent variable '" + name + "' to " + output2String(value));
  }
}

function envWithArgs(names, exprs, baseEnv, argEvalEnv) {
  // "baseEnv" is the environment of the procedure, argEvalEnv the environment in which the proc was called
  // these are different!
  /* exprs contains expressions, not values;
     the reason arguments are not evaled before this func is called is that
     the named args feature necessitates figuring out which part of the arg is the actual value;
     the processing of named-vs-unnamed args could in principle be done before
     envWithArgs is called (in liskEval) but oh well.
  */
  let newEnv = new Environment(baseEnv);
  let evalledArgList = [];
  for (let i = 0, l = exprs.length; i < l; ++i) {
    let e = exprs[i], value;
    if (typeof e == "object" && e[1] == ":") { // named arg of the form (argName : argVal)
      value = liskEval(e[2], argEvalEnv);
      newEnv.add(e[0], value);
    } else { // unnamed argument
      value = liskEval(e, argEvalEnv);
      newEnv.add(names[i], value);
      /* the ith argument value passed is assigned to the ith argument of the function
         regardless of whether the function call also involves named functions.*/ // you mean, named arguments?
    }
    evalledArgList.push(value);
  }
  newEnv.add("_arguments", evalledArgList);
  for (const name of names) {
    if (newEnv.check(name) === false) {
      // ^ if a function is called without an argument name being supplied, set the arg's value to #u (undefined)
      newEnv.add(name, "#u");
    }
  }
  return newEnv;
}

function isSelfEvaluating(expr) {
  return (expr[0] == '"' && expr[expr.length - 1] == '"') || typeof expr == 'number'
  //^ if expression starts and ends with a quote, it's a string
    || expr == '#t' || expr == '#f' || expr == '#u';
  //^ special values (true, false, undefined)
}

function isTrue(expr) {
  return expr !== '#f' && expr !== '#u' && expr !== 0;
}

function boolConvert(boo) {
  if (boo === true) return "#t";
  if (boo === false) return "#f";
  createErrorObj("Javascript error: boolConvert cannot convert non-boolean value to a boolean", "Value: " + output2String(boo));
  return '#u'; // gotta do something, right?
}
/*
function listOfValues(exprList, env) {
  // do not confuse with liskListEval
  return exprList.map(expr => liskEval(expr, env));
  let r = [];
  for (let i = 0; i < exprList.length; i++) {
    r.push(liskEval(exprList[i], env));
  }
  return r;
}
*/
function liskListEval(exprList, env, i = 0) {
  // do not confuse with listOfValues
  const l = exprList.length - 1;
  for (; i < l; ++i) {
    liskEval(exprList[i], env);
  }
  return liskEval(exprList[l], env);
}
/*
function isPrimitiveProcedure(procName) {
  if (getPrimitiveProcedure(procName) == false) return false;
  return true; /// why say more words when less do same
}
*/
function floatingEq(a, b) {
  return Math.abs(a - b) < floatingPrecision;
}

function arrayEq(ra, rb, nonExactEqualityTesting) {
  if(ra >= rb && rb >= ra) { // hack
    return true;
  } else if(nonExactEqualityTesting) {
    if(ra === rb) return true;
    if(ra === undefined || rb === undefined) return false;
    if(+ra.length === +rb.length) {
      for(let i = ra.length; i--;)
        if(!arrayEq(ra[i], rb[i])) return false;
      return true;
    }
    return floatingEq(ra, rb);
  }
  return false;
  /*
  let isA = Array.isArray(ra);
  let isB = Array.isArray(rb);
  if (isA !== isB) return false; // one is array and the other isn't
  if (isA === false && isB === false) {
    if (typeof ra == "number" && typeof rb == "number" && nonExactEqualityTesting) {
      return floatingEq(ra, rb);
    }
    return ra == rb;
  }
  if (ra.length !== ra.length) return false;
  for (let i = 0; i < ra.length; i++) {
    if (!arrayEq(ra[i], rb[i])) return false;
  }
  return true;
  */
}

function argsToArray(aarghs, checkFunc) { // un-nest inner functions
  /* the arguments variable available inside a Javascript function is an object
     containing fields 0, 1, ..., n set to the values of the 0th, 1st, ... nth
     argument, rather than being an array (WHY?!). Hence this function is needed
     to implement some functions below in a maximally simple manner.
  */
  // I understand your frustration, but watch:
  const arr = Array.from(aarghs);
  if(checkFunc) // since in the original code below, invalid arg type does not throw a javascript error and the while loop resumes,
    arr.forEach(checkFunc); // it should be ok to convert to array and then check for invalid arg type.
  return arr;
}
  /*
  let r = [];
  let i = 0;
  while (aarghs.hasOwnProperty(i)) {
    r.push(aarghs[i]);
    if (checkFunc !== undefined) { // checkFunc doesn't change, why check it every time?
      if (checkFunc(aarghs[i])) {
        createErrorObj("Invalid argument type.", "Primitive procedure '" + procName + "' cannot take the argument: " + aarghs[i]);
      }
    }
    ++i;
  }
  return r;
  */
/* // no longer needed
function disqualifyingCompare(disqualifier, args) {
  // let r = argsToArray(args); // why is this necessary?
  for (let i = args.length; --i;) { // arguments still have the same .length property. Unroll for speed.
    if (disqualifier(args[0], args[i])) return "#f";
  }
  return "#t";
}
*/
function strokeProps(stroke, t) {
  if (stroke != undefined) stroke = unstringify(stroke);
  if (stroke == "dash" || stroke == "dashed")
    return [[3 * t, 3 * t].join(","), "butt"];
  if (stroke == "dot" || stroke == "dotted")
    return [[0, 2 * t].join(","), "round"];
  if (stroke == "dash dot" || stroke == "dot dash")
    return [[t, 3*t, 3*t, 3*t].join(","), "butt"];
  return ["", "butt"];
}
function _lisk_draw(type, a1, a2, a3, a4, a5, a6, a7, a8, a9) { // isn't there a better way?
  const drawObj = {
    command: 'draw',
    type: unstringify(type), // if this errors, something is seriously wrong.
  };
  let strokeProp = ['', 'butt'];
  switch(drawObj.type) {
    case 'lseg':
      drawObj.type = 'line';
      drawObj.x1 = a1;
      drawObj.y1 = a2;
      drawObj.x2 = a3;
      drawObj.y2 = a4;
      drawObj.color = a5 ? unstringify(a5) : '#000000';
      drawObj.thickness = a6 == undefined ? 1 : a6;
      strokeProp = strokeProps(a7, drawObj.thickness);
      break;
    case 'circle':
      drawObj.x = a1;
      drawObj.y = a2;
      drawObj.r = a3;
      drawObj.fill = a4 ? unstringify(a4) : 'none';
      drawObj.outlineThickness = a5 == undefined ? 1 : a5;
      drawObj.outlineColor = a6 ? unstringify(a6) : '#000000';
      strokeProp = strokeProps(a7, drawObj.outlineThickness);
      break;
    case 'ellipse':
      drawObj.x = a1;
      drawObj.y = a2;
      drawObj.rx = a3;
      drawObj.ry = a4;
      drawObj.angle = a5;
      drawObj.fill = a6 ? unstringify(a6) : 'none';
      drawObj.outlineThickness = a7 == undefined ? 1 : a7;
      drawObj.outlineColor = a8 ? unstringify(a8) : '#000000';
      strokeProp = strokeProps(a9, drawObj.outlineThickness);
      break;
    case 'polygon':
      drawObj.vertices = a1;
      drawObj.fill = a2 ? unstringify(a2) : 'none';
      drawObj.outlineThickness = a3 == undefined ? 1 : a3;
      drawObj.outlineColor = a4 ? unstringify(a4) : '#000000';
      strokeProp = strokeProps(a5, drawObj.outlineThickness);
      break;
    case 'path':
      drawObj.svgPathString = unstringify(a1);
      drawObj.fill = a2 ? unstringify(a2) : 'none';
      drawObj.outlineThickness = a3 == undefined ? 1 : a3;
      drawObj.outlineColor = a4 ? unstringify(a4) : '#000000';
      strokeProp = strokeProps(a5, drawObj.outlineThickness);
      break;
    default:
      createErrorObj("Unknown draw type: " + type, "Draw arguments: " + [a1, a2, a3, a4, a5, a6, a7, a8, a9].join(", "));
  }
  drawObj.dasharray = strokeProp[0];
  drawObj.linecap = strokeProp[1];
  //console.log(drawObj);
  drawPromise.then(x => x(drawObj));
  // drawFromCommand(drawObj);
  // liskOutput.push(drawObj);
  return "#u";
}
const rad = deg => deg * Math.PI / 180;
const deg = rad => rad / Math.PI * 180;

function getPrimitiveProcedure(procName, env) {
  switch (procName) {
    // EQUALITY
    case "=": return (first, ...rest) => boolConvert(rest.every(x => arrayEq(x, first, true)));
    /*
      return function() {
        return disqualifyingCompare((base, comp) => !arrayEq(base, comp, true), arguments);
      }*/
    case "==": return (first, ...rest) => boolConvert(rest.every(x => x >= first && first >= x));
    // Note: this optimization assumes first and ...rest do not contain functions.
    // Using the old == code below, (def (f x) x) (== f f) returns "#t" but (== + +) returns "#f", which is already problematic.
    // Using the new code, all objects (including functions but not arrays) are equal to each other. (== f +) returns "#t".
    // Hopefully you won't ever need to compare two functions?
    /*
      return function() {
        return disqualifyingCompare((base, comp) => !arrayEq(base, comp, false), arguments);
      }*/
    // FUNCTION FUNCTIONS
    case "function?": return function(func) {
      return boolConvert(isProcedure(func));
    }

    // LOGIC FUNCTIONS
    case "not": return function(a) {
      return isTrue(a) ? "#f" : "#t";
    };
    case "and":
      return function() {
        return boolConvert(argsToArray(arguments).every(isTrue));
      }
    case "or":
      return function() {
        return boolConvert(argsToArray(arguments).some(isTrue));
      }

    // MATH FUNCTIONS
    case "number?": return n => boolConvert(!isNaN(n));
    case "integer?": return n => boolConvert(Number.isInteger(n));
    case "in-base":
      return function(n, b) {
        return '"' + n.toString(b) + '"';
      }
    case "num-of":
      return function(n, b = 10) {
        return parseInt(unstringify(n), b);
      }
    case "round": return Math.round;
    case "floor": return Math.floor;
    case "ceil": return Math.ceil;
    case "abs": return Math.abs;
    case ">": return (first, ...rest) => boolConvert(rest.every(x => first - x > floatingPrecision));
    /*
      return function() {
        return disqualifyingCompare((base, comp) => !(base - comp > floatingPrecision), arguments);
      }*/
    case "<": return (first, ...rest) => boolConvert(rest.every(x => x - first > floatingPrecision));
    /*
      return function() {
        return disqualifyingCompare((base, comp) => !(comp - base > floatingPrecision), arguments);
      }*/
    case "+":
      return function() {
        return argsToArray(arguments, isNaN).reduce((acc, val) => acc + val);
      }
    case "-":
      return function() {
        return argsToArray(arguments, isNaN).reduce((acc, val) => acc - val);
      }
    case "*":
      return function() {
        return argsToArray(arguments, isNaN).reduce((acc, val) => acc * val);
      }
    case "/":
      return function() {
        return argsToArray(arguments, isNaN).reduce((acc, val) => acc / val);
      }
    case "mod": return (a, b) => a % b;
    case "sin": return x => Math.sin(rad(x));
    case "cos": return x => Math.cos(rad(x));
    case "tan": return x => Math.tan(rad(x));
    case "asin": return x => deg(Math.asin(x));
    case "acos": return x => deg(Math.acos(x));
    case "atan": return x => deg(Math.atan(x));
    case "exp": return Math.exp;
    case "pow": return Math.pow;
    case "sqrt": return Math.sqrt;
    case "ln": case "log": return Math.log;
    case "random": return Math.random;
    case "min": return Math.min;
    case "max": return Math.max;

    // LIST MANIPULATION FUNCTIONS
    // (note: underlying representation for flat list is that of an array, not nested cons structure like in Lisp)
    case "list?": return r => boolConvert(Array.isArray(r));
    case "list":
      return function() {
        return argsToArray(arguments);
      }
    case "length": return r => r.length;
    case "nth": return (r, i) => r[i];
    case "set-nth":
      return function(r, i, val) {
        r[i] = val;
        return r;
      }
    case "car": case "first": return r => r[0];
    case "cdr": case "rest": return r => r.slice(1);
    // ^ car and cdr for the Lisp fans ...
    // ... but also the more sensible "first" and "rest" names are available
    case "concat": return (...args) => [].concat(...args);
    /*
      return function() {
        return argsToArray(arguments).reduce((acc, val) => acc.concat(val));
      }
      */
    case "slice":
      return function(l, s, e) {
        return l.slice(s, e);
      }
    case "reverse":
      return l => l.reverse();
    case "cons":
      return function(el, l) {
        return [el].concat(l);
      }

    // STRING FUNCTIONS
    case "string?": return str => boolConvert(typeof str === "string");
    case "str-concat":
      return function() {
        return '"'.concat(...argsToArray(arguments/*, s => typeof s === "string"*/).map(unstringify), '"');
      }
    case "str-of":
      return function(obj) {
        return '"' + String(obj) + '"';
      }
    case "str-slice":
      return function(str, start, end) {
        str = unstringify(str);
        if (end == undefined) end = str.length;
        return '"' + str.slice(start, end) + '"';
      }
    case "str-len":
      return function(str) {
        return unstringify(str).length;
      }

    // LOGGING FUNCTIONS
    case "cprint": // cprint = console print; print to JS console
      return function(x) {
        console.log(x);
        return x;
      }
    case "print": // does not print to console, but pushes print command to output list for some other program to worry about (in the case of base Schematica, this is done in index.html)
      return function(x) {
        liskOutput.push( {
          command : "print",
          text : x
        });
        return x;
      }

    // DARK MAGIC
    case "eval":
      return x => liskEval(x, env);
    case "js-eval":
      return x => eval(unstringify(x));
    case "debug":
      return function() {
        liskOutput.push( {
          command : "print",
          text : "DEBUG"
        });
        argsToArray(arguments).map(function(expr) {
          liskOutput.push( {
            command : "print",
            text : liskEval(expr, env)
          })
        });
        console.log("Debugging called; the environment object is this:");
        console.log(env);
        console.log("Variables in the current scope:");
        for (let i in env.vars) {
          console.log(i + ": " + env.vars[i]);
        }
      }

    // DRAW FUNCTIONS
    case "draw": // the primitive drawing function in Lisk
      return _lisk_draw;
    case "draw-text":
      return function(content, x, y, style, fontSize = 20, color = '"#000000"', fontFamily = '"Baskerville"') {
        let styling = "", weight = "", decoration = "";
        // let styles;
        if (style) {
          //styles = unstringify(style); // indexOf is for when you need the index; otherwise, use str.include(),
          if (style.includes("italic")) styling = "italic";
          if (style.includes("bold")) weight = "bold";
          if (style.includes("underline")) decoration = "underline";
          if (style.includes("strikethrough")) decoration = "line-through"; // could it have both?
        }
        const drawObj = {
          command: "draw",
          type : "text",
          content : unstringify(content),
          x : x,
          y : y,
          style : styling, weight : weight, decoration: decoration,
          color : unstringify(color),
          fontSize : fontSize,
          fontFamily: unstringify(fontFamily)
        };
        //console.log(drawObj);
        drawPromise.then(x => x(drawObj));
        //liskOutput.push(drawObj);
        return "#u";
      }
    case "draw-tex":
      return function(content, x, y, fontSize) {
        const drawObj = {
          command : "draw",
          type : "tex",
          x : x,
          y : y,
          fontSize : fontSize * 2,
          content : unstringify(content)
        };
        //console.log(drawObj);
        drawPromise.then(x => x(drawObj));
        //liskOutput.push(drawObj);
        return "#u";
      }
    default:
      return false;
  }
}

function unstringify(str) { // converts strings like ""stuff"" into "stuff"
  /* This is needed because in Javascript-array representation, everything (e.g. variables)
  is represented as a string (-> in quotes), while strings are in double quotes like ""this"".*/
  return str.slice(1, -1);
}


let globalEnv = new Environment(false);

function resetGlobalEnv() {
  // definitions of default variables:
  globalEnv = new Environment(false);
  [
    ["floating-precision", floatingPrecision],
    ["pi", Math.PI],
    ["e", Math.E],
    ["true", "#t"],
    ["false", "#f"],
    ["#T", "#t"],
    ["#F", "#f"],
    ["canvas-height", drawHeight], // drawHeight and -width defined in index.html
    ["canvas-width", drawWidth]
  ].forEach(x => globalEnv.add(x[0], x[1])) // Can't you use the internal functions for this instead of evoking the evaluator?
  liskOutput = [];
  macros = {};
}

// PARSING CODE

const stringToken = /"(\\?[^\\"]|\\[\\"])*"/g,
  token = /('?\(|\)|"(\\?[^\\"]|\\[\\"])*"|:|[^()\s":]+)/g;
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
          createErrorObj('Syntax Error:', `Unmatched <mark>)</mark> on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
          return false;
        }
        openPos.pop();
        break;
      case '\'':
        if(str[i + 1] === undefined || /[\s')]/.test(str[i + 1])) {
          createErrorObj('Syntax Error:', `<mark>'</mark> requires a valid operand on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
          return false;
        }
        break;
      case '"':
        createErrorObj('Syntax Error:', `Unmatched <mark>"</mark> on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
        return false;
    }
    ++column;
  }
  if(openClose) {
    [line, column] = openPos[openClose - 1];
    createErrorObj('Syntax Error:', `${openClose} unmatched <mark>(</mark>, last one on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
    return false;
  }
  return true;
};

function JIT(str, env = globalEnv) { // Just-in-time interpreter: calls liskEval as each expression is parsed
  if(!validate(str)) // This way program only have 1 expression at a time, and no need to pass back to another function.
    return false;
  const matches = str.match(token);
  if(!matches) return false; // as according to liskEval('', env)
  let temp = [], result;
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
    if(!temp.parent)
      try {
        result = liskEval(temp.pop(), env);
      } catch(err) {
        createErrorObj("Javascript error (additional information may have been logged to browser console)", err);
        throw err; // To fix the error, you must first accept the error.
      }
  }
  return result;
}

function createErrorObj(text, message) {
  liskOutput.push({command : "error",
          text : text,
          message : message});
}

function createWarnObj(text) {
  liskOutput.push({command : "warn",
          text: text});
}
/*
function arrayToString(arr) { // un-nest functions whenever possible. JavaScript doesn't remember local functions.
  let str = "[ "; // you don't want the interpreter interpreting the same function more than once.
  for (let i = 0, l = arr.length; i < l; ++i) {
    if (Array.isArray(arr[i]))
      str += arrayToString(arr[i]);
    else str += arr[i] + " ";
  }
  return str + "] ";
}
*/
function output2String(o) {
  if (Array.isArray(o))
    return '(' + o.map(output2String).join(' ') + ')';
  return o.toString();
}

/* EVALUATOR FUNCTION:

function le(code, env) {
  if (env == undefined) env = globalEnv;
  if(!validate(code))
    return;
  let parsed = parseCode(code);
  //console.log(parsed);
  for (let i = 0; i < parsed.length; i++) {
    try {
      let v = liskEval(parsed[i], globalEnv);
      if (i == parsed.length - 1) {
        liskOutput.push({command : "return",
                         value: v});
        //console.log("Result:");
        //console.log(v);
        return v;
      }
    } catch(msg) {
      console.log(msg);
      createErrorObj("Javascript error (additional information may have been logged to browser console)", msg);
    }
  }
}
*/
