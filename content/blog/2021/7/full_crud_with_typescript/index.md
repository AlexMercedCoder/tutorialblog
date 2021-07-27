---
title: Basics of Building a CRUD API with Typescript (NestJS and FoalTS)
date: "2021-07-27T12:12:03.284Z"
description: Backend Frameworks with Typescript Support
---

Using Typescript for development for frontend and backend development keep growing. Typescript allows for better IDE hints and less runtime errors due to type errors with its typing system. On top of that Typescript makes popular OOP patterns like dependency injection more applicable vs when typing doesn't exist like in plain javascript. (In DI, you use typing in class constructor to instantiate and inject services throughout your application)

Two frameworks keep typescript close to their hearts when building a backend application in NodeJS, NestJS and FoalTS. In this tutorial we will discuss CRUD and REST API conventions and apply them to building a basic API in Nest and FOAL.

## Summary of RESTful Convention

THe restful convention gives us a blueprint of making the basic routes for CRUD (Create, Read, Update, Delete) functionality in a uniform way. 

API Restful Routes

| Name of Route | Request Method | Endpoint | Result |
|---------------|----------------|----------|--------|
| Index | GET | `/model` | returns list of all items |
| Show | GET | `/model/:id` | returns item with matching id |
| Create | Post | `/model` | creates a new item, returns item or confirmation |
| Update | Put/Patch | `/model/:id` | Updated item with matching ID |
| Destroy | Delete | `/model/:id` | Deletes item with matching ID |

If we weren't build an API but instead rendering pages on the server there would be two additional routes. New, which renders a page with a form to create a new object, submitting the form triggers the create route. Edit, which renders a page with a form to edit an existing object, submitting the form triggers the Update route. 

Since we are building an api, Edit and New aren't necessary as the burden of collecting the information to submit to the Create and Update route will be on whoever builds the applications that consume the API. (Frontend Applications built in frameworks)

## Building an API

### Setup

- create a folder for this exercise and navigate your terminal to that server.

- let's create our two project

##### Nest

- Install Nest CLI Globally `npm i -g @nestjs/cli`
- Create a new nest project `nest new n-practice`
- cd into folder and run dev server with `npm run start` which default runs on port 3000 (localhost:3000)

##### Foal

- Install the Foal CLI Globally `npm install -g @foal/cli`
- Create a new Foal Project `foal createapp f-practice`
- cd into folder and run dev server with `npm run develop` which default runs on port 3001 (localhost:3001)

### Creating our Controller

A controller is a class where we will house a bundle of functions. These functions will fire when certain requests are made to our server based on their request methods (GET, PUT, POST, PATCH) and the endpoint (/this, /that). The rules of which methods/endpoint combinations point to which controller methods are called our routes.

In both of these frameworks, routes are defined as function decorators `@decorator` that designate the route each function belongs to.

create a new controller
    - NestJS: run command `nest g controller posts` (creates src/posts/posts.controller.ts)
    - FoalTS: run command `foal generate controller posts` (create src/app/controllers/posts.controller.ts)

For FOALTS make sure to update app.controller.ts to register the new controller:

```ts
import { controller, IAppController } from '@foal/core';
import { createConnection } from 'typeorm';

import { ApiController, PostsController } from './controllers';

export class AppController implements IAppController {
  subControllers = [
    controller('/api', ApiController),
    controller('/posts', PostsController) // <---------------------
  ];

  async init() {
    await createConnection();
  }
}
```

Now let's update and test each of the RESTful routes in our controllers!

### Our Data

We aren't using a database, so instead we'll use an array as our data layer. Keep in mind if the server restart the array will reset itself (need databases for persistent data). Since we are using typescript we can define our data type (Post) and create an array of posts. Put this at the top of your controller files!

```ts

// Interface Defining the Shape of a Post
interface Post {
    title: string,
    body: string
}

// Array of Posts
const posts:Array<Post> = [
    {title: "THe First Post", body: "The Body of the First Post"}
]

```

### The Index Route

