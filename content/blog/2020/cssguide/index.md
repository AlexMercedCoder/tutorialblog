---
title: Ultimate CSS Reference
date: "2020-12-27T12:12:03.284Z"
description: "CSS All the Things!"
---

## What is this guide?

This guide will be a compilation of several bits about CSS syntax and concepts, so you can read this straight through but meant more as a reference you bookmark and come back to as needed.

## What is CSS?

Cascading Style Sheets is a language for defining styles that get applied to HTML pages. This is not a general-purpose programming language (Javascript, Python, Ruby) but like HTML a markup language with a specific purpose, styling (HTML for defining content structure).

CSS has evolved into quite a vast language with several tools to help shape the user interface and user experience (UI/UX) of web sites (Personal Blogs, Bios) and web applications (Things you sign up to use like Gmail or Facebook).

## CSS Files

CSS is written using files with a ".css" extension. These are then brought into HTML files by using link tags in the head tags of the HTML.

```html
<link rel="stylesheet" href="style.css" />
```

**Other Ways to Use CSS**

- You can write style sheets inside your HTML using style tags

```html
<style>

h1 {
    color: red
}
</style>
```

- You can write styles directly within your elements with inline styles

```html
<h1 style="color: red; font-size: 3em;">Hello World</h1>
```

Typically you'll use separate CSS files although inline styles and style tags can be useful when writing Native Web Components or components for React, Vue, Angular, or Svelte to help maintain encapsulation.

## Base CSS Syntax

There are three parts to a style

- **Selector** The target of the style
- **Properties** What you want to change/alter on the target
- **Value** What the property is being set to

```CSS

selector {
    property1: value1;
    property2: value2;
    property3: value3;
}
```

That is essentially how you write CSS so then it just becomes a journey in learning to understand the defaults of different HTML elements, the different ways to select them, and the properties we can alter.

