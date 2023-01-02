---
title: Using SimpleRPC with SvelteKit 1.0/Typescript
date: "2023-01-02T12:12:03.284Z"
description: Easy to use RPC in your SvelteKit Application
---

SvelteKit is the official SvelteKit meta framework in the vein of Next/Remix for React, Nuxt for Vue, Analog for Angular and Solid-Start for Solid.

RPC APIs are a unique server API architecture that is centered around making the client experience feel like writing standard imperitive code.

Unlike rest that requires writing http requests or graphQL that requires writing query strings in a standard format, RPC just allows you to call functions from your client application that trigger code on your server application (the http requests aren't gone, just abstracted away in the implementation, like graphQL).

Probably the most well known frameworks for creating an RPC API in javascript are gRPC and tRPC, although in my desire to have something super simple I created a new framework called, SimpleRPC.

It essentially works a lot like working with React Redux where from the client you call a dispatch function to call one of several possible actions. Let's try this out in SvelteKit, but works with any framework you like.

The backend would use
[@alexmerced/simplerpc-server server library](https://www.npmjs.com/package/@alexmerced/simplerpc-server)

The frontend would use
[@alexmerced/simplerpc-client client library](https://www.npmjs.com/package/@alexmerced/simplerpc-client)

Since SvelteKit can handle the backend and frontend, we'll be using both libraries in our SvelteKit application.

## Setup

- open up vscode in an empty directory
- create a svelte app `npm create svelte@latest rpcapp`
- choose the skeleton application
- choose the typescript template
- select what you want for other options
- `cd` into the new project folder
- run `npm install`
- then run `npm install @alexmerced/simplerpc-server @alexmerced/simplerpc-client`
- then run `npm run dev` and open up the browser to the specified port `localhost:5173`

We're all setup, now let's get to work!

## SimpleRPC Setup

Let's create our basic setup, in the `/src` folder create a folder named `/lib/rpc` and in there create a `actions.js`,`context.js`, `handler.js` and `client.js`.

- `src/lib/rpc/actions.js` should export an object where each property is a function with the following signature The payload is given during the dispatch call from the client.
  `(payload, context) => any`

- `src/lib/rpc/context.js` should export an object with anything you'd like accessible to all actions as this object will be the context argument when we dispatch our actions.

- `src/lib/rpc/handler.js` will be our server handler, we will use this function for when post requests hit our desired rpc endpoint.

- `src/lib/rpc/client.js` will be our frontend client which we can use to trigger our actions from user interactions.

For our example:

/src/rpc/actions.ts

```ts
import type { ActionCollection } from "@alexmerced/simplerpc-server"

const actions: ActionCollection = {
  simpleAction: (payload, context) => {
    return JSON.stringify({ payload, context })
  },
}

export default actions
```

/src/rpc/context.ts

```ts
import type { ActionContext } from "@alexmerced/simplerpc-server"

const context: ActionContext = {}

export default context
```

/src/rpc/handler.js

```ts
import type { SimpleRPCHandler } from "@alexmerced/simplerpc-server"
import createHandler from "@alexmerced/simplerpc-server"
import actions from "./actions"
import context from "./context"

const handler: SimpleRPCHandler = createHandler({ actions, context })

export default handler
```

/src/rpc/client.js

```ts
import type { SimpleRPCClient } from "@alexmerced/simplerpc-client"
import {createClient} from "@alexmerced/simplerpc-client"

const rpcDispatch: SimpleRPCClient = createClient({
  url: "http://localhost:5173/rpc",
  headers: {},
})

export default rpcDispatch
```

Now we have all our components in place, now we just need to setup the `/rpc/` enpoint to handle calls from `rpcDispatch` using the handler.

create `/src/routes/+server.ts`

```ts
import { json } from "@sveltejs/kit"
import handler from "src/rpc/handler"
import type { RequestEvent } from "@sveltejs/kit"

/** @type {import('./$types').RequestHandler} */
export async function POST(event: RequestEvent) {
  const body = await event.request.json()
  const result = await handler(body)
  return json( result )
}
```

That's it that'll allow our client to make post requests to `localhost:5173/rpc` that'll make our client useable.

Note: If you wanted to make additional request information available to your actions you can pass the event to context like so:

```ts
import { json } from "@sveltejs/kit"
import handler from "src/rpc/handler"
import type { RequestEvent } from "@sveltejs/kit"
import context from "src/rpc/context"

/** @type {import('./$types').RequestHandler} */
export async function POST(event: RequestEvent) {
  const body = await event.request.json()
  context.event = event
  const result = await handler(body)
  return json({ result })
}
```

Now you can access the event from each of your actions.

Setting this up is now complete, to add additional actions you just add functions to our Action collection in actions.ts.

## Using rpcDispatch

Let's make a button where we can trigger our dispatch from the frontend.

/src/routes/+page.svelte

```js
<script>
    import {rpcDispatch} from "$lib/rpc/client";

    const clickHandler = async () => {
        const response = await rpcDispatch({
            type: "simpleAction",
            payload: {}
        })

        console.log(JSON.stringify(response.result))
    }
</script>

<div>
    <h1>Click the Button</h1>
    <button on:click={clickHandler}>Click Me</button>
</div>
```

Now open up the console, click the button and you'll see the RPC Request was successful.

Adding additional actions just becomes a matter of writing another function in actions.js

```js
import type { ActionCollection } from "@alexmerced/simplerpc-server";

const actions: ActionCollection = {
    simpleAction: (payload, context) => {
        return JSON.stringify({payload, context})
    },
    anotherAction: (payload, context) => {
        return "It Works"
    }
}

export default actions
```

Then use rpcDispatch to call if from your frontend code:

/src/routes/+page.svelte
```js
<script>
    import {rpcDispatch} from "$lib/rpc/client";

    const clickHandler = async () => {
        const response = await rpcDispatch({
            type: "simpleAction",
            payload: {}
        })

        console.log(JSON.stringify(response.result))
    }

    const clickHandler2 = async () => {
        const response = await rpcDispatch({
            type: "anotherAction",
            payload: {}
        })

        console.log(JSON.stringify(response.result))
    }
</script>

<div>
    <h1>Click the Button</h1>
    <button on:click={clickHandler}>Click Me</button>
    <button on:click={clickHandler2}>Click Me2</button>
</div>
```

Isn't that easy... thank you SimpleRPC!