---
tags:
  - "java"
  - "spring"
author: "Alex Merced"
title: "How to build a Java Spring JSON API from scratch"
date: "2023-10-01T12:12:03.284Z"
category: "java"
bannerImage: "https://i.imgur.com/nc4bdok.png"
---

## Step 1: Set Up the Maven Project

Create a new Maven project using your preferred IDE or by using the following command in your terminal:

```shell
mvn archetype:generate -DgroupId=com.example -DartifactId=todocrud -DarchetypeArtifactId=maven-archetype-quickstart -DinteractiveMode=false
```

### Navigate to the project directory:

```shell
cd todocrud
```

Open the pom.xml file and add the Spring Boot and PostgreSQL dependencies. Here's an example:

```xml
<dependencies>
    <!-- Spring Boot Starter -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>

    <!-- Spring Boot Starter Data JPA -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>

    <!-- PostgreSQL Driver -->
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
        <version>42.2.14</version>
    </dependency>
</dependencies>
```

Save the pom.xml file and let Maven resolve the dependencies.

## Step 2: Configure the Database

Create a PostgreSQL database and remember the connection details (URL, username, and password).

Open the `src/main/resources/application.properties` file and configure the database connection:

```shell
spring.datasource.url=jdbc:postgresql://localhost:5432/your_database_name
spring.datasource.username=your_username
spring.datasource.password=your_password
spring.datasource.driver-class-name=org.postgresql.Driver
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect
```

## Step 3: Create the Model

Create a package called com.example.todocrud.model.

Inside the model package, create a class named Todo to represent your model:

```java
package com.example.todocrud.model;

import javax.persistence.*;

@Entity
@Table(name = "todos")
public class Todo {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String task;
    private boolean completed;

    public Todo() {
    }

    public Todo(String task, boolean completed) {
        this.task = task;
        this.completed = completed;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTask() {
        return task;
    }

    public void setTask(String task) {
        this.task = task;
    }

    public boolean isCompleted() {
        return completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }
}
```

## Step 4: Create the Repository

Create a package named com.example.todocrud.repository.

Inside the repository package, create an interface named TodoRepository:

```java
package com.example.todocrud.repository;

import com.example.todocrud.model.Todo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TodoRepository extends JpaRepository<Todo, Long> {
}
```

## Step 5: Create the Controller

Create a package named com.example.todocrud.controller.

Inside the controller package, create a class named TodoController to handle API endpoints:

```java
package com.example.todocrud.controller;

import com.example.todocrud.model.Todo;
import com.example.todocrud.repository.TodoRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/todos")
public class TodoController {
    @Autowired
    private TodoRepository todoRepository;

    @PostMapping
    public Todo createTodo(@RequestBody Todo todo) {
        return todoRepository.save(todo);
    }

    @GetMapping
    public List<Todo> getAllTodos() {
        return todoRepository.findAll();
    }

    @GetMapping("/{id}")
    public Optional<Todo> getTodoById(@PathVariable Long id) {
        return todoRepository.findById(id);
    }

    @PutMapping("/{id}")
    public Todo updateTodo(@PathVariable Long id, @RequestBody Todo updatedTodo) {
        return todoRepository.findById(id)
                .map(todo -> {
                    todo.setTask(updatedTodo.getTask());
                    todo.setCompleted(updatedTodo.isCompleted());
                    return todoRepository.save(todo);
                })
                .orElseGet(() -> {
                    updatedTodo.setId(id);
                    return todoRepository.save(updatedTodo);
                });
    }

    @DeleteMapping("/{id}")
    public void deleteTodoById(@PathVariable Long id) {
        todoRepository.deleteById(id);
    }
}
```

Implement the CRUD operations in the TodoController class using appropriate annotations (@PostMapping, @GetMapping, @PutMapping, @DeleteMapping) and methods.

## Step 6: Run the Application

Run the Spring Boot application:

```shell
mvn spring-boot:run
```

Access the API endpoints at http://localhost:8080/todos.

That's it! You've created a Java Spring CRUD JSON API from scratch with PostgreSQL integration using the "TODO" model. You can now define and implement the specific CRUD operations in the TodoController class and test your API using a tool like Postman or curl.