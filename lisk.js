
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

let evals = 0;

function liskEval(expr, env) {
  ++evals;
  // expr should be a (possibly nested) array, of the type produced by parseCode
  // (if you want to eval a string, use parseCode first, or the "le" function at the defiend bottom of this file)
  // expr should be a single statement
  // (if you want to eval a program consisting of many statements, use liskListEval, or just use le directly)
  if (env.stackLevel > stackLimit) {
    console.log("Stack limit (" + stackLimit + ") exceeded when evaluating expression: ");
    console.log(expr);
    createErrorObj("Execution exceeded stack limit (" + stackLimit + ")", "Expression: " + expr);
    return "#u"; // #u is the undefined value (compare #t and #f for true and false respectively)
  }
  if (typeof expr != "object") { // arrays are objects, so this is a test for whether expr is an array (=list)
    if (isSelfEvaluating(expr)) {
      return expr;
    } else {
      if (isPrimitiveProcedure(expr)) {
        return makeProcedure(false, expr, env);
      }
      let varVal = env.get(expr);
      if (varVal === false) {
        createErrorObj("Unknown variable", "The \"variable\" in question: " + expr);
      }
      return varVal;
    }
  } else { // expression is a list
    let key = expr[0];
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
      } else {
        if (alternative == undefined) return "#u";
        return liskEval(alternative, env);
      }
    }
    if (key == "cond") {
      let condExprs = expr.slice(1);
      for (let i = 0; i < condExprs.length; i++) {
        let predicate = condExprs[i][0];
        let consequent = condExprs[i].slice(1);
        if (isTrue(liskEval(predicate, env))) {
          return liskListEval(consequent, env);
        }
      }
      return "#u"; // return undefined value if no matching cond expression
    }
    if (key == "begin") {
      return liskListEval(expr.slice(1), env); // evaluates all expressions in the list and then returns the last
    }
    if (key == "for") {
      let loopVar = expr[1];
      let i = liskEval(expr[2], env);
      let nextExpr = expr[4];
      let endExpr = expr[3];
      let loopExprs = expr.slice(5);
      let newEnv = new Environment(env);
      let count = 0;
      defineVariable(loopVar, i, newEnv);
      let val = "#u";
      while (liskEval(endExpr, newEnv) == "#t") {
        val = liskListEval(loopExprs, newEnv);
        let nextLoopVarValue = liskEval(nextExpr, newEnv);
        setVariable(loopVar, nextLoopVarValue, newEnv);
        i = nextLoopVarValue;
        ++count;
        if (count > loopLimit) {
          createErrorObj("Your for-loop looped too much:", output2String(expr));
          return "#u";
        }
      }
      return val;
    }
    if (key == "for-each") {
      let loopVar = expr[1];
      let list = liskEval(expr[2], env);
      let loopExprs = expr.slice(3);
      let val = "#u";
      for (let i = 0; i < list.length; i++) {
        let newEnv = new Environment(env);
        defineVariable(loopVar, list[i], newEnv);
        val = liskListEval(loopExprs, newEnv);
      }
      return val;
    }
    if (key == "lambda") {
      let parameters = expr[1];
      if (Array.isArray(parameters)) {
        return makeProcedure(expr[1], expr.slice(2), env);
      } else return makeProcedure([expr[1]], expr.slice(2), env);
      // the !-based syntax for lambda is implemented by replacing "!" with "lambda" during the parsing phase (not here)
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
      return applyPrimitiveProcedure(procedure[1].body, listOfValues(expr.slice(1), env), env);
    } else {
      let newEnv = envWithArgs(procedure[1].parameters, expr.slice(1), procedure[1].environment, env);
      return applyProcedure(procedure, newEnv);
      /* Note difference between newEnv (the environment used when executing the procedure body)
         and env (the current environment, and in which the arguments to the function are evaluated). */
      /* Arguments cannot be evaluated at this point, because named arguments are implemented and
         the differentiation between named vs unnamed arguments is done in the envWithArgs function.
         Thus env is passed to envWithArgs to allow for argument evaluation, in addition to the procedure's
         environment (which is stored because it allows for closures).*/
    }
  }
}

