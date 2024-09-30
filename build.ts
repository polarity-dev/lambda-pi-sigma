import path from "node:path"
import url from "node:url"
import http from "node:http"
import { spawn, ChildProcess } from "node:child_process"
import EventEmitter from "node:events"
import { createInterface } from "node:readline"
import { build as b, context, BuildOptions, PluginBuild, Plugin } from "esbuild"
import fs from "fs-extra"
import fastify from "fastify"
import postCssPlugin from "esbuild-style-plugin"

import { fromIni } from "@aws-sdk/credential-providers"
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts"
import { AwsCredentialIdentity } from "@aws-sdk/types"

const __dirname = url.fileURLToPath(new URL(".", import.meta.url))

let serverInstance: ChildProcess | null = null
let awsCredentials: AwsCredentialIdentity | undefined

const liveReloadEmitter = new EventEmitter()
const LIVE_RELOAD_PORT = 35729

const clientBuildParams: BuildOptions = {
  "entryPoints": [ "src/client/index.ts", "src/client/style.css" ],
  "entryNames": "[dir]/[name]-[hash]",
  "bundle": true,
  "minify": true,
  "sourcemap": false,
  "metafile": true,
  "target": [ "chrome58", "firefox57", "safari11", "edge16" ],
  "outdir": "dist/public",
  "loader": {
    ".ico": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".png": "file"
  }
}

if (process.env["NODE_ENV"] === "production") {
  clientBuildParams["define"] = { "process.env.NODE_ENV": '"production"' }
} else {
  clientBuildParams["define"] = { "process.env.NODE_ENV": '"development"' }
}

