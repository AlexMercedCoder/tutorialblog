---
title: Frontend CRUD with Plain Vanilla JS
date: "2020-08-18T22:12:03.284Z"
description: "A Basic Exploration of Frontend DOM Manipulation"
---

## Our Mission

We will create some very basic data and then use plain vanilla JS to create CRUD operations from the DOM (Create, Read, Update, Delete).

## Setup

- in a folder somewhere on your computer create three files.

  - index.html
  - app.js
  - style.css

  this should be in your index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <link rel="stylesheet" href="style.css" />
    <script src="app.js" defer></script>
  </head>
  <body>
    <main></main>
    <div></div>
  </body>
</html>
```

Notice the defer keyword in the Javascript script tag. The purpose of this is to tell the browser to not run the JS until after the browser has rendered the HTML document so this way it exists before any of your code references element on the website.

## What is the DOM

The DOM (Document Object Model) is how Javascript interacts with the website. What's actually happening is the browser reads your html file and builds out a tree of javascript objects representing each element, this object is known as the "document". You can manipulate this object and those changes will be reflected in the browser screen to the user.

## The Data

In your javascript let's create an array of objects to render to the DOM.

```js
const people = [
  { name: "Alex Merced", age: 35 },
  { name: "Bob Jones", age: 65 },
  { name: "Steve Smith", age: 22 },
  { name: "Macie Willis", age: 32 },
  { name: "John Jingle", age: 40 },
]
```

## Rendering the Data (cRud)

So what we are going to do now is target the main element in your html and add all the data in the array to the DOM one by one. Ideally we don't want to write the logic over and over again, so a loop will be our friend and the for of loop makes it easy to loop over an array.

```js
///////////////////////
// Global Data
///////////////////////

const people = [
  { name: "Alex Merced", age: 35 },
  { name: "Bob Jones", age: 65 },
  { name: "Steve Smith", age: 22 },
  { name: "Macie Willis", age: 32 },
  { name: "John Jingle", age: 40 },
]

//document.querySelector takes a css selector and returns the first element that matches that selector
const mainDiv = document.querySelector("main") // returns the one main element in our html

///////////////////////
// Functions
///////////////////////

//define function for rendering current data to DOM, use this whenever data changes
const renderData = () => {
  //empty of the main div of any existing content
  mainDiv.innerHTML = ""

  //let us loop over the people array
  for (person of people) {
    const personH1 = document.createElement("h1") // Creates new h1 element
    personH1.innerText = `${person.name} is ${person.age} years old` //ads text to the h1
    mainDiv.appendChild(personH1) //append the h1 to the main element
  }
}

////////////////////
// Main App Logic
////////////////////

renderData() //call the render data function for the initial rendering of the data
```

Read the comments for explanations of what each like is doing.

## Add new items (Crud)

Let's add a form in the div in our html

```html
<body>
  <main></main>
  <div id="form">
    <input type="text" name="name" placeholder="name" />
    <input type="number" name="age" placeholder="age" />
    <button id="createitem">Submit</button>
  </div>
</body>
```

now it our javascript we will add a function that will add the form data into a new object and push it into the array, then afterwards we will call our renderdata function to update the list of people.

```js
///////////////////////
// Global Data
///////////////////////

const people = [
  { name: "Alex Merced", age: 35 },
  { name: "Bob Jones", age: 65 },
  { name: "Steve Smith", age: 22 },
  { name: "Macie Willis", age: 32 },
  { name: "John Jingle", age: 40 },
]

//document.querySelector takes a css selector and returns the first element that matches that selector
const mainDiv = document.querySelector("main") // returns the one main element in our html

//below we will add our form inputs to some global variables
const nameInput = document.querySelector('input[name="name"]') //selecting the input with name property "name"
const ageInput = document.querySelector('input[name="age"]') //selecting the input with name property "name"
const createButton = document.querySelector("button#createitem") //select button with id "createitem"

///////////////////////
// Functions
///////////////////////

