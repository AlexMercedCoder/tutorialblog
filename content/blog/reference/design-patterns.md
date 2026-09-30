---
title: "Design Patterns"
date: "2023-10-21T23:27:29-04:00"
description: "Design patterns are reusable solutions to common problems that occur during software design and development."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Design Patterns in Programming
Design patterns are reusable solutions to common problems that occur during software design and development. They represent best practices and have evolved over time as experienced developers encountered and solved recurring issues in software projects. Design patterns provide a structured approach to solving specific design and coding problems, offering a clear and well-tested solution that can be adapted to various scenarios.

### Why Do Design Patterns Matter?
Design patterns matter for several reasons:

**Code Reusability:** They promote code reusability, reducing the need to reinvent the wheel for common problems. This saves time and effort during development.

**Scalability:** Design patterns help design scalable and maintainable software by providing a structured approach to organizing code.

**Common Vocabulary:** They establish a common vocabulary for developers to communicate about software design. This improves collaboration among team members.

**Reliability:** Design patterns are well-documented and well-tested solutions, which can lead to more reliable software.

**Quality:** They can contribute to better code quality, as they embody proven design principles and best practices.

**Problem Solving:** Design patterns provide a roadmap for solving recurring design and coding challenges, making development more efficient.

### Common Design Patterns:
There are several categories of design patterns, each addressing specific aspects of software design and development. Here are some common design patterns:

#### 1. Creational Patterns:
These patterns deal with object creation mechanisms, trying to create objects in a manner suitable to the situation.

**Singleton Pattern:** Ensures a class has only one instance and provides a global point of access to it.

**Factory Method Pattern:** Defines an interface for creating an object but lets subclasses alter the type of objects that will be created.

**Abstract Factory Pattern:** Provides an interface for creating families of related or dependent objects without specifying their concrete classes.

#### 2. Structural Patterns:
These patterns focus on class composition, defining relationships between objects to form larger structures.

**Adapter Pattern:** Allows the interface of an existing class to be used as another interface.

**Decorator Pattern:** Attaches additional responsibilities to an object dynamically.

**Composite Pattern:** Composes objects into tree structures to represent part-whole hierarchies.

#### 3. Behavioral Patterns:
Behavioral patterns deal with communication between objects, defining how they operate and interact.

**Observer Pattern:** Defines a one-to-many dependency between objects, where one object (the subject) notifies its observers (dependents) of state changes.

**Strategy Pattern:** Defines a family of algorithms, encapsulates each one, and makes them interchangeable.

**Command Pattern:** Encapsulates a request as an object, thereby allowing for parameterization of clients with queues, requests, and operations.

#### 4. Architectural Patterns:
These patterns address high-level issues, providing solutions for organizing the overall structure of a software application.

**MVC (Model-View-Controller) Pattern:** Separates an application into three interconnected components: Model (data and business logic), View (user interface), and Controller (manages user input and interaction).

**MVP (Model-View-Presenter) Pattern:** Similar to MVC but emphasizes a clear separation between the view and the presenter.

**MVVM (Model-View-ViewModel) Pattern:** Separates the view and the model using a view model to manage the presentation logic.

These are just a few examples of design patterns. There are many more patterns available, and each serves a specific purpose in solving recurring software design and development challenges.

By understanding and applying design patterns, developers can create more maintainable, efficient, and robust software while benefiting from the collective wisdom of the software development community.

## Creational Design Patterns in JavaScript
Creational design patterns focus on object creation mechanisms. They provide ways to instantiate objects while hiding the underlying logic involved in the process. In JavaScript, there are several creational design patterns, and we'll explore a few of them with examples.

### 1. Singleton Pattern
The Singleton pattern ensures that a class has only one instance and provides a global point of access to that instance.

Example:

```js
class Singleton {
  constructor() {
    if (!Singleton.instance) {
      Singleton.instance = this;
    }
    return Singleton.instance;
  }

  logMessage() {
    console.log('This is a singleton instance.');
  }
}

const singleton1 = new Singleton();
const singleton2 = new Singleton();

console.log(singleton1 === singleton2); // Output: true (both references point to the same instance)

singleton1.logMessage(); // Output: This is a singleton instance.
```

### 2. Factory Method Pattern
The Factory Method pattern defines an interface for creating an object, but it lets subclasses alter the type of objects that will be created.

Example:

```js
// Abstract creator class
class Creator {
  factoryMethod() {
    throw new Error('This method must be overridden by subclasses');
  }
}

// Concrete creator subclass
class ConcreteCreator extends Creator {
  factoryMethod() {
    return new ConcreteProduct();
  }
}

// Abstract product class
class Product {
  getProductInfo() {
    throw new Error('This method must be overridden by subclasses');
  }
}

// Concrete product subclass
class ConcreteProduct extends Product {
  getProductInfo() {
    return 'This is a concrete product.';
  }
}

const creator = new ConcreteCreator();
const product = creator.factoryMethod();

console.log(product.getProductInfo()); // Output: This is a concrete product.
```

