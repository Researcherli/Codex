import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 4173);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function resolvePath(requestUrl) {
  const pathname = new URL(requestUrl, `http://localhost:${port}`).pathname;
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const absolutePath = path.normalize(path.join(rootDir, relativePath));

  if (!absolutePath.startsWith(rootDir)) {
    return null;
  }

  return absolutePath;
}

const server = createServer(async (request, response) => {
  const filePath = resolvePath(request.url || "/");

  if (!filePath) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  try {
    let targetPath = filePath;
    const fileStats = await stat(targetPath);

    if (fileStats.isDirectory()) {
      targetPath = path.join(targetPath, "index.html");
    }

    const content = await readFile(targetPath);
    const extension = path.extname(targetPath).toLowerCase();

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Snake app available at http://localhost:${port}`);
});