//define function for rendering current data to DOM, use this whenever data changes
const renderData = () => {
  //empty of the main div of any existing content
  mainDiv.innerHTML = ""

  //let us loop over the people array
  for (person of people) {
    const personH1 = document.createElement("h1") // Creates new h1 element
    personH1.innerText = `${person.name} is ${person.age} years old` //ads text to the h1
    mainDiv.appendChild(personH1) //append the h1 to the main element
  }
}

const createData = () => {
  const name = nameInput.value //store value from name input into name variable
  const age = ageInput.value //store value from age input into age variable
  const newPerson = { name, age } // create new person object
  people.push(newPerson) //push the new person object into the array
  renderData() //render the data again so it reflects the new data
}

////////////////////
// Main App Logic
////////////////////
renderData() //call the render data function for the initial rendering of the data
createButton.addEventListener("click", createData) //trigger create data function whenever createButton is clicked
```

Read the comments to what each line of code does.

## Delete an item (cruD)

Now update and delete is where things begin to get tricky. We need to be able to tell which item we want to delete or update. A normal for...of loop doesn't really have a built in way to have access to the index as it loops over the array. The forEach array method does allow us to have the index available so we'll need to refactor our render data function.

Why? Because we need to add update and delete button when we render each item to the DOM and that's the best place to do it. The delete and update buttons need to have the index to do the desired so we need handle all that during the loop when the index is available and in scope. (These are the times we start to see why people love Vue, Angular, React and Svelte so much)

```js
///////////////////////
// Global Data
///////////////////////

const people = [
  { name: "Alex Merced", age: 35 },
  { name: "Bob Jones", age: 65 },
  { name: "Steve Smith", age: 22 },
  { name: "Macie Willis", age: 32 },
  { name: "John Jingle", age: 40 },
]

//document.querySelector takes a css selector and returns the first element that matches that selector
const mainDiv = document.querySelector("main") // returns the one main element in our html

//below we will add our form inputs to some global variables
const nameInput = document.querySelector('input[name="name"]') //selecting the input with name property "name"
const ageInput = document.querySelector('input[name="age"]') //selecting the input with name property "name"
const createButton = document.querySelector("button#createitem") //select button with id "createitem"

///////////////////////
// Functions
///////////////////////

//define function for rendering current data to DOM, use this whenever data changes
const renderData = () => {
  //empty of the main div of any existing content
  mainDiv.innerHTML = ""

  //let us loop over the people array
  people.forEach((person, index) => {
    const personH1 = document.createElement("h1") // Creates new h1 element

    const buttonContainer = document.createElement("aside") //create aside to store update/delete buttons

    //Delete Button
    const deleteButton = document.createElement(`button`) //create delete button
    deleteButton.id = index
    deleteButton.innerText = "Delete" //make the delete button say "Delete"
    deleteButton.addEventListener("click", event => {
      people.splice(index, 1) //remove the element at the current index
      renderData() //re-render the updated data to the DOM
    })
    buttonContainer.appendChild(deleteButton) //apend the delete button

    personH1.innerText = `${person.name} is ${person.age} years old` //ads text to the h1
    mainDiv.appendChild(personH1) //append the h1 to the main element
    mainDiv.appendChild(buttonContainer) //append container of update and delete button
  })
}

const createData = () => {
  const name = nameInput.value //store value from name input into name variable
  const age = ageInput.value //store value from age input into age variable
  const newPerson = { name, age } // create new person object
  people.push(newPerson) //push the new person object into the array
  renderData() //render the data again so it reflects the new data
}

////////////////////
// Main App Logic
////////////////////
renderData() //call the render data function for the initial rendering of the data
createButton.addEventListener("click", createData) //trigger create data function whenever createButton is clicked
```

## The Update Button (crUd)

So now we'll add a update button very similar to how we added the delete button but some more steps are needed. We need an extra form for handling updates with another button to handle updating the correct element. So the update button doesn't update but populates the update form with the existing data and when the submit button is hit on that form then the data is updated and re-rendered.

index.html

```html
<body>
  <main></main>
  <div id="form">
    <input type="text" name="name" placeholder="name" />
    <input type="number" name="age" placeholder="age" />
    <button id="createitem">Submit</button>
  </div>
  <div id="form2">
    <input type="text" name="updatename" placeholder="updated name" />
    <input type="number" name="updateage" placeholder="updated age" />
    <button id="updateitem">Submit</button>
  </div>
