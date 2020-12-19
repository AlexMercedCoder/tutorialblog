---
title: Delivering JSON Data with Netlify
date: "2020-12-20T22:12:03.284Z"
description: Using Netlify to Deliver Static JSON
---

## Why use JSON to Deliver Data and What is JAMStack

Using backend applications allows you to pull data dynamically but also can result in higher costs in terms of money, speed, maintenance, and security issues. This is why JAMStack and the "Static" movement in Web Development is picking up speed.

Essentially JAMStack is made up of a few different principles:

- Pre-Render as much of the website as possible, avoid as much client and server-side rendering for the end-user as possible. This will increase speed, improve search engine optimization (easier for web crawlers to read static content), improve security (can't really manipulate dynamic processes if there aren't any), and lower the cost of hosting and scaling (serving static content MUCH cheaper). This is done with Static Site Generators (Hugo, NextJS, NuxtJS, Sapper, Gridsome, Gatsby, Scully, and Sapper).

- Use Headless CMSs to host the data this way clients can visually work with their data (Contentful, ButterCMS, GraphCMS, AgilityCMS, Webiny, Keystone, Hasura, and Strapi). Since the data is only used during build time not during each user's visit, the cost is much less to have a database.

- Using non-database sources like Markdown files, JSON Files, and YAML to store data statically to minimize the need for databases. By pulling the data from static files vs making database calls also minimizes costs.

You can find an exhaustive list of Static Site Generators and Headless CMSs at JAMStack.org.

So you can host data with static JSON files and be able to pull the data from those files like a normal API across multiple applications at build time and avoid the need for a database for small or simple datasets.

## Step 1 - Create Your Data

Create a folder and in that folder create a json file. For our purposes let's create a sample.json file with the following data.

```json
{
  "nes_games": [
    {
      "name": "Super Mario Bros.",
      "img": "https://upload.wikimedia.org/wikipedia/en/0/03/Super_Mario_Bros._box.png"
    },
    {
      "name": "Super Mario Bros. 2",
      "img": "https://www.mariowiki.com/images/thumb/e/ea/SMB2_Boxart.png/1200px-SMB2_Boxart.png"
    },
    {
      "name": "Super Mario Bros. 3",
      "img": "https://hb.imgix.net/4ea099299f6af1861ff8389bde0c34b6c4957224.jpg?auto=compress,format&fit=crop&h=353&w=616&s=86d8ce7ac94fb9cbb94b6322cb630cb1"
    }
  ]
}
```

- initiate a git repository
- push the repo to github, gitlab or bitbucket
- link a new project on netlify.com to the repo and deploy

Now when you go to ```[Your Netlify URL]/sample.json``` you should be seeing your JSON data.

## CORS Headers

The only issue is if you try to make a request for your data from another website you will get a CORS error. To fix this issue in your folder create a netlify.toml file. In this file put the following and it should allow you to fix this problem.

```toml
[[headers]]
  for = "/*"
    [headers.values]
    Access-Control-Allow-Origin = "*"
    Access-Control-Allow-Methods = "*"
    Access-Control-Allow-Headers = "*"

```

This will allow all origins to make all requests for every file in this project. You can customize this for the level of security you want.

## How this can be used

If you have simple data you are writing as JSON or exporting from software as JSON you can use this strategy to host the data in an affordable way on Netlify. Also if you have a paid Netlify account you can use webhooks to help trigger builds of your static site generator when the data changes (assuming they are different repos and deployments).