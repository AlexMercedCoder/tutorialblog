---
title: Ruby Sinatra with Postgres using Sequel
date: "2021-06-04T12:12:03.284Z"
description: Connecting a Sinatra App to a Database
---

In Ruby on Rails we use ActiveRecord as our ORM (Object Relationship Mapper). Sinatra, being a minimalist framework is unopinionated about what Ruby ORM you use to work with to connect to the database of your choice. We will use the ORM, sequel, to connect our small application to a database.

## Requirements

- Have Ruby Installed

- Have postgres installed and have a server running

- Have Sinatra installed `gem install sinatra`

- Have Sequel installed `gem install sequel`

## Set One - Create a Database to Connect To

- open up the postgres shell with `psql`

- create a database `CREATE DATABASE sequel_test;`

- create a super user to connect `CREATE USER myuser WITH SUPERUSER PASSWORD 'myuser';`

- connect to the database `\c sequel_test`

- create a table `CREATE TABLE people (id SERIAL, name VARCHAR(20), age INTEGER);`

- quit psql `\q`

- construct a connection `postgres://myuser:myuser@localhost:5432/sequel_test` (adjust the url as needed for your environment)

## Write our file!

While Sequel has support for migrations, Model Mapping and more, we will keep it simple with raw sql queries just to demonstrate.

 - create a file called server.rb with the following, read the comments for explanation of the code.

 ```ruby
# Import the needed libraries
require 'sinatra'
require 'sequel'

# Connect to our database using our database string
DB = Sequel.connect('postgres://test7:test7@localhost:5432/sequel_test')

#Create a route to see all records
get '/' do
    # create a dataset from the people table
    result = DB[:people]
    # return all the records from the people table as json
    return result.all.to_json
end

#Create a route to add a record
get '/add/:name/:age' do
    # Extract data from URL Params
    name = params["name"]
    age = params["age"].to_i
    # create query to add
    result = DB["INSERT INTO people (name, age) VALUES (?, ?)", name, age]
    # run the insert query
    result.insert(1)
    return "Record added"
end
 ```

Here we're create a couple of basic enpoint to see and add data using sequel. I recommend going deeper into the sequel documentation to learn how to setup migrations and get more typical ORM patterns. But if you just need some quick database access, this is one way to do it very quickly.

- [Sequel Documentation](http://sequel.jeremyevans.net/documentation.html)