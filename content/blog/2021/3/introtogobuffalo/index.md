---
title: API With GO Buffalo, from zero to deploy
date: "2021-03-04T12:12:03.284Z"
description: Buffalo, The Rails of the Go World
---

Go is becoming a popular choice for those who need to increase the speed of their web server and microservices. Buffalo is a framework to allow rapid development in GO similar to Ruby on Rails. In this tutorial, we will make a basic API with buffalo and deploy it to Heroku.

## Prerequisites

- Go Installed
- [Buffalo installed](https://gobuffalo.io/en/docs/getting-started/installation)
- Postgres

## CLI Reference

| Command | Purpose |
|---------|---------|
| buffalo new {projectname} --api | create new project with api template |
| buffalo dev | run development server |
| buffalo pop create -a | create all databases in database.yml |
| buffalo pop drop -a | drop all databases in database.yml |
| buffalo pop generate fizz {name of migration} | Create new migration |
| buffalo pop migrate | run migrations |
| buffalo pop g model {model name} | generate a model file |

## Setup

- create a new project with the command `buffalo new project1 --api`
*The --api flag like in rails will use an alternate template optimized for building apis*

- cd into the new folder project1 and open the folder in your editor

- run `buffalo dev` to make sure the dev server is working

#### note

In Go 1.16 or later with buffalo 0.16.21 or earlier may have some issues to take care of.

- If it starts asking you to do a go get on a bunch of libraries... do so. I think this is caused in go 1.16 a go install doesn't auto add modules to go.mod so until fixed you'll have to add manually.

```
go get github.com/gobuffalo/envy@v1.9.0
go get github.com/gobuffalo/pop/v5@v5.3.0
go get github.com/gobuffalo/packr/v2@v2.8.0
go get github.com/rs/cors
go get github.com/gobuffalo/buffalo-pop/v2/pop/popmw@v2.3.0
go get github.com/gobuffalo/validate/v3@v3.1.0
go get github.com/gofrs/uuid@v3.2.0+incompatible
go get
go mod tidy
```

- If you get an error about sqlite3 exporting this into your environment should fix the issue, this seems to not be a go or buffalo issue but an issue regarding libsqlite3 and particular versions of the gcc compiler. `export CGO_CFLAGS="-g -O2 -Wno-return-local-addr"`

- If get an error regarding packr make sure to add the following to the import statement in actions/app.go `"github.com/gobuffalo/packr/v2"`

## Setting up our database

We will be using Postgres so we need to configure our database settings inside our database.yml.

```yml
development:
  dialect: postgres
  database: project1_development
  user: test5
  password: test5
  host: 127.0.0.1
  pool: 5

test:
  url: {{envOr "TEST_DATABASE_URL" "postgres://test5:test5@127.0.0.1:5432/project1_test?sslmode=disable"}}

production:
  url: {{envOr "DATABASE_URL" "postgres://test5:test5@127.0.0.1:5432/project1_production?sslmode=disable"}}
```
*Your postgres settings may differ, make sure you use a username and password with the appropriate privileges*

## Migrating our Todo Table

The first step is let's set up our table for our Todos.

- `buffalo pop generate fizz create_todos`

Two new files are created in your migrations folder. An up migration for adding and updating tables and a down migration for undoing those changes.

For the up migration add this...

```go
create_table("todos") {
  t.Column("id", "integer", {primary: true})
  t.Column("item", "string", {"size": 100})
}
```

For the down migration add this...

```go
drop_table("todos")
```

- Run the migration with the command `buffalo pop migrate`

## Creating our Model

So now that our table has been created we need a model to take advantage of the ORM to interact with the table.

- generate a migration with the command `buffalo pop g model todo`

- edit the migration file to match below so that you've added the item field to the struct and renamed any "todoes" to "todos". Also make sure to add the bit about overriding the tablename since it will by default look for a "todoes" table but our table is called "todos". (Make sure the type of your ID field matches the type in your migration)

```go
package models

import (
	"encoding/json"
	"github.com/gobuffalo/pop/v5"
	"github.com/gobuffalo/validate/v3"
	"github.com/gofrs/uuid"
	"time"
)
// Todo is used by pop to map your todoes database table to your go code.
type Todo struct {
    ID int `json:"id" db:"id"`
	Item string `json:"item" db:"item"`
    CreatedAt time.Time `json:"created_at" db:"created_at"`
    UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// TableName overrides the table name used by Pop.
func (u Todo) TableName() string {
	return "todos"
  }

// String is not required by pop and may be deleted
func (t Todo) String() string {
	jt, _ := json.Marshal(t)
	return string(jt)
}

// Todoes is not required by pop and may be deleted
type Todos []Todo

// String is not required by pop and may be deleted
func (t Todos) String() string {
	jt, _ := json.Marshal(t)
	return string(jt)
}

// Validate gets run every time you call a "pop.Validate*" (pop.ValidateAndSave, pop.ValidateAndCreate, pop.ValidateAndUpdate) method.
// This method is not required and may be deleted.
func (t *Todo) Validate(tx *pop.Connection) (*validate.Errors, error) {
	return validate.NewErrors(), nil
}

// ValidateCreate gets run every time you call "pop.ValidateAndCreate" method.
// This method is not required and may be deleted.
func (t *Todo) ValidateCreate(tx *pop.Connection) (*validate.Errors, error) {
	return validate.NewErrors(), nil
}

// ValidateUpdate gets run every time you call "pop.ValidateAndUpdate" method.
// This method is not required and may be deleted.
func (t *Todo) ValidateUpdate(tx *pop.Connection) (*validate.Errors, error) {
	return validate.NewErrors(), nil
}
```

## Building our actions

Our actions will be our functions that we will connect routes for our api. To generate some actions use the following command.

- `buffalo g actions todo index show add`

This will generate a todo.go file in the actions folder with a TodoIndex, TodoShow, TodoAdd function which by default attempt to render a template, we'll fix that.

your actions/todo.go should look like this

```go
package actions

import (
    "net/http"
	"github.com/gobuffalo/buffalo"
	"project1/models"
)

// TodoIndex default implementation.
func TodoIndex(c buffalo.Context) error {
	// Create an array to receive todos
	todos := []models.Todo{}
	//get all the todos from database
    err := models.DB.All(&todos)
	// handle any error
	if err != nil {
		return c.Render(http.StatusOK, r.JSON(err))
	}
	//return list of todos as json
	return c.Render(http.StatusOK, r.JSON(todos))
}

// TodoShow default implementation.
func TodoShow(c buffalo.Context) error {
	// grab the id url parameter defined in app.go
	id := c.Param("id")
	// create a variable to receive the todo
	todo := models.Todo{}
	// grab the todo from the database
	err := models.DB.Find(&todo, id)
	// handle possible error
	if err != nil {
		return c.Render(http.StatusOK, r.JSON(err))
	}
	//return the data as json
	return c.Render(http.StatusOK, r.JSON(&todo))
}


// TodoAdd default implementation.
func TodoAdd(c buffalo.Context) error {

	//get item from url query
	item := c.Param("item")
	
	//create new instance of todo
	todo := models.Todo{Item: item}

	// Create a fruit without running validations
	err := models.DB.Create(&todo)

	// handle error
	if err != nil {
		return c.Render(http.StatusOK, r.JSON(err))
	}

	//return new todo as json
	return c.Render(http.StatusOK, r.JSON(todo))
}
```

## Creating the routes

Now the routes will have been added already in actions/app.go when we generated the actions but we'll make some modifications that match the code below.

```go
package actions

import (
	"project1/models"
	"github.com/gobuffalo/buffalo"
	"github.com/gobuffalo/envy"
	forcessl "github.com/gobuffalo/mw-forcessl"
	i18n "github.com/gobuffalo/mw-i18n"
	paramlogger "github.com/gobuffalo/mw-paramlogger"
	"github.com/unrolled/secure"
	"github.com/gobuffalo/buffalo-pop/v2/pop/popmw"
	contenttype "github.com/gobuffalo/mw-contenttype"
	"github.com/gobuffalo/x/sessions"
	"github.com/rs/cors"
	"github.com/gobuffalo/packr/v2"
)

// ENV is used to help switch settings based on where the
// application is being run. Default is "development".
var ENV = envy.Get("GO_ENV", "development")
var app *buffalo.App
var T *i18n.Translator

// App is where all routes and middleware for buffalo
// should be defined. This is the nerve center of your
// application.
//
// Routing, middleware, groups, etc... are declared TOP -> DOWN.
// This means if you add a middleware to `app` *after* declaring a
// group, that group will NOT have that new middleware. The same
// is true of resource declarations as well.
//
// It also means that routes are checked in the order they are declared.
// `ServeFiles` is a CATCH-ALL route, so it should always be
// placed last in the route declarations, as it will prevent routes
// declared after it to never be called.
func App() *buffalo.App {
	if app == nil {
		app = buffalo.New(buffalo.Options{
			Env:          ENV,
			SessionStore: sessions.Null{},
			PreWares: []buffalo.PreWare{
				cors.Default().Handler,
			},
			SessionName: "_project1_session",
		})

		// Automatically redirect to SSL
		app.Use(forceSSL())

		// Log request parameters (filters apply).
		app.Use(paramlogger.ParameterLogger)

		// Set the request content type to JSON
		app.Use(contenttype.Set("application/json"))

		// Wraps each request in a transaction.
		//  c.Value("tx").(*pop.Connection)
		// Remove to disable this.
		app.Use(popmw.Transaction(models.DB))

		app.GET("/", HomeHandler)
		app.GET("/todo/", TodoIndex)
		app.GET("/todo/add", TodoAdd)
		app.GET("/todo/{id}", TodoShow) // <--- MAKE SURE THIS IS AT BOTTOM OF LIST
	}

	return app
}

// translations will load locale files, set up the translator `actions.T`,
// and will return a middleware to use to load the correct locale for each
// request.
// for more information: https://gobuffalo.io/en/docs/localization
func translations() buffalo.MiddlewareFunc {
	var err error
	if T, err = i18n.New(packr.New("app:locales", "../locales"), "en-US"); err != nil {
		app.Stop(err)
	}
	return T.Middleware()
}

// forceSSL will return a middleware that will redirect an incoming request
// if it is not HTTPS. "http://example.com" => "https://example.com".
// This middleware does **not** enable SSL. for your application. To do that
// we recommend using a proxy: https://gobuffalo.io/en/docs/proxy
// for more information: https://github.com/unrolled/secure/
func forceSSL() buffalo.MiddlewareFunc {
	return forcessl.Middleware(secure.Options{
		SSLRedirect:     ENV == "production",
		SSLProxyHeaders: map[string]string{"X-Forwarded-Proto": "https"},
	})
}
```

## Testing

- Run `buffalo dev` to run dev server
- create a todo with `localhost:3000/todo/add?item="breakfast"`
- create 2 or 3 more
- see the full list at `localhost:3000/todo/`
- grab an individual one at `localhost:3000/todo/1`

If all works let's begin discussing deployment!

## Deployment

- Add this comment in your go.mod with your version of go - `// +heroku goVersion 1.16`

- create a Procfile in the root of your project with the following

```
web: ./bin/project1
```

- create a new project on Heroku, under the resources tab create a new Heroku Postgres database

- head over to settings and the following config var

```
GO_ENV=production
```

- go back to resources click on the database to go to its dashboard, go to settings and find the connection URI under credentials

- copy it to your local .env in your project

```
DATABASE_URL=postgres://username:password@server.amazonaws.com:5432/databasename
```

- migrate your database with the command `buffalo pop migrate -e production`

- commit and push your code to GitHub

- connect it to your Heroku project under the deploy tab, enable automatic deploys, and trigger a manual deploy

Test it out, should be working!!!

## Conclusion

While there is still a lot more to learn about working with Buffalo, this should give you a solid foundation to begin exploring further!