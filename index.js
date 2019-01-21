#!/usr/bin/env node
'use strict'

const ora = require('ora')
const request = require('request-promise-native')
const chalk = require('chalk')

let spinner = ora('Getting token').start()
const jar = request.jar()
const transform = (body, response) => {
  return {
    body,
    uri: response.request.uri
  }
}
const tokenRegex = /(?<="id":")([a-f0-9-]{30,})(?=")/g

let createdREPL = null

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
  spinner = ora('Getting write handler').start()
  createdREPL = uri
  const id = tokenRegex.exec(body)[0]
  return request({
    uri: `https://repl.it/data/repls/signed_urls/${id}/index.js`,
    jar
  })
}).then((body) => {
  spinner.succeed()
  spinner = ora('Uploading code...').start()
  const actions = JSON.parse(body)['urls_by_action']
  const writeURI = actions['write']
  return request.put({
    uri: writeURI,
    body: `console.log('Hello, world!')`,
    jar
  }, 'print("Hello!")')
}).then(() => {
  spinner.succeed()
  console.log(chalk.green(`Created REPL: ${createdREPL.href}`))
}).catch(() => {
  spinner.fail()
})