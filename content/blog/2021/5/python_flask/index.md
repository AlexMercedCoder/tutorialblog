---
title: Python Flask 101 - Intro and API Building
date: "2021-05-21T12:12:03.284Z"
description: Making an API with this Powerful Python Framework
---

Every programming language has frameworks for building web server, also known as a web framework. In Python, there are several such as Django, Bottle, Pyramid, Masonite, FastAPI, Web2Py and many more. Next to Django, the most heavily used Python web framework is Flask. Flask is the ExpressJS (minimalist web framework) what Django is to Ruby on Rails (Batteries Included Web Framework).

In this tutorial we will be building a basic JSON API in flask. Afterwards I'll share resources for going deeper into using flask.

#### Pre-Requisites:

- [Knowledge of the Python Programming Language](https://www.youtube.com/playlist?list=PLY6oTPmKnKbaTvgXqNCRXcKnqbO5j2oQn)

- Python Installed (I'm using 3.8.5)

- An IDE (I'm using Visual Studio Code)

## Setup

- Create an empty folder to work out of

- Open terminal in that folder

- create a python virtual environment `python -m venv venv`

- Turn on the Virtual Environment `source ./venv/bin/activate` (notice the change in your terminal prompt)

**If not familiary with what are and what is the purpose of virtual environments read the following articles**

[Part I: VirtualEnv & Pyenv](https://tuts.alexmercedcoder.dev/2021/1/pythonvirtualenv/)
[Part II: Built-in Virtual Env Generator](https://tuts.alexmercedcoder.dev/2021/3/rivisitingpyenv/)
[Part III: Pipenv, the Ultimate Virtual Environment](https://tuts.alexmercedcoder.dev/2021/4/pipenv/)

- install flask `pip install flask`

## Our First Route

- create a file called server.py

```py
# Import the flask library
from flask import Flask

# create the flask application object pa
app = Flask(__name__)

## Decorator making the subsequent function a route
@app.route("/", methods=["GET"])
## this functions return value is the response of the route (function name doesn't matter)
def first_route():
  return "hello world", 200 ## will return text with a 200 status

```

** If your wondering about the **name** variable, it's a special variable in python you can [read about here](https://www.geeksforgeeks.org/__name__-special-variable-python/)**

To run the server use the command

`FLASK_APP=server.py python -m flask run`

- `FLASK_APP=server.py` This defines the FLASK_APP env variable needed to determine which file has the app object for Flask to run.

- `python -m` allows you to run a python module or file as a script

- `Flask` we are running the Flask module

- `run` the run is a command built into the Flask module to create a web server with the app specified by the FLASK_APP variable

Once the server is running head over to localhost:5000 and you should see hellow world! Congrats, you have created your first flask route!

## JSON API BASICS

Returning JSON responses in Flask is pretty easy, as long as the routes function returns a python dictionary it can turned into JSON. For any python class instances you can either convert them into a dictionary by adding a built in as_dict method.

```py
class Dog():

    ## Dog Constructor
    def __init__(self, name, age):
      self.name = name
      self.age = age

    ## Method for Turning to Dictionary to send back as JSON
    def as_dict(self):
       return {c.name: getattr(self, c.name) for c in self.__table__.columns}

## Create Instance of Dog
sparky = Dog("Sparky", 5)

## Print Dog as a Dictionary
print(Dog.as_dict())
```

## Basic Crud

We will use a basic list/array of meals inside of dictionary to create a simple api to add, edit, delete the meals in the array. Add the following to server.py.

- notice we added request to the import of Flask, this allows us to pull data from the request like the request body and method

```py
## List of Dictionaries containing meals
meals = [{"meal": "breakfast"}, {"meal": "lunch"}, {"meal": "dinner"}]


## INDEX & CREATE ROUTE - Return all meals and create meals
@app.route("/meals", methods=["GET", "POST"] )
def meals_index_create():
    ## If a get request, return all meals
    if (request.method == "GET"):
        print(meals)
        return {"meals": meals}
    ## If a post, add a meal expecting a json body with a meal property
    if (request.method == "POST"):
        # get the request body as a python dictionary
        body = request.json
        # append the new meal to meals
        meals.append(body)
        # return new list of meals
        return {"meals": meals}
```

If you want start the server and use a tool like postman to make a get and post request to /meals. Make sure to send a json body for the post request.

```json
{
  "meal": "brunch"
}
```

Next we'll add Show, Delete and Update routes

- notice the `<index>` in side the definition of the endpoint. This is called a URL param and is a way to define a variable in the url itself. We can then receive this variable as an argument to our route function (notice now the function has parameters defined).

- since we will make assignments using the meals variable name, without further detail, python will think we are creating a new "local" version of meals not editing the global one defined outside the function. To access meals we will use the global keyword to declare that references to meals in this function are references to the previously defined global variable.

- In the delete part you'll notice some strange syntax, this is called List of Dictionary comprehension. Essentially, it's a way of creating a new list/dict by looping over another one. Read More... [List Comprehension](https://www.w3schools.com/python/python_lists_comprehension.asp) - [Dictionary Comprehension](https://www.datacamp.com/community/tutorials/python-dictionary-comprehension)

```py

## SHOW, Update, and Delete routes - Get one, update one, delete one
@app.route("/meals/<index>", methods=["GET", "PUT", "DELETE"])
def meals_show_update_delete(index):
    # save the contents of the request body
    body = request.json
    # make sure that meals refers to the global variable before reassignment
    global meals
    # make sure that the index is a integer, not a string
    index = int(index)
    if(request.method == "GET"):
        # return the meal at the index specified in the url param
        return meals[index]
    if(request.method == "PUT"):
        #update the specified index with the request body, then return it
        meals[index] = body
        return meals[index]
    if(request.method == "DELETE"):
        ## make meals a new dictionary, where the meals list has the desired item removed using the list comprehension feature (creating a list or dict by iterating over another one with an expression)
        meals = {
            "meals":[i for i in meals if not (i["meal"] == meals[index]["meal"])]
            }
        return meals

```

There you have full CRUD on meals, exciting!

## What's next

- [Read the Flask Docs](https://flask.palletsprojects.com/en/2.0.x/)
- [Learn how to use MongoDB with Flask](https://flask.palletsprojects.com/en/2.0.x/patterns/mongoengine/)
- [Use SQL Databases using SQLAlchemy](https://flask.palletsprojects.com/en/2.0.x/patterns/sqlalchemy/)
