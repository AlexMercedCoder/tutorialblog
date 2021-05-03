---
title: Using Docker & Docker Compose to Create an Express/Neo4J Dev Environment(Intro to Graph Databases)
date: "2021-05-03T12:12:03.284Z"
description: The Joys of Docker
---

## Previous Content on Docker

- [Video: Intro to Docker](https://www.youtube.com/watch?v=Pmdwn97lmVA)
- [Video: Docker 101](https://www.youtube.com/watch?v=3107womjZIo)
- [Video: Using Neo4j Database using Docker](https://www.youtube.com/watch?v=EO041uKuUvI)
- [Video: Create a VSCode dev environment with Docker](https://www.youtube.com/watch?v=jHKevKjp9C8)
- [Blog: Building a C# API and Deploying to Heroku with Docker](https://tuts.alexmercedcoder.com/2021/3/dotnet5/)
- [Deploying a Deno App using Docker and Fly.io](https://www.youtube.com/watch?v=Fe4XdAiqaxI)

## What we will do

The beauty of Docker is being able to create isolated containers with our application. With Docker Compose we can orchestrate how these containers work with each other. Imagine having your app in one container and your database in another and making them communicate with each other in a uniform and easy-to-replicate way.

This is exactly what we'll do today.

- Create an express application and containerize it with Docker and Docker Compose
- Add a Graph Database with Neo4j
- Have our express app make calls to the database

## Setup

- Must have nodeJS, Docker, and Docker Compose installed 

- start a new folder and create the following folder structure and files

```
ROOT FOLDER
 -> /services
   -> /express
    -> Dockerfile
 -> docker-compose.yml
```

## Create the Express App

- Open your terminal in your express folder
- Create a new node project `npm init -y`
- install express `npm install express`
- in package.json add the `"type":"module"` property, this is only supported in newer versions of node
- also in package.json make sure there is a start script that reads `"start": "node server.js"`
- create a file called `server.js` with the following

```js
// import dependencies
import express from "express"

// create application object
const app = express()

//home route
app.get("/", (req, res) => {
    res.send("<h1>Hello World</h1>")
})

// Server Listener
app.listen(5000, () => console.log("listening on 5000"))
```

- test this out locally by running the command `npm start` and going to localhost:5000, once confirmed, turn off the server with ctrl+c

## Dockerizing Our Express App

So we will create a docker file that specifies how to set up our containerized environment for our node app. This will consist of...

- getting a base image
- setting a work directory (where the container is working from within itself)
- copy the of our project over (except node_modules)
- install dependencies
- specify an entrypoint command (command to run when the container is turned on)

1. create a `.dockerignore` file with the following in the express folder (works like `.gitignore` but for docker)

```
.env
/node_modules
```

2. create an entrypoint.sh file in the express folder with the following

```bash
#!/bin/sh

# The comment abode is a shebang that tells the OS which binary to run the script with

# The exec command below is how this script should end so it goes back and executes the command specified in the docker-compose.yml file
exec "$@"
```

3. make the entrypoint.sh executable by running `chmod +x entrypoint.sh`

4. Put the following in the `dockerfile` in the express folder

```dockerfile
# Base image to start from
# A node image using the latest version using Alpine Linux 3.11
FROM node:current-alpine3.11

# Set the Working Directory the Containers Terminal Starts from
WORKDIR /usr/src/app

# Copy Project Over from this folder "." to "/usr/src/app/" in the container
COPY . /usr/src/app/

# install dependencies
RUN npm install

# Kick start the container with the entrypoint script
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
```

5. create a `.env.express` file in the root folder

6. add the following to docker-compose.yml

```yml
version: '3.7'

# The different services that make up our "network" of containers
services:
    # Express is our first service
    express:
        # The location of dockerfile to build this service
        build: ./services/express
        # Command to run once the Dockerfile completes building
        command: npm start
        # Volumes, mounting our files to parts of the container
        volumes:
            - ./services/express:/usr/src/app/
        # Ports to map, mapping our port 5000, to the port 5000 on the container
        ports: 
            - 5000:5000
        # designating a file with environment variables
        env_file:
            - ./.env.express
```

7. Open terminal up to the root folder and run the command `docker-compose up --build` this tells Docker to build the network detailed in the docker-compose.yml and build any images specified in the different services.

8. Go to localhost:5000 and double-check we still get our hello world.

9. in a separate terminal in the same folder, let's turn off the containers and remove their volumes `docker-compose down -v`

## Setting Up Neo4j

- Update `docker-compose.yml`

```yml
version: '3.7'

# The different services that make up our "network" of containers
services:
    # Express is our first service
    express:
        # The location of dockerfile to build this service
        build: ./services/express
        # Command to run once the Dockerfile completes building
        command: npm start
        # Volumes, mounting our files to parts of the container
        volumes:
            - ./services/express:/usr/src/app/
        # Ports to map, mapping our port 5000, to the port 5000 on the container
        ports: 
            - 5000:5000
        # designating a file with environment variables
        env_file:
            - ./.env.express
        # Tell docker this container depends on the neo service so they can communicate, the neo4j server will be located at neo:7474
        depends_on:
            - neo
    ## Defining the Neo4j Database Service        
    neo:
        # The image to use
        image: neo4j:latest
        # map the ports so we can check the db server is up
        ports: 
            - 7474:7474
            - 7687:7687
        # mounting a named volume to the container to track db data
        volumes:
            - neo4j_data:/data/
        env_file:
            - .env.neo4j

## volumes to be generated, these are saved somewhere for repeated use by docker
volumes:
    neo4j_data:
```

2. create a `.env.neo4j` file in the root with the following:

```
NEO4J_AUTH=none
```

3. Rebuild our network `docker-compose up --build`

4. Head over to localhost:7474 and you should see the neo4j browser page and select "no authentication" and login to the default database

5. At the top of the screen is a bar to enter queries using the Cypher Query Language (CQL).

- create a node `CREATE(result: Person{name:"Alex Merced",age:35}) RETURN result;` (This will create a person node)

- create another node `CREATE(result: Activity{name: "coding"}) RETURN result`

- create an edge(relationship) between the two nodes `MATCH(p:Person),(a:Activity) WHERE p.name = 'Alex Merced' AND a.name = 'coding' CREATE (p)-[relationship:likes]->(a) RETURN type(relationship);`

- Let's search for the person again `Match(p:Person) Where p.name='Alex Merced' Return p;`

- Now with the person node visible you can hover over it and click on the icon to see its edges and you'll see Alex Merced "likes" Coding. Welcome to the world of Graph Databases!

- Use CTRL + C to turn off your containers, no need to remove the volumes so our nodes will still exist when we turn them back on!

## Using Neo4j in Express

- open your terminal to the express folder and install the neo4j drivers `npm install neo4j-driver`

- update server.js like so!

```js
// import dependencies
import express from "express";
import neo4j from "neo4j-driver";

// create application object
const app = express();

// connect to data
const db = neo4j.driver("bolt://neo:7687");

//home route
app.get("/", async (req, res) => {
  const result = await db
    .session({
      database: "neo4j",
      defaultAccessMode: neo4j.session.WRITE,
    })
    .run("Match(p:Person) Where p.name='Alex Merced' Return p;");
  res.json(await result);
});

// Server Listener
app.listen(5000, () => console.log("listening on 5000"));
```

- run your container and see if you see your query on localhost:5000

YOU DID IT! You set up a network with a node application and neo4j database using Docker!

- [Final Code in this Repo for Reference](https://github.com/Alex-Merced-Templates/docker_template_node_neo4j)
- [Read the Neo4J Driver Docs to do More](https://neo4j.com/docs/api/javascript-driver/4.2/)
- [Read up CQL](https://neo4j.com/developer/cypher/style-guide/)