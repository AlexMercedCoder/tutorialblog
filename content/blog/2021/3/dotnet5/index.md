---
title: Intro to .Net 5 with VSCode - Zero to Deploy
date: "2021-03-11T12:12:03.284Z"
description: Microsoft Goes Cross Platform
---

.Net is Microsoft's platform for application development and for a long time it has been a "Windows Only" platform. With .Net 5, Microsoft is going cross-platform enabling dotnet development in Linux and MacOS. This makes sense since Microsoft's bread and butter is no longer operating systems but the cloud, and more developers using their development platform will increase the added value of their cloud platform.

## prerequisites

- dotnet 5 or above installed (check with `dotnet --version`)
- VSCode installed with the .Net Extension Pack
- Docker (for deployment)
- Heroku CLI (for deployment)

**Using VSCODE's Remote-Container extension you can just spin-up a folder to run in a dockerized .net environment saving you a lot of the hassles on installing especially on Linux**

## Starting up a New Project

.Net can create a wide variety of applications, and you can see the full list of templates with the command `dotnet new --list`. We will be using their web framework, ASP.NET, to build an API.

- run the command `dotnet new webapi -o firstapi`

- cd in the folder and install the following packages:

```
dotnet add package Microsoft.AspNetCore.Mvc.Core --version 2.2.5
dotnet add package Microsoft.AspNetCore.Http.Features --version 5.0.4
dotnet add package EntityFramework --version 6.4.4
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL --version 5.0.2
dotnet add package Microsoft.EntityFrameworkCore.Design --version 5.0.4
```

_ASP.NET CORE is the Web Framework and Entity Framework is the Database ORM_

- create a .gitignore with the following

```
appsettings.json
/obj
/bin
```

###### Trouble shooting

If you get an error that looks like this on debian/ubuntu

`The author primary signature's timestamp found a chain building issue: UntrustedRoot: self signed certificate in certificate chain`

- then edit using the file /etc/ca-certificates.conf

- uncomment (remove !) this line `mozilla/VeriSign_Universal_Root_Certification_Authority.crt`

- the update your certs with command `sudo update-ca-certificates`

##### SSL Certificates

- If you are mac and windows run the command `dotnet dev-certs https --trust`

