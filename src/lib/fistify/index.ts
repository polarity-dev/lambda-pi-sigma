import { APIGatewayProxyEventV2 } from "aws-lambda"
import { serveStaticFile } from "./serve-static.ts"

type Handler = (event: APIGatewayProxyEventV2) => Promise<any> | any
type Hook = (event: APIGatewayProxyEventV2) => Promise<void> | void
type Route = { method: string, path: string, handler: Handler }

class Fistify {
  private routes: Route[] = []
  private staticDirs: { [key: string]: string } = {}
  private hooks: {
    onRequest: Hook[]
    preHandler: Hook[]
    onError: Hook[]
    onSend: Hook[]
  } = {
    onRequest: [],
    preHandler: [],
    onError: [],
    onSend: [],
  }

  private matchPath(routePath: string, requestPath: string): boolean {
    const routeSegments = routePath.split("/").filter(Boolean)
    const requestSegments = requestPath.split("/").filter(Boolean)
    if (routeSegments.length !== requestSegments.length) return false
    return routeSegments.every((seg, idx) => seg.startsWith(":") || seg === requestSegments[idx])
  }

  private findRoute(method: string, path: string): Route | undefined {
    return this.routes.find(route => route.method === method && this.matchPath(route.path, path))
  }

  public addHook(hookName: keyof typeof this.hooks, hook: Hook) {
    this.hooks[hookName].push(hook)
  }

  public get(path: string, handler: Handler) {
    this.routes.push({ "method": "GET", "path": path, "handler": handler })
    this.head(path, async (event) => {
      const response = await handler(event)
      return { "statusCode": response.statusCode, "headers": response.headers }
    })
  }

  public post(path: string, handler: Handler) {
    this.routes.push({ "method": "POST", "path": path, "handler": handler })
  }

  public head(path: string, handler: Handler) {
    this.routes.push({ "method": "HEAD", "path": path, "handler": handler })
  }

  public options(path: string, handler: Handler) {
    this.routes.push({ "method": "OPTIONS", "path": path, "handler": handler })
  }

  public all(path: string, handler: Handler) {
    this.routes.push({ "method": "ALL", "path": path, "handler": handler })
  }

  public serveStatic(servePath: string, dir: string) {
    this.staticDirs[servePath] = dir
  }

  private async runHooks(hookName: keyof typeof this.hooks, event: APIGatewayProxyEventV2) {
    for (const hook of this.hooks[hookName]) {
      await hook(event)
    }
  }

  private async handleRequest(event: APIGatewayProxyEventV2) {
    try {
      await this.runHooks("onRequest", event)
      const { method, path } = event.requestContext.http
      
      for (const servePath of Object.keys(this.staticDirs)) {
        if (path.startsWith(servePath)) {
          const staticDir = this.staticDirs[servePath]
          
          if (staticDir && servePath) {
            const staticResponse = await serveStaticFile(staticDir, servePath, path)
            if (staticResponse) return staticResponse
          }
        }
      }
  
      const route = this.findRoute(method, path) || this.findRoute("ALL", path)
      if (!route) throw new Error("Route not found")
      await this.runHooks("preHandler", event)
      const response = await route.handler(event)
      await this.runHooks("onSend", event)
      return response
    } catch (error) {
      await this.runHooks("onError", event)
      console.error("Error:", error)
      return { "statusCode": 500, "body": "Internal Server Error" }
    }
  }

  public async listen(event: APIGatewayProxyEventV2) {
    return await this.handleRequest(event)
  }
}

export default Fistify