### 3. Abstract Factory Pattern
The Abstract Factory pattern provides an interface for creating families of related or dependent objects without specifying their concrete classes.

Example:

```js
// Abstract factory interface
class AbstractFactory {
  createProductA() {
    throw new Error('This method must be overridden by subclasses');
  }

  createProductB() {
    throw new Error('This method must be overridden by subclasses');
  }
}

// Concrete factory subclass
class ConcreteFactory extends AbstractFactory {
  createProductA() {
    return new ConcreteProductA();
  }

  createProductB() {
    return new ConcreteProductB();
  }
}

// Abstract product A
class AbstractProductA {
  getProductInfo() {
    throw new Error('This method must be overridden by subclasses');
  }
}

// Concrete product A subclass
class ConcreteProductA extends AbstractProductA {
  getProductInfo() {
    return 'Product A';
  }
}

// Abstract product B
class AbstractProductB {
  getProductInfo() {
    throw new Error('This method must be overridden by subclasses');
  }
}

// Concrete product B subclass
class ConcreteProductB extends AbstractProductB {
  getProductInfo() {
    return 'Product B';
  }
}

const factory = new ConcreteFactory();
const productA = factory.createProductA();
const productB = factory.createProductB();

console.log(productA.getProductInfo()); // Output: Product A
console.log(productB.getProductInfo()); // Output: Product B
```

### 4. Builder Pattern
The Builder pattern separates the construction of a complex object from its representation, allowing the same construction process to create different representations.

Example:

```js
class Burger {
  constructor(builder) {
    this.size = builder.size;
    this.cheese = builder.cheese;
    this.pepperoni = builder.pepperoni;
    this.lettuce = builder.lettuce;
  }
}

class BurgerBuilder {
  constructor(size) {
    this.size = size;
    this.cheese = false;
    this.pepperoni = false;
    this.lettuce = false;
  }

  addCheese() {
    this.cheese = true;
    return this;
  }

  addPepperoni() {
    this.pepperoni = true;
    return this;
  }

  addLettuce() {
    this.lettuce = true;
    return this;
  }

  build() {
    return new Burger(this);
  }
}

const burger = new BurgerBuilder(2)
  .addPepperoni()
  .addLettuce()
  .addCheese()
  .build();

console.log(burger); // Output: Burger { size: 2, cheese: true, pepperoni: true, lettuce: true }
```

### 5. Prototype Pattern
The Prototype pattern creates new objects by copying an existing object, known as the prototype. This pattern is particularly useful when the cost of creating an object is more expensive.

Example:

```js
class Shape {
  constructor() {
    this.type = null;
  }

  clone() {
    throw new Error('This method must be overridden by subclasses');
  }
}

class Circle extends Shape {
  constructor() {
    super();
    this.type = 'Circle';
  }

  clone() {
    return Object.create(this);
  }
}

class Square extends Shape {
  constructor() {
    super();
    this.type = 'Square';
  }

  clone() {
    return Object.create(this);
  }
}

const circle = new Circle();
const clonedCircle = circle.clone();
const square = new Square();
const clonedSquare = square.clone();

console.log(clonedCircle.type); // Output: Circle
console.log(clonedSquare.type); // Output: Square
```

## Behavioral Design Patterns in JavaScript
Behavioral design patterns focus on communication and interaction between objects. They help manage the responsibilities and behaviors of objects within a system. These patterns provide solutions for various scenarios, such as managing algorithms, responsibilities, and communication between objects.

### 1. Observer Pattern
The Observer pattern defines a one-to-many dependency between objects. When one object (the subject) changes state, all its dependents (observers) are notified and updated automatically.

Example:

```js
class Subject {
  constructor() {
    this.observers = [];
  }

  addObserver(observer) {
    this.observers.push(observer);
  }

  removeObserver(observer) {
    this.observers = this.observers.filter((obs) => obs !== observer);
  }

  notifyObservers() {
    this.observers.forEach((observer) => observer.update());
  }
}

class Observer {
  constructor(name) {
    this.name = name;
  }

  update() {
    console.log(`${this.name} has been notified.`);
  }
}

const subject = new Subject();
const observer1 = new Observer('Observer 1');
const observer2 = new Observer('Observer 2');

subject.addObserver(observer1);
subject.addObserver(observer2);

subject.notifyObservers();

// Output:
// Observer 1 has been notified.
// Observer 2 has been notified.
```

