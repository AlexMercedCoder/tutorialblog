---
title: Ruby on Rails Tutorial - Many to Many Relationships
date: "2020-11-11T22:12:03.284Z"
description: How to create a many to many relationship
---
**My Learning Ruby on Rails Video Playlist:** https://www.youtube.com/playlist?list=PLY6oTPmKnKbYlAqVHgzZl5lou54bizdbV

## Setup

This tutorial requires that you've already installed
- ruby
- rails

Create a new rails project

```bash
rails new invest_project --api
```

cd into the invest_project folder

## Creating Our Models

**Three Models**

Investor - Investors who invest in companies
Company - Companies who have investors
Investments - junction of investors and companies

run the following commands...

```bash
rails generate scaffold investor name:string
```

```bash
rails generate scaffold company name:string
```

```bash
rails generate scaffold investment investor:references company:references
```

setup your database

```bash
rails db:create
```

```bash
rails db:migrate
```

## Outline your relationships

app/models/investor.rb

```ruby
class Investor < ApplicationRecord
    has_many :investments
    has_many :companies, through: :investments
end
```

app/models/company.rb

```ruby
class Company < ApplicationRecord
    has_many :investments
    has_many :investors, through: :investments
end
```

app/models/investment.rb

```ruby
class Investment < ApplicationRecord
  belongs_to :investor
  belongs_to :company
end
```

## Test it out!

```bash
rails console
```

run the following commands

```ruby
#1 Create a new Investor
bob = Investor.create(name:"Bob")

#2 Invest in a new company
bob.companies.create("abc")

#3 Create a new company
def = Company.create("def")

#4 Add an investor
def.investors.create("Steve")

#5 see the results
Investor.all
Company.all
Invesment.all
```

