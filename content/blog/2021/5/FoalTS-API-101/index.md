---
title: FoalTS - Building a Typescript Based API
date: "2021-05-27T12:12:03.284Z"
description: Making an API with this Typescript Based Framework
---

Bottom Line, like bow-ties... Typescript is cool!

Allowing us to catch errors and bugs more easily along with awesome IDE suggestions and hinting, I reiterate Typescript is cool. While there are many framework that have built in support for Typescript as an afterthought, FoalTS is built with Typescript at the forefront. FoalTS carefully selects ORMS and other libraries for their typescript support to build one of the more robust typescript backend engineering experiences.

So how about we build API

## Pre-Requisites

- You need NodeJS 10 or greater

## Setup

Open up terminal to whatever directory you want to initiate your project and run the following command to install the FOALTS CLI:

`npm install -g @foal/cli`

Then this command to generate a new project

`foal createapp my-api`

You can run the development servier with the command

`npm run develop`

Go to localhost:3001 and you'll see the default landing page.

## Creating Some Routes

To create routes you need a controller. Like Ruby on Rails (Ruby), Masonite(Python), or Spring (Java), a controller is a class with methods that determine how certain URLs are handled when the server receives a request.

To create a new controller run the following command:

`foal generate controller first-controler`

This will create a new controller file in app/controllers/

first-controller.controller.ts

```ts
import { Context, Get, HttpResponseOK } from '@foal/core';

export class FirstControlerController {

  @Get('/')
  foo(ctx: Context) {
    return new HttpResponseOK();
  }

}
```

- The @Get decorator allows use to designate the method as one for a get request to the endpoint.

- foo is the method, which can be anything

- ctx is the context from which we can pull url params `/cheese/:hello` from `ctx.request.params`, url queries `?cheese=gouda` from `ctx.request.query` and more!

- FoalTS comes with many methods that change the status of the response, HttpResponseOK() gives it a 200 status. You can pass and object to this method to return JSON.

Let's modify the route.

```ts
import { Context, Get, HttpResponseOK } from '@foal/core';

export class FirstControlerController {

  @Get('/')
  foo(ctx: Context) {
    return new HttpResponseOK({Hello: "World"});
  }

}
```

We then need to wire this up to the app controller to be visible to our application.

src/app/app.controller.ts

```ts

import { Get, controller, IAppController, HttpResponseOK } from '@foal/core';
import { createConnection } from 'typeorm';

import { ApiController, FirstControlerController } from './controllers';

export class AppController implements IAppController {
  subControllers = [
    controller("/first", FirstControlerController),
    controller('/api', ApiController),
  ];

  async init() {
    await createConnection();
  }
}

```

- the subControllers class property allows you specify subcontrollers. AppController is the global controller and we've now made our first-controller a subcontroller that handles all "/first" requests

- The create connection function creates a database connection if you need one. Foal uses TypeORM which is a Typescript focused ORM. You can change the database settings in the config files in the config folder.
    - default.json is the default app settings
    - development.json is settings for the development environment
    - production.json is settings for the production environment
    - test.json is the settings to use when running tests

## Testing Our Route

Run your server if it isn't `npm run dev`

You should be able to see the route from our controller at `localhost:3001/first/`

tada! Not too difficult, right!

## More Features

- Foal has other generators to help roll our full apis, that will help role out your database models/entities and controllers with ease.

- Built in JWT authentication features make adding auth and protecting your routes super easy.

If you wanted a Ruby on Rails/Spring like batteries includes experience with Node and Typescript, FoalTS has got your back.
