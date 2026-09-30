---
title: "Java Spring"
date: "2023-10-21T23:27:29-04:00"
description: "Java Spring, commonly referred to as Spring, is an open-source framework for building robust and scalable enterprise applications in Java."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Java Spring

### What is Java Spring?

Java Spring, commonly referred to as Spring, is an open-source framework for building robust and scalable enterprise applications in Java. Developed by Pivotal Software (now part of VMware), Spring simplifies the development of Java applications by providing comprehensive infrastructure support and a wide array of libraries for various tasks.

### Why is Java Spring Popular?

Java Spring has gained immense popularity in the software development community for several compelling reasons:

1. **Modularity**: Spring is designed as a modular framework, allowing developers to use only the components they need. This modularity promotes a clean and lightweight architecture.

2. **IoC (Inversion of Control) Container**: Spring's IoC container manages the creation and configuration of application objects. This inversion of control simplifies the management of dependencies and promotes loose coupling.

3. **AOP (Aspect-Oriented Programming)**: Spring supports AOP, enabling developers to separate cross-cutting concerns such as logging, security, and transactions from the core business logic.

4. **Extensive Libraries**: Spring provides a broad set of libraries and extensions for various tasks, including data access (Spring Data), messaging (Spring Messaging), and integration with other technologies (Spring Integration).

5. **Robustness and Scalability**: Spring is known for its robustness and scalability, making it suitable for building large-scale enterprise applications. It encourages best practices and design patterns.

6. **Integration**: Spring offers seamless integration with other frameworks and technologies, such as Hibernate, JPA, JDBC, and various web frameworks. This flexibility allows developers to choose the best tools for their projects.

7. **Community and Ecosystem**: Spring has a vibrant and active community, which means extensive documentation, tutorials, and a wealth of third-party extensions and tools.

8. **Backward Compatibility**: Spring maintains strong backward compatibility, ensuring that applications built with older versions of Spring can still run with minimal modifications.

### Methods to Create a New Java Spring Project

Creating a new Java Spring project involves setting up the development environment and selecting the appropriate Spring project type based on your application requirements. Here are two common methods for creating a new Java Spring project:

#### 1. Spring Initializr (Spring Boot)

Spring Initializr is a web-based tool that generates the initial project structure for Spring Boot applications. It simplifies the setup process and allows you to choose project options, dependencies, and packaging.

**Steps**:

