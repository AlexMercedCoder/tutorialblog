---
title: 1 Backend, 5 Frontends - Todo List with Rails, React, Angular, Vue, Svelte, and jQuery
date: "2020-11-17T22:12:03.284Z"
description: Same app... different frontend frameworks
---

## Why are we doing this?

One of my favorite way to sharpen my skills with different frameworks is build todo lists. It's easy and quick to build and building the same app in different stacks makes what is the same and what is different between frameworks very clear.

In this tutorial we will...

- Create a basic todo list api using rails

- Create a frontend using React

- Create a frontend using Vue

- Create a frontend using Angular

- Create a frontend using Svelte

Hopefully by the time you are done you'll have an appreciation for the three big frontend frameworks and the modularity of working with APIs versus server side rendering.

## What you'll need

- Need Ruby Installed
- Need Rails Installed
- Need NodeJS installed
- Familiarity with the Ruby and Javascript Programming Languages
- Familiarity with Web Development Concepts

## Building the API

### SETUP

1. Create a Folder called "todo" all our apps will be in this folder

2. Open your terminal in the todo folder

3. run the command `rails new todo_backend --api -d postgresql`
   _Feel Free to use whichever database you are most comfortable with_

### Database Setup

head to config/database.yml and setup your database setting to match your local database settings. Below is an example for postgres, keep in mind your postgres username and password may be different.

```yml
default: &default
  adapter: postgresql
  encoding: unicode
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  user: test5
  password: test5
  host: localhost
  port: 5432

## Development and test will pull the info from default to make use of your local postgres server
development:
  <<: *default
  database: todo_backend_development

test:
  <<: *default
  database: todo_backend_test

## If you plan on deploying to Heroku, the setup below will make sure when you deploy to heroku it will be pointing to your heroku database.
production:
  <<: *default
  url: <%= ENV['DATABASE_URL'] %>
```

Now that your database settings are set we need to create the database by running the command `rails db:create`. If it is not working make sure that your database settings are correct.

### Creating the Todo Model

We can quickly scaffold our todo API using Rails Scaffold generator which will create our migration, model, routes, controller and controller functions for us.

`rails g scaffold todo title:string body:string`

If you want feel to examine all the files it created but all we have left to do is run our migrations so the todos table is created in our database.

`rails db:migrate`

Now our API is essentially done, that was pretty easy. Let's next seed then database and make sure our CORS permissions are set to allow requests from other applications.

### Seed the Database

Head to the db/seeds.rb and add some seed data

```ruby

Todo.create({title: "Breakfast", body: "Eat Breakfast"})
Todo.create({title: "Lunch", body: "Eat Lunch"})
Todo.create({title: "Dinner", body: "Eat Dinner"})

p Todo.all

```

Now run the seed so the database gets populated. `rails db:seed`

### Configuring CORS

If we don't configure CORS headers then our frontend will fail when it tries to make request to our server. So just do the following.

1. Uncomment `gem 'rack-cors'` in Gemfile and run `bundle install`

2. Then head into config/initializers/cors.rb and make sure it looks like this...

```ruby

# Be sure to restart your server when you modify this file.

# Avoid CORS issues when API is called from the frontend app.
# Handle Cross-Origin Resource Sharing (CORS) in order to accept cross-origin AJAX requests.

# Read more: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'

    resource '*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end

```

### Test the API

- Run the server `rails server`

