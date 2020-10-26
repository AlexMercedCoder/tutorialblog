---
title: Making Framework Agnostic Web Components with StencilJS
date: "2020-10-26T22:12:03.284Z"
description: Ionics Component Creation Tool
---

**STENCIL VIDEO PLAYLIST:** https://www.youtube.com/playlist?list=PLY6oTPmKnKbazpUTMcGmvMtgU5sr0Ip-V

## The Problem

The problem with React, Angular, Vue and Svelte that as frameworks if you create a component it can't be used in another framework (at least not in a way that would make workflow easier or bundles smaller). So if your company has multiple teams working across different frameworks it may limit the transportability of their work.

One possible solution is the Native Web Component API which has several frameworks built on top of it such Google's LitElement, SalesForces LightningElements, and frameworks I've created such as MercedUI, AMPonent and funComponent. The potential problem with this is browser compatibility with the Web Component API (which is much better now) and being boxed in using HTMLElement base class.

So Ionic in trying to make sure the components they put out for their Ionic framework can work cross frameworks they created a took for creating components that compiles them into standard js that avoid less widespread browser APIs, this tool is StencilJS. The result is a developer experience that seems like a cross between Angular 9 and React. Let's dive in!

## Install

Fun Fact: if you type a command after "npm init" such as "npm init foo" it is translated to "npx create-foo". So essentially "npm init react-app" is the same as "npx create-react-app" something to remember when you name your next scaffolding tool. So to create a new Stencil Application run the following command.

```npm init stencil```

This then shows a prompt that gives you three choices (PWA, APP, COMPONENT). For this tutorial select App (that's right you can make the entire app in Stencil if you wanted). Then name your project and your project folder will be created.

Change directories into the folder created and run npm install.

## Run Dev Server

To run your dev server just run ```npm start``` and you'll see the basic shell of an app.

## Folder Structure

### src
Everything you need to work with like in other frameworks is in the src folder.

#### assets
Place images and other assets here.

#### components
Here is where all your components live

#### global
this is where you'll find the global css, and a global ts file to right logic that should occur on Application startup.

### www
When you run the build command, ```npm run build``` The deployable output will be in this folder.

## Anatomy of a Component

By default you'll notice that all components have a two part name (part1-part2) this is to prevent collision with native HTML tags so you are required to follow this convention.

Each component has its own folder with 3 files...

### app-component.css
The CSS file to write CSS scoped to that component

### app-component.e2e.ts
File for writing tests if you choose to do testing

### app-component.ts
This is the actual component file, notice this is a TypeScript file as Stencil requires writing your components in Typescript.

In the default setup your already have three components you can play with, app-home, app-profile, and app-root.

## Creating a new component

Run the command...

```stencil generate```

It will ask what is the new components name (app-button) and which files do you want to generate (toggle with spacebar).

Now you'll notice a new file in the components folder, "app-button".

```ts
import { Component, Host, h } from '@stencil/core';

@Component({
  tag: 'app-button',
  styleUrl: 'app-button.css',
  shadow: true,
})
export class AppButton {

  render() {
    return (
      <Host>
        <slot></slot>
      </Host>
    );
  }

}
```

You always have to import the parts of stencil your using.

**Component:** Decorator that tells the compiler that the class is a component, takes the name of the tag and location of CSS file to scope.

**Host:** The host component can be used to make references and add an event listener to the component itself but even if you don't you think of it as a glorified fragment, no need to remove it so it can be our top-level element to follow the rules of JSX. Oh yeah, component templates are written in JSX like react so for the most part all the same rules and syntax applies.

**h:** h just facilitates the compiling of JSX into the virtualDOM.

**slot**: If you've used Angular/Vue, then you probably know slots well. If your coming from React thinks of slot as props.children with a few neat extra features.

## State and Props

So if we can use JSX like React but we are using Typescript and Decorators like angular... how are State and Props handled? The way it works is you'll declare any state and props as individual class properties using the Props and State decorators. Try out the following in app-button.

```ts
import { Component, Host, h, Prop, State } from '@stencil/core';

@Component({
  tag: 'app-button',
  styleUrl: 'app-button.css',
  shadow: true,
})
export class AppButton {

  @Prop() word:string;
  @State() count:number = 1;

  render() {
    return (
      <Host>
        <button>{this.word} {this.count}</button>
      </Host>
    );
  }

}
```

Then add the button component to app-home...

```ts
@Component({
  tag: 'app-home',
  styleUrl: 'app-home.css',
  shadow: true,
})
export class AppHome {
  render() {
    return (
      <div class="app-home">
        <p>
          Welcome to the Stencil App Starter. You can use this starter to build entire apps all with web components using Stencil! Check out our docs on{' '}
          <a href="https://stenciljs.com">stenciljs.com</a> to get started.
        </p>



        <app-button word="Click Me"/>



        <stencil-route-link url="/profile/stencil">
          <button>Profile page</button>
        </stencil-route-link>
      </div>
    );
  }
}

```

Run the server npm start and you'll see the button. When generating the components, Stencil is automatically managing to register the components with the app so you don't have to export or import the components across your app, nice!

## Events

While there is a Listen decorator you can use there is also the ability to just add an event in your JSX like you would in React.

```ts
import { Component, Host, h, Prop, State } from '@stencil/core';

@Component({
  tag: 'app-button',
  styleUrl: 'app-button.css',
  shadow: true,
})
export class AppButton {
  @Prop() word: string;
  @State() count: number = 1;

  render() {
    return (
      <Host>
        <button
          onClick={() => {
            this.count += 1;
            console.log(this.count);
          }}
        >
          {this.word} {this.count}
        </button>
      </Host>
    );
  }
}
```

Nice, no need to use a setState function you just assign the state a new value and tada it updated. Nice!

## Keep On Learning

This should be enough to keep you learning, checkout the documentation at StencilJS to learn more about other cool features:

- ability to emit events
- the stencil router

**Note**: If you are wondering about forms you have to use the same patterns you'd use React for forms.