const devBuildParams: BuildOptions = {
  "entryPoints": ["wrapper.ts"],
  "bundle": true,
  "platform": "node",
  "outdir": "dist",
  "format": "esm",
  "sourcemap": true,
  "define": {
    "process.env.NODE_ENV": '"development"'
  },
  "loader": {
    ".ico": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".png": "file"
  },
  "banner": {
    "js": "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  }
}

const lambdaBuildParams = Object.assign(
  {},
  devBuildParams,
  {
    "entryPoints": ["src/server/index.ts"],
    "outExtension": {
      ".js": ".mjs"
    },
    "external": [ "aws-sdk", "@aws-sdk", "@aws-sdk/*" ],
    "sourcemap": false,
    "define": {
      "process.env.NODE_ENV": '"production"'
    },
  }
)

const commonPlugins: Array<Plugin> = [ postCssPlugin({ "postcssConfigFile": true }) ]


// BUILD

async function build() {
  const result = await b({ ...clientBuildParams, "plugins": [ ...commonPlugins ] })
  fs.writeFileSync(path.resolve(__dirname, "src/server/meta.json"), JSON.stringify(result.metafile))
  await b({ ...devBuildParams, "plugins": [ ...commonPlugins ] })
}

async function buildLambda() {
  const result = await b({ ...clientBuildParams, "plugins": [ ...commonPlugins ] })
  fs.writeFileSync(path.resolve(__dirname, "src/server/meta.json"), JSON.stringify(result.metafile))
  await b({ ...lambdaBuildParams, "plugins": [ ...commonPlugins ] })
}


// WATCH

const clientWatchPlugins = [
  {
    "name": "writeMetafile",
    setup(build: PluginBuild) {
      build.onEnd(result => {
        console.log("Rebuilt client")
        fs.writeFileSync(path.resolve(__dirname, "src/server/meta.json"), JSON.stringify(result.metafile))
        if (typeof (result.metafile?.outputs) === "undefined") throw new Error("Missing or invalid meta file")
        const jsBundle = Object.keys(result.metafile.outputs).find(filename => filename.endsWith(".js"));
        if (typeof jsBundle === "undefined") throw new Error("Missing bundle js file in metafile outputs")
        fs.appendFileSync(
          path.resolve(__dirname, jsBundle),
          `const liveReload = new EventSource("http://localhost:${LIVE_RELOAD_PORT}/livereload");liveReload.addEventListener("reload", () => { location.reload() })`
        )
      })
    }
  }
]

const serverWatchPlugins = [{
  "name": "triggerLiveReload",
  setup(build: PluginBuild) {
    build.onEnd(async () => {

      if (typeof(awsCredentials) === "undefined") throw new Error("Invalid or missing AWS credentials")
      console.log("Rebuilt server")
      startServer(awsCredentials)

      try {
        await checkServerIsUp(3000)
        liveReloadEmitter.emit("reload")
      } catch (error) {
        console.error("Failed to reload as server didn't start in time:", error)
      }
    })
  }
}]


let clientCtx = await context({ ...clientBuildParams, "plugins": [ ...commonPlugins, ...clientWatchPlugins ] })
let serverCtx = await context({ ...devBuildParams, "plugins": [ ...commonPlugins, ...serverWatchPlugins ] })

async function watch() {

  if (typeof(process.env["AWS_PROFILE"]) === "undefined") throw new Error("Missing AWS_PROFILE env variable")
  if (typeof(process.env["AWS_REGION"]) === "undefined") throw new Error("Missing AWS_REGION env variable")

  const credentials = fromIni({
    "profile": process.env["AWS_PROFILE"],
    "mfaCodeProvider": async(serial) => await prompt(`Type the mfa token for the following account: ${serial}\n`)
  })

  const sts = new STSClient({ "apiVersion": "2012-08-10", "region": process.env["AWS_REGION"], credentials })
  await sts.send(new GetCallerIdentityCommand({}))

  await Promise.all([
    serverCtx.watch(),
    clientCtx.watch()
  ])

  const app = fastify()

  app.get("/livereload", (req, res) => {
    console.log("Client connected")

    const headers = {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream",
      "Access-Control-Allow-Origin": "*",
      "Connection": "keep-alive"
    }

    liveReloadEmitter.on("reload", () => {
      console.log("Sending reload event to browser")
      res.raw.write("event: reload\n");
      res.raw.write("data: reloading\n\n");
    })

    req.raw.on("close", () => {
      console.log("Client disconnected")
      liveReloadEmitter.removeAllListeners("reload")
      res.raw.end()
    })

    res.raw.writeHead(200, headers)
  })

  app.ready().then(() => {
    app.listen({ "port": LIVE_RELOAD_PORT }, async() => {
      console.log(`Live reload server started on http://localhost:${LIVE_RELOAD_PORT}`)
    })
  })

  awsCredentials = await sts.config.credentials() 

  startServer(awsCredentials)
}


// ENTRY POINT

const command = process.argv[2]

if (command === "build") {
  build().then(() => {
    console.log("Build complete!")
    process.exit(0)
  }).catch(err => {
    console.error("Build failed:", err)
    process.exit(1)
  })
} else if (command === "build:lambda") {
  buildLambda().then(() => {
    console.log("Lambda build complete!")
    process.exit(0)
  }).catch(err => {
    console.error("Build failed:", err)
    process.exit(1)
  })
} else if (command === "watch") {
  watch()
} else {
  console.error(`Unknown command. Use "build" or "watch".`)
}


// UTILITY FUNCTIONS

function startServer(credentials: AwsCredentialIdentity) {
  if (typeof(credentials) === "undefined") throw new Error("Invalid or missing AWS credentials")

  if (serverInstance) {
    serverInstance.kill()
  }

  serverInstance = spawn(
    "node", ["--enable-source-maps", "dist/wrapper.js"],
    {
      "stdio": "inherit",
      "env": {
        ...process.env,
        "AWS_PROFILE": undefined,
        "AWS_ACCESS_KEY_ID": credentials.accessKeyId,
        "AWS_SECRET_ACCESS_KEY": credentials.secretAccessKey,
        "AWS_SESSION_TOKEN": credentials.sessionToken
      }
    }
  )

  process.on("exit", () => {
    if (serverInstance !== null) serverInstance.kill()
  })
}

function checkServerIsUp(port: number, retries = 10, interval = 200) {
  return new Promise<void>((resolve, reject) => {
    function tryRequest(attempt: number) {
      const req = http.request({ port, "method": "GET", "path": "/" }, res => {
        if (typeof(res.statusCode) === "undefined" || res.statusCode < 500) {
          resolve()
        } else {
          reject(new Error("Server responded with status: " + res.statusCode))
        }
      })

      req.on("error", () => {
        if (attempt < retries) {
          setTimeout(() => tryRequest(attempt + 1), interval)
        } else {
          reject(new Error("Max retries reached. Server is not up."))
        }
      })

      req.end()
    }

    tryRequest(1)
  })
}

function prompt(query: string) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise<string>((resolve) =>
    rl.question(query, (ans) => {
      rl.close()
      resolve(ans)
    })
  )
}