The Index route allows us to get all items of our model with a get request. So in our case a get request to "/posts" should get us all the posts. Update the controllers as show below and then go to "/posts" in your browser.

##### NESTJS

```ts
import { Controller, Get } from '@nestjs/common';

// Interface Defining the Shape of a Post
interface Post {
    title: string,
    body: string
}

// Array of Posts
const posts:Array<Post> = [
    {title: "THe First Post", body: "The Body of the First Post"}
]

// Our Controller for "/posts"
@Controller('posts')
export class PostsController {

    @Get()
    index(): Array<Post> {
        return posts
    }

}
```

#### FOALTS

```ts
import { Context, Get, HttpResponseOK } from '@foal/core';

// Interface Defining the Shape of a Post
interface Post {
  title: string,
  body: string
}

// Array of Posts
const posts:Array<Post> = [
  {title: "THe First Post", body: "The Body of the First Post"}
]

export class PostsController {

  @Get('/')
  index(ctx: Context) {
    return new HttpResponseOK(posts);
  }

}
```

### The Show Route

In the show route we make a get request to "/posts/:id" and determine which post to show based on the id in the URL.

After updating your code in the browser go to "/posts/0" to test

#### NestJS

```ts
import { Controller, Get, Param } from '@nestjs/common';

// Interface Defining the Shape of a Post
interface Post {
    title: string,
    body: string
}

// Array of Posts
const posts:Array<Post> = [
    {title: "THe First Post", body: "The Body of the First Post"}
]

// Our Controller for "/posts"
@Controller('posts')
export class PostsController {

    @Get()
    index(): Array<Post> {
        return posts
    }

    @Get(':id')
    // use the params decorator to get the params
    show(@Param() params): Post {
        const id = params.id
        return posts[id]
    }

}
```

#### FoalTS

```ts
import { Context, Get, HttpResponseOK } from '@foal/core';

// Interface Defining the Shape of a Post
interface Post {
  title: string,
  body: string
}

// Array of Posts
const posts:Array<Post> = [
  {title: "THe First Post", body: "The Body of the First Post"}
]

export class PostsController {

  @Get('/')
  index(ctx: Context) {
    return new HttpResponseOK(posts);
  }

  @Get('/:id')
  show(ctx: Context){
    const id = ctx.request.params.id
    return new HttpResponseOK(posts[id])
  }

}
```

### The Create Route

The create route will be a post request to "/posts", we will use the data in the request body to create a new post. To test this out you'll need a tool like Postman or Insomnia.

#### NestJS

```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';

// Interface Defining the Shape of a Post
interface Post {
    title: string,
    body: string
}

// Array of Posts
const posts:Array<Post> = [
    {title: "THe First Post", body: "The Body of the First Post"}
]

// Our Controller for "/posts"
@Controller('posts')
export class PostsController {

    @Get()
    index(): Array<Post> {
        return posts
    }

    @Get(':id')
    show(@Param() params): Post {
        const id = params.id
        return posts[id]
    }

    @Post()
    // use body decorator to retrieve request body
    create(@Body() body:Post):Post {
        posts.push(body)
        return body
    }

}
```

#### FoalTS

```ts
import { Context, Get, HttpResponseOK, Post } from '@foal/core';

// Interface Defining the Shape of a Post
interface Post {
  title: string,
  body: string
}

// Array of Posts
const posts:Array<Post> = [
  {title: "THe First Post", body: "The Body of the First Post"}
]

export class PostsController {

  @Get('/')
  index(ctx: Context) {
    return new HttpResponseOK(posts);
  }

  @Get('/:id')
  show(ctx: Context){
    const id = ctx.request.params.id
    return new HttpResponseOK(posts[id])
  }

  @Post("/")
  create(ctx: Context){
    const body: Post = ctx.request.body
    posts.push(body)
    return new HttpResponseOK(body)
  }

}
```

### The Update Route

The update route takes a put request to "/posts/:id" and updates the post with the specified id. Use postman or insomnia to test.

#### NestJS

