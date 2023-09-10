---
tags:
  - "database"
  - "web development"
  - "python"
author: "Alex Merced"
title: "Building Full CRUD Rest API's with Flask & FastAPI using PsychoPG2"
date: "2023-09-10T12:12:03.284Z"
category: "web development"
bannerImage: "https://i.imgur.com/nc4bdok.png"
---

## Introduction

When it comes to building web applications in the modern era, developers are spoilt for choice with a plethora of frameworks and libraries at their disposal. Among them, Flask and FastAPI have emerged as two of the most efficient and adaptable Python frameworks for crafting web APIs. While Flask is renowned for its simplicity and ease of use, FastAPI has gained traction for its lightning-fast speeds and Pythonic async capabilities. However, beyond the web framework lies another critical decision point: how to interact with the database.

Enter Psycopg2 - a PostgreSQL adapter for Python and a favorite among developers who prioritize speed, reliability, and direct database access. But why would one opt for a database driver like Psycopg2 over the convenience of Object-Relational Mapping (ORM) tools like SQLAlchemy or DjangoORM?

- **Performance**: Database drivers, being closer to the metal, often offer better performance than ORMs. This is particularly evident in large-scale applications where even marginal efficiency gains can have significant impacts. While ORMs introduce an abstraction layer that can slow down raw database operations, direct drivers like Psycopg2 allow for optimized queries that can be tailored for specific performance needs.

- **Flexibility**: Direct database drivers grant developers the ability to write custom SQL queries. This means you're not limited by the constructs or conventions of an ORM, providing flexibility in handling complex scenarios, data migrations, or non-standard CRUD operations.

- **Transparency**: With a database driver, you see and control the exact SQL queries that are sent to the database. This level of transparency can be crucial for debugging, optimization, and understanding the underpinnings of your database operations.

- **Database-specific features**: PostgreSQL, for instance, offers several advanced features that may not be readily available or easy to implement via generic ORMs. By using Psycopg2, developers can leverage these features to their full extent.

While ORMs like SQLAlchemy or DjangoORM bring convenience and rapid development capabilities to the table, especially for beginners or for applications where database complexities are minimal, there's no denying the power and flexibility that comes with a dedicated database driver like Psycopg2. As we delve into building full CRUD APIs with Flask and FastAPI, we'll explore the synergies of these technologies, ensuring robust, efficient, and scalable solutions for your web applications.

## Setup

- Get a postgres database URL, simplest solution is get a free account at NEON.TECH or similiar service (running a local postgres server by installing postgres or using a docker image is also an option).

- Navigate to a blank folder in your IDE.

- Create a virtual environment `python -m venv venv`

- Activate virtual environment `source ./venv/bin/activate`

- Install necessary libraries `pip install flask fastapi python-dotenv psycopg2-binary uvicorn`

- create a .env file with the following

```shell
DATABASE_URL=postgres://postgres:postgres@localhost:5432/xxxxxx
```

- Make sure the url reflects your actual postgres database URL

* create a .gitignore file with the following

```shell
.env
/venv
```

## Create a Function For Running our SQL Statements

Using raw database drivers to write every query can be quite tedious as we would have to write out the following steps over and over again:

- Establishing a connection to the database
- Creating a database cursor (which allows us to search the database)
- Run an SQL query with the cursor
- Use the cursor to fetch all the rows from the results

So instead of doing this repetitive work we will create a function that abstracts away everything but the actual query.

- Create a file called sql.py with the following:

```py
import os
import psycopg2
from psycopg2.extras import DictCursor

def run_query(sql, params=None):
    DATABASE_URL = os.environ.get('DATABASE_URL')

    # Ensure DATABASE_URL exists
    if not DATABASE_URL:
        raise ValueError("The DATABASE_URL environment variable is not set.")

    # Establish connection
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute(sql, params)

            # If the SQL command is a SELECT statement, fetch the results
            if cur.description:
                return cur.fetchall()
            else:
                return None

# Example:
# Assuming DATABASE_URL is set and points to a valid PostgreSQL instance
# results = run_query("SELECT * FROM table_name WHERE id = %s", [1])
# print(results)
```

## The Flask API

To create a full crud Flask API for a "CITY" model would look like this (create a file called flask-api.py):