- [List of CSS Properties](https://www.w3schools.com/cssref/)

## CSS Selector

- You can select a specific element

```css
/* Selecting any div*/
div {
    color: red
}
```

- You can select an element that is a descendant of another element.

```css
/* Selecting any h1 nested in a div at any level*/
div h1 {
    color: red
}
```

- You can select an element that is the direct descendant of another element.

```css
/* Selecting any h1 directly nested in a div (children, not grandchildren)*/
div > h1 {
    color: red
}
```

- You can select based on class

```css
/* select any element with the class heading like <h1 class="heading"></h1>*/
.heading {
    color: red
}
```

- You can select based on id
```css
/* select any element with the class heading like <h1 id="heading"></h1>*/
#heading {
    color: red
}
```

- You can select based on any attribute, even custom ones

```css
/* selects any element with a type attribute that is text like <input type="text">*/
[type="text"] {
    color: red
}

/* selects any element with a cheese attribute regardless of value <h1 cheese="doesn't matter">*/
[cheese] {
    color: red
}
```

- You can also mix and match these selectors

```CSS
/* select an h1 with the id title that is a direct descendant of a div with the class of heading*/
div.heading > h1#title {
    color: red
}
```

## CSS Specificity

A frustrating thing in CSS is you may have multiple styles that apply to the same element, the question becomes which style takes precedence. Two rules to remember:

1. The selector with the highest specificity wins
2. When specificity is the same, the one defined later wins (the document is read top-down by browser)

So knowing what selectors have a higher level of specificity becomes pretty important so here is the priority.

1. !important keyword (just overrides the whole process)
2. inline styles (1000 points)
3. ids (100 points)
4. attributes or classes (10 points)
5. element (1)

So if styling the following elements

### Example 1

```js
<h1 class="heading">Hello World</h1>
```

Both styles would select this element

```css
h1.heading {
    color: green;
}

.heading {
    color: red;
}
```

The first style will prevail cause it scores higher

- 11 points (10 points for 1 class and 1 point for 1 element)
- 10 points (10 points for 1 class)

### Example 1

```js
<h1 class="heading title">Hello World</h1>
```

Both styles would select this element

```css
.title {
    color: green;
}

.heading {
    color: red;
}
```

The second style will prevail cause it's a tie

- 10 points (10 points for 1 class)
- 10 points (10 points for 1 class)
- so the class defined later takes priority

### BEM

There are many conventions people use to avoid having to deal with specificity issues (OOCSS, Atomic, SMACSS, SUITCSS) but BEM has proven one of the most popular (at the end of the day what you use depends on the team you work with or your preference for personal projects.)

BEM stands for (Block-Element-Modifier)

- **BLOCK** a container representing an independent part of your UI
- **Element** an element in the container
- **Modifier** something that modifies a particular element or block

### Example

So let's say we plan on using this UL for our navigation

```html
<ul>
    <li>Products</li>
    <li>About Us</li>
    <li>Contact</li>
</ul>
```

using BEM I'd give it the following classes

```html
<ul class="nav">
    <li class="nav__li">Products</li>
    <li class="nav__li">About Us</li>
    <li class="nav__li">Contact</li>
</ul>
```

- nav is the block
- li is an element of the block marked with two underscores

What if I want the three menu items to be the same but I wanted to modify just the color of the third li? I would add the following class:

```html
<ul class="nav">
    <li class="nav__li">Products</li>
    <li class="nav__li">About Us</li>
    <li class="nav__li nav__li--color">Contact</li>
</ul>
```

- the modifier is signaled using two dashes so only the styles that are different than the other lis need to be specified in that class.

### Bottom Line

By only using classes with the BEM naming convention your style sheets will be easier to read as projects get larger and you'll avoid collision and specificity conflicts, but using BEM is only one possible convention.

## Block vs Inline elements

In HTML, all elements fall into one of two categories.

- **Block** Element that creates a rectangle that takes up the entire width and height is by default determined by the content inside the block. Blocks stack on top of each other by default.
    - div
    - header
    - nav
    - main
    - article
    - section
    - footer
    - ul
    - ol
    - li
    - body
    - p

- **inline** Like a character of the text, these elements just show up as inline content within the block they are currently in.
    - span
    - img
    - button
    - code
    - input
    - label
    - textarea

You can change inline elements to block, and block elements to inline by altering the display CSS property.

## Flexbox

Flexbox is a special value for the display property of a block. What flexbox does is the following:

- Alters how a block treats other block elements inside of it, instead of stacking them on top of each other stacking them into rows.

- Allows a host of new CSS properties to be used on the container and it's children to determine how the blocks stack, whether they wrap, how they align, and more.

To get familiar with FlexBox I recommend these resources:
- [CSS Tricks on Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [Flexbox Defense Game](http://www.flexboxdefense.com/)
- [Flexbox Froggy Game](https://flexboxfroggy.com/)

## Grid

Grid is another newer CSS Display property that does the following:

- Allow a grid to be defined in the container element

- Allow properties to define where in the grid child elements should be located

Resources for Grid:
- [CSS Tricks on Grid](https://css-tricks.com/snippets/css/complete-guide-grid/)
- [Grid Garden Game](https://cssgridgarden.com/)

### When to use Grid or Flexbox

At the end of the day you should do what works best for you to get the results you want but here is a guide that has worked well for me.

- If a block element has a variable number of block elements that will be inside it, use flexbox as it has better ways of dealing with a variable number of blocks (wrap)

- If a container element has a fixed number of blocks inside it (like a two-column layout) then grid is your best friend cause measurements like "fr" which are only available to grid make it super easy to keep the relative sizing of the blocks the same on any screen size.


## Centering Stuff

- For centering inline elements add the property `text-align:center;` to the container it is inside of.

- For block elements with a defined width, use `margin: auto` to center the block

- For items inside of a flexbox, justify-content and align-items will be amazing alignment tools. Sometimes I'll create flexboxes just to use these properties.

## Pseudo Selectors

A pseudo selector falls into one of two categories...

- **Psuedo Class** using one semi-colon denotes an element in a current state that you want to style during that state
    - **:hover** style the element when a mouse hovers over it
    - **:first-child** only target the element if it is the first child of the parent
    - **:focus** style when an input element is in focus
    - **:last-child** same as first-child but the last child of the container
    - **:only-child** only apply style if this is the only child
    - **:link** style of a link
    - **:visited** style a link that been visited

- **Psuedo Element** using two colons usually style something other than the target element, sometimes even adding content.
    - **::first-line** only style the first line of text in the element
    - **::before** using the content property adds content before the element, the styles apply to that content
    - **::after** using the content property adds content after the element, the styles apply to that content
    - **::part()** targets an element in a web component with a certain part from external styles
    - **::slotted()** targets an element slotted in a web component from internal styles

- [More on Pseudo Classes and Elements](https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Selectors/Pseudo-classes_and_pseudo-elements)

## CSS Variables

One thing that makes life easier is using CSS variables. By defining values you use over and over again using variables later on if you need to change them you can change them in one place.

### Defining a Variable

While this can be done in any selector it is typically done in the :root selector so the variables can be available to all your styles. CSS Variable named must be prefixed by two dashes.

```CSS

:root {
    --primary-color: black;
    --secondary-color: white;
}

```

### Using a Variable

You can use a variable using the var() css function.

```CSS
h1 {
    background-color: var(--primary-color);
    color: var(--secondary-color);
}
```

## Other CSS Functions

CSS has a handful of built-in functions for generating property values.

- [CSS Functions Reference](https://www.w3schools.com/cssref/css_functions.asp)