### 2. Command Pattern
The Command pattern encapsulates a request as an object, thereby allowing for parameterization of clients with queuing of requests, and logging of requests.

Example:

```js
class Light {
  turnOn() {
    console.log('Light is on.');
  }

  turnOff() {
    console.log('Light is off.');
  }
}

class LightOnCommand {
  constructor(light) {
    this.light = light;
  }

  execute() {
    this.light.turnOn();
  }
}

class LightOffCommand {
  constructor(light) {
    this.light = light;
  }

  execute() {
    this.light.turnOff();
  }
}

class RemoteControl {
  constructor() {
    this.command = null;
  }

  setCommand(command) {
    this.command = command;
  }

  pressButton() {
    this.command.execute();
  }
}

const light = new Light();
const lightOnCommand = new LightOnCommand(light);
const lightOffCommand = new LightOffCommand(light);

const remote = new RemoteControl();

remote.setCommand(lightOnCommand);
remote.pressButton(); // Output: Light is on.

remote.setCommand(lightOffCommand);
remote.pressButton(); // Output: Light is off.
```

#### 3. Strategy Pattern
The Strategy pattern defines a family of algorithms, encapsulates each one, and makes them interchangeable. It allows clients to choose an algorithm from a family of algorithms at runtime.

Example:

```js
class PaymentStrategy {
  pay(amount) {
    throw new Error('This method must be overridden by concrete strategies');
  }
}

class CreditCardPayment extends PaymentStrategy {
  pay(amount) {
    console.log(`Paid $${amount} with credit card.`);
  }
}

class PayPalPayment extends PaymentStrategy {
  pay(amount) {
    console.log(`Paid $${amount} with PayPal.`);
  }
}

class ShoppingCart {
  constructor(paymentStrategy) {
    this.items = [];
    this.paymentStrategy = paymentStrategy;
  }

  addItem(item) {
    this.items.push(item);
  }

  checkout() {
    const total = this.items.reduce((acc, item) => acc + item.price, 0);
    this.paymentStrategy.pay(total);
  }
}

const cart1 = new ShoppingCart(new CreditCardPayment());
cart1.addItem({ name: 'Item 1', price: 50 });
cart1.addItem({ name: 'Item 2', price: 30 });
cart1.checkout();
// Output: Paid $80 with credit card.

const cart2 = new ShoppingCart(new PayPalPayment());
cart2.addItem({ name: 'Item 3', price: 40 });
cart2.checkout();
// Output: Paid $40 with PayPal.
```

### 4. Chain of Responsibility Pattern
The Chain of Responsibility pattern passes a request along a chain of handlers. Each handler decides either to process the request or to pass it to the next handler in the chain.

Example:

```js
class Handler {
  constructor() {
    this.successor = null;
  }

  setSuccessor(successor) {
    this.successor = successor;
  }

  handleRequest(request) {
    if (this.successor) {
      this.successor.handleRequest(request);
    }
  }
}

class ConcreteHandler1 extends Handler {
  handleRequest(request) {
    if (request === 'handler1') {
      console.log('Handler 1 handled the request.');
    } else {
      super.handleRequest(request);
    }
  }
}

class ConcreteHandler2 extends Handler {
  handleRequest(request) {
    if (request === 'handler2') {
      console.log('Handler 2 handled the request.');
    } else {
      super.handleRequest(request);
    }
  }
}

const handler1 = new ConcreteHandler1();
const handler2 = new ConcreteHandler2();

handler1.setSuccessor(handler2);

handler1.handleRequest('handler1'); // Output: Handler 1 handled the request.
handler1.handleRequest('handler2'); // Output: Handler 2 handled the request.
handler1.handleRequest('handler3'); // No output, request unhandled.
```

### 5. State Pattern
The State pattern allows an object to alter its behavior when its internal state changes. The object appears to change its class.

Example:

```js
class GumballMachine {
  constructor(count) {
    this.count = count || 0;
    this.state = this.count > 0 ? new NoQuarterState(this) : new SoldOutState(this);
  }

  insertQuarter() {
    this.state.insertQuarter();
  }

  ejectQuarter() {
    this.state.ejectQuarter();
  }

  turnCrank() {
    this.state.turnCrank();
    this.state.dispense();
  }

  releaseGumball() {
    if (this.count > 0) {
      console.log('A gumball rolls out.');
      this.count--;
    }
  }
}

class State {
  constructor(machine) {
    this.machine = machine;
  }

  insertQuarter() {}
  ejectQuarter() {}
  turnCrank() {}
  dispense() {}
}

class NoQuarterState extends State {
  insertQuarter() {
    console.log('You inserted a quarter.');
    this.machine.state = new HasQuarterState(this.machine);
  }
}

class HasQuarterState extends State {
  ejectQuarter() {
    console.log('Quarter returned.');
    this.machine.state = new NoQuarterState(this.machine);
  }

  turnCrank() {
    console.log('You turned the crank.');
    this.machine.releaseGumball();
    this.machine.state = this.machine.count > 0 ? new NoQuarterState(this.machine) : new SoldOutState(this.machine);
  }
}

class SoldOutState extends State {
  insertQuarter() {
    console.log('Machine is sold out. Please wait for a refill.');
  }
}

const gumballMachine = new GumballMachine(5);
gumballMachine.insertQuarter();
gumballMachine.turnCrank(); // Output: You turned the crank. A gumball rolls out.
```

