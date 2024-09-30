import { AttributeValue, DynamoDB, ScanCommandOutput } from "@aws-sdk/client-dynamodb"
import { APIGatewayProxyEventV2 } from "aws-lambda"
import { join } from "path"
import url from "url"

import Fistify from "../lib/fistify/index.ts"

import Home from "./pages/home.tsx"
import Counter from "./components/counter.tsx"
import meta from "./meta.json"

const ESBUILD_STYLE_BUNDLE_PATH = "/" + Object.keys(meta.outputs!).find((filename) => filename.endsWith(".css"))!.split("/").slice(1).join("/")
const ESBUILD_SCRIPT_BUNDLE_PATH = "/" + Object.keys(meta.outputs!).find((filename) => filename.endsWith(".js"))!.split("/").slice(1).join("/")

const __dirname = url.fileURLToPath(new URL(".", import.meta.url))

const dynamo = new DynamoDB({ "apiVersion": "2012-08-10" })
const usersTable = process.env["DYNAMODB_USERS_TABLE"]

let counter = 0

export const handler = async (event: APIGatewayProxyEventV2) => {
  console.log(event)

  const app = new Fistify()

  app.serveStatic("/public", join(__dirname, "./public"))

  app.get("/", async() => {
    return({
      "statusCode": 200,
      "body": Home({ ESBUILD_SCRIPT_BUNDLE_PATH, ESBUILD_STYLE_BUNDLE_PATH, counter }),
      "headers": {
        "Content-Type": "text/html"
      }
    })
  })

  app.get("/counter", async() => {
    counter += 1

    return({
      "statusCode": 200,
      "body": Counter({ counter }),
      "headers": {
        "Content-Type": "text/html"
      }
    })
  })

  app.get("/users", async() => {

    let results: Record<string, AttributeValue>[] = []
    let exclusiveStartKey

    do {
      const result: ScanCommandOutput = await dynamo.scan({
        "TableName": usersTable,
        ...(typeof exclusiveStartKey !== "undefined" && { "ExclusiveStartKey": exclusiveStartKey })
      })

      results = results.concat(...result.Items ?? [])
      exclusiveStartKey = result.LastEvaluatedKey

    } while (typeof exclusiveStartKey !== "undefined")
    
    return({
      "statusCode": 200,
      "body": JSON.stringify(results),
      "headers": {
        "Content-Type": "application/json"
      }
    })
  })

  return(await app.listen(event))

}
