---
title: In-Depth Guide on Understanding Deploying Web Apps
date: "2021-01-01T12:12:03.284Z"
description: Servers, Ports and Environmental Variables oh my
---

## What we will be discussing

This guide is meant for people who've done some level of web development and may have done some basic deployments with Heroku or Netlify and really want to better understand what is happening when they deploy their apps. This will be a longer read covering a lot of concepts so you may want to explore it over multiple sittings but it will be worthwhile if you attempt to read this entire guide.

## How the Web Works

To really understand deployment we need to understand how the web works and all the moving pieces that allow us to communicate around the globe the way we do. So let's start:

#### The Browser

Your browser is really the heart of the "client" experience. The browser allows an internet user to type in requests for different resources from the web and render them into a unified user experience.

When you type a URL into the address bar of a browser and hit enter the browser does what is called an HTTP request (Hyper Text Transfer Protocol) which is a process by which computers send text-based information to each other. Literally, every image, site, video, and audio piece of content you experience starts as a stream of text going into your browser to then be rendered.

So we know we are just sending text back forth between computers all over the world, but how do these requests know where they are going and how they should be handled?

`http://www.alexmercedcoder.com/cheese?type=gouda&taste=good`

Let's break down this url

- **http://** This is the protocol being used to make a connection to the eventual web server. HTTP/HTTPS protocol makes a one-way connection to the server to send the request, when the server processes the request it then generates a response and will open a new connection to send it back. Think of this as two pen pals mailing each other letters back and forth. ws/wss protocol are web sockets where an open connection is made between two points and each side listens for events from the other. Imagine a volleyball game where the players on both sides are alert cause the ball can be volleyed over to their side at any moment. http/ws traffic is not encrypted by SSL and is by default directed to IP Port 80 on the destination server while https/wss traffic is secured by SSL and directed to port 443.

  - IP Ports are places where internet requests can be received by a computer, imagine them like the different piers in a seaport and the boats docking the piers being internet requests. Servers can listen to requests on port numbers up to 65535 (not that you'd ever want that many servers running on one computer).

- **www.alexmercedcoder.com** this is the host made of the domain (alexmercedcoder.com) and the subdomain (www.). When the request is made your browser sends the request to your internet router who then sends it to your internet service provider. The ISP then consults DNS Servers(Domain Name Service) which are like giant phone books matching up the domain/subdomain with the IP address of the server that has the content.

  - Once the request arrives at the IP address the destination server is usually running web server software like Nginx or Apache which listens for http/ws requests on port 80 and https/wss traffic on 443 then directs it to other applications that are running at different ports on the machine (many hosting providers referred to this as "shared hosting").

- **/cheese** This is called the endpoint or slug. Once the request finally reaches your application it will be able to determine how to respond based on the slug. The application usually either runs one of several controller functions to generate a response or if acting as a static file server treats the slug as a file path to find a particular file. "/cheese" on a static server would look for a folder called cheese and default to returning the index.html in that folder. If I wanted a different file I'd specify it, "/cheese/somePicture.jpg".

  - The response always comes with a status code. If the server found a controller function or static file associated with the slug it'll respond with a 200. If it cannot find a way to respond it will send a 404 not found response. If there is some error in completing the response you'll get a 500 level response and if your browser used a cached version of the request you'll get a 300 level response.

- **?type=gouda&taste=good** This is a URL query. The server may expect these with certain slugs to get more information. For example, when you view a video on youtube, which video should be shown on the page comes from a URL query (watch a youtube video and look at the URL.). In this example, I've sent the server a type query with a value of gouda and a taste query with a value of good, which does nothing unless the server expected to receive these queries. The "?" signifies the beginning of the query and the "&" separates the different queries.

#### In Summary

How does a request work...

1. User types a URL in the address bar of a browser
2. request is sent to users router/modem
3. request is routed to users ISP
4. ISP sends a request to a DNS server
5. DNS server directs requests to the host ip address
6. The web server running on the host machine then directs it to the right port on that machine for that particular site or application
7. the applications server then uses the slug/endpoint to determine how to respond (either with a static file or by a controller function)
8. the response is sent to the browser
9. If the browser receives an html it'll then make further requests for linked js, css, and image files.

## Application Architecture

Nowadays there are several ways to architect your application and this will affect how you will eventually deploy your application.

- **Frontend Only Application** This can range from pure static html/css/js or a more elaborate single page application built with React, Svelte, Vue, Angular, or with Native Web Components. These sites are usually deployed using static servers which is essentially what services like Vercel and Netlify provide or with traditionals hosts where you upload files to some web server space that are statically served. When using a framework like React and friends, these services connect your deployment to your project's Github then anytime you update GitHub it runs your project's build command and serves the output statically.

- **Full-Stack Applications** These are applications where you create a more complex server (not static) that does more advanced data manipulation and then uses that data with a template engine (ejs, blade, erb, plush, pug) to generate static HTML from the server which is then sent to the client. This generally needs more robust deployment services so either requires you to set up your own server using a VPS from Amazon, Microsoft, Google, Linode, Digital Ocean, or other cloud services or using a service like Heroku which simplifies many of the setup steps.

- **Backend and Frontend Applications** Nowadays applications are so complex they are really many applications or "Micro Services" handling dedicated parts of the application. You may have one backend application that only handles user authentication while other applications then handle different products (think of Google's vast array of services). All these backend microservices will be deployed like a full-stack application using a service like Heroku while the frontend will be built as a separate application deployed by a service like Heroku. The frontend application will make requests to all the API's these microservices deliver. This makes the architecture more modular and reusable for different client-side platforms (desktop, mobile, devices).

- **Serverless** This takes microservices to the next level where you just don't have backend applications at all. Instead, all your APIs are built as several cloud functions that run on-demand which then have URLs for your frontend to call them. Since you don't have to have a persistent backend server running 24/7 and with the much lower-cost of static hosting for the frontend, taking a serverless approach can be very affordable even at large scales. AWS, Azure, and Google all offer cloud function platforms and Netlify offers a nice abstraction of Amazon's Cloud Functions and Firebase offers a nice abstraction over Google's Cloud functions service.

## Hosting Options

If running a static website with basic html/css/js files there are endless hosting solutions usually using Apache Servers running PHP based cPanel dashboards. Although If you want to use React/Vue/Svelte/Angular you are going to want a service with Continuous Deployment so you don't have to reupload all your content each time you deploy and that's where Netlify and Vercel fit in wonderfully. 

- *Continuous Deployment* is the concept of creating an automated pipeline of your deployment process. Typically this takes the form of updating your code on GitHub which then triggers automation that ends in your project being deployed (Netlify and Vercel make this very easy). This type of pipeline is also used to integrate code from others into a project automating a pipeline of tests and this is referred to as Continuous Integration. (CI/CD)

### Virtual Private Server (VPS)

When expanding beyond the world of static hosting to build applications with frameworks like Laravel/PHP, Django/Python, Express/JS, Rails/Ruby, Spring/Java, Buffalo/Go, and many more you'll need more control over your deployment environment. This mainly involves getting a virtual private server, an imaginary computer of your very own with its own public IP address. This would then involve a process that looks like this.

- Provision a VPS from services like AWS, gCloud, Azure, Linode, Digital Ocean
- setup a firewall to only allow externals requests to port 80 & 443
- Install Apache or Nginx
- installing any database servers your app uses
- clone your application from github with git
- run your app and make sure to point it to the local database server
- run your application on a port (for example, port 3000)
- configure apache/nginx to route requests for your application to the correct port

### Heroku

Heroku abstracts much of this process and reduces it to connecting your github or pushing it to a custom remote repo and gives you many features for debugging and enhancing your app.

- add a database to your project with just a click
- easily configure your environment variables
- setup CI/CD pipelines with buildpacks
- deploy using docker containers
- support for most languages (all if using docker)

### Docker & Kubernetes

Docker really simplified a lot of this process cause the server doesn't really matter. Instead what you do is build containers that hold your application file in a little mini-environment with everything your app needs to run then Docker is installed on the server and runs the container in isolation. To take it a step further you can use Docker Compose to define how multiple containers interact with each other (a container that has your database server connecting to another with your application server as an example).

These containers are like photographs so you can replicate them quickly to have the same app running on multiple servers making scaling much easier. This is where Kubernetes comes in where you can create custom logic for scaling your applications (imagine setting rules that when you reach a certain amount of traffic to automatically generate a new server and run your applications containers on it without having to have someone sit and monitor network traffic all day).

A great way to get started is making Docker containers of simple applications and deploying them to Heroku or via Fly.io.

## Environmental Variables

Your machine and the software it runs is your environment. Variables that your operating system tracks and makes available to all processes running are called environment variables. To hide sensitive data, a strategy to store that data not in your code but be able to pull them from your environment via your code is by using environment variables (this way people who read your code can't see the underlying values).

Most programming languages have libraries to define variables you want to add to your environment when your applications runs whether be in JSON/YAML/TOML files or in an ever-popular .env file. Regardless all these libraries do is add these variables to the OS environment when the application runs and then your app pulls them from the environment.

Heroku allows you to define them using "config vars" in the settings section but works the same way.

Keep in mind, Environmental variables don't help you hide information in frontend code as any code sent to the browser along with details of requests and responses are transparent by viewing the browser's developer tools.

So when calling third-party data sources a typical strategy is to create a "proxy server" which is a backend server whose only purpose is to make those third-party requests where API keys and other credentials can be hidden and then forward that data to the frontend when requested.

## Other Deployment Considerations

- When using an SQL database, just cause you have a local database with the data you've used during development doesn't mean your database production is ready to go. Once you deploy make sure to remember to migrate (create all the tables) and seed (add initial data) your database.

- Heroku relies on files in the root of your repo to set up the proper environment so make sure the root of your repo is the root of your project. Generally, the root of your project is going to be where one of the following files exist...
    - package.json (javascript/node)
    - Gemfile (ruby)
    - requirements.txt (python)
    - manage.py (python)
    - composer.json (php)
    - deps.ts (javascript/deno)
    - mod.go (Go)

- When deploying to Netlify or Vercel if you don't know what the build command is check your package.json file's script section. Also if you are not sure what directory the final build goes into, run the build command locally and see what the result is.

- If your deployment isn't working... logs are your best friend! All platforms have logs during project build and when the project runs so treat that as your first line of defense in determining what issues you may have with your deployment.