```ts
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

// Interface Defining the Shape of a Post
interface Post {
    title: string,
    body: string
}

// Array of Posts
const posts:Array<Post> = [
    {title: "THe First Post", body: "The Body of the First Post"}
]

// Our Controller for "/posts"
@Controller('posts')
export class PostsController {

    @Get()
    index(): Array<Post> {
        return posts
    }

    @Get(':id')
    show(@Param() params): Post {
        const id = params.id
        return posts[id]
    }

    @Post()
    create(@Body() body:Post):Post {
        posts.push(body)
        return body
    }

    @Put(":id")
    update(@Param() params, @Body() body: Post): Post {
        const id = params.id
        posts[id] = body
        return posts[id]
    }

}
```

#### FoalTS

```ts
import { Context, Get, HttpResponseOK, Post, Put } from '@foal/core';

// Interface Defining the Shape of a Post
interface Post {
  title: string,
  body: string
}

// Array of Posts
const posts:Array<Post> = [
  {title: "THe First Post", body: "The Body of the First Post"}
]

export class PostsController {

  @Get('/')
  index(ctx: Context) {
    return new HttpResponseOK(posts);
  }

  @Get('/:id')
  show(ctx: Context){
    const id = ctx.request.params.id
    return new HttpResponseOK(posts[id])
  }

  @Post("/")
  create(ctx: Context){
    const body: Post = ctx.request.body
    posts.push(body)
    return new HttpResponseOK(body)
  }

  @Put("/:id")
  update(ctx: Context){
    const body: Post = ctx.request.body
    const id = ctx.request.params.id
    posts[id] = body
    return new HttpResponseOK(posts[id])
  }

}
```

### THe Destroy Route

The Destroy route takes a delete request to "/posts/:id" and will deletes the post with the appropriate id.

#### NestJS

```ts
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

// Interface Defining the Shape of a Post
interface Post {
    title: string,
    body: string
}

// Array of Posts
const posts:Array<Post> = [
    {title: "THe First Post", body: "The Body of the First Post"}
]

// Our Controller for "/posts"
@Controller('posts')
export class PostsController {

    @Get()
    index(): Array<Post> {
        return posts
    }

    @Get(':id')
    show(@Param() params): Post {
        const id = params.id
        return posts[id]
    }

    @Post()
    create(@Body() body:Post):Post {
        posts.push(body)
        return body
    }

    @Put(":id")
    update(@Param() params, @Body() body: Post): Post {
        const id = params.id
        posts[id] = body
        return posts[id]
    }

    @Delete(":id")
    destroy(@Param() params):any {
        const id = params.id
        const post = posts.splice(id, 1)
        return post
    }

}
```

#### FoalTS

```ts
import { Context, Delete, Get, HttpResponseOK, Post, Put } from '@foal/core';

// Interface Defining the Shape of a Post
interface Post {
  title: string,
  body: string
}

// Array of Posts
const posts:Array<Post> = [
  {title: "THe First Post", body: "The Body of the First Post"}
]

export class PostsController {

  @Get('/')
  index(ctx: Context) {
    return new HttpResponseOK(posts);
  }

  @Get('/:id')
  show(ctx: Context){
    const id = ctx.request.params.id
    return new HttpResponseOK(posts[id])
  }

  @Post("/")
  create(ctx: Context){
    const body: Post = ctx.request.body
    posts.push(body)
    return new HttpResponseOK(body)
  }

  @Put("/:id")
  update(ctx: Context){
    const body: Post = ctx.request.body
    const id = ctx.request.params.id
    posts[id] = body
    return new HttpResponseOK(posts[id])
  }

  @Delete("/:id")
  destroy(ctx: Context){
    const id = ctx.request.params.id
    const post = posts.splice(id, 1)
    return new HttpResponseOK(post)
  }

}
```

## Conclusion

Nest and Foal present two of the main Backend frameworks that provide first-class support for Typescript. They have many more features and goodies built into their CLI to try out. They also both work really well with TypeORM, a database ORM that is built with First-Class Typescript support.