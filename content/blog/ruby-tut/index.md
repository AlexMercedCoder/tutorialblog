---
title: Ruby on Rails API with JWT Auth Tutorial
date: "2020-08-18T22:12:03.284Z"
description: "Creating a Ruby on Rails API with Auth"
---

## Our Mission

Our goal is to make an API where users can login and creates notes under their account. I'm assuming some basic knowledge of Ruby on Rails and that you have it installed. If this is not the case just do this basic hello world tutorial to get a basic introduction before this tutorial.

> https://iridakos.com/programming/2013/11/24/saying-hello-world-with-ruby-on-rails

## Starting Up Our Project

```bash
rails new notesapi --database=postgresql --api
```

So this will create a new project in a `notesapi` folder. The `--database=postgresql` flag will make our database.yml and gemfile setup for postgres and the `--api` flag will build a minimal build for building api so we don't have all the bulk neccessary for rendering views.

## Configuring your dependencies

Make sure to add the following to your Gemfile

```ruby
gem 'bcrypt', '~> 3.1.7'
gem 'rack-cors'
gem 'jwt'
```

Then after making these adjustments in terminal run the command `bundle install` which will read the Gemfile and install any as of yet uninstalled dependencies. Now what do these libraries do?

**bcrypt:** Encrypts strings, will be used to encrypt new user passwords and verify where passwords at login match the encrypted password in our database.

**rack-cors:** This will allow us to manage Cross Origin Resource Sharing (CORS) and determine which URLs are allowed to make requests to our server

**JWT:** Json Web Tokens (JWT) are often issued when a user successfully logs in containing encrypted information such as username. Our API will look for JWT tokens in request headers to know the request is authorized to access certain data. (So I login get a token, I send the token when I request my notes and this tells the API which user I am and that I'm properly logged in)

### CORS

Head into `config/initializers/cors.rb` and enter the following. The "\*" basically allows all sources to make requests to our server which we can change after we deploy and know what our front-end applications URL will be.

```ruby

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*'

    resource '*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end

```

## Setting up Auth Routes

Head over to `config/routes.rb` and include the following

```ruby
Rails.application.routes.draw do
  resource :users, only: [:create]
  post "/login", to: "users#login"
  get "/auto_login", to: "users#auto_login"
end
```

So we only want the create the resources route for users which will be used to create new users. The '/login' route will be used for logging in and 'auto_login' will allow you to verify you are logged in using your JWT.

## Creating the User Model

```bash
rails g model User username:string password_digest:string age:integer
```

Notice the password field is called 'password_digest', this is a convention that the Bcrypt library is looking for to know that it will be responsible for digesting the password and encrypting it.

## Securing our User Model

Head into `app/models/user.rb` and add the following macro which will notify bCrypt to do its thing.

```ruby
class User < ApplicationRecord
    has_secure_password
end
```

## The User Controller

Run the following command to create a User controller...

```bash
rails g controller Users
```

This will create a new controller file at `app/controllers/`, let's open it up and begin building some controller functions.

## Migrating the model to your database

Before this next step take a moment to go to your `config/database.yml` and set your postgres settings

```yml
default: &default
  adapter: postgresql
  encoding: unicode
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>

development:
  <<: *default
  database: database_name
  username: test
  password: test
  host: localhost
  port: 5432

test:
  <<: *default
  database: database_name

production:
  <<: *default
  url: <%= ENV['DBURI'] %>
```

So locally it will work off your localhost database and in production it'll pull a connection string from your Heroku config vars (it'll look for a variable called DBURI in this case).

After setting up the connection run the following command to generate the migration files (files that contain commands to be sent to database) and then migrate (send those commands to your database and set a marker to know which migrations it has already ran).

```
rails db:create && rails db:migrate
```

## Seed some data

We will want to put some initial data in our database to test and work with so go to your `db/seeds.rb` file and add the following line.

```ruby
user = User.create(username: "alexmerced", password: "pineapple", age: 35)
```

After saving the new user in the seed file run the following command to seed the database.

```
rails db:seed
```

## The Application Controller

Head over and open `app/controllers/application_controller.rb`

Add the following code...

```ruby
class ApplicationController < ActionController::API
    before_action :authorized

  def encode_token(payload)
    JWT.encode(payload, 'yourSecret')
  end

  def auth_header
    # { Authorization: 'Bearer <token>' }
    request.headers['Authorization']
  end

  def decoded_token
    if auth_header
      token = auth_header.split(' ')[1]
      # header: { 'Authorization': 'Bearer <token>' }
      begin
        JWT.decode(token, 'yourSecret', true, algorithm: 'HS256')
      rescue JWT::DecodeError
        nil
      end
    end
  end

  def logged_in_user
    if decoded_token
      user_id = decoded_token[0]['user_id']
      @user = User.find_by(id: user_id)
    end
  end

  def logged_in?
    !!logged_in_user
  end

  def authorized
    render json: { message: 'Please log in' }, status: :unauthorized unless logged_in?
  end
end
```

#### So let's break down these methods:

**encode_token** this method takes in a payload (a hash of key/values you want to save in the token) and signs a token using a secret key. (in production this should an ENV variable.)