function makeProcedure(parameters, body, environment) {
  let id = parameters == false ? "primitive" : "function";
  return [id, {
    parameters: parameters,
    body: body,
    environment: environment
  }]
}

function isProcedure(proc) {
  // not used by the interpreter (EDIT: NEVER MIND IT IS NOW)
  // (only used to enable the built-in "function?" function for identifying functions)
  if (Array.isArray(proc) == false) return false;
  if (proc[0] == "primitive" || proc[0] == "function") return true;
  return false;
}

function applyProcedure(proc, env) {
  let val = liskListEval(proc[1].body, env);
  return val;
}

function applyPrimitiveProcedure(proc, argVals, env) {
  let val = getPrimitiveProcedure(proc, env).apply(null, argVals);
  return val;
}

class Macro {
  constructor(name, inputFormat, outputFormat) {
    this.name = name;
    this.inputFormat = inputFormat;
    this.outputFormat = outputFormat;
  }
  static BindingFinder(template, input) {
    let bindings = {};
    for (let i = 0; i < template.length; i++) {
      if (Array.isArray(template[i])) {
        $.extend(bindings, Macro.BindingFinder(template[i], input[i])); // replace with built-in JS Object.assign
        // ^ merges any bindings found in the sub-array into the bindings object
      } else if (typeof template[i] == "string" && template[i][0] == "#") {
        // note: # is a special character used to indicate a "slot" for an input in a macro definition
        if (template[i].slice(template[i].length - 2) == "..") {
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
  static BindingReplacer(bindings, template, expr) {
    let expanded = [];
    for (let i = 0; i < template.length; i++) {
      if (Array.isArray(template[i])) {
        expanded.push(Macro.BindingReplacer(bindings, template[i]));
      } else if (typeof template[i] == "string" && bindings[template[i]] != undefined) {
        expanded.push(bindings[template[i]]);
      } else {
        expanded.push(template[i]);
      }
    }
    return expanded;
  }
  expand(expr) {
    let bindings = Macro.BindingFinder(this.inputFormat, expr);
    return Macro.BindingReplacer(bindings, this.outputFormat, expr);
  }
}

class Environment {
  constructor(parentEnvironment) {
    this.vars = {};
    this.base = parentEnvironment;
    this.stackLevel = parentEnvironment === false ? 0 : parentEnvironment.stackLevel + 1;
  }
  check(name) { // does a variable exist IN THE CURRENT FRAME?
    if (this.vars[name] == undefined) return false;
    return true;
  }
  getEnv(name) { // find a variable (if it exists) in any frame; if so, return its environment frame
    if (this.check(name)) return this;
    if (this.base != false) return this.base.getEnv(name);
    return false;
  }
  get(name) { // return the value of a variable if it exists, or false otherwise
    return this.getEnv(name) == false ? false : this.getEnv(name).vars[name];
  }
  add(name, val) { // add variable to CURRENT FRAME
    this.vars[name] = val;
  }
  set(name, val) { // changes the value of a variable (wherever in the environment it may be)
    if (this.check(name) || this.get(name) == false) {
      this.add(name, val);
    } else {
      this.base.set(name, val);
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
  for (let i = 0; i < exprs.length; i++) {
    let e = exprs[i];
    if (typeof e == "object" && e[1] == ":") { // named arg of the form (argName : argVal)
      let value = liskEval(e[2], argEvalEnv);
      newEnv.add(e[0], value);
      evalledArgList.push(value);
    } else { // unnamed argument
      let value = liskEval(e, argEvalEnv);
      newEnv.add(names[i], value);
      evalledArgList.push(value);
      /* the ith argument value passed is assigned to the ith argument of the function
         regardless of whether the function call also involves named functions.*/
    }
  }
  newEnv.add("_arguments", evalledArgList);
  for (let i = 0; i < names.length; i++) {
    if (newEnv.check(names[i]) === false) {
      // ^ if a function is called without an argument name being supplied, set the arg's value to #u (undefined)
      newEnv.add(names[i], "#u");
    }
  }
  return newEnv;
}

function isSelfEvaluating(expr) {
  if (expr[0] == "\"" && expr[expr.length-1] == "\"") return true;
  //^ if expression starts and ends with a quote, it's a string
  if (typeof expr == "number") return true;
  if (expr == "#t" || expr == "#f" || expr == "#u") return true;
  //^ special values (true, false, undefined)
  return false;
}

function isTrue(expr) {
  if (expr === "#f" || expr === "#u" || expr === 0) return false;
  return true;
}

function boolConvert(boo) {
  if (boo === true) return "#t";
  if (boo === false) return "#f";
  createErrorObj("Javascript error: boolConvert cannot convert non-boolean value to a boolean", "Value: " + output2String(boo));
}

function listOfValues(exprList, env) {
  // do not confuse with liskListEval
  let r = [];
  for (let i = 0; i < exprList.length; i++) {
    r.push(liskEval(exprList[i], env));
  }
  return r;
}

function liskListEval(exprList, env) {
  // do not confuse with listOfValues
  for (let i = 0; i < exprList.length - 1; i++) {
    liskEval(exprList[i], env);
  }
  return liskEval(exprList[exprList.length-1], env);
}

function isPrimitiveProcedure(procName) {
  if (getPrimitiveProcedure(procName) == false) return false;
  return true;
}

function floatingEq(a, b) {
  return Math.abs(a - b) < floatingPrecision;
}

function arrayEq(ra, rb, nonExactEqualityTesting) {
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
}

function getPrimitiveProcedure(procName, env) {
  function rad(deg) {return deg * Math.PI / 180;}
  function deg(rad) {return rad / Math.PI * 180;}
  function argsToArray(aarghs, checkFunc) {
    /* the arguments variable available inside a Javascript function is an object
       containing fields 0, 1, ..., n set to the values of the 0th, 1st, ... nth
       argument, rather than being an array (WHY?!). Hence this function is needed
       to implement some functions below in a maximally simple manner.
    */
    let r = [];
    let i = 0;
    while (aarghs.hasOwnProperty(i)) {
      r.push(aarghs[i]);
      if (checkFunc !== undefined) {
        if (checkFunc(aarghs[i])) {
          createErrorObj("Invalid argument type.", "Primitive procedure '" + procName + "' cannot take the argument: " + aarghs[i]);
        }
      }
      ++i;
    }
    return r;
  }
  function disqualifyingCompare(disqualifier, args) {
    let r = argsToArray(args);
    for (let i = 1; i < r.length; i++) {
      if (disqualifier(r[0], r[i])) return "#f";
    }
    return "#t";
  }
  switch (procName) {
    // EQUALITY
    case "=":
      return function() {
        return disqualifyingCompare((base, comp) => !arrayEq(base, comp, true), arguments);
      }
    case "==":
      return function() {
        return disqualifyingCompare((base, comp) => !arrayEq(base, comp, false), arguments);
      }

    // FUNCTION FUNCTIONS
    case "function?": return function(func) {
      return boolConvert(isProcedure(func));
    }

    // LOGIC FUNCTIONS
    case "not": return function(a) {
      if (isTrue(a)) return "#f";
      return "#t";
    };
    case "and":
      return function() {
        return boolConvert(argsToArray(arguments).filter(x => !isTrue(x)).length == 0);
      }
    case "or":
      return function() {
        return boolConvert(argsToArray(arguments).filter(x => isTrue(x)).length != 0);
      }

    // MATH FUNCTIONS
    case "number?": return n => boolConvert(!isNaN(n));
    case "integer?": return n => boolConvert(Number.isInteger(n));
    case "in-base":
      return function(n, b) {
        return '"' + n.toString(b) + '"';
      }
    case "num-of":
      return function(n, b) {
        b = b == undefined? 10 : b;
        return parseInt(unstringify(n), b);
      }
    case "round": return n => Math.round(n);
    case "floor": return n => Math.floor(n);
    case "ceil": return n => Math.ceil(n);
    case "abs": return n => Math.abs(n);
    case ">":
      return function() {
        return disqualifyingCompare((base, comp) => !(base - comp > floatingPrecision), arguments);
      }
    case "<":
      return function() {
        return disqualifyingCompare((base, comp) => !(comp - base > floatingPrecision), arguments);
      }
    case "+":
      return function() {
        return argsToArray(arguments, x => isNaN(x)).reduce((acc, val) => acc + val);
      }
    case "-":
      return function() {
        return argsToArray(arguments, x => isNaN(x)).reduce((acc, val) => acc - val);
      }
    case "*":
      return function() {
        return argsToArray(arguments, x => isNaN(x)).reduce((acc, val) => acc * val);
      }
    case "/":
      return function() {
        return argsToArray(arguments, x => isNaN(x)).reduce((acc, val) => acc / val);
      }
    case "mod": return (a, b) => a % b;
    case "sin": return x => Math.sin(rad(x));
    case "cos": return x => Math.cos(rad(x));
    case "tan": return x => Math.tan(rad(x));
    case "asin": return x => deg(Math.asin(x));
    case "acos": return x => deg(Math.acos(x));
    case "atan": return x => deg(Math.atan(x));
    case "exp": return x => Math.exp(x);
    case "pow": return (x, y) => Math.pow(x, y);
    case "sqrt": return x => Math.sqrt(x);
    case "ln": case "log": return x => Math.log(x);
    case "random": return function() {return Math.random();};
    case "min": return function() {return Math.min.apply(null, argsToArray(arguments));};
    case "max": return function() {return Math.max.apply(null, argsToArray(arguments));};

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
    case "concat":
      return function() {
        return argsToArray(arguments).reduce((acc, val) => acc.concat(val));
      }
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
        return '"' + argsToArray(arguments/*, s => typeof s === "string"*/).map(unstringify).reduce((acc, val) => acc + val) + '"';
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
      return function(type, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
        function strokeProps(stroke, t) {
          if (stroke != undefined) stroke = unstringify(stroke);
          if (stroke == "dash" || stroke == "dashed") {
            return [[3 * t, 3 * t].join(","), "butt"];
          } else if (stroke == "dot" || stroke == "dotted") {
            return [[0, 2 * t].join(","), "round"];
          } else if (stroke == "dash dot" || stroke == "dot dash") {
            return [[t, 3*t, 3*t, 3*t].join(","), "butt"];
          } else {
            return ["", "butt"];
          }
        }
        let dasharray = "", linecap = "butt";
        if (type == "\"lseg\"") {
          let thickness = a6 == undefined ? 1 : a6;
          liskOutput.push( {
            command : "draw",
            type : "line",
            x1 : a1,
            y1 : a2,
            x2 : a3,
            y2 : a4,
            color : a5 == undefined ? "#000000" : unstringify(a5),
            thickness : thickness,
            dasharray : strokeProps(a7, thickness)[0],
            linecap : strokeProps(a7, thickness)[1]
          });
        } else if (type == "\"circle\"") {
          let thickness = a5 == undefined ? 1 : a5;
          liskOutput.push( {
            command : "draw",
            type : "circle",
            x : a1,
            y : a2,
            r : a3,
            fill : a4 == undefined ? "none" : unstringify(a4),
            outlineThickness : thickness,
            outlineColor : a6 == undefined ? "#000000" : unstringify(a6),
            dasharray : strokeProps(a7, thickness)[0],
            linecap : strokeProps(a7, thickness)[1]
          });
        } else if (type == "\"ellipse\"") {
          let thickness = a7 == undefined ? 1 : a7;
          liskOutput.push( {
            command: "draw",
            type : "ellipse",
            x : a1,
            y : a2,
            rx : a3,
            ry : a4,
            angle : a5,
            fill : a6 == undefined ? "none" : unstringify(a6),
            outlineThickness : thickness,
            outlineColor : a8 == undefined ? "#000000" : unstringify(a8),
            dasharray : strokeProps(a9, thickness)[0],
            linecap : strokeProps(a9, thickness)[1]
          })
        } else if (type == "\"polygon\"") {
          let thickness = a3 == undefined ? 1 : a3;
          liskOutput.push( {
            command : "draw",
            type : "polygon",
            vertices : a1,
            fill : a2 == undefined ? "none" : unstringify(a2),
            outlineThickness : thickness,
            outlineColor: a4 == undefined ? "#000000" : unstringify(a4),
            dasharray : strokeProps(a5, thickness)[0],
            linecap : strokeProps(a5, thickness)[1]
          });
        } else if (type == "\"path\"") {
          let thickness = a3 == undefined ? 1 : a3;
          liskOutput.push( {
            command : "draw",
            type : "path",
            svgPathString : unstringify(a1),
            fill : a2 == undefined ? "none" : unstringify(a2),
            outlineThickness : thickness,
            outlineColor : a4 == undefined ? "#000000" : unstringify(a4),
            dasharray : strokeProps(a5, thickness)[0],
            linecap : strokeProps(a5, thickness)[1]
          });
        } else {
          createErrorObj("Unknown draw type: " + type, "Draw arguments: " + [a1, a2, a3, a4, a5, a6, a7].join(", "));
        }
        return "#u";
      }
    case "draw-text":
      return function(content, x, y, style, fontSize, color, fontFamily) {
        let styling = "", weight = "", decoration = "";
        let styles;
        if (style != undefined) {
          styles = unstringify(style).split(" ");
          if (styles.indexOf("italic") != -1) styling = "italic";
          if (styles.indexOf("bold") != -1) weight = "bold";
          if (styles.indexOf("underline") != -1) decoration = "underline";
          if (styles.indexOf("strikethrough") != -1) decoration = "line-through";
        }
        liskOutput.push( {
          command: "draw",
          type : "text",
          content : unstringify(content),
          x : x,
          y : y,
          style : styling, weight : weight, decoration: decoration,
          color : color == undefined ?  "#000000" : unstringify(color),
          fontSize : fontSize == undefined ? 20 : fontSize,
          fontFamily: fontFamily == undefined ? "Baskerville" : unstringify(fontFamily)
        })
        return "#u";
      }
    case "draw-tex":
      return function(content, x, y, fontSize) {
        liskOutput.push( {
          command : "draw",
          type : "tex",
          x : x,
          y : y,
          fontSize : fontSize * 2,
          content : unstringify(content)
        });
        return "#u";
      }
    default:
      return false;
  }
}

function unstringify(str) { // converts strings like ""stuff"" into "stuff"
  /* This is needed because in Javascript-array representation, everything (e.g. variables)
  is represented as a string (-> in quotes), while strings are in double quotes like ""this"".*/
  return str.slice(1, str.length - 1);
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
  ].forEach(x => le("(let " + x[0] + " " + x[1] + ")"))
  liskOutput = [];
  macros = {};
}




// PARSING CODE


function parseToList(expr, start, end) {
  function closingPar(expr, i) {
    let pcount = 1;
    for (let j = i + 1; j < expr.length; j++) {
      if (expr[j] == "(") {
        ++pcount;
      } else if (expr[j] == ")") {
        --pcount;
        if (pcount == 0) return j;
      }
    }
    return false;
  }
  if (start == undefined) start = 0;
  if (end == undefined) end = expr.length;
  let r = [];
  let i = start;
  while (i < end) {
    if (expr[i] == "(") {
      let closingParentheses = closingPar(expr, i);
      if (!closingParentheses) {
        createErrorObj("Your parentheses are messed up.", "No closing parentheses found to close the parentheses at position " + i + " in the expression: " + expr.join(" "));
        return false;
      };
      r.push(parseToList(expr, i + 1, closingParentheses));
      i = closingParentheses + 1;
    } else {
      r.push(expr[i]);
      ++i;
    }
  }
  return r;
}

function removeExtraSpaces(str) {
  let i = 1;
  while (i < str.length) {
    if (str[i] == " " && str[i - 1] == " ") {
      str = str.slice(0, i) + str.slice(i + 1);
    } else {
      ++i;
    }
  }
  return str;
}

function separateChars(str, chars) {
  /* The way the code string is converted into an array is by doing .split(" ")
     on the code; for this to work, this function is needed to separate e.g. parentheses with spaces
     from everything else.
  */
  function separateChar(str, char) {
    function checkSides(str, i) {
      let sides = [0, 0];
      if (str[i-1] !== " " && str[i-1] !== undefined) sides[0] = 1; // undefined takes care of case where i=0 and str[i] = undef
      if (str[i+1] !== " " && str[i+1] !== undefined) sides[1] = 1;
      return sides;
    }
    let i = 0;
    let isInsideQuote = false;
    while (i < str.length) {
      if (str[i] == char && isInsideQuote === false) {
        let sides = checkSides(str, i);
        let replacement = " ".repeat(sides[0]) + str[i] + " ".repeat(sides[1]);
        str = str.slice(0, i) + replacement + str.slice(i + 1);
        i += sides[0] + sides[1];
      }
      if (str[i] == '"') {
        isInsideQuote = !isInsideQuote;
      }
      ++i;
    }
    return str;
  }
  for (let i = 0; i < chars.length; i++) {
    str = separateChar(str, chars[i]);
  }
  return str;
}

function joinStrings(r, start) {
  /* The parsing step of space-based splitting splits multi-word strings into pieces;
     this function runs after the splitting step to rejoin long strings.
     (Smarter splitting logic would remove the need for this,
     but of course then the splitting logic would be more complex.)
  */
  if (start == undefined) start = 0;
  for (let i = start; i < r.length; i++) {
    if (r[i][0] === '"' && (r[i][r[i].length-1] !== '"' || r[i].length == 1)) {
      // ^ this implies a string like ["example string"] has been split into two elements: ["example] and [string"]
      r = r.slice(0, i).concat(r[i] + " " + r[i + 1]).concat(r.slice(i + 2));
      // ^ creates an array where the element in which the string starts and the element after it are now joined
      return joinStrings(r, i);
      // ^ repeat process after merging the two elements (starts at i for a slight efficiency boost)
    }
  }
  return r;
}

/*function recursiveReplacer(list, predicate, func) {
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] == "object") { // -> is list[i] a sublist?
      list[i] = recursiveReplacer(list[i], predicate, func);
    } else {
      if (predicate(list[i])) {
        list[i] = func(list[i]);
      }
    }
  }
  return list;
}*/

function recursiveReplacer(list, predicate, func) {
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] != "string") { // -> is list[i] a sublist?
      list[i] = recursiveReplacer(list[i], predicate, func);
    } else {
      if (predicate(list[i])) {
        let res = func(list, i); // I thought this bit of abstraction was necessary, but it turned out to not be
        list = res[0];           // So the above commented-out version of this function is perfectly fine
        i = res[1];              // But switching back would require changing things below
      }                          // And something something premature optimisation something something
    }
  }
  return list;
}

function parseCode(code) {
  // Nothing to see here, just move on ...
  let parsed = recursiveReplacer( // 8. Replace ! with lambda
                recursiveReplacer( // 7. Expand 'expr into (quote expr)
                  recursiveReplacer( // 6. Replace number strings with numbers ("42" -> 42)
                    parseToList( // 5. Convert the depth-1 array of all tokens in the code into a nested array
                      joinStrings( // 4. If a string has been broken across many array elements (because it has spaces), rejoin it
                        separateChars(
                            code,
                            ["(", ")", ":", "'"])
                          // ^ 1. Separate special characters from others with spaces
                          .split(" ") // 2. Split string into array
                          .filter(function(str) { // 3. Remove all whitespace-only elements from array
                            return /\S/.test(str); // (there shouldn't be any but better be safe ... ?)
                        }))),
                    x => parseFloat(x) == x, // test for whether string represents a number
                    function(list, i) {
                      list[i] = parseFloat(list[i]);
                      return [list, i];
                    }),
                x => x == "'",
                function(list, i) {
                  list[i] = ["quote", list[i + 1]];
                  list = list.slice(0, i + 1).concat(list.slice(i + 2));
                  return [list, i];
                }),
              x => x == "!",
              function(list, i) {
                list[i] = "lambda";
                return [list, i];
              });
  // console.log(parsed);
  return parsed;
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
  function arrayToString(arr) {
    let str = "[ ";
    for (let i = 0; i < arr.length; i++) {
      if (Array.isArray(arr[i])) {
        str += arrayToString(arr[i]);
      } else str += arr[i] + " ";
    }
    return str + "] ";
  }
  if (Array.isArray(o)) o = arrayToString(o);
  return o;
}


// EVALUATOR FUNCTION:

function le(code, env) {
  if (env == undefined) env = globalEnv;
  let parsed = parseCode(code);
  //console.log("Parsed code: ");
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
