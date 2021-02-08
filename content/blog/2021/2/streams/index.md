---
title: Understanding Node Streams with Https.get
date: "2021-02-08T12:12:03.284Z"
description: Learn How to use Streams
---

## What are Streams?

Streams are a type of object that is used for handling long or large processes like transferring large amounts of data. The way a stream works is that events occur as the process occurs. So imagine sending one to another computer.

- File is opened
- Output Stream is opened from sender
- Reads a portion of the file and sends the data
- Receiver has an input stream open, whenever data arrives an event triggers
- Whenever the data event triggers it takes the received data and appends it to a file
- this process repeats until the entire file has been read, send, received, and written

While you could just read the whole file then send it over in one command, the file may be too large for either computers memory or the process takes super long since the receiver really can't write anything to a file until the whole file is received instead of incrementally receiving it with a stream.

In the same way, promises solve the problem of triggering code when an asynchronous process is complete, Streams resolve the problem of making a large process occur incrementally.

## https.get

While we may often use node-fetch or Axios to handle our HTTP request needs, but node has built in the HTTPS and HTTP library for making requests.

```js
const https = require("https")

//URL for request
const url = "https://jsonplaceholder.typicode.com/todos/1"

// Function that receives response stream to respond to event
const responseHandler = (res) => {

  //String Variable to hold the incoming data
  let data = '';

  // data event triggered when a chunk of data arrives, we assemble our response string incrementally
  res.on('data', (chunk) => {
    data += chunk;
  });

  // The end event is triggered when the stream is no longer sending data so we can make use of our complete response
  res.on('end', () => {
    console.log(JSON.parse(data));
  });

  // handling an error event is the stream errors
  res.on("error", (err) => {
    console.log("Error: " + err.message);
  
  })

}

// use the https.get passing the url and responseHandler
https.get(url, responseHandler)
```

The https.get function makes the request to the URL which opens a readable stream (a stream that receives data triggering the data, end, and error events). The get function then passes that readable stream to a callback you define in which you can then attach handlers (functions that respond to events) to the different events that stream will generate.

#### data event

Each time the data event is triggered the newest chunk of data is appended to our data string.

#### end event

Once all chunks have been received the end event is triggered, we parse the response string as JSON and then log it receiving the data we expected. If wrapping this stream in a promise, this would be where you'd resolve the promise and pass on the final data. How would that look like?

```js

const https = require("https");

//URL for request
const url = "https://jsonplaceholder.typicode.com/todos/1";

const poorMansFetch = async (URL) => {
  // function returns a promise
  return new Promise((resolve, reject) => {


    // Function that receives response stream to respond to event
    const responseHandler = (res) => {
      //String Variable to hold the incoming data
      let data = "";

      // data event triggered when a chunk of data arrives, we assemble our response string incrementally
      res.on("data", (chunk) => {
        data += chunk;
      });

      // The end event is triggered when the stream is no longer sending data so we can make use of our complete response
      res.on("end", () => {
        //resolve the promise with the completed data
        resolve(JSON.parse(data));
      });

      // handling an error event is the stream errors
      res.on("error", (err) => {
        console.log("Error: " + err.message);
      });
    };

    // use the https.get passing the url and responseHandler
    https.get(URL, responseHandler);
  });
};

//use the function then use a .then to run code when the promise resolves
poorMansFetch(url)
.then(result => console.log(result))

```

So you can see our new function, poor man's fetch, can be passed a URL and it will make a get request and return a promise (kind of like fetch and Axios). Notice how when the end event occurs in the stream we resolve the promise.

## Explore

Try console.logging the chunks as they come in

```js
      // data event triggered when a chunk of data arrives, we assemble our response string incrementally
      res.on("data", (chunk) => {
        console.log("chunk:", String(chunk))
        data += chunk;
      });
```

In this particular example, we'll see there was only one chunk. But if you try a larger data set like in this example you'll see how many chunks came in.

```js

const https = require("https");

//URL for request
const url = "https://jsonplaceholder.typicode.com/posts";

const poorMansFetch = async (URL) => {
  // function returns a promise
  return new Promise((resolve, reject) => {


    // Function that receives response stream to respond to event
    const responseHandler = (res) => {
      //String Variable to hold the incoming data
      let data = "";

      // data event triggered when a chunk of data arrives, we assemble our response string incrementally
      res.on("data", (chunk) => {
        console.log("chunk:", String(chunk))
        data += chunk;
      });

      // The end event is triggered when the stream is no longer sending data so we can make use of our complete response
      res.on("end", () => {
        //resolve the promise with the completed data
        resolve(JSON.parse(data));
      });

      // handling an error event is the stream errors
      res.on("error", (err) => {
        console.log("Error: " + err.message);
      });
    };

    // use the https.get passing the url and responseHandler
    https.get(URL, responseHandler);
  });
};

//use the function then use a .then to run code when the promise resolves
poorMansFetch(url)
.then(result => result)

```

Now you know a little bit more about what streams are and how they are used. You are constantly working streams whenever making HTTP requests!