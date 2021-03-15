---
title: Creating APIs with Dart & Aqueduct - Zero to Deploy
date: "2021-03-14T12:12:03.284Z"
description: Using the Fast Growing Dart Language
---

Dart has been a quickly growing language cause of the Flutter compiler which allows you to compile your code to Android and iOS platforms. Flutter has just released a new version that has expanded it's reach into compiling the same codebase in Web Apps and Desktop Apps. That's a pretty killer value proposition to use the same codebase for mobile, desktop and web apps!

With all this goodness, learning Dart seems like a fairly good use of time. Only thing that would sweeten the deal is being able to develop our APIs and Microservices with Dart as well. Guess What, with frameworks like Aqueduct and Angel, you can.

In this tutorial we will create and deploy a Full Crud API using the Dart Language and the Aqueduct framework.

## Setup

- [Download the Dart Language](https://dart.dev/get-dart)

- Install Postgres 12 or Higher

- Activate the Aqueduct Framework with command `pub global activate aqueduct`

- Generate a new project `aqueduct create todosapi`

- cd into new folder

- run dev server with `aqueduct serve`

- head over to localhost:8888/example to make sure it's working

## Understanding The Setup

The main file in an Aqueduct project is lib/channel.dart which initializes the server and links the first controller. We could add routes to this controller but let's create our own controller.

- make a `controllers` folder and inside that controller let's create a `test_controller.dart`

test_controller.dart
```dart
import 'package:aqueduct/aqueduct.dart';
import 'package:peopleapi/peopleapi.dart';

class TestController extends Controller {

  // Some dummy data for responses
  final data = [
    {'hello': 'world'},
    {'goodbye': 'world'},
    {'adios': 'world'},    
  ];

  // Each controller has a handle method that is overridden to define how it handles requests
  @override
  Future<RequestOrResponse> handle(Request request) async {
    return Response.ok(data);
  }
}
```

- Let's import our controller in channel.dart

```dart
import 'controllers/test_controller.dart';
```

Let's link our controller to a route

```dart
    // Prefer to use `link` instead of `linkFunction`.
    // See: https://aqueduct.io/docs/http/request_controller/
    router
      .route("/example")
      .linkFunction((request) async {
        return Response.ok({"key": "value"});
      });

    //Linking our Test Controller
    router
      .route("/test")
      .link(() => TestController());
```

restart your server and head to localhost:8888/test

## URL Params

What if want to get a particular item from the array, we can identify a URL param but make it options like so.

```dart
    //Linking our Test Controller
    router
      .route("/test/[:index]")
      .link(() => TestController());
```

The ":" makes that portion of the URL a param, and the "[]" makes that portion option in route matching. We can then test for the param in our response.

```dart
import 'package:aqueduct/aqueduct.dart';
import 'package:peopleapi/peopleapi.dart';

class TestController extends Controller {

  // Some dummy data for responses
  final data = [
    {'hello': 'world'},
    {'goodbye': 'world'},
    {'adios': 'world'},    
  ];

  // Our first route handler
  @override
  Future<RequestOrResponse> handle(Request request) async {
    // get the index from params
    final index = request.path.variables['index'];
    if (index != null){
      print("Hello");
      return Response.ok(data[int.parse(index)]);
    } else {
      return Response.ok(data);
    }
    
  }
}
```

- Restart your server and go to /test and /test/1 and see the results

#### Creating a Model

So now that you have a flavor for routing in Aqueduct let's create a model, create a new folder in lib called models with a file called Person.dart.

```dart
import 'package:peopleapi/peopleapi.dart';

class Person extends ManagedObject<_Person> implements _Person {}

class _Person {
  @primaryKey
  int id;

  @Column(unique: true)
  String name;

  @Column()
  int age;
}
```

Person is the name of the class we will be using in our controllers, _Person will be the name of the table created when we generate and migrate later. We define our properties and next we need to define our database context! We will update our channel.dart like so... (creating a context property and configuring it in our prepare function)

```dart
  ManagedContext context; // Property for holding our context
  
  @override
  Future prepare() async {
    logger.onRecord.listen((rec) => print("$rec ${rec.error ?? ""} ${rec.stackTrace ?? ""}"));

    // Fetches our data models/entities
    final dataModel = ManagedDataModel.fromCurrentMirrorSystem();
    // defines what database we'll connect to
    // the arguments passed in (username, password, host, port, database)
    final persistentStore = PostgreSQLPersistentStore.fromConnectionInfo(
      "test5", "test5", "localhost", 5432, "dartpeople");
    // merges the models and database connect into a context
    context = ManagedContext(dataModel, persistentStore);
  }
```

Let's create a new controller for our people API, instead of a normal controller, this will be a resouce controller which will give us some additional flexibility in defining our responses. Create a people_controller.dart in the controllers folder.

```dart
import 'package:aqueduct/aqueduct.dart';
import 'package:peopleapi/peopleapi.dart';
import '../models/Person.dart';

class PeopleController extends ResourceController {

  // Contructor to Receive Database Context
  PeopleController(this.context);

  // Property to Receive Database Context
  final ManagedContext context;  

  @Operation.get()// for get requests to /people
  Future<Response> getAllPeople() async {
    // create query
    final peopleQuery = Query<Person>(context);
    // store the results of our query execution
    final people = await peopleQuery.fetch();

    return Response.ok(people);
  }

}
```

Let's add this controller to our channel.dart

```dart
// Import the controller
import 'controllers/people_controller.dart';

// ...........................................//

  router
    .route("/people/[:id]")
    .link(() => PeopleController(context));
```

## Migrating the Database

- let's create a database that matches the name we passes to our database context with the command `createdb dartpeople`

- Let's generate our migrations with the command `aqueduct db generate` which will scan our application for our configured models and create the necessary migrations.

We should have a file like this in our migrations folder...

```dart
import 'dart:async';
import 'package:aqueduct/aqueduct.dart';   

class Migration1 extends Migration { 
  @override
  Future upgrade() async {
   		database.createTable(SchemaTable("_Person", [SchemaColumn("id", ManagedPropertyType.bigInteger, isPrimaryKey: true, autoincrement: true, isIndexed: false, isNullable: false, isUnique: false),SchemaColumn("name", ManagedPropertyType.string, isPrimaryKey: false, autoincrement: false, isIndexed: false, isNullable: false, isUnique: true),SchemaColumn("age", ManagedPropertyType.integer, isPrimaryKey: false, autoincrement: false, isIndexed: false, isNullable: false, isUnique: false)]));
  }
  
  @override
  Future downgrade() async {}
  
  @override
  Future seed() async {}
}
```

Run the migration with this command, make sure to update the connection string to match your local postgres details.

- `aqueduct db upgrade --connect postgres://test5:test5@localhost:5432/dartpeople`