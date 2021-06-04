---
title: Intro to Ruby Sinatra
date: "2021-06-03T12:12:03.284Z"
description: Minimalist Ruby Web Framework
---

In Python there is Django, the big batteries included web framework. There there is Flask, the minimalist web framework similar ExpressJS on node. In the Ruby world, along with the batteries included Rails framework, there is the Sinatra web framework. Let's take it for a spin.

## Pre-requisites

- Ruby Installed 

## Getting Started

- Create an empty folder

- Install Sinatra `gem install sinatra`

- create a file `server.rb` with the following

```rb
require 'sinatra'

get '/' do
    {"msg": "Hello World"}.to_json
end
```

Run the file `ruby server.rb` and checkout localhost:4567.

As you can see getting a Sinatra server started makes Express and Flask look like Rocket science. We literally just installed a gem and wrote 4 lines of code, no virtual environments, no passing environmental variables, no initiating an application object. Just simplicity.

## Using URL Params

We can designate parts of the url as params with a colon like in express then access the params via the params hash.

```rb
get '/cheese/:type' do
    {"cheese": params["type"]}.to_json
end
```

Let's create another route. In this case visit /route/this?query=that after updating your code.

```rb
get '/route/:param' do
    {"param": params["param"], query: params["query"]}.to_json
end
```

## Learn More

As you can see Sinatra is pretty simple a straightforward. Learn more by [reading the documentation](http://sinatrarb.com/intro.html).
