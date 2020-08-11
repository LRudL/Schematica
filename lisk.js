let liskOutput = [];
// ^array of output objects (in specified format).
/* Lisk drawing and printing functions send output commands here, assuming that
   the environment in which Lisk runs features code for handling them.
   Documentation for what Lisk outputs should be somewhere (probably).
*/
// (note: also possible to print directly to Javascript console with the cprint function)

let macros = {};

const stackLimit = 4095; // limit number of recursive function calls before code running halts
/* ^ this allows the Lisk evaluator to notify the user of a stack overflow,
rather than only having a JS error appear in the browser's console
*/
const loopLimit = 65535;

const floatingPrecision = 1e-10;

function liskEval(expr, env) {
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
    if (proc[expr])
      return proc[expr];
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
    if (isTrue(liskEval(expr[1], env))) {
      return liskEval(expr[2], env);
    }
    let alternative = expr[3];
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
    let newEnv = new Environment(env);
    let loopVar = expr[1];
    let nextExpr = expr[4];
    let endExpr = expr[3];
    // let loopExprs = expr.slice(5);
    let count = 0;
    defineVariable(loopVar, liskEval(expr[2], env), newEnv);
    let val = "#u";
    while (liskEval(endExpr, newEnv) == "#t") {
      val = liskListEval(expr, newEnv, 5);
      setVariable(loopVar, liskEval(nextExpr, newEnv), newEnv);
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
  if (key == "eval") { // after like hours of refactoring code, this is where I managed to put it
    return liskEval(liskEval(expr[1], env), env); // putting eval in getPrimitiveProcedure just seems not right
  } // this does make me wonder; should eval really be like this? Why is it 2 layers of eval?
  if (key == "def") {
    const proc = makeProcedure(expr[1].slice(1), expr.slice(2), env);
    defineVariable(expr[1][0], proc, env);
    return proc;
  }
  if (key == "//") return "#u"; // <-- used for commenting; for instance: (// a sample comment)
  if (key == "macro") {
    macros[expr[1][0]] = new Macro(expr[1], expr[2]);
    return "#u";
  }
  if (macros[key] !== undefined) {
    // ^ ... then an expression starting with key has previously been defined as some macro
    return liskEval(macros[key].expand(expr), env);
  }
  /* if none of the previous cases apply, we assume that key is a procedure,
  and apply it to the arguments in the rest of the list */
  const procedure = liskEval(key, env);
  /* // does this optimization work?
  if (!isProcedure(key)) {
    procedure = liskEval(key, env);
  } else procedure = key; // <-- currently this would only happen when a for-loop is being evaluated
  */
  if(typeof procedure == 'function') {
    return procedure(...expr.slice(1).map(e => liskEval(e, env)));
  }
  if (!isProcedure(procedure)) {
    createErrorObj("Non-procedure object treated as procedure", "This is not a procedure in the current scope: " + output2String(key));
  }
  let newEnv = envWithArgs(procedure.parameters, expr.slice(1), procedure.environment, env);
  return liskListEval(procedure.body, newEnv);
    /* Note difference between newEnv (the environment used when executing the procedure body)
       and env (the current environment, and in which the arguments to the function are evaluated). */
    /* Arguments cannot be evaluated at this point, because named arguments are implemented and
       the differentiation between named vs unnamed arguments is done in the envWithArgs function.
       Thus env is passed to envWithArgs to allow for argument evaluation, in addition to the procedure's
       environment (which is stored because it allows for closures).*/
}

function makeProcedure(parameters, body, environment) {
  return { // simplify procedure. primitive procedures are now functions
    parameters: parameters,
    body: body,
    environment: environment
  };
}

function isProcedure(proc) {
  // not used by the interpreter (EDIT: NEVER MIND IT IS NOW)
  // (only used to enable the built-in "function?" function for identifying functions)
  return (typeof proc == 'function') || ((typeof proc == 'object') && proc.body !== undefined);
}

class Macro {
  constructor(inputFormat, outputFormat) {
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
  // set(name, val){} // this isn't used
}

function defineVariable(name, value, env) {
  if(proc[name]) {
    createErrorObj(`Invalid assignment to ${name}`, `Unable to override primitive function '${name}' with value '${output2String(value)}'.`);
    return;
  }
  if (env.check(name)) {
    createWarnObj(`Previous variable definition overriden with new variable of the same name; variable '${name}' has been reset from '${env.vars[name]}' to '${output2String(value)}'. Use 'set' instead of 'let' when modifying existing variables to avoid warnings.`);
  }
  env.add(name, value);
}

function setVariable(name, value, env) {
  let e = env.getEnv(name);
  if (e) {
    e.vars[name] = value;
  } else {
    createErrorObj("Cannot set value of variable that has not been defined (use 'let' to define).", `Attempted to set the non-existent variable '${name}' to '${output2String(value)}'.`);
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
  return expr !== '#f' && expr !== '#u' && expr !== 0; // empty string is considered true?
}

function boolConvert(boo) {
  if (boo === true) return "#t";
  if (boo === false) return "#f";
  createErrorObj("Javascript error: boolConvert cannot convert non-boolean value to a boolean", "Value: " + output2String(boo));
  return '#u'; // gotta do something, right?
}
function liskListEval(exprList, env, i = 0) {
  // do not confuse with listOfValues
  const l = exprList.length - 1;
  for (; i < l; ++i) {
    liskEval(exprList[i], env);
  }
  return liskEval(exprList[l], env);
}
function floatingEq(a, b) {
  return Math.abs(a - b) < floatingPrecision;
}

function arrayEq(ra, rb, nonExactEqualityTesting) {
  if(ra.body && rb.body) { // user-defined procedures
    return ra == rb;
  }
  if(ra >= rb && rb >= ra) { // hack
    return true; // this works for strings, primitive functions (get converted to strings), (nested) arrays, symbols, booleans, etc.
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
}

function argsToArray(aarghs, checkFunc, procName) { // un-nest inner functions
  /* the arguments variable available inside a Javascript function is an object
     containing fields 0, 1, ..., n set to the values of the 0th, 1st, ... nth
     argument, rather than being an array (WHY?!). Hence this function is needed
     to implement some functions below in a maximally simple manner.
  */
  // I understand your frustration, but watch:
  const arr = Array.from(aarghs);
  if(checkFunc) // since in the original code, invalid arg type does not throw a javascript error and the while loop resumes,
    // it should be ok to convert to array and then check for invalid arg type.
    arr.forEach(e => checkFunc(e) &&
      createErrorObj("Invalid argument type.", `Procedure '${procName}' cannot take the argument: ` + e));
  return arr;
}

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
      createErrorObj("Unknown draw type: " + type, `Draw arguments: ${a1}, ${a2}, ${a3}, ${a4}, ${a5}, ${a6}, ${a7}, ${a8}, ${a9}`);
  }
  drawObj.dasharray = strokeProp[0];
  drawObj.linecap = strokeProp[1];
  drawPromise.then(x => x(drawObj));
  liskOutput.push(drawObj);
  return "#u";
}
const rad = deg => deg * Math.PI / 180;
const deg = rad => rad / Math.PI * 180;

const proc = Object.create(null);
proc['='] = (first, ...rest) => boolConvert(rest.every(x => arrayEq(x, first, true)));
proc['=='] = (first, ...rest) => boolConvert(rest.every(x => arrayEq(x, first)));
proc["function?"] = func => boolConvert(isProcedure(func));
proc.not = a => isTrue(a) ? "#f" : "#t";
proc.and = (...arr) => boolConvert(arr.every(isTrue));
proc.or = (...arr) => boolConvert(arr.some(isTrue));
proc["number?"] = n => boolConvert(typeof n == 'number' && !isNaN(n)); // wow, isNaN(false) == false
proc["integer?"] = n => boolConvert(Number.isInteger(n));
proc["in-base"] = (n, b = 10) => '"' + n.toString(b) + '"';
proc["num-of"] = (n, b = 10) => parseInt(unstringify(n), b); // using parseFloat leads to NaN somewhere in the evaluation?!
proc[">"] = (first, ...rest) => boolConvert(rest.every(x => first - x > floatingPrecision));
proc["<"] = (first, ...rest) => boolConvert(rest.every(x => x - first > floatingPrecision));
proc["+"] = function() { return argsToArray(arguments, isNaN, '+').reduce((acc, val) => acc + val); };
proc["-"] = function() { return argsToArray(arguments, isNaN, '-').reduce((acc, val) => acc - val); };
proc["*"] = function() { return argsToArray(arguments, isNaN, '*').reduce((acc, val) => acc * val); };
proc["/"] = function() { return argsToArray(arguments, isNaN, '/').reduce((acc, val) => acc / val); };
proc.mod = (a, b) => a % b;
for(const fn of ["round", "floor", "ceil", "abs", "exp", "pow", "sqrt", "random", "min", "max"])
  proc[fn] = Math[fn];
proc.sin = x => Math.sin(rad(x));
proc.cos = x => Math.cos(rad(x));
proc.tan = x => Math.tan(rad(x));
proc.asin = x => deg(Math.asin(x));
proc.acos = x => deg(Math.acos(x));
proc.atan = x => deg(Math.atan(x));
proc.ln = proc.log = Math.log;
proc["list?"] = r => boolConvert(Array.isArray(r));
proc.list = (...arr) => arr;
proc.length = r => r.length;
proc.nth = (r, i) => r[i];
proc["set-nth"] = (r, i, val) => (r[i] = val, r);
proc.car = proc.first = r => r[0];
proc.cdr = proc.rest = r => r.slice(1);
proc.concat = (...args) => [].concat(...args);
proc.slice = (l, s, e) => l.slice(s, e);
proc.reverse = l => l.reverse();
proc.cons = (el, l) => [el].concat(l);
proc["string?"] = s => boolConvert(s[0] == '"' && s[s.length - 1] == '"');
proc["str-concat"] = function() {
  return '"'.concat(...argsToArray(arguments, s => s[0] != '"' || s[s.length - 1] != '"', 'str-concat').map(unstringify), '"');
};
proc["str-of"] = obj => '"' + String(obj) + '"';
proc["str-slice"] = (str, start, end = str.length - 2) => '"' + unstringify(str).slice(start, end) + '"';
proc["str-len"] = str => str.length - 2;
proc.cprint = x => (console.log(x), x);
proc.print = x => (liskOutput.push({command: "print", text: x}), x);
proc.clear = () => {editor2text.textContent = "[console cleared]"; return "#u";};
proc["js-eval"] = x => eval(unstringify(x));
/*// assuming that you don't use debug... will add back later
proc.debug = function() {
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
};
*/
proc.draw = _lisk_draw;
proc["draw-text"] = function(content, x, y, style, fontSize = 20, color = '"#000000"', fontFamily = '"Baskerville"') {
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
  liskOutput.push(drawObj);
  return "#u";
};
proc["draw-tex"] = function(content, x, y, fontSize) {
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
  liskOutput.push(drawObj);
  return "#u";
};
// moving SDL to proc[] (dangerous!)
proc["strip-cdrs"] = lst => lst.map(x => Array.isArray(x) ? x[0] : x);
proc.ng = x => -x;
proc['++'] = x => x + 1;
proc['--'] = x => x - 1;
proc['!='] = (x, y) => boolConvert(!arrayEq(x, y, true));
proc.caar = l => l[0][0];
proc.cadr = l => l.slice(1)[0];
proc.cdar = l => l[0].slice(1);
proc.cddr = l => l.slice(2);
proc.last = l => l[l.length - 1];
proc.append = (arr, ...elem) => arr.concat(elem);
proc.deg = deg;
proc.rad = rad;
proc["rand-x"] = () => Math.random() * drawWidth;
proc["rand-y"] = () => Math.random() * drawHeight;
proc["rand-point"] = () => ['coord', proc["rand-x"](), proc["rand-y"]()];
proc.coord = (x, y) => ['coord', x, y];
proc["x-of"] = p => p[1];
proc["y-of"] = p => p[2];
proc["coord?"] = p => boolConvert(p[0] == 'coord');
proc.distance = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2]);
proc["translate-coord"] = (p, dx, dy) => ['coord', p[1] + dx, p[2] + dy];

