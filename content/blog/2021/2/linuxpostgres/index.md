---
title: Understanding Postgres on Linux
date: "2021-02-14T12:12:03.284Z"
description: The Little Things that May not be obvious
---

## Installing Postgres

Installing PostgreSQL is pretty straight-forward on Linux, just follow a tutorial like this one:

- [Installing Postgres on Ubuntu 20.04](https://www.digitalocean.com/community/tutorials/how-to-install-postgresql-on-ubuntu-20-04-quickstart)

Where I confused the first time around was why certain things worked the way they did so this post is to help address some of those issues.

### The Postgres User

When you first install Postgres on Linux it creates a new Linux user called Postgres with superuser privileges. Why does this matter?

- When you run "psql" command to run the Postgres shell, it defaults to opening the shell under a username that matches the current Linux users and opens a database by the same name. Unless you installed Linux and your first user was called "postgres" then this command is going to give you an error.

To fix this issue we need to switch over to the postgres user.

```sudo su postgres```

### Creating a New User and Database

Once you are working in the terminal under the postgres user do the following.

1. enter the postgres shell ```psql```

2. create a new superuser ```CREATE USER <YourLinuxUsername> WITH SUPERUSER PASSWORD "somepassword";```

3. create a new database ```CREATE DATABASE <YourLinuxUsername>;```

4. quit postgres ```\q```

### Port 5432

The default port for postgres is 5432 in the same way the default port for mongo is 27017.

### Other Notes

- Postgres drivers in many languages are compiled from source by the package manager, if installing the database drivers in that language fail, you may need to download Xcode on mac or install python3-dev libpq-dev on Linux. 

- On PHP you need to find your PHP installs php.ini and uncomment the pg drivers

- Your local postgres connection URL will look like: `postgres://USERNAME:PASSWORD@localhost:5432/databasename` (unlike Mongo, the database does need to be created before you can connect to it)

- [POSTGRES COMMANDS](https://www.postgresqltutorial.com/postgresql-cheat-sheet/)