---
title: Rust & Rocket - Zero to Deploy
date: "2021-03-16T12:12:03.284Z"
description: Building APIs with Rust
---

Rust along with Go have been growing as popular alternatives to many of the use cases of languages like C & C++. With a more straightforward and centralized package management systems along with Syntax and Standard libraries that minimize many of the pain points of working with C/C++. Go/Rust offer the ability to have a lower level language that creates faster application but still maintain a pleasant and productive developer experience.

In a prior tutorial I went over Go's equivalent to Ruby on Rails, Buffalo. In this interview I'll go over Rust's big web framework, Rocket. We will build an API using a postgres database and deploy it.

## Setup

**Prerequisites**
- Rust Nightly (version of Rust with latest and even experimental features), if you installed rust with rustup then you can switch to nightly with the command `rustup default nightly`

- Postgres 12 or above

1. generate a new cargo project `cargo new personapi --bin` (cargo is the package manager of the rust work, like NPM is for node)

2. In the cargo.toml (plays the role package.json does for node), add rocket as a dependency.

```toml
[dependencies]
rocket = "0.4.7"
```

3. Open up src/main.rs and add the following

```rust
#![feature(proc_macro_hygiene, decl_macro)]

// IMPORT ROCKET LIBRARY
#[macro_use] extern crate rocket;

// Macro for annotating our route methods
#[get("/")]
fn index() -> &'static str {
    "Hello, world!"
}

// our main function, the entry to our application starting the server, loading routes
fn main() {
    rocket::ignite().mount("/", routes![index]).launch();
}
```

4. Let's test it our with the command `cargo run` and checkout localhost:8000

### Routing 

Let's add another route that uses a param

```rust
#![feature(proc_macro_hygiene, decl_macro)]

// IMPORT ROCKET LIBRARY
#[macro_use] extern crate rocket;

// Macro for annotating our route methods
#[get("/")]
fn index() -> &'static str {
    "Hello, world!"
}

// Macro for annotating our route methods
#[get("/cheese/<cheeseType>")]
fn cheese(cheeseType: String) -> String {
    format!("So... you like {} cheese!", cheeseType)
}

// our main function, the entry to our application starting the server, loading routes
fn main() {
    rocket::ignite().mount("/", routes![index, cheese]).launch();
}
```

- restart server and go to localhost:8000/cheese/munster

Now for one that uses a url query

```rust
// Macro for annotating our route methods
#[get("/cheese?<cheeseType>")]
fn queso(cheeseType: String) -> String {
    format!("So... you still like {} cheese!", cheeseType)
}
```

- restart the server and go to http://localhost:8000/cheese?cheeseType=gouda


#### Setting up a routes file

- create a new file called routes.rs and copy our existing route functions into it.

```rust
#![feature(proc_macro_hygiene, decl_macro)]

// IMPORT ROCKET LIBRARY

// Macro for annotating our route methods
#[get("/")]
pub fn index() -> &'static str {
    "Hello, world!"
}

// Macro for annotating our route methods
#[get("/cheese/<cheeseType>")]
pub fn cheese(cheeseType: String) -> String {
    format!("So... you like {} cheese!", cheeseType)
}

// Macro for annotating our route methods
#[get("/cheese?<cheeseType>")]
pub fn queso(cheeseType: String) -> String {
    format!("So... you still like {} cheese!", cheeseType)
}
```

- update the main.rs so it's pulling in routes from this file.

```rust
#![feature(proc_macro_hygiene, decl_macro)]

// IMPORT ROCKET LIBRARY
#[macro_use] extern crate rocket;

pub mod routes;

// our main function, the entry to our application starting the server, loading routes
fn main() {
    rocket::ignite().mount("/", routes![routes::index, routes::cheese, routes::queso]).launch();
}
```

#### Sending JSON Data

Let's test out sending JSON Data. We have to type our Json data as a serializable type (in this case a hashmap).

src/routes.rs

```rust
#![feature(proc_macro_hygiene, decl_macro)]
use rocket_contrib::json::Json;
use std::collections::HashMap;

// IMPORT ROCKET LIBRARY

// Macro for annotating our route methods
#[get("/")]
pub fn index() -> Json<HashMap<String, String>> {
    let mut my_map = HashMap::new();
    my_map.insert(String::from("cheese"), String::from("gouda"));
    my_map.insert(String::from("bread"), String::from("rye"));
    // turn hashmap into json and return it
    return Json(my_map);
}
```

Now run your server and go to localhost:8000 to see the json response!

## Connecting a Database

Update your Cargo.toml with the following libraries

```toml
[dependencies]
rocket = "0.4.7"
dotenv = "0.15.0"
serde = "1.0.124"
serde_json = "1.0.64"
serde_derive = "1.0.124"
postgres = "0.19.0"

[dependencies.rocket_contrib]
version = "0.4.7"
default-features = false
features = ["json", "serve"]
```

- Create a postgres table called rocketpeople `createdb rocketpeople`

- Hop on PSQL and create a table `psql rocketpeople` then `CREATE TABLE people (id SERIAL, name VARCHAR(100), age INTEGER);`

