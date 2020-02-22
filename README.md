# Schematica
Schematica is intended as a tool for creating diagrams or other graphics (an alternative to TikZ).

Schematica features a Lisp-based programming language that users can use to create SVG images. A (soon-to-be) extensive standard library includes countless useful functions; eventually, most things you might want to draw should be possible with a few function calls, thus reducing the requirement for the user to do much programming themselves.

You can try Schematica at https://lrudl.github.io/Schematica/

## Principles
- **The syntax is clear, sensible and consistent.**
  - Lisp-style syntax means a minimum of syntax rules.
- **The user can easily extend existing functionality and add their own features.**
  - A full programming language is made available to the user.
  - Macros allow the user to create custom syntax.
- **Simple, often-used things should be possible without forcing the user to do math or much programming.**
  - Schematica makes all standard mathematical operations available.
  - The Schematica Default Library (SDL) has functions for a growing number of things.
- **The user should have to specify only a minimal number of things.**
  - If you don't care about a specific parameter for most drawing functions in the SDL, leave it blank and the function will fill in a default or appropriate random value for you.

## Core features
- An **interpreter for a Lisp dialect** called Lisk ("LIst SKetcher"), including support for macros.
- A **default library** (the SDL) written in Lisk that makes much commonly-used functionality available immediately.
- A **code editor** (implemented using CodeMirror), featuring parenthesis highlighting, auto-indentation, and keyword colouring.
- A **console** (helpful for testing and debugging code).
- Construction and rendering of **SVG images**, as defined by Lisk code.
- **Export images** as .svg or .png files, or as TikZ code.
- **Detailed documentation** of both the Lisk language and the accompanying standard library.

### Future features
- Expansion of the SDL
- "Getting started" guide
- User interface overhaul
- Keyboard shortcuts
- Better exception-handling in Lisk
- Arcs, curves, etc.
- Support for rotation
- Grids

### Known issues
- If an ellipse is rotated, the TikZ export of the diagram will not feature a rotated ellipse (TikZ export in general is not guaranteed to work).
- Creating a line with its angle set to 0 results in an error being logged to the Lisk console (though the line does render properly).
- A circle's point-at-angle function returns the point at the negative of the given angle (also other angle inversions, e.g. relating to circle tangents).
- Nested quote expressions (e.g. `(let foo ''bar)`) causes undefined behavior.
  - The expected behavior should be setting `foo` to the list `(quote bar)`, but no implementations follow this behavior.

## Version history

### v0.4.1

- Interface
  - Added command history in the interactive console; navigate with up/down arrows.
  - Interactive console now uses a bigger font and smaller margin.
  - Saves user code in the url on run.
- Fixes
  - Correctly loads MathJax boldsymbol extension
  - Fixed degree vs radian inconsistencies

### v0.4.0

2020-01-14

- Lisk
  - New primitive function for rendering SVG paths.
  - Print functions now return the value of what they printed, instead of #u (the undefined value).
  - New primitive str-of function for converting things to strings.
- SDL
  - Added the q-bezier and c-bezier functions for drawing quadratic and cubic Bezier curves respectively.
  - Added the curve function for drawing cubic Beziers, based on start/end angles and radii (rather than control points like the c-bezier function).
  - Added the arc-from-flags and arc functions, for drawing arcs based on SVG-style flag arguments, or from mid point, radius and angles, respectively.
  - Added the arrow function for drawing arrows, as well as the c-arrow and arc-arrow for drawing cubic Bezier and arc arrows respectively.
  - Added the coord+vect function for translating a point by a distance represented by a vector.
  - Added the color-from-scale function.
  - Added the composite function.
  - New ++! and --! macros for incrementing (with modification) a variable.
  - Vector function can now take a list of the form [x y z] as an argument, in addition to the usual way of specifying two or three arguments for x, y, (and optionally z).
- Documentation updated to explain new features.
- Fixes
  - Lisk
    - Fixed bug where strings starting with a space were not handled properly.
  - SDL
    - Fixed the y-at-x function for lines.
    - Fixed line segment stroke style property not being applied to the rendered line segment.
    - Fixed some vector functions returning lists of values rather than vectors.

