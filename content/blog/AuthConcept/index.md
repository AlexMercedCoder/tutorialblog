---
title: Authorization and Authentication in Concept
date: "2020-12-07T22:12:03.284Z"
description: Understand JWT, Sessions and Bcrypt
---

## What is Authentication and Authorization?

**Authentication:** This is when you provide credentials like username and password and the application authenticates that you are a user. When you hit submit on a login form, the web application will then authenticate you.

**Authorization:** After you've been authenticated, it doesn't mean you can do whatever you want. Whenever you take an action in an application there has to be a check to make sure you have the authority to take that action. 

## Authentication: Sign Up and Login

### Sign Up

Regardless of your language, your web application must have a web server that interfaces with your database. When a user goes to a signup page with a form to sign up, a server request is made when you submit that form.

1. You may have front-end validation (when the form complains the data isn't right). However, you may want back-end validation. If that's the case, the first thing you'll do is have your server check each property of the data submitted to make sure it meets your specifications (number/type of characters).

2. Once the data is validated, we need to encrypt the user's password, usually using a tool called BCrypt. The reason we encrypt the password is so the raw password isn't saved in our database. This way, if our data is compromised, it would be near impossible for thieves to determine what was the original password.

3. After the data has been validated and the password encrypted, a record of the new user is created in our database. The user has signed up!

### Login

1. User goes to the login page and submits a form with the information to log in. Once again, that data is sent to your web server, which does several things.

2. First, we need to determine if the user exists, so the user table/collection is queried to find the username provided. If the user exists, we continue. If not, we send back an error that the user doesn't exist.

3. Assuming the user exists, we then need to see if the password is correct. Using BCrypt, we can compare the password the user provided to the encrypted password in our database. If that succeeds, we continue. If not, we send back an error that the password is wrong.

4. At this point, the user has been authenticated. Every request to the server is unique, so the server will need to know that the user has already logged in during a previous request. This is where we have two approaches to authorization.


## Authorization: Sessions vs. JWT

### Sessions

If you enable sessions on your web server, when the first request to the server is made, a cookie is placed on the client's computer identifying a unique "session." Each time a user requests the same session, the webserver will see the cookie and find an identifier to pull information from a database (Redis & Mongo is popular for this use) with data associated with that session.

So when the user logs in, we can add data like the user's username or a boolean that they are logged in to the session data—from now on, during requests, the server can check to see if that data is on that session object to determine if the user is logged in.

When a user clicks a logout button, that session is destroyed and that info removed. So future requests will not see the user as logged in.

Browser sessions are erased when a browser closes, logouts, or a web server restarts, so you'd be logged out if the user closes then opens the browser cause the cookie that identified the unique session was destroyed when the browser was closed.
### JSON Web Tokens

In modern times you often don't have one web server anymore but many web servers, each specializing in a particular task (microservices). This makes sessions a tough choice for authorization cause each web server would have its unique session with the browser (one server won't recognize that you logged in from another server since they have individual session data stores).

The answer is to move this data from the server onto the client, and JSON web tokens have become the standard solution.

**What is a JSON Web Token(JWT)**

A JSON web token is an encrypted string that has three parts to it.

- Header: This part identifies the type of encryption and other data needed to decode the token

- Payload: The data you've encoded into the token like the username, maybe a user role, or a boolean that they are logged in (whatever you want).

- Signature: This is the unique signature that is paired with a Secret Key. If the same key isn't used to decode the string, it won't decode correctly. (The application uses the same secret key for all tokens, the user never knows this exists)

*Example JWT*
`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`

The periods in the token separate the Header, Payload and Signature.

**How this Works**

- After the user is logged, the JWT library is used to sign a new token. The sign function is given some data (Javascript Object, Ruby Hash, Python Dictionary, etc.) as the payload and given a string as the secret key. The token is generated and is given to the browser as the response from the login request. (A pre-signed token may already exist in the user database record, then that's sent down).

- The browser stores the token in a variable, and when any subsequent requests are made, the token is added in an "Authorization" header.

- So, any related webserver (think all the different google services) will receive the token in the header and decode it. All related servers should have the same secret key, so you will be able to successfully decode/verify the token and have access to the payload data (Usually done as a middleware function of some sort, in rails, you can do it as a "before_action" function). Once decoded successfully, maybe some steps to validate the data in it will occur. The data becomes available for the remainder of the request in some manner (in express, it is added to the request object, in Rails, you may put the data in a controller instance variable).

So all the different microservice servers don't have to search the database for the user or whether the user is logged in because as long as...

1. The token exists in the correct header
2. The token can be verified/decoded
3. Any validation on the payload is passed

We can conclude this request has the authorization to do whatever they are requesting to do.

## Bottom Line

Hopefully, this helps make the concept of authentication and authorization a bit clearer. This process can be more complicated as you try to add more security checks like 2-factor authorization, token expirations, and the ability to refresh your token. Although this is a high-level walkthrough, you can apply it to any language or framework.