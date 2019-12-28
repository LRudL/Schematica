'use strict';
const stackLimit = 1 << 10, loopLimit = 1 << 15, epsilon = 1e-10,
  token = /('?\(|\)|"(\\?[^\\"]|\\\\|\\")*"|[^()\s"]+)/g;
const time = (fn, args) => {
  console.time(fn.name);
  const res = fn(args);
  console.timeEnd(fn.name);
  return res;
}, validate = str => {
  let openClose = 0, lineNum = 1, colNum = 1;
  const openPos = [];
  for(let i = 0, l = str.length; i < l; i++) {
    if(str[i] == '\n') {
      ++lineNum;
      colNum = 0;
    } else if(str[i] == '(') {
      ++openClose;
      openPos.push([lineNum, colNum]);
    } else if(str[i] == ')') {
      if(--openClose < 0) {
        console.log(`Unmatched ')' on line ${lineNum}, column ${colNum}.`);
        return false;
      }
      openPos.pop();
    }
    ++colNum;
  }
  if(openClose) {
    [lineNum, colNum] = openPos[openPos.length - openClose];
    console.log(`Unmatched '(' on line ${lineNum}, column ${colNum}`);
    return false;
  }
  return true;
}, parse = str => {
  const matches = str.match(token), program = [], path = [];
  let quoteDepth = 0, temp = program;
  for(let i = 0, l = matches.length; i < l; i++) {
    let match = matches[i];
    if(match == '\'(') {
      let temp = program;
      for(let i = 0; i < path.length; i++)
        temp = temp[path[i]];
      temp.push(["quote", []]);
      path.push(temp.length - 1, 1);
      ++quoteDepth;
    } else if(match[0] == '\'') {
      let temp = program;
      for(let i = 0; i < path.length; i++)
        temp = temp[path[i]];
      temp.push(["quote", match.slice(1)]);
    } else if(match == '(') {
      let temp = program;
      for(let i = 0; i < path.length; i++)
        temp = temp[path[i]];
      temp.push([]);
      path.push(temp.length - 1);
      if(quoteDepth)
        ++quoteDepth;
    } else if(match == ')') {
      path.pop();
      if(quoteDepth)
        if(!--quoteDepth)
          path.pop();
    } else {
      if(!isNaN(+match))
        match = +match;
      let temp = program;
      for(let i = 0; i < path.length; i++)
        temp = temp[path[i]];
      temp.push(match);
    }
  }
  return program;
}, execute = (...arr) => { // non-nested expressions
  arr.forEach((e, i, a) => {
    if(e[0] == '\'')
      a[i] = this[e.slice(1)];
    else if(this[e])
      a[i] = this[e];
  });
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
      return arr.shift() > Math.max(...arr);
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
    case 'log':
      return Math.log(arr[1]) / Math.log(arr[0]); // (log a b) => log_a (b)
    case 'let':
      this[arr[0]] = arr[1];
      return;
    case 'quote':
      return arr;
    case 'if':
      return arr[0] ? arr[1] : arr[2];
    default:
      if(typeof Math[fn] == 'function')
        return Math[fn](...arr);

  }
}