- Open up postman (download it if you don't have it)

- Make a get request to http://localhost:3000/todos, you should see all the todos we added.

- Make post request to http://localhost:3000/todos submitting the following json, then do another get request to confirm a new todo was created.

```json
{
  "title": "Brunch",
  "body": "Eating Brunch"
}
```

- Make a put request to http://localhost:3000/todos/4 to edit our new todo which should have an ID of 4. Use the JSON below then do another get request to to localhost:3000/todos to confirm it was altered.

```json
{
  "title": "Brunch II",
  "body": "Eating Brunch II"
}
```

- Last make a delete request to http://localhost:3000/todos/4 to delete Brunch II then make another get request to localhost:3000/todos to confirm it was deleted.

### Complete

Your todo API is complete, you can deploy it or just run it locally so that you can make request to the API from your frontend application.

---

## React Frontend

### Setup

1. Make sure your backend server is deployed or running locally in separate terminal window

2. Navigate terminal to your todo folder and run the following command...

`npx create-react-basic todo_react_frontend`

if for some reason npx doesn't work for you then you can clone the same template with the following command.

`git clone https://github.com/AlexMercedCoder/react_webpack_basic.git todo_react_frontend`

After either command, change directory (cd) into the new todo_react_frontend folder and run 'npm install' to install all the dependencies

### Getting Started

Navigate to src/components/App.js and let's create some state to hold the data from our API, function to make a call to our api and save the data in that state, and then call that function from a useEffect call so it grabs the data when the page loads.

```js
import React from "react"

export const App = props => {
  ////////////////
  //STATE
  ////////////////

  // The State we'll save our API Data in
  const [todos, setTodos] = React.useState([])

  ////////////////////////
  // FUNCTIONS
  ////////////////////////

  //Our function to grab the latest list of todos
  const getTodos = async () => {
    //We make a request to our backend server
    const response = await fetch("http://localhost:3000/todos")
    //Convert the response into a javascript object
    const data = await response.json()
    //assign the data to our state
    setTodos(data)
  }

  /////////////////////////
  // useEffects
  /////////////////////////
  //useEffect to initially grab todos when page loads
  React.useEffect(() => {
    getTodos()
  }, [])

  /////////////////////////
  //RETURN JSX
  /////////////////////////

  return <h1>Hello World</h1>
}
```

Then run the app in the browser with command `npm run dev` and check the react dev tools to make sure your api data was saved to the state in the App component.

### Render the Todos To The Screen

We have the data being saved in the state but if we just render jsx with the data it will error... why?

**Because the site will render once before the API call completes so references to the data will cause the app to error, so we need to conditionally render the data.**

What we will do is make the JSX we want to conditionally rendered be return by a function and use ternary to only run the function if the todos array is greater than one.

```js
import React from "react"

export const App = props => {
  ////////////////
  //STATE
  ////////////////

  // The State we'll save our API Data in
  const [todos, setTodos] = React.useState([])

  ////////////////////////
  // FUNCTIONS
  ////////////////////////

  //Our function to grab the latest list of todos
  const getTodos = async () => {
    //We make a request to our backend server
    const response = await fetch("http://localhost:3000/todos")
    //Convert the response into a javascript object
    const data = await response.json()
    //assign the data to our state
    setTodos(data)
  }

  //Function that returns JSX to display todos
  const TodosLoaded = () => (
    <h2>
      {todos.map(todo => (
        <div>
          <h2>{todo.title}</h2>
          <h3>{todo.body}</h3>
        </div>
      ))}
    </h2>
  )

  // Variable with JSX to display if no todos exist
  const noTodos = <h1>No Todos</h1>

  /////////////////////////
  // useEffects
  /////////////////////////
  //useEffect to initially grab todos when page loads
  React.useEffect(() => {
    getTodos()
  }, [])

  /////////////////////////
  //RETURN JSX
  /////////////////////////
  //In the JSX below we run the TodosLoaded function if there is at least one todo or render the contents of noTodos if there isn't any.
  return (
    <div>
      <h1>The Todo App</h1>
      {todos.length > 0 ? TodosLoaded() : noTodos}
    </div>
  )
}
```

### Being able to create a new todo

Here we need to add a form for adding a new todo. We will create a new state for the create form, we need a handleChange function to update the state as we type in the inputs, a handleCreate function that will be triggered on form submission to create a new todo by making a post request to our server.

```js
import React from "react"

export const App = props => {
  ////////////////
  //STATE
  ////////////////

  //Blank form object to initialize form and reset it
  const blankForm = {
    title: "",
    body: "",
  }

  // The State we'll save our API Data in
  const [todos, setTodos] = React.useState([])

  //State for Our Create Todo Form, initialized with empty strings
  const [createForm, setCreateForm] = React.useState(blankForm)

  ////////////////////////
  // FUNCTIONS
  ////////////////////////

  //Our function to grab the latest list of todos
  const getTodos = async () => {
    //We make a request to our backend server
    const response = await fetch("http://localhost:3000/todos")
    //Convert the response into a javascript object
    const data = await response.json()
    //assign the data to our state
    setTodos(data)
  }

  //Function that returns JSX to display todos
  const TodosLoaded = () => (
    <h2>
      {todos.map(todo => (
        <div>
          <h2>{todo.title}</h2>
          <h3>{todo.body}</h3>
        </div>
      ))}
    </h2>
  )

  // Variable with JSX to display if no todos exist
  const noTodos = <h1>No Todos</h1>

  //Function to update state when people type in create form
  const handleCreateChange = event => {
    //update the create form state determining the key and value based on the form fields name and value properties since it will be the event target.
    setCreateForm({ ...createForm, [event.target.name]: event.target.value })
  }

  const handleCreate = async event => {
    //prevent form from refreshing screen
    event.preventDefault()
    //make post request to our backend server
    const response = await fetch("http://localhost:3000/todos", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createForm),
    })
    //update the list of todos be refetching the list
    await getTodos()
    //reset form
    setCreateForm(blankForm)
  }

  /////////////////////////
  // useEffects
  /////////////////////////
  //useEffect to initially grab todos when page loads
  React.useEffect(() => {
    getTodos()
  }, [])

  /////////////////////////
  //RETURN JSX
  /////////////////////////
  //In the JSX below we run the TodosLoaded function if there is at least one todo or render the contents of noTodos if there isn't any.
  return (
    <div>
      <h1>The Todo App</h1>
      <h1>Create a Todo</h1>
      <form onSubmit={handleCreate}>
        <input
          type="text"
          name="title"
          value={createForm.title}
          onChange={handleCreateChange}
        />
        <input
          type="text"
          name="body"
          value={createForm.body}
          onChange={handleCreateChange}
        />
        <input type="submit" value="Create Todo" />
      </form>
      <h1>Todos</h1>
      {todos.length > 0 ? TodosLoaded() : noTodos}
    </div>
  )
}
```

### Being able to Update a Todo

We need another form setup just like create, but we also need a function to pass an existing todo to that forms state, but otherwise pretty much the same as the creating of a todo. We will add an edit button to the JSX in our TodosLoaded Function.

```js
import React from "react"

export const App = props => {
  ////////////////
  //STATE
  ////////////////

  //Blank form object to initialize form and reset it
  const blankForm = {
    title: "",
    body: "",
  }

  // The State we'll save our API Data in
  const [todos, setTodos] = React.useState([])

  //State for Our Create Todo Form, initialized with empty strings
  const [createForm, setCreateForm] = React.useState(blankForm)

  //State for Our Update Todo Form, initialized with empty strings
  const [updateForm, setUpdateForm] = React.useState(blankForm)

  ////////////////////////
  // FUNCTIONS
  ////////////////////////

  //Our function to grab the latest list of todos
  const getTodos = async () => {
    //We make a request to our backend server
    const response = await fetch("http://localhost:3000/todos")
    //Convert the response into a javascript object
    const data = await response.json()
    //assign the data to our state
    setTodos(data)
  }

  //Function that returns JSX to display todos
  const TodosLoaded = () => (
    <>
      {todos.map(todo => (
        <div>
          <h2>{todo.title}</h2>
          <h3>{todo.body}</h3>
          <button onClick={() => setUpdateForm(todo)}>Edit</button>
        </div>
      ))}
    </>
  )

  // Variable with JSX to display if no todos exist
  const noTodos = <h1>No Todos</h1>

  //Function to update state when people type in create form
  const handleCreateChange = event => {
    //update the create form state determining the key and value based on the form fields name and value properties since it will be the event target.
    setCreateForm({ ...createForm, [event.target.name]: event.target.value })
  }

  const handleCreate = async event => {
    //prevent form from refreshing screen
    event.preventDefault()
    //make post request to our backend server
    const response = await fetch("http://localhost:3000/todos", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createForm),
    })
    //update the list of todos be refetching the list
    await getTodos()
    //reset form
    setCreateForm(blankForm)
  }

  //Function to update state when people type in update form
  const handleUpdateChange = event => {
    //update the update form state determining the key and value based on the form fields name and value properties since it will be the event target.
    setUpdateForm({ ...updateForm, [event.target.name]: event.target.value })
  }

  const handleUpdate = async event => {
    //prevent form from refreshing screen
    event.preventDefault()
    //make put request to our backend server
    const response = await fetch(
      "http://localhost:3000/todos/" + updateForm.id,
      {
        method: "put",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateForm),
      }
    )
    //update the list of todos be refetching the list
    await getTodos()
    //reset form
    setUpdateForm(blankForm)
  }

  /////////////////////////
  // useEffects
  /////////////////////////
  //useEffect to initially grab todos when page loads
  React.useEffect(() => {
    getTodos()
  }, [])

  /////////////////////////
  //RETURN JSX
  /////////////////////////
  //In the JSX below we run the TodosLoaded function if there is at least one todo or render the contents of noTodos if there isn't any.
  return (
    <div>
      <h1>The Todo App</h1>
      <h1>Create a Todo</h1>
      <form onSubmit={handleCreate}>
        <input
          type="text"
          name="title"
          value={createForm.title}
          onChange={handleCreateChange}
        />
        <input
          type="text"
          name="body"
          value={createForm.body}
          onChange={handleCreateChange}
        />

        <input type="submit" value="Create Todo" />
      </form>
      <h1>Update a Todo</h1>
      <form onSubmit={handleUpdate}>
        <input
          type="text"
          name="title"
          value={updateForm.title}
          onChange={handleUpdateChange}
        />
        <input
          type="text"
          name="body"
          value={updateForm.body}
          onChange={handleUpdateChange}
        />

        <input type="submit" value="Update Todo" />
      </form>
      <h1>Todos</h1>
      {todos.length > 0 ? TodosLoaded() : noTodos}
    </div>
  )
}
```

### Deleting a Todo

This one one is fairly simple, we'll add a function to make the delete request and then add a delete button next to our edit button that passed the todo to the deleteTodo function. Then We're done!

```js
import React from "react"

export const App = props => {
  ////////////////
  //STATE
  ////////////////

  //Blank form object to initialize form and reset it
  const blankForm = {
    title: "",
    body: "",
  }

  // The State we'll save our API Data in
  const [todos, setTodos] = React.useState([])

  //State for Our Create Todo Form, initialized with empty strings
  const [createForm, setCreateForm] = React.useState(blankForm)

  //State for Our Update Todo Form, initialized with empty strings
  const [updateForm, setUpdateForm] = React.useState(blankForm)

  ////////////////////////
  // FUNCTIONS
  ////////////////////////

  //Our function to grab the latest list of todos
  const getTodos = async () => {
    //We make a request to our backend server
    const response = await fetch("http://localhost:3000/todos")
    //Convert the response into a javascript object
    const data = await response.json()
    //assign the data to our state
    setTodos(data)
  }

  //Function that returns JSX to display todos
  const TodosLoaded = () => (
    <>
      {todos.map(todo => (
        <div>
          <h2>{todo.title}</h2>
          <h3>{todo.body}</h3>
          <button onClick={() => setUpdateForm(todo)}>Edit</button>
          <button onClick={() => handleDelete(todo)}>Delete</button>
        </div>
      ))}
    </>
  )

  // Variable with JSX to display if no todos exist
  const noTodos = <h1>No Todos</h1>

  //Function to update state when people type in create form
  const handleCreateChange = event => {
    //update the create form state determining the key and value based on the form fields name and value properties since it will be the event target.
    setCreateForm({ ...createForm, [event.target.name]: event.target.value })
  }

  const handleCreate = async event => {
    //prevent form from refreshing screen
    event.preventDefault()
    //make post request to our backend server
    const response = await fetch("http://localhost:3000/todos", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createForm),
    })
    //update the list of todos be refetching the list
    await getTodos()
    //reset form
    setCreateForm(blankForm)
  }

  //Function to update state when people type in update form
  const handleUpdateChange = event => {
    //update the update form state determining the key and value based on the form fields name and value properties since it will be the event target.
    setUpdateForm({ ...updateForm, [event.target.name]: event.target.value })
  }

  const handleUpdate = async event => {
    //prevent form from refreshing screen
    event.preventDefault()
    //make put request to our backend server
    const response = await fetch(
      "http://localhost:3000/todos/" + updateForm.id,
      {
        method: "put",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateForm),
      }
    )
    //update the list of todos be refetching the list
    await getTodos()
    //reset form
    setUpdateForm(blankForm)
  }

  const handleDelete = async todo => {
    //prevent form from refreshing screen
    event.preventDefault()
    //make delete request to our backend server
    const response = await fetch("http://localhost:3000/todos/" + todo.id, {
      method: "delete",
    })
    //update the list of todos be refetching the list
    await getTodos()
  }

  /////////////////////////
  // useEffects
  /////////////////////////
  //useEffect to initially grab todos when page loads
  React.useEffect(() => {
    getTodos()
  }, [])

  /////////////////////////
  //RETURN JSX
  /////////////////////////
  //In the JSX below we run the TodosLoaded function if there is at least one todo or render the contents of noTodos if there isn't any.
  return (
    <div>
      <h1>The Todo App</h1>
      <h1>Create a Todo</h1>
      <form onSubmit={handleCreate}>
        <input
          type="text"
          name="title"
          value={createForm.title}
          onChange={handleCreateChange}
        />
        <input
          type="text"
          name="body"
          value={createForm.body}
          onChange={handleCreateChange}
        />

        <input type="submit" value="Create Todo" />
      </form>
      <h1>Update a Todo</h1>
      <form onSubmit={handleUpdate}>
        <input
          type="text"
          name="title"
          value={updateForm.title}
          onChange={handleUpdateChange}
        />
        <input
          type="text"
          name="body"
          value={updateForm.body}
          onChange={handleUpdateChange}
        />

        <input type="submit" value="Update Todo" />
      </form>
      <h1>Todos</h1>
      {todos.length > 0 ? TodosLoaded() : noTodos}
    </div>
  )
}
```

---

## Vue Frontend

### Setup

- Make sure your todo list server is running

- Navigate to todo folder in terminal

- run command `npx merced-spinup vue todo_vue_frontend`

- cd into todo_vue_frontend folder and run `npm install`

- run npm run serve to start dev server on port 8080

## Displaying Todos

Our first step is to display todos so we need to make our api call. In a Vue file we export an object that'll contain all our data (state), methods, and lifecycle functions.

We need to create...

- Data property to hold our todos
- Method to fetch our todos
- call the getTodos method in beforeCreate to it fetches when page loads

So head over to src/App.vue and alter it like so...

```html
<template>
  <div></div>
</template>

<script>
  export default {
    //Name property names the component
    name: "App",
    // data property has a function that returns an object with app data
    data: function () {
      return {
        todos: [],
        baseUrl: "http://localhost:3000/todos",
      }
    },
    //methods is an object of functions
    methods: {
      getTodos: async function () {
        const response = await fetch(this.baseUrl)
        const data = await response.json()
        this.todos = data
      },
    },
    //create runs after components is initially created, one of many lifecycle functions
    created: function () {
      this.getTodos()
    },
  }
</script>
```

The screen will still be blank but if you download the Vue devtools chrome extension you should see the data component has the todos in its data. Now let's edit this components template to over the todos and display them.

```html
<template>
  <div>
    <h1>The Todo App</h1>
    <hr />
    <h3>Todos</h3>
    <hr />
    <ul>
      <li v-for="todo of todos" v-bind:key="todo.id">
        **********************
        <h4>{{todo.title}}</h4>
        <h5>{{todo.body}}</h5>
        **********************
      </li>
    </ul>
  </div>
</template>
```

### Creating some todos

So now that we can see our todos what we need is some more data properties to hold data from our, and method to run to create our todos. We will use the v-model directive to bind the properties to our form so they keep each other updated (Two way data binding).

```html
<template>
  <div>
    <h1>The Todo App</h1>
    <hr />
    <h1>Create a Todo</h1>
    <form v-on:submit.prevent="createTodo">
      <input type="text" v-model="createTitle" />
      <input type="text" v-model="createBody" />
      <input type="submit" />
    </form>
    <hr />
    <h3>Todos</h3>
    <hr />
    <ul>
      <li v-for="todo of todos" v-bind:key="todo.id">
        **********************
        <h4>{{todo.title}}</h4>
        <h5>{{todo.body}}</h5>
        **********************
      </li>
    </ul>
  </div>
</template>

<script>
  export default {
    //Name property names the component
    name: "App",
    // data property has a function that returns an object with app data
    data: function () {
      return {
        todos: [],
        baseUrl: "http://localhost:3000/todos",
        createTitle: "",
        createBody: "",
      }
    },
    //methods is an object of functions
    methods: {
      getTodos: async function () {
        const response = await fetch(this.baseUrl)
        const data = await response.json()
        this.todos = data
      },
      createTodo: async function () {
        await fetch(this.baseUrl, {
          method: "post",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: this.createTitle,
            body: this.createBody,
          }),
        })
        this.createTitle = ""
        this.createBody = ""
        this.getTodos()
      },
    },
    //create runs after components is initially created, one of many lifecycle functions
    created: function () {
      this.getTodos()
    },
  }
</script>
```

### Editing a Todo

Pretty much the same workflow except we'll need an additional method for when users click the edit button.

```html
<template>
  <div>
    <h1>The Todo App</h1>
    <hr />
    <h1>Create a Todo</h1>
    <form v-on:submit.prevent="createTodo">
      <input type="text" v-model="createTitle" />
      <input type="text" v-model="createBody" />
      <input type="submit" />
    </form>
    <hr />
    <h1>Edit a Todo</h1>
    <form v-on:submit.prevent="editTodo">
      <input type="text" v-model="editTitle" />
      <input type="text" v-model="editBody" />
      <input type="submit" />
    </form>
    <hr />
    <h3>Todos</h3>
    <hr />
    <ul>
      <li v-for="todo of todos" v-bind:key="todo.id">
        **********************
        <h4>{{todo.title}}</h4>
        <h5>{{todo.body}}</h5>
        **********************
        <button v-on:click="() => editSelect(todo)">Edit</button>
      </li>
    </ul>
  </div>
</template>

<script>
  export default {
    //Name property names the component
    name: "App",
    // data property has a function that returns an object with app data
    data: function () {
      return {
        todos: [],
        baseUrl: "http://localhost:3000/todos",
        createTitle: "",
        createBody: "",
        editTitle: "",
        editBody: "",
        editId: 0,
      }
    },
    //methods is an object of functions
    methods: {
      getTodos: async function () {
        const response = await fetch(this.baseUrl)
        const data = await response.json()
        this.todos = data
      },
      createTodo: async function () {
        await fetch(this.baseUrl, {
          method: "post",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: this.createTitle,
            body: this.createBody,
          }),
        })
        this.createTitle = ""
        this.createBody = ""
        this.getTodos()
      },
      editSelect: function (todo) {
        this.editTitle = todo.title
        this.editBody = todo.body
        this.editId = todo.id
      },
      editTodo: async function () {
        await fetch(this.baseUrl + "/" + this.editId, {
          method: "put",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: this.editTitle,
            body: this.editBody,
          }),
        })
        this.editTitle = ""
        this.editBody = ""
        this.editId = 0
        this.getTodos()
      },
    },
    //create runs after components is initially created, one of many lifecycle functions
    created: function () {
      this.getTodos()
    },
  }
</script>
```

### Deleting a Todo

For out final piece of functionality we need to be able to delete a todo. All this requires is for us to add a delete button that calls a deleteTodo method, wallah, we're done!

```html
<template>
  <div>
    <h1>The Todo App</h1>
    <hr />
    <h1>Create a Todo</h1>
    <form v-on:submit.prevent="createTodo">
      <input type="text" v-model="createTitle" />
      <input type="text" v-model="createBody" />
      <input type="submit" />
    </form>
    <hr />
    <h1>Edit a Todo</h1>
    <form v-on:submit.prevent="editTodo">
      <input type="text" v-model="editTitle" />
      <input type="text" v-model="editBody" />
      <input type="submit" />
    </form>
    <hr />
    <h3>Todos</h3>
    <hr />
    <ul>
      <li v-for="todo of todos" v-bind:key="todo.id">
        **********************
        <h4>{{todo.title}}</h4>
        <h5>{{todo.body}}</h5>
        **********************
        <button v-on:click="() => editSelect(todo)">Edit</button>
        <button v-on:click="() => deleteTodo(todo)">Delete</button>
      </li>
    </ul>
  </div>
</template>

<script>
  export default {
    //Name property names the component
    name: "App",
    // data property has a function that returns an object with app data
    data: function () {
      return {
        todos: [],
        baseUrl: "http://localhost:3000/todos",
        createTitle: "",
        createBody: "",
        editTitle: "",
        editBody: "",
        editId: 0,
      }
    },
    //methods is an object of functions
    methods: {
      getTodos: async function () {
        const response = await fetch(this.baseUrl)
        const data = await response.json()
        this.todos = data
      },
      createTodo: async function () {
        await fetch(this.baseUrl, {
          method: "post",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: this.createTitle,
            body: this.createBody,
          }),
        })
        this.createTitle = ""
        this.createBody = ""
        this.getTodos()
      },
      editSelect: function (todo) {
        this.editTitle = todo.title
        this.editBody = todo.body
        this.editId = todo.id
      },
      editTodo: async function () {
        await fetch(this.baseUrl + "/" + this.editId, {
          method: "put",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: this.editTitle,
            body: this.editBody,
          }),
        })
        this.editTitle = ""
        this.editBody = ""
        this.editId = 0
        this.getTodos()
      },
      deleteTodo: async function (todo) {
        await fetch(this.baseUrl + "/" + todo.id, {
          method: "delete",
        })
        this.getTodos()
      },
    },
    //create runs after components is initially created, one of many lifecycle functions
    created: function () {
      this.getTodos()
    },
  }
</script>
```

---

## Angular Frontend

### Setup

- Make sure todo API server is running and Navigate to todo folder in terminal

- Run the command `npx merced-spinup angular todo_angular_frontend`

- cd into todo_angular_frontend folder and run `npm install`

- run `npm start` to start up the dev server on port 4200

### Displaying Our Todos

There are two primary files we'll be working from...

src/app/app.component.html => this is where the template/html lives for our one and only component. Similar to the template tag in the Vue file.

src/app/app.component.ts => This is the Typescript/Javascript file where our coding logic and variables will live. Similar to the script tag in the Vue file.

So, first things first. We need...

- Define a variable to hold our todos

- Create a method that will fetch the todos

- Call that method with the component initializes using the OnInit method

**app.component.ts**

```ts
import { Component, OnInit } from "@angular/core"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent implements OnInit {
  todos: Array<any> = []
  baseUrl: string = "http://localhost:3000/todos"

  async getTodos() {
    const response = await fetch(this.baseUrl)
    const data = await response.json()
    this.todos = await data
  }

  ngOnInit() {
    this.getTodos()
  }
}
```

Now let's make those todos visible in the template.

**app.component.html**

```html
<h1>The Todo App</h1>

<h2>The Todos</h2>
<ul>
  <li *ngFor="let todo of todos">
    <h3>{{todo.title}}</h3>
    <h4>{{todo.body}}</h4>
  </li>
</ul>
```

### Creating Some Todos

First we need to add the Forms Module to our application, make sure your **src/app/app.module.ts** file looks like this. This is the file where different Angular features get loaded, this is referred as dependency injection. You inject what you need and not what you don't.

```ts
import { BrowserModule } from "@angular/platform-browser"
import { NgModule } from "@angular/core"
import { FormsModule } from "@angular/forms"

import { AppRoutingModule } from "./app-routing.module"
import { AppComponent } from "./app.component"
import { HeaderComponent } from "./header/header.component"
import { FooterComponent } from "./footer/footer.component"
import { MainComponent } from "./main/main.component"

@NgModule({
  declarations: [AppComponent, HeaderComponent, FooterComponent, MainComponent],
  imports: [BrowserModule, AppRoutingModule, FormsModule],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
```

This module will unlock the ability to use the ngModel directive to implement two-way finding on our form inputs like the v-model directive did in Vue.

**app.component.ts**

```ts
import { Component, OnInit } from "@angular/core"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent implements OnInit {
  todos: Array<any> = []

  baseUrl: string = "http://localhost:3000/todos"

  //Properties to Bind with Create Form
  createTitle: string = ""
  createBody: string = ""

  //Function to Grab list of todos
  async getTodos() {
    const response = await fetch(this.baseUrl)
    const data = await response.json()
    this.todos = await data
  }

  //takes data from form and creates new todo
  async createTodo() {
    console.log(this.createTitle, this.createBody)
    await fetch(this.baseUrl, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: this.createTitle,
        body: this.createBody,
      }),
    })
    //update todo list and reset form
    this.getTodos()
    this.createTitle = ""
    this.createBody = ""
  }

  //this function runs when the component loads
  ngOnInit() {
    this.getTodos()
  }
}
```

**app.component.html**

```html
<h1>The Todo App</h1>

<h2>Create a Todo</h2>
<form (submit)="createTodo()">
  <input type="text" [(ngModel)]="createTitle" name="title" #ctrl="ngModel" />
  <input type="text" [(ngModel)]="createBody" name="body" #ctrl="ngModel" />
  <input type="submit" value="create Todo" />
</form>

<h2>The Todos</h2>
<ul>
  <li *ngFor="let todo of todos">
    <h3>{{todo.title}}</h3>
    <h4>{{todo.body}}</h4>
  </li>
</ul>
```

### Let's update todos

So here we need create another form with the same workflow as creating a todo, except we need a function for when an edit button is clicked on.

**app.component.ts**

```ts
import { Component, OnInit } from "@angular/core"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent implements OnInit {
  todos: Array<any> = []

  baseUrl: string = "http://localhost:3000/todos"

  //Properties to Bind with Create Form
  createTitle: string = ""
  createBody: string = ""

  //Properties to Bind with Create Form
  editTitle: string = ""
  editBody: string = ""
  editId: number = 0

  //Function to Grab list of todos
  async getTodos() {
    const response = await fetch(this.baseUrl)
    const data = await response.json()
    this.todos = await data
  }

  //takes data from form and creates new todo
  async createTodo() {
    await fetch(this.baseUrl, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: this.createTitle,
        body: this.createBody,
      }),
    })
    //update todo list and reset form
    this.getTodos()
    this.createTitle = ""
    this.createBody = ""
  }

  editSelect(todo) {
    this.editId = todo.id
    this.editTitle = todo.title
    this.editBody = todo.body
  }

  //takes data from form and updates new todo
  async updateTodo() {
    await fetch(this.baseUrl + "/" + this.editId, {
      method: "put",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: this.editTitle,
        body: this.editBody,
      }),
    })
    //update todo list and reset form
    this.getTodos()
    this.editTitle = ""
    this.editBody = ""
    this.editId = 0
  }

  //this function runs when the component loads
  ngOnInit() {
    this.getTodos()
  }
}
```

**app.component.html**

```html
<h1>The Todo App</h1>
<hr />
<h2>Create a Todo</h2>
<form (submit)="createTodo()">
  <input type="text" [(ngModel)]="createTitle" name="title" #ctrl="ngModel" />
  <input type="text" [(ngModel)]="createBody" name="body" #ctrl="ngModel" />
  <input type="submit" value="create Todo" />
</form>
<hr />
<h2>Edit a Todo</h2>
<form (submit)="updateTodo()">
  <input type="text" [(ngModel)]="editTitle" name="title" #ctrl="ngModel" />
  <input type="text" [(ngModel)]="editBody" name="body" #ctrl="ngModel" />
  <input type="submit" value="Edit Todo" />
</form>
<hr />
<h2>The Todos</h2>
<ul>
  <li *ngFor="let todo of todos">
    <h3>{{ todo.title }}</h3>
    <h4>{{ todo.body }}</h4>
    <button (click)="editSelect(todo)">Edit</button>
  </li>
</ul>
```

### Delete a Todo

We just need to a add a delete method, then attach that method to a delete button and ta-da! We are done!

**app.component.ts**

```ts
import { Component, OnInit } from "@angular/core"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent implements OnInit {
  todos: Array<any> = []

  baseUrl: string = "http://localhost:3000/todos"

  //Properties to Bind with Create Form
  createTitle: string = ""
  createBody: string = ""

  //Properties to Bind with Create Form
  editTitle: string = ""
  editBody: string = ""
  editId: number = 0

  //Function to Grab list of todos
  async getTodos() {
    const response = await fetch(this.baseUrl)
    const data = await response.json()
    this.todos = await data
  }

  //takes data from form and creates new todo
  async createTodo() {
    await fetch(this.baseUrl, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: this.createTitle,
        body: this.createBody,
      }),
    })
    //update todo list and reset form
    this.getTodos()
    this.createTitle = ""
    this.createBody = ""
  }

  editSelect(todo) {
    this.editId = todo.id
    this.editTitle = todo.title
    this.editBody = todo.body
  }

  //takes data from form and updates new todo
  async updateTodo() {
    await fetch(this.baseUrl + "/" + this.editId, {
      method: "put",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: this.editTitle,
        body: this.editBody,
      }),
    })
    //update todo list and reset form
    this.getTodos()
    this.editTitle = ""
    this.editBody = ""
    this.editId = 0
  }

  async deleteTodo(todo) {
    await fetch(this.baseUrl + "/" + todo.id, {
      method: "delete",
    })
    //update list of todos
    this.getTodos()
  }

  //this function runs when the component loads
  ngOnInit() {
    this.getTodos()
  }
}
```

**app.component.html**

```html
<h1>The Todo App</h1>
<hr />
<h2>Create a Todo</h2>
<form (submit)="createTodo()">
  <input type="text" [(ngModel)]="createTitle" name="title" #ctrl="ngModel" />
  <input type="text" [(ngModel)]="createBody" name="body" #ctrl="ngModel" />
  <input type="submit" value="create Todo" />
</form>
<hr />
<h2>Edit a Todo</h2>
<form (submit)="updateTodo()">
  <input type="text" [(ngModel)]="editTitle" name="title" #ctrl="ngModel" />
  <input type="text" [(ngModel)]="editBody" name="body" #ctrl="ngModel" />
  <input type="submit" value="Edit Todo" />
</form>
<hr />
<h2>The Todos</h2>
<ul>
  <li *ngFor="let todo of todos">
    <h3>{{ todo.title }}</h3>
    <h4>{{ todo.body }}</h4>
    <button (click)="editSelect(todo)">Edit</button>
    <button (click)="deleteTodo(todo)">Delete</button>
  </li>
</ul>
```

---

## Svelte Frontend

### Setup

- Make sure todo api server is running and navigate terminal to todo folder

- run the command `npx merced-spinup svelte todo_svelte_frontend`

- cd into todo_svelte_frontend folder and run `npm install`

- run `npm run dev` to start the dev server on port 5000

### Displaying Our Todos

Svelte is very similar to Vue that everything for one component is in one file. So we'll be working entirely with one component like we've done in the previous runs which will be src/App.svelte.

Just like before we need methods to pull the data and the template to render them like so...

```html
<script>
  import { onMount } from "svelte"

  //Variable to hold todos
  let todos = []

  //base URL
  const baseURL = "http://localhost:3000/todos"

  //Method to pull data
  const getTodos = async () => {
    const response = await fetch(baseURL)
    const data = await response.json()
    todos = await data
  }

  onMount(() => {
    getTodos()
  })
</script>

<main>
  <h1>The Todo App</h1>
  {#each todos as todo}
  <div>
    <h2>{todo.title}</h2>
    <h3>{todo.body}</h3>
  </div>
  {/each}
</main>

<style></style>
```

### Creating a todo

Once again, the same logic as usual

- create a form
- bind the form to values
- function that runs on form submission that makes the post request

**App.svelte**

```html
<script>
  import { onMount } from "svelte"

  //Variable to hold todos
  let todos = []

  //base URL
  const baseURL = "http://localhost:3000/todos"

  //Method to pull data
  const getTodos = async () => {
    const response = await fetch(baseURL)
    const data = await response.json()
    todos = await data
  }

  //Runs when component loads
  onMount(() => {
    getTodos()
  })

  //properties for create form
  let createTitle
  let createBody

  //create function for form submission
  const createTodo = async event => {
    event.preventDefault()
    await fetch(baseURL, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: createTitle,
        body: createBody,
      }),
    })

    //refetch todos
    getTodos()

    //reset form
    createTitle = ""
    createBody = ""
  }
</script>

<main>
  <h1>The Todo App</h1>
  <hr />
  <h2>Create a Todo</h2>
  <form on:submit="{createTodo}">
    <input type="text" bind:value="{createTitle}" />
    <input type="text" bind:value="{createBody}" />
    <input type="submit" value="Create Todo" />
  </form>
  <hr />
  <h2>The Todos</h2>
  {#each todos as todo}
  <div>
    <h2>{todo.title}</h2>
    <h3>{todo.body}</h3>
  </div>
  {/each}
</main>

<style></style>
```

### Update a Todo

- add properties for edit form
- add edit form
- add method to select item to edit
- bind method to edit button

```html

<script>
	import {onMount} from 'svelte'

	//Variable to hold todos
	let todos = []

	//base URL
	const baseURL = "http://localhost:3000/todos"

	//Method to pull data
	const getTodos = async () => {
		const response = await fetch(baseURL)
		const data = await response.json()
		todos = await data
	}

	//Runs when component loads
	onMount(()=>{
		getTodos()
	})

	//properties for create form
	let createTitle;
	let createBody;

	//create function for form submission
	const createTodo = async (event) => {
		event.preventDefault()
		await fetch(baseURL, {
			method: "post",
			headers: {
				"Content-Type":"application/json"
			},
			body: JSON.stringify({
				title: createTitle,
				body: createBody
			})
		})

		//refetch todos
		getTodos()

		//reset form
		createTitle = ""
		createBody = ""
	}

	//properties for edit form
	let editTitle;
	let editBody;
	let editId

	//create function for form submission
	const updateTodo = async (event) => {
		event.preventDefault()
		await fetch(baseURL + "/" + editId, {
			method: "put",
			headers: {
				"Content-Type":"application/json"
			},
			body: JSON.stringify({
				title: editTitle,
				body: editBody
			})
		})

		//refetch todos
		getTodos()

		//reset form
		editTitle = ""
		editBody = ""
		editId = 0
	}

	const editSelect = (todo) => {
		editTitle = todo.title
		editBody = todo.body
		editId = todo.id
	}



</script>




<main>

<h1>The Todo App</h1>
<hr>
<h2>Create a Todo</h2>
	<form on:submit={createTodo}>
		<input type="text" bind:value={createTitle}/>
		<input type="text" bind:value={createBody}/>
		<input type="submit" value="Create Todo"/>
	</form>
<hr>
<h2>Edit a Todo</h2>
	<form on:submit={updateTodo}>
		<input type="text" bind:value={editTitle}/>
		<input type="text" bind:value={editBody}/>
		<input type="submit" value="Update Todo"/>
	</form>
<hr>
<h2>The Todos</h2>
{#each todos as todo}
	<div>
		<h2>{todo.title}</h2>
		<h3>{todo.body}</h3>
		<button on:click={(e) => editSelect(todo)}>Edit</button>
	</div>
{/each}

</main>




<style>
</style>

```

### Delete a Todo

Now we just need to make a delete method and connect it to a delete button with an inline function and we're done!

```html

<script>
	import {onMount} from 'svelte'

	//Variable to hold todos
	let todos = []

	//base URL
	const baseURL = "http://localhost:3000/todos"

	//Method to pull data
	const getTodos = async () => {
		const response = await fetch(baseURL)
		const data = await response.json()
		todos = await data
	}

	//Runs when component loads
	onMount(()=>{
		getTodos()
	})

	//properties for create form
	let createTitle;
	let createBody;

	//create function for form submission
	const createTodo = async (event) => {
		event.preventDefault()
		await fetch(baseURL, {
			method: "post",
			headers: {
				"Content-Type":"application/json"
			},
			body: JSON.stringify({
				title: createTitle,
				body: createBody
			})
		})

		//refetch todos
		getTodos()

		//reset form
		createTitle = ""
		createBody = ""
	}

	//properties for edit form
	let editTitle;
	let editBody;
	let editId

	//create function for form submission
	const updateTodo = async (event) => {
		event.preventDefault()
		await fetch(baseURL + "/" + editId, {
			method: "put",
			headers: {
				"Content-Type":"application/json"
			},
			body: JSON.stringify({
				title: editTitle,
				body: editBody
			})
		})

		//refetch todos
		getTodos()

		//reset form
		editTitle = ""
		editBody = ""
		editId = 0
	}

	const editSelect = (todo) => {
		editTitle = todo.title
		editBody = todo.body
		editId = todo.id
	}

		const deleteTodo = async (todo) => {
		event.preventDefault()
		await fetch(baseURL + "/" + todo.id, {
			method: "delete",
		})

		//refetch todos
		getTodos()
	}



</script>




<main>

<h1>The Todo App</h1>
<hr>
<h2>Create a Todo</h2>
	<form on:submit={createTodo}>
		<input type="text" bind:value={createTitle}/>
		<input type="text" bind:value={createBody}/>
		<input type="submit" value="Create Todo"/>
	</form>
<hr>
<h2>Edit a Todo</h2>
	<form on:submit={updateTodo}>
		<input type="text" bind:value={editTitle}/>
		<input type="text" bind:value={editBody}/>
		<input type="submit" value="Update Todo"/>
	</form>
<hr>
<h2>The Todos</h2>
{#each todos as todo}
	<div>
		<h2>{todo.title}</h2>
		<h3>{todo.body}</h3>
		<button on:click={(e) => editSelect(todo)}>Edit</button>
		<button on:click={(e) => deleteTodo(todo)}>Delete</button>
	</div>
{/each}

</main>




<style>
</style>

```

---

## jQuery Frontend

So let's do something a little different, how about jQuery using webpack!

### Setup

- Make sure your todo api is running and navigate to your todo folder in terminal

- run the command `npx merced-spinup jquerywebpack todo_jquery_frontend`

- cd into todo_jquery_frontend folder and run `npm install`

- `npm run dev` to start dev server

### Displaying Todos

- create a function to pull todos from api

- create a function to take those todos and render lis

- call that latter function

**src/index.js**

```js
import $ from "jquery"
import _ from "lodash"

//Adding the initial HTML to the body
$("body").append(`
<h1>The Todo App</h1>
<hr>
<h2>The Todos</h2>
<ul id="todolist">

</ul>
`)

//The UL for the Todo List
const $todoList = $("#todolist")

const baseURL = "http://localhost:3000/todos"

//function to get todos
const fetchTodos = async () => {
  const response = await fetch(baseURL)
  const data = await response.json()
  //return promise of data
  return data
}

//render todos to DOM
const renderTodos = async () => {
  const todos = await fetchTodos()

  todos.forEach(todo => {
    const $li = $("<li>")

    $li.html(`
        <h3>${todo.title}</h3>
        <h4>${todo.body}</h4>
        `)

    $todoList.append($li)
  })
}

// Initial Fetch of Todos
renderTodos()
```

### Creating a Todo

- Create a Form and Variables to hold form and inputs
- Create a Function for when the form is submitted

```js
import $ from "jquery";
import _ from "lodash";

//Adding the initial HTML to the body
$("body").append(`
<h1>The Todo App</h1>
<hr>
<h2>Create a Todo</h2>
<form id="createForm">
<input type="text" name="createTitle"/>
<input type="text" name="createBody"/>
<input type="submit" value="Create Todo">
</form>
<hr>
<h2>The Todos</h2>
<ul id="todolist">

</ul>
`);

//The UL for the Todo List
const $todoList = $("#todolist");

//Create Form Variables
const $createForm = $("#createForm");
const $createTitle = $('input[name="createTitle');
const $createBody = $('input[name="createBody');
const baseURL = "http://localhost:3000/todos";

//function to get todos
const fetchTodos = async () => {
  const response = await fetch(baseURL);
  const data = await response.json();
  //return promise of data
  return data;
};

//render todos to DOM
const renderTodos = async () => {
  const todos = await fetchTodos();
  $todoList.empty();

  todos.forEach((todo) => {
    const $li = $("<li>");

    $li.html(`
        <h3>${todo.title}</h3>
        <h4>${todo.body}</h4>
        `);

    $todoList.append($li);
  });
};

//Function to Create a to do
const createTodo = async (event) => {
  event.preventDefault();
  await fetch(baseURL, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: $createTitle.val(),
      body: $createBody.val(),
    }),
  });
  renderTodos();
  $createTitle.val("");
  $createBody.val("");
};

//Add Event Listener to Form
$createForm.on("submit", createTodo);

// Initial Fetch of Todos
renderTodos();
```

### Update a Todo

- add an edit button
- add an edit form
- create variables for form and input
- create function to set variables for selected todo
- create function to make post request when form submitted.

```js

import $ from "jquery";
import _ from "lodash";

//Adding the initial HTML to the body
$("body").append(`
<h1>The Todo App</h1>
<hr>
<h2>Create a Todo</h2>
<form id="createForm">
<input type="text" name="createTitle"/>
<input type="text" name="createBody"/>
<input type="submit" value="Create Todo">
</form>
<hr>
<form id="editForm">
<input type="text" name="editTitle"/>
<input type="text" name="editBody"/>
<input type="submit" value="Update Todo">
</form>
<hr>
<h2>The Todos</h2>
<ul id="todolist">

</ul>
`);

//The UL for the Todo List
const $todoList = $("#todolist");

//Create Form Variables
const $createForm = $("#createForm");
const $createTitle = $('input[name="createTitle"]');
const $createBody = $('input[name="createBody"]');

//Create Form Variables
const $editForm = $("#editForm");
const $editTitle = $('input[name="editTitle"]');
const $editBody = $('input[name="editBody"]');
let editId = 0

//API URL
const baseURL = "http://localhost:3000/todos";

//function to get todos
const fetchTodos = async () => {
  const response = await fetch(baseURL);
  const data = await response.json();
  //return promise of data
  return data;
};

//render todos to DOM
const renderTodos = async () => {
  const todos = await fetchTodos();
  $todoList.empty();

  todos.forEach((todo) => {
    const $li = $("<li>");

    $li.html(`
        <h3>${todo.title}</h3>
        <h4>${todo.body}</h4>
        <button id="${todo.id}editbutton">Edit</button>
        `);

    $todoList.append($li);

    $(`#${todo.id}editbutton`).on('click', () => {
        $editTitle.val(todo.title)
        $editBody.val(todo.body)
        editId = todo.id
    })
  });
};

