---
title: Building a Blog with Agility Headless CMS
date: "2020-12-19T22:12:03.284Z"
description: Using Headless CMS's
---

## What is a Headless CMS

A Headless CMS is hot trend in web development. It provides a ready to go way to manage your data with a visual dashboard like traditional CMS (Wordpress, Drupal) but allows you pull the data via an API so you can use the frontend technologies of your choice. Headless CMS's are a power and popular combo with a Static Site Generator but can be used in most web applications.

To see a list of all Headless CMS solutions and Static Site Generators checkout the directories at JAMStack.org.

## Step 1 - Open Up a Agility CMS Account

Head over to agilitycms.com and open a free account!

## Step 2 - Create a Blog Model

Once on the dashboard select the model panel then:

1. Select Content Definitions

2. Click add

3. name the model blog and set type to list

4. Add the following fields (feel free to add more)
    - a text field named title
    - a multi-line text field named body
    - a date field called date that defaults to the current date

5. Save the model

## Step 3 - Add some content

On the menu on the left select the content section are:

1. Select the plus sign for new content

2. Select a new list of item type blog

3. name the new list "myblog"

4. Add a few posts to myblog

5. When do adding post make sure to hit "publish" (select the posts before hitting publish)

## Step 4 - Retrieve the Data in your Javascript

Whether you are using backend or frontend javascript to retrieve your posts, below is the syntax for calling your blog posts with your preferred JS HTTP request method. Once you receive the data just allow your frontend to render however you like (using jQuery, React, Vue, Svelte, or Angular)

#### $.ajax

```js

const guid = //get guid in the settings section under api keys

const apikey = // get apikey in the setting section under api keys

$.ajax({
 url: `https://api.aglty.io/${guid}/fetch/en-us/list/myblog`,
 headers: {
     accept: "application/json",
     APIKey: apikey
 }   
})
.then((response) => {
    console.log(response)

    //use the data to populate your webpage from here
})

```

#### fetch
```js

const guid = //get guid in the settings section under api keys

const apikey = // get apikey in the setting section under api keys

fetch(`https://api.aglty.io/${guid}/fetch/en-us/list/myblog`,{
  headers: {
     accept: "application/json",
     APIKey: apikey
 }   
})
.then((response) => response.json())
.then((data) => {
    console.log(data)

    //use the data to populate your webpage from here
})

```

#### Axios

```js

const guid = //get guid in the settings section under api keys

const apikey = // get apikey in the setting section under api keys

axios({
  url: `https://api.aglty.io/${guid}/fetch/en-us/list/myblog`,
  headers: {
     accept: "application/json",
     APIKey: apikey
 }   
})
.then((data) => {
    console.log(data)
    console.log(data.data) // <== This is the api data

    //use the data to populate your webpage from here
})

```