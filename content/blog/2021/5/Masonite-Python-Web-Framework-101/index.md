---
title: How to Work with Masonite - Python Web Framework
date: "2021-05-28T12:12:03.284Z"
description: Batteries Included Python Web Framework
---

We all love Ruby on Rails and how easy it makes creating APIs and websites. In python, Django has generally been the main batteries included framework used for many projects. The problem is Django has a lot of quirks that make its patterns quite different than the more railsesque approach frameworks for other languages have taken. Masonite provides a much more rails like experience in the Python language, let's try it out!

## Pre-requisites

- Python 3.6
- pip

## Setup

- in an empty folder run `python -m venv venv` to create a new virtual environment then `source ./venv/bin/activate` to activate it.

- `pip install masonite` to install masonite

- confirm it is installed by running `craft` (craft is the command we'll use to trigger all of masonites generators and tools)

- run `craft new` to generate a new project in the folder you are in.

- run `craft serve` to run the server which defaults to port 8000

## Creating Some Routes

You'll notice the layout of the folders is A LOT like the rails or Laravel folder structures. To add routes we need to create a controller, a class with methods that run when different requests are made to our server.

`craft controller first`

This creates a controller file in app/http/controllers with two methods.

- `__init__` the class constructor which you can use to do things prior to methods being called, in this case it just creates a class property that holds the request so it's available to all your other methods

It also includes the following method.

```py
    def show(self, view: View):
        pass
```

Since we will be focusing on making a JSON api we don't really need that View parameter (used for delivering html views). We can return a python dictionary or list and it will be treated as a json response.

```py
    def show(self):
        return {"look": "I returned some json!"}
```

The methods name doesn't matter beyond having some way to identify it, so you can call it what you want for now or just keep show.

## Connecting the Controller to a Route

A route is a combination of a url endpoint and method that gets pointed to a particular controller function. This is handled in routes/web.py. We have an array of routes.

```py
"""Web Routes."""

from masonite.routes import Get, Post

ROUTES = [
    Get("/", "WelcomeController@show").name("welcome"),
]
```

Essentially, the pre-existing route is saying that if the server receives a Get request to "/" the response is handled by the show function on the WelcomeController.

Let's add a route for our controller.

```py
"""Web Routes."""

from masonite.routes import Get, Post

ROUTES = [
    Get("/", "WelcomeController@show").name("welcome"),
    Get("/first", "firstController@show").name("first"),
]
```

Make sure your server is running and head over to localhost:8000/first and you should see our json message! See, that wasn't so hard!

## Going Deeper into Masonite

Masonite has a world of tools available to you to migrate your database, generate your models, etc. It all uses patterns that shouldn't feel unfamiliar from frameworks like Rails and Laravel. Try it out, I think you'll like it!