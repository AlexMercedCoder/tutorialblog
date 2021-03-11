---
title: API With Java Spring & VSCode, from zero to deploy
date: "2021-03-09T12:12:03.284Z"
description: Using Javas Most Popular Framework
---

Java is one of the most popular programming languages of all time and Spring one of its most popular frameworks for building all types of applications including a web application. In this tutorial, we will build a very basic API using VSCode as our editor.

## Prerequisites

- Java openJDK 11 or higher
- VSCode
- VSCode Extension: Java Spring Extension Pack
- Any Java Extensions for Syntax Highlighting
- Postgres 12 of higher installed and running

## Initializing a New Project

- In the command palette select "initialize new Maven Project" (Maven is a Project Management tool similar to NPM for Node)

- Select a Spring Version, I'm selecting 2.4.3

- Select a Language (Java, Kotlin or Groovy): I'm selecting Java!

- Put in a groupID, I'm just using my name with a . "alex.merced"

- Put in a projectID, I kept the default, "demo"

- choose Jar as packaging type

- chose Java Version 11

- Select the Spring Web dependencies which allow us to build a web application

- select PostgreSQL Driver for connecting to postgres

- Spring Data JPA to act as our ORM

- generate the project into an empty folder

#### Databse Settings

add the following settings to src/main/resources/application.properties

```yaml
# Database Settings
spring.datasource.url=jdbc:postgresql://localhost:5432/javaspringtest
spring.datasource.username=test5
spring.datasource.password=test5

# The SQL dialect makes Hibernate generate better SQL for the chosen database
spring.jpa.properties.hibernate.dialect = org.hibernate.dialect.PostgreSQLDialect

# Hibernate ddl auto (create, create-drop, validate, update)
# Allows for auto creation of tables
spring.jpa.hibernate.ddl-auto = update
```

#### The Application

The Application is found in src/main/java/alex/merced/ (may be different depending on what you chose as groupID). In this folder I see a folder called demo (or whatever your projectID was), this folder has the file that initializes your application.

We want to create some controllers so in this folder (for me src/main/java/alex/merced/demo) create a controllers folder.

In the controllers folder create a file called Controller.java which should autogenerate to...

```java
package alex.merced.demo.controllers;

public class Controller {

}
```

Let's make a most basic route like so...

```java
package alex.merced.demo.controllers;

//Imports, vscode should auto add these as needed
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

//This annotation tells Spring this is a RestAPI Controller
@RestController
public class Controller {

    // This tells spring this function is a route for a get request to "/"
    @RequestMapping(value="/", method=RequestMethod.GET)
    public String Hello() {
        // The response will include the return value
        return "Hello World";
    }

}
```

After this, you should be able to hit f5 to run your application and visit it on localhost:8080

#### Creating an Entity

In the same folder that the DemoApplication.java and the controllers folder live, let's create an entity folder. Entities are just model classes that we'll use to interact with the database. Hibernate/JPA will create the tables based on the entity for us (after we later create a repository).

entities/Person.java

```java
package alex.merced.demo.entities;

import javax.persistence.Entity;
import javax.persistence.GeneratedValue;
import javax.persistence.GenerationType;
import javax.persistence.Id;

@Entity
public class Person {
    
    // MODEL ID FIELD
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    //Model Specific Properties
    public String name;
    public Integer age;

    //constructor
    public Person (){

    }

    public Person(String name, Integer age){
        this.name = name;
        this.age = age;
    }

    //getters

    public Long getId(){
        return this.id;
    }

    public String getName(){
        return this.name;
    }

    public Integer getAge(){
        return this.age;
    }

    //setters

    public void setId(Long id){
        this.id = id;
    }

    public void setName(String name){
        this.name = name;
    }

    public void setAge(Integer age){
        this.age = age;
    }


}
```

## Creating a Repository

So the entity acts as the schema for our data, now the repository will act as the interface between our code and the table. Create a new folder demo/repositories and create a file in there called PersonRepository.java.

```java
package alex.merced.demo.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import alex.merced.demo.entities.Person;

// We create our repository, the <> typing defines the entity class acting as a schema, and type of the ID
public interface PersonRepository extends JpaRepository<Person, Long> {

}
```

## Creating Our API

We've built all the pieces needed to interact with the database. Now we just need to build our controller for Person, so in the controller's folder create PersonController.

```java
package alex.merced.demo.controllers;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import alex.merced.demo.repositories.PersonRepository;
import java.util.List;
import alex.merced.demo.entities.Person;

@RestController
public class PersonController {
    
    // Property to hold our repository
    public PersonRepository People;

    // Constructor that receives the repository via dependency injection
    public PersonController(PersonRepository people){
        this.People = people;
    }

    // Get to /people that returns list of people
    @GetMapping("/people")
    public List<Person> getPeople(){
        return People.findAll(); // Returns all people!
    }

    // Post to /people, takes in request body which must be of type Person
    @PostMapping("/people")
    public List<Person> createPerson(@RequestBody Person newPerson){
        People.save(newPerson); //creates new person
        return People.findAll(); // returns all cats
    }

    // put to /people/:id, takes in the body and url param id
    @PutMapping("/people/{id}")
    public List<Person> updatePerson(@RequestBody Person updatedPerson, @PathVariable Long id){
        // search for the person by id, map over the person, alter them, then save
        People.findById(id)
            .map(person -> {
                person.setName(updatedPerson.getName());
                person.setAge(updatedPerson.getAge());
                return People.save(person); // save and return edits
            });

        return People.findAll(); // return all people
    }

	// delete request to /people/:id, deletes person based on id param
    @DeleteMapping("/people/{id}")
    public List<Person> deleteCat(@PathVariable Long id){
        People.deleteById(id);
        return People.findAll();
    }
}
```

## Test your API

Test all your routes and then we'll get on to deploying!!!

## Deploying to Heroku

- in the root of your project (where the pom.xml is) create a file called system.properties with the following line (adjust for your java version).

```
java.runtime.version=11
```

- update application properties so it's getting the database URL from env variables like so

```yaml
# Database Settings
# spring.datasource.url=jdbc:postgresql://localhost:5432/javaspringtest
spring.datasource.url=${DATABASE_URL}
# spring.datasource.username=test5
# spring.datasource.password=test5

# The SQL dialect makes Hibernate generate better SQL for the chosen database
spring.jpa.properties.hibernate.dialect = org.hibernate.dialect.PostgreSQLDialect

# Hibernate ddl auto (create, create-drop, validate, update)
spring.jpa.hibernate.ddl-auto = update
```

- commit and push to github.com

- go to Heroku and create a new project

- under deploys select deploy by Github

- connect your repo

- enable automatic deploys

- trigger a manual deploy

At this point, your project should build and automatically provision a database, so you can test your API as it should be up and working! Congrats you just deployed an API build in Java Spring!