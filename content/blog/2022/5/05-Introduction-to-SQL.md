---
title: A 2022 Introduction to SQL
date: "2022-05-13"
description: "Learning Structured Query Language"
author: "Alex Merced"
category: "database"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - backend
  - SQL
  - database
---

## What is SQL?

SQL stands for "Structured Query Language". A language created in 1974 for expressing queries to relational databases.

SQL isn't like general purpose programming languages which are generally interpreted or compiled into machine language for execution. SQL instead is a declarative abstraction over the APIs of different data sources.

For example if I create a table with the following SQL Statement.

`CREATE TABLE cheese (name VARCHAR(50), origin VARCHAR(50));`

We know that this creates a table, but how this is achieved will be different based on the actual database this is sent to. This abstraction allows us to express common access patterns to different databases without having to know how each of them work under the hood.

## Where can I use SQL?

SQL can of course be used in a variety of relational databases such as:
- PostgreSQL
- Microsoft SQL
- mySQL
- SQLite3
- MariaDB
- Many Many more

But beyond these transactional databases, SQL can be used in Data Warehouses, Lakehouse Query Engines, and in many other contexts as SQL continues to expand its use cases particularly in the Data Analytics world.


## Let's Take a Spin!

We'll be created an SQLite3 REPL at Replit.com for us try and practice SQL. Fork this REPL here.

[Create Fork of this REPL to follow the exercises in this tutorial](https://replit.com/@AlexMercedCoder/LearnSQL#)

After forking, make sure you are on the "shell" tab not the "console" tab as we will use this as it would be from the terminal.

SQLite3 is uniqe in that instead of having one large database server that manages all your databases like PostgresQL and MySQL, SQLite3 instead saves each database as a file. This makes SQLite3 a great candidate for learning SQL, working in a develop environment and other use cases (Often, in production application you'll opt for a Database server like PostgreSQL or MySQL).

To open a database with SQLite3 the command is:

`sqlite3 <database name>`

We will open the learn.sql database that should already be in the REPL.

`sqlite3 learn.sql`

You should note the shell prompt has changed to `sqlite>` this confirms that we are now in sqlite.

Data in a relational database is organized into tables which look like a spreadsheet you may have seen in Excel or Google Sheets. In these tables, each column is a field representing a piece of information (name, age). Each row in a table is a record that defines a value for each field (Bob is 24).

## Creating a Table

When we create a table we need to define all fields and the type of data they will hold, every database may have different data types. [Here](https://www.sqlite.org/datatype3.html) is the list of types in SQLite3.

Let's create a simple table to track dogs.

`CREATE TABLE dogs (name TEXT, age INT);`

Couple of things to notice:
- Certain words are in all caps, this is not required but common practice to distinguish SQL keywords from user defined values.
- All SQL statements MUST end in a semi-colon and if it's forgotten will wait for a semi-colon to be given.
- In the parenthesis we are defining the different columns in the dogs table.

Each database has their own commands that go beyond SQL. If I wanted to list all the tables currently in this database I'd enter the following command.

`.tables`

You should see the dogs table we just created and a pre-existing text table. Although if this were postgres we would use the command `\dt` to display all tables. So try to be cognisant that different tables will have differnt command outside of the SQL language (even some differences in their SQL as well, usually minor).

## Inserting Data

To add data to that table we will use `INSERT INTO` statements like so:

`INSERT INTO dogs (name, age) VALUES ('Spot', 6), ('Biff', 8);`

Things to notice:
- The parenthesis after the table name is used to specify which fields you'll provide data for.
- Each parenthesis after the `VALUES` keyword represents one record to be added with values in the order specified earlier in the statement.
- Text values must be surrounded by single quotes not double quotes.

## Querying Data

To fetch data from the database we use `SELECT` statements.

We can get all the records showing all columns with this query:

`SELECT * FROM dogs;`

We can get all records but only the name column with this query:

`SELECT name FROM dogs;`

You can select a particular record like so:

`SELECT * FROM dogs WHERE name = 'Spot';`

## Learning More

This gives you a small taste of SQL and how you can add retrieve data from a database using it.

To learn more watch this video playlist where I go deeper into SQL.

[Video Playlist](https://www.youtube.com/playlist?list=PLY6oTPmKnKbb8R-o64IT1vLp5mUTXUuyx)

Then checkout SQLZoo to continue practices and learning more keywords:

[SQLZoo](https://sqlzoo.net/wiki/SQL_Tutorial)