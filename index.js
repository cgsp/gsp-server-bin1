const http = require('http')
const url = require('url')
const path = require('path')
const fs = require('fs')
const mime = require('mime')
const zlib = require('zlib')
const chalk = require('chalk')
const ejs = require('ejs')
const utils = require('util')
const debug = require('debug')('http:a')

// 引入配置文件
const config = require('./config')

// 读取模板文件--用的是ejs的模板语言
const templateStr = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')

class Server {
  constructor(options) {
    this.config = { ...config, ...options }
    this.template = templateStr
  }

  start() {
    // 创建服务
    const server = http.createServer(this.handleRequest.bind(this))
    // 读取配置
    let { port, host } = this.config
    // 启动服务
    server.listen(port, host, () => {
      console.log(chalk.green(`服务启动了，运行在http://${host}:${port}`))
      debug(`server start http://${host}:${chalk.green(port)}`)
    })
  }

  async handleRequest(req, res) {
    // 获取访问的路径，默认'/'
    this.pathname = url.parse(req.url, true).pathname
    // 将访问的路径转换为绝对路径， 取到的dir就是绝对路径
    console.log('this.config.dir===', this.config.dir)
    this.realPath = path.join(this.config.dir, this.pathname)
    console.log('this.realPath===', this.realPath)
    debug(this.realPath)

    try {
      const stat = utils.promisify(fs.stat)
      let statObj = await stat(this.realPath)
      if (statObj.isFile()) {
        // 如果是文件，直接返回文件内容
        this.sendFile(req, res, statObj)
      } else {
        // 如果是文件夹，则检索文件夹，通过模板，渲染后，返回页面
        this.sendDirDetails(req, res, statObj)
      }
    } catch (e) {
      this.sendError(req, res, e)
    }
  }

  sendError(req, res, err) {
    console.log(chalk.red(err))
    res.statusCode = 404
    res.end(err && err.toString())
  }

  async sendDirDetails(req, res, statObj) {
    // 读取当前文件夹
    const readdir = utils.promisify(fs.readdir)
    let dirs = await readdir(this.realPath)
    console.log(dirs)

    // 构造模板需要的数据
    dirs = dirs.map(dir => ({
      name: dir,
      path: path.join(this.pathname, dir)
    }))

    // 渲染模板
    let pageStr = ejs.render(this.template, { dirs })

    // 响应客户端
    res.setHeader('Content-Type', 'text/html;charset=utf8')
    res.end(pageStr)
  }

  sendFile(req, res, statObj) {
    if (this.cache(req, res, statObj)) {
      res.statusCode = 304
      return res.end()
    }

    // 创建可读流
    let rs = fs.createReadStream(this.realPath)

    // 响应文件类型
    res.setHeader('Conteng-Type', `${mime.getType(this.realPath)};charset=utf8`)

    // 压缩
    let zip = this.compress(req, res, statObj)
    if (zip) {
      return rs.pipe(zip).pipe(res)
    }

    // 处理范围请求
    if (this.range(req, res, statObj)) {
      return
    }

    rs.pipe(res)
  }

  cache(req, res, statObj) {
    console.log('statObj.ctime===', statObj.ctime)
    console.log('statObj.ctime.toGMTString===', statObj.ctime.toGMTString())
    // 创建协商缓存标识
    let etag = statObj.ctime.toGMTString() + statObj.size
    let lastModified = statObj.ctime.toGMTString()

    // 设置强缓存
    res.setHeader('Cache-Control', 'max-age=30')
    res.setHeader('Expires', new Date(Date.now() + 30 * 1000).toUTCString())

    // 设置协商缓存
    res.setHeader('Etag', etag)
    res.setHeader('Last-Modified', lastModified)

    // console.log(req)

    let { 'if-none-match': ifNoneMatch, 'if-modified-since': ifModifiedSince } = req.headers || {}

    if (etag !== ifNoneMatch && lastModified !== ifModifiedSince) {
      return false
    } else {
      return true
    }
  }

  compress(req, res, statObj) {
    // 获取浏览器支持的压缩格式
    let encoding = req.headers['accept-encoding']
    // 支持gzip使用gzip压缩，支持deflate使用deflate压缩
    if (encoding && encoding.match(/\bgzip\b/)) {
      res.setHeader('Content-Encoding', 'gzip')
      return zlib.createGzip()
    } else if (encoding && encoding.match(/\bdeflate\b/)) {
      res.setHeader('Content-Encoding', 'deflate')
      return zlib.createDeflate()
    } else {
      // 不支持压缩
      return false
    }
  }

  range(req, res, statObj) {
    // 获取range请求头
    let range = req.headers['range']

    if (range) {
      // 获取请求范围的开始和结束位置
      // 'bytes=1111-11222'.match(/(\d*)-(\d*)/)
      // ["1111-11222", "1111", "11222", index: 6, input: "bytes=1111-11222", groups: undefined]
      let [, start, end] = range.match(/(\d*)-(\d*)/)
      // 处理请求头中范围参数不传的问题
      start = start ? parseInt(start) : 0
      end = end ? parseInt(end) : statObj.size - 1

      // 设置范围请求响应
      res.statusCode = 206
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Range', `bytes ${start}-${end}/${statObj.size}`)
      fs.createReadStream(this.realPath, { start, end }).pipe(res)
      return true
    } else {
      return false
    }
  }
}

module.exports = Server



