---
title: Creating a GraphQL Based Habit Tracker with Hasura and React (GraphQL/Hasura 101)
date: "2021-11-16T12:12:03.284Z"
description: GraphQL Made Easy
---

## What is GraphQL?

[My GraphQL Article for Further Reading](https://tuts.alexmercedcoder.dev/2020/graphql/)

GraphQL is an alternative to Rest API created by Facebook:

- Rest API require you to make request to many URLs while all GraphQL queries are actually post requests to a single url

- Rest API by default require manually writing documentation unless you configure a tool like Swagger, GraphQL API are self-documenting by default

- RestAPI typically give large amounts of information whether you need it or not, while GraphQL allows you to specify which data you need.

Although, the downside of creating GraphQL API is having define Types and Resolvers...

#### Types

Exactly like in typescript or database schemas, typing means defining what datatypes the properties of your data consist of. This can mean typing everything a third time (assuming your database require a definition of schema and your using typescript or a typed langauge to write your API).

#### Mutations and Queries

Instead of different endpoints that trigger different route handlers, GraphQL has several pre-defined queries (get information) and mutations (create, update, delete information) in the APIs type definitions. Each query and mutation needs a corresponding function referred to as a resolver.

Bottom line, manually building out GraphQL API can result in extra boilerplate in coding all the types and resolvers needed. The benefit is the self-documenting, but still tedious.

Although, what if I said you could have it all.

## Hasura

Now there are several ways to get a GraphQL api pre-made for you like using a Headless CMS like GraphCMS but one platform offers a high level of flexibility and some pretty cool unique features, and that is Hasura.

- Auto generated GraphQL api based on your existing databse schemas
- ability to create custom queries and mutations
- ability to create events and web hooks to automate tasks
- hosted and self-hosted options
- REST API available too if you prefer

## Building our Habit Tracker API

1. Head over to Hasura.io and create a new account and create a new project

1. Once the project is created launch the console

1. We need to attach a database to our project (under data), we can do so easily for free using our heroku account (get one if you don't have one).

1. Once the database is connected click on manage the database then click on create table.

- table name: habits

| property | type                     | -------     |
| -------- | ------------------------ | ----------- |
| id       | integer (auto increment) | primary key |
| habit    | text                     |             |
| count    | integer                  | default: 0  |

1. Once the table has been added head over to the API tab where you will see GraphiQL a tool for testing GraphQL APIs (think postman).

- On the far right is the documentation explorer to read the documentation that has been created for your api
- On the far left you can see a listing of the queries that have been created

I recommend spend like 30 minutes trying to see if you can figure out how to add, retrieve, update and delete data using graphQL syntax and using the API documentation. I'll summarize below when your done.

#### Retrieving all Habits

[Read Here for More on Mutation and Query Syntax](https://graphql.org/learn/queries/)

This query will get us all the Habits

```js
{
  habits {
    id
    habit
    count
  }
}
```

#### Creating a Habit

This mutation adds a habit and then gets the list of habits in return

```js
mutation {
  insert_habits(objects: {
    habit: "Exercise",
    count: 3
  }){
    affected_rows
    returning {
      id
      habit
      count
    }
  }
}
```

#### Updating a Habit

This is a mutation that will update a Habit with the proper id

```js
mutation {
  update_habits_by_pk(pk_columns:{id: 3} _set: {count: 4}){
    id
    habit
    count
  }
}
```

#### Deleting a Habit

This mutation deletes a habit with the proper id

```js
mutation {
delete_habits_by_pk(id:3){
  id
  habit
  count
  }
}
```

So our API is essentially deployed and tested! That was super easy!

## Making GraphQL calls from the frontend

You have a few primary options for how to make GraphQL calls from your frontend javascript.

#### Using Fetch or Axios

You can use the tried and true fetch or axios to make the call the you'd normally make. Just keep in mind you'll need your Hasura admin secret to make the request. While we can hide this from github with a .env a knowledgable dev can still use dev tools to get your secret. So for production apps you want to make sure to adjust the CORS environmental variable on your hasura project so ONLY the url of your frontend can make requests to your API.

**FETCH**

```js
fetch('https://your-app-name-here.hasura.app/v1/graphql', {
  method: 'POST',
  headers: {
      'Content-Type': 'application/json',
      "x-hasura-admin-secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   },
  body: JSON.stringify({ query: '{
  habits {
    id
    habit
    count
  }
}' }),
})
  .then(res => res.json())
  .then(res => console.log(res));
```

**Axios**

```js
axios({
  url: "https://your-app-name-here.hasura.app/v1/graphql"
  method: 'POST',
  headers: {
      'Content-Type': 'application/json',
      "x-hasura-admin-secret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
   },
  data: JSON.stringify({ query: '{
  habits {
    id
    habit
    count
  }
}' }),
})
  .then(res => console.log(res.data));
```

If making a mutation, the string would just be the mutation instead. Remember, mutations do require the word mutation in the string like the examples we did in GraphiQL.

#### Apollo Client

To configure Apollo client for a React Project

```
npm install @apollo/client graphql
```

create a .env file with your url and hasura secret

```
REACT_APP_HASURA_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REACT_APP_HASURA_URL=https://xxxxxxxxxxxx.hasura.app/v1/graphql
```

This inside your index.js (assuming your using create-react-app):

```js
import React from "react"
import ReactDOM from "react-dom"
import "./index.css"
import App from "./App"
import reportWebVitals from "./reportWebVitals"
import { ApolloClient, InMemoryCache, ApolloProvider } from "@apollo/client"

// New Apollo Client with Settings
const client = new ApolloClient({
  // URL to the GRAPHQL Endpoint
  uri: process.env.REACT_APP_HASURA_URL,
  // cache strategy, in this case, store in memory
  cache: new InMemoryCache(),
  // any custom headers that should go out with each request
  headers: {
    "x-hasura-admin-secret": process.env.REACT_APP_HASURA_SECRET,
  },
})

ReactDOM.render(
  <ApolloProvider client={client}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ApolloProvider>,
  document.getElementById("root")
)

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals()
```

Now you can use the `useQuery` and `useMutation` hooks where needed!

```js
import { useQuery, useMutation, gql } from "@apollo/client"

function App() {
  // GraphQL Query String
  const QUERY_STRING = gql`
    {
      habits {
        id
        habit
        count
      }
    }
  `

  // run query using the useQuery Hook
  // refetch is a function to repeat the request when needed
  const { data, loading, refetch, error } = useQuery(QUERY_STRING)

  // return value if the request errors
  if (error) {
    return <h1>There is an Error</h1>
  }

  // return value if the request is pending
  if (loading) {
    return <h1>The Data is Loading</h1>
  }

  // return value if the request is completed
  if (data) {
    return (
      <div>
        {data.habits.map(h => (
          <h1 key={h.id}>
            {h.habit} {h.count}
          </h1>
        ))}
      </div>
    )
  }
}

export default App
```

#### make-graphql-query

`make-graphql-query` is a small lightweight library I made for making graphQL queries easy and simple in a framework agnostic way. It's just a tiny abstraction to eliminate a lot of boilerplate in using fetch/axios. Here is how you would use it in React.

- install `npm install make-graphql-query`

create a .env file with your url and hasura secret

```
REACT_APP_HASURA_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REACT_APP_HASURA_URL=https://xxxxxxxxxxxx.hasura.app/v1/graphql
```

- create a gqlFunc.js file in /src, this file exports a function that knows your graphql URL and automatically has any neccessary headers.

```js
import makeGraphQLQuery from "make-graphql-query"

export default makeGraphQLQuery({
  url: process.env.REACT_APP_HASURA_URL,
  headers: {
    "x-hasura-admin-secret": process.env.REACT_APP_HASURA_SECRET,
  },
})
```

Then we can just import it and use it as needed!

```js
import graphQLQuery from "./gqlFunc"
import { useState, useEffect } from "react"

function App() {
  // state to hold query results
  const [query, setQuery] = useState(null)

  // useState to fetch data on load
  useEffect(() => {
    //making graphql query
    graphQLQuery({
      query: `{
      habits {
        id
        habit
        count
      }
    }`,
    }).then(response => setQuery(response))
  }, [])

  // pre-query completion jsx
  if (!query) {
    return <h1>Loading</h1>
  }

  // post-query completion jsx
  return (
    <div>
      {query.habits.map(h => (
        <h2 key={h.id}>
          {h.habit} - {h.count}
        </h2>
      ))}
    </div>
  )
}

export default App
```

## Adding Habits

Let's modify our Apollo and MGQ versions of our component to also create a new habit. GraphQL queries can take variables if declared, below is an example of the create mutation with variables.

[Read Here for More on Mutation and Query Syntax](https://graphql.org/learn/queries/)

```js
mutation add_habit ($objects: [habits_insert_input!]!){
      insert_habits(objects: $objects){
        affected_rows
      }
    }
```

- Note the type of the variable must be an exact match as to where you use it, use GraphiQL to determine the necessary types when making your own queries.

#### Apollo Client Updated Code

App.js

```js
import { useQuery, useMutation, gql } from "@apollo/client"
import { useState } from "react"

function App() {
  // GraphQL Query String
  const QUERY_STRING = gql`
    {
      habits {
        id
        habit
        count
      }
    }
  `

  const MUTATION_STRING = gql`
    mutation add_habit($objects: [habits_insert_input!]!) {
      insert_habits(objects: $objects) {
        affected_rows
      }
    }
  `

  // run query using the useQuery Hook
  // refetch is a function to repeat the request when needed
  const { data, loading, refetch, error } = useQuery(QUERY_STRING)

  // create function to run mutation
  const [add_habit, response] = useMutation(MUTATION_STRING)

  // state to hold form data
  const [form, setForm] = useState({ habit: "", count: 0 })

  // handleChange function for form
  const handleChange = event =>
    setForm({ ...form, [event.target.name]: event.target.value })

  // handleSubmit function for when form is submitted
  const handleSubmit = async event => {
    // prevent refresh
    event.preventDefault()
    // add habit, pass in variables
    await add_habit({ variables: { objects: [form] } })
    // refetch query to get new data
    refetch()
  }

  // check if mutation failed
  if (response.error) {
    ;<h1>Failed to Add Habit</h1>
  }

  // return value if the request errors
  if (error) {
    return <h1>There is an Error</h1>
  }

  // return value if the request is pending
  if (loading) {
    return <h1>The Data is Loading</h1>
  }

  // return value if the request is completed
  if (data) {
    return (
      <div>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="habit"
            value={form.habit}
            onChange={handleChange}
          />
          <input
            type="number"
            name="count"
            value={form.count}
            onChange={handleChange}
          />
          <input type="submit" value="track habit" />
        </form>
        {data.habits.map(h => (
          <h1 key={h.id}>
            {h.habit} {h.count}
          </h1>
        ))}
      </div>
    )
  }
}

export default App
```

#### MGQ Updated Code

App.js

```js
import graphQLQuery from "./gqlFunc"
import { useState, useEffect } from "react"

function App() {
  // state to hold query results
  const [query, setQuery] = useState(null)

  // state to hold form data
  const [form, setForm] = useState({ habit: "", count: 0 })

  // function to get habits
  const getHabits = async () => {
    //making graphql query
    const response = await graphQLQuery({
      query: `{
      habits {
        id
        habit
        count
      }
    }`,
    })
    // assigning response to state
    setQuery(response)
  }

  // function to add a habit
  const addHabit = async variables => {
    //define the query
    const q = `mutation add_habit ($objects: [habits_insert_input!]!){
      insert_habits(objects: $objects){
        affected_rows
      }
    }`

    // run query with variables
    await graphQLQuery({ query: q, variables })

    // get updated list of habits
    getHabits()
  }

  // useState to fetch data on load
  useEffect(() => {
    getHabits()
  }, [])

  // handleChange function for form
  const handleChange = event =>
    setForm({ ...form, [event.target.name]: event.target.value })

  // handleSubmit function for when form is submitted
  const handleSubmit = event => {
    // prevent refresh
    event.preventDefault()
    // add habit, pass in variables
    addHabit({ objects: [form] })
  }

  // pre-query completion jsx
  if (!query) {
    return <h1>Loading</h1>
  }

  // post-query completion jsx
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="habit"
          value={form.habit}
          onChange={handleChange}
        />
        <input
          type="number"
          name="count"
          value={form.count}
          onChange={handleChange}
        />
        <input type="submit" value="track habit" />
      </form>
      {query.habits.map(h => (
        <h2 key={h.id}>
          {h.habit} - {h.count}
        </h2>
      ))}
    </div>
  )
}

export default App
```

## Conclusion

Hopefully this gives you some more insight into how to use GraphQL and how easy it can be to spin up a GraphQL API using Hasura.
