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
let indexExists = false
let webREPL = false

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
  indexExists = fs.existsSync('index.js')
  if (!indexExists) {
    spinner.clear()
    console.log(chalk.yellow('Your project doesn\'t have an index.js file, please rename your main file to enable running'))
  }
  id = tokenRegex.exec(body)[0]
  spinner.clear()
  console.log(chalk.blue(id, createdREPL.href))
  return upload('.',)
}).then(() => {
  spinner.succeed()
  if (indexExists) {
    return run()
  } else {
    return Promise.resolve()
  }
}).then(() => {
  spinner.succeed()
  console.log(chalk.green('Project URL:', createdREPL.href))
  if (webREPL) {
    console.log(chalk.green('Web URL:', toWebREPL(createdREPL.href)))
  }
}).catch((error) => {
  spinner.fail()
  console.log(chalk.red(error.message))
})

const toWebREPL = (url) => {
  let id = url.replace(/((^https?:\/\/)?repl.it\/repls\/)|(\/$)/g, '')
  id = id.toLowerCase()
  id = 'https://' + id + '--five-nine.repl.co'
  return id
}

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
    },
    jar
  }).then((body) => {
    return JSON.parse(body)
  }).then((token) => {
    let stage = 0
    let finished = false
    let installingPackages = false
    return new Promise((resolve, reject) => {
      let setMainTimeout
      spinner.succeed()
      spinner = ora('Connecting to websocket').start()
      const ws = new Sockette('wss://eval.repl.it/ws', {
        timeout: 5e3,
        onopen: () => {
          setMainTimeout = () => {
            setTimeout(() => {
              if (!finished) {
                spinner.clear()
                console.log(chalk.blue('Reached 8 second timeout, so ending output'))
                finished = true
                ws.close()
                resolve()
              }
            }, 8000)
          }
          ws.json({
            command: 'auth',
            data: token
          })
        },
        onmessage: (event) => {
          if (event.type === 'message') {
            const { command, data, error } = JSON.parse(event.data)
            if (command === 'ready') {
              if (stage === 0) {
                spinner.succeed()
                spinner = ora('Running').start()
                stage++
                ws.json({
                  command: 'stop',
                  data: ''
                })
              } else if (stage === 1) {
                stage++
                ws.json({
                  command: 'reset',
                  data: ''
                })
              } else if (stage === 2) {
                ws.json({
                  command: 'eval',
                  data: fs.readFileSync('index.js').toString()
                })
                setTimeout(() => {
                  if (!installingPackages) {
                    setMainTimeout()
                  }
                }, 1000)
              }
            } else if (command === 'event:packageInstallStart') {
              spinner.text = 'Installing packages'
            } else if (command === 'event:packageInstallOutput') {
              if (data.trim()) {
                spinner.clear()
                console.log(chalk.dim(format(data.trim())))
              }
            } else if (command === 'event:packageInstallEnd') {
              spinner.succeed()
              spinner = ora('Running').start()
              setMainTimeout()
            } else if (command === 'output') {
              if (data.trim() && data.charCodeAt(0) !== 27) {
                spinner.clear()
                console.log(chalk.dim(format(stripAnsi(data.trim()))))
              }
            } else if (command === 'event:portOpen') {
              spinner.clear()
              console.log(chalk.blue('A port opened, so ending output'))
              finished = true
              webREPL = true
              ws.close()
              resolve()
            } else if (error) {
              finished = true
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