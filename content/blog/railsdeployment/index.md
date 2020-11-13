---
title: Ruby on Rails Tutorial - Heroku API Deployment
date: "2020-11-12T22:12:03.284Z"
description: Deploy a Full Crud API Quickly!
---

**My Learning Ruby on Rails Video Playlist:** https://www.youtube.com/playlist?list=PLY6oTPmKnKbYlAqVHgzZl5lou54bizdbV

## Setup

This tutorial requires that you've already installed

- ruby
- rails

Create a new rails project

```bash
rails new dogs --api -d postgresql
```

cd into the dogs folder

## Configuring your Database

Assuming you have a local postgres server make sure you write your database.yml like so. Make sure the username and password matches your local postgres user.

```yml
default: &default
  adapter: postgresql
  encoding: unicode
  pool: <%= ENV.fetch("RAILS_MAX_THREADS") { 5 } %>
  # Make sure the below reflects your local postgres user
  port: 5432
  host: localhost
  username: test5
  password: test5

development:
  <<: *default
  database: mice_development

test:
  <<: *default
  database: mice_test

production:
  <<: *default
  url: <%= ENV['DATABASE_URL'] %>
```

Uncomment `gem 'rack-cors'` in your gemfile then run `bundle install`

Edit your config/initializers/cors.rb to look like so. This will allow all origins to make request, customize to your liking.

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

## Create a quick API

Run the following commands for a basic dogs api...

```rails g scaffold dog name:string age:integer breed:string```

```rails db:migrate```

Add the following in db/seeds.rb

```ruby

Dog.create(name: "Sparky", age: 5, breed: "Bulldog")
Dog.create(name: "Spot", age: 5, breed: "Dalmation")
Dog.create(name: "Goldy", age: 5, breed: "Golden Retriever")

```

run the command ```rails db:seed```

## Test the Api

```rails server```

Go to localhost:3000/dogs to see if our dogs are there, if so we are ready to deploy.

## Deploy to Heroku

- push your code to heroku (make sure the root of the repo is the same folder as the gemfile)
- create a new heroku project and connect it to your github repo
- using the heroku cli run the following commands

```heroku run rails db:migrate && rails db:seed --app=youAppName```
*make sure to replace yourAppName with the name of your heroku project

That's it, go to https://HEROKUURL/dogs

and you should see your dogs!!!