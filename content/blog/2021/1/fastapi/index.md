---
title: Getting Started with Python Web Framework, FastAPI
date: "2021-01-02T12:12:03.284Z"
description: The New Fast Web Framework in Python
---

## Python Web Frameworks

The Python Ecosystem has many web frameworks for creating APIs and Full-Stack applications and FastAPI is one of the newest getting a lot of attention for its simplicity and speed. Before we dive into FastAPI let's mention some of the many popular python web frameworks.

**Batteries Included**
Batteries Included web frameworks are opinionated in that they come with built-in ORMs, authentication, and other libraries and a host of conventions and tools to make working with them very seamless. The bright side is you can build an application very quickly but if you are new to the language the abstractions are so high level it can be hard to reason how to do something beyond the conventions.

- Django (The most popular batteries included python framework)
- Masonite (Newer Framework with a more Ruby on Rails like workflow)

**Minimalist Frameworks**
These frameworks are unopinionated and only provide the basics of creating a web server and routing. When it comes to how to handle authentication, databases, etc. that is up to you and the libraries you prefer.

- Flask
- Bottle
- FastAPI

## Getting Started

The first step is to create a virtual environment. In python, a virtual environment is an isolated workspace to install libraries to help manage dependencies between projects. Similar to how every node project installs libraries to a local "node_modules" folder when in a virtual environment pip install will occur in that environment.

There are two main tools for managing virtual environments, Pyenv and Virtualenv. If you use the pycharm IDE it can create either type of environment for you easily.

After your virtual environment is setup we need to install the libraries we'll need to work with...

```
pip install fastapi uvicorn[standard]
```

- fastapi => The FastAPI Library

- uvicorn => web server tool to run our application

## Creating your first routes

Create an empty folder and make a file called server.py (doesn't matter what you call it). In this file place the following.

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def index():
    return {"message": "This is my index route!"}

```

Run `uvicorn server:app --reload` then checkout localhost:8000 in your browser to see your first route!

That wasn't so bad!

The `server:app` part of the uvicorn command is essentially referring to the file and application, it essentially means "start a server based on the app object in server.py"

## URL Params and Queries

Params and Queries are pretty straightforward. They get passed in as named arguments into your controller function. The only thing to keep in mind is that if you have a query and param with the same name, the param will take precedence.

```py

from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def index():
    return {"message": "This is my index route!"}

@app.get("/{myparam}")
async def index(myparam, myquery):
    return {
      "message": "Params and Queries at Work",
      "query": myquery,
      "param": myparam
      }

```

Now run your server and go to this url, http://localhost:8000/hello?myquery=IDidIt.

Super Easy!

## Bottom Line

FastAPI is a super fast and super easy to use web framework, learn more about it by checking out the full documentation here: https://fastapi.tiangolo.com/

Also, make sure to checkout devNursery.com to find my videos and blogs on different programming languages and frameworks.