//Function to Create a to do
const createTodo = async (event) => {
  event.preventDefault();
  await fetch(baseURL, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: $createTitle.val(),
      body: $createBody.val(),
    }),
  });
  renderTodos();
  $createTitle.val("");
  $createBody.val("");
};

//Function to update a to do
const updateTodo = async (event) => {
    event.preventDefault();
    await fetch(baseURL + "/" + editId, {
      method: "put",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: $editTitle.val(),
        body: $editBody.val(),
      }),
    });
    renderTodos();
    $editTitle.val("");
    $editBody.val("");
  };

//Add Event Listener to Form
$createForm.on("submit", createTodo);

//Add Event Listener to Form
$editForm.on("submit", updateTodo);

// Initial Fetch of Todos
renderTodos();11

```

### Delete Todos

Finally... our last function in our last build. We just need to create a delete button that triggers a delete function and we're done! We'll define the function when we add the listener in the renderTodos function so the todo is in scope.

```js
import $ from "jquery";
import _ from "lodash";

//Adding the initial HTML to the body
$("body").append(`
<h1>The Todo App</h1>
<hr>
<h2>Create a Todo</h2>
<form id="createForm">
<input type="text" name="createTitle"/>
<input type="text" name="createBody"/>
<input type="submit" value="Create Todo">
</form>
<hr>
<form id="editForm">
<input type="text" name="editTitle"/>
<input type="text" name="editBody"/>
<input type="submit" value="Update Todo">
</form>
<hr>
<h2>The Todos</h2>
<ul id="todolist">

</ul>
`);

