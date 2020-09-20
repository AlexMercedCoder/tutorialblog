---
title: Passing Data Between Components in Vue
date: "2020-09-20T22:12:03.284Z"
description: Props, Queries and Events oh my!
---

## The dilemma

When you are using a modern front-end UI framework that is based around building components (React, Vue, Svelte and Angular), you get some very nice benefits for large data intensive projects...

- Reactive Data, your UI will update based on changes in data
- Encapsulation, since components are defined separately, they are reusable.
- Speed Optimization, Shadow DOM and good data management lowers the amount of re-rendering, resulting in faster performance.

Although, for all this bountiful goodness, you get one huge catch.

- State Management, since each component is a walled garden, they don't see each other's data, which can be cumbersome when many components need to make use of the same data.

Communication usually occurs between parent and children components and not through siblings, so state management becomes a game thinking through how data will traverse the component tree. Some people bypass altogether with libraries like Redux, NGRX, Vuex, and MobX that allow you to manage state at a application level but this may come at the cost of less encapsulation and reusability of components.

In this article I hope to explain how traverse data among Vue components. First we always have to think which component is speaking to which.

## #1 Parent => Direct Child: Props/$attrs

So let's say in the Parent component the template looks like this.

```html

<template>

<Child/>

</template>

```

The Child component is being directly rendered by the Parents template, so we'll call this a direct child. We can pass information by including attribute in the Child tag like so.

```html

<template>

<Child hello="world" v-bind:cheese="cheese"/>

</template>

```

So here we are passing two attributes, hello and cheese. Hello is just directly passing the string world down to the child component. The second attribute is using v-bind to pull from its data object, so in this case it will look in data for property named cheese and pass it to the child as a property named cheese.

Now how do we access the property in the child? By default all the attributes are stored in this.$attrs (attributes) so they'd be this.$attrs.hello and this.$attrs.cheese but this seems like excessive typing... we can make them this.hello and this.cheese by bringing them in as props. To do this we have to declare the props in the components Vue Instance.

```js
export default {
    name: "child",
    props: ["hello", "cheese"]
}

```

Adding the props property allow the component to anticipate the attributes and move them over where they can access with less characters.

## From Parent to Router-View

Vue Router is great tool for making a single page application feel more like a multi-page application but it does create one challenge for us, passing data. Usually the component is rendered directly by the parent and we just can pass props to it from there, but with router a ```<router-view>``` component fills the gap on where a component would be depending on the url in the url bar. 

To pass data we can use a query, how we pass down the query depends on whether we invoke the route using ```<router-link>``` or push. So you can see both below where we pass some information.

```html

<router-link :to="{path: '/route', query: {hello: 'world', cheese: this.cheese}}">

```

using push

```js

this.$router.push({path: '/route', query: {hello: 'world', cheese: this.cheese}})

```

This data then becomes then becomes available to the view being rendered by the router by this.$route.query

## Sending Data to Parents, Emit Events

Sending data up the component tree is often more difficult. In Vue and Angular children will emit event that parents can listen for while in react there really isn't a built in way other than sending down methods from the parent via props.

So the way it works in vue is that the child components would emit an event and send some data with the event.

```js
export default {
    name: "Child",
    methods: {
        itHappened: function(){
            this.$emit("it", {hello: "world", cheese: this.cheese})
        }
    }
}


```

the parent can then listen for the event and handle it appropriately.

```html
<template>
<Child @it="handleIt($event)">
</template>

<script>
import Child from "./Child.vue"

export default {
    name: "Parent",
    components: {
        Child
    },
    methods: {
        handleIt: function(event){
            console.log(event)
        }
    }
}

</script>
```

So you will see the event will be logged by handleIt, the event contains the data sent up with which you can do with what you want. 

## Conclusion

Data can be frustrating to move from component to component but know how to do so is the first step. Also I highly recommend adding the Vue devtools in your browser so you can inspect the data in your components at any point it'll save hours of endless logging.