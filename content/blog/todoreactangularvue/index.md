---
title: 1 Backend, 3 Frontends - Todo List with Rails, React, Angular, Vue, Svelte, and jQuery
date: "2020-11-16T22:12:03.284Z"
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

**COMING SOON**

---

## Angular Frontend

**COMING SOON**

---

## Svelte Frontend

**COMING SOON**

---

## jQuery Frontend

**COMING SOON**

---
