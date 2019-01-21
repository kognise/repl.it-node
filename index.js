#!/usr/bin/env node
'use strict'

const ora = require('ora')
const request = require('request-promise-native')
const chalk = require('chalk')
const fs = require('promise-fs')
const pathLib = require('path')

let spinner = ora('Getting token').start()
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
  'yarn.lock',
  '.gitignore',
  '.git'
]

let createdREPL = null
let writeURI = null

request({
  uri: 'https://repl.it/languages/nodejs',
  headers: {
    'Referrer': 'https://repl.it/@FelixMattick/FlawedLemonchiffonExam',
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
  const id = tokenRegex.exec(body)[0]
  return upload('.', id)
}).then(() => {
  spinner.succeed()
  console.log(chalk.green(`Created REPL: ${createdREPL.href}`))
}).catch((error) => {
  spinner.fail()
  console.log(chalk.red(error.message))
})

const upload = (rootPath, id) => {
  return fs.readdir(rootPath).then((paths) => {
    const promises = []
    for (let path of paths) {
      if (!fs.existsSync(path) || ignored.includes(pathLib.basename(path))) {
        continue
      }
      promises.push(fs.lstat(path).then((stats) => {
        if (stats.isDirectory()) {
          return upload(pathLib.join(rootPath, path), id)
        } else {
          spinner.text = 'Getting write handler'
          return request({
            uri: `https://repl.it/data/repls/signed_urls/${id}/` + path,
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
      }))
    }
    return Promise.all(promises)
  })
}