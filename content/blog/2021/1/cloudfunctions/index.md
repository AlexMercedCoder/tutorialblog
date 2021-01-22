---
title: Cloud Functions - Server-Side Code On Demand
date: "2021-01-22T12:12:03.284Z"
description: Why you should embrace serverless tech
---

## How things have been done

Up till now for any server-side code, your application needed you would need to create your own web server with frameworks like Express, Ruby on Rails, Django, etc. These servers would need to be hosted and running 24/7 so they were ready to go anytime a request was made to them. Two problems with this.

- VPS hosting is usually charged by the hour, resulting in you paying a lot more for the time in which no requests were sent to your server cause your server is running.

- Creating a whole web server for basic tasks like reverse proxies for hiding API credentials and very basic APIs was overkill in work on top of the bill to host.

## Serverless Cloud Functions

What a serverless cloud function is, is literally a function that runs on demand. You essentially creating a function that will be run by the provider's servers when certain events trigger them. It's serverless in the sense you didn't have to build your own web server application.

**Possible Triggers**

- Request sent to URL
- File gets uploaded
- Data gets added to a database

**Popular use cases**

- Uploading a file triggers a cloud function that will create an optimized version of images in different sizes

- Making a request to a URL triggers a function that makes a request to an API with your hidden credentials and returns the data to your frontend

- Making a request to a URL makes a one-time connection to your database to query or add data

- Adding data to your database triggers a function that runs optimizations for your data

**Benefits**

- You don't have to create an entire web server, just the function for the task you want and then associate it with a trigger.

- You pay per use of the function and often the first several thousands of requests are free each month. So if you make smart use of static site generation and webhooks to trigger builds, you can really minimize requests and your bill.

(**IMAGINE**: You build a website with a Static Site Generator that pulls the data at a build time via one cloud function and host it on Netlify/Vercel. Whenever you add data another cloud function then makes a request to a Netlify/Vercel webhook which rebuilds your site pulling the new information. Even if your site is visited 1,000,000 times you'll probably only invoking your cloud functions a couple of hundred times. You can have high traffic but the small bill of a static site.)

**Downsides**

- Vendor lock-in, cloud functions are heavily tied into the provider's systems. So Amazon Lambda cloud functions can be triggered by changes in Amazon products, same for Google or Azure (you can create custom triggers, but more work). 

- Also if you want to switch providers, the syntax and process for creating a function differ by provider. (The Serverless framework aims to be a uniform tool for using different cloud providers)

- You'll never have as granular control as if you built and managed yourself, but not many applications I can imagine would find themselves too limited by Cloud Functions (And those limitations are constantly getting smaller).

## Where to get started

Any of the major cloud providers allow you to make cloud functions directly with them.

- Amazon Lambdas 
- Google Cloud Functions
- Azure Functions
- IBM Cloud Functions
- Oracle Functions
- Alibaba Functions
- Fly.io (more of a container host)

Generally, most other serverless function providers are abstractions over the infrastructure of these providers.

- Firebase Functions is built on Google Cloud
- Netlify is built on top of Amazon Lambda
- Vercel I'm sure is also built on top of one of these cloud companies

Other Services of note

- Cloudflare Workers
- Iron.io
- Apache OpenWhisk (Seems like open-source software to create your Function as a Server FaaS server)
- Contentful (Seems to offer some Serverless Features in their CMS)
- Webiny (Open-source CMS built to use Serverless Functions)
- Nuclio.io (Serverless Functions for Data Science Pipelines)
- Kubeless (Like OpenWhisk, helps you create your own FaaS Server)

## How to Get Started

Probably the easiest way to start is using Netlify and Vercel so below are links to their documentation on using that part of their services along with a video explanation.

#### Vercel

- [Documentation](https://vercel.com/docs/serverless-functions/introduction)
- [Video](https://www.youtube.com/watch?v=BhArBPtW6Ms)

#### Netlify

- [Documentation](https://docs.netlify.com/functions/overview/)
- [Video](https://www.youtube.com/watch?v=WA0p7VGkers)