- Add some seed data `INSERT INTO people (name, age) VALUES ('Alex', 35), ('Bob', 50);`;

- create a .env file with the following:

```
DATABASE_STRING="user=test5 password=test5 dbname=rocketpeople sslmode=disable host=localhost port=5432"
```

Create a personroutes.rs with the following code to setup databases connections and CRUD routes.

```rust
use rocket_contrib::json::Json;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};
use postgres::{Client, NoTls, Error};
use dotenv::dotenv;
use std::env;

// CREATE STRUCT THAT IS SERIALIZABLE INTO JSON
#[derive(Serialize, Deserialize, Debug)]
pub struct Person {
    id: i32,
    name: String,
    age: i32
}

// CREATE FUNCTION TO ESABLISH DATABASE CONNECTION
fn getConn() -> Result<Client, Error> {
    // GET DATABASE URL ENV VARIABLE
    let uri;
    dotenv().ok();
    match env::var("DATABASE_STRING") {
        Ok(val) => uri = val,
        Err(_e) => uri = "none".to_string(),
    }
    print!("{}", uri);
    // return database connection
    return Client::connect(&uri, NoTls);
}

// INDEX ROUTE TO GET ALL PEOPLE
#[get("/")]
pub fn index() -> Json<Vec<Person>> {
    //declare vector to hold people
    let mut result: Vec<Person> = Vec::new();

    //query database and build vector
    match getConn(){
        Ok(val) => {
            let mut client = val;
            for row in client.query("SELECT * FROM people;", &[]).unwrap() {
                let id:i32 = row.get(0);
                let name: String= row.get(1);
                let age: i32 = row.get(2);
                result.push(Person { id, name, age});
            }
        },
        Err(err) => print!("{}", err),
    }
    
    // turn hashmap into json and return it
    return Json(result);
}

// CREATE ROUTE TO CREATE A NEW PERSON
#[post("/<name>/<age>",)]
pub fn create(name: String, age: i32) -> String {

    //insert new person into database
    match getConn(){
        Ok(val) => {
            let mut client = val;
            client.execute("INSERT INTO people (name, age) VALUES ($1, $2)",
            &[&name, &age]).ok();
        },
        Err(err) => print!("{}", err),
    }
    
    // return string denoting completion
    return String::from("Request Complete");
}

// UPDATE ROUTE TO UPDATE A PERSON
#[put("/<id>/<name>/<age>",)]
pub fn update(id: i32, name: String, age: i32) -> String {

    //insert new person into database
    match getConn(){
        Ok(val) => {
            let mut client = val;
            client.execute("UPDATE people SET name=$1, age=$2 WHERE id=$3;",
            &[&name, &age, &id]).ok();
        },
        Err(err) => print!("{}", err),
    }
    
    // return string denoting completion
    return String::from("Request Complete");
}

// DELETE ROUTE TO DELETE PEOPLE
#[delete("/<id>",)]
pub fn destroy(id: i32) -> String {

    //insert new person into database
    match getConn(){
        Ok(val) => {
            let mut client = val;
            client.execute("DELETE FROM people WHERE id=$1",
            &[&id]).ok();
        },
        Err(err) => print!("{}", err),
    }
    
    // return string denoting completion
    return String::from("Request Complete");
}
```

Notice we did use the request body to create and update database entries. This was cause to do so in Rocket you have to implement a custom FromBody trait on your Struct which was a little more complicated that necessary for this tutorial so I opted for using URL params instead.

Now, let's pull in some our recently added libraries and mount are new routes in our main.rs.

```rust
#![feature(proc_macro_hygiene, decl_macro)]

// IMPORT ROCKET LIBRARY
#[macro_use] extern crate dotenv;
#[macro_use] extern crate rocket;
#[macro_use] extern crate serde;
#[macro_use] extern crate serde_derive;
#[macro_use] extern crate serde_json;
#[macro_use] extern crate postgres;

pub mod routes;
pub mod personroutes;
use dotenv::dotenv;
use std::env;


// our main function, the entry to our application starting the server, loading routes
fn main() {


    let uri = env::var("DATABASE_URL");
    print!("{:?}", uri.ok());

    rocket::ignite()
    .mount("/", routes![routes::index, routes::cheese, routes::queso])
    .mount("/people", routes![personroutes::index, personroutes::create, personroutes::update])
    .launch();
}
```

#### Deployment

- create a file called `rust-toolchain` with the following

```
nightly
```

- create a file called `Procfile` with the following

```
web: ROCKET_PORT=$PORT ./target/release/personapi
```

- create a new heroku project `heroku create projectName`

- specify the buildpack `heroku buildpacks:set emk/rust`

This will work... to configure your heroku postgres:

- create a new heroku postgres

- use the terminal command within the database credentials (in the database settings) to get to the psql command line, add the table and some seed data.

- create a new config var DATABASE_STRING

```
"user=test5 password=test5 dbname=rocketpeople sslmode=require host=localhost port=5432"
```

At this point the only thing holding back the is TLS handshake. You have configure the TLS settings on the connect function specifically for Heroku. Haven't found any clear solution to this year, I'll update this article if I do. If you find one post it in a commment.