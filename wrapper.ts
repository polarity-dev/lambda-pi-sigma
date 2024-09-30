import { createServer, IncomingMessage, ServerResponse } from "node:http"
import { handler } from "./src/server/index.ts"
import { APIGatewayProxyEventV2 } from "aws-lambda" 

function getRequestBody (req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", chunk => body += chunk)
    req.on("end", () => resolve(body))
    req.on("error", err => reject(err))
  })
}


const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {

  try {
    if (typeof(req.url) !== "string") throw new Error(`Invalid url: ${req.url}`)
    const body = await getRequestBody(req)
    const url = new URL(req.url, `http://${req.headers.host}`)
    const date = new Date()
    if (typeof req.method === "undefined") {
      throw new Error("Req method is undefined")
    }

    const httpHeaders = Object.entries(req.headers).reduce<APIGatewayProxyEventV2["headers"]>((acc, [key, value]) => {
      if (typeof value === "object") {
        acc[key] = value.join("; ")
      } else {
        acc[key] = value
      }
      
      return acc
    }, {})

    const lambdaEvent: APIGatewayProxyEventV2 = {
      "version": "local-mock",
      "routeKey": "local-mock",
      "rawPath": req.url,
      "rawQueryString": JSON.stringify(Object.fromEntries(url.searchParams)),
      "headers": httpHeaders,
      "requestContext": {
        "accountId": "local-mock",
        "apiId": "local-mock",
        "domainName": url.hostname,
        "domainPrefix": url.hostname.split(".")[0] ?? url.hostname,
        "http": {
          "method": req.method,
          "path": url.pathname,
          "protocol": `HTTP/${req.httpVersion}`,
          "sourceIp": req.socket.remoteAddress || "local-mock",
          "userAgent": req.headers["user-agent"] || "local-mock"
        },
        "requestId": "local-mock",
        "routeKey": "local-mock",
        "stage": "local-mock",
        "time": date.toString(),
        "timeEpoch": date.getTime()
      },
      "body": body,
      "isBase64Encoded": false 
    }

    const lambdaResponse = await handler(lambdaEvent)

    res.statusCode = lambdaResponse.statusCode

    if (lambdaResponse.headers) {
      Object.entries(lambdaResponse.headers).forEach(([key, value]) => {
        res.setHeader(key, value as string)
      })
    }

    res.end(lambdaResponse.body)
  } catch (error) {
    res.statusCode = 500
    res.end("Internal Server Error")
    console.error("Error occurred:", error)
  }
})

server.listen(3000, () => {
  console.log("Running on http://localhost:3000")
})
