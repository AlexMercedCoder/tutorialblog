---
tags:
  - "scala"
  - "play"
author: "Alex Merced"
title: "How to write a JSON API in Scala with Play from scratch"
date: "2023-10-01T12:12:03.284Z"
category: "scala"
bannerImage: "https://i.imgur.com/nc4bdok.png"
---

## Step 1: Create a Blank SBT Project

Create a new directory for your project and navigate to it in your terminal.

Create a build.sbt file in the project directory and add the following content:

```scala
name := "todo-api"

version := "1.0"

scalaVersion := "2.13.8"

libraryDependencies ++= Seq(
  "com.typesafe.play" %% "play-json" % "2.9.4",
  "com.typesafe.play" %% "play-slick" % "5.0.0",
  "com.typesafe.play" %% "play-slick-evolutions" % "5.0.0",
  "org.postgresql" % "postgresql" % "42.2.14",
  "com.typesafe.play" %% "play-guice" % "2.8.8",
  "com.typesafe.play" %% "play" % "2.8.8"
)
```

Create a project/plugins.sbt file with the following content:

```scala
addSbtPlugin("com.typesafe.play" % "sbt-plugin" % "2.8.8")
```

Create a project/build.properties file with the following content:

```scala
sbt.version=1.5.5
```

Once we're done with this tutorial your file structure should look like this:

```shell
todo-api/
├── app/
│   ├── controllers/
│   │   └── TodoController.scala
│   ├── models/
│   │   └── Todo.scala
├── conf/
│   ├── application.conf
│   └── routes
├── project/
│   ├── build.properties
│   └── plugins.sbt
├── .gitignore
└── build.sbt
```

## Step 2: Configure the Database

Create a PostgreSQL database and remember the connection details (URL, username, and password).

Open the `conf/application.conf` file and configure the database connection:

```scala
db.default.driver = org.postgresql.Driver
db.default.url = "jdbc:postgresql://localhost:5432/your_database_name"
db.default.username = your_username
db.default.password = "your_password"
```

## Step 3: Define the Model

Create a models package in your project's app directory.

Inside the models package, create a Todo.scala file to define the "TODO" model:

```scala
package models

import play.api.libs.json._

case class Todo(id: Option[Long], task: String, completed: Boolean)

object Todo {
  implicit val todoFormat: OFormat[Todo] = Json.format[Todo]
}
```

## Step 4: Create the Controller

Create a controllers package in your project's app directory.

Inside the controllers package, create a TodoController.scala file to implement the API endpoints:

```scala
package controllers

import javax.inject.Inject
import play.api.libs.json._
import play.api.mvc._
import models.Todo
import play.api.db.slick.DatabaseConfigProvider
import slick.jdbc.JdbcProfile

import scala.concurrent.{ExecutionContext, Future}

class TodoController @Inject()(
    dbConfigProvider: DatabaseConfigProvider,
    cc: ControllerComponents
)(implicit ec: ExecutionContext)
    extends AbstractController(cc) {

  import profile.api._

  private val dbConfig = dbConfigProvider.get[JdbcProfile]

  private class TodoTable(tag: Tag) extends Table[Todo](tag, "todos") {
    def id = column[Option[Long]]("id", O.PrimaryKey, O.AutoInc)
    def task = column[String]("task")
    def completed = column[Boolean]("completed")

    def * = (id, task, completed) <> ((Todo.apply _).tupled, Todo.unapply)
  }

  private val todos = TableQuery[TodoTable]

  def createTodo: Action[JsValue] = Action.async(parse.json) { implicit request =>
    val todoResult = request.body.validate[Todo]
    todoResult.fold(
      errors => {
        Future(BadRequest(Json.obj("message" -> JsError.toJson(errors))))
      },
      todo => {
        val insertQuery = (todos returning todos.map(_.id)) += todo
        dbConfig.db.run(insertQuery).map { id =>
          Created(Json.obj("id" -> id, "task" -> todo.task, "completed" -> todo.completed))
        }
      }
    )
  }

  def getAllTodos: Action[AnyContent] = Action.async { _ =>
    val query = todos.result
    dbConfig.db.run(query).map { todos =>
      Ok(Json.toJson(todos))
    }
  }

  def getTodoById(id: Long): Action[AnyContent] = Action.async { _ =>
    val query = todos.filter(_.id === Some(id)).result.headOption
    dbConfig.db.run(query).map {
      case Some(todo) => Ok(Json.toJson(todo))
      case None => NotFound
    }
  }

  def updateTodo(id: Long): Action[JsValue] = Action.async(parse.json) { implicit request =>
    val todoResult = request.body.validate[Todo]
    todoResult.fold(
      errors => {
        Future(BadRequest(Json.obj("message" -> JsError.toJson(errors))))
      },
      updatedTodo => {
        val updateQuery = todos.filter(_.id === Some(id)).map(todo => (todo.task, todo.completed)).update((updatedTodo.task, updatedTodo.completed))
        dbConfig.db.run(updateQuery).map {
          case 0 => NotFound
          case _ => Ok(Json.toJson(updatedTodo))
        }
      }
    )
  }

  def deleteTodoById(id: Long): Action[AnyContent] = Action.async { _ =>
    val deleteQuery = todos.filter(_.id === Some(id)).delete
    dbConfig.db.run(deleteQuery).map {
      case 0 => NotFound
      case _ => NoContent
    }
  }
}
```

In this code:

The TodoController class defines endpoints for creating, retrieving, updating, and deleting TODO items.

It uses Play Framework's JSON serialization/deserialization to work with JSON data.
It uses Slick for database interactions.

## Step 5: Configure Routes

Create a conf/routes file in your project's conf directory if it doesn't already exist.

Inside the routes file, define the routes for your API endpoints. Here's an example for the TodoController:

```scala
# Routes
# This file defines all application routes (Higher priority routes first)
# ~~~~

# Home page
GET     /                           controllers.HomeController.index

# Define routes for the TodoController
GET     /todos                      controllers.TodoController.getAllTodos
POST    /todos                      controllers.TodoController.createTodo
GET     /todos/:id                  controllers.TodoController.getTodoById(id: Long)
PUT     /todos/:id                  controllers.TodoController.updateTodo(id: Long)
DELETE  /todos/:id                  controllers.TodoController.deleteTodoById(id: Long)
```

In the routes file:

You define routes for various HTTP methods (GET, POST, PUT, DELETE) and associate them with controller methods in the format controllers.ControllerName.methodName(arguments).

For example, GET /todos maps to the getAllTodos method in the TodoController.
The :id syntax in routes indicates a dynamic parameter that will be passed to the controller method.

By configuring the routes file, you specify how incoming requests are routed to the appropriate controller actions. This file is a crucial part of your Play Framework application's configuration.

## Step 6: Run the Application

Start the Play Framework application by running the following command in your project directory:

```bash
sbt run
```

Access the API endpoints at http://localhost:9000/todos.

You've now created a CRUD JSON API in Scala using the Play Framework with PostgreSQL integration. You can test your API using tools like Postman or curl.