//The UL for the Todo List
const $todoList = $("#todolist");

//Create Form Variables
const $createForm = $("#createForm");
const $createTitle = $('input[name="createTitle"]');
const $createBody = $('input[name="createBody"]');

//Create Form Variables
const $editForm = $("#editForm");
const $editTitle = $('input[name="editTitle"]');
const $editBody = $('input[name="editBody"]');
let editId = 0

//API URL
const baseURL = "http://localhost:3000/todos";

//function to get todos
const fetchTodos = async () => {
  const response = await fetch(baseURL);
  const data = await response.json();
  //return promise of data
  return data;
};

//render todos to DOM
const renderTodos = async () => {
  const todos = await fetchTodos();
  $todoList.empty();

  todos.forEach((todo) => {
    const $li = $("<li>");

    $li.html(`
        <h3>${todo.title}</h3>
        <h4>${todo.body}</h4>
        <button id="${todo.id}editbutton">Edit</button>
        <button id="${todo.id}deletebutton">Delete</button>
        `);

    $todoList.append($li);

    //add function to edit button
    $(`#${todo.id}editbutton`).on('click', () => {
        $editTitle.val(todo.title)
        $editBody.val(todo.body)
        editId = todo.id
    })

    //add function to delete button
    $(`#${todo.id}deletebutton`).on('click', async () => {
        await fetch(baseURL + "/" + todo.id, {
            method: "delete"
        })
        renderTodos()
    })
  });
};

//Function to Create a to do
const createTodo = async (event) => {
  event.preventDefault();
  await fetch(baseURL, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: $createTitle.val(),
      body: $createBody.val(),
    }),
  });
  renderTodos();
  $createTitle.val("");
  $createBody.val("");
};

//Function to update a to do
const updateTodo = async (event) => {
    event.preventDefault();
    await fetch(baseURL + "/" + editId, {
      method: "put",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: $editTitle.val(),
        body: $editBody.val(),
      }),
    });
    renderTodos();
    $editTitle.val("");
    $editBody.val("");
  };

//Add Event Listener to Form
$createForm.on("submit", createTodo);

//Add Event Listener to Form
$editForm.on("submit", updateTodo);

// Initial Fetch of Todos
renderTodos();
```

## Congrats

You've just taken a single api and built 5 seperate frontend applications! Hopefully this gives you a deeper appreciation for the different way to build out your frontend applications and the modularity of APIs.

---
