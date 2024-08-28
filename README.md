# sse-channels

Server-Sent Events utility written in TypeScript.

## Features

  - Simple
  - Built in types
  - Framework agnostic
  - Flexible, independent connections make it easy to create your custom channel logic
  - History is maintained automatically
  - Channels automatically sends missed events upon reconnections
  - Temporary Channels (if you need a channel per active user for example)

## Usage

### Connection

It's the building block, each connection is independent with its own ping and timeout. Connections don't hold message history or any special state.

```js
const express = require("express");
const { Connection } = require("sse-channels");

const app = express();

app.get("/sse", function (req, res) {
  const conn = new Connection(req, res, {
    ping: true, // automatically sends an empty comment (":\n") each ping interval
    pingInterval: 50 * 1000, // 50 seconds, this is the default interval
    timeout: 12 * 60 * 60 * 1000, // 12 hours max, to avoid any leak
  });
  // optionally sends a connection confirmation
  conn.send({ comment: "OK" });

  conn.send({
    event: "my-event",
    data: JSON.stringify({}),
    id: "id",
  });
});
```

### Channels

To broadcasting an event.

```js
const { Connection, Channel } = require("sse-channels");

// create a channel
const weatherChannel = new Channel({
  historySize: 500 // default value
});

app.get("/sse/weather", function (req, res) {
  const conn = new Connection(req, res, {
    ping: true,
    timeout: 12 * 60 * 60 * 1000,
  });
  conn.send({ comment: "OK" });

  // add new connection to the weather channel
  // if it's a reconnection (the connection has a lastEventID property) channel automatically sends newer messages from its history
  weatherChannel.add(conn);

  // the connection is automatically removed from the channel when a close event is emitted
  // the connection timeout by default automatically ends the connection and also emit a close event
});

// somewhere else, broadcast event to all channel connections
weatherChannel.send({
  event: "weather-event",
  data: JSON.stringify({}),
  id: "id",
});
```

Note: currently, the history only works properly if a connection is attached to only 1 channel,
missed messages upon reconnection won't work as expected if the same connection is added to multiple channels.

### Temporary Channels

For workloads with transient group of connections.

Like to have a channel per active user:

```js
const { Connection, Channel, MapListener } = require("sse-channels");

// create a channel store, automatically removes channel when receive a close event
const channelStore = new MapListener();

app.get("/sse/user/:userID", function (req, res) {
  const { userID } = req.params;

  const conn = new Connection(req, res, {
    ping: true,
    timeout: 12 * 60 * 60 * 1000,
  });
  conn.send({ comment: "OK" });

  // check if user already have an active channel
  const userChannel = channelStore.get(userID);
  if (userChannel) {
    userChannel.add(conn);
  } else {
    const userChannel = new Channel({
      emptyTimeout: 10 * 60 * 1000, // after 10 minutes while empty channel will emit a close event
    });
    userChannel.add(conn);

    // add userChannel to our channel store
    channelStore.set(userID, userChannel);
  }
});

// somewhere else, broadcast event to specific user connections
const userChannel = channelStore.get(userID);
if (userChannel) {
  userChannel.send({
    event: "user-event",
    data: JSON.stringify({}),
    id: "id",
  });
}
```

## IMPORTANT

While a major version `1.0.0` is not released **if you want to use this package in production please lock by its minor version like this `>=0.1.0 <0.2.0`.**
The public API SHOULD NOT be considered stable, but I'll not break it with PATCH versions.


### License

[MIT licensed](./LICENSE).
