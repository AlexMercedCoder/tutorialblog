---
title: Creating APIs with Dart & Google Shelf - Zero to Deploy
date: "2021-03-14T12:12:03.284Z"
description: Using the Fast Growing Dart Language
---

Dart has been a quickly growing language cause of the Flutter compiler which allows you to compile your code to Android and iOS platforms. Flutter has just released a new version that has expanded its reach into compiling the same codebase in Web Apps and Desktop Apps. That's a pretty killer value proposition to use the same codebase for mobile, desktop, and web apps!

With all this goodness, learning Dart seems like a fairly good use of time. The only thing that would sweeten the deal is being able to develop our APIs and Microservices with Dart as well. Guess What, with frameworks like Aqueduct and Angel, you can.

Originally, I aimed to create a tutorial using Aqueduct but due to recent changes, being able to use the migrations feature is currently not working as of 3/14/21, and solutions either involved downgrading my dart SDK or updated the underlying dependencies of Aqueduct itself. When that happens I'll revisit Aqueduct. (Leave a comment on this in the dev.to posting when this update happens so I know).

Instead, I used the Google Shelf Framework, which is a minimalist Express like framework for Dart. I built a starter project you can clone that has all the basic setup for controllers and deployment to Heroku which we will walk through in this article.

## Setup

- Must have Dart SDK 2.12 or above

- Heroku CLI

## Clone the Starter Project

`git clone https://github.com/AlexMercedCoder/DartShelfTemplateMerced.git projectName`

or if you have NPM

`npx degit AlexMercedCoder/DartShelfTemplateMerced#main projectName`

- after cloning, cd into the folder and run `pub get`

**If your new to Dart, pub is the package manager. pubspec.yaml is the equivalent of package.json for node which works more like Gemfile in Ruby. You manually list your dependencies and settings in pubspec then run `pub get` for it to update your project dependencies. Sometimes you'll need install command line tools which is done with `pub global activate <name>`. Dart Dependencies are listed on pub.dev**

## Running the Server

- to run the server `dart run web/server.dart`

- following test routes are setup

    - localhost:7777/
    - localhost:7777/test/
    - localhost:7777/test/<param>?query=XXXXX

## Examining The Code

- 

**web/server.dart**

```dart
// import 'dart:async' show Future;
// import 'package:shelf_router/shelf_router.dart';
// import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import './controllers/HomeController.dart';
import 'dart:io' show Platform;

void main() async {
  // Variable for PORT
  Map<String, String> envVars = Platform.environment;
  var portEnv = envVars['PORT'];
  var PORT = portEnv == null ? 7777 : int.parse(portEnv);
  //Instantiate Home Controller
  final home = HomeController();
  // Create server
  final server = await shelf_io.serve(home.handler, '0.0.0.0', PORT);
  // Server on message
  print('☀️ Server running on localhost:${server.port} ☀️');
}
```

**Dart is a compiled language, and like most compiled languages the entry point is the main function**

- In this code we import the HomeController which is our main router which provides a handler that is passed the creation of server (shelt_io.serve)

**web/controllers/HomeController.dart**

```dart
import 'dart:async' show Future;
import 'package:shelf_router/shelf_router.dart';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as shelf_io;
import './TestController.dart';

class HomeController {

  // Define our getter for our handler
  Handler get handler {
    final router = Router();

    // main route
    router.get('/', (Request request) {
      return Response.ok('Hello World');
    });

    // Mount Other Controllers Here
    router.mount('/test/', TestController().router);

    // You can catch all verbs and use a URL-parameter with a regular expression
    // that matches everything to catch app.
    router.all('/<ignored|.*>', (Request request) {
      return Response.notFound('Page not found');
    });

    return router;
  }
}
```

- The HomeController has a getter for handler for when we pass it into server creation.

- We can create additional routers by mounting them in this router as you see in the line with router.mount.

**web/controllers/TestController.dart**

This controller acts as a model for writing routes along with mounting additonal routers.

```dart
// import 'dart:async' show Future;
import 'package:shelf_router/shelf_router.dart';
import 'package:shelf/shelf.dart';
// import 'package:shelf/shelf_io.dart' as shelf_io;

class TestController {

  // By exposing a [Router] for an object, it can be mounted in other routers.
  Router get router {
    final router = Router();

    // get request to "/test"
    router.get('/', (Request req){
      return Response.ok("The Test Controller");

    });

    // get request to "/test/<param>?query=????"
    router.get('/<param>', (Request req, String param){
      print(req.url.queryParameters["query"]);// acessing a url query
      return Response.ok(param);
    });

    // catch all for "/test"
    router.all('/<ignored|.*>', (Request request) => Response.notFound('null'));

    return router;
  }
}
```

- Notice instead of having a handler getter, it has a router getter so we can pass that to router.mount in the HomeController.

- Parameters are defined in routes like `<param>` and received as a typed argument.

- URL Queries can be accessing from a map in req.url.queryParameters

## Deployment

As outlined in the readme with the template, pretty straightforward!

- create a git repo and commit your project
    - `git init`
    - `git add .`
    - `git commit -m "first commit"`

- `heroku create projectName`

- `heroku config:set DART_SDK_URL=https://storage.googleapis.com/dart-archive/channels/stable/release/2.12.1/sdk/dartsdk-linux-x64-release.zip`

- `heroku config:add BUILDPACK_URL=https://github.com/igrigorik/heroku-buildpack-dart.git`

- `heroku config:set DART_BUILD_CMD="./dart-sdk/bin/dart compile exe web/server.dart"`

- `git push heroku master`

- API Deployed!!

## Database Usage

There are several orms in pub.dev, give one a try!