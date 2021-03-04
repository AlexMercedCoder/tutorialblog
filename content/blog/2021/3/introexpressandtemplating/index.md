---
title: API With GO Buffalo, from zero to deploy
date: "2021-03-04T12:12:03.284Z"
description: Buffalo, The Rails of the Go World
---

Go is becoming a popular choice for those who need to increase the speed of their web server and microservices. Buffalo is a framework to allow rapid development in GO similar to Ruby on Rails. In this tutorial we will make a basic API with buffalo and deploy it to Heroku.

## Prerequisites

- Go Installed
- [Buffalo installed](https://gobuffalo.io/en/docs/getting-started/installation)
- Postgres

## CLI Reference

| Command | Purpose |
|---------|---------|
| buffalo new {projectname} --api | create new project with api template |
| buffalo pop create -a | create all databases in database.yml |
| buffalo pop drop -a | drop all databases in database.yml |
| buffalo pop generate fizz {name of migration} | Create new migration |
| buffalo pop migrate | run migrations |
| buffalo pop g model {model name} | generate a model file |

## Setup

- create a new project with the command `buffalo new project1 --api`
*The --api flag like in rails will use an alternate template optmized for building apis*

- cd into the new folder project1 and open the folder in your editor

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
*Your postgres settings may different, make sure you use a username and password with the appropriate privileges*

## Migrating our Todo Table

First step is let's setup our table for our Todos.

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

- edit the migration file to match below so that you've added the item field to the struct and renamed any "todoes" to "todos". Also make sure to add the bit about overriding the tablename since it will by default look for a "todoes" table but our table is called "todos".

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
    ID uuid.UUID `json:"id" db:"id"`
	Item string `json:"item" db:"item"`
    CreatedAt time.Time `json:"created_at" db:"created_at"`
    UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

// TableName overrides the table name used by Pop.
func (u User) TableName() string {
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

- `buffalo g actions todo index show`

This will generate a todo.go file in the actions folder with a TodoIndex and TodoShow function which by default attempt to render a template, we'll fix that.