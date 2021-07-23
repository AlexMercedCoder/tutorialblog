---
title: Basics of Building a CRUD API with Flask or FASTApi
date: "2021-07-23T12:12:03.284Z"
description: Learning REST conventions with Python Frameworks
---

Flask and FASTApi are two very popular Python frameworks for creating an API in python. In this tutorial we will walk through making an API with both with full CRUD. We will not be using a database or ORM. Although using the patterns below you can adapt your preferred data layer into your API. So instead of a database we will define our model using a class and use a list to create, read, update and delete our data.

Before doing this tutorial make sure to have a recent version of Python 3 installed.

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

## API IN FLASK

### Setup

- create a new project from [THIS TEMPLATE](https://github.com/Alex-Merced-Templates/FLASK_2_TEMPLATE) and clone it to your computer.

- navigate your terminal into the project folder and create a python virtual environment `python -m venv venv`

- activate the virtual environment `source ./venv/bin/activate`

- install all the dependencies from the requirements.txt `pip install -r requirements.txt`
*to update the requirements.txt if you install more libraries use the following command `pip freeze > requirements.txt`*

- test that the server runs by running `python server.py` and going to localhost:7000 to see if you can see the default route. (more details about the template in readme.md)

### Setting Up Our Models

Again, we aren't using a database but to go through the motions we'll setup our class and array in the models folder. (Under MVC all your datatypes and ORM Models should be defined in the models folder).

We will:
- create a BlogPost class with a title and body property, constructor function
- we'll create an empty array to hold our blog posts.
- we'll create a sample BlogPost and add it to the array

**`/models/__init__.py`**

```python
# Our Blog Post Class
class BlogPost:
    # Define our Properties
    title = ""
    body = ""

    #define our constructor
    def __init__(self, title, body):
        self.title = title
        self.body = body

# An Empty Array to hold our BlogPosts
posts = []

# A Sample BlogPost
first_post = BlogPost("My First Post", "The Body of My Post")

# Add the Post to our array
posts.append(first_post)
```

### The Index Route

The Standard Get Route Matches the following signature

- GET REQUEST => "/modelName" => Returns JSON of all items of the model

So since our model is BlogPost this means...

- GET REQUEST => "/blogpost" => Returns JSON of all BlogPosts

For our routes we'll be working out of the controllers folder.

We will:
- import our class and array
- create a get route return a dictionary with a property that is an tuple of dictionary versions of the BlogPost objects, we'll use map to loop the BlogPost objects and convert them to dictionaries.

**`/controllers/__init__.py`**

```python
from flask import Blueprint
from models import BlogPost, posts

#############################################
## USE THIS FILE TO DEFINE ANY Routes
## Create Sub Blueprints as needed
#############################################

home = Blueprint("home", __name__)

@home.get("/")
def home_home():
    return {"home": "this is the home route"}

## BlogPost Index Route
@home.get("/blogpost")
def home_blogpost():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}
```

- run your server `python server.py`

- go to localhost:7000/blogpost and see if you get the JSON response

### The Show Route

The show route returns a single BlogPost based on a ID passed via the URL. Although, we are not using a database so instead of an ID we'll just use the list index.

- `Get request => /blogpost/<id> => return single object`

**`/controllers/__init__.py`**

```python
from flask import Blueprint
from models import BlogPost, posts

#############################################
## USE THIS FILE TO DEFINE ANY Routes
## Create Sub Blueprints as needed
#############################################

home = Blueprint("home", __name__)

@home.get("/")
def home_home():
    return {"home": "this is the home route"}

## BlogPost Index Route
@home.get("/blogpost")
def home_blogpost():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

## BlogPost Show Route
@home.get("/blogpost/<id>")
def home_blogpost_id(id):
    id = int(id)
    return posts[id].__dict__
```

- run your server `python server.py`

- go to localhost:7000/blogpost/0 and see if you get the JSON response

### The Create Route

The create route allows us to send the details of a new object we want to make in the request body and create a new item. This will require access to the request body which is done by the flask request object. We will then return the newly created object as the response.

- Post Request => "/blogpost" => creates and returns new blogpost object

**`/controllers/__init__.py`**

```python
from flask import Blueprint, request
from models import BlogPost, posts

#############################################
## USE THIS FILE TO DEFINE ANY Routes
## Create Sub Blueprints as needed
#############################################

home = Blueprint("home", __name__)

@home.get("/")
def home_home():
    return {"home": "this is the home route"}

## BlogPost Index Route
@home.get("/blogpost")
def home_blogpost():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

## BlogPost Show Route
@home.get("/blogpost/<id>")
def home_blogpost_id(id):
    id = int(id)
    return posts[id].__dict__

@home.post("/blogpost")
def home_blopost_create():
    #get dictionary of request body
    body = request.json
    # Create new BlogPost
    post = BlogPost(body["title"], body["body"])
    # append new BlogPost object to posts array
    posts.append(post)
    # return the new post as JSON
    return post.__dict__
```

- run your server `python server.py`

- using a tool like postman make a post request to `localhost:7000/blogpost` and send a json body like this:

```json
{
    "title":"Another Post",
    "body": "bloggity bloggity"
}
```

- request the index route again to confirm the object was added

### The Update Route

The update route should let us pass an id of particular object in the url along with data in the body of the request. It will update the object with that id using the data in the body of the request.

- Put/Patch request to `/blogpost/<id>` => return updated object

**`/controllers/__init__.py`**

```python
from flask import Blueprint, request
from models import BlogPost, posts

#############################################
## USE THIS FILE TO DEFINE ANY Routes
## Create Sub Blueprints as needed
#############################################

home = Blueprint("home", __name__)

@home.get("/")
def home_home():
    return {"home": "this is the home route"}

## BlogPost Index Route
@home.get("/blogpost")
def home_blogpost():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

## BlogPost Show Route
@home.get("/blogpost/<id>")
def home_blogpost_id(id):
    id = int(id)
    return posts[id].__dict__

@home.post("/blogpost")
def home_blopost_create():
    #get dictionary of request body
    body = request.json
    # Create new BlogPost
    post = BlogPost(body["title"], body["body"])
    # append new BlogPost object to posts array
    posts.append(post)
    # return the new post as JSON
    return post.__dict__
```

- run your server `python server.py`

- using a tool like postman make a put or patch request to `localhost:7000/blogpost/0` and send a json body like this:

```json
{
    "title":"Updated Post",
    "body": "bloggity bloggity"
}
```

- request the index route again to confirm the object was updated

### Delete Route

The delete route takes the id of an object in the url and deletes that object, returns the deleted object.

- Delete Request to `/blogpost/<id>` returns deleted object

**`/controllers/__init__.py`**

```python
from flask import Blueprint, request
from models import BlogPost, posts

#############################################
## USE THIS FILE TO DEFINE ANY Routes
## Create Sub Blueprints as needed
#############################################

home = Blueprint("home", __name__)

@home.get("/")
def home_home():
    return {"home": "this is the home route"}

## BlogPost Index Route
@home.get("/blogpost")
def home_blogpost():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

## BlogPost Show Route
@home.get("/blogpost/<id>")
def home_blogpost_id(id):
    id = int(id)
    return posts[id].__dict__

## The BlogPost Create Route
@home.post("/blogpost")
def home_blopost_create():
    #get dictionary of request body
    body = request.json
    # Create new BlogPost
    post = BlogPost(body["title"], body["body"])
    # append new BlogPost object to posts array
    posts.append(post)
    # return the new post as JSON
    return post.__dict__

#The BlogPost Update Route
@home.route("/blogpost/<id>", methods=["Put", "Patch"])
def home_update_blogpost(id):
    # get id
    id = int(id)
    # get request body
    body = request.json
    # get post to be updated
    post = posts[id]
    # update post
    post.title = body["title"]
    post.body = body["body"]
    # return updated object
    return post.__dict__

@home.delete("/blogpost/<id>")
def home_blogpost_delete(id):
    # get id
    id = int(id)
    # remove the item from the array
    post = posts.pop(id)
    # return removed item
    return post.__dict__
```

- run your server `python server.py`

- using a tool like postman make a delete request to `localhost:7000/blogpost/0` 

- request the index route again to confirm the object was deleted

## API IN FASTApi

### Setup

- create a new project from [THIS TEMPLATE](https://github.com/Alex-Merced-Templates/FASTApi_Template) and clone it to your computer.

- navigate your terminal into the project folder and create a python virtual environment `python -m venv venv`

- activate the virtual environment `source ./venv/bin/activate`

- install all the dependencies from the requirements.txt `pip install -r requirements.txt`
*to update the requirements.txt if you install more libraries use the following command `pip freeze > requirements.txt`*

- test that the server runs by running `python server.py` and going to localhost:7000 to see if you can see the default route. (more details about the template in readme.md)

### Setting Up Our Models

Again, we aren't using a database but to go through the motions we'll setup our class and array in the models folder. (Under MVC all your datatypes and ORM Models should be defined in the models folder).

We will:
- create a BlogPost class with a title and body property, constructor function
- we'll create an empty array to hold our blog posts.
- we'll create a sample BlogPost and add it to the array

**`/models/__init__.py`**

```python
# Our Blog Post Class
class BlogPost:
    # Define our Properties
    title = ""
    body = ""

    #define our constructor
    def __init__(self, title, body):
        self.title = title
        self.body = body

# An Empty Array to hold our BlogPosts
posts = []

# A Sample BlogPost
first_post = BlogPost("My First Post", "The Body of My Post")

# Add the Post to our array
posts.append(first_post)
```

### The Index Route

The Standard Get Route Matches the following signature

- GET REQUEST => "/modelName" => Returns JSON of all items of the model

So since our model is BlogPost this means...

- GET REQUEST => "/blogpost" => Returns JSON of all BlogPosts

For our routes we'll be working out of the controllers folder.

We will:
- import our class and array
- create a get route return a dictionary with a property that is an tuple of dictionary versions of the BlogPost objects, we'll use map to loop the BlogPost objects and convert them to dictionaries.

**`/controllers/__init__.py`**

```python
from fastapi import APIRouter
from models import BlogPost, posts

##########################################
## Setup Your Routes in This File
##########################################

home = APIRouter(prefix="")

@home.get("/")
async def home_home():
    return {"home": "The Homepage"}

# Index Route
@home.get("/blogpost")
async def index():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}
```

- run your server `python server.py`

- go to localhost:7000/blogpost and see if you get the JSON response

### The Show Route

The show route returns a single BlogPost based on a ID passed via the URL. Although, we are not using a database so instead of an ID we'll just use the list index.

- `Get request => /blogpost/{id} => return single object`

**`/controllers/__init__.py`**

```python
from fastapi import APIRouter
from models import BlogPost, posts

##########################################
## Setup Your Routes in This File
##########################################

home = APIRouter(prefix="")

@home.get("/")
async def home_home():
    return {"home": "The Homepage"}

# Index Route
@home.get("/blogpost")
async def index():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

# Show Route
@home.get("/blogpost/{id}")
async def show(id:int):
    ## Return the post with the right index
    return posts[id].__dict__
```

- run your server `python server.py`

- go to localhost:7000/blogpost/0 and see if you get the JSON response

### The Create Route

The create route allows us to send the details of a new object we want to make in the request body and create a new item. To use the request body in FastApi our model has to inherit from a FastApi base model. Then we can use it as a type and FastApi will automatically make the body available via the model object.

- Post Request => "/blogpost" => creates and returns new blogpost object

First let's update our model

**`models/__init__.py`**

```python
# Import BaseModel from Pydantic
from pydantic import BaseModel

# Our Blog Post Class
class BlogPost:
    # Define our Properties and types, which allows FastApi to validate
    title = ""
    body = ""

    #define our constructor
    def __init__(self, title, body):
        self.title = title
        self.body = body

# An Empty Array to hold our BlogPosts
posts = []

# A Sample BlogPost
first_post = BlogPost("My First Post", "The Body of My Post")

# BlogPostBody Class for Receiving Our Request Body
class BlogPostBody(BaseModel):
    title:str
    body:str

# Add the Post to our array
posts.append(first_post)
```

**`/controllers/__init__.py`**

```python
from fastapi import APIRouter
from models import BlogPost, posts, BlogPostBody

##########################################
## Setup Your Routes in This File
##########################################

home = APIRouter(prefix="")

@home.get("/")
async def home_home():
    return {"home": "The Homepage"}

# Index Route
@home.get("/blogpost")
async def index():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

# Show Route
@home.get("/blogpost/{id}")
async def show(id:int):
    ## Return the post with the right index
    return posts[id].__dict__

#Create Route
@home.post("/blogpost")
async def create(post: BlogPostBody):
    ## Create a New BlogPost
    posts.append(BlogPost(post.title, post.body))
    ## Return the Post
    return post.__dict__
```
- Make a post request to `/blogpost` creating a new blogpost, you can actually use FastApi built in documentation to test it out by going to `/docs`

- request the index route again to confirm the object was added

### The Update Route

The update route should let us pass an id of particular object in the url along with data in the body of the request. It will update the object with that id using the data in the body of the request.

- Put/Patch request to `/blogpost/{id}` => return updated object

**`/controllers/__init__.py`**

```python
from fastapi import APIRouter
from models import BlogPost, posts, BlogPostBody

##########################################
## Setup Your Routes in This File
##########################################

home = APIRouter(prefix="")

@home.get("/")
async def home_home():
    return {"home": "The Homepage"}

# Index Route
@home.get("/blogpost")
async def index():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

# Show Route
@home.get("/blogpost/{id}")
async def show(id:int):
    ## Return the post with the right index
    return posts[id].__dict__

#Create Route
@home.post("/blogpost")
async def create(post: BlogPostBody):
    ## Create a New BlogPost
    posts.append(BlogPost(post.title, post.body))
    ## Return the Post
    return post.__dict__

#Update Route
@home.api_route("/blogpost/{id}", methods=["Put", "Patch"])
async def update(id: int, post: BlogPostBody):
    # get post to be updated
    target = posts[id]
    # update the post
    target.title = post.title
    target.body = post.body
    # return the updated post
    return target.__dict__
```

- run your server `python server.py`

- using a tool like postman or using `/docs` make a put or patch request to `localhost:7000/blogpost/0` and send a json body like this:

```json
{
    "title":"Updated Post",
    "body": "bloggity bloggity"
}
```

- request the index route again to confirm the object was updated

### Delete Route

The delete route takes the id of an object in the url and deletes that object, returns the deleted object.

- Delete Request to `/blogpost/{id}` returns deleted object

**`/controllers/__init__.py`**

```python
from fastapi import APIRouter
from models import BlogPost, posts, BlogPostBody

##########################################
## Setup Your Routes in This File
##########################################

home = APIRouter(prefix="")

@home.get("/")
async def home_home():
    return {"home": "The Homepage"}

# Index Route
@home.get("/blogpost")
async def index():
    # map over array of posts converting to tuple of dictionaries
    return {"posts": tuple(map(lambda bp : bp.__dict__, posts))}

# Show Route
@home.get("/blogpost/{id}")
async def show(id:int):
    ## Return the post with the right index
    return posts[id].__dict__

#Create Route
@home.post("/blogpost")
async def create(post: BlogPostBody):
    ## Create a New BlogPost
    posts.append(BlogPost(post.title, post.body))
    ## Return the Post
    return post.__dict__

#Update Route
@home.api_route("/blogpost/{id}", methods=["Put", "Patch"])
async def update(id: int, post: BlogPostBody):
    # get post to be updated
    target = posts[id]
    # update the post
    target.title = post.title
    target.body = post.body
    # return the updated post
    return target.__dict__

#Destroy Route
@home.delete("/blogpost/{id}")
async def destroy(id: int):
    # remove post
    post = posts.pop(id)
    # return removed post
    return post.__dict__
```

- run your server `python server.py`

- using a tool like postman or `/docs` make a delete request to `localhost:7000/blogpost/0` 

- request the index route again to confirm the object was deleted

## Conclusion

You've now seem the basics of building a full crud API in Flask and FastApi. The next step is to try to persist the data using a database. There are several options of databases and corresponding libraries out there, have some fun with it!