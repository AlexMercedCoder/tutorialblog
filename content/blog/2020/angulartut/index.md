---
title: Intro to Angular 9 Tutorial
date: "2020-08-21T22:12:03.284Z"
description: "Enterprise level frontend framework"
---

**ANGULAR VIDEO PLAYLIST:** https://www.youtube.com/playlist?list=PLY6oTPmKnKbahNK_YUsjTzP5U-FkGA544

## What is Angular?

From Angular.io:

> Angular is an application design framework and development platform for creating efficient and sophisticated single-page apps.

## Setup

Angular requires a build setup from the beginning (so unline Vue or React, modern Angular can't be started with a simple Script tag). So in that case the first step is to install the Angular CLI tools using node (must install node from nodeJS.org if you don't already have it).

`npm install -g @angular/cli`

Once the CLI is installed there are many commands that can be used that will make your life easier when working with Angular. Primarily we want to start by spinning up a new project with the `ng new` command.

`ng new myapp`

When prompted say yes to including Angular routing, and use CSS as your styling engine.

Once it is done creating your new project change into the new folder it created, `cd myapp`. From there to see the default project run the development server with the command `ng serve`.

## The Basics

So most of the work you'll need to do will be in the source folder. In the folder there is a folder called app which contains a component called app which is the entrypoint of your application.

Every components has 4 main files...

**name.component.html**: This is the file where you'll put your HTML template, what does this particular component render to the screen.

**name.component.css** This is the styling that applies to that particular component.

**name.component.ts** This is a Typescript file where you'll put all the programming logic for the component.

**name.component.spec.ts** This is where you'd write tests for the component

When it comes to the app folder you should notice there are two more very important files.

**app-routing.module.ts** This is tracks all the routes for the application.

**app.module.ts** Angular practices what's called dependency injection to prevent your project from being bloated at build time. So instead of assuming you want every angular feature out of the box, this module files allows you to import the Angular modules you want for forms, HTTP requests and more.

## Let's begin

Change the app.component.html to the following.

```html
<h1>A Test Angular Website</h1>

<router-outlet></router-outlet>
```

The router-outlet tag will be where the current route shows up.

## Interpolating data

Let's add some data to our component, head over the **app.component.ts** and update or add a title property in the components class like so.

```ts
import { Component } from "@angular/core"

@Component({
  selector: "app-root",
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.css"],
})
export class AppComponent {
  title = "A Test Angular Website"
}
```

then update your template in **app.component.html** like so

```html
<h1>{{title}}</h1>

<router-outlet></router-outlet>
```

## Creating another component

Create a new component with the following cli command

```
ng generate component helloworld
```

You'll see a new folder in the app folder called "helloworld" with the four main files for this component. In the helloworld.component.ts file let's add a property to interpolate.

```ts
import { Component, OnInit } from "@angular/core"

@Component({
  selector: "app-helloworld",
  templateUrl: "./helloworld.component.html",
  styleUrls: ["./helloworld.component.css"],
})
export class HelloworldComponent implements OnInit {
  helloWorld = "Hello World"

  constructor() {}

  ngOnInit(): void {}
}
```

Then let's interpolate in the template in helloworld.component.html

```
<h1>{{ helloWorld }}</h1>
```

Notice in the ts file it tells us the selector will be `selector: 'app-helloworld',`

Let's use it in our app component, go back to app.component.html

```html
<h1>{{title}}</h1>
<app-helloworld></app-helloworld>

<router-outlet></router-outlet>
```

Now you can see the helloworld component on the screen!

## Directives

Directives like in Vue allow us to bind data to our html element. Here is a list of many of the basic ones.(technically, directives were originally introduced in AngularJS)

**ngModel:** binds a form element to a property (binds it to a variable in your class)
_Requires you to import the Forms Module in app.module.ts => https://angular.io/guide/ngmodules_

`<input type="text" [(ngModel)]="propertyName"/>`

**ngIf:** This allows you to determine the visibility of an element based on the truthiness of an express or class property.

`<div *ngIf="toggleVariable"></div>`

**ngFor:** Loops over an array that is a property of the component, it will create a copy of the element for each element of the array.

`<h1 *ngFor="let item of items">{{item}}</h1>`

**[bindProperty]:** To bind properties of an element to a variable in the class use square brackets.

`<h1 [id]="variableName">Hello</h1>`

**(eventBinding):** To bind an event to an element use parentesis and point to a function in your corresponding component class (the TS file).

`<button (click)="function()">Hello</button>`

## The Angular Router

To setup routes you'll add object to the routes array in **app-routing.module.ts**. It should give a name for the route and the class name for the component it should render. This assumes you enabled routing when you created the project so the routing module was automatically imported in app.module.ts.

```ts
const routes: Routes = [
  { path: "first-component", component: FirstComponent },
  { path: "second-component", component: SecondComponent },
]
```

The once the routes are creates they can be used as links in your component like so.

```ts
<ul>
  <li>
    <a routerLink="/first-component" routerLinkActive="active">
      First Component
    </a>
  </li>
  <li>
    <a routerLink="/second-component" routerLinkActive="active">
      Second Component
    </a>
  </li>
</ul>
```

When the link is clicked on that component will render where the `<router-outlet>` component is on the template.

## Bottom line

Angular is a robust framework with a lot of features and capability. Practice and get comfortable with the above then learn about some of the features and modules in the Angular ecosystem such as the http module and lifecycle methods.