### v0.3.2
2020-01-02

- Lisk
  - Optimized parser.
  - Refactored and optimized evaluator.
- Libraries
  - Removed JQuery.
- Interface
  - Interactive console now only has vertical scroll bar when needed.
- Fixes
  - Bracket matching is restored.

### v0.3.1
2019-12-30

- Lisk
  - Optimized parser.
  - Syntax errors now give line and column number of the error.
  - Quotes now support escaped quotes (" \\" " no longer errors).

### v0.3.0

2019-12-13

- Lisk
  - Simplified syntax for for-loops (no longer necessary to create functions for updating the loop variable or the exit condition; also switched the positions of end and update expressions to be more consistent with other languages).
  - New primitive function for rendering text.
  - New primitive function for rendering TeX math expressions.
- SDL
  - Created a "group" macro that mimicks simple object-oriented features by allowing the user to create a collection of named properties (implemented as a function that can be called with symbols, corresponding to property names, as an argument). Groups allow specification of default values for properties.
  - All properties for stroke and text styles grouped into stroke-style and text-style.
  - All drawing functions updated to support the new stroke style -grouping system.
  - "text" and "tex" functions for normal text and TeX-typeset math respectively.
- Interface
  - Console now scrolls automatically to the bottom after input is entered.
- Exporting
  - Text and TeX math can be exported to .png, .svg, and TikZ (though TikZ export does not support all text style options, and font sizing is approximate due to limitations inherent in TikZ).
- General
  - Added MathJax library for TeX-rendering.
  - Added support for text rendering into the SVG.js-based drawing functions.
- Documentation
  - Manual updated to cover for-loop syntax, text/TeX primitives, the more convenient text/TeX functions defined in the Schematica Default Library, the group macro, and the stroke-style and text-style groups.

- Fixes
  - The return value of the library code (that is, whatever the last line in the library returns) is now cleared from the output list, so it will no longer show up in the console if you type "out" after running code.

### v0.2.0

2019-09-21

- Exporting
  - Image can be downloaded as .svg or .png.
  - Image can be exported as TikZ code.
  - The scale factor can be changed for .png export (to create a higher/lower-resolution version of the image) or for TikZ export (to change how big the copied TikZ code draws the image in your LaTeX document).
- Interface
  - Export button and export dialog added.

### v0.1.0

2019-09-19

- Lisk
  - Working interpreter for Lisk v1.0:
    - Basic Lisp primitives (quote, if, cond, let, set, lambda)
    - Macro support.
    - "for" and "for-each" expressions (mainly because these are more well-known than recursion-based iteration, and because Lisk does not currently feature tail-call elimination, which, combined with the rather limited stack size in Javascript, severely limits the possible recursion depth).
    - Automatic expansion of 'x to (quote x) and ! to lambda.
    - Basic math, equality, logic, string, and list functions (many relying directly on Javascript).
    - Debugging, commenting, and evaluation functions.
  - Test suite to verify the interpreter's functionality.
  - Logging of running times to allow for performance monitoring.
  - Automatic termination of program in case of excess recursion or looping.
- Schematica Default Library (SDL)
  - Macros for function definition and variable replacement.
  - Helper functions (mainly related to math and lists).
  - List processing functions (map, filter, accumulate, list-merge, etc.).
  - Handling of points (through the "coord" functions).
  - Handling of vectors (various constructors, vector addition, dot & cross products, perpendiculars, normalisation, etc.)
  - Lines (various constructors intersects, bound intersects, etc.)
  - Line segments
  - Circles (tangents, radial vectors, etc.)
  - Ellipses (major & minor axes)
  - Rectangles
  - Polygons
  - Bound lines and canvas dimensions made available as variables.
- Interface
  - Editor (made using CodeMirror)
  - Console
  - Canvas
  - Links to the manual and the about page.
  - Button for switching editor/canvas positions.
  - Button for showing SDL code (mainly to make development easier).