</body>
```

app.js

```js
///////////////////////
// Global Data
///////////////////////

const people = [
  { name: "Alex Merced", age: 35 },
  { name: "Bob Jones", age: 65 },
  { name: "Steve Smith", age: 22 },
  { name: "Macie Willis", age: 32 },
  { name: "John Jingle", age: 40 },
]

//document.querySelector takes a css selector and returns the first element that matches that selector
const mainDiv = document.querySelector("main") // returns the one main element in our html

//below we will add our form inputs to some global variables
const nameInput = document.querySelector('input[name="name"]') //selecting the input with name property "name"
const ageInput = document.querySelector('input[name="age"]') //selecting the input with name property "name"
const createButton = document.querySelector("button#createitem") //select button with id "createitem"

//below we will add our update form inputs to some global variables
const updateName = document.querySelector('input[name="updatename"]') //selecting the input with name property "name"
const updateAge = document.querySelector('input[name="updateage"]') //selecting the input with name property "name"
const updateFormButton = document.querySelector("button#updateitem") //select button with id "createitem"

///////////////////////
// Functions
///////////////////////

//define function for rendering current data to DOM, use this whenever data changes
const renderData = () => {
  //empty of the main div of any existing content
  mainDiv.innerHTML = ""

  //let us loop over the people array
  people.forEach((person, index) => {
    const personH1 = document.createElement("h1") // Creates new h1 element

    const buttonContainer = document.createElement("aside") //create aside to store update/delete buttons

    //Delete Button
    const deleteButton = document.createElement(`button`) //create delete button
    deleteButton.id = index
    deleteButton.innerText = "Delete" //make the delete button say "Delete"
    deleteButton.addEventListener("click", event => {
      people.splice(index, 1) //remove the element at the current index
      renderData() //re-render the updated data to the DOM
    })
    buttonContainer.appendChild(deleteButton) //apend the delete button

    //Update Button
    const updateButton = document.createElement(`button`) //create update button
    updateButton.id = index
    updateButton.innerText = "Update" //make the delete button say "Delete"
    updateButton.addEventListener("click", event => {
      updateName.value = person.name //set form to show current name
      updateAge.value = person.age //set form to show current age
      updateFormButton.setAttribute("toupdate", index) //custom attribute to use in the button event later
    })
    buttonContainer.appendChild(updateButton) //apend the delete button

    personH1.innerText = `${person.name} is ${person.age} years old` //ads text to the h1
    mainDiv.appendChild(personH1) //append the h1 to the main element
    mainDiv.appendChild(buttonContainer) //append container of update and delete button
  })
}

const createData = () => {
  const name = nameInput.value //store value from name input into name variable
  const age = ageInput.value //store value from age input into age variable
  const newPerson = { name, age } // create new person object
  people.push(newPerson) //push the new person object into the array
  renderData() //render the data again so it reflects the new data
}

const updateData = event => {
  const index = event.target.getAttribute("toupdate") //get index we stored via custom attribute
  const name = updateName.value //get value from form
  const age = updateAge.value //get value from form
  people[index] = { name, age } //replace existing object at that index with a new with updated values
  renderData() //update the DOM with the new data
}

////////////////////
// Main App Logic
////////////////////
renderData() //call the render data function for the initial rendering of the data
createButton.addEventListener("click", createData) //trigger create data function whenever createButton is clicked
updateFormButton.addEventListener("click", updateData) //trigger update data function when updateButton is clicked
```

There you go, you got full CRUD functionality. The only issue is really keep track of updating the DOM everytime you change the data gets pretty frustrating. This is one of the main ways that libraries like Vue, React, Angular and Svelte really make life a lot easier as they bind the data to your UI so when the data updates your UI should automatically update saving you the trouble in having to think re-rendering yourself.
