---
title: Auth with Express with JWT, MongoDB, and Postgres
date: "2021-11-24T12:12:03.284Z"
description: For simple web development
---

![Header Image](https://imgur.com/W1WsHqL.jpg)

Authentication can always be tricky to understand and achieve. If you want more depth on the concept and high level of implementation, read the following articles:

- [Authentication and Authorization in Concept](https://tuts.alexmercedcoder.dev/2020/AuthConcept/)
- [Implmenting Auth at a High Level](https://tuts.alexmercedcoder.dev/2021/11/how_to_implement_authorization_master_guide/)

Fundamentally we just need to build the following to have an API with Auth.

- A user model to interface with a preferred database
- /signup post route for creating a new user
- /login route which will verify that the user exists, the password is correct, and issue a JWT token if all checks out
- /logout route for destroying any cookies we use

Whatever backend framework and language you use, the above is essentially the goal. We will be using Express for this tutorial and use MongoDB and Postgres to show you two ways to get the desired end result.

## Getting Started

- Create two folders, `express_mongo` and `express_postgres` we will be creating a different app in each folder. The setup in each folder will be the same.

## Express App Setup

Do the following for both folders (make sure your terminal is in the folder as you do it)

- create the necessary folders `mkdir connection models controllers utils`

- create the following files `touch server.js connection/db.js utils/middleware.js utils/cors.js controllers/HomeController.js`

- install the following libraries `npm install express dotenv cors morgan cookie-parser`

  - **express** Our Backend framework

  - **dotenv** Allows us to use a .env file to define env variables

  - **cors** sets our cors headers (so other websites including our frontend can make request to the API)

  - **morgan** logging to help troubleshoot and identify issues

  - **cookie-parser** parses cookies includes with incoming requests and saves them in req.cookie

- create a `.env` and `.gitignore` file

.env

```js
PORT = 4000
```

.gitignore

```js
/node_modules
.env
```

- in utils/cors.js let's add the following for configuring our cors headers if we want to tighten security.

```js
// whitelist of URLS that can make a request to your server
// to allow all urls, whitelist should have "*" as its first element
const whitelist = ["*"]

// if whitelist starts with "*" then all traffic allowed, otherwise if origin url is not in whitelist, request is blocked.
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist[0] === "*") {
      callback(null, true)
    } else {
      if (whitelist.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback(new Error("Not allowed by CORS"))
      }
    }
  },
}

module.exports = corsOptions
```

- lets create our HomeController with an initial route `controllers/HomeController`

```js
// New Express Router
const router = require("express").Router()

// Router Middleware

// Router Routes
router.get("/", (req, res) => {
  res.json({ response: "server is working" })
})

// Export Router
module.exports = router
```

- let's create a function for registering middleware in `utils/middleware.js`

```js
const express = require("express")
const cookieParser = require("cookie-parser")
const morgan = require("morgan")
const cors = require("cors")
const corsOptions = require("./cors")
const HomeController = require("../controllers/HomeController")

// function to create context property in every request with shared data
const applicationContext = (req, res, next) => {
  // data to share can be added in this object
  req.context = {}
  // move on to next middleware
  next()
}

const registerMiddleware = app => {
  app.use(cors(corsOptions)) // cors headers
  app.use(cookieParser()) // parse cookies
  app.use(express.json()) // parse json bodies
  app.use(morgan("tiny")) // logging
  app.use(applicationContext) // add context object to request
  app.use("/", HomeController) // register homecontroller routes for  "/" urls
}

module.exports = registerMiddleware
```

- then the following in server.js

```js
require("dotenv").config() // load variables from .env
const express = require("express")
const registerMiddleware = require("./utils/middleware")

// Grab any ENV variables to be used, set default values in case .env file missing
const { PORT = 3000 } = process.env

// The Application Object
const app = express()

// registerMiddleware
registerMiddleware(app)

// Server listener
app.listen(PORT, () => console.log(`listening on port ${PORT}`))
```

You can also use this template to have the code we've put forward so far.

- https://github.com/Alex-Merced-Templates/express_starter

## The Mongo Build

- install mongoose

- get a free mongo database at mongodb.com or install mongo and run a local mongo server, put the URL in your `.env`. Also define a variable called SECRET that can be any string you like.

```
PORT=4000
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/databaseName?retryWrites=true&w=majority
SECRET=thisIsMySecret
```

\*the database url above is an EXAMPLE, you need to get your own url

#### Connection

Inside of `connection/db.js`

```js
require("dotenv").config()
const mongoose = require("mongoose")

// get env variables
const { DATABASE_URL } = process.env

// connect to mongoose
mongoose.connect(DATABASE_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// Connection Messages
mongoose.connection
  .on("open", () => console.log("Connected to Mongo"))
  .on("close", () => console.log("Disconnected from Mongo"))
  .on("error", error => console.log(error))

// export connection
module.exports = mongoose
```

#### User Model

create a file `models/User.js`

```js
// import connection, grab schema and model
const { Schema, model } = require("../connection/db")

// define user schema
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, required: true, default: "general" },
  },
  { timestamps: true }
)

// define user model
const User = model("User", userSchema)

// export User
module.exports = User
```

#### Todo Model

`models/Todo.js`

```js
// import connection, grab schema and model
const { Schema, model } = require("../connection/db")

// define Todo schema
const todoSchema = new Schema(
  {
    message: { type: String, required: true },
    completed: { type: Boolean, default: false },
    username: { type: String, required: true },
  },
  { timestamps: true }
)

// define Todo model
const Todo = model("Todo", todoSchema)

// export Todo
module.exports = Todo
```

Now let's distribute these models using the context middleware so all our controllers can access them with ease!

`utils/middleware.js`

```js
const express = require("express")
const cookieParser = require("cookie-parser")
const morgan = require("morgan")
const cors = require("cors")
const corsOptions = require("./cors")
// import controllers
const HomeController = require("../controllers/HomeController")
// import models
const User = require("../models/User")
const Todo = require("../models/Todo")

// function to create context property in every request with shared data
const applicationContext = (req, res, next) => {
  // data to share can be added in this object
  req.context = {
    models: { User, Todo },
  }
  // move on to next middleware
  next()
}

const registerMiddleware = app => {
  app.use(cors(corsOptions)) // cors headers
  app.use(cookieParser()) // parse cookies
  app.use(express.json()) // parse json bodies
  app.use(morgan("tiny")) // logging
  app.use(applicationContext) // add context object to request
  app.use("/", HomeController) // register homecontroller routes for  "/" urls
}

module.exports = registerMiddleware
```

#### Auth Controller

- install bcrypt and jwt `npm install bcryptjs jsonwebtoken`

- create `controllers/AuthController.js`

```js
// New Express Router
const router = require("express").Router()
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
require("dotenv").config()

// Router Middleware

//signup route "/auth/signup"
router.post("/signup", async (req, res) => {
  try {
    // grab model from context
    const User = req.context.models.User
    // hash the password
    req.body.password = await bcrypt.hash(req.body.password, 10)
    // create new User
    const user = await User.create(req.body)
    // respond, send back user without password
    const response = { username: user.username, role: user.role }
    res.json(response)
  } catch (error) {
    res.status(400).json({ error })
  }
})

// login route "/auth/login"
router.post("/login", async (req, res) => {
  try {
    console.count("login")
    // grab model from context
    const User = req.context.models.User
    console.count("login")
    // grab username and password
    const { username, password } = req.body
    // see if user exists
    const user = await User.findOne({ username })
    if (user) {
      // check if password matches
      const doesItMatch = await bcrypt.compare(password, user.password)
      if (doesItMatch) {
        // remove password from user data
        const userData = { username: user.username, role: user.role }
        // sign token
        const token = jwt.sign(userData, process.env.SECRET)
        // respond
        res.cookie("token", token, { httpOnly: true }).json(userData)
      } else {
        throw "Passwords do not match"
      }
    } else {
      throw "User Does Not Exist"
    }
  } catch (error) {
    res.status(400).json({ error })
  }
})

// logout "/auth/logout"
router.get("/logout", async (req, res) => {
  res.clearCookie("token").json({ response: "You are Logged Out" })
})

// Export Router
module.exports = router
```

- register the AuthController with our middleware in `utils/middleware.js`

```js
const express = require("express")
const cookieParser = require("cookie-parser")
const morgan = require("morgan")
const cors = require("cors")
const corsOptions = require("./cors")
// import controllers
const HomeController = require("../controllers/HomeController")
const AuthController = require("../controllers/AuthController")
// import models
const User = require("../models/User")
const Todo = require("../models/Todo")

// function to create context property in every request with shared data
const applicationContext = (req, res, next) => {
  // data to share can be added in this object
  req.context = {
    models: { User, Todo },
  }
  // move on to next middleware
  next()
}

const registerMiddleware = app => {
  app.use(cors(corsOptions)) // cors headers
  app.use(cookieParser()) // parse cookies
  app.use(express.json()) // parse json bodies
  app.use(morgan("tiny")) // logging
  app.use(applicationContext) // add context object to request
  app.use("/", HomeController) // register homecontroller routes for  "/" urls
  app.use("/auth", AuthController) // register homecontroller routes for  "/auth" urls
}

module.exports = registerMiddleware
```

You now have the routes to signup, login and logout!!! Now let's create routes that allow users to create todos just for them.

#### Auth Middleware

To make sure only the correct user can access and modify a Todo we need to check whether a user is logged in and who is logged in, this can all be done by checking for the token cookie we sent. We will create custom middleware we can use on any route we want authorization required for!

`utils/auth.js`

```js
require("dotenv").config()
const jwt = require("jsonwebtoken")

const isUserLoggedIn = async (req, res, next) => {
  try {
    // check if the token is in the cookies
    const { token = false } = req.cookies
    if (token) {
      // verify token
      const payload = await jwt.verify(token, process.env.SECRET)
      // add payload to request
      req.payload = payload
      // move on
      next()
    } else {
      throw "Not Logged In"
    }
  } catch (error) {
    res.status(400).json({ error })
  }
}

module.exports = isUserLoggedIn
```

#### Todo Controller

`controllers/TodoController`

```js
// New Express Router
const router = require("express").Router()
const isUserLoggedIn = require("../utils/auth")

// Index Route "/todo", returns all todos for that user
router.get("/", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    res.json(await Todo.find({ username: req.payload.username }))
  } catch (error) {
    res.status(400).json({ error })
  }
})

// Create Route "/todo", creates a new todo
router.post("/", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    req.body.username = req.payload.username
    res.json(await Todo.create(req.body))
  } catch (error) {
    res.status(400).json({ error })
  }
})

// update Route "/todo/:id", updates a todo
router.put("/:id", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    const id = req.params.id
    res.json(await Todo.findByIdAndUpdate(id, req.body, { new: true }))
  } catch (error) {
    res.status(400).json({ error })
  }
})

// destroy Route "/todo/:id", deletes a todo
router.delete("/:id", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    const id = req.params.id
    res.json(await Todo.findByIdAndRemove(id))
  } catch (error) {
    res.status(400).json({ error })
  }
})

//export router
module.exports = router
```

- then register the router with our middleware

`utils/middleware`

```js
const express = require("express")
const cookieParser = require("cookie-parser")
const morgan = require("morgan")
const cors = require("cors")
const corsOptions = require("./cors")
// import controllers
const HomeController = require("../controllers/HomeController")
const AuthController = require("../controllers/AuthController")
const TodoController = require("../controllers/TodoController")
// import models
const User = require("../models/User")
const Todo = require("../models/Todo")

// function to create context property in every request with shared data
const applicationContext = (req, res, next) => {
  // data to share can be added in this object
  req.context = {
    models: { User, Todo },
  }
  // move on to next middleware
  next()
}

const registerMiddleware = app => {
  app.use(cors(corsOptions)) // cors headers
  app.use(cookieParser()) // parse cookies
  app.use(express.json()) // parse json bodies
  app.use(morgan("tiny")) // logging
  app.use(applicationContext) // add context object to request
  app.use("/", HomeController) // register homecontroller routes for  "/" urls
  app.use("/auth", AuthController) // register homecontroller routes for  "/auth" urls
  app.use("/todo", TodoController) // register todocontroller routes for  "/todo" urls
}

module.exports = registerMiddleware
```

**Congrats** you have now built a todo API with Mongo/Express with Authentication!

You can see the code up to this point here:
https://github.com/Alex-Merced-Templates/express_starter/tree/mongo

## Now With Postgres!

- install sequalize `npm install sequalize`

- install database drivers `npm install pg pg-hstore`

- get a postgres database from some database provider or run a postgres server on your computer

```
PORT=4000
DATABASE_URL=postgres://username:password@localhost:5432/express_app
SECRET=thisIsMySecret
```

\*the database url above is an EXAMPLE, you need to get your own url

#### Connection

Inside of `connection/db.js`

```js
require("dotenv").config()
const { Sequelize } = require("sequelize")

// connect to database
const sequelize = new Sequelize(process.env.DATABASE_URL)

// check if connection established
async function checkConnection() {
  try {
    await sequelize.authenticate()
    console.log("Connection has been established successfully.")
  } catch (error) {
    console.error("Unable to connect to the database:", error)
  }
}

checkConnection()

//export connection
module.exports = sequelize
```

#### User Model

create a file `models/User.js`

```js
// import connection, grab schema and model
const sequalize = require("../connection/db")
const { DataTypes } = require("sequelize")

// Define User Model
const User = sequalize.define(
  "User",
  {
    username: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false, defaultValue: "general" },
  },
  { tableName: "users", timestamps: true }
)

// create the table if doesn't exist

async function createTable() {
  await User.sync()
}

createTable()

// export User
module.exports = User
```

#### Todo Model

`models/Todo.js`

```js
// import connection, grab schema and model
const sequalize = require("../connection/db")
const { DataTypes } = require("sequelize")

// Define Todo Model
const Todo = sequalize.define(
  "Todo",
  {
    username: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.STRING },
  },
  { tableName: "todos", timestamps: true }
)

// create the table if doesn't exist

async function createTable() {
  await Todo.sync()
}

createTable()

// export User
module.exports = Todo
```

Now let's distribute these models using the context middleware so all our controllers can access them with ease!

`utils/middleware.js`

```js
const express = require("express")
const cookieParser = require("cookie-parser")
const morgan = require("morgan")
const cors = require("cors")
const corsOptions = require("./cors")
// import controllers
const HomeController = require("../controllers/HomeController")
// import models
const User = require("../models/User")
const Todo = require("../models/Todo")

// function to create context property in every request with shared data
const applicationContext = (req, res, next) => {
  // data to share can be added in this object
  req.context = {
    models: { User, Todo },
  }
  // move on to next middleware
  next()
}

const registerMiddleware = app => {
  app.use(cors(corsOptions)) // cors headers
  app.use(cookieParser()) // parse cookies
  app.use(express.json()) // parse json bodies
  app.use(morgan("tiny")) // logging
  app.use(applicationContext) // add context object to request
  app.use("/", HomeController) // register homecontroller routes for  "/" urls
}

module.exports = registerMiddleware
```

#### Auth Controller

- install bcrypt and jwt `npm install bcryptjs jsonwebtoken`

- create `controllers/AuthController.js`

```js
// New Express Router
const router = require("express").Router()
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
require("dotenv").config()

// Router Middleware

//signup route "/auth/signup"
router.post("/signup", async (req, res) => {
  try {
    // grab model from context
    const User = req.context.models.User
    // hash the password
    req.body.password = await bcrypt.hash(req.body.password, 10)
    // create new User
    const user = await User.create(req.body)
    // respond, send back user without password
    const response = { username: user.username, role: user.role }
    res.json(response)
  } catch (error) {
    res.status(400).json({ error })
  }
})

// login route "/auth/login"
router.post("/login", async (req, res) => {
  try {
    console.count("login")
    // grab model from context
    const User = req.context.models.User
    console.count("login")
    // grab username and password
    const { username, password } = req.body
    // see if user exists
    const user = await User.findOne({ where: { username } })
    if (user) {
      // check if password matches
      const doesItMatch = await bcrypt.compare(password, user.password)
      if (doesItMatch) {
        // remove password from user data
        const userData = { username: user.username, role: user.role }
        // sign token
        const token = jwt.sign(userData, process.env.SECRET)
        // respond
        res.cookie("token", token, { httpOnly: true }).json(userData)
      } else {
        throw "Passwords do not match"
      }
    } else {
      throw "User Does Not Exist"
    }
  } catch (error) {
    res.status(400).json({ error })
  }
})

// logout "/auth/logout"
router.get("/logout", async (req, res) => {
  res.clearCookie("token").json({ response: "You are Logged Out" })
})

// Export Router
module.exports = router
```

- register the AuthController with our middleware in `utils/middleware.js`

```js
const express = require("express")
const cookieParser = require("cookie-parser")
const morgan = require("morgan")
const cors = require("cors")
const corsOptions = require("./cors")
// import controllers
const HomeController = require("../controllers/HomeController")
const AuthController = require("../controllers/AuthController")
// import models
const User = require("../models/User")
const Todo = require("../models/Todo")

// function to create context property in every request with shared data
const applicationContext = (req, res, next) => {
  // data to share can be added in this object
  req.context = {
    models: { User, Todo },
  }
  // move on to next middleware
  next()
}

const registerMiddleware = app => {
  app.use(cors(corsOptions)) // cors headers
  app.use(cookieParser()) // parse cookies
  app.use(express.json()) // parse json bodies
  app.use(morgan("tiny")) // logging
  app.use(applicationContext) // add context object to request
  app.use("/", HomeController) // register homecontroller routes for  "/" urls
  app.use("/auth", AuthController) // register homecontroller routes for  "/auth" urls
}

module.exports = registerMiddleware
```

You now have the routes to signup, login and logout!!! Now let's create routes that allow users to create todos just for them.

#### Auth Middleware

To make sure only the correct user can access and modify a Todo we need to check whether a user is logged in and who is logged in, this can all be done by checking for the token cookie we sent. We will create custom middleware we can use on any route we want authorization required for!

`utils/auth.js`

```js
require("dotenv").config()
const jwt = require("jsonwebtoken")

const isUserLoggedIn = async (req, res, next) => {
  try {
    // check if the token is in the cookies
    const { token = false } = req.cookies
    if (token) {
      // verify token
      const payload = await jwt.verify(token, process.env.SECRET)
      // add payload to request
      req.payload = payload
      // move on
      next()
    } else {
      throw "Not Logged In"
    }
  } catch (error) {
    res.status(400).json({ error })
  }
}

module.exports = isUserLoggedIn
```

#### Todo Controller

`controllers/TodoController`

```js
// New Express Router
const router = require("express").Router()
const isUserLoggedIn = require("../utils/auth")

// Index Route "/todo", returns all todos for that user
router.get("/", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    res.json(await Todo.findAll({ where: { username: req.payload.username } }))
  } catch (error) {
    res.status(400).json({ error })
  }
})

// Create Route "/todo", creates a new todo
router.post("/", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    req.body.username = req.payload.username
    res.json(await Todo.create(req.body))
  } catch (error) {
    res.status(400).json({ error })
  }
})

// update Route "/todo/:id", updates a todo
router.put("/:id", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    const id = req.params.id
    res.json(await Todo.update(req.body, { where: { id } }))
  } catch (error) {
    res.status(400).json({ error })
  }
})

// destroy Route "/todo/:id", deletes a todo
router.delete("/:id", isUserLoggedIn, async (req, res) => {
  try {
    const Todo = req.context.models.Todo
    const id = req.params.id
    res.json(await Todo.destroy({ where: { id } }))
  } catch (error) {
    res.status(400).json({ error })
  }
})

//export router
module.exports = router
```

- then register the router with our middleware

`utils/middleware`

```js
const express = require("express")
const cookieParser = require("cookie-parser")
const morgan = require("morgan")
const cors = require("cors")
const corsOptions = require("./cors")
// import controllers
const HomeController = require("../controllers/HomeController")
const AuthController = require("../controllers/AuthController")
const TodoController = require("../controllers/TodoController")
// import models
const User = require("../models/User")
const Todo = require("../models/Todo")

// function to create context property in every request with shared data
const applicationContext = (req, res, next) => {
  // data to share can be added in this object
  req.context = {
    models: { User, Todo },
  }
  // move on to next middleware
  next()
}

const registerMiddleware = app => {
  app.use(cors(corsOptions)) // cors headers
  app.use(cookieParser()) // parse cookies
  app.use(express.json()) // parse json bodies
  app.use(morgan("tiny")) // logging
  app.use(applicationContext) // add context object to request
  app.use("/", HomeController) // register homecontroller routes for  "/" urls
  app.use("/auth", AuthController) // register homecontroller routes for  "/auth" urls
  app.use("/todo", TodoController) // register todocontroller routes for  "/todo" urls
}

module.exports = registerMiddleware
```

**Congrats** you have now built a todo API with Postgress/Express with Authentication!

You can see the code up to this point here:
https://github.com/Alex-Merced-Templates/express_starter/tree/postgres

## Taking It Further

Try accomplishing this again with a Graph Database like Neo4J or ArangoDB, both have their own cloud database service with a free tier, so why not!

- [Neo4J Tutorial](https://tuts.alexmercedcoder.dev/2021/9/using_graphdb_neo4j_in_node/)
- [ArangoDB Tutorial](https://blog.logrocket.com/using-arangodb-react-next-js/)