function unstringify(str) { // converts strings like ""stuff"" into "stuff"
  /* This is needed because in Javascript-array representation, everything (e.g. variables)
  is represented as a string (-> in quotes), while strings are in double (quadruple?) quotes like ""this"".*/
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
    ["tau", Math.PI * 2],
    ["pi/2", Math.PI / 2],
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

const stringToken = /"(\\?[^\\"]|\\[\\"])*"/g, specialToken = /["'\(\):]/g,
  token = /('?\(|\)|"(\\?[^\\"]|\\[\\"])*"|:|[^()\s":]+)/g,
validate = str => {
  str = str.replace(stringToken, s => s.replace(specialToken, '_'));
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
        break;
      case ':':
        let j = i - 1;
        while(/\s/.test(str[j])) --j;
        if(str[j] === undefined || str[j] == '(') {
          createErrorObj('Syntax Error:', `<mark>:</mark> requires a valid argument name on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
          return false;
        }
        j = i + 1;
        while(/\s/.test(str[j])) ++j;
        if(str[j] === undefined || str[j] == ')') {
          createErrorObj('Syntax Error:', `<mark>:</mark> requires a valid argument value on line <span style="color:#0ff">${line}</span>, column <span style="color:#0ff">${column}</span>.`);
          return false;
        }
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
      if(!isNaN(+match)) // this allows "0xf", "0o7", "0b1", "-Infinity" to be considered numbers
        match = +match; // but not "1_000", "8n" or "NaN"
      else if(match == 'lambda')
        match = '!';
      temp.push(match);
    }
    if(!temp.parent)
      try {
        result = liskEval(temp.pop(), env);
      } catch(err) {
        createErrorObj("Javascript error (additional information may have been logged to browser console)", err);
        throw err;
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
function output2String(o) {
  if (Array.isArray(o))
    return '(' + o.map(output2String).join(' ') + ')';
  return String(o);
}