import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { sseStringify, type EventStream } from "sse-stringify";

function isNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return false;
  }
  return true;
}

export interface Options {
  ping?: boolean;
  pingInterval?: number;
  timeout?: number;
}

export class Connection extends EventEmitter {
  static default = {
    pingInterval: 50 * 1000, // 50 seconds
  };

  public request: IncomingMessage;
  public response: ServerResponse;
  public lastEventID?: string;
  public timestamp: number;
  private pingIntervalID?: NodeJS.Timeout;
  private timeoutID?: NodeJS.Timeout;

  constructor(
    request: IncomingMessage,
    response: ServerResponse,
    options?: Options
  ) {
    super();
    this.request = request;
    this.response = response;
    this.timestamp = Date.now();

    if (
      request.headers["last-event-id"] &&
      !Array.isArray(request.headers["last-event-id"])
    ) {
      this.lastEventID = request.headers["last-event-id"];
    }

    // request.socket.setKeepAlive(true); would only check the connection up to the reserve proxy and not the end-to-end connection.
    // also have a risky default of sending a keep alive with an interval of 1 second and we can't change this value from here without nasty tweaks
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-store,no-transform");
    response.setHeader("X-Accel-Buffering", "no");
    response.setHeader("Connection", "keep-alive");
    response.statusCode = 200;
    response.flushHeaders();

    request.once("close", () => {
      this.cleanup();
      this.emit("close");
    });

    if (options?.ping) {
      this.setPing(options?.pingInterval ?? Connection.default.pingInterval);
    }

    if (options?.timeout) {
      this.setTimeout(options.timeout);
    }
  }

  send(value: EventStream) {
    const data = sseStringify(value);
    // TODO: control write backpressure
    // good comment on how write works ---> https://github.com/nodejs/help/issues/1081#issuecomment-361022591
    this.response.write(data);
    return this;
  }

  write(data: string) {
    this.response.write(data);
  }

  public setPing(pingInterval: number) {
    if (!isNumber(pingInterval)) {
      throw new TypeError(
        `pingInterval value must be of type number but received ${typeof pingInterval}`
      );
    }
    if (pingInterval < 1) {
      throw new Error("pingInterval value must be 1 or greater than 1");
    }
    clearTimeout(this.pingIntervalID);
    this.pingIntervalID = setInterval(() => {
      this.response.write(sseStringify({ comment: "" }));
    }, pingInterval);
    return this;
  }

  public setTimeout(time: number) {
    if (!isNumber(time)) {
      throw new TypeError(
        `timeout value must be of type number but received ${typeof time}`
      );
    }
    if (time < 0) {
      throw new Error("timeout value must be 0 or greater than 0");
    }
    clearTimeout(this.timeoutID); // if time is 0 just try clear timeout
    if (time > 0) {
      this.timeoutID = setTimeout(() => {
        // If no 'timeout' listener is added then Connection are ended when they time out.
        // If a handler is assigned to the 'timeout' events, timed out must be handled explicitly.
        // https://nodejs.org/api/http.html#responsesettimeoutmsecs-callback
        const listeners = this.listenerCount("timeout");
        if (listeners === 0) {
          this.end();
        } else {
          this.emit("timeout");
        }
      }, time);
    }
    return this;
  }

  private cleanup() {
    clearInterval(this.pingIntervalID);
    clearTimeout(this.timeoutID);
    return this;
  }

  public end() {
    this.cleanup();
    return new Promise<this>((resolve) => {
      this.response.end(() => resolve(this));
    });
  }
}
