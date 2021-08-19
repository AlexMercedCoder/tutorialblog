---
title: The renaissance of server side rendering with Alpine and HTMX, Reactivity with Minimal JS
date: "2021-08-19T14:12:03.284Z"
description: A Beginning oriented dive into databases
---

One of the biggest recent trends has been to have MORE javascript in your web applications whether that meant doing your backend web server in node/deno or shifting your entire stateful view logic into the client using frontend frameworks like React and Angular.

Recent I did a video a series where I build an API with express/mongo and consumed that api in the following:
- React
- Angular
- Svelte
- Vue
- SolidJS
- RiotJS
- StencilJS
- Native Web Components
- AMPonent
- Lit-Element
- Plain Vanilla Javascript

If you want to checkout that video series start with the API build you can find [HERE](https://youtu.be/tAjfO5hIzY8).

## Don't Call it a Comeback

There are a lot of things some developers don't like about this client-side driven trend:

- Since the page is rendered after load, search engines may not be able to crawl all the content

- Having more javascript in the client can impact performance and security especially at scale

- If you are a non-javascript developer... well you have to learn javascript.

To solve many of these issues we are seeing two trends:

- Each of the major frameworks are seeing new "meta frameworks" built on top of them that allow for server-side, static and client-side rendering. (React => Next, Vue => Nuxt, Svelte => SvelteKit)

- For those with simpler needs or don't want to learn javascript there has been new tool bring reactive client side logic to HTML.

This article will be focusing on the latter trend.

## Going from JS-centric to HTML-centric

Regardless of what languages you are using for your backend, at least one server-side templating library exists that allows you to use that languages in defining your view logic:

- Javascript => EJS
- Ruby => ERB
- PHP => Blade
- Python => Jinja
- Go => Plush
etc.

This allows you to keep all your stateful logic in the backend, the only thing you can't do is add reactivity cause that requires client-side javascript. So even with the templating library to toggle the visibility of an image or to update a piece of the ui would require small bits of javascript and jQuery would be the go to library to help out.

Several framework specific solutions have come to existence to give server-side templating more client side power, in particular:

- Ruby/Rails => TurboLinks/Hotwire
- PHP/Laravel => Livewire

What these tools do is allow for pre-loading of pages linked on the website and swapping of html on the page giving it a very fast client side interactive feel without all the javascript.

What if your not using Rails or Laravel? A combination of AlpineJS and HTMX can give you the same firepower to supercharge your server-side templates without having to dabble much at all in javascript.

[VIDEO OF ME USING ALPINE AND HTMX](https://youtu.be/LiwcdDfnJMc)

## Alpine

What Alpine does in a very small package (around 10kb) gives you a bunch of HTML directives to inject some basic stateful reactive logic into your HTML pages without having to write any (occasionally a little) javascript.

#### Step 1 - Add Alpine

In you head tag add the Alpine CDN

```html
<script src="https://cdn.jsdelivr.net/gh/alpinejs/alpine@v2.x.x/dist/alpine.min.js" defer></script>
```

[The Alpine Docs](https://github.com/alpinejs/alpine/tree/v2.8.2#x-bind)

#### Step 2 - Use Alpine

So below we see an example of directives `x-data`, `x-show`, `x-bind` and `@click`.

- `x-data` This defines a javascript object to act as state available to that html element and its children

- `x-show` This defines whether an element should be visible based on a JS express which can reference the available state from `x-data`

- `@-click` Define an expression to run on the click of the element, which refer to and alter the state available in `x-data`

- `x-bind` Bind an html attribute to a javascript express which can reference the state in `x-data`

```html

<div x-data="{open: false, color: 'blue', color2: 'red'}">
        
        <img x-show="open" 
        src="https://pbs.twimg.com/profile_images/1378037175220981760/NqJolFmD_400x400.jpg">

        <button @click="open = !open">Show Image</button>

        <input type=text x-bind:value="open ? color : color2"/>

</div>

```

So the above should show a button, when the button is clicked it toggles the open property in the state defined in x-data. Also the input should display text based on the open property, displaying other properties from the state. You essentially inject state by injecting dynamic data through templating in the state allowing for your templating to effect Alpines client-side behavior.

On top of the above in total Alpine offers 14 directives and 6 magic functions you can write in your html to get interactivity without having to write Javascript.

## HTMX

HTMX allows you generate http requests allow with pretty much any user interaction, of any method (get, post, put, delete). You can then direct it to take the html in the requests response and render it where you want.

- JSON Paradigm with SPA's: I click on button to view user data, application makes a request to API, data arrives and then framework renders data to the DOM.

- HTMX html paradigm: I click on a button to view user data, application makes a request, server renders a html template with the user data and send it back, HTMX takes that html response and swaps the HTML in a target location with the new html. Giving the same effect, but not having to write ANY javascript.

#### Step 1 - Install HTMX

Just add the HTMX script tag to the pages head tag

```html
<script src="https://unpkg.com/htmx.org@1.5.0"></script>
```

[HTML DOCUMENTATION](https://htmx.org/)

#### Step 2 - Use HTMX

```html
<main>
        <h1>Saying, let's fill in the div below</h1>
        <div id="target"></div>
        <button 
        hx-get="/bread" 
        hx-trigger="click"
        hx-target="div#target"
        hx-swap="innerHTML"
        >Fill It In</button>
    </main>
```

So let's walk through the directives on the button tag:

- `hx-get` makes a get request to "/bread"
- `hx-trigger` the request is triggered when this element is clicked
- `hx-target` the response will be used to alter the div with an id of "target"
- `hx-swap` replace the innerHTML of the target with the response of the request

So if in my backend server I had a route for "/bread" that returns some html it will be swapped out with a click.

## Conclusion

Alpine and HTMX are two different libraries and can be used separately but in conjunction with your preferred templating library can give you a paradigm where you can almost write no Javascript in building interactive web applications and maintain security and seo of server-side rendering.