---
title: How to create an One to Many Relationship with Auth in Python with Masonite
date: "2021-12-07T12:12:03.284Z"
description: Using A Developer Friendly Web Framework in Python
---

![Title Image](https://i.imgur.com/tleNmhh.jpg)

## To Get Started with Masonite, Start Here

- [Working with Masonite Blog](https://tuts.alexmercedcoder.com/2021/5/Masonite-Python-Web-Framework-101/)
- [Video: Masonite from Zero to Deploy](https://www.youtube.com/watch?v=ayUGmt-YgkQ)

## Let's Get Started

Assuming you have a basic primer in the Masonite framework using the resources above let's get started with our setup.

- create and activate a virtual environment using your preferred method for doing so.

- install masonite `pip install masonite`

- confirm it installed correct and run command `craft help` which should list all of masonite's craft cli commands.

- create a new project `craft new my_project`

- cd into the my_project folder and run `craft_install`

## Setting Up Authentication

Out of the gate a fresh masonite project comes with a Users migratation and model.

The Migration is found in `databases/migrations`

```py
from masoniteorm.migrations import Migration


class CreateUsersTable(Migration):
    def up(self):
        """Run the migrations."""
        with self.schema.create("users") as table:
            table.increments("id")
            table.string("name")
            table.string("email").unique()
            table.string("password")
            table.string("remember_token").nullable()
            table.timestamp("verified_at").nullable()
            table.timestamps()

    def down(self):
        """Revert the migrations."""
        self.schema.drop("users")
```

You can add or rename any fields in here that you'd like, let's rename "name" to "username".

```py
class CreateUsersTable(Migration):
    def up(self):
        """Run the migrations."""
        with self.schema.create("users") as table:
            table.increments("id")
            table.string("username")
            table.string("email").unique()
            table.string("password")
            table.string("remember_token").nullable()
            table.timestamp("verified_at").nullable()
            table.timestamps()

    def down(self):
        """Revert the migrations."""
        self.schema.drop("users")
```

The model is found inside `app/User.py`

```py
"""User Model."""

from masoniteorm.models import Model


class User(Model):
    """User Model."""

    __fillable__ = ["name", "email", "password"]

    __auth__ = "email"
```

We want to update this so that users login based on username instead of email.

```py
"""User Model."""

from masoniteorm.models import Model


class User(Model):
    """User Model."""

    __fillable__ = ["username", "email", "password"]

    __auth__ = "username"
```

Before we migrate we need to setup our database settings in the `.env` file, if you don't have a ready to go mysql or postgres database we can use sqlite by just commenting out the database settings from the `.env` file.

```
#DB_CONNECTION=mysql
#DB_HOST=127.0.0.1
#DB_PORT=3306
#DB_DATABASE=masonite
#DB_USERNAME=root
#DB_PASSWORD=root
#DB_LOG=True
```

Once that is done, run `craft migrate` to run your migrations and create the users table.

#### Auth Settings

How the authentication functions will work are based on the settings in `config/auth.py`

```py
AUTH = {
    "defaults": {"guard": env("AUTH_GUARD", "web")},
    "guards": {
        "web": {
            "driver": "cookie",
            "model": User,
            "drivers": {  # 'cookie', 'jwt'
                "jwt": {"reauthentication": True, "lifetime": "5 minutes"}
            },
        },
    },
}
```

By default it will use session cookies but can easily be switched to JWT tokens by changing the driver property above to "jwt", either is fine.

## Creating Auth Routes

Now we just need routes for logging in and signing up, let's create a new controller `craft controller Auth`

Also while your at it let's turn off CSRF protection for the time being, go to `app/http/middleware/CsrfMiddleware.py`

and exampt all urls like:

```py
    exempt = [
        "*"
    ]
```

In `app/http/controllers/AuthController.py` add the following.

```py
"""A AuthController Module."""

from masonite.request import Request
from masonite.view import View
from masonite.controllers import Controller
from masonite.auth import Auth


class AuthController(Controller):

    def __init__(self, request: Request, auth: Auth):
        ## Add Request and Auth as instance properties each route can use
        self.request = request
        self.auth = auth

    def login(self):
        username = self.request.input("username")
        password = self.request.input("password")
        result = self.auth.login(username, password)
        return result

    def signup(self):
        username = self.request.input("username")
        email = self.request.input("email")
        password = self.request.input("password")
        result = self.auth.register({"username": username, "email": email, "password": password})
        return result

    def logout(self):
        self.auth.logout()
        return "Logged Out"
```

Now we just need to attach some routes to this controller so head over to `routes/web.py` and add the following:

```py
"""Web Routes."""

from masonite.routes import Get, Post, Put, Delete, RouteGroup

ROUTES = [
    Get("/", "WelcomeController@show").name("welcome"),

    RouteGroup([
        Post("/login", "AuthController@login").name("login"),
        Post("/signup", "AuthController@signup").name("signup"),
        Post("/logout", "AuthController@logout").name("logout"),
    ], prefix="/auth")
]
```

There you go, the auth routes are all set.

If you make a post request to `/auth/signup` with username/email/password it should return a newly created user.

If you submit a valid username and password with a post request to `/auth/login` it will create the cookie and login in the user, returning the data on the logged in user.

Now let's start building our other models.

## Owner and Dog

We are going to allow logged in users to be able to:

add owners
add dogs
associate a dog with an owner

First, let's create our tables. Since this is a one to many relationship (Owners can have many dogs, but dogs have one owner), the foreign key (id of the related owner) should exist on the dogs table.

- create your migrations
  `craft migration Owner --create owners`
  `craft migration Dog --create dogs`

- both tables will have a one to many relationship to users (users can have many owners and dogs, but each owner and dog below to one user)

- the dog table will denote the one to many relationship to owners

- let's give owners an name field in their migration

```py
"""Owner Migration."""

from masoniteorm.migrations import Migration


class Owner(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("owners") as table:
            table.increments("id")
            table.string("name")
            ## Field to track which user created the item
            table.integer("user_id")
            ## Defining the field as a foreign key
            table.foreign("user_id").references("id").on("users")

            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("owners")
```

- let's give dogs and name and owner_id (foreign key) field.

```py
"""Dog Migration."""

from masoniteorm.migrations import Migration


class Dog(Migration):
    def up(self):
        """
        Run the migrations.
        """
        with self.schema.create("dogs") as table:
            table.increments("id")
            table.string("name")
            ## Field to track which user created the item
            table.integer("user_id")
            ## Defining the field as a foreign key
            table.foreign("user_id").references("id").on("users")
            ## Create the field that will be the foreign key
            table.integer("owner_id")
            ## Foreign Key Field tracking id of related owner
            table.foreign("owner_id").references("id").on("owners")

            table.timestamps()

    def down(self):
        """
        Revert the migrations.
        """
        self.schema.drop("dogs")
```

- run your migrations `craft migrate`

## The models

So the tables are setup for handling a traditional one-to-many relationship but now we need model classes that are aware of the relationship.

- create your models `craft model Owner` `craft model Dog`

- edit the `app/User.py` model to relate users to dogs and owners

```py
"""User Model."""

from masoniteorm.models import Model
from masoniteorm.relationships import has_many


class User(Model):
    """User Model."""

    __fillable__ = ["username", "email", "password"]

    __auth__ = "username"

    ## Establish that users can have many dogs
    @has_many("id", "user_id")
    def dogs(self):
        from app.Dog import Dog
        return Dog

    ## Establish that users can have many owners
    @has_many("id", "user_id")
    def owners(self):
        from app.Owner import Owner
        return Owner
```

Now a user will be able to access associated owners `user.owners` and its associated dogs `user.dogs`.

- Now let's edit the owners table so it can have a similar relationship with dogs.

```py
"""Owner Model."""

from masoniteorm.models import Model
from masoniteorm.relationships import has_many

class Owner(Model):
    @has_many("id", "owner_id")
    def dogs(self):
        from app.Dog import Dog
        return Dog
```

## Creating the Routes

Now let's create a new controller so we can actually make dogs and owners associated with the logged in user. This new route group will have the auth middleware added which will check if the user exists and if it does will add the user as a property on the request object so we can use it in our routes.

`craft controller DogOwner`

```py
"""A DogOwnerController Module."""

from masonite.request import Request
from masonite.view import View
from masonite.controllers import Controller
from app.Dog import Dog
from app.Owner import Owner


class DogOwnerController(Controller):
    """DogOwnerController Controller Class."""

    def __init__(self, request: Request):
        """DogOwnerController Initializer

        Arguments:
            request {masonite.request.Request} -- The Masonite Request class.
        """
        self.request = request

    def get_user_owners(self):
        return self.request.user().owners
        
    def get_user_dogs(self):
        return self.request.user().dogs

    def create_owner(self):
        user = self.request.user()
        name = self.request.input("name")
        print(user)
        owner = Owner.create(name=name, user_id=user["id"])
        return owner

    def create_dog(self):
        user = self.request.user()
        name = self.request.input("name")
        owner_id = self.request.input("owner_id")
        dog = Dog.create(name=name, owner_id=owner_id, user_id=user.id)
        return dog
```

- then we add the routes to web.py

```py
"""Web Routes."""

from masonite.routes import Get, Post, Put, Delete, RouteGroup

ROUTES = [
    Get("/", "WelcomeController@show").name("welcome"),

    RouteGroup([
        Post("/login", "AuthController@login").name("login"),
        Post("/signup", "AuthController@signup").name("signup"),
        Post("/logout", "AuthController@logout").name("logout"),
    ], prefix="/auth"),

    RouteGroup([
        Get("/dog", "DogOwnerController@get_user_dogs").name("get_dogs"),
        Get("/owners", "DogOwnerController@get_user_owners").name("get_owners"),
        Post("/owner", "DogOwnerController@create_owner").name("create_owner"),
        Post("/dog", "DogOwnerController@create_dog").name("create_dog"),
    ], prefix="/dogowner",middleware=["auth"])
]
```

Now if your logged in you can make a post request to `/dogowner/owner` with a name and it will create a new owner associated with the loggedIn users id and then if you pass a name and owner_id in a post request to `/dogowner/dog` it will create a new dog associated with the loggedIn users id and the specified owners id.

If you make a get request to `/dogowner/owners` it should return a list of owners created by that user and a get request to `/dogowner/dog` should return a list of dogs created by that user. (You can similarly gets all the dogs of an owners with `owner.dogs`)

There is a lot more you can do, but it is recommended to do some reading up on database relationships and on the masonite ORM.