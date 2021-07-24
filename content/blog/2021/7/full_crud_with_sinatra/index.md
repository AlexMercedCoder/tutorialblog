---
title: Basics of Building a CRUD API with Ruby Sinatra
date: "2021-07-24T12:12:03.284Z"
description: Learning REST conventions with Ruby Sinatra
---

Ruby Sinatra is probably the second most popular web framework in the Ruby ecosystem, second to the behemoth of Ruby on Rails. Ruby is a more minimalist framework like Javascripts, Express or Pythons, Flask.

Before this tutorial make sure to have Ruby installed.

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

## API in Sinatra

- create a new folder and navigate your terminal to it
- inside the folder create a file called `server.rb`
- install sinatra `gem install sinatra`

### Our Model

What we will do is instead of using a database we will just use an array of hashes. So let's create an initial data set representing blog posts.

`server.rb`

```ruby
require 'sinatra'

## Model/Dataset

posts = [{title: "First Post", body: "content of first post"}]
```

### The Index Route

The Index Route displays all items of the model. So this route should return all posts when a get request is sent to "/posts".

`server.rb`

```ruby
require 'sinatra'

## Model/Dataset

posts = [{title: "First Post", body: "content of first post"}]


## Index route
get '/posts' do
    # Return all the posts as JSON
    return posts.to_json
end
```

- run the server `ruby server.rb`
- go to localhost:4567/posts in your browser

Pretty easy, right!

### The Show Route
The show route allows you to see one of the items based on an ID, since we're using an array instead of a database we'll pretend the array index is the id number.

```ruby
require 'sinatra'

## Model/Dataset

posts = [{title: "First Post", body: "content of first post"}]


## Index route
get '/posts' do
    # Return all the posts as JSON
    return posts.to_json
end

## Show Route
get '/posts/:id' do
    # return a particular post as json based on the id param from the url
    # Params always come to a string so we convert to an integer
    id = params["id"].to_i
    return posts[id].to_json
end
```

- run the server and test out `/posts/0`

### The Create Route

The create route usually receives information in the request body and creates a new data entry. This would be a post request to `/posts`.

To get the request body we define a custom method earlier in the file, make sure to add it.

```ruby
require 'sinatra'

## Model/Dataset

posts = [{title: "First Post", body: "content of first post"}]

## Custom Method for Getting Request body
def getBody (req)
    ## Rewind the body in case it has already been read
    req.body.rewind
    ## parse the body
    return JSON.parse(req.body.read)
end


## Index route
get '/posts' do
    # Return all the posts as JSON
    return posts.to_json
end

## Show Route
get '/posts/:id' do
    # return a particular post as json based on the id param from the url
    # Params always come to a string so we convert to an integer
    id = params["id"].to_i
    return posts[id].to_json
end

## Create Route
post '/posts' do
    # Pass the request into the custom getBody function
    body = getBody(request)
    # create the new post
    new_post = {title: body["title"], body: body["body"]}
    # push the new post into the array
    posts.push(new_post)
    # return the new post
    return new_post.to_json
end
```

- using a tool like postman make a post request to /posts, make sure to include a proper json body

```json
{
    "title": "Another Post",
    "body":"content in the new post"
}
```

### The Update Route

The update route should receive the id of the item to updated in the url and then update it using the data passed via the request body. This is typically done via a Put and/or Patch request to /posts/:id.

```ruby
require 'sinatra'

## Model/Dataset

posts = [{title: "First Post", body: "content of first post"}]

## Custom Method for Getting Request body
def getBody (req)
    ## Rewind the body in case it has already been read
    req.body.rewind
    ## parse the body
    return JSON.parse(req.body.read)
end


## Index route
get '/posts' do
    # Return all the posts as JSON
    return posts.to_json
end

## Show Route
get '/posts/:id' do
    # return a particular post as json based on the id param from the url
    # Params always come to a string so we convert to an integer
    id = params["id"].to_i
    return posts[id].to_json
end

## Create Route
post '/posts' do
    # Pass the request into the custom getBody function
    body = getBody(request)
    # create the new post
    new_post = {title: body["title"], body: body["body"]}
    # push the new post into the array
    posts.push(new_post)
    # return the new post
    return new_post.to_json
end

## Update Route
put '/posts/:id' do
    # get the id from params
    id = params["id"].to_i
    # get the request body
    body = getBody(request)
    #update the item in question
    posts[id][:title] = body["title"]
    posts[id][:body] = body["body"]
    #return the updated post
    return posts[id].to_json
end
```

- make a put request to /posts/0 and include a proper json body to test

### The Destroy Route

The destroy route takes in an id of an item to be deleted in the url and deletes it. This is done by making a delete request to `/posts/:id`

```ruby
require 'sinatra'

## Model/Dataset

posts = [{title: "First Post", body: "content of first post"}]

## Custom Method for Getting Request body
def getBody (req)
    ## Rewind the body in case it has already been read
    req.body.rewind
    ## parse the body
    return JSON.parse(req.body.read)
end


## Index route
get '/posts' do
    # Return all the posts as JSON
    return posts.to_json
end

## Show Route
get '/posts/:id' do
    # return a particular post as json based on the id param from the url
    # Params always come to a string so we convert to an integer
    id = params["id"].to_i
    return posts[id].to_json
end

## Create Route
post '/posts' do
    # Pass the request into the custom getBody function
    body = getBody(request)
    # create the new post
    new_post = {title: body["title"], body: body["body"]}
    # push the new post into the array
    posts.push(new_post)
    # return the new post
    return new_post.to_json
end

## Update Route
put '/posts/:id' do
    # get the id from params
    id = params["id"].to_i
    # get the request body
    body = getBody(request)
    #update the item in question
    posts[id][:title] = body["title"]
    posts[id][:body] = body["body"]
    #return the updated post
    return posts[id].to_json
end

## Destroy Route
delete '/posts/:id' do
    # get the id from params
    id = params["id"].to_i
    # delete the item
    post = posts.delete_at(id)
    # return the deleted item as json
    return post.to_json
end
```

- test it out by making a delete request to /posts/0

## Conclusion

You've just made a full crud API using Ruby Sinatra. The next step is to try to implement a database so that the data persists. There are many databases and corresponding libraries to use so go out and experiment.