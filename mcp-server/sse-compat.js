module.exports = function (app) {
  const headers = {
    "Content-Type":"text/event-stream",
    "Cache-Control":"no-cache",
    "Connection":"keep-alive",
    "Access-Control-Allow-Origin":"*"
  };
  app.head("/sse", (req,res) => { res.set(headers); res.end(); });
  app.get("/sse", (req,res) => {
    res.set(headers);
    const hello = {
      type: "handshake",
      protocol: "2024-11-05",
      server: { name: "tidewave-mcp", version: "0.1.0" },
      capabilities: { tools: true }
    };
    res.write(`data: ${JSON.stringify(hello)}\n\n`);
    const ping = setInterval(() => res.write(':\n\n'), 15000);
    req.on("close", () => clearInterval(ping));
  });
};