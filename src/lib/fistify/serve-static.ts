import { readFileSync, existsSync } from "fs"
import { join, extname } from "path"

function getContentType(ext: string): string {
  const contentTypeMap: Record<string, string> = {
    // Text and Data
    ".html": "text/html",
    ".xml": "application/xml",
    ".json": "application/json",
    ".txt": "text/plain",
    ".csv": "text/csv",

    // CSS and JavaScript
    ".css": "text/css",
    ".js": "application/javascript",
    ".mjs": "application/javascript",

    // Images
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".avif": "image/avif",

    // Fonts
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".eot": "application/vnd.ms-fontobject",
    
    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",

    // Video
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".m4v": "video/mp4",

    // Archive and binary formats
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
    ".exe": "application/vnd.microsoft.portable-executable",
    ".bin": "application/octet-stream",
    ".pdf": "application/pdf",
    
    // Misc
    ".map": "application/json",  // Source maps
    ".wasm": "application/wasm"
  }
  return contentTypeMap[ext] || "application/octet-stream"
}

export async function serveStaticFile(staticDir: string, servePath: string, requestPath: string) {
  const relativePath = requestPath.replace(servePath, "")
  const filePath = join(staticDir, relativePath)

  if (existsSync(filePath)) {
    const ext = extname(filePath)
    const fileContent = readFileSync(filePath)
    const contentType = getContentType(ext)

    const isBinary = !/^text\/|application\/(json|javascript|xml)/.test(contentType)

    return {
      "statusCode": 200,
      "body": isBinary ? fileContent.toString("base64") : fileContent.toString(),
      "isBase64Encoded": isBinary,
      "headers": {
        "Content-Type": contentType,
        "Content-Length": fileContent.length.toString(),
      }
    }
  }

  return null
}