## Architectural Patterns
Architectural patterns are high-level design patterns that help developers structure their applications in a way that promotes modularity, scalability, and maintainability. These patterns provide a blueprint for organizing different components and modules within an application to address common architectural challenges. Using architectural patterns can lead to cleaner, more understandable, and more maintainable code.

### Why Architectural Patterns Matter
Architectural patterns are essential in software development for several reasons:

**Modularity:** They promote the separation of concerns by organizing the codebase into manageable and loosely coupled modules or components. This makes it easier to develop, test, and maintain different parts of the application independently.

**Scalability:** Architectural patterns often lay the foundation for scalability. By following a proven architectural pattern, developers can scale their applications horizontally or vertically to handle increased load and demand.

**Maintainability:** Applications built using architectural patterns are generally easier to maintain and extend. Changes or updates to one part of the system are less likely to have unintended consequences on other parts.

**Reusability:** Architectural patterns encourage the creation of reusable components and modules. This can save development time and reduce the likelihood of introducing bugs.

**Team Collaboration:** Architectural patterns provide a common language and structure for development teams. Team members can better understand and collaborate on projects when they follow a recognized pattern.

### Common Architectural Patterns
There are several well-established architectural patterns, each designed to solve specific problems. Here are some of the most commonly used architectural patterns:

#### 1. Model-View-Controller (MVC)
Purpose: Separates an application into three interconnected components: Model (data and logic), View (user interface), and Controller (handles user input and communicates between Model and View). This pattern is widely used for building user interfaces.

#### 2. Model-View-ViewModel (MVVM)
Purpose: An evolution of MVC, MVVM separates the user interface logic from the business logic by introducing the ViewModel, which binds the View and Model. This pattern is commonly used in frontend development.

#### 3. Layered Architecture
Purpose: Divides an application into multiple layers (e.g., Presentation, Business Logic, Data) to enforce separation of concerns and maintainability. Each layer has a specific responsibility and communicates with adjacent layers.

#### 4. Microservices Architecture
Purpose: Decomposes a monolithic application into a collection of small, independently deployable services. Each service has its own database and communicates with others via APIs. Microservices promote scalability and flexibility.

#### 5. Serverless Architecture
Purpose: Focuses on building applications without managing the underlying server infrastructure. Code is executed in stateless, event-triggered functions (e.g., AWS Lambda). Serverless architectures are known for their cost efficiency and scalability.

#### 6. Event-Driven Architecture
Purpose: Components of the system communicate primarily through events and messages. This pattern is useful for building systems that respond to and process events in real-time, such as IoT applications or message-driven microservices.

#### 7. Hexagonal Architecture (Ports and Adapters)
Purpose: Encapsulates the core application logic (hexagon) from external dependencies (ports and adapters). This pattern promotes testability and allows developers to replace external components without affecting the core logic.

#### 8. Repository Pattern
Purpose: Separates the logic that retrieves data from a data source (e.g., database) from the rest of the application. This pattern is commonly used for abstracting data access and promoting testability.

#### 9. Clean Architecture
Purpose: Focuses on separating concerns into concentric circles, with the innermost circle containing the core business logic, and outer circles containing the interface and infrastructure layers. Clean Architecture enforces dependency inversion and testability.

#### 10. Service-Oriented Architecture (SOA)
Purpose: Structures an application as a collection of loosely coupled, independently deployable services that communicate through standardized interfaces (e.g., RESTful APIs). SOA promotes reusability and flexibility.

### Choosing the Right Architectural Pattern
The choice of an architectural pattern depends on the specific requirements, goals, and constraints of your project. It's essential to carefully evaluate these factors and select the pattern that best aligns with your application's needs.

In many cases, projects may combine multiple architectural patterns to address different aspects of the application. The key is to strike a balance that ensures scalability, maintainability, and the ability to meet evolving requirements.

When implementing architectural patterns, developers should also consider factors like technology stack, team expertise, and the project's long-term vision. Architectural patterns provide a roadmap, but they should be adapted and customized to suit the unique characteristics of each project.