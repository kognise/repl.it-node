# REPL.it Node

*Easily upload and deploy your projects to [REPL.it.](https://repl.it/)*

[![NPM Badge](https://img.shields.io/npm/v/@archmaster/repl.it.svg?colorB=red&style=flat-square)](https://npmjs.com/@archmaster/repl.it)

## Usage 

```bash
# Or npm i -g @archmaster/repl.it
$ yarn global add @archmaster/repl.it
$ repl
```

This will upload your application to [REPL.it.](https://repl.it/) and run it. Thanks to [@mat1](https://repl.it/@mat1) who helped me with some of the APIs.

## Different Types of REPLs

- Normal REPLs

  These are your normal, everyday REPLs. They print out some text, and exit. All the output will be logged.

- Stuck REPLs

  If a REPL doesn't give any output for 8 seconds, REPL.it Node will exit and display it's URL, to prevent hanging the command-line tool.

- Web REPLs

  These are REPLs that listen on a port. They will be assigned a URL that they are available on, which will be printed out. REPL.it Node will stop showing output from any REPL as soon as it listens on a port.

## Installing Dependencies

If you have dependencies your application requires, REPL.it will attempt to install those automatically from your `package.json`. If you don't have a `package.json` file REPL.it will try to find all the packages you import with `require()`.