**auth_header** When determining is someone is logged in the frontend usually sends the token in the "Authorization" header preceded by the word bearer, this function checks to see if the header was sent.

example of a request including the appropiate header...

```js
fetch("/", {
  method: "post",
  headers: {
    "Content-Type": "application/json",
    Authorization: `bearer ${JWT_TOKEN}`,
  },
  body: JSON.stringify(requestBody),
})
```

**before_action :authorized** : this macro tells rails to run the authorized funcion before completing any request to the API. (why, to make sure they are logged in before they use the API)

**decoded_token:** If the auth header is present this function parses the string for the token and verified it and pulls out the payload (the hash we stored in the token when we created it). If verification fails it will return nil.

**logged_in_user if** decoding the token is successful it grabs the username from the payload and searches our user in the database.

**logged_in** returns true if logged in

**authorized:** returns a message asking user to log in if unless logged_in return true

## The Users Controller

Now to add some methods to the user controller, head over to `app/controllers/user_controller.rb` and add the following methods.

```ruby
class UsersController < ApplicationController
  before_action :authorized, only: [:auto_login]

  # REGISTER
  def create
    @user = User.create(user_params)
    if @user.valid?
      token = encode_token({user_id: @user.id})
      render json: {user: @user, token: token}
    else
      render json: {error: "Invalid username or password"}
    end
  end

  # LOGGING IN
  def login
    @user = User.find_by(username: params[:username])

    if @user && @user.authenticate(params[:password])
      token = encode_token({user_id: @user.id})
      render json: {user: @user, token: token}
    else
      render json: {error: "Invalid username or password"}
    end
  end


  def auto_login
    render json: @user
  end

  private

  def user_params
    params.permit(:username, :password, :age)
  end

end
```

Let's break this down.

**before_action :authorized, only: [:auto_login]**: This required the authorization method from the Application_Controller to be run before only the auto_login method of this controller.

**create** This creates a new user using the data returned from the user_params method. If the new user is validated (matches the user schema) then a JWT token is signed and returned in a json object to the client.

**login** Looks up the username and compares the password passed in, if all checks out, generate an JWT token and sends it over in a JSON object.

**auto_login** renturns the user object as JSON assuming the user has previous logged in (in which case the authenticate function will run successfully)

**user_params** private function that parses the needed data from the request to create a new user

## Time to test our API Auth

Run your server

```
rails s -p 4000
```

make post request to /login with your username and password, copy token from response
make a get request to /auto_login with your token in your headers

## Making the Notes item

let's create our notes model/controller/routes with the following command

```
rails g scaffold note message:string user:references
```

### The Result

model...

```ruby
class Note < ApplicationRecord
  belongs_to :user
end
```

It has belongs to since we specified the user field references our user model. So a notes cannot be created without associating it with a user.

In the controller file...

```ruby
class NotesController < ApplicationController
  before_action :set_note, only: [:show, :update, :destroy]

  # GET /notes
  def index
    @notes = Note.all

    render json: @notes
  end

  # GET /notes/1
  def show
    render json: @note
  end

  # POST /notes
  def create
    @note = Note.new(note_params)

    if @note.save
      render json: @note, status: :created, location: @note
    else
      render json: @note.errors, status: :unprocessable_entity
    end
  end

  # PATCH/PUT /notes/1
  def update
    if @note.update(note_params)
      render json: @note
    else
      render json: @note.errors, status: :unprocessable_entity
    end
  end

  # DELETE /notes/1
  def destroy
    @note.destroy
  end

  private
    # Use callbacks to share common setup or constraints between actions.
    def set_note
      @note = Note.find(params[:id])
    end

    # Only allow a trusted parameter "white list" through.
    def note_params
      params.require(:note).permit(:message, :user_id)
    end
end
```

Nice to see all our crud routes initially built out for us!

Then our migration file!

```ruby
class CreateNotes < ActiveRecord::Migration[6.0]
  def change
    create_table :notes do |t|
      t.string :message
      t.references :user, null: false, foreign_key: true

      t.timestamps
    end
  end
end
```

and last our routes

```ruby
Rails.application.routes.draw do
  resources :notes
  resource :users, only: [:create]
  post "/login", to: "users#login"
  get "/auto_login", to: "users#auto_login"
end
```

our notes already has all the main resources routes all setup, nice!

## Adding auth to notes

in the notes controllers add authorization as a before action...

```ruby
before_action :authorized
```

modify the controllers like so...

```ruby

  # GET /notes
  def index
    @notes = Note.where(user_id: @user.id)

    render json: @notes
  end

  # GET /notes/1
  def show
    render json: @note
  end

  # POST /notes
  def create
    @note = Note.new(note_params)
    @note.user_id = @user.id

    if @note.save
      render json: @note, status: :created, location: @note
    else
      render json: @note.errors, status: :unprocessable_entity
    end
  end

```

Notice the changes are mainly to the create and index function. The change to the index function makes sure that we are only grabbing notes of the particular user and the changes in create makes sure every user is assigned a user_id at creation.

The test the API and you'll find you'll need to login before you can create and view notes, congrats!