1. Visit the [Spring Initializr website](https://start.spring.io/).

2. Configure your project by selecting options such as project type (Maven or Gradle), language (Java, Kotlin, Groovy), and packaging.

3. Add dependencies based on your application's needs. For example, you can add dependencies for Spring Web, Spring Data, and more.

4. Click the "Generate" button to download a ZIP file containing the project structure.

5. Extract the downloaded ZIP file and import it into your favorite Java IDE (e.g., IntelliJ IDEA, Eclipse, or Visual Studio Code).

6. Start developing your Spring Boot application.

#### 2. Spring Tool Suite (STS)

Spring Tool Suite is an integrated development environment (IDE) based on Eclipse that is tailored for Spring application development. It provides various tools and features specifically designed for Spring projects.

**Steps**:

1. Download and install [Spring Tool Suite](https://spring.io/tools) for your operating system.

2. Launch STS and create a new Spring project by selecting "File" > "New" > "Spring Starter Project."

3. Configure your project settings, including project name, package, and the desired Spring Boot version.

4. In the "Dependencies" tab, select the Spring modules and libraries you need for your project.

5. Click the "Finish" button to create the project.

6. Start coding your Spring application using the provided project structure and IDE features.

Both of these methods provide a convenient way to initiate a new Java Spring project. Choose the one that best suits your development environment and workflow preferences.

## Basic Structure of a Java Spring Project

A typical Java Spring project follows a well-organized structure to maintain code clarity, separation of concerns, and ease of development. Understanding the basic project structure is essential for developers working with Spring frameworks. Below is an explanation of the core components and directories you'll encounter in a Java Spring project.

### 1. `src` Directory

The `src` directory is the heart of your Spring project, containing all your source code.

- `src/main/java`: This is where you place your Java source code. It includes your application's main logic, controllers, services, repositories, and any other Java classes.

- `src/main/resources`: This directory holds non-Java resources like configuration files (e.g., `application.properties` or `application.yml`), static assets, and templates for view rendering.

- `src/test/java`: In this directory, you write test cases and unit tests to ensure the functionality and reliability of your application.

- `src/test/resources`: Similar to `src/main/resources`, this directory contains resources used specifically for testing.

### 2. `pom.xml` (Maven) or `build.gradle` (Gradle)

The `pom.xml` (for Maven) or `build.gradle` (for Gradle) file defines project dependencies, plugins, and configuration. It manages your project's build process and helps resolve external dependencies automatically.

### 3. `target` or `build` Directory

After building your project using Maven or Gradle, the compiled class files and packaged JAR or WAR files are stored in the `target` directory (Maven) or `build` directory (Gradle).

### 4. Packages and Classes

- **Packages**: Organize your Java classes into packages to maintain a structured codebase. Common packages include `com.example.myapp.controller`, `com.example.myapp.service`, `com.example.myapp.repository`, and so on.

- **Classes**: Spring applications consist of various types of classes, including controllers (handling HTTP requests), services (business logic), repositories (data access), and configuration classes (defining beans and application settings).

### 5. Configuration Files

Spring applications often use configuration files to set properties, define beans, and configure various aspects of the application. Common configuration files include:

- `application.properties` or `application.yml`: Application-level configuration for settings like the database connection, server port, and logging.

- `BeanConfig.java`: A Java-based configuration class that defines Spring beans and their dependencies.

### 6. Web-Related Resources

If you're building a web application, you may have additional directories and files for web-related resources:

- `src/main/resources/static`: This directory holds static assets like CSS, JavaScript, and images.

- `src/main/resources/templates`: If you're using a templating engine like Thymeleaf or FreeMarker, store your templates here.

### 7. `test` Directory

The `test` directory is dedicated to testing your application. It mirrors the structure of the `src` directory but focuses on test cases and resources.

### 8. Build and Dependency Management

Java Spring projects commonly use Maven or Gradle as build and dependency management tools. These tools handle the project's compilation, dependencies, and packaging.

### 9. `application.properties` or `application.yml`

These configuration files allow you to set application-level properties, including database connection details, logging levels, and custom settings.

### 10. Gradle or Maven Configuration

Depending on your choice of build tool (Maven or Gradle), you'll have a `pom.xml` or `build.gradle` file at the root of your project. These files specify project dependencies, plugins, and build tasks.

### Conclusion

A well-structured project layout is essential for maintaining a Spring application efficiently. Understanding these core components and directories will help you navigate and organize your Java Spring project effectively.


## Popular Modules in Java Spring

Java Spring is a versatile framework that offers a wide range of modules to simplify various aspects of application development. These modules help developers build robust, scalable, and maintainable applications. Here are some popular Spring modules and their purposes:

### 1. Spring Core Container

#### Spring Core (spring-core)

- **Purpose**: Provides the fundamental building blocks of the Spring framework, including the IoC (Inversion of Control) container and Dependency Injection features. It enables the management and configuration of application components.

#### Spring Beans (spring-beans)

- **Purpose**: Focuses on defining and configuring beans (application components) and their dependencies. It plays a crucial role in achieving loose coupling in your application.

#### Spring Context (spring-context)

- **Purpose**: Extends the core container by adding features such as internationalization, event propagation, and resource loading. It's essential for creating the application's context and managing the lifecycle of beans.

### 2. Spring Data Access/Integration

#### Spring JDBC (spring-jdbc)

- **Purpose**: Simplifies database access by providing JDBC-related functionalities, such as data source management, exception handling, and data retrieval. It helps in writing efficient and database-agnostic code.

#### Spring ORM (spring-orm)

- **Purpose**: Integrates popular Object-Relational Mapping (ORM) frameworks like Hibernate, JPA (Java Persistence API), and JDO (Java Data Objects) with Spring. It simplifies database access and object mapping.

#### Spring Data (spring-data)

- **Purpose**: Offers support for various data sources, including relational databases, NoSQL databases, and cloud-based storage. Spring Data modules (e.g., Spring Data JPA, Spring Data MongoDB) simplify data access and repository management.

### 3. Spring Web

#### Spring Web (spring-web)

- **Purpose**: Provides essential components for building web applications. It includes features for handling HTTP requests and responses, routing, and web-related utilities.

#### Spring Web MVC (spring-webmvc)

- **Purpose**: Implements the Model-View-Controller (MVC) pattern for building web applications. Spring Web MVC offers controllers, views, and other components to create web-based user interfaces.

#### Spring WebSocket (spring-websocket)

- **Purpose**: Enables WebSocket-based communication in Spring applications. It's useful for building real-time, interactive web applications.

### 4. Spring Security

#### Spring Security (spring-security)

- **Purpose**: Offers robust security features to protect Spring-based applications. It supports authentication, authorization, and protection against common security threats, making it a crucial module for securing applications.

### 5. Spring Boot

#### Spring Boot (spring-boot)

- **Purpose**: Simplifies the process of creating production-ready Spring applications. It provides auto-configuration, embedded web servers, and opinionated defaults, allowing developers to focus on application logic rather than configuration.

### 6. Spring Cloud

#### Spring Cloud (spring-cloud)

- **Purpose**: Helps in building distributed and cloud-native applications. Spring Cloud modules offer features like service discovery, configuration management, load balancing, and distributed tracing for microservices architecture.

### 7. Spring Integration

#### Spring Integration (spring-integration)

- **Purpose**: Facilitates the integration of disparate systems and applications through message-driven patterns. It supports messaging, routing, and transformation of data between components.

### 8. Spring Batch

#### Spring Batch (spring-batch)

- **Purpose**: Provides a framework for batch processing applications. It simplifies the development of batch jobs for tasks like data import, export, and transformation.

### 9. Spring Mobile

#### Spring Mobile (spring-mobile)

- **Purpose**: Helps in creating mobile web applications and optimizing web content for mobile devices. It offers device detection and site adaptation features.

### 10. Spring HATEOAS (Hypermedia as the Engine of Application State)

#### Spring HATEOAS (spring-hateoas)

- **Purpose**: Simplifies the implementation of RESTful web services that follow the HATEOAS principles. It provides utilities for building hypermedia-driven APIs.

These Spring modules, along with many others, contribute to the Spring ecosystem's richness and flexibility. Depending on your project's requirements, you can choose the relevant modules to enhance your development experience and achieve your goals efficiently.

## Entities & Repositories (Models) & Controllers

### Entities

Entities in Spring represent the objects or data structures that you want to store and manipulate in your application. They are typically Java classes annotated with `@Entity` from the Java Persistence API (JPA). Entities map directly to database tables. Each field in an entity corresponds to a column in the table.

Entities serve the following roles:

- **Data Representation:** Entities define the structure of your data. They encapsulate the properties and relationships between objects.

- **Database Mapping:** Entities provide a way to map Java objects to database tables. Annotations such as `@Entity`, `@Id`, `@GeneratedValue`, and `@Column` help define this mapping.

- **Business Logic:** While entities primarily represent data, you can also include business logic methods within them to perform operations related to that data.

### Repositories

Repositories in Spring are interfaces that extend `JpaRepository` or similar repository interfaces provided by Spring Data JPA. These interfaces define the methods for performing CRUD (Create, Read, Update, Delete) operations on entities.

Repositories serve the following roles:

- **Data Access Layer:** Repositories act as a data access layer for your application. They provide a high-level, abstracted interface for interacting with the database.

- **Query Methods:** Spring Data JPA automatically generates queries based on method names defined in repository interfaces. This allows you to create custom query methods for complex database operations without writing SQL queries explicitly.

- **Database Operations:** Repositories provide methods to perform CRUD operations on entities. These methods include `save`, `findById`, `findAll`, `delete`, and more.

### Controllers

Controllers in Spring are Java classes annotated with `@RestController`. They handle incoming HTTP requests and define the API endpoints that clients can interact with. Controllers act as intermediaries between the client and the application logic.

Controllers serve the following roles:

- **Request Handling:** Controllers define methods (annotated with `@GetMapping`, `@PostMapping`, etc.) to handle specific HTTP requests. These methods process incoming requests, perform necessary business logic, and return HTTP responses.

- **Data Transformation:** Controllers transform data between its internal representation (usually entities) and the format required for client interaction (e.g., JSON). This includes converting entities to DTOs (Data Transfer Objects) for response serialization.

- **Routing:** Controllers define the routing and mapping of URLs to specific methods. The URL path and HTTP method (GET, POST, PUT, DELETE, etc.) determine which controller method is invoked.

In summary, Entities represent your data structures, Repositories provide a means to interact with the database using these entities, and Controllers define the API endpoints and handle HTTP requests and responses. Together, these components form the core of a Spring application, enabling you to build robust and scalable web services.

## Writing a CRUD API with Java

### Step 1: Set Up Your Development Environment

Make sure you have Java, Spring Boot, and a PostgreSQL database installed and configured on your system. Create a new Spring Boot project or use an existing one as your development environment.

### Step 2: Define the Database Schema

Create a PostgreSQL database and define the schema for the "Todo" table. You can use the following SQL script as an example:

```sql
CREATE TABLE todo (
    id SERIAL PRIMARY KEY,
    item VARCHAR(255) NOT NULL,
    complete BOOLEAN NOT NULL
);
```

### Step 3: Configure Database Connection

In your Spring Boot project, configure the database connection in the application.properties (or application.yml) file:

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/your_database_name
spring.datasource.username=your_database_username
spring.datasource.password=your_database_password
spring.jpa.hibernate.ddl-auto=update
```

### Step 4: Create the Todo Entity

Create a Java class representing the "Todo" entity. This class should be annotated with @Entity and include fields for "item" and "complete." Also, define getters and setters:

```java
@Entity
public class Todo {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    private String item;
    
    private Boolean complete;

    // getters and setters
}
Step 5: Create a Repository Interface

Create a repository interface that extends JpaRepository for managing "Todo" entities:

```java
public interface TodoRepository extends JpaRepository<Todo, Long> {
}
```
### Step 6: Create a Service

Create a service class that contains methods to handle CRUD operations. Autowire the TodoRepository into this service.

```java
@Service
public class TodoService {
    @Autowired
    private TodoRepository todoRepository;

    public List<Todo> getAllTodos() {
        return todoRepository.findAll();
    }

    public Todo createTodo(Todo todo) {
        return todoRepository.save(todo);
    }

    public Todo getTodoById(Long id) {
        return todoRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Todo not found with id: " + id));
    }

    public Todo updateTodo(Long id, Todo todoDetails) {
        Todo todo = getTodoById(id);
        todo.setItem(todoDetails.getItem());
        todo.setComplete(todoDetails.getComplete());
        return todoRepository.save(todo);
    }

    public void deleteTodo(Long id) {
        Todo todo = getTodoById(id);
        todoRepository.delete(todo);
    }
}
```
### Step 7: Create REST Controller

Create a REST controller to handle HTTP requests and map them to the service methods. This controller should use the @RestController annotation.

```java
@RestController
@RequestMapping("/api/todos")
public class TodoController {
    @Autowired
    private TodoService todoService;

    @GetMapping
    public List<Todo> getAllTodos() {
        return todoService.getAllTodos();
    }

    @PostMapping
    public Todo createTodo(@RequestBody Todo todo) {
        return todoService.createTodo(todo);
    }

    @GetMapping("/{id}")
    public Todo getTodoById(@PathVariable Long id) {
        return todoService.getTodoById(id);
    }

    @PutMapping("/{id}")
    public Todo updateTodo(@PathVariable Long id, @RequestBody Todo todoDetails) {
        return todoService.updateTodo(id, todoDetails);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteTodo(@PathVariable Long id) {
        todoService.deleteTodo(id);
        return ResponseEntity.ok().build();
    }
}
```
### Step 8: Run Your Application

Run your Spring Boot application. You can use tools like Maven or Gradle to build and run your project.

### Step 9: Test the API

You can use tools like Postman or cURL to test your CRUD JSON API endpoints. Perform operations like creating, reading, updating, and deleting "Todo" items.

## Writing a CRUD API with Kotlin

### Step 1: Set Up Your Development Environment
Install Java: Ensure you have Java JDK installed on your system. You can download it from the official Oracle website or use OpenJDK.

**Install PostgreSQL:** Install and set up PostgreSQL on your system. You can download it from the official PostgreSQL website.

**Install Spring Boot:** If you haven't already, install Spring Boot by following the official documentation.

**Set Up Your IDE:** Use an Integrated Development Environment (IDE) like IntelliJ IDEA or Visual Studio Code with Kotlin and Spring Boot extensions for a smoother development experience.

### Step 2: Create a Spring Boot Project
Create a New Project: Use your IDE to create a new Spring Boot project with Kotlin as the programming language. You can also use the Spring Initializer web tool to generate your project.

**Configure Dependencies:** Add the following dependencies to your build.gradle.kts or pom.xml file:

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.postgresql:postgresql")
}
```
**Create a PostgreSQL Database:** Create a new PostgreSQL database for your project, and note down the database URL, username, and password.

### Step 3: Define the Todo Entity
Create a Kotlin Data Class: Define a Kotlin data class named Todo to represent the Todo entity. Annotate it with @Entity and specify the primary key using @Id.

```kotlin
import javax.persistence.Entity
import javax.persistence.GeneratedValue
import javax.persistence.Id

@Entity
data class Todo(
    @Id
    @GeneratedValue
    val id: Long?,
    val title: String,
    val completed: Boolean
)
```
### Step 4: Create a Repository
Create a Repository Interface: Define a repository interface for the Todo entity. Extend JpaRepository from Spring Data JPA. This interface will provide CRUD methods for your entity.

```kotlin
import org.springframework.data.jpa.repository.JpaRepository

interface TodoRepository : JpaRepository<Todo, Long>
```

### Step 5: Create a REST Controller
Create a REST Controller: Create a Kotlin class for your REST controller. Annotate it with @RestController. Inject the TodoRepository into the controller for database operations.

```kotlin
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/todos")
class TodoController(private val todoRepository: TodoRepository) {
    // Define your CRUD API endpoints here
}
```
**Implement CRUD Endpoints:** Inside the controller, implement the following CRUD endpoints:

- GET `/api/todos`: Retrieve all todos.
- GET `/api/todos/{id}`: Retrieve a specific todo by ID.
- POST `/api/todos`: Create a new todo.
- PUT `/api/todos/{id}`: Update an existing todo.
- DELETE `/api/todos/{id}`: Delete a todo by ID.

Use @GetMapping, @PostMapping, @PutMapping, and @DeleteMapping annotations for defining the HTTP methods.

**Handle Exception Cases:** Use exception handling to provide proper error responses, such as 404 Not Found or 400 Bad Request, when a requested resource does not exist or when validation fails.

### Step 6: Configure Database Connection
Configure Database Properties: Configure your application's database connection properties in the application.properties or application.yml file. Include the database URL, username, and password.

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/your-database-name
spring.datasource.username=your-username
spring.datasource.password=your-password
```

### Step 7: Run and Test Your API
**Build and Run Your Application:** Use your IDE or the command line to build and run your Spring Boot application.

**Test Endpoints:** Use tools like Postman or curl to test your API endpoints. Send requests to http://localhost:8080/api/todos and other defined endpoints.

**Verify CRUD Operations:** Verify that you can create, read, update, and delete todo items using your API.

## Write a CRUD API with Groovy

### Step 1: Set Up Your Development Environment
Install Java: Ensure you have Java JDK installed on your system. You can download it from the official Oracle website or use OpenJDK.

**Install PostgreSQL:** Install and set up PostgreSQL on your system. You can download it from the official PostgreSQL website.

**Install Groovy:** Groovy is often included with popular build tools like Gradle, but you can also download and install it separately from the official Groovy website.

**Set Up Spring Boot:** If you haven't already, install Spring Boot by following the official documentation.

**Set Up Your IDE:** Use an Integrated Development Environment (IDE) like IntelliJ IDEA or Visual Studio Code with Groovy and Spring Boot extensions for a smoother development experience.

### Step 2: Create a Spring Boot Project
Create a New Project: Use your IDE to create a new Spring Boot project with Groovy as the programming language. You can also use the Spring Initializer web tool to generate your project.

**Configure Dependencies:** Add the following dependencies to your build.gradle or pom.xml file:

```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.postgresql:postgresql'
    implementation 'org.codehaus.groovy:groovy'
}
```

### Step 3: Define the Todo Entity
Create a Groovy Class: Define a Groovy class named Todo to represent the Todo entity. Annotate it with @Entity and specify the primary key using @Id.

```groovy
import javax.persistence.Entity
import javax.persistence.GeneratedValue
import javax.persistence.Id

@Entity
class Todo {
    @Id
    @GeneratedValue
    Long id
    String title
    boolean completed
}
```
### Step 4: Create a Repository
Create a Repository Interface: Define a repository interface for the Todo entity. Extend JpaRepository from Spring Data JPA. This interface will provide CRUD methods for your entity.

```groovy
import org.springframework.data.jpa.repository.JpaRepository

interface TodoRepository extends JpaRepository<Todo, Long> {
}
```

### Step 5: Create a REST Controller
Create a REST Controller: Create a Groovy class for your REST controller. Annotate it with @RestController. Inject the TodoRepository into the controller for database operations.

```groovy
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/todos")
class TodoController {
    final TodoRepository todoRepository

    TodoController(TodoRepository todoRepository) {
        this.todoRepository = todoRepository
    }

    // Define your CRUD API endpoints here
}
``` 
**Implement CRUD Endpoints:** Inside the controller, implement the following CRUD endpoints:

- GET `/api/todos`: Retrieve all todos.
- GET `/api/todos/{id}`: Retrieve a specific todo by ID.
- POST `/api/todos`: Create a new todo.
- PUT `/api/todos/{id}`: Update an existing todo.
- DELETE `/api/todos/{id}`: Delete a todo by ID.

Use @GetMapping, @PostMapping, @PutMapping, and @DeleteMapping annotations for defining the HTTP methods.

Handle Exception Cases: Use exception handling to provide proper error responses, such as 404 Not Found or 400 Bad Request, when a requested resource does not exist or when validation fails.

### Step 6: Configure Database Connection
Configure Database Properties: Configure your application's database connection properties in the application.properties or application.yml file. Include the database URL, username, and password.

```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/your-database-name
spring.datasource.username=your-username
spring.datasource.password=your-password
```

### Step 7: Run and Test Your API
**Build and Run Your Application:** Use your IDE or the command line to build and run your Spring Boot application.

**Test Endpoints:** Use tools like Postman or curl to test your API endpoints. Send requests to http://localhost:8080/api/todos and other defined endpoints.

**Verify CRUD Operations:** Verify that you can create, read, update, and delete todo items using your API.