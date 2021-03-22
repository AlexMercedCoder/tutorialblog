---
title: merced-express - Express with a Ruby on Rails Feel
date: "2021-03-22T12:12:03.284Z"
description: Express... on Rails...
---

If you've ever used Ruby on Rails it provides many awesome benefits with its command-line interface:

- The ability to quickly generate models, migrations and controllers
- Pretty easy plug'n'play database integration
- DB commands simplifying things like resetting and seeding the database

I really do enjoy these tools in rails, but I also really enjoy the flexibility and simplicity of Express when paired with a Mongo Database. So I took it upon myself to create an express-based framework that has a rails like feel and level of productivity. Enter, Merced-Express.

The best way to demonstrate is just to guide you in creating a quick project.

## Creating a Todo App with Authentication

#### Generating the Project

Create a new project with the command `npx create-merced-express todoapp`

- cd into the todoapp folder

- run `npm install`


#### Configuring Settings

- create a .env file in the project root and define the following

```
DATABASE_URL=mongodb://username:password@host/databasename
SECRET=secretforjwttokens
PORT=3000
```
*make sure to use a mongoDB uri for a database you control.*

#### Generating The Todo Model

Run the resource generator with `npm run gen resource Todo`

Let's add some properties to our todo model in models/Todo.js

```js
//----------------------------------------
      //  New Schema
      //----------------------------------------
      
      const TodoSchema = new Schema({
        subject: String
      }, { timestamps: true });
```

- If you notice all the routes are already all set in the TodoController in the controllers folder and it has already been registered as a router with the HomeController.

#### Adding Authentication

Let's scaffold out the authentication files with the command `npm run gen auth`

All the authentication files have been created. All we need to do now is wire the auth middleware to the TodoController

```js
     //----------------------------------------
     //  Import Dependencies
     //----------------------------------------
     import { Router } from "express";
     import Todo from "../models/Todo.js";
     import auth from "../config/auth.js"
     
     //----------------------------------------
     //  Create Router
     //----------------------------------------
     const TodoRouter = Router();

     //----------------------------------------
     //  Router Middleware
     //----------------------------------------
     TodoRouter.use(auth)
     
```

#### Testing

Run the app and you should be able to do the following:

- create a new user with a post request to /user/create (username and password in request body)

- login and receive a token with a post request to /user/login (username and password in request body)

Now we can make requests to all our todo routes as long as we have the token in our header in bearer form.

```json
"Authorization":"bearer <token>"
```
*your token should replace the `<token>`, no angle brackets should be in the header*

Now you can make all your CRUD requests...

```
index => get request to /todo
show => get request to /todo/:id
create => post request to /todo
update => put request to /todo/:id
destroy => delete request to /todo/:id
```

## That's it!

In a few commands, you have built a full crud API with authentication with fully customizable code. Enjoy! Tell Your Friends!