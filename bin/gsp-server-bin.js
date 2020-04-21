#! /usr/bin/env node

const commander = require('commander')
const Server = require('../index.js')

// 增加 How to use
commander.on('--help', function () {
  console.log('\r\n  How to use: \r\n')
  console.log('    zf-server --port <val>')
  console.log('    zf-server --host <val>')
  console.log('    zf-server --dir <val>')
})

// 解析 Node 进程执行时的参数
commander
  .version('1.0.0')
  .usage('[options]')
  .option('-p, --port <n>', 'server port')
  .option('-o, --host <n>', 'server host')
  .option('-d, --dir <n>', 'server dir')
  .parse(process.argv)

// 创建 Server 实例传入命令行解析的参数
const server = new Server(commander)

// 启动服务器
server.start()

// ********** 以下为新增代码 **********
let { exec } = require('child_process')

// 判断系统执行不同的命令打开浏览器
let systemOrder = process.platform === 'win32' ? 'start' : 'open'
exec(`${systemOrder} http://${commander.host}:${commander.port}`)
// ********** 以上为新增代码 **********
