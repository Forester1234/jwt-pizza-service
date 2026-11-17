const { request } = require("http");
const config = require("./config");
const loggingConfig = config.logging;

const { AsyncLocalStorage } = require("async_hooks");

const requestContext = new AsyncLocalStorage();

class Logger {
  contextMiddleware = (req, res, next) => {
    requestContext.run({ req }, next);
  };

  getCurrentUser() {
    const store = requestContext.getStore();
    return store?.req?.user?.name ?? null;
  }

  httpLogger = (req, res, next) => {
    const originalSend = res.send;

    res.send = (body) => {
      const logData = {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        authorized: !!req.headers.authorization,
        user: this.getCurrentUser(),
        reqBody: req.body,
        resBody: body,
      };

      this.log(this.statusToLogLevel(res.statusCode), "http", logData);

      return originalSend.call(res, body);
    };

    next();
  };

  // logger.log("info", "http", logData);
  // logger.log("info", "database", logData);
  // logger.log("info", "factory", logData);
  // logger.log("error", "exception", logData);
  log(level, type, logData) {
    const labels = {
      component: loggingConfig.source,
      level: level,
      type: type,
    };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return "error";
    if (statusCode >= 400) return "warn";
    return "info";
  }

  nowString() {
    return (Date.now() * 1000000).toString();
  }

  sanitize(data) {
    const sensitiveKeys = [
      "password",
      "token",
      "jwt",
      "authorization",
      "apikey",
      "api_key",
      "secret",
      "email",
    ];

    const redact = (value) => {
      if (Array.isArray(value)) {
        return value.map(redact);
      }

      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, val]) => {
            const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");

            if (
              sensitiveKeys.some((s) =>
                normalizedKey.includes(s.replace(/[-_]/g, "")),
              )
            ) {
              return [key, "*****"];
            }

            return [key, redact(val)];
          }),
        );
      }

      if (typeof value === "string") {
        return value
          .replace(/Bearer\s+[^\s"' ]+/gi, "Bearer *****")
          .replace(/glc_[a-zA-Z0-9]+/g, "*****")
          .replace(/password\s*=\s*'[^']*'/gi, "password='*****'");
      }

      return value;
    };

    return JSON.stringify(redact(data));
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(`${loggingConfig.endpointUrl}`, {
      method: "post",
      body: body,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loggingConfig.accountId}:${loggingConfig.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log("Failed to send log to Grafana");
    }).catch(() => {
        console.error("Unable to connect to Grafana");
    });
  }
}
module.exports = new Logger();