```python
from flask import Flask, request, jsonify
import os
from dotenv import load_dotenv
from sql import run_query

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Run this at the start to ensure the table exists
def create_table():
    create_table_query = """
    CREATE TABLE IF NOT EXISTS city (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        state VARCHAR NOT NULL
    );
    """
    run_query(create_table_query)

create_table()

## CREATE ROUTE
@app.route('/cities', methods=['POST'])
def add_city():
    data = request.get_json()
    query = "INSERT INTO city (name, state) VALUES (%s, %s) RETURNING id;"
    result = run_query(query, [data['name'], data['state']])
    return jsonify({"id": result[0]['id']}), 201

## INDEX ROUTE
@app.route('/cities', methods=['GET'])
def get_cities():
    query = "SELECT * FROM city;"
    results = run_query(query)
    ## Use Dict Comprenhension to convert the results to a list of dictionaries (id, name, state)
    results = [{'id': result['id'], 'name': result['name'], 'state': result['state']} for result in results]
    return jsonify(results)

## SHOW ROUTE
@app.route('/cities/<int:city_id>', methods=['GET'])
def get_city(city_id):
    query = "SELECT * FROM city WHERE id = %s;"
    result = run_query(query, [city_id])
    if not result:
        return jsonify({"error": "City not found"}), 404
    ## Convert result into dictionary (id, name, state)
    result = [{'id': result[0]['id'], 'name': result[0]['name'], 'state': result[0]['state']}]
    return jsonify(result)

## UPDATE ROUTE
@app.route('/cities/<int:city_id>', methods=['PUT'])
def update_city(city_id):
    data = request.get_json()
    query = "UPDATE city SET name = %s, state = %s WHERE id = %s;"
    run_query(query, [data['name'], data['state'], city_id])
    return jsonify({"message": "City updated successfully"})

## DELETE ROUTE
@app.route('/cities/<int:city_id>', methods=['DELETE'])
def delete_city(city_id):
    query = "DELETE FROM city WHERE id = %s;"
    run_query(query, [city_id])
    return jsonify({"message": "City deleted successfully"})

if __name__ == '__main__':
    app.run(debug=True)
```

run `python flask-api.py` and try all the crud routes using the `localhost:5000/cities` endpoint

## The Fast-API full CRUD API

Creat a file called fastapi-api.py with the following:

```py
from fastapi import FastAPI, HTTPException
from sql import run_query
from typing import List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

## Pydantic Model for Cities without ID (data for creating a City)
class City(BaseModel):
    name: str
    state: str

## Pydantic Model for Cities with ID (data for showing a City from DB)
class CityInDB(City):
    id: int

## Create the table if it doesn't exist
@app.on_event("startup")
async def startup_event():
    # Create the CITY table if it doesn't exist
    create_table_query = """
    CREATE TABLE IF NOT EXISTS city (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        state VARCHAR NOT NULL
    );
    """
    run_query(create_table_query)

## CREATE ROUTE
@app.post("/cities/", response_model=CityInDB)
async def create_city(city: City):
    insert_query = "INSERT INTO city (name, state) VALUES (%s, %s) RETURNING id;"
    results = run_query(insert_query, (city.name, city.state))
    return {"id": results[0]["id"], "name": city.name, "state": city.state}

## INDEX ROUTE
@app.get("/cities/", response_model=List[CityInDB])
async def list_cities():
    select_query = "SELECT * FROM city;"
    result = run_query(select_query)
    ## Convert result into a list of cities
    result = [CityInDB(id=city[0], name=city[1], state=city[2]) for city in result]
    return result

## SHOW ROUTE
@app.get("/cities/{city_id}", response_model=CityInDB)
async def read_city(city_id: int):
    select_query = "SELECT * FROM city WHERE id = %s;"
    results = run_query(select_query, (city_id,))
    if not results:
        raise HTTPException(status_code=404, detail="City not found")
    ## Convert the results to a city in DB object
    return CityInDB(id=results[0][0], name=results[0][1], state=results[0][2])


## UPDATE ROUTE
@app.put("/cities/{city_id}", response_model=CityInDB)
async def update_city(city_id: int, city: City):
    update_query = "UPDATE city SET name = %s, state = %s WHERE id = %s RETURNING id, name, state;"
    results = run_query(update_query, (city.name, city.state, city_id))
    if not results:
        raise HTTPException(status_code=404, detail="City not found")
    return results[0]


## DELETE ROUTE
@app.delete("/cities/{city_id}", response_model=CityInDB)
async def delete_city(city_id: int):
    delete_query = "DELETE FROM city WHERE id = %s RETURNING id, name, state;"
    results = run_query(delete_query, (city_id,))
    if not results:
        raise HTTPException(status_code=404, detail="City not found")
    return results[0]

## Start the Server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

Run with `python fastapi-api.py` and test out the routes using `localhost:8000/cities`.

## Conclusion

Choosing the right tools can significantly impact the efficiency, scalability, and maintainability of your applications. This article illuminated the power of combining Flask and FastAPI with a robust database driver like Psycopg2, showcasing the synergy between performance, flexibility, and direct control over database operations. While ORMs like SQLAlchemy and DjangoORM undoubtedly have their merits and are preferred in many scenarios, working with Psycopg2 allows developers to tap into raw database performance, especially when handling complex queries and operations. By setting up our own CRUD APIs, we've seen firsthand the streamlined process of using Psycopg2 with Flask and FastAPI, proving that with the right tools and knowledge, developers can build high-performance web applications that stand out in the crowd. Whether you're a seasoned developer or just starting out, the combination of these tools offers a compelling way to tackle modern web challenges. Embrace the tools, experiment, and continue to enhance your developer toolkit for the evolving demands of the web.
