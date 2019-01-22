#!/usr/bin/env node
'use strict'

const ora = require('ora')
const request = require('request-promise-native')
const chalk = require('chalk')
const fs = require('promise-fs')
const pathLib = require('path')
const Sockette = require('@archmaster/sockette')
const stripAnsi = require('strip-ansi')

let spinner = ora('Getting create token').start()
const jar = request.jar()
const transform = (body, response) => {
  return {
    body,
    uri: response.request.uri
  }
}
const tokenRegex = /(?<="id":")([a-f0-9-]{30,})(?=")/g
const ignored = [
  'node_modules',
  '.gitignore',
  '.git',
  'yarn.lock',
  'yarn-error.log',
  'package-lock.json',
  'yarn-debug.log',
  'npm-debug.log',
  '.npm'
]
const referrer = 'https://repl.it/@FelixMattick'

let createdREPL = null
let id = null

request({
  uri: 'https://repl.it/languages/nodejs',
  headers: {
    'Referrer': referrer,
    'User-Agent': 'Mozilla/5.0'
  },
  jar,
  transform
}).then(({ body, uri }) => {
  spinner.succeed()
  spinner = ora('Uploading').start()
  createdREPL = uri
  const indexExists = fs.existsSync('index.js')
  if (!indexExists) {
    spinner.clear()
    console.log(chalk.yellow('Your project doesn\'t have an index.js file, please rename your main file'))
  }
  id = tokenRegex.exec(body)[0]
  return upload('.',)
}).then(() => {
  spinner.succeed()
  return run()
}).then(() => {
  spinner.succeed()
  console.log(chalk.green('Done!', createdREPL.href))
}).catch((error) => {
  spinner.fail()
  console.log(chalk.red(error.message))
})

const upload = (rootPath,) => {
  return fs.readdir(rootPath).then((paths) => {
    return Promise.all(paths.map((path) => {
      if (!fs.existsSync(path) || ignored.includes(pathLib.basename(path))) {
        return Promise.resolve()
      }
      return fs.lstat(path).then((stats) => {
        if (stats.isDirectory()) {
          return upload(pathLib.join(rootPath, path))
        } else {
          spinner.text = 'Getting write handler'
          let writeURI = null
          return request({
            uri: `https://repl.it/data/repls/signed_urls/${id}/${path}`,
            jar
          }).then((body) => {
            spinner.text = 'Uploading'
            const actions = JSON.parse(body)['urls_by_action']
            writeURI = actions['write']
            return fs.readFile(path)
          }).then((code) => {
            return request.put({
              uri: writeURI,
              body: code.toString(),
              jar
            })
          })
        }
      })
    }))
  })
}

const run = () => {
  spinner = ora('Getting run token')
  return request.post({
    uri: `https://repl.it/data/repls/${id}/gen_repl_token`,
    headers: {
      'Referrer': referrer
    }
  }).then((body) => {
    return JSON.parse(body)
  }).then((token) => {
    let output = ''
    return new Promise((resolve, reject) => {
      spinner.succeed()
      spinner = ora('Connecting to websocket').start()
      const ws = new Sockette('wss://eval.repl.it/ws', {
        timeout: 5e3,
        onopen: () => {
          ws.json({
            command: 'auth',
            data: token
          })
        },
        onmessage: (event) => {
          if (event.type === 'message') {
            const { command, data, error } = JSON.parse(event.data)
            if (command === 'ready') {
              spinner.succeed()
              spinner = ora('Running').start()
              ws.json({
                command: 'interpRun',
                data: ''
              })
            } else if (command === 'event:packageInstallStart') {
              spinner.text = 'Installing packages'
            } else if (command === 'event:packageInstallOutput') {
              spinner.clear()
              console.log(chalk.dim(format(data)))
            } else if (command === 'event:packageInstallEnd') {
              spinner.succeed()
              spinner = ora('Running').start()
            } else if (command === 'event:interpOutput') {
              if (data.trim() && data.charCodeAt(0) !== 27) {
                spinner.clear()
                console.log(chalk.dim(format(stripAnsi(data.trim()))))
              }
            } else if (command === 'event:interpPrompt') {
              ws.close()
              resolve()
            } else if (error) {
              ws.close()
              reject({
                message: format(error)
              })
            }
          }
        },
        onerror: (error) => {
          reject(error)
        }
      })
    })
  })
}

const format = (string) => (string[0].toUpperCase() + string.slice(1)).replace(/repl/g, 'REPL').replace(/nt/g, 'n\'t')