- If you are on Linux you may want to run this script [Here](https://blog.wille-zone.de/post/aspnetcore-devcert-for-ubuntu)

This will allow a local SSL certificate to be signed for development purposes

### Back to our regularly scheduled programming

- cd into the new firstapi folder

- reopen vscode in this folder, VSCode should pick up on that it's a .net project and you should be able to run it with the debugger (make sure you choose the code/dotnet runtime if it asks) you could also use the command `dotnet run` to run it from terminal.

- The website will be served on localhost:5001 (https) and localhost:5000(http), by default it will redirect to the https url.

The Main file for everything is the Startup.cs in the root of the project:

```cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi.Models;

namespace firstapi
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {

            services.AddControllers();
            services.AddSwaggerGen(c =>
            {
                c.SwaggerDoc("v1", new OpenApiInfo { Title = "firstapi", Version = "v1" });
            });
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // This is a default dev route that may or may not work
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
                app.UseSwagger();
                app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "firstapi v1"));
            }

            app.UseHttpsRedirection(); //comment this out to stop redirection

            app.UseRouting(); // tells servers to match url with endpoint

            app.UseAuthorization(); // enables auth when desired

            // This Middleware here is where we will configure our routes
            app.UseEndpoints(endpoints =>
            {
                /////////////////////////////////////
                // ADD THIS - Routing
                ////////////////////////////////////

                // This is for attribute routing
                endpoints.MapControllers();
                // This is for Pattern Routing
                endpoints.MapControllerRoute(
                name: "default",
                pattern: "{controller=Home}/{action=Index}/{id?}");
                });

        }
    }
}
```

This route is our default route and it will match the following pattern

```cs
pattern: "{controller=Home}/{action=Index}/{id?}");
```

So it will look for a controller by the name of the first part of the url, in that controller an action by that name, then an id parameter if it exists.

Let's try it out, in the controller folder create a file called HelloWorldController.cs

```cs
using Microsoft.AspNetCore.Mvc;
using System.Text.Encodings.Web;
using System.Collections;

namespace firstapi.Controllers
{
    public class HelloWorldController : Controller
    {
        //
        // GET: /HelloWorld/

        public Hashtable Index()
        {
            // Returns a hashtable which will be serialized as json
            return new Hashtable(){{"Hello", "World"}};
        }

    }
}
```

- restart or start the server and head to localhost:5000/HelloWorld/

- let's add another action in the controller

```cs
        // Since our route pattern includes a pattern called ID we can receive it as a parameter to our action
        public Hashtable Another(int id)
        {

            return new Hashtable(){{"Hello", id}};
        }
```

- restart your server and visit localhost:5000/HelloWorld/Another/5

## Creating a Model

Let's create a model class before we connect to a database...

- create a folder called Models

- In that folder create a Person.cs

```cs
namespace firstapi.Models
{
    public class Person
    {
        public long Id { get; set; }
        public string Name { get; set; }
        public int age { get; set; }
    }
}
```

#### Adding a Database Context

The database context will help interface our model with the database, in the Models folder create a PersonContext.cs.

```cs
using Microsoft.EntityFrameworkCore;

namespace firstapi.Models
{
    public class PersonContext : DbContext
    {
        public PersonContext(DbContextOptions<PersonContext> options) : base(options)
        {
        }

        public DbSet<Person> TodoItems { get; set; }
    }
}
```

Now we need to add our URL Connection to our appsettings.json

```json
  "DBContextSettings": {
    "ConnectionString": "User ID=test5;Password=test5;Host=localhost;Port=5432;Database=firstdotnet;Pooling=true;"
  }
```

_make sure to create your database `createdb firstdotnet_

Then we need to add our database connection as a service in the ConfigureServices method in Startup.cs

Startup.cs

```cs
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.OpenApi.Models;
using firstapi.Models;
using Microsoft.EntityFrameworkCore;

namespace firstapi
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {

            services.AddControllers();

            // Setup our datanase connection string and add our database connection
            var connectionString = Configuration["DbContextSettings:ConnectionString"];
            services.AddDbContext<PersonContext>(opt => opt.UseNpgsql(
                connectionString));

            services.AddSwaggerGen(c =>
            {
                c.SwaggerDoc("v1", new OpenApiInfo { Title = "firstapi", Version = "v1" });

            });
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
                app.UseSwagger();
                app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "firstapi v1"));
            }

            app.UseHttpsRedirection();

            app.UseRouting();

            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                // This is for attribute routing
                endpoints.MapControllers();
                // This is for Pattern Routing
                endpoints.MapControllerRoute(
                name: "default",
                pattern: "{controller=Home}/{action=Index}/{id?}");
            });
        }
    }
}
```

#### Build Our Migrations

Make sure you have the dotnet-ef tool installed

```
dotnet tool install --global dotnet-ef
```

- `dotnet ef migrations add InitialCreate` will create the migration

- `dotnet ef database update`

To update just make another migration (it'll figure everything out), then run the migration with the above command, easy!

#### Creating a Person Controller

Let's create a new controller and use the constructor to add our database connection via the PersonContext we created, we will call it People.

```cs
using firstapi.Models;
namespace firstapi.Controllers
{
    public class PersonController
    {
        private readonly PersonContext People;

        public PersonController(PersonContext people){
            People = people;
        }
    }
}
```

Now let's use Attribute Routing (We used Pattern Routing Earlier) to create a traditional set of CRUD Routes.

```cs
using firstapi.Models;
using System.Collections.Generic;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using System.Linq;

namespace firstapi.Controllers
{
    [Route("people")] // designate controller for "/people" endpoints
    public class PersonController
    {

        // declare property to hold Database Context
        private readonly PersonContext People;

        // define constructor to receive databse context via DI
        public PersonController(PersonContext people){
            People = people;
        }

        [HttpGet] // get request to "/people"
        public IEnumerable<Person> index(){
            // return all the people
            return People.Persons.ToList();
        }

        [HttpPost] // post request to "/people"
        public IEnumerable<Person> Post([FromBody]Person person){
            // add a person
            People.Persons.Add(person);
            // save changes
            People.SaveChanges();
            // return all the people
            return People.Persons.ToList();
        }

        [HttpGet("{id}")] // get requestion to "people/{id}"
        public Person show(long id){
            // return the specified person matched based on ID
            return People.Persons.FirstOrDefault(x => x.Id == id);
        }

        [HttpPut("{id}")] // put request to "people/{id}
        public IEnumerable<Person> update([FromBody]Person person, long id){
            // retrieve person to be updated
            Person oldPerson = People.Persons.FirstOrDefault(x => x.Id == id);
            //update their properties, can also be done with People.Persons.Update
            oldPerson.Name = person.Name;
            oldPerson.age = person.age;
            // Save changes
            People.SaveChanges();
            // return updated list of people
            return People.Persons.ToList();
        }

        [HttpDelete("{id}")] // delete request to "people/{id}
        public IEnumerable<Person> destroy(long id){
            //retrieve existing person
            Person oldPerson = People.Persons.FirstOrDefault(x => x.Id == id);
            //remove them
            People.Persons.Remove(oldPerson);
            // saves changes
            People.SaveChanges();
            // return updated list of people
            return People.Persons.ToList();
        }

    }
}
```

- run your server, test it all out! Feel good and then let's get on with deployment!

## Deployment

Heroku doesn't natively support dotnet projects, but anything can be hosted on Heroku via a Docker Container.

- [This Blog Post will be big Inspiration for the Instructions Below](https://dev.to/alrobilliard/deploying-net-core-to-heroku-1lfe)

#### Making Our Container

1. Create a `.dockerignore` file with the follow:

```
bin/
obj/
```

2. Create a `Dockerfile` file with the following

```ruby
# Dockerfile
# This grabs an image to copy over our source code and build
FROM mcr.microsoft.com/dotnet/sdk:5.0 AS build-env
WORKDIR /app

# Copy csproj and restore as distinct layers
# copies over our project and install all dependencies
COPY *.csproj ./
RUN dotnet restore

# Copy everything else and build
# Publishes our final project to /out
COPY . .
RUN dotnet publish -c Release -o out

# Build runtime image
# We will copy our compiled code into this container for running it
FROM mcr.microsoft.com/dotnet/aspnet:5.0
WORKDIR /app
COPY --from=build-env /app/out .

# Run the app on container startup
# Use your project name for the second parameter
# e.g. MyProject.dll
ENTRYPOINT [ "dotnet", "firstapi.dll" ]
```

- to build your docker image run `docker build -t firstdotnetapi .` make sure not to forget the period at the end of the command and just wait, this will take a while (unless you've done this before it has to download all the containers to do all the things)

- if you want to test it out, run command `sudo docker run -d -p 8080:80 --name myapi firstdotnetapi1` and your api will be visible on port 8080

- turn off the container with the command `docker rm --force abc`

#### Getting Our Container on Heroku

- create a new app at heroku.com, make sure you know its name, mine is `firstdotnetapiam`

- with the heroku cli login to the heroku container repository, `heroku container:login`

- then push the container to your project `heroku container:push -a firstdotnetapiam web` notice I used the name of the heroku project followed by web so it knows it's a web application

- once that is done, release the site with this command `heroku container:release -a firstdotnetapiam web`

- go the website and it should still not be working, mainly cause we need to make sure our is able to receive its port assignment from Heroku but we'll take care of our database while we're at it.

##### Setting Up the Database

- on your project dashboard on Heroku provision a Postgres database

- go to the database dashboard and get the database credentials and update your connection string in appsettings.json, should look like this (notice the extra settings).

```json
    "ConnectionString": "User ID=yourherokudata;Password=yourherokudata;Host=yourherokudata;Port=5432;Database=yourherokudata;Pooling=true;SSL Mode=Require;TrustServerCertificate=True;"
```

- run `dotnet ef database update` to migrate your heroku db

- update your Dockerfile so we pass the Heroku config var in the startup command and migrate our database
# Dockerfile

```ruby
FROM mcr.microsoft.com/dotnet/sdk:5.0 AS build-env
WORKDIR /app

# Copy csproj and restore as distinct layers
COPY *.csproj ./
RUN dotnet restore

# Copy everything else and build
COPY . .
RUN dotnet publish -c Release -o out

# Build runtime image
FROM mcr.microsoft.com/dotnet/aspnet:5.0
WORKDIR /app
COPY --from=build-env /app/out .

# Run the app on container startup
# Use your project name for the second parameter
# e.g. MyProject.dll
#ENTRYPOINT [ "dotnet", "firstapi.dll" ]
CMD ASPNETCORE_URLS=http://*:$PORT dotnet firstapi.dll
```

- rebuild container

- push image

- release image